import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

/* ═══ Types ═══ */

interface Media {
  rel: string;
  taille: number;
  mtime_ms: number;
  mois: string;
  video: boolean;
}

interface Etat {
  decisions: Record<string, "garder" | "jeter">;
  mois_valides: string[];
  raccourcis: Record<string, string>;
}

/* ═══ État global ═══ */

let racine = "";
let medias: Media[] = [];
let etat: Etat = { decisions: {}, mois_valides: [], raccourcis: {} };
let moisCourant = "";
let file: Media[] = []; // fichiers restants à trier dans le mois courant
let historique: string[] = []; // rels décidés (pour Annuler)

const RACCOURCIS_DEFAUT: Record<string, string> = {
  garder: "ArrowRight",
  jeter: "ArrowLeft",
  annuler: "Backspace",
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

function nomMois(cle: string): string {
  const [a, m] = cle.split("-").map(Number);
  return new Date(a, m - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function src(rel: string): string {
  return convertFileSrc(`${racine}/${rel}`);
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

/* ═══ Accueil ═══ */

async function ouvrirDossier(chemin: string) {
  racine = chemin;
  localStorage.setItem("krino-dernier", chemin);
  medias = await invoke<Media[]>("scanner", { racine });
  etat = await invoke<Etat>("lire_etat", { racine });
  $("#titre-dossier").textContent = `${chemin} — ${medias.length} fichiers`;
  afficherVue("vue-mois");
  rendreMois();
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
    if (!groupes.has(m.mois)) groupes.set(m.mois, []);
    groupes.get(m.mois)!.push(m);
  }
  return [...groupes.entries()].map(([cle, fichiers]) => ({
    cle,
    fichiers,
    taille: fichiers.reduce((s, f) => s + f.taille, 0),
    decides: fichiers.filter((f) => etat.decisions[f.rel]).length,
    valide: etat.mois_valides.includes(cle),
  }));
}

function rendreMois() {
  const tri = ($("#tri-mois") as unknown as HTMLSelectElement).value;
  const masquerFaits = ($("#masquer-faits") as unknown as HTMLInputElement).checked;
  let liste = statsParMois();
  if (masquerFaits) liste = liste.filter((s) => !s.valide);
  liste.sort((a, b) => {
    switch (tri) {
      case "chrono-inv": return b.cle.localeCompare(a.cle);
      case "taille": return b.taille - a.taille;
      case "nombre": return b.fichiers.length - a.fichiers.length;
      case "restants": return (b.fichiers.length - b.decides) - (a.fichiers.length - a.decides);
      default: return a.cle.localeCompare(b.cle);
    }
  });

  const grille = $("#grille-mois");
  grille.innerHTML = "";
  for (const s of liste) {
    const carte = document.createElement("div");
    carte.className = "carte-mois" + (s.valide ? " fait" : "");
    const pct = s.fichiers.length ? Math.round((100 * s.decides) / s.fichiers.length) : 0;
    carte.innerHTML = `
      <h3>${nomMois(s.cle)}</h3>
      <div class="stats">${s.fichiers.length} fichiers · ${tailleLisible(s.taille)}</div>
      <div class="jauge"><div style="width:${pct}%"></div></div>
      <div class="stats">${s.valide ? '<span class="etiquette-fait">✔ Fait</span>' : `${s.decides}/${s.fichiers.length} décidés`}</div>
    `;
    if (s.valide) {
      const btn = document.createElement("button");
      btn.className = "btn refaire";
      btn.textContent = "↻ Refaire ce mois";
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
    grille.appendChild(carte);
  }
}

/* ═══ Vue tri ═══ */

function ouvrirMois(cle: string) {
  moisCourant = cle;
  historique = [];
  const fichiers = medias
    .filter((m) => m.mois === cle)
    .sort((a, b) => a.mtime_ms - b.mtime_ms);
  file = fichiers.filter((m) => !etat.decisions[m.rel]);
  $("#titre-tri").textContent = nomMois(cle);
  afficherVue("vue-tri");
  rendreCarte();
}

function courant(): Media | undefined {
  return file[0];
}

function rendreCarte() {
  const total = medias.filter((m) => m.mois === moisCourant).length;
  $("#progression-tri").textContent = `${total - file.length}/${total}`;
  const img = $("#apercu-img") as unknown as HTMLImageElement;
  const video = $("#apercu-video") as unknown as HTMLVideoElement;
  const carte = $("#carte");
  const m = courant();
  $("#fin-mois").hidden = !!m;
  carte.hidden = !m;
  if (!m) { video.pause(); video.removeAttribute("src"); return; }

  carte.style.transform = "";
  if (m.video) {
    img.hidden = true;
    video.hidden = false;
    video.src = src(m.rel);
    video.play().catch(() => {});
  } else {
    video.pause();
    video.hidden = true;
    img.hidden = false;
    img.src = src(m.rel);
  }
  const date = new Date(m.mtime_ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  $("#info-fichier").textContent = `${m.rel.split("/").pop()} · ${tailleLisible(m.taille)} · ${date}`;

  // Précharge les 2 images suivantes pour un enchaînement instantané
  for (const suivant of file.slice(1, 3)) {
    if (!suivant.video) new Image().src = src(suivant.rel);
  }
}

async function decider(action: "garder" | "jeter", animer = true) {
  const m = courant();
  if (!m) return;
  etat.decisions[m.rel] = action;
  historique.push(m.rel);
  file.shift();
  if (animer) {
    const carte = $("#carte");
    const dir = action === "garder" ? 1 : -1;
    carte.style.transition = "transform 0.22s ease-in, opacity 0.22s";
    carte.style.transform = `translateX(${dir * window.innerWidth}px) rotate(${dir * 18}deg)`;
    carte.style.opacity = "0";
    setTimeout(() => {
      carte.style.transition = "";
      carte.style.opacity = "1";
      rendreCarte();
    }, 200);
  } else {
    rendreCarte();
  }
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

/* ── Swipe (pointeur : souris, tactile, pavé) ── */

function installerSwipe() {
  const carte = $("#carte");
  const badgeG = $("#badge-garder");
  const badgeJ = $("#badge-jeter");
  let x0 = 0, dx = 0, actif = false;
  const SEUIL = 120;

  carte.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).tagName === "VIDEO") return; // laisser les contrôles vidéo
    actif = true; x0 = e.clientX; dx = 0;
    carte.classList.add("saisi");
    carte.setPointerCapture(e.pointerId);
  });
  carte.addEventListener("pointermove", (e) => {
    if (!actif) return;
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
    if (dx > SEUIL) decider("garder");
    else if (dx < -SEUIL) decider("jeter");
    else carte.style.transform = "";
  };
  carte.addEventListener("pointerup", relacher);
  carte.addEventListener("pointercancel", relacher);
}

/* ═══ Vue revue ═══ */

function rendreRevue() {
  const fichiers = medias.filter((m) => m.mois === moisCourant);
  const gardees = fichiers.filter((m) => etat.decisions[m.rel] === "garder");
  const jetees = fichiers.filter((m) => etat.decisions[m.rel] === "jeter");
  $("#titre-revue").textContent = `Revue — ${nomMois(moisCourant)}`;
  const octetsJetes = jetees.reduce((s, f) => s + f.taille, 0);
  $("#bilan-revue").textContent =
    `${gardees.length} gardées · ${jetees.length} jetées (${tailleLisible(octetsJetes)} à libérer)`;

  const rendreGrille = (conteneur: HTMLElement, liste: Media[]) => {
    conteneur.innerHTML = "";
    for (const m of liste) {
      const v = document.createElement("div");
      v.className = "vignette";
      v.title = m.rel;
      if (m.video) {
        v.innerHTML = `<video src="${src(m.rel)}" preload="metadata" muted></video><span class="duree">🎬</span>`;
      } else {
        v.innerHTML = `<img src="${src(m.rel)}" loading="lazy" alt="">`;
      }
      v.addEventListener("click", async () => {
        etat.decisions[m.rel] = etat.decisions[m.rel] === "garder" ? "jeter" : "garder";
        await sauver();
        rendreRevue();
      });
      conteneur.appendChild(v);
    }
  };
  rendreGrille($("#grille-gardees"), gardees);
  rendreGrille($("#grille-jetees"), jetees);
}

async function validerMois() {
  const fichiers = medias.filter((m) => m.mois === moisCourant);
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
  // Les fichiers jetés ne sont plus dans le dossier : on les retire de la liste
  const relsJetes = new Set(jetees.map((m) => m.rel));
  medias = medias.filter((m) => !relsJetes.has(m.rel));
  afficherVue("vue-mois");
  rendreMois();
}

/* ═══ Corbeille ═══ */

async function ouvrirCorbeille() {
  const info = await invoke<{ fichiers: number; octets: number }>("info_corbeille", { racine });
  $("#detail-corbeille").textContent = info.fichiers
    ? `${info.fichiers} fichiers · ${tailleLisible(info.octets)} récupérables.`
    : "La corbeille est vide.";
  ($("#modale-corbeille") as unknown as HTMLDialogElement).showModal();
}

/* ═══ Raccourcis ═══ */

function rendreEtiquettesRaccourcis() {
  const joli = (t: string) =>
    t.replace("Arrow", "").replace("Right", "→").replace("Left", "←")
     .replace("Up", "↑").replace("Down", "↓").replace("Backspace", "⌫").replace(" ", "Espace");
  $("#kbd-garder").textContent = joli(raccourci("garder"));
  $("#kbd-jeter").textContent = joli(raccourci("jeter"));
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".touche")) {
    btn.textContent = joli(raccourci(btn.dataset.action!));
  }
}

function installerModaleRaccourcis() {
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
}

function installerClavier() {
  window.addEventListener("keydown", (e) => {
    if ($("#vue-tri").hidden) return; // seulement en vue tri
    if ((document.querySelector("dialog[open]"))) return;
    if (e.key === raccourci("garder")) { e.preventDefault(); decider("garder"); }
    else if (e.key === raccourci("jeter")) { e.preventDefault(); decider("jeter"); }
    else if (e.key === raccourci("annuler")) { e.preventDefault(); annuler(); }
  });
}

/* ═══ Câblage ═══ */

window.addEventListener("DOMContentLoaded", () => {
  // Accueil
  $("#btn-choisir").addEventListener("click", choisirDossier);
  const dernier = localStorage.getItem("krino-dernier");
  if (dernier) {
    const btn = $("#btn-dernier") as unknown as HTMLButtonElement;
    btn.hidden = false;
    btn.textContent = `↻ Reprendre : ${dernier}`;
    btn.addEventListener("click", () => ouvrirDossier(dernier));
  }

  // Vue mois
  $("#btn-retour-accueil").addEventListener("click", () => afficherVue("vue-accueil"));
  $("#tri-mois").addEventListener("change", rendreMois);
  $("#masquer-faits").addEventListener("change", rendreMois);
  $("#btn-corbeille").addEventListener("click", ouvrirCorbeille);
  $("#btn-raccourcis").addEventListener("click", () =>
    ($("#modale-raccourcis") as unknown as HTMLDialogElement).showModal());
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
  $("#btn-revue").addEventListener("click", () => { afficherVue("vue-revue"); rendreRevue(); });
  $("#btn-fin-revue").addEventListener("click", () => { afficherVue("vue-revue"); rendreRevue(); });
  installerSwipe();

  // Vue revue
  $("#btn-retour-tri").addEventListener("click", () => ouvrirMois(moisCourant));
  $("#btn-valider-mois").addEventListener("click", validerMois);

  // Corbeille
  $("#btn-vider").addEventListener("click", async () => {
    if (!confirm("Vider la corbeille DÉFINITIVEMENT ? Cette action est irréversible.")) return;
    await invoke("vider_corbeille", { racine });
    ($("#modale-corbeille") as unknown as HTMLDialogElement).close();
  });
  $("#btn-restaurer").addEventListener("click", async () => {
    const n = await invoke<number>("restaurer_corbeille", { racine });
    alert(`${n} fichiers restaurés.`);
    ($("#modale-corbeille") as unknown as HTMLDialogElement).close();
    await ouvrirDossier(racine); // rescanner
  });

  // Fermeture des modales
  for (const btn of document.querySelectorAll<HTMLButtonElement>("dialog .fermer")) {
    btn.addEventListener("click", () => btn.closest("dialog")!.close());
  }

  installerModaleRaccourcis();
  installerClavier();
  rendreEtiquettesRaccourcis();
});
