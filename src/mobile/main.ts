/**
 * Krino mobile — contrôleur du pré-tri.
 *
 * Périmètre volontairement réduit au mode « Trier » du desktop : liste des mois,
 * swipe, revue de fin de mois, corbeille, réglages. Tout le mode « Organiser »
 * (galerie, albums, rangement) reste sur PC — voir `docs/MOBILE.md`.
 *
 * Ce fichier ne connaît que l'interface `Backend` : il ne sait pas s'il tourne
 * au-dessus de MediaStore ou du backend de démonstration.
 */

import "../styles.css";
import "./mobile.css";
import { appliquerTraductions, definirLangue, langue, resoudreLangue, t } from "../i18n";
import { confirmer, informer } from "../dialogues";
import {
  anonId,
  definirTelemetrieActivee,
  enregistrerAppareil,
  enregistrerRevue,
  enregistrerSuppression,
  envoyerTelemetrie,
  signalerErreur,
} from "../telemetrie";
import { getVersion } from "@tauri-apps/api/app";
import {
  type Backend,
  type Decision,
  type Etat,
  type Media,
  ETAT_VIDE,
  cleMois,
  formaterTaille,
  libelleMois,
} from "./backend";
import { BackendDemo } from "./backend-demo";
import { BackendAndroid } from "./backend-android";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { exit } from "@tauri-apps/plugin-process";
import kofiSymbole from "../assets/kofi-symbol.png";

/* ══ Sélection du backend ══
   Sous Tauri (application Android empaquetée) on branche le backend MediaStore ;
   dans un navigateur, c'est la démo. */
const SOUS_TAURI = "__TAURI_INTERNALS__" in window;
const backend: Backend = SOUS_TAURI ? new BackendAndroid() : new BackendDemo();
const estDemo = !SOUS_TAURI;

/* ══ Préférences ══ */
type Prefs = {
  theme: "auto" | "clair" | "sombre";
  langue: "auto" | "fr" | "en";
  telemetrieActivee: boolean;
  parAnnee: boolean;
  tutoVu: boolean;
};

const CLE_PREFS = "krino-mobile-prefs";

const prefs: Prefs = {
  theme: "auto",
  langue: "auto",
  telemetrieActivee: true,
  parAnnee: true,
  tutoVu: false,
  ...JSON.parse(localStorage.getItem(CLE_PREFS) ?? "{}"),
};

/** Inversion du sens de tri des mois — pas une préférence persistée, comme sur desktop. */
let sensInverse = false;

function sauverPrefs() {
  localStorage.setItem(CLE_PREFS, JSON.stringify(prefs));
}

function appliquerTheme() {
  document.documentElement.dataset.theme = prefs.theme;
  // La couleur de la barre système Android suit le thème.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = prefs.theme === "clair" ? "#f4f4f7" : "#141418";
}

/* ══ État global ══ */
let medias: Media[] = [];
let etat: Etat = { ...ETAT_VIDE };

let moisCourant = "";
let file: Media[] = [];
let idx = 0;
/** Ids décidés pendant la session, pour l'annulation. */
let historique: string[] = [];

/* ══ Raccourcis DOM ══ */
const $ = <T extends HTMLElement = HTMLElement>(sel: string) =>
  document.querySelector<T>(sel)!;

const VUES = [
  "vue-onboard",
  "vue-mois",
  "vue-tri",
  "vue-revue",
  "vue-corbeille",
  "vue-reglages",
];

function montrer(id: string) {
  for (const v of VUES) $(`#${v}`).hidden = v !== id;
}

/**
 * Bouton retour matériel Android.
 *
 * L'appli est une SPA sans navigation `history.pushState` : la WebView n'a
 * donc aucun historique où reculer, et Tauri ferme directement l'activité
 * (voir `AppPlugin.kt` — sans écouteur enregistré, le geste retombe sur
 * `webView.canGoBack()` puis `activity.onBackPressed()`). On réutilise les
 * mêmes fonctions que les boutons « retour » déjà présents dans chaque
 * écran plutôt que de dupliquer leur logique.
 */
function installerRetourAndroid() {
  if (!SOUS_TAURI) return;
  void onBackButtonPress(() => {
    if (!$("#vue-revue").hidden) {
      ouvrirTri(moisCourant);
    } else if (!$("#vue-tri").hidden || !$("#vue-corbeille").hidden || !$("#vue-reglages").hidden) {
      void retourMois();
    } else {
      // vue-mois (racine) ou vue-onboard : le retour quitte l'application,
      // comportement standard Android.
      void exit();
    }
  });
}

function chargement(texte: string | null) {
  const voile = $("#chargement");
  if (texte === null) {
    voile.hidden = true;
    return;
  }
  $("#chargement-titre").textContent = texte;
  voile.hidden = false;
}

function locale() {
  return langue() === "fr" ? "fr-FR" : "en-US";
}

/**
 * `localStorage.setItem("krino.debug", "1")` puis recharger affiche le
 * bandeau d'échecs à l'écran (utile en session de debug avec un testeur à
 * distance). Sans ça, toujours loggé en console mais invisible — ce bandeau
 * s'affichait par défaut jusqu'ici et une testeuse l'a pris pour un bug
 * (texte rouge qui envahit le bas de l'écran et masque les boutons).
 */
function debugActif(): boolean {
  try {
    return localStorage.getItem("krino.debug") === "1";
  } catch {
    return false;
  }
}

// Renseigné au démarrage (demarrer()) — getVersion() est asynchrone,
// journaliserEchec() ne l'est pas.
let versionApp = "?";

function journaliserEchec(texte: string) {
  console.error("[krino]", texte);
  void signalerErreur(texte, versionApp);
  if (!debugActif()) return;
  let bandeau = document.getElementById("debug-echecs");
  if (!bandeau) {
    bandeau = document.createElement("div");
    bandeau.id = "debug-echecs";
    bandeau.style.cssText = [
      "position:fixed",
      "left:0",
      "right:0",
      "bottom:0",
      "max-height:38vh",
      "overflow-y:auto",
      "background:#000000e6",
      "color:#ff9a9a",
      "font:11px/1.4 monospace",
      "padding:6px 8px",
      "z-index:99999",
      "white-space:pre-wrap",
      "word-break:break-all",
      "pointer-events:none",
    ].join(";");
    document.body.append(bandeau);
  }
  const ligne = document.createElement("div");
  ligne.textContent = texte;
  bandeau.append(ligne);
  // Ne garde que les dernières lignes pour ne pas grossir indéfiniment.
  while (bandeau.childNodes.length > 12) bandeau.firstChild?.remove();
}

/**
 * Charge une image en tolérant un échec réseau.
 *
 * Les vignettes de démo viennent d'un service externe qui limite le débit :
 * sans nouvel essai, une partie de la grille restait vide. Une `data:` URI
 * (backend Android) qui échoue une première fois n'a en revanche aucune
 * raison de réussir en réessayant les mêmes octets — pire, y ajouter
 * `?r=N` casserait un encodage base64 qui ne supporte pas de suffixe. On ne
 * retente donc que pour les URLs réseau.
 */
function chargerImage(img: HTMLImageElement, url: string) {
  let essais = 0;
  const reseau = !url.startsWith("data:");
  img.classList.remove("image-absente");
  img.onerror = () => {
    essais++;
    if (reseau && essais <= 2) {
      // Le paramètre force le navigateur à refaire la requête plutôt que de
      // resservir l'échec depuis son cache.
      window.setTimeout(() => (img.src = `${url}${url.includes("?") ? "&" : "?"}r=${essais}`), 400 * essais);
    } else {
      img.removeAttribute("src");
      img.classList.add("image-absente");
      journaliserEchec(
        `<img> n'a pas pu décoder l'URL (${url.length} car., début « ${url.slice(0, 40)}… »)`,
      );
    }
  };
  img.src = url;
}

/**
 * Enchaîne `backend.vignette()` puis `chargerImage()`. Si la commande native
 * rejette, le motif part dans le bandeau de diagnostic plutôt que de laisser
 * une carte blanche silencieuse.
 */
function chargerVignette(img: HTMLImageElement, m: Media, taille: number) {
  backend.vignette(m, taille).then(
    (url) => chargerImage(img, url),
    (erreur: unknown) => {
      img.classList.add("image-absente");
      const texte = erreur instanceof Error ? erreur.message : String(erreur);
      journaliserEchec(`vignette() rejetée (id=${m.id}) : ${texte}`);
    },
  );
}

/* ══ Démarrage ══ */

async function demarrer() {
  definirLangue(resoudreLangue(prefs.langue));
  document.documentElement.lang = langue();
  appliquerTheme();
  definirTelemetrieActivee(prefs.telemetrieActivee);
  appliquerTraductions();
  void getVersion().then((v) => {
    versionApp = v;
    void enregistrerAppareil(v);
  });

  $("#btn-autoriser").addEventListener("click", () => void autoriser());
  $("#btn-corbeille").addEventListener("click", () => void ouvrirCorbeille());
  $("#btn-reglages").addEventListener("click", () => ouvrirReglages());
  $("#btn-retour-mois").addEventListener("click", () => void retourMois());
  $("#btn-retour-mois-2").addEventListener("click", () => void retourMois());
  $("#btn-retour-mois-3").addEventListener("click", () => void retourMois());
  $("#btn-retour-tri").addEventListener("click", () => ouvrirTri(moisCourant));
  $("#btn-fin-revue").addEventListener("click", () => ouvrirRevue());
  $("#btn-valider-mois").addEventListener("click", () => void validerMois());
  $("#btn-jeter").addEventListener("click", () => decider("jeter"));
  $("#btn-garder").addEventListener("click", () => decider("garder"));
  $("#btn-annuler").addEventListener("click", () => annuler());
  $("#btn-restaurer-tout").addEventListener("click", () => void restaurerTout());
  $("#btn-vider").addEventListener("click", () => void viderCorbeille());
  $("#btn-reinit-demo").addEventListener("click", () => {
    (backend as BackendDemo).reinitialiser();
    location.reload();
  });
  $("#tri-mois").addEventListener("change", () => afficherMois());
  $("#btn-sens").addEventListener("click", () => {
    sensInverse = !sensInverse;
    $("#btn-sens").classList.toggle("inverse", sensInverse);
    afficherMois();
  });
  $("#masquer-faits").addEventListener("change", () => afficherMois());
  $("#tuto-suivant").addEventListener("click", () => void tutoAller(etapeTuto + 1));
  $("#tuto-quitter").addEventListener("click", () => tutoFin());

  installerReglages();
  installerSwipe();
  installerRetourAndroid();

  $("#bandeau-demo").textContent = estDemo ? t("mobile.demo") : "";
  $(".pied-demo").hidden = !estDemo;

  if ((await backend.permission()) === "accordee") await chargerPhototheque();
  else montrer("vue-onboard");
}

async function autoriser() {
  const bouton = $<HTMLButtonElement>("#btn-autoriser");
  bouton.disabled = true;
  $("#onboard-etat").textContent = "…";

  const resultat = await backend.demanderPermission();
  bouton.disabled = false;

  if (resultat === "refusee") {
    $("#onboard-etat").textContent = t("mobile.permRefusee");
    return;
  }
  if (resultat === "partielle") {
    // Cas Android 14+ : accès limité à une sélection, le tri complet est impossible.
    $("#onboard-etat").textContent = t("mobile.permPartielle");
  }
  await chargerPhototheque();

  // Uniquement à l'octroi initial (pas aux lancements suivants, qui passent
  // par la branche `permission() === "accordee"` de demarrer() sans jamais
  // rappeler autoriser()).
  if (!prefs.tutoVu && (await confirmer(t("mobile.confirmTuto")))) tutoDemarrer();
}

async function chargerPhototheque() {
  chargement(t("chargement.analyse"));
  [medias, etat] = await Promise.all([backend.scanner(), backend.lireEtat()]);
  chargement(null);
  afficherMois();
}

/* ══ Réglages ══ */

function installerReglages() {
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name=theme]")) {
    radio.checked = radio.value === prefs.theme;
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      prefs.theme = radio.value as Prefs["theme"];
      appliquerTheme();
      sauverPrefs();
    });
  }

  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name=langue]")) {
    radio.checked = radio.value === prefs.langue;
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      prefs.langue = radio.value as Prefs["langue"];
      definirLangue(resoudreLangue(prefs.langue));
      document.documentElement.lang = langue();
      sauverPrefs();
      appliquerTraductions();
      // Les écrans déjà rendus contiennent des textes construits en JS.
      rafraichirTextes();
    });
  }

  const optAnnees = $<HTMLInputElement>("#opt-annees");
  optAnnees.checked = prefs.parAnnee;
  optAnnees.addEventListener("change", () => {
    prefs.parAnnee = optAnnees.checked;
    sauverPrefs();
    if (!$("#vue-mois").hidden) afficherMois();
  });

  const opt = $<HTMLInputElement>("#opt-telemetrie");
  opt.checked = prefs.telemetrieActivee;
  opt.addEventListener("change", () => {
    prefs.telemetrieActivee = opt.checked;
    definirTelemetrieActivee(opt.checked);
    sauverPrefs();
  });

  $("#anon-id").textContent = anonId();

  ($("#kofi-symbole") as HTMLImageElement).src = kofiSymbole;

  $("#btn-revoir-tuto").addEventListener("click", () => tutoDemarrer());
}

function ouvrirReglages() {
  montrer("vue-reglages");
}

/** Re-rend les écrans dont le texte est construit en JS, après changement de langue. */
function rafraichirTextes() {
  $("#bandeau-demo").textContent = estDemo ? t("mobile.demo") : "";
  if (!$("#vue-mois").hidden) afficherMois();
}

/* ══ Liste des mois ══ */

type GroupeMois = {
  cle: string;
  medias: Media[];
  taille: number;
  decides: number;
};

function grouper(): GroupeMois[] {
  const par = new Map<string, Media[]>();
  for (const m of medias) {
    const c = cleMois(m.dateMs);
    if (!par.has(c)) par.set(c, []);
    par.get(c)!.push(m);
  }
  return [...par.entries()]
    .map(([cle, liste]) => ({
      cle,
      medias: liste.sort((a, b) => a.dateMs - b.dateMs),
      taille: liste.reduce((s, m) => s + m.taille, 0),
      decides: liste.filter((m) => etat.decisions[m.id]).length,
    }))
    .sort((a, b) => b.cle.localeCompare(a.cle));
}

/** Ordre d'affichage des mois, repris du desktop (date/taille/nombre/restants, sens inversable). */
function comparerMois(critere: string) {
  return (a: GroupeMois, b: GroupeMois) => {
    let c: number;
    switch (critere) {
      case "taille":
        c = a.taille - b.taille;
        break;
      case "nombre":
        c = a.medias.length - b.medias.length;
        break;
      case "restants":
        c = a.medias.length - a.decides - (b.medias.length - b.decides);
        break;
      default:
        c = a.cle.localeCompare(b.cle);
    }
    return sensInverse ? -c : c;
  };
}

function carteDeMois(g: GroupeMois): HTMLElement {
  const fait = etat.moisFaits.includes(g.cle);
  const carte = document.createElement("button");
  carte.className = `carte-mois${fait ? " fait" : ""}`;

  const titre = document.createElement("h3");
  titre.textContent = libelleMois(g.cle, locale());

  // Aperçu en éventail, repris du desktop : on reconnaît le mois d'un coup
  // d'œil au lieu de lire une date.
  const eventail = document.createElement("div");
  eventail.className = "eventail";
  for (const m of g.medias.slice(0, 3)) {
    const vignette = document.createElement("img");
    vignette.alt = "";
    chargerVignette(vignette, m, 300);
    eventail.append(vignette);
  }

  const stats = document.createElement("div");
  stats.className = "stats";
  stats.textContent = t("mois.fichiers", {
    n: g.medias.length,
    t: formaterTaille(g.taille),
  });

  const jauge = document.createElement("div");
  jauge.className = "jauge";
  const barre = document.createElement("div");
  barre.style.width = `${Math.round((g.decides / g.medias.length) * 100)}%`;
  jauge.append(barre);

  const avancement = document.createElement("div");
  avancement.className = "stats";
  if (fait) {
    const etiquette = document.createElement("span");
    etiquette.className = "etiquette-fait";
    etiquette.textContent = t("mois.fait");
    avancement.append(etiquette);
  } else {
    avancement.textContent = t("mois.decides", { a: g.decides, b: g.medias.length });
  }

  carte.append(titre, eventail, stats, jauge, avancement);
  carte.addEventListener("click", () => ouvrirTri(g.cle));
  return carte;
}

function afficherMois() {
  montrer("vue-mois");
  const conteneur = $("#conteneur-mois");
  conteneur.textContent = "";

  const critere = $<HTMLSelectElement>("#tri-mois").value;
  const masquerFaits = $<HTMLInputElement>("#masquer-faits").checked;
  let groupes = grouper();
  if (masquerFaits) groupes = groupes.filter((g) => !etat.moisFaits.includes(g.cle));
  groupes.sort(comparerMois(critere));

  if (groupes.length === 0) {
    const vide = document.createElement("p");
    vide.className = "aide-revue";
    vide.textContent = t("mobile.aucunePhoto");
    conteneur.append(vide);
    return;
  }

  if (prefs.parAnnee) {
    const annees: string[] = [];
    for (const g of groupes) {
      const a = g.cle.slice(0, 4);
      if (!annees.includes(a)) annees.push(a);
    }
    for (const annee of annees) {
      const titreAnnee = document.createElement("h2");
      titreAnnee.className = "titre-annee";
      titreAnnee.textContent = annee;
      conteneur.append(titreAnnee);

      const grille = document.createElement("div");
      grille.className = "grille-mois";
      for (const g of groupes.filter((x) => x.cle.startsWith(annee))) {
        grille.append(carteDeMois(g));
      }
      conteneur.append(grille);
    }
  } else {
    const grille = document.createElement("div");
    grille.className = "grille-mois";
    for (const g of groupes) grille.append(carteDeMois(g));
    conteneur.append(grille);
  }
}

async function retourMois() {
  await backend.ecrireEtat(etat);
  afficherMois();
}

/* ══ Tutoriel ══
   Contrairement au desktop (dossier de démonstration dédié), le mobile n'a
   pas d'équivalent utilisable en production du mode démo — ce tutoriel
   s'appuie donc sur les vraies photos de l'utilisateur. Il reste strictement
   en lecture : ouvrir un mois pour montrer l'écran de tri ne prend aucune
   décision, mais on n'appelle jamais `decider()` ni ne simule la fin d'un
   mois — la revue et la corbeille sont donc décrites plutôt que visitées de
   force sur du contenu réel. */

interface EtapeTuto {
  cible?: string;
  texte: string;
  avant?: () => void | Promise<void>;
}

function construireEtapesTuto(): EtapeTuto[] {
  const etapes: EtapeTuto[] = [
    { cible: "#conteneur-mois", texte: "mobile.tuto.mois" },
    { cible: ".sous-barre-mois", texte: "mobile.tuto.filtres" },
  ];

  const premier = grouper()[0];
  if (premier) {
    etapes.push(
      { cible: ".carte-mois", texte: "mobile.tuto.carteMois" },
      { avant: () => ouvrirTri(premier.cle), cible: "#carte", texte: "mobile.tuto.swipe" },
      { cible: "#pied-tri", texte: "mobile.tuto.boutons" },
      { avant: () => retourMois(), cible: "#btn-corbeille", texte: "mobile.tuto.corbeille" },
    );
  } else {
    etapes.push({ cible: "#btn-corbeille", texte: "mobile.tuto.corbeille" });
  }

  etapes.push({ cible: "#btn-reglages", texte: "mobile.tuto.reglages" });
  return etapes;
}

let etapesTuto: EtapeTuto[] = [];
let etapeTuto = -1;

async function tutoAller(i: number) {
  document.querySelector(".tuto-cible")?.classList.remove("tuto-cible");
  if (i >= etapesTuto.length) { tutoFin(); return; }
  etapeTuto = i;
  const etape = etapesTuto[i];
  await etape.avant?.();
  $("#tuto-texte").textContent = t(etape.texte);
  $("#tuto-etape").textContent = `${i + 1}/${etapesTuto.length}`;
  ($("#tuto-suivant") as unknown as HTMLButtonElement).textContent =
    i === etapesTuto.length - 1 ? t("tuto.terminer") : t("tuto.suivant");
  $("#tuto-bulle").hidden = false;
  if (etape.cible) document.querySelector(etape.cible)?.classList.add("tuto-cible");
}

function tutoDemarrer() {
  afficherMois();
  etapesTuto = construireEtapesTuto();
  void tutoAller(0);
}

function tutoFin() {
  document.querySelector(".tuto-cible")?.classList.remove("tuto-cible");
  $("#tuto-bulle").hidden = true;
  etapeTuto = -1;
  prefs.tutoVu = true;
  sauverPrefs();
  afficherMois();
}

/* ══ Tri ══ */

function ouvrirTri(cle: string) {
  moisCourant = cle;
  const groupe = grouper().find((g) => g.cle === cle);
  if (!groupe) return afficherMois();

  // Seuls les médias non encore décidés entrent dans la file : reprendre un mois
  // entamé continue là où on s'était arrêté.
  file = groupe.medias.filter((m) => !etat.decisions[m.id]);
  idx = 0;
  historique = [];

  $("#titre-tri").textContent = libelleMois(cle, locale());
  montrer("vue-tri");
  rendreCarte();
}

const courant = (): Media | undefined => file[idx];

/** Taille de décodage demandée pour la photo plein cadre de la carte de tri. */
const tailleCarte = () =>
  Math.min(1400, Math.round(Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1)));

/**
 * Vignettes de carte déjà résolues, indexées par id média.
 *
 * Sans ce cache, promouvoir la carte de fond en carte active relançait un
 * décodage natif complet pour une image déjà affichée l'instant d'avant
 * dans l'autre carte : le temps de cet aller-retour, la carte redevenait
 * visible avec son ANCIEN contenu encore en place — un flicker de l'ancienne
 * photo devant la nouvelle. La carte de fond a largement le temps de
 * résoudre sa vignette pendant que l'utilisateur regarde la carte active ;
 * la promotion la retrouve donc déjà en cache.
 */
const cacheVignetteCarte = new Map<string, string>();
const TAILLE_CACHE_CARTE = 6;

function memoriserVignetteCarte(id: string, url: string) {
  cacheVignetteCarte.set(id, url);
  if (cacheVignetteCarte.size > TAILLE_CACHE_CARTE) {
    const plusAncien = cacheVignetteCarte.keys().next().value;
    if (plusAncien !== undefined) cacheVignetteCarte.delete(plusAncien);
  }
}

/** Remplit une carte (active ou de fond) avec un média. Structure identique. */
function peupler(carte: HTMLElement, m: Media, avecInfos: boolean) {
  const flou = carte.querySelector<HTMLImageElement>(".apercu-fond")!;
  const photo = carte.querySelector<HTMLImageElement>("img.apercu-photo")!;
  const video = carte.querySelector<HTMLVideoElement>("video.apercu-photo");

  if (m.video && video) {
    photo.hidden = true;
    video.hidden = false;
    video.src = m.uri;
    flou.hidden = true;
  } else {
    if (video) {
      video.hidden = true;
      video.removeAttribute("src");
    }
    photo.hidden = false;
    flou.hidden = false;
    const enCache = cacheVignetteCarte.get(m.id);
    if (enCache) {
      chargerImage(photo, enCache);
      chargerImage(flou, enCache);
    } else {
      // Comme pour les vignettes de la grille des mois : un <img src="m.uri">
      // (content://) ne charge rien dans la WebView Android, dont le rendu
      // s'exécute hors du processus qui détient les permissions MediaStore.
      backend.vignette(m, tailleCarte()).then(
        (url) => {
          memoriserVignetteCarte(m.id, url);
          chargerImage(photo, url);
          chargerImage(flou, url);
        },
        (erreur: unknown) => {
          photo.classList.add("image-absente");
          const texte = erreur instanceof Error ? erreur.message : String(erreur);
          journaliserEchec(`vignette() rejetée (id=${m.id}, carte) : ${texte}`);
        },
      );
    }
  }

  const infos = carte.querySelector(".carte-infos");
  if (infos && avecInfos) {
    const [gauche, droite] = infos.querySelectorAll("span");
    gauche.textContent = new Date(m.dateMs).toLocaleDateString(locale(), {
      day: "numeric",
      month: "short",
    });
    droite.textContent = formaterTaille(m.taille);
  }
}

function rendreCarte() {
  const carte = $("#carte");
  const fond = $("#carte-fond");
  const finMois = $("#fin-mois");
  const pied = $("#pied-tri");
  const m = courant();

  $("#progression-tri").textContent = m
    ? `${idx + 1} / ${file.length}`
    : `${file.length} / ${file.length}`;
  $<HTMLButtonElement>("#btn-annuler").disabled = historique.length === 0;

  if (!m) {
    carte.hidden = true;
    fond.hidden = true;
    finMois.hidden = false;
    pied.hidden = true;
    return;
  }

  finMois.hidden = true;
  pied.hidden = false;
  carte.hidden = false;
  carte.style.transform = "";
  carte.style.transition = "";

  peupler(carte, m, true);

  // Carte suivante en arrière-plan, pour donner la sensation de pile.
  const suivant = file[idx + 1];
  fond.hidden = !suivant;
  if (suivant) peupler(fond, suivant, true);
}

function decider(choix: Decision) {
  const m = courant();
  if (!m) return;

  etat.decisions[m.id] = choix;
  historique.push(m.id);
  enregistrerRevue(1);

  // La carte part dans la direction du choix avant de laisser place à la suivante.
  const carte = $("#carte");
  const fond = $("#carte-fond");
  const sens = choix === "garder" ? 1 : -1;
  carte.style.transition = "transform 0.22s ease-out, opacity 0.22s ease-out";
  carte.style.transform = `translateX(${sens * window.innerWidth}px) rotate(${sens * 18}deg)`;
  carte.style.opacity = "0";

  // La carte de fond grandit et s'éclaircit en même temps que l'autre s'en
  // va, plutôt que d'apparaître d'un coup déjà à pleine taille une fois la
  // carte active repeuplée.
  if (!fond.hidden) {
    fond.style.transition = "transform 0.22s ease-out, filter 0.22s ease-out";
    fond.style.transform = "none";
    fond.style.filter = "none";
  }

  window.setTimeout(() => {
    carte.style.transition = "";
    carte.style.opacity = "";
    fond.style.transition = "";
    fond.style.transform = "";
    fond.style.filter = "";
    idx++;
    rendreCarte();
    void backend.ecrireEtat(etat);
  }, 180);
}

function annuler() {
  const id = historique.pop();
  if (!id) return;
  delete etat.decisions[id];
  idx = Math.max(0, idx - 1);
  rendreCarte();
  void backend.ecrireEtat(etat);
}

/** Swipe : reprend la mécanique du desktop, avec un seuil relatif à l'écran. */
function installerSwipe() {
  const carte = $("#carte");
  const badgeG = $("#badge-garder");
  const badgeJ = $("#badge-jeter");
  let x0 = 0;
  let y0 = 0;
  let dx = 0;
  let actif = false;

  const seuil = () => Math.min(120, window.innerWidth * 0.28);

  // Un `style.transform` par `pointermove` brut peut arriver bien plus vite
  // que l'écran ne rafraîchit (le tactile Android échantillonne souvent au-
  // delà de 60 Hz) : on ne garde que la dernière position et on ne touche le
  // DOM qu'une fois par frame, sinon le glissé est saccadé.
  let framePrevu = false;

  const appliquerPosition = () => {
    framePrevu = false;
    // Le doigt a pu être relâché entre la planification de cette frame et son
    // exécution : sans ce garde-fou, une frame en retard réappliquait une
    // opacité de badge obsolète juste après que `relacher()` l'ait remise à
    // zéro — la carte suivante héritait de la mention « garder »/« jeter »
    // au lieu de l'effacer.
    if (!actif) return;
    carte.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
    badgeG.style.opacity = String(Math.max(0, Math.min(1, dx / seuil())));
    badgeJ.style.opacity = String(Math.max(0, Math.min(1, -dx / seuil())));
  };

  carte.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).tagName === "VIDEO") return;
    actif = true;
    x0 = e.clientX;
    y0 = e.clientY;
    dx = 0;
    carte.classList.add("saisi");
    carte.setPointerCapture(e.pointerId);
  });

  carte.addEventListener("pointermove", (e) => {
    if (!actif) return;
    const dy = e.clientY - y0;
    dx = e.clientX - x0;
    // Geste vertical : on laisse la main au défilement plutôt que de swiper.
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) return;
    if (!framePrevu) {
      framePrevu = true;
      requestAnimationFrame(appliquerPosition);
    }
  });

  const relacher = () => {
    if (!actif) return;
    actif = false;
    carte.classList.remove("saisi");
    badgeG.style.opacity = "0";
    badgeJ.style.opacity = "0";
    if (dx > seuil()) decider("garder");
    else if (dx < -seuil()) decider("jeter");
    else {
      carte.style.transition = "transform 0.18s ease-out";
      carte.style.transform = "";
      window.setTimeout(() => (carte.style.transition = ""), 180);
    }
  };
  carte.addEventListener("pointerup", relacher);
  carte.addEventListener("pointercancel", relacher);
}

/* ══ Revue de fin de mois ══ */

function mediasDuMois(): Media[] {
  return medias.filter((m) => cleMois(m.dateMs) === moisCourant);
}

function ouvrirRevue() {
  montrer("vue-revue");
  // Sur mobile la barre est étroite : le nom du mois suffit, « Revue — » déborde.
  $("#titre-revue").textContent = libelleMois(moisCourant, locale());
  rendreRevue();
}

function rendreRevue() {
  const liste = mediasDuMois();
  const gardees = liste.filter((m) => etat.decisions[m.id] === "garder");
  const jetees = liste.filter((m) => etat.decisions[m.id] === "jeter");

  $("#bilan-revue").textContent = t("revue.bilan", {
    g: gardees.length,
    j: jetees.length,
    t: formaterTaille(jetees.reduce((s, m) => s + m.taille, 0)),
  });

  remplirGrille($("#grille-gardees"), gardees, "garder");
  remplirGrille($("#grille-jetees"), jetees, "jeter");
}

function remplirGrille(hote: HTMLElement, liste: Media[], classe: string) {
  hote.textContent = "";
  for (const m of liste) {
    hote.append(
      creerVignette(m, classe, () => {
        // Cliquer sur une vignette inverse la décision, comme sur le desktop.
        etat.decisions[m.id] = etat.decisions[m.id] === "garder" ? "jeter" : "garder";
        void backend.ecrireEtat(etat);
        rendreRevue();
      }),
    );
  }
}

function creerVignette(m: Media, classe: string, auClic?: () => void): HTMLElement {
  const el = document.createElement("div");
  el.className = `vignette ${classe}`;
  el.title = m.nom;

  const img = document.createElement("img");
  img.alt = "";
  img.loading = "lazy";
  chargerVignette(img, m, 200);
  el.append(img);

  if (m.video) {
    const marque = document.createElement("span");
    marque.className = "marque-video";
    marque.textContent = t("vignette.video");
    el.append(marque);
  }
  if (auClic) el.addEventListener("click", auClic);
  return el;
}

async function validerMois() {
  const liste = mediasDuMois();
  const nonDecides = liste.filter((m) => !etat.decisions[m.id]).length;
  if (nonDecides > 0) {
    await informer(t("revue.nonDecides", { n: nonDecides }));
    return;
  }

  const jetees = liste.filter((m) => etat.decisions[m.id] === "jeter");
  const octets = jetees.reduce((s, m) => s + m.taille, 0);

  chargement(t("chargement.validation"));
  // Une seule confirmation système pour tout le mois : createTrashRequest accepte
  // jusqu'à 2000 URIs d'un coup.
  const misCorbeille = await backend.mettreCorbeille(jetees.map((m) => m.id));
  chargement(null);

  // L'utilisateur peut refuser la boîte système : dans ce cas on ne valide rien.
  if (jetees.length > 0 && misCorbeille === 0) return;

  if (!etat.moisFaits.includes(moisCourant)) etat.moisFaits.push(moisCourant);
  const partis = new Set(jetees.map((m) => m.id));
  medias = medias.filter((m) => !partis.has(m.id));
  await backend.ecrireEtat(etat);

  enregistrerSuppression(misCorbeille);
  void envoyerTelemetrie();

  await informer(t("valide.texte", { n: misCorbeille, t: formaterTaille(octets) }));
  afficherMois();

  // Jalons de soutien, mêmes seuils que le desktop : tous les 6 mois validés,
  // ou quand il n'y a plus aucun mois à trier — jamais après une simple
  // validation isolée, pour ne pas être insistant.
  const toutFait = grouper().every((g) => etat.moisFaits.includes(g.cle));
  if (etat.moisFaits.length % 6 === 0 || toutFait) {
    if (await confirmer(t("kofi.texte"))) {
      $<HTMLAnchorElement>("#lien-kofi").click();
    }
  }
}

/* ══ Corbeille ══ */

async function ouvrirCorbeille() {
  montrer("vue-corbeille");
  $(".aide-corbeille").textContent = estDemo
    ? t("corbeille.aide")
    : t("mobile.corbeilleSysteme");
  await rendreCorbeille();
}

async function rendreCorbeille() {
  const liste = await backend.listerCorbeille();
  $("#bilan-corbeille").textContent =
    liste.length === 0
      ? t("corbeille.vide")
      : t("corbeille.bilan", {
          n: liste.length,
          t: formaterTaille(liste.reduce((s, m) => s + m.taille, 0)),
        });

  const grille = $("#grille-corbeille");
  grille.textContent = "";
  if (liste.length === 0) {
    const vide = document.createElement("p");
    vide.className = "aide-revue";
    vide.textContent = t("corbeille.videGrille");
    grille.append(vide);
    return;
  }
  for (const m of liste) grille.append(creerVignette(m, ""));
}

async function restaurerTout() {
  const liste = await backend.listerCorbeille();
  if (liste.length === 0) return;
  const n = await backend.restaurer(liste.map((m) => m.id));

  // Les médias restaurés redeviennent à trier : on efface leur décision.
  for (const m of liste) delete etat.decisions[m.id];
  etat.moisFaits = etat.moisFaits.filter(
    (cle) => !liste.some((m) => cleMois(m.dateMs) === cle),
  );
  await backend.ecrireEtat(etat);

  await informer(t("corbeille.restaures", { n }));
  await chargerPhototheque();
}

async function viderCorbeille() {
  const liste = await backend.listerCorbeille();
  if (liste.length === 0) return;
  if (!(await confirmer(t("corbeille.vider") + " ?", { danger: true }))) return;
  await backend.supprimerDefinitivement(liste.map((m) => m.id));
  await rendreCorbeille();
}

void demarrer();
