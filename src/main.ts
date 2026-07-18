import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";

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
}

/* ═══ État global ═══ */

let racine = "";
let medias: Media[] = [];
let etat: Etat = { decisions: {}, mois_valides: [], raccourcis: {}, source_date: "exif" };
let moisCourant = "";
let file: Media[] = []; // restants à trier dans le mois courant
let historique: string[] = [];
let sensInverse = false;
let zoom = 1, panX = 0, panY = 0;
let rafaleCourante: Media[] = [];
let decisionsRafale = new Map<string, "garder" | "jeter">();

const ECART_RAFALE_MS = 5000;

/* Préférences d'application (indépendantes du dossier trié) */
interface Prefs {
  theme: "auto" | "sombre" | "clair";
  parAnnee: boolean;
  tutoVu: boolean;
  cguAcceptees: boolean;
}
const prefs: Prefs = {
  theme: "auto", parAnnee: true, tutoVu: false, cguAcceptees: false,
  ...JSON.parse(localStorage.getItem("krino-prefs") ?? "{}"),
};
function sauverPrefs() {
  localStorage.setItem("krino-prefs", JSON.stringify(prefs));
}
function appliquerTheme() {
  document.documentElement.dataset.theme = prefs.theme;
}

const RACCOURCIS_DEFAUT: Record<string, string> = {
  garder: "ArrowRight",
  jeter: "ArrowLeft",
  annuler: "Backspace",
  valider: "Enter",
  suivant: "n",
};

const $ = <T extends HTMLElement = HTMLElement>(sel: string) =>
  document.querySelector(sel) as T;

/* ═══ Utilitaires ═══ */

function tailleLisible(octets: number): string {
  const unites = ["o", "Ko", "Mo", "Go"];
  let v = octets, i = 0;
  while (v >= 1024 && i < unites.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${unites[i]}`;
}

function dateDe(m: Media): number {
  return etat.source_date === "fichier" ? m.mtime_ms : (m.exif_ms ?? m.mtime_ms);
}

function moisDe(m: Media): string {
  const d = new Date(dateDe(m));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nomMois(cle: string): string {
  const [a, mo] = cle.split("-").map(Number);
  return new Date(a, mo - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function dateLisible(m: Media): string {
  return new Date(dateDe(m)).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const cacheWic = new Map<string, string>();

/** URL affichable : directe pour les formats webview, décodée via Rust pour HEIC/TIFF. */
async function urlAffichable(cheminAbs: string, wic: boolean, miniature = false): Promise<string> {
  if (!wic) return convertFileSrc(cheminAbs);
  const cle = `${cheminAbs}|${miniature}`;
  if (!cacheWic.has(cle)) {
    try {
      cacheWic.set(cle, await invoke<string>("apercu_png", {
        chemin: cheminAbs, largeurMax: miniature ? 320 : 1920,
      }));
    } catch {
      cacheWic.set(cle, "");
    }
  }
  return cacheWic.get(cle)!;
}

function src(rel: string): string { return `${racine}/${rel}`; }

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
function srcCorbeille(rel: string): string { return `${racine}/.krino/corbeille/${rel}`; }

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

/* ═══ Accueil ═══ */

async function ouvrirDossier(chemin: string) {
  racine = chemin;
  localStorage.setItem("krino-dernier", chemin);
  $("#chargement").hidden = false;
  $("#chargement-detail").textContent = "Parcours de l'arborescence…";
  ($("#chargement-jauge")).style.width = "0";
  try {
    medias = await invoke<Media[]>("scanner", { racine });
  } finally {
    $("#chargement").hidden = true;
  }
  etat = await invoke<Etat>("lire_etat", { racine });
  if (!etat.source_date) etat.source_date = "exif";
  $("#titre-dossier").textContent = `${chemin} — ${medias.length} fichiers`;
  afficherVue("vue-mois");
  rendreMois();
  rendreEtiquettesRaccourcis();
}

async function choisirDossier() {
  const chemin = await open({ directory: true, title: "Dossier de photos à trier" });
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
    const cle = moisDe(m);
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
    <h3>${nomMois(s.cle)}</h3>
    <div class="eventail"></div>
    <div class="stats">${s.fichiers.length} fichiers &middot; ${tailleLisible(s.taille)}</div>
    <div class="jauge"><div style="width:${pct}%"></div></div>
    <div class="stats">${s.valide ? '<span class="etiquette-fait">Fait</span>' : `${s.decides}/${s.fichiers.length} décidés`}</div>
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
    btn.textContent = "Refaire ce mois";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Refaire ${nomMois(s.cle)} ? Les décisions de ce mois seront effacées (la corbeille n'est pas touchée).`)) return;
      etat.mois_valides = etat.mois_valides.filter((m) => m !== s.cle);
      for (const f of s.fichiers) delete etat.decisions[f.rel];
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
    // Sections par année, dans l'ordre induit par le tri des mois
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
  historique = [];
  file = medias
    .filter((m) => moisDe(m) === cle && !etat.decisions[m.rel])
    .sort((a, b) => dateDe(a) - dateDe(b));
  $("#titre-tri").textContent = nomMois(cle);
  afficherVue("vue-tri");
  rendreCarte();
}

function courant(): Media | undefined { return file[0]; }

/** Groupe de photos prises à moins de 5 s d'écart autour du média courant. */
function rafaleDe(m: Media): Media[] {
  const duMois = medias
    .filter((x) => moisDe(x) === moisCourant && !x.video)
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
  const total = medias.filter((m) => moisDe(m) === moisCourant).length;
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
    $("#btn-mois-suivant").hidden = !prochainMois();
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

  // Bouton rafale si des photos quasi simultanées existent
  const rafale = m.video ? [m] : rafaleDe(m);
  const btnRafale = $("#btn-rafale");
  btnRafale.hidden = rafale.length < 2;
  if (rafale.length >= 2) btnRafale.textContent = `Comparer la rafale (${rafale.length})`;

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
  // La carte suivante émerge du centre du deck
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

async function decider(action: "garder" | "jeter", animer = true) {
  const m = courant();
  if (!m) return;
  etat.decisions[m.rel] = action;
  historique.push(m.rel);
  file.shift();
  if (animer) animerSortie(action, rendreCarte);
  else rendreCarte();
  await sauver();
}

async function annuler() {
  const rel = historique.pop();
  if (!rel) return;
  delete etat.decisions[rel];
  const m = medias.find((x) => x.rel === rel);
  if (m) file.unshift(m);
  rendreCarte();
  await sauver();
}

async function garderLeReste() {
  if (!file.length) return;
  if (!confirm(`Marquer les ${file.length} fichiers restants comme gardés ?`)) return;
  for (const m of file) { etat.decisions[m.rel] = "garder"; historique.push(m.rel); }
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
  let x0 = 0, y0 = 0, dx = 0, actif = false;
  const SEUIL = 120;

  carte.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).tagName === "VIDEO") return;
    actif = true; x0 = e.clientX; y0 = e.clientY; dx = 0;
    carte.classList.add("saisi");
    carte.setPointerCapture(e.pointerId);
  });
  carte.addEventListener("pointermove", (e) => {
    if (!actif) return;
    if (zoom > 1) { // en zoom : on déplace l'image, pas la carte
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

  // Zoom molette, réinitialisation double-clic
  carte.addEventListener("wheel", (e) => {
    if (courant()?.video) return;
    e.preventDefault();
    const facteur = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    zoom = Math.min(8, Math.max(1, zoom * facteur));
    if (zoom === 1) { panX = 0; panY = 0; }
    appliquerZoom();
  }, { passive: false });
  carte.addEventListener("dblclick", reinitZoom);
  void y0;
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
        decisionsRafale.get(x.rel) === "garder" ? "GARDER" : "JETER";
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
    `${decisionsRafale.size - jetees} à garder, ${jetees} à jeter`;
}

async function appliquerRafale() {
  for (const [rel, action] of decisionsRafale) {
    etat.decisions[rel] = action;
    historique.push(rel);
  }
  const rels = new Set(decisionsRafale.keys());
  file = file.filter((m) => !rels.has(m.rel));
  await sauver();
  afficherVue("vue-tri");
  rendreCarte();
}

/* ═══ Vue revue ═══ */

async function rendreRevue() {
  const fichiers = medias.filter((m) => moisDe(m) === moisCourant);
  const gardees = fichiers.filter((m) => etat.decisions[m.rel] === "garder");
  const jetees = fichiers.filter((m) => etat.decisions[m.rel] === "jeter");
  $("#titre-revue").textContent = `Revue — ${nomMois(moisCourant)}`;
  const octetsJetes = jetees.reduce((s, f) => s + f.taille, 0);
  $("#bilan-revue").textContent =
    `${gardees.length} gardées &middot; ${jetees.length} jetées (${tailleLisible(octetsJetes)} à libérer)`
      .replace("&middot;", "·");

  const rendreGrille = async (conteneur: HTMLElement, liste: Media[]) => {
    conteneur.innerHTML = "";
    for (const m of liste) {
      const v = document.createElement("div");
      v.className = "vignette";
      v.title = m.rel;
      if (m.video) {
        v.innerHTML = `<video src="${convertFileSrc(src(m.rel))}" preload="metadata" muted></video><span class="marque">vidéo</span>`;
      } else {
        const img = document.createElement("img");
        img.loading = "lazy";
        urlMiniature(m).then((url) => { img.src = url; });
        v.appendChild(img);
      }
      v.addEventListener("click", async () => {
        etat.decisions[m.rel] = etat.decisions[m.rel] === "garder" ? "jeter" : "garder";
        await sauver();
        rendreRevue();
      });
      conteneur.appendChild(v);
    }
  };
  await rendreGrille($("#grille-gardees"), gardees);
  await rendreGrille($("#grille-jetees"), jetees);
}

async function validerMois() {
  const fichiers = medias.filter((m) => moisDe(m) === moisCourant);
  const jetees = fichiers.filter((m) => etat.decisions[m.rel] === "jeter");
  const octets = jetees.reduce((s, f) => s + f.taille, 0);
  if (!confirm(
    `Valider ${nomMois(moisCourant)} ?\n\n` +
    `${jetees.length} fichiers (${tailleLisible(octets)}) seront déplacés vers la corbeille de Krino.\n` +
    `Rien n'est supprimé tant que la corbeille n'est pas vidée.`
  )) return;
  await invoke("valider_mois", { racine, rels: jetees.map((m) => m.rel) });
  if (!etat.mois_valides.includes(moisCourant)) etat.mois_valides.push(moisCourant);
  await sauver();
  const relsJetes = new Set(jetees.map((m) => m.rel));
  medias = medias.filter((m) => !relsJetes.has(m.rel));
  // Enchaîne directement sur le mois suivant non trié, s'il existe
  const prochain = prochainMois();
  if (prochain) ouvrirMois(prochain);
  else { afficherVue("vue-mois"); rendreMois(); }
}

/* ═══ Vue corbeille ═══ */

async function rendreCorbeille() {
  afficherVue("vue-corbeille");
  const liste = await invoke<{ rel: string; taille: number; video: boolean; wic: boolean }[]>(
    "lister_corbeille", { racine });
  const octets = liste.reduce((s, f) => s + f.taille, 0);
  $("#bilan-corbeille").textContent = liste.length
    ? `${liste.length} fichiers · ${tailleLisible(octets)} récupérables`
    : "vide";
  const grille = $("#grille-corbeille");
  grille.innerHTML = "";
  for (const f of liste) {
    const v = document.createElement("div");
    v.className = "vignette";
    v.title = f.rel;
    if (f.video) {
      v.innerHTML = `<video src="${convertFileSrc(srcCorbeille(f.rel))}" preload="metadata" muted></video><span class="marque">vidéo</span>`;
    } else {
      const img = document.createElement("img");
      img.loading = "lazy";
      urlMiniature(f, true).then((url) => { img.src = url; });
      v.appendChild(img);
    }
    const btn = document.createElement("button");
    btn.className = "btn-restaurer-un";
    btn.textContent = "Restaurer";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await invoke("restaurer_fichier", { racine, rel: f.rel });
        await ouvrirDossier(racine);
        rendreCorbeille();
      } catch (err) {
        alert(String(err));
      }
    });
    v.appendChild(btn);
    grille.appendChild(v);
  }
}

/* ═══ Réglages & raccourcis ═══ */

function rendreEtiquettesRaccourcis() {
  const joli = (t: string) =>
    t.replace("Arrow", "").replace("Right", "→").replace("Left", "←")
     .replace("Up", "↑").replace("Down", "↓")
     .replace("Backspace", "Retour").replace("Enter", "Entrée").replace(" ", "Espace");
  $("#kbd-garder").textContent = joli(raccourci("garder"));
  $("#kbd-jeter").textContent = joli(raccourci("jeter"));
  $("#kbd-valider").textContent = joli(raccourci("valider"));
  $("#kbd-valider2").textContent = joli(raccourci("valider"));
  $("#kbd-suivant").textContent = joli(raccourci("suivant"));
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
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name=theme]")) {
    radio.checked = radio.value === prefs.theme;
  }
  ($("#opt-annees") as unknown as HTMLInputElement).checked = prefs.parAnnee;
  rendreEtiquettesRaccourcis();
  ($("#modale-reglages") as unknown as HTMLDialogElement).showModal();
}

/* ═══ Tutoriel ═══ */

interface EtapeTuto {
  texte: string;
  cible?: string;
  avant?: () => void | Promise<void>;
}

const ETAPES_TUTO: EtapeTuto[] = [
  {
    texte: "Bienvenue dans Krino. Ce tutoriel utilise un dossier d'images de démonstration — tes vraies photos ne sont pas touchées.",
    avant: async () => {
      const dossier = await invoke<string>("creer_dossier_demo");
      await ouvrirDossier(dossier);
    },
  },
  {
    texte: "Voici tes mois, regroupés par année. Chaque carte montre un aperçu, le nombre de fichiers, la taille et la progression du tri.",
    cible: "#conteneur-mois",
  },
  {
    texte: "Le menu déroulant change le critère de tri, et la petite flèche inverse l'ordre. On peut aussi masquer les mois déjà faits.",
    cible: "#tri-mois",
  },
  {
    texte: "Ouvrons le premier mois. Pour chaque photo : bouton Garder ou Jeter, flèches du clavier (→ garder, ← jeter), ou glisse la carte à droite/gauche comme un deck.",
    avant: () => {
      const premier = moisTries()[0];
      if (premier) ouvrirMois(premier);
    },
    cible: "#carte",
  },
  {
    texte: "La molette zoome dans l'image, le double-clic réinitialise. « Annuler » (ou Retour arrière) rattrape une erreur. Si des photos ont été prises en rafale, un bouton « Comparer la rafale » apparaît.",
    cible: "#pied-tri",
  },
  {
    texte: "Quand toutes les décisions sont prises, la Revue du mois (Entrée) récapitule tout : clique sur une vignette pour changer d'avis, puis « Valider le mois ».",
    cible: "#btn-revue",
  },
  {
    texte: "À la validation, les photos jetées sont DÉPLACÉES dans la corbeille interne de Krino — rien n'est encore supprimé. L'écran Corbeille permet de tout vérifier, restaurer fichier par fichier, ou vider définitivement pour libérer l'espace.",
    cible: "#btn-revue",
  },
  {
    texte: "C'est tout ! Réglages te permet de changer le thème, les raccourcis, le regroupement (EXIF ou date de fichier, par année ou non) et de revoir ce tutoriel. Bon tri !",
  },
];

let etapeTuto = -1;

async function tutoAller(i: number) {
  document.querySelector(".tuto-cible")?.classList.remove("tuto-cible");
  if (i >= ETAPES_TUTO.length) { tutoFin(); return; }
  etapeTuto = i;
  const etape = ETAPES_TUTO[i];
  await etape.avant?.();
  $("#tuto-texte").textContent = etape.texte;
  $("#tuto-etape").textContent = `${i + 1}/${ETAPES_TUTO.length}`;
  ($("#tuto-suivant") as unknown as HTMLButtonElement).textContent =
    i === ETAPES_TUTO.length - 1 ? "Terminer" : "Suivant";
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

function installerClavier() {
  window.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]")) return;
    const vue = vueActive();
    const k = e.key;
    if (vue === "vue-tri") {
      if (k === raccourci("garder")) { e.preventDefault(); decider("garder"); }
      else if (k === raccourci("jeter")) { e.preventDefault(); decider("jeter"); }
      else if (k === raccourci("annuler")) { e.preventDefault(); annuler(); }
      else if (k === raccourci("valider")) { e.preventDefault(); afficherVue("vue-revue"); rendreRevue(); }
      else if (k === raccourci("suivant")) { e.preventDefault(); allerMoisSuivant(); }
      else if (k === "Escape") { afficherVue("vue-mois"); rendreMois(); }
    } else if (vue === "vue-revue") {
      if (k === raccourci("valider")) { e.preventDefault(); validerMois(); }
      else if (k === "Escape") ouvrirMois(moisCourant);
    } else if (vue === "vue-rafale") {
      if (k === raccourci("valider")) { e.preventDefault(); appliquerRafale(); }
      else if (k === "Escape") { afficherVue("vue-tri"); rendreCarte(); }
    } else if (vue === "vue-corbeille" && k === "Escape") {
      afficherVue("vue-mois"); rendreMois();
    }
  });
}

/* ═══ Câblage ═══ */

window.addEventListener("DOMContentLoaded", () => {
  appliquerTheme();

  // Progression du scan (émise par le backend)
  listen<[number, number]>("scan-progres", (e) => {
    const [fait, total] = e.payload;
    $("#chargement-detail").textContent = `${fait} / ${total} fichiers analysés`;
    $("#chargement-jauge").style.width = total ? `${Math.round((100 * fait) / total)}%` : "0";
  });

  // Tutoriel
  $("#tuto-suivant").addEventListener("click", () => tutoAller(etapeTuto + 1));
  $("#tuto-quitter").addEventListener("click", tutoFin);

  // Conditions d'utilisation : acceptation obligatoire au premier lancement
  const cgu = $("#modale-cgu") as unknown as HTMLDialogElement;
  $("#btn-accepter-cgu").addEventListener("click", () => {
    prefs.cguAcceptees = true;
    sauverPrefs();
    cgu.close();
    if (!prefs.tutoVu && confirm("Première utilisation : suivre le petit tutoriel (2 minutes, sur des images de démonstration) ?")) {
      tutoAller(0);
    }
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
    btn.textContent = `Reprendre : ${dernier}`;
    btn.addEventListener("click", () => ouvrirDossier(dernier));
  }

  // Vue mois
  $("#btn-retour-accueil").addEventListener("click", () => afficherVue("vue-accueil"));
  $("#tri-mois").addEventListener("change", rendreMois);
  $("#btn-sens").addEventListener("click", () => {
    sensInverse = !sensInverse;
    $("#btn-sens").classList.toggle("inverse", sensInverse);
    rendreMois();
  });
  $("#masquer-faits").addEventListener("change", rendreMois);
  $("#btn-corbeille").addEventListener("click", rendreCorbeille);
  $("#btn-reglages").addEventListener("click", ouvrirReglages);
  $("#btn-reset-tout").addEventListener("click", async () => {
    if (!confirm("Reset global : effacer TOUTES les décisions et refaire une passe complète ?\n(La corbeille n'est pas touchée.)")) return;
    etat.decisions = {};
    etat.mois_valides = [];
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
  $("#btn-mois-suivant").addEventListener("click", allerMoisSuivant);
  installerSwipe();

  // Rafale
  $("#btn-retour-rafale").addEventListener("click", () => { afficherVue("vue-tri"); rendreCarte(); });
  $("#btn-valider-rafale").addEventListener("click", appliquerRafale);

  // Revue
  $("#btn-retour-tri").addEventListener("click", () => ouvrirMois(moisCourant));
  $("#btn-valider-mois").addEventListener("click", validerMois);

  // Corbeille
  $("#btn-retour-corbeille").addEventListener("click", () => { afficherVue("vue-mois"); rendreMois(); });
  $("#btn-vider").addEventListener("click", async () => {
    if (!confirm("Vider la corbeille DÉFINITIVEMENT ? Cette action est irréversible.")) return;
    await invoke("vider_corbeille", { racine });
    rendreCorbeille();
  });
  $("#btn-restaurer").addEventListener("click", async () => {
    const n = await invoke<number>("restaurer_corbeille", { racine });
    alert(`${n} fichiers restaurés.`);
    await ouvrirDossier(racine);
  });

  for (const btn of document.querySelectorAll<HTMLButtonElement>("dialog .fermer")) {
    btn.addEventListener("click", () => btn.closest("dialog")!.close());
  }

  installerModaleReglages();
  installerClavier();
  rendreEtiquettesRaccourcis();
});
