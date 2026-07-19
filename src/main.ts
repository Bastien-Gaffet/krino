import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import kofiBanniere from "./assets/kofi.jpg";
import { t, appliquerTraductions, definirLangue, resoudreLangue, langue } from "./i18n";
import { confirmer, demander, informer } from "./dialogues";

/* ═══ Types ═══ */

interface Media {
  rel: string;
  taille: number;
  mtime_ms: number;
  exif_ms: number | null;
  video: boolean;
  wic: boolean; // format décodé côté Rust (HEIC, TIFF…)
}

interface Etat {
  decisions: Record<string, "garder" | "jeter">;
  mois_valides: string[];
  raccourcis: Record<string, string>;
  source_date: string;
  ordre: string[]; // ordre chronologique des décisions (pour Annuler entre sessions)
  regroupement: string; // "mois" ou "evenement"
  favoris: string[];
  albums: Record<string, string[]>;
}

/* ═══ État global ═══ */

let racine = "";
let medias: Media[] = [];
let etat: Etat = {
  decisions: {}, mois_valides: [], raccourcis: {}, source_date: "exif", ordre: [],
  regroupement: "mois", favoris: [], albums: {},
};
let moisCourant = "";
let file: Media[] = []; // restants à trier dans le mois courant
let historique: string[] = [];
let sensInverse = false;
let zoom = 1, panX = 0, panY = 0;
let rafaleCourante: Media[] = [];
let jalonKofi = false;
let decisionsRafale = new Map<string, "garder" | "jeter">();

const ECART_RAFALE_MS = 5000;

/* Préférences d'application (indépendantes du dossier trié) */
interface Prefs {
  theme: "auto" | "sombre" | "clair";
  langue: "auto" | "fr" | "en";
  parAnnee: boolean;
  tutoVu: boolean;
  cguAcceptees: boolean;
}
const prefs: Prefs = {
  theme: "auto", langue: "auto", parAnnee: true, tutoVu: false, cguAcceptees: false,
  ...JSON.parse(localStorage.getItem("krino-prefs") ?? "{}"),
};
function sauverPrefs() {
  localStorage.setItem("krino-prefs", JSON.stringify(prefs));
}
function appliquerTheme() {
  document.documentElement.dataset.theme = prefs.theme;
}
function appliquerLangue() {
  definirLangue(resoudreLangue(prefs.langue));
  document.documentElement.lang = langue();
  appliquerTraductions();
  rendreEtiquettesRaccourcis();
}

const RACCOURCIS_DEFAUT: Record<string, string> = {
  garder: "ArrowRight",
  jeter: "ArrowLeft",
  annuler: "Backspace",
  valider: "Enter",
  favori: "f",
};

const $ = <T extends HTMLElement = HTMLElement>(sel: string) =>
  document.querySelector(sel) as T;

/* ═══ Utilitaires ═══ */

function tailleLisible(octets: number): string {
  const unites = langue() === "fr" ? ["o", "Ko", "Mo", "Go"] : ["B", "KB", "MB", "GB"];
  let v = octets, i = 0;
  while (v >= 1024 && i < unites.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${unites[i]}`;
}

function localeDate(): string {
  return langue() === "fr" ? "fr-FR" : "en-US";
}

function dateDe(m: Media): number {
  return etat.source_date === "fichier" ? m.mtime_ms : (m.exif_ms ?? m.mtime_ms);
}

function moisDe(m: Media): string {
  const d = new Date(dateDe(m));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ── Regroupement par événement : séances de prise de vue séparées de plus de
   6 h. Clé stable = horodatage de la première photo de l'événement. ── */

const ECART_EVENEMENT_MS = 6 * 3600 * 1000;
let evenements = new Map<string, string>(); // rel -> clé d'événement
let nomsEvenements = new Map<string, string>(); // clé -> libellé

function construireEvenements() {
  evenements = new Map();
  nomsEvenements = new Map();
  const tris = [...medias].sort((a, b) => dateDe(a) - dateDe(b));
  let groupe: Media[] = [];
  const clore = () => {
    if (!groupe.length) return;
    const d0 = new Date(dateDe(groupe[0]));
    const d1 = new Date(dateDe(groupe[groupe.length - 1]));
    const cle = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, "0")}-` +
      `${String(d0.getDate()).padStart(2, "0")}T${String(d0.getHours()).padStart(2, "0")}-` +
      `${String(d0.getMinutes()).padStart(2, "0")}`;
    const opts = { day: "numeric", month: "short", year: "numeric" } as const;
    const l0 = d0.toLocaleDateString(localeDate(), opts);
    const l1 = d1.toLocaleDateString(localeDate(), opts);
    nomsEvenements.set(cle, l0 === l1 ? l0 : `${l0} – ${l1}`);
    for (const m of groupe) evenements.set(m.rel, cle);
    groupe = [];
  };
  for (const m of tris) {
    if (groupe.length && dateDe(m) - dateDe(groupe[groupe.length - 1]) > ECART_EVENEMENT_MS) clore();
    groupe.push(m);
  }
  clore();
}

/** Clé de regroupement du média : mois calendaire ou événement, selon réglage. */
function cleDe(m: Media): string {
  return etat.regroupement === "evenement" ? (evenements.get(m.rel) ?? moisDe(m)) : moisDe(m);
}

function nomCle(cle: string): string {
  return nomsEvenements.get(cle) ?? nomMois(cle);
}

function nomMois(cle: string): string {
  const [a, mo] = cle.split("-").map(Number);
  return new Date(a, mo - 1).toLocaleDateString(localeDate(), { month: "long", year: "numeric" });
}

function dateLisible(m: Media): string {
  return new Date(dateDe(m)).toLocaleDateString(localeDate(), {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const cacheWic = new Map<string, string>();

/** URL affichable en grand : directe, ou décodée via Rust pour HEIC/TIFF. */
async function urlAffichable(cheminAbs: string, wic: boolean): Promise<string> {
  if (!wic) return convertFileSrc(cheminAbs);
  if (!cacheWic.has(cheminAbs)) {
    try {
      cacheWic.set(cheminAbs, await invoke<string>("apercu_png", {
        chemin: cheminAbs, largeurMax: 1920,
      }));
    } catch {
      cacheWic.set(cheminAbs, "");
    }
  }
  return cacheWic.get(cheminAbs)!;
}

function src(rel: string): string { return `${racine}/${rel}`; }
function srcCorbeille(rel: string): string { return `${racine}/.krino/corbeille/${rel}`; }

const cacheMiniatures = new Map<string, string>();

/** Miniature JPEG 320 px générée et mise en cache côté Rust — pour les grilles. */
async function urlMiniature(m: { rel: string; video: boolean }, corbeille = false): Promise<string> {
  if (m.video) return convertFileSrc(corbeille ? srcCorbeille(m.rel) : src(m.rel));
  const cle = `${corbeille}|${m.rel}`;
  if (!cacheMiniatures.has(cle)) {
    try {
      const chemin = await invoke<string>("miniature", { racine, rel: m.rel, corbeille });
      cacheMiniatures.set(cle, convertFileSrc(chemin));
    } catch {
      cacheMiniatures.set(cle, convertFileSrc(corbeille ? srcCorbeille(m.rel) : src(m.rel)));
    }
  }
  return cacheMiniatures.get(cle)!;
}

async function sauver() {
  await invoke("ecrire_etat", { racine, etat });
}

function raccourci(action: string): string {
  return etat.raccourcis[action] ?? RACCOURCIS_DEFAUT[action];
}

function afficherVue(id: string) {
  for (const v of document.querySelectorAll<HTMLElement>(".vue")) v.hidden = v.id !== id;
}

function vueActive(): string {
  return document.querySelector<HTMLElement>(".vue:not([hidden])")?.id ?? "";
}

function activerNav(vue: string) {
  for (const b of document.querySelectorAll<HTMLButtonElement>(".nav-item[data-vue]")) {
    b.classList.toggle("actif", b.dataset.vue === vue);
  }
}

function allerA(vue: string) {
  afficherVue(vue);
  activerNav(vue);
  if (vue === "vue-mois") rendreMois();
  else if (vue === "vue-galerie") rendreGalerie();
  else if (vue === "vue-corbeille") void rendreCorbeille();
}

function montrerChargement(titre: string, detail = "", annulable = false) {
  $("#chargement-titre").textContent = titre;
  $("#chargement-detail").textContent = detail;
  $("#chargement-jauge").style.width = "0";
  ($("#btn-annuler-tache") as unknown as HTMLButtonElement).hidden = !annulable;
  $("#chargement").hidden = false;
}
function cacherChargement() {
  $("#chargement").hidden = true;
}

/* ═══ Accueil ═══ */

let dernierScanMs = 0;

/** Erreur d'accès typique d'un blocage par Windows (Smart App Control, Defender). */
function ressembleBlocageWindows(err: unknown): boolean {
  return /os error (5|4551)|acc[eè]s refus|denied|application a bloqu/i.test(String(err));
}

async function ouvrirDossier(chemin: string) {
  racine = chemin;
  localStorage.setItem("krino-dernier", chemin);
  montrerChargement(t("chargement.analyse"), t("chargement.arborescence"), true);
  try {
    medias = await invoke<Media[]>("scanner", { racine });
  } catch (err) {
    cacherChargement();
    if (String(err).includes("Annulé")) {
      afficherVue("vue-accueil");
    } else if (ressembleBlocageWindows(err) && await confirmer(t("bloquee.detecte"))) {
      void openUrl(URL_AIDE_BLOCAGE);
    } else {
      await informer(String(err));
    }
    return;
  } finally {
    cacherChargement();
  }
  dernierScanMs = Date.now();
  etat = await invoke<Etat>("lire_etat", { racine });
  if (!etat.source_date) etat.source_date = "exif";
  etat.ordre ??= [];
  etat.regroupement ||= "mois";
  etat.favoris ??= [];
  etat.albums ??= {};
  await purgerDisparus();
  construireEvenements();
  $("#titre-dossier").textContent = t("mois.entete", { d: chemin, n: medias.length });
  ($("#cadre-app") as unknown as HTMLElement).hidden = false;
  const nd = $("#nav-dossier");
  nd.textContent = chemin.split(/[\\/]/).pop() ?? chemin;
  nd.title = chemin;
  allerA("vue-mois");
  rendreEtiquettesRaccourcis();
}

/** Oublie les décisions portant sur des fichiers supprimés hors de Krino. */
async function purgerDisparus() {
  const presents = new Set(medias.map((m) => m.rel));
  const disparus = Object.keys(etat.decisions).filter((rel) => !presents.has(rel));
  if (!disparus.length) return;
  for (const rel of disparus) delete etat.decisions[rel];
  etat.ordre = etat.ordre.filter((rel) => presents.has(rel));
  await sauver();
}

/** Rescan silencieux (sans loader) — appelé au retour de focus sur la vue mois. */
async function rafraichir() {
  if (!racine || Date.now() - dernierScanMs < 30_000) return;
  try {
    medias = await invoke<Media[]>("scanner", { racine });
    dernierScanMs = Date.now();
    await purgerDisparus();
    construireEvenements();
    $("#titre-dossier").textContent = t("mois.entete", { d: racine, n: medias.length });
    if (vueActive() === "vue-mois") rendreMois();
  } catch {
    /* le dossier peut être momentanément indisponible (disque externe) */
  }
}

async function choisirDossier() {
  const chemin = await open({ directory: true, title: t("accueil.titreDialogue") });
  if (typeof chemin === "string") await ouvrirDossier(chemin);
}

/* ═══ Vue mois ═══ */

interface StatsMois {
  cle: string;
  fichiers: Media[];
  taille: number;
  decides: number;
  valide: boolean;
}

function statsParMois(): StatsMois[] {
  const groupes = new Map<string, Media[]>();
  for (const m of medias) {
    const cle = cleDe(m);
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle)!.push(m);
  }
  return [...groupes.entries()].map(([cle, fichiers]) => ({
    cle,
    fichiers,
    taille: fichiers.reduce((s, f) => s + f.taille, 0),
    decides: fichiers.filter((f) => etat.decisions[f.rel]).length,
    valide: etat.mois_valides.includes(cle),
  }));
}

function moisTries(): string[] {
  return statsParMois().map((s) => s.cle).sort();
}

function comparerMois(critere: string) {
  return (a: StatsMois, b: StatsMois) => {
    let c: number;
    switch (critere) {
      case "taille": c = a.taille - b.taille; break;
      case "nombre": c = a.fichiers.length - b.fichiers.length; break;
      case "restants": c = (a.fichiers.length - a.decides) - (b.fichiers.length - b.decides); break;
      default: c = a.cle.localeCompare(b.cle);
    }
    return sensInverse ? -c : c;
  };
}

function carteDeMois(s: StatsMois): HTMLElement {
  const carte = document.createElement("div");
  carte.className = "carte-mois" + (s.valide ? " fait" : "");
  const pct = s.fichiers.length ? Math.round((100 * s.decides) / s.fichiers.length) : 0;
  const apercus = s.fichiers.filter((f) => !f.video).slice(0, 3);
  carte.innerHTML = `
    <h3>${nomCle(s.cle)}</h3>
    <div class="eventail"></div>
    <div class="stats">${t("mois.fichiers", { n: s.fichiers.length, t: tailleLisible(s.taille) })}</div>
    <div class="jauge"><div style="width:${pct}%"></div></div>
    <div class="stats">${s.valide
      ? `<span class="etiquette-fait">${t("mois.fait")}</span>`
      : t("mois.decides", { a: s.decides, b: s.fichiers.length })}</div>
  `;
  const eventail = carte.querySelector(".eventail") as HTMLElement;
  (async () => {
    for (const f of apercus) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = await urlMiniature(f);
      eventail.appendChild(img);
    }
  })();
  if (s.valide) {
    const btn = document.createElement("button");
    btn.className = "btn refaire";
    btn.textContent = t("mois.refaire");
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!(await confirmer(t("confirm.refaireMois", { m: nomCle(s.cle) }), { danger: true }))) return;
      etat.mois_valides = etat.mois_valides.filter((m) => m !== s.cle);
      for (const f of s.fichiers) delete etat.decisions[f.rel];
      etat.ordre = etat.ordre.filter((rel) => etat.decisions[rel]);
      await sauver();
      rendreMois();
    });
    carte.appendChild(btn);
  }
  carte.addEventListener("click", () => ouvrirMois(s.cle));
  return carte;
}

function rendreMois() {
  const critere = ($("#tri-mois") as unknown as HTMLSelectElement).value;
  const masquerFaits = ($("#masquer-faits") as unknown as HTMLInputElement).checked;
  let liste = statsParMois();
  if (masquerFaits) liste = liste.filter((s) => !s.valide);
  liste.sort(comparerMois(critere));

  const conteneur = $("#conteneur-mois");
  conteneur.innerHTML = "";
  if (prefs.parAnnee) {
    const annees: string[] = [];
    for (const s of liste) {
      const a = s.cle.slice(0, 4);
      if (!annees.includes(a)) annees.push(a);
    }
    for (const annee of annees) {
      const titre = document.createElement("h2");
      titre.className = "titre-annee";
      titre.textContent = annee;
      conteneur.appendChild(titre);
      const grille = document.createElement("div");
      grille.className = "grille-mois";
      for (const s of liste.filter((x) => x.cle.startsWith(annee))) {
        grille.appendChild(carteDeMois(s));
      }
      conteneur.appendChild(grille);
    }
  } else {
    const grille = document.createElement("div");
    grille.className = "grille-mois";
    for (const s of liste) grille.appendChild(carteDeMois(s));
    conteneur.appendChild(grille);
  }
}

/* ═══ Vue tri (deck de cartes) ═══ */

function ouvrirMois(cle: string) {
  moisCourant = cle;
  // L'historique d'annulation est reconstruit depuis l'ordre persisté des
  // décisions : « Annuler » fonctionne donc aussi après avoir quitté le mois.
  const duMois = new Set(medias.filter((m) => cleDe(m) === cle).map((m) => m.rel));
  historique = etat.ordre.filter((rel) => duMois.has(rel) && etat.decisions[rel]);
  file = medias
    .filter((m) => cleDe(m) === cle && !etat.decisions[m.rel])
    .sort((a, b) => dateDe(a) - dateDe(b));
  $("#titre-tri").textContent = nomCle(cle);
  afficherVue("vue-tri");
  rendreCarte();
}

function courant(): Media | undefined { return file[0]; }

/** Groupe de photos prises à moins de 5 s d'écart autour du média courant. */
function rafaleDe(m: Media): Media[] {
  const duMois = medias
    .filter((x) => cleDe(x) === moisCourant && !x.video)
    .sort((a, b) => dateDe(a) - dateDe(b));
  const i = duMois.findIndex((x) => x.rel === m.rel);
  if (i < 0) return [m];
  let debut = i, fin = i;
  while (debut > 0 && dateDe(duMois[debut]) - dateDe(duMois[debut - 1]) <= ECART_RAFALE_MS) debut--;
  while (fin < duMois.length - 1 && dateDe(duMois[fin + 1]) - dateDe(duMois[fin]) <= ECART_RAFALE_MS) fin++;
  return duMois.slice(debut, fin + 1);
}

function reinitZoom() {
  zoom = 1; panX = 0; panY = 0;
  appliquerZoom();
}

function appliquerZoom() {
  const img = $("#apercu-img");
  img.style.transform = zoom === 1 ? "" : `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

async function rendreCarte() {
  const total = medias.filter((m) => cleDe(m) === moisCourant).length;
  $("#progression-tri").textContent = `${total - file.length}/${total}`;
  const img = $("#apercu-img") as unknown as HTMLImageElement;
  const video = $("#apercu-video") as unknown as HTMLVideoElement;
  const carte = $("#carte");
  const fond = $("#carte-fond");
  const m = courant();
  $("#fin-mois").hidden = !!m;
  $("#pied-tri").hidden = !m;
  carte.hidden = !m;
  reinitZoom();
  if (!m) {
    fond.hidden = true;
    video.pause(); video.removeAttribute("src");
    return;
  }

  carte.style.transform = "";
  carte.style.opacity = "1";
  $("#carte-nom").textContent = m.rel.split("/").pop() ?? "";
  $("#carte-infos").innerHTML =
    `<span>${tailleLisible(m.taille)}</span><span>${dateLisible(m)}</span>`;
  if (m.video) {
    img.hidden = true;
    video.hidden = false;
    video.src = convertFileSrc(src(m.rel));
    video.play().catch(() => {});
  } else {
    video.pause();
    video.hidden = true;
    img.hidden = false;
    img.src = await urlAffichable(src(m.rel), m.wic);
  }

  // État du bouton favori
  $("#btn-favori").classList.toggle("actif", etat.favoris.includes(m.rel));

  // Bouton rafale si des photos quasi simultanées existent
  const rafale = m.video ? [m] : rafaleDe(m);
  const btnRafale = $("#btn-rafale");
  btnRafale.hidden = rafale.length < 2;
  if (rafale.length >= 2) btnRafale.textContent = t("tri.rafale", { n: rafale.length });

  // Carte de fond : la suivante, en attente au centre du deck
  const suivant = file[1];
  fond.hidden = !suivant;
  if (suivant && !suivant.video) {
    const url = await urlAffichable(src(suivant.rel), suivant.wic);
    fond.querySelector(".carte-visuel")!.innerHTML = `<img src="${url}" alt="">`;
    fond.querySelector(".carte-titre")!.textContent = suivant.rel.split("/").pop() ?? "";
  } else if (suivant) {
    fond.querySelector(".carte-visuel")!.innerHTML = "";
    fond.querySelector(".carte-titre")!.textContent = suivant.rel.split("/").pop() ?? "";
  }

  // Précharge les suivantes pour un enchaînement instantané
  for (const s of file.slice(1, 4)) {
    if (!s.video && !s.wic) new Image().src = convertFileSrc(src(s.rel));
  }
}

function animerSortie(action: "garder" | "jeter", ensuite: () => void) {
  const carte = $("#carte");
  const fond = $("#carte-fond");
  const dir = action === "garder" ? 1 : -1;
  carte.style.transition = "transform 0.22s ease-in, opacity 0.22s";
  carte.style.transform = `translateX(${dir * window.innerWidth}px) rotate(${dir * 18}deg)`;
  carte.style.opacity = "0";
  fond.style.transition = "transform 0.22s ease-out, filter 0.22s";
  fond.style.transform = "scale(1)";
  fond.style.filter = "brightness(1)";
  setTimeout(() => {
    carte.style.transition = "";
    fond.style.transition = "";
    fond.style.transform = "";
    fond.style.filter = "";
    ensuite();
  }, 220);
}

function noterDecision(rel: string, action: "garder" | "jeter") {
  etat.decisions[rel] = action;
  etat.ordre = etat.ordre.filter((r) => r !== rel);
  etat.ordre.push(rel);
  historique.push(rel);
}

async function basculerFavori() {
  const m = courant();
  if (!m) return;
  if (etat.favoris.includes(m.rel)) {
    etat.favoris = etat.favoris.filter((r) => r !== m.rel);
  } else {
    etat.favoris.push(m.rel);
  }
  $("#btn-favori").classList.toggle("actif", etat.favoris.includes(m.rel));
  await sauver();
}

async function decider(action: "garder" | "jeter", animer = true) {
  const m = courant();
  if (!m) return;
  noterDecision(m.rel, action);
  file.shift();
  if (animer) animerSortie(action, rendreCarte);
  else rendreCarte();
  await sauver();
}

async function annuler() {
  const rel = historique.pop();
  if (!rel) return;
  delete etat.decisions[rel];
  etat.ordre = etat.ordre.filter((r) => r !== rel);
  const m = medias.find((x) => x.rel === rel);
  if (m) file.unshift(m);
  rendreCarte();
  await sauver();
}

async function garderLeReste() {
  if (!file.length) return;
  if (!(await confirmer(t("confirm.garderReste", { n: file.length })))) return;
  for (const m of file) noterDecision(m.rel, "garder");
  file = [];
  rendreCarte();
  await sauver();
}

function prochainMois(): string | null {
  const ordre = moisTries();
  const nonFaits = ordre.filter((c) => !etat.mois_valides.includes(c) && c !== moisCourant);
  const apres = nonFaits.find((c) => c > moisCourant);
  return apres ?? nonFaits[0] ?? null;
}

function allerMoisSuivant() {
  const prochain = prochainMois();
  if (prochain) ouvrirMois(prochain);
  else { afficherVue("vue-mois"); rendreMois(); }
}

/* ── Swipe + zoom (pointeur : souris, tactile) ── */

function installerSwipe() {
  const carte = $("#carte");
  const badgeG = $("#badge-garder");
  const badgeJ = $("#badge-jeter");
  let x0 = 0, dx = 0, actif = false;
  const SEUIL = 120;

  carte.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).tagName === "VIDEO") return;
    actif = true; x0 = e.clientX; dx = 0;
    carte.classList.add("saisi");
    carte.setPointerCapture(e.pointerId);
  });
  carte.addEventListener("pointermove", (e) => {
    if (!actif) return;
    if (zoom > 1) {
      panX += e.movementX; panY += e.movementY;
      appliquerZoom();
      return;
    }
    dx = e.clientX - x0;
    carte.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
    badgeG.style.opacity = String(Math.max(0, Math.min(1, dx / SEUIL)));
    badgeJ.style.opacity = String(Math.max(0, Math.min(1, -dx / SEUIL)));
  });
  const relacher = () => {
    if (!actif) return;
    actif = false;
    carte.classList.remove("saisi");
    badgeG.style.opacity = "0";
    badgeJ.style.opacity = "0";
    if (zoom > 1) return;
    if (dx > SEUIL) decider("garder");
    else if (dx < -SEUIL) decider("jeter");
    else carte.style.transform = "";
  };
  carte.addEventListener("pointerup", relacher);
  carte.addEventListener("pointercancel", relacher);

  carte.addEventListener("wheel", (e) => {
    if (courant()?.video) return;
    e.preventDefault();
    const facteur = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    zoom = Math.min(8, Math.max(1, zoom * facteur));
    if (zoom === 1) { panX = 0; panY = 0; }
    appliquerZoom();
  }, { passive: false });
  carte.addEventListener("dblclick", reinitZoom);
}

/* ═══ Comparateur de rafale ═══ */

async function ouvrirRafale() {
  const m = courant();
  if (!m) return;
  rafaleCourante = rafaleDe(m);
  decisionsRafale = new Map(
    rafaleCourante.map((x) => [x.rel, etat.decisions[x.rel] ?? "garder"]),
  );
  afficherVue("vue-rafale");
  const grille = $("#grille-rafale");
  grille.innerHTML = "";
  for (const x of rafaleCourante) {
    const div = document.createElement("div");
    div.className = "carte-rafale " + decisionsRafale.get(x.rel);
    const url = await urlAffichable(src(x.rel), x.wic);
    div.innerHTML = `
      <img src="${url}" alt="" loading="lazy">
      <div class="legende">
        <span>${x.rel.split("/").pop()} &middot; ${tailleLisible(x.taille)}</span>
        <span class="etat-rafale"></span>
      </div>`;
    const majEtiquette = () => {
      div.className = "carte-rafale " + decisionsRafale.get(x.rel);
      div.querySelector(".etat-rafale")!.textContent =
        decisionsRafale.get(x.rel) === "garder" ? t("rafale.garder") : t("rafale.jeter");
    };
    majEtiquette();
    div.addEventListener("click", () => {
      decisionsRafale.set(x.rel, decisionsRafale.get(x.rel) === "garder" ? "jeter" : "garder");
      majEtiquette();
      majBilanRafale();
    });
    grille.appendChild(div);
  }
  majBilanRafale();
}

function majBilanRafale() {
  const jetees = [...decisionsRafale.values()].filter((v) => v === "jeter").length;
  $("#bilan-rafale").textContent =
    t("rafale.bilan", { g: decisionsRafale.size - jetees, j: jetees });
}

function appliquerRafale() {
  for (const [rel, action] of decisionsRafale) noterDecision(rel, action);
  const rels = new Set(decisionsRafale.keys());
  file = file.filter((m) => !rels.has(m.rel));
  // Retour immédiat au tri — la sauvegarde se fait en arrière-plan
  afficherVue("vue-tri");
  rendreCarte();
  void sauver();
}

/* ═══ Vue revue ═══ */

async function rendreRevue() {
  montrerChargement(t("chargement.revue"));
  try {
    const fichiers = medias.filter((m) => cleDe(m) === moisCourant);
    const gardees = fichiers.filter((m) => etat.decisions[m.rel] === "garder");
    const jetees = fichiers.filter((m) => etat.decisions[m.rel] === "jeter");
    $("#titre-revue").textContent = t("revue.titre", { m: nomCle(moisCourant) });
    const octetsJetes = jetees.reduce((s, f) => s + f.taille, 0);
    $("#bilan-revue").textContent =
      t("revue.bilan", { g: gardees.length, j: jetees.length, t: tailleLisible(octetsJetes) });

    const rendreGrille = (conteneur: HTMLElement, liste: Media[]) => {
      conteneur.innerHTML = "";
      for (const m of liste) {
        const v = document.createElement("div");
        v.className = "vignette";
        v.title = m.rel;
        if (m.video) {
          v.innerHTML = `<video src="${convertFileSrc(src(m.rel))}#t=0.1" preload="metadata" muted></video><span class="marque">${t("vignette.video")}</span>`;
        } else {
          const img = document.createElement("img");
          img.loading = "lazy";
          urlMiniature(m).then((url) => { img.src = url; });
          v.appendChild(img);
        }
        v.addEventListener("click", async () => {
          etat.decisions[m.rel] = etat.decisions[m.rel] === "garder" ? "jeter" : "garder";
          void sauver();
          rendreRevue();
        });
        conteneur.appendChild(v);
      }
    };
    rendreGrille($("#grille-gardees"), gardees);
    rendreGrille($("#grille-jetees"), jetees);
  } finally {
    cacherChargement();
  }
}

async function validerMois() {
  const fichiers = medias.filter((m) => cleDe(m) === moisCourant);
  const nonDecides = fichiers.filter((m) => !etat.decisions[m.rel]);
  if (nonDecides.length) {
    await informer(t("revue.nonDecides", { n: nonDecides.length }));
    return;
  }
  const jetees = fichiers.filter((m) => etat.decisions[m.rel] === "jeter");
  const octets = jetees.reduce((s, f) => s + f.taille, 0);
  if (!(await confirmer(t("confirm.validerMois", {
    m: nomCle(moisCourant), n: jetees.length, t: tailleLisible(octets),
  })))) return;

  montrerChargement(t("chargement.validation"));
  try {
    await invoke("valider_mois", { racine, rels: jetees.map((m) => m.rel) });
    if (!etat.mois_valides.includes(moisCourant)) etat.mois_valides.push(moisCourant);
    await sauver();
  } finally {
    cacherChargement();
  }
  const relsJetes = new Set(jetees.map((m) => m.rel));
  medias = medias.filter((m) => !relsJetes.has(m.rel));

  // Jalons de soutien : tous les 6 mois validés, ou dernier mois du dossier
  jalonKofi = etat.mois_valides.length % 6 === 0 || !prochainMois();

  // Fenêtre de fin : retour au menu ou mois suivant — pas d'enchaînement forcé
  $("#valide-detail").textContent =
    t("valide.texte", { n: jetees.length, t: tailleLisible(octets) });
  ($("#btn-valide-suivant") as unknown as HTMLButtonElement).hidden = !prochainMois();
  ($("#modale-valide") as unknown as HTMLDialogElement).showModal();
}

/* ═══ Vue corbeille ═══ */

async function rendreCorbeille() {
  afficherVue("vue-corbeille");
  montrerChargement(t("chargement.corbeille"));
  let liste: { rel: string; taille: number; video: boolean; wic: boolean }[] = [];
  const urls = new Map<string, string>();
  try {
    liste = await invoke<typeof liste>("lister_corbeille", { racine });
    // Prépare toutes les miniatures AVANT l'affichage (sinon vignettes grises)
    let faites = 0;
    await Promise.all(liste.filter((f) => !f.video).map(async (f) => {
      urls.set(f.rel, await urlMiniature(f, true));
      faites++;
      $("#chargement-detail").textContent = t("chargement.vignettes", { a: faites, b: liste.length });
      $("#chargement-jauge").style.width = `${Math.round((100 * faites) / Math.max(1, liste.length))}%`;
    }));
  } finally {
    cacherChargement();
  }
  const octets = liste.reduce((s, f) => s + f.taille, 0);
  $("#bilan-corbeille").textContent = liste.length
    ? t("corbeille.bilan", { n: liste.length, t: tailleLisible(octets) })
    : t("corbeille.vide");
  const grille = $("#grille-corbeille");
  grille.innerHTML = "";
  let rang = 0;
  for (const f of liste) {
    const v = document.createElement("div");
    v.className = "vignette";
    v.title = f.rel;
    if (f.video) {
      v.innerHTML = `<video src="${convertFileSrc(srcCorbeille(f.rel))}#t=0.1" preload="metadata" muted></video><span class="marque">${t("vignette.video")}</span>`;
    } else {
      const img = document.createElement("img");
      // Premier écran en priorité haute, le reste en chargement paresseux
      if (rang < 18) {
        img.fetchPriority = "high";
      } else {
        img.loading = "lazy";
      }
      img.decoding = "async";
      img.src = urls.get(f.rel) ?? "";
      v.appendChild(img);
      rang++;
    }
    const btn = document.createElement("button");
    btn.className = "btn-restaurer-un";
    btn.textContent = t("corbeille.restaurer");
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await invoke("restaurer_fichier", { racine, rel: f.rel });
        await ouvrirDossier(racine);
        rendreCorbeille();
      } catch (err) {
        await informer(String(err));
      }
    });
    v.appendChild(btn);
    grille.appendChild(v);
  }
}

/* ═══ Outils : doublons & similaires ═══ */

interface FichierDoublon {
  rel: string;
  taille: number;
  mtime_ms: number;
  video: boolean;
  wic: boolean;
}

let groupesDoublons: FichierDoublon[][] = [];
let selectionDoublons = new Map<string, "garder" | "jeter">();

function majBilanDoublons() {
  const jetes = [...selectionDoublons.values()].filter((v) => v === "jeter").length;
  $("#bilan-doublons").textContent = groupesDoublons.length
    ? t("outils.bilan", { g: groupesDoublons.length, n: jetes })
    : "";
  const btn = $("#btn-appliquer-doublons") as unknown as HTMLButtonElement;
  btn.hidden = jetes === 0;
  btn.textContent = t("outils.appliquer", { n: jetes });
}

async function analyserDoublons() {
  const mode = document.querySelector<HTMLInputElement>("input[name=mode-doublons]:checked")!.value;
  const seuil = Number(($("#seuil-doublons") as unknown as HTMLSelectElement).value);
  montrerChargement(t("outils.analyse"), "", true);
  try {
    groupesDoublons = await invoke<FichierDoublon[][]>("chercher_doublons", {
      racine, mode, seuil,
    });
  } catch (err) {
    if (!String(err).includes("Annulé")) await informer(String(err));
    return;
  } finally {
    cacherChargement();
  }
  // Par défaut : le plus gros fichier de chaque groupe est gardé, le reste
  // marqué à jeter — chaque vignette se bascule d'un clic.
  selectionDoublons = new Map();
  for (const g of groupesDoublons) {
    g.forEach((f, i) => selectionDoublons.set(f.rel, i === 0 ? "garder" : "jeter"));
  }
  $("#avertissement-doublons").hidden = mode !== "similaires";
  rendreGroupesDoublons();
}

function rendreGroupesDoublons() {
  const conteneur = $("#groupes-doublons");
  conteneur.innerHTML = "";
  if (!groupesDoublons.length) {
    conteneur.innerHTML = `<p class="aide-revue">${t("outils.aucun")}</p>`;
    majBilanDoublons();
    return;
  }
  groupesDoublons.forEach((g, i) => {
    const bloc = document.createElement("div");
    bloc.className = "groupe-doublons";
    bloc.innerHTML = `<h3>${t("outils.groupe", { i: i + 1, n: g.length })}</h3>`;
    const grille = document.createElement("div");
    grille.className = "grille-vignettes";
    for (const f of g) {
      const v = document.createElement("div");
      v.className = "vignette sel-" + selectionDoublons.get(f.rel);
      v.title = f.rel;
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      urlMiniature(f).then((u) => { img.src = u; });
      const marque = document.createElement("span");
      marque.className = "marque marque-sel";
      const legende = document.createElement("span");
      legende.className = "legende-doublon";
      legende.textContent =
        `${f.rel.split("/").pop()} · ${tailleLisible(f.taille)} · ` +
        new Date(f.mtime_ms).toLocaleDateString(localeDate());
      const maj = () => {
        const sel = selectionDoublons.get(f.rel);
        v.className = "vignette sel-" + sel;
        marque.textContent = sel === "garder" ? t("rafale.garder") : t("rafale.jeter");
      };
      maj();
      v.append(img, marque, legende);
      v.addEventListener("click", () => {
        selectionDoublons.set(f.rel,
          selectionDoublons.get(f.rel) === "garder" ? "jeter" : "garder");
        maj();
        majBilanDoublons();
      });
      grille.appendChild(v);
    }
    bloc.appendChild(grille);
    conteneur.appendChild(bloc);
  });
  majBilanDoublons();
}

async function appliquerDoublons() {
  const rels = [...selectionDoublons.entries()]
    .filter(([, v]) => v === "jeter")
    .map(([rel]) => rel);
  if (!rels.length) return;
  const octets = groupesDoublons.flat()
    .filter((f) => selectionDoublons.get(f.rel) === "jeter")
    .reduce((s, f) => s + f.taille, 0);
  if (!(await confirmer(t("confirm.doublons", { n: rels.length, t: tailleLisible(octets) }), { danger: true }))) return;
  montrerChargement(t("chargement.validation"));
  try {
    await invoke("valider_mois", { racine, rels });
  } finally {
    cacherChargement();
  }
  await informer(t("outils.deplaces", { n: rels.length }));
  groupesDoublons = [];
  selectionDoublons = new Map();
  rendreGroupesDoublons();
  dernierScanMs = 0;
  void rafraichir();
}

/* ═══ Organiser : rangement par date ═══ */

async function lancerRangement() {
  if (!(await confirmer(t("confirm.rangement"), { danger: true }))) return;
  montrerChargement(t("rangement.enCours"), "", true);
  let deplaces = 0, ignores = 0;
  try {
    [deplaces, ignores] = await invoke<[number, number]>("ranger_par_date", {
      racine, sourceDate: etat.source_date || "exif",
    });
  } catch (err) {
    await informer(String(err));
    return;
  } finally {
    cacherChargement();
  }
  $("#resultat-rangement").textContent = t("rangement.resultat", { d: deplaces, i: ignores });
  dernierScanMs = 0;
  void rafraichir();
}

async function annulerDernierRangement() {
  if (!(await confirmer(t("confirm.annulerRangement"), { danger: true }))) return;
  montrerChargement(t("rangement.annulation"));
  let n = 0;
  try {
    n = await invoke<number>("annuler_rangement", { racine });
  } catch (err) {
    await informer(String(err));
    return;
  } finally {
    cacherChargement();
  }
  $("#resultat-rangement").textContent = t("rangement.annule", { n });
  dernierScanMs = 0;
  void rafraichir();
}

/* ═══ Organiser : favoris & albums ═══ */

const ALBUM_FAVORIS = "__favoris__";

// utilisé par la galerie (Task 4-6)
function contenuAlbum(nom: string): string[] {
  return nom === ALBUM_FAVORIS ? etat.favoris : (etat.albums[nom] ?? []);
}

/* ═══ Galerie ═══ */
let albumOuvert: string | null = null; // null = galerie complète ; sinon nom d'album ou ALBUM_FAVORIS
let selectionGalerie = new Set<string>();
let ancreSelection: string | null = null; // pour Maj+clic (Task 5)

function clicVignette(rel: string, e: MouseEvent) {
  const visibles = mediasGalerie().map((m) => m.rel);
  if (e.shiftKey && ancreSelection) {
    const a = visibles.indexOf(ancreSelection), b = visibles.indexOf(rel);
    if (a >= 0 && b >= 0) {
      for (const r of visibles.slice(Math.min(a, b), Math.max(a, b) + 1)) selectionGalerie.add(r);
    }
  } else if (e.ctrlKey || e.metaKey) {
    if (selectionGalerie.has(rel)) selectionGalerie.delete(rel);
    else selectionGalerie.add(rel);
    ancreSelection = rel;
  } else {
    selectionGalerie = new Set([rel]);
    ancreSelection = rel;
  }
  majSelectionVisuelle();
}

function majSelectionVisuelle() {
  for (const v of document.querySelectorAll<HTMLElement>(".vignette-galerie")) {
    v.classList.toggle("selectionnee", selectionGalerie.has(v.dataset.rel!));
  }
  majBarreSelection();
}

function installerRectangleSelection() {
  const zone = $("#defil-galerie");
  let x0 = 0, y0 = 0, rect: HTMLElement | null = null, additive = false;
  let base = new Set<string>();
  zone.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".vignette-galerie")) return; // clic sur vignette = sélection normale
    additive = e.ctrlKey || e.metaKey;
    base = new Set(selectionGalerie);
    const cadre = zone.getBoundingClientRect();
    x0 = e.clientX - cadre.left; y0 = e.clientY - cadre.top + zone.scrollTop;
    rect = document.createElement("div");
    rect.className = "rectangle-selection";
    zone.appendChild(rect);
    zone.setPointerCapture(e.pointerId);
  });
  zone.addEventListener("pointermove", (e) => {
    if (!rect) return;
    const cadre = zone.getBoundingClientRect();
    const x1 = e.clientX - cadre.left, y1 = e.clientY - cadre.top + zone.scrollTop;
    const [gx, gy] = [Math.min(x0, x1), Math.min(y0, y1)];
    const [lx, ly] = [Math.abs(x1 - x0), Math.abs(y1 - y0)];
    Object.assign(rect.style, { left: `${gx}px`, top: `${gy}px`, width: `${lx}px`, height: `${ly}px` });
    selectionGalerie = additive ? new Set(base) : new Set();
    const zr = rect.getBoundingClientRect();
    for (const v of document.querySelectorAll<HTMLElement>(".vignette-galerie")) {
      const vr = v.getBoundingClientRect();
      const chevauche = !(vr.right < zr.left || vr.left > zr.right || vr.bottom < zr.top || vr.top > zr.bottom);
      if (chevauche) selectionGalerie.add(v.dataset.rel!);
    }
    majSelectionVisuelle();
  });
  const fin = () => { rect?.remove(); rect = null; };
  zone.addEventListener("pointerup", fin);
  zone.addEventListener("pointercancel", fin);
}

/* ═══ Visionneuse ═══ */
let visIndex = -1;

async function ouvrirVisionneuse(rel: string) {
  const liste = mediasGalerie();
  visIndex = liste.findIndex((m) => m.rel === rel);
  if (visIndex < 0) return;
  $("#visionneuse").hidden = false;
  await montrerVis();
}

async function montrerVis() {
  const m = mediasGalerie()[visIndex];
  if (!m) { fermerVisionneuse(); return; }
  const img = $("#vis-img") as unknown as HTMLImageElement;
  const video = $("#vis-video") as unknown as HTMLVideoElement;
  if (m.video) {
    img.hidden = true; video.hidden = false;
    video.src = convertFileSrc(src(m.rel));
  } else {
    video.pause(); video.hidden = true; img.hidden = false;
    img.src = await urlAffichable(src(m.rel), m.wic);
  }
  $("#vis-legende").textContent =
    `${m.rel.split("/").pop()} · ${tailleLisible(m.taille)} · ${dateLisible(m)}` +
    (etat.favoris.includes(m.rel) ? " · ★" : "");
}

function fermerVisionneuse() {
  ($("#vis-video") as unknown as HTMLVideoElement).pause();
  $("#visionneuse").hidden = true;
}

function visNaviguer(delta: number) {
  const n = mediasGalerie().length;
  visIndex = Math.max(0, Math.min(n - 1, visIndex + delta));
  void montrerVis();
}

async function actionSelection(action: "favori" | "ajouter" | "retirer" | "corbeille") {
  const rels = [...selectionGalerie];
  if (!rels.length) return;
  if (action === "favori") {
    const tousFavoris = rels.every((r) => etat.favoris.includes(r));
    etat.favoris = tousFavoris
      ? etat.favoris.filter((r) => !rels.includes(r))
      : [...new Set([...etat.favoris, ...rels])];
  } else if (action === "ajouter") {
    const cible = ($("#sel-album-cible") as unknown as HTMLSelectElement).value;
    if (cible === ALBUM_FAVORIS) etat.favoris = [...new Set([...etat.favoris, ...rels])];
    else {
      const liste = etat.albums[cible] ?? (etat.albums[cible] = []);
      for (const r of rels) if (!liste.includes(r)) liste.push(r);
    }
  } else if (action === "retirer" && albumOuvert) {
    if (albumOuvert === ALBUM_FAVORIS) etat.favoris = etat.favoris.filter((r) => !rels.includes(r));
    else etat.albums[albumOuvert] = (etat.albums[albumOuvert] ?? []).filter((r) => !rels.includes(r));
  } else if (action === "corbeille") {
    const octets = medias.filter((m) => selectionGalerie.has(m.rel))
      .reduce((s, m) => s + m.taille, 0);
    if (!(await confirmer(t("confirm.doublons", { n: rels.length, t: tailleLisible(octets) }),
                          { danger: true }))) return;
    montrerChargement(t("chargement.validation"));
    try { await invoke("valider_mois", { racine, rels }); }
    finally { cacherChargement(); }
    medias = medias.filter((m) => !selectionGalerie.has(m.rel));
    construireEvenements();
  }
  await sauver();
  rendreGalerie();
}

const observateurGalerie = new IntersectionObserver((entrees) => {
  for (const e of entrees) {
    if (!e.isIntersecting) continue;
    const img = e.target as HTMLImageElement;
    observateurGalerie.unobserve(img);
    const rel = img.dataset.rel!;
    const m = medias.find((x) => x.rel === rel);
    if (m) void urlMiniature(m).then((u) => { img.src = u; });
  }
}, { rootMargin: "600px" });

function mediasGalerie(): Media[] {
  const filtre = ($("#filtre-galerie") as unknown as HTMLSelectElement).value;
  let liste = [...medias];
  if (albumOuvert) {
    const contenu = new Set(contenuAlbum(albumOuvert));
    liste = liste.filter((m) => contenu.has(m.rel));
  }
  switch (filtre) {
    case "nontriees": liste = liste.filter((m) => !etat.decisions[m.rel]); break;
    case "gardees": liste = liste.filter((m) => etat.decisions[m.rel] === "garder"); break;
    case "favoris": liste = liste.filter((m) => etat.favoris.includes(m.rel)); break;
    case "videos": liste = liste.filter((m) => m.video); break;
  }
  return liste.sort((a, b) => dateDe(a) - dateDe(b));
}

function rendreGalerie() {
  observateurGalerie.disconnect();
  selectionGalerie = new Set();
  majBarreSelection();
  const liste = mediasGalerie();
  $("#titre-galerie").textContent = albumOuvert
    ? (albumOuvert === ALBUM_FAVORIS ? t("albums.nomFavoris") : albumOuvert)
    : t("nav.galerie");
  $("#bilan-galerie").textContent = t("galerie.bilan", { n: liste.length });
  const conteneur = $("#sections-galerie");
  conteneur.innerHTML = "";
  conteneur.style.setProperty("--taille-vignette",
    `${($("#taille-galerie") as unknown as HTMLInputElement).value}px`);
  const saut = $("#saut-galerie") as unknown as HTMLSelectElement;
  saut.innerHTML = "";
  let cleCourante = "";
  let grille: HTMLElement | null = null;
  for (const m of liste) {
    const cle = cleDe(m);
    if (cle !== cleCourante) {
      cleCourante = cle;
      const titre = document.createElement("h2");
      titre.className = "titre-annee";
      titre.id = `gal-${cle}`;
      titre.textContent = nomCle(cle);
      conteneur.appendChild(titre);
      grille = document.createElement("div");
      grille.className = "grille-vignettes marge";
      conteneur.appendChild(grille);
      const opt = document.createElement("option");
      opt.value = `gal-${cle}`;
      opt.textContent = nomCle(cle);
      saut.appendChild(opt);
    }
    grille!.appendChild(vignetteGalerie(m));
  }
}

function vignetteGalerie(m: Media): HTMLElement {
  const v = document.createElement("div");
  v.className = "vignette vignette-galerie";
  v.dataset.rel = m.rel;
  v.title = m.rel;
  if (m.video) {
    // preload=none : la première image n'est chargée qu'à l'apparition
    v.innerHTML = `<video src="${convertFileSrc(src(m.rel))}#t=0.1" preload="none" muted></video><span class="marque">${t("vignette.video")}</span>`;
    observateurVideo(v.querySelector("video")!);
  } else {
    const img = document.createElement("img");
    img.decoding = "async";
    img.dataset.rel = m.rel;
    observateurGalerie.observe(img);
    v.appendChild(img);
  }
  const badges = document.createElement("span");
  badges.className = "badges-galerie";
  if (etat.favoris.includes(m.rel)) badges.append("★");
  if (!etat.decisions[m.rel]) badges.append(badges.textContent ? " · " : "", t("galerie.badgeNonTriee"));
  v.appendChild(badges);
  v.addEventListener("click", (e) => clicVignette(m.rel, e));
  v.addEventListener("dblclick", () => void ouvrirVisionneuse(m.rel));
  return v;
}

function observateurVideo(video: HTMLVideoElement) {
  const obs = new IntersectionObserver((ent) => {
    if (ent[0].isIntersecting) { video.preload = "metadata"; obs.disconnect(); }
  }, { rootMargin: "600px" });
  obs.observe(video);
}

function majBarreSelection() {
  const barre = $("#barre-selection");
  barre.hidden = selectionGalerie.size === 0;
  $("#bilan-selection").textContent = t("albums.selection", { n: selectionGalerie.size });
  ($("#sel-retirer") as unknown as HTMLButtonElement).hidden = !albumOuvert;
  const cible = $("#sel-album-cible") as unknown as HTMLSelectElement;
  cible.innerHTML = "";
  const of = document.createElement("option");
  of.value = ALBUM_FAVORIS; of.textContent = t("albums.nomFavoris");
  cible.appendChild(of);
  for (const nom of Object.keys(etat.albums).sort()) {
    const o = document.createElement("option");
    o.value = nom; o.textContent = nom;
    cible.appendChild(o);
  }
}

/* ═══ Mises à jour & soutien ═══ */

const URL_KOFI = "https://ko-fi.com/bastiengft";
const URL_AIDE_BLOCAGE = "https://github.com/Bastien-Gaffet/krino#lapplication-est-bloqu%C3%A9e-par-windows-";

function versionPlusRecente(distante: string, locale: string): boolean {
  const d = distante.split(".").map(Number);
  const l = locale.split(".").map(Number);
  for (let i = 0; i < Math.max(d.length, l.length); i++) {
    if ((d[i] ?? 0) !== (l[i] ?? 0)) return (d[i] ?? 0) > (l[i] ?? 0);
  }
  return false;
}

let urlDerniereVersion = "";
let majCourante: Update | null = null;

/** Vérifie via le plugin updater (installation intégrée) ; en développement ou
    si le plugin échoue, retombe sur l'API GitHub (lien vers la page de release). */
async function verifierMaj(silencieux: boolean) {
  const locale = await getVersion();
  try {
    majCourante = await check();
    if (majCourante) {
      $("#maj-detail").textContent = t("maj.texte", { v: majCourante.version, l: locale });
      $("#btn-maj-telecharger").textContent = t("maj.installer");
      ($("#modale-maj") as unknown as HTMLDialogElement).showModal();
    } else if (!silencieux) {
      await informer(t("maj.aJour", { l: locale }));
    }
    return;
  } catch {
    majCourante = null;
  }
  try {
    const rep = await fetch("https://api.github.com/repos/Bastien-Gaffet/krino/releases/latest");
    if (!rep.ok) throw new Error(String(rep.status));
    const data = await rep.json();
    const distante = String(data.tag_name ?? "").replace(/^v/, "");
    if (distante && versionPlusRecente(distante, locale)) {
      urlDerniereVersion = data.html_url ?? "https://github.com/Bastien-Gaffet/krino/releases";
      $("#maj-detail").textContent = t("maj.texte", { v: distante, l: locale });
      $("#btn-maj-telecharger").textContent = t("maj.telecharger");
      ($("#modale-maj") as unknown as HTMLDialogElement).showModal();
    } else if (!silencieux) {
      await informer(t("maj.aJour", { l: locale }));
    }
  } catch {
    if (!silencieux) await informer(t("maj.erreur"));
  }
}

/** Télécharge et installe la mise à jour depuis l'application, puis relance. */
async function installerMaj() {
  if (!majCourante) {
    void openUrl(urlDerniereVersion || "https://github.com/Bastien-Gaffet/krino/releases");
    ($("#modale-maj") as unknown as HTMLDialogElement).close();
    return;
  }
  const btn = $("#btn-maj-telecharger") as unknown as HTMLButtonElement;
  btn.disabled = true;
  let total = 0, recu = 0;
  try {
    await majCourante.downloadAndInstall((ev) => {
      if (ev.event === "Started") total = ev.data.contentLength ?? 0;
      else if (ev.event === "Progress") {
        recu += ev.data.chunkLength;
        const pct = total ? Math.round((100 * recu) / total) : 0;
        $("#maj-detail").textContent = t("maj.telechargement", { p: pct });
      } else if (ev.event === "Finished") {
        $("#maj-detail").textContent = t("maj.redemarrage");
      }
    });
    await relaunch();
  } catch (err) {
    await informer(t("maj.erreurInstall", { e: String(err) }));
    btn.disabled = false;
  }
}

/** Fenêtre de soutien Ko-fi — aux grandes étapes seulement. */
function proposerSoutien() {
  ($("#modale-kofi") as unknown as HTMLDialogElement).showModal();
}

/* ═══ Réglages & raccourcis ═══ */

function rendreEtiquettesRaccourcis() {
  const joli = (touche: string) => {
    const fr = langue() === "fr";
    return touche.replace("Arrow", "").replace("Right", "→").replace("Left", "←")
      .replace("Up", "↑").replace("Down", "↓")
      .replace("Backspace", fr ? "Retour" : "Bksp")
      .replace("Enter", fr ? "Entrée" : "Enter").replace(" ", fr ? "Espace" : "Space");
  };
  $("#kbd-garder").textContent = joli(raccourci("garder"));
  $("#kbd-jeter").textContent = joli(raccourci("jeter"));
  $("#kbd-valider").textContent = joli(raccourci("valider"));
  $("#kbd-valider2").textContent = joli(raccourci("valider"));
  // Fenêtre « mois validé » : mêmes touches que garder/jeter — intuitif
  $("#kbd-valide-suivant").textContent = joli(raccourci("garder"));
  $("#kbd-valide-menu").textContent = joli(raccourci("jeter"));
  $("#kbd-favori").textContent = joli(raccourci("favori"));
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".touche")) {
    btn.textContent = joli(raccourci(btn.dataset.action!));
  }
}

function installerModaleReglages() {
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".touche")) {
    btn.addEventListener("click", () => {
      btn.classList.add("ecoute");
      btn.textContent = "…";
      const capter = async (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        window.removeEventListener("keydown", capter, true);
        btn.classList.remove("ecoute");
        if (e.key !== "Escape") {
          etat.raccourcis[btn.dataset.action!] = e.key;
          await sauver();
        }
        rendreEtiquettesRaccourcis();
      };
      window.addEventListener("keydown", capter, true);
    });
  }
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name=source-date]")) {
    radio.addEventListener("change", async () => {
      etat.source_date = radio.value;
      construireEvenements();
      await sauver();
      rendreMois();
    });
  }
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name=regroupement]")) {
    radio.addEventListener("change", async () => {
      etat.regroupement = radio.value;
      construireEvenements();
      await sauver();
      rendreMois();
    });
  }
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name=theme]")) {
    radio.addEventListener("change", () => {
      prefs.theme = radio.value as Prefs["theme"];
      sauverPrefs();
      appliquerTheme();
    });
  }
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name=langue]")) {
    radio.addEventListener("change", () => {
      prefs.langue = radio.value as Prefs["langue"];
      sauverPrefs();
      appliquerLangue();
      if (racine) {
        $("#titre-dossier").textContent = t("mois.entete", { d: racine, n: medias.length });
        if (vueActive() === "vue-mois") rendreMois();
      }
    });
  }
  $("#opt-annees").addEventListener("change", () => {
    prefs.parAnnee = ($("#opt-annees") as unknown as HTMLInputElement).checked;
    sauverPrefs();
    rendreMois();
  });
  $("#btn-revoir-tuto").addEventListener("click", () => {
    ($("#modale-reglages") as unknown as HTMLDialogElement).close();
    tutoAller(0);
  });
  $("#btn-voir-cgu").addEventListener("click", () => {
    ($("#modale-reglages") as unknown as HTMLDialogElement).close();
    ($("#modale-cgu") as unknown as HTMLDialogElement).showModal();
  });
}

function ouvrirReglages() {
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name=source-date]")) {
    radio.checked = radio.value === (etat.source_date || "exif");
  }
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name=regroupement]")) {
    radio.checked = radio.value === (etat.regroupement || "mois");
  }
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name=theme]")) {
    radio.checked = radio.value === prefs.theme;
  }
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name=langue]")) {
    radio.checked = radio.value === prefs.langue;
  }
  ($("#opt-annees") as unknown as HTMLInputElement).checked = prefs.parAnnee;
  rendreEtiquettesRaccourcis();
  ($("#modale-reglages") as unknown as HTMLDialogElement).showModal();
}

/* ═══ Tutoriel ═══ */

interface EtapeTuto {
  cible?: string;
  avant?: () => void | Promise<void>;
}

const ETAPES_TUTO: EtapeTuto[] = [
  {
    avant: async () => {
      const dossier = await invoke<string>("creer_dossier_demo");
      await ouvrirDossier(dossier);
    },
  },
  { cible: "#conteneur-mois" },
  { cible: "#tri-mois" },
  {
    avant: () => {
      const premier = moisTries()[0];
      if (premier) ouvrirMois(premier);
    },
    cible: "#carte",
  },
  { cible: "#pied-tri" },
  { cible: "#btn-revue" },
  { cible: "#btn-revue" },
  {},
];

let etapeTuto = -1;

async function tutoAller(i: number) {
  document.querySelector(".tuto-cible")?.classList.remove("tuto-cible");
  if (i >= ETAPES_TUTO.length) { tutoFin(); return; }
  etapeTuto = i;
  const etape = ETAPES_TUTO[i];
  await etape.avant?.();
  $("#tuto-texte").textContent = t(`tuto.${i}`);
  $("#tuto-etape").textContent = `${i + 1}/${ETAPES_TUTO.length}`;
  ($("#tuto-suivant") as unknown as HTMLButtonElement).textContent =
    i === ETAPES_TUTO.length - 1 ? t("tuto.terminer") : t("tuto.suivant");
  $("#tuto-bulle").hidden = false;
  if (etape.cible) document.querySelector(etape.cible)?.classList.add("tuto-cible");
}

function tutoFin() {
  document.querySelector(".tuto-cible")?.classList.remove("tuto-cible");
  $("#tuto-bulle").hidden = true;
  etapeTuto = -1;
  prefs.tutoVu = true;
  sauverPrefs();
  afficherVue("vue-accueil");
}

/* ═══ Clavier ═══ */

async function basculerPleinEcran() {
  const fenetre = getCurrentWindow();
  const actif = await fenetre.isFullscreen();
  await fenetre.setFullscreen(!actif);
  document.body.classList.toggle("plein-ecran", !actif);
}

function installerClavier() {
  window.addEventListener("keydown", (e) => {
    if (!$("#visionneuse").hidden) {
      if (e.key === "ArrowLeft") { e.preventDefault(); visNaviguer(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); visNaviguer(1); }
      else if (e.key === "Escape") fermerVisionneuse();
      else if (e.key === raccourci("favori")) {
        const m = mediasGalerie()[visIndex];
        if (m) {
          if (etat.favoris.includes(m.rel)) etat.favoris = etat.favoris.filter((r) => r !== m.rel);
          else etat.favoris.push(m.rel);
          void sauver();
          void montrerVis();
        }
      }
      return;
    }
    if (e.key === "F11") { e.preventDefault(); basculerPleinEcran(); return; }
    if (e.key === "F5") {
      e.preventDefault();
      if (racine && !document.querySelector("dialog[open]")) void ouvrirDossier(racine);
      return;
    }
    if (document.querySelector("dialog[open]")) return;
    const vue = vueActive();
    const k = e.key;
    if (vue === "vue-tri") {
      if (k === raccourci("garder")) { e.preventDefault(); decider("garder"); }
      else if (k === raccourci("jeter")) { e.preventDefault(); decider("jeter"); }
      else if (k === raccourci("annuler")) { e.preventDefault(); annuler(); }
      else if (k === raccourci("favori")) { e.preventDefault(); void basculerFavori(); }
      else if (k === raccourci("valider")) { e.preventDefault(); afficherVue("vue-revue"); rendreRevue(); }
      else if (k === "Escape") { afficherVue("vue-mois"); rendreMois(); }
    } else if (vue === "vue-revue") {
      if (k === raccourci("valider")) { e.preventDefault(); validerMois(); }
      else if (k === "Escape") ouvrirMois(moisCourant);
    } else if (vue === "vue-rafale") {
      if (k === raccourci("valider")) { e.preventDefault(); appliquerRafale(); }
      else if (k === "Escape") { afficherVue("vue-tri"); rendreCarte(); }
    } else if (vue === "vue-galerie") {
      if (e.ctrlKey && k.toLowerCase() === "a") {
        e.preventDefault();
        selectionGalerie = new Set(mediasGalerie().map((m) => m.rel));
        majSelectionVisuelle();
      } else if (k === "Escape") {
        if (selectionGalerie.size > 0) { selectionGalerie = new Set(); majSelectionVisuelle(); }
        else allerA("vue-mois");
      }
    } else if (
      (vue === "vue-doublons" || vue === "vue-rangement" || vue === "vue-corbeille") &&
      k === "Escape"
    ) {
      allerA("vue-mois");
    }
  });
}

/* ═══ Câblage ═══ */

window.addEventListener("DOMContentLoaded", () => {
  appliquerTheme();
  appliquerLangue();

  // Progression du scan (émise par le backend)
  listen<[number, number]>("scan-progres", (e) => {
    const [fait, total] = e.payload;
    $("#chargement-detail").textContent = t("chargement.progression", { a: fait, b: total });
    $("#chargement-jauge").style.width = total ? `${Math.round((100 * fait) / total)}%` : "0";
  });

  // Tutoriel
  $("#tuto-suivant").addEventListener("click", () => tutoAller(etapeTuto + 1));
  $("#tuto-quitter").addEventListener("click", tutoFin);

  // Conditions d'utilisation : acceptation obligatoire au premier lancement
  const cgu = $("#modale-cgu") as unknown as HTMLDialogElement;
  $("#btn-accepter-cgu").addEventListener("click", async () => {
    prefs.cguAcceptees = true;
    sauverPrefs();
    cgu.close();
    if (!prefs.tutoVu && (await confirmer(t("confirm.tuto")))) tutoAller(0);
  });
  if (!prefs.cguAcceptees) {
    cgu.addEventListener("cancel", (e) => {
      if (!prefs.cguAcceptees) e.preventDefault();
    });
    cgu.showModal();
  }

  // Accueil
  $("#btn-choisir").addEventListener("click", choisirDossier);
  const dernier = localStorage.getItem("krino-dernier");
  if (dernier) {
    const btn = $("#btn-dernier") as unknown as HTMLButtonElement;
    btn.hidden = false;
    btn.textContent = t("accueil.reprendre", { d: dernier });
    btn.addEventListener("click", () => ouvrirDossier(dernier));
  }

  // Barre latérale
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".nav-item[data-vue]")) {
    btn.addEventListener("click", () => {
      if (btn.dataset.vue === "vue-galerie") albumOuvert = null;
      allerA(btn.dataset.vue!);
    });
  }
  $("#nav-reglages").addEventListener("click", ouvrirReglages);
  $("#nav-nouvel-album").addEventListener("click", async () => {
    const nom = await demander(t("albums.nomNouveau"));
    if (!nom) return;
    etat.albums[nom] ??= [];
    await sauver();
  });

  // Vue mois
  $("#btn-retour-accueil").addEventListener("click", () => {
    ($("#cadre-app") as unknown as HTMLElement).hidden = true;
    afficherVue("vue-accueil");
  });
  $("#tri-mois").addEventListener("change", rendreMois);
  $("#btn-sens").addEventListener("click", () => {
    sensInverse = !sensInverse;
    $("#btn-sens").classList.toggle("inverse", sensInverse);
    rendreMois();
  });
  $("#masquer-faits").addEventListener("change", rendreMois);

  // Rangement par date
  $("#btn-ranger").addEventListener("click", () => void lancerRangement());
  $("#btn-annuler-rangement").addEventListener("click", () => void annulerDernierRangement());
  listen<[number, number]>("rangement-progres", (e) => {
    const [fait, total] = e.payload;
    $("#chargement-detail").textContent = t("chargement.progression", { a: fait, b: total });
    $("#chargement-jauge").style.width = total ? `${Math.round((100 * fait) / total)}%` : "0";
  });

  // Galerie
  $("#filtre-galerie").addEventListener("change", rendreGalerie);
  $("#taille-galerie").addEventListener("input", () => {
    const valeur = ($("#taille-galerie") as unknown as HTMLInputElement).value;
    $("#sections-galerie").style.setProperty("--taille-vignette", `${valeur}px`);
  });
  $("#saut-galerie").addEventListener("change", () => {
    const valeur = ($("#saut-galerie") as unknown as HTMLSelectElement).value;
    document.getElementById(valeur)?.scrollIntoView({ behavior: "smooth" });
  });
  $("#sel-annuler").addEventListener("click", () => {
    selectionGalerie = new Set();
    majSelectionVisuelle();
  });
  $("#sel-favori").addEventListener("click", () => void actionSelection("favori"));
  $("#sel-ajouter").addEventListener("click", () => void actionSelection("ajouter"));
  $("#sel-retirer").addEventListener("click", () => void actionSelection("retirer"));
  $("#sel-corbeille").addEventListener("click", () => void actionSelection("corbeille"));
  installerRectangleSelection();

  // Visionneuse
  $("#vis-prec").addEventListener("click", () => visNaviguer(-1));
  $("#vis-suiv").addEventListener("click", () => visNaviguer(1));
  $("#vis-fermer").addEventListener("click", fermerVisionneuse);

  // Favoris
  $("#btn-favori").addEventListener("click", () => void basculerFavori());

  // Annulation des tâches longues (le programme repartira de zéro)
  $("#btn-annuler-tache").addEventListener("click", async () => {
    if (await confirmer(t("confirm.annulerTache"))) void invoke("annuler_tache");
  });
  $("#btn-analyser-doublons").addEventListener("click", () => void analyserDoublons());
  $("#btn-appliquer-doublons").addEventListener("click", () => void appliquerDoublons());
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name=mode-doublons]")) {
    radio.addEventListener("change", () => {
      $("#ligne-seuil").hidden = radio.value !== "similaires" || !radio.checked;
    });
  }
  listen<[number, number]>("doublons-progres", (e) => {
    const [fait, total] = e.payload;
    $("#chargement-detail").textContent = t("chargement.progression", { a: fait, b: total });
    $("#chargement-jauge").style.width = total ? `${Math.round((100 * fait) / total)}%` : "0";
  });
  $("#btn-reset-tout").addEventListener("click", async () => {
    if (!(await confirmer(t("confirm.reset"), { danger: true }))) return;
    etat.decisions = {};
    etat.mois_valides = [];
    etat.ordre = [];
    await sauver();
    rendreMois();
  });

  // Vue tri
  $("#btn-retour-mois").addEventListener("click", () => { afficherVue("vue-mois"); rendreMois(); });
  $("#btn-garder").addEventListener("click", () => decider("garder"));
  $("#btn-jeter").addEventListener("click", () => decider("jeter"));
  $("#btn-annuler").addEventListener("click", annuler);
  $("#btn-garder-reste").addEventListener("click", garderLeReste);
  $("#btn-rafale").addEventListener("click", ouvrirRafale);
  $("#btn-revue").addEventListener("click", () => { afficherVue("vue-revue"); rendreRevue(); });
  $("#btn-fin-revue").addEventListener("click", () => { afficherVue("vue-revue"); rendreRevue(); });
  installerSwipe();

  // Rafale
  $("#btn-retour-rafale").addEventListener("click", () => { afficherVue("vue-tri"); rendreCarte(); });
  $("#btn-valider-rafale").addEventListener("click", appliquerRafale);

  // Revue
  $("#btn-retour-tri").addEventListener("click", () => ouvrirMois(moisCourant));
  $("#btn-valider-mois").addEventListener("click", validerMois);

  // Mises à jour & soutien
  ($("#kofi-banniere") as unknown as HTMLImageElement).src = kofiBanniere;
  $("#btn-kofi").addEventListener("click", () => {
    void openUrl(URL_KOFI);
    ($("#modale-kofi") as unknown as HTMLDialogElement).close();
  });
  $("#btn-maj-telecharger").addEventListener("click", () => void installerMaj());
  $("#btn-verif-maj").addEventListener("click", () => verifierMaj(false));
  $("#btn-aide-blocage").addEventListener("click", () => void openUrl(URL_AIDE_BLOCAGE));
  void verifierMaj(true); // vérification silencieuse au démarrage
  ($("#modale-valide") as unknown as HTMLDialogElement).addEventListener("close", () => {
    if (jalonKofi) { jalonKofi = false; proposerSoutien(); }
  });

  // Modale « mois validé »
  $("#btn-valide-menu").addEventListener("click", () => {
    ($("#modale-valide") as unknown as HTMLDialogElement).close();
    afficherVue("vue-mois");
    rendreMois();
  });
  $("#btn-valide-suivant").addEventListener("click", () => {
    ($("#modale-valide") as unknown as HTMLDialogElement).close();
    allerMoisSuivant();
  });

  // Corbeille
  $("#btn-retour-corbeille").addEventListener("click", () => { afficherVue("vue-mois"); rendreMois(); });
  $("#btn-vider").addEventListener("click", async () => {
    if (!(await confirmer(t("confirm.vider"), { danger: true }))) return;
    await invoke("vider_corbeille", { racine });
    await rendreCorbeille();
    proposerSoutien();
  });
  $("#btn-restaurer").addEventListener("click", async () => {
    const n = await invoke<number>("restaurer_corbeille", { racine });
    await informer(t("corbeille.restaures", { n }));
    await ouvrirDossier(racine);
  });

  for (const btn of document.querySelectorAll<HTMLButtonElement>("dialog .fermer")) {
    btn.addEventListener("click", () => btn.closest("dialog")!.close());
  }

  // Clic en dehors d'une fenêtre = fermeture (sauf CGU, dont l'acceptation est requise)
  for (const dlg of document.querySelectorAll<HTMLDialogElement>("dialog")) {
    if (dlg.id === "modale-cgu") continue;
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) dlg.close();
    });
  }

  // Fenêtre « mois validé » : la touche garder = mois suivant, jeter = retour au menu
  ($("#modale-valide") as unknown as HTMLDialogElement).addEventListener("keydown", (e) => {
    const suivantVisible = !($("#btn-valide-suivant") as unknown as HTMLButtonElement).hidden;
    if (e.key === raccourci("garder") && suivantVisible) {
      e.preventDefault();
      ($("#btn-valide-suivant") as unknown as HTMLButtonElement).click();
    } else if (e.key === raccourci("jeter")) {
      e.preventDefault();
      ($("#btn-valide-menu") as unknown as HTMLButtonElement).click();
    }
  });

  // Rescan discret quand la fenêtre reprend le focus : les fichiers supprimés
  // ou ajoutés hors de Krino sont pris en compte automatiquement.
  window.addEventListener("focus", () => {
    if (vueActive() === "vue-mois" && !document.querySelector("dialog[open]")) void rafraichir();
  });

  installerModaleReglages();
  installerClavier();
  rendreEtiquettesRaccourcis();
});
