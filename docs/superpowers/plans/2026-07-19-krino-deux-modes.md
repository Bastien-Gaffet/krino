# Krino v0.8 — Deux modes Trier/Organiser : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructurer Krino en deux espaces (Trier / Organiser) reliés par une barre latérale permanente, avec galerie complète (re-décision sans reset), sélection multiple + drag & drop vers les albums, et dialogues maison remplaçant tous les popups natifs.

**Architecture:** Frontend vanilla TS (pas de framework) dans `src/main.ts` + nouveau module autonome `src/dialogues.ts`. Aucun nouveau backend Rust : la galerie lit `medias`, la corbeille réutilise `valider_mois`, l'export `exporter_album`. Pas de harnais de test dans ce repo : chaque tâche est validée par `npm run build` (tsc strict) puis vérification dans `npm run tauri dev`, et commitée.

**Tech Stack:** Tauri 2, TypeScript strict, Vite, CSS variables (thème clair/sombre existant), i18n maison (`src/i18n.ts`, clés fr/en obligatoires).

**Référence :** spec `docs/superpowers/specs/2026-07-19-krino-deux-modes-design.md`.

**Règles transverses (chaque tâche) :**
- Toute chaîne visible passe par `t("cle")` avec entrée FR **et** EN dans `src/i18n.ts`.
- `npm run build` doit passer sans erreur avant chaque commit.
- Commits en français, suffixés `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1 : Module `dialogues.ts` (confirmer / demander / informer)

**Files:**
- Create: `src/dialogues.ts`
- Modify: `index.html` (ajout du `<dialog id="dialogue-krino">` avant `#chargement`)
- Modify: `src/styles.css` (styles du dialogue)

- [ ] **Step 1 : Créer `src/dialogues.ts`**

```ts
/* Dialogues Krino : remplacent alert/confirm/prompt natifs (centrés, thème,
   pas de mention localhost). Un seul <dialog> réutilisé, API à Promise. */

type Options = { danger?: boolean; valeurInitiale?: string };

function elements() {
  const dlg = document.getElementById("dialogue-krino") as HTMLDialogElement;
  return {
    dlg,
    texte: dlg.querySelector(".dialogue-texte") as HTMLElement,
    champ: dlg.querySelector(".dialogue-champ") as HTMLInputElement,
    ok: dlg.querySelector(".dialogue-ok") as HTMLButtonElement,
    annuler: dlg.querySelector(".dialogue-annuler") as HTMLButtonElement,
  };
}

function ouvrir(message: string, mode: "confirmer" | "demander" | "informer",
                opts: Options = {}): Promise<string | null> {
  const { dlg, texte, champ, ok, annuler } = elements();
  texte.textContent = message;
  champ.hidden = mode !== "demander";
  champ.value = opts.valeurInitiale ?? "";
  annuler.hidden = mode === "informer";
  ok.classList.toggle("btn-danger", !!opts.danger);
  return new Promise((resoudre) => {
    const fermer = (valeur: string | null) => {
      ok.onclick = annuler.onclick = null;
      dlg.onclose = null;
      if (dlg.open) dlg.close();
      resoudre(valeur);
    };
    ok.onclick = () => fermer(mode === "demander" ? champ.value.trim() : "ok");
    annuler.onclick = () => fermer(null);
    dlg.onclose = () => fermer(null); // Échap
    champ.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); ok.click(); } };
    dlg.showModal();
    if (mode === "demander") champ.focus();
    else ok.focus();
  });
}

/** confirm() maison — résout true si confirmé. */
export async function confirmer(message: string, opts: Options = {}): Promise<boolean> {
  return (await ouvrir(message, "confirmer", opts)) !== null;
}

/** prompt() maison — résout la saisie (trim) ou null si annulé/vide. */
export async function demander(message: string, opts: Options = {}): Promise<string | null> {
  const v = await ouvrir(message, "demander", opts);
  return v ? v : null;
}

/** alert() maison. */
export async function informer(message: string): Promise<void> {
  await ouvrir(message, "informer");
}
```

- [ ] **Step 2 : Ajouter le HTML dans `index.html`** (juste avant `<!-- ═══ Superposition de chargement ═══ -->`)

```html
    <!-- ═══ Dialogue Krino (confirmations, saisies, messages) ═══ -->
    <dialog id="dialogue-krino" class="dialogue-krino">
      <p class="dialogue-texte"></p>
      <input class="dialogue-champ" type="text" hidden />
      <div class="rangee-boutons">
        <button class="btn dialogue-annuler" data-i18n="dialogue.annuler"></button>
        <button class="btn btn-primaire dialogue-ok" data-i18n="dialogue.ok"></button>
      </div>
    </dialog>
```

- [ ] **Step 3 : Styles dans `src/styles.css`** (à la fin ; les `<dialog>` existants sont déjà centrés par le navigateur, on garantit ici largeur + thème)

```css
/* ═══ Dialogue Krino ═══ */
.dialogue-krino { min-width: min(420px, 90vw); max-width: 560px; }
.dialogue-krino .dialogue-texte { white-space: pre-line; margin: 0 0 1rem; line-height: 1.45; }
.dialogue-krino .dialogue-champ {
  width: 100%; box-sizing: border-box; margin-bottom: 1rem;
  padding: 8px 10px; border-radius: 8px;
  border: 1px solid var(--bord); background: var(--fond); color: var(--texte);
}
```

- [ ] **Step 4 : Clés i18n** — dans `src/i18n.ts`, ajouter aux deux dicos :
FR : `"dialogue.ok": "OK"`, `"dialogue.annuler": "Annuler"` ; EN : `"dialogue.ok": "OK"`, `"dialogue.annuler": "Cancel"`.

- [ ] **Step 5 : Vérifier** — `npm run build` → `✓ built`. Dans l'appli dev, aucun changement visible encore.

- [ ] **Step 6 : Commit** — `git add -A && git commit -m "Dialogues Krino : composant confirmer/demander/informer"`

---

### Task 2 : Remplacer tous les popups natifs

**Files:**
- Modify: `src/main.ts` (tous les `alert(`, `confirm(`, `prompt(`)

- [ ] **Step 1 : Importer** en tête de `main.ts` : `import { confirmer, demander, informer } from "./dialogues";`

- [ ] **Step 2 : Remplacer mécaniquement** chaque appel natif. Règles :
  - `alert(x)` → `await informer(x)` (la fonction englobante devient `async` si besoin ; dans un `catch` non-async, `void informer(x)`).
  - `if (!confirm(x)) return;` → `if (!(await confirmer(x))) return;` — fonctions à passer `async` : le handler de `refaire` dans `carteDeMois`, `garderLeReste`, `validerMois` (déjà async), handlers `#btn-reset-tout`, `#btn-vider`, `appliquerDoublons` (déjà async), `lancerRangement`, `annulerDernierRangement`, `installerAlbums` (handlers suppression/export), `#btn-annuler-tache`, `tutoriel confirm.tuto` (`cgu` close handler devient async), `appliquerRafale` n'a pas de confirm.
  - `prompt(t("albums.nomNouveau"))` → `await demander(t("albums.nomNouveau"))`.
  - Confirmations destructives (`confirm.vider`, `confirm.reset`, `confirm.doublons`, `confirm.supprimerAlbum`) → passer `{ danger: true }`.
- Vérification d'exhaustivité : `grep -n "alert(\|confirm(\|prompt(" src/main.ts` ne doit plus renvoyer que des définitions de `confirmer/…` (aucun appel natif).

- [ ] **Step 3 : Vérifier** — build OK ; dans l'appli dev : Réglages → reset global affiche le dialogue Krino centré, Échap annule, Entrée valide ; création d'album affiche le champ de saisie sans mention localhost.

- [ ] **Step 4 : Commit** — `"Plus aucun popup natif : tout passe par les dialogues Krino"`

---

### Task 3 : Barre latérale permanente

**Files:**
- Modify: `index.html` (structure globale + suppression des onglets Outils)
- Modify: `src/styles.css`
- Modify: `src/main.ts` (navigation)
- Modify: `src/i18n.ts`

- [ ] **Step 1 : Restructurer `index.html`.** Envelopper toutes les sections `.vue` SAUF `#vue-accueil` dans :

```html
    <div id="cadre-app" class="cadre-app" hidden>
      <nav id="barre-laterale" class="barre-laterale">
        <div class="marque-krino">KRINO</div>
        <div id="nav-dossier" class="nav-dossier"></div>
        <button class="nav-item actif" data-vue="vue-mois" data-i18n="nav.trier"></button>
        <button class="nav-item" data-vue="vue-galerie" data-i18n="nav.galerie"></button>
        <div class="nav-titre" data-i18n="nav.albums"></div>
        <div id="nav-albums"></div>
        <button id="nav-nouvel-album" class="nav-item discret" data-i18n="albums.nouveau"></button>
        <button class="nav-item" data-vue="vue-doublons" data-i18n="outils.ongletDoublons"></button>
        <button class="nav-item" data-vue="vue-rangement" data-i18n="outils.ongletRangement"></button>
        <span class="espace"></span>
        <button class="nav-item" data-vue="vue-corbeille" data-i18n="mois.corbeille"></button>
        <button id="nav-reglages" class="nav-item" data-i18n="mois.reglages"></button>
      </nav>
      <main class="contenu-app">
        <!-- toutes les .vue existantes ici, sauf vue-accueil -->
      </main>
    </div>
```

Puis :
- Découper l'ancienne `#vue-outils` en deux sections : `#vue-doublons` (contenu de `#mod-doublons` + la barre `#bilan-doublons`/`#btn-appliquer-doublons`) et `#vue-rangement` (contenu de `#mod-rangement`). Supprimer la `nav.onglets`, `#mod-albums` (remplacé par la galerie filtrée, Task 6), `#btn-retour-outils`, `#btn-outils`.
- Dans la barre de `#vue-mois`, supprimer les boutons `#btn-outils`, `#btn-corbeille`, `#btn-reglages`, `#btn-reset-tout` (corbeille/réglages vivent dans la barre latérale ; le reset global devient un bouton dans la modale Réglages, section Aide : `<button id="btn-reset-tout" class="btn btn-danger-leger" data-i18n="mois.reset"></button>` à côté de `#btn-revoir-tuto`).

- [ ] **Step 2 : CSS** (fin de `styles.css`) :

```css
/* ═══ Barre latérale ═══ */
.cadre-app { display: flex; height: 100vh; }
.barre-laterale {
  width: 200px; flex-shrink: 0; display: flex; flex-direction: column;
  gap: 2px; padding: 12px 8px; border-right: 1px solid var(--bord);
  background: var(--panneau); overflow-y: auto;
}
.contenu-app { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.contenu-app .vue { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.marque-krino { font-weight: 800; letter-spacing: 2px; padding: 4px 10px; }
.nav-dossier { font-size: .72rem; color: var(--sourd); padding: 0 10px 10px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav-item { text-align: left; border: none; background: none; color: var(--texte);
  padding: 7px 10px; border-radius: 8px; cursor: pointer; font-size: .92rem; }
.nav-item:hover { background: var(--voile); }
.nav-item.actif { background: var(--accent); color: #fff; }
.nav-item.discret { color: var(--sourd); font-size: .8rem; }
.nav-titre { font-size: .7rem; text-transform: uppercase; letter-spacing: 1px;
  color: var(--sourd); padding: 10px 10px 2px; }
.nav-album.drop-cible { outline: 2px dashed var(--accent); }
body.plein-ecran .barre-laterale { display: none; }
```

(La règle existante `body.plein-ecran #vue-tri .barre { display:none; }` reste.)

- [ ] **Step 3 : Navigation dans `main.ts`.**

```ts
function activerNav(vue: string) {
  for (const b of document.querySelectorAll<HTMLButtonElement>(".nav-item[data-vue]")) {
    b.classList.toggle("actif", b.dataset.vue === vue);
  }
}
function allerA(vue: string) {
  afficherVue(vue);
  activerNav(vue);
  if (vue === "vue-mois") rendreMois();
  else if (vue === "vue-galerie") rendreGalerie();      // Task 4
  else if (vue === "vue-corbeille") void rendreCorbeille();
}
```

Câblage (DOMContentLoaded) : chaque `.nav-item[data-vue]` → `allerA(btn.dataset.vue!)` ; `#nav-reglages` → `ouvrirReglages()` ; `#nav-nouvel-album` → création d'album via `demander` puis `rendreNavAlbums()` (Task 6). `ouvrirDossier` : afficher `#cadre-app` (`hidden=false`), masquer `#vue-accueil`, remplir `#nav-dossier` avec le nom du dossier (`title` = chemin complet), puis `allerA("vue-mois")`. Retour à l'accueil : masquer `#cadre-app` (bouton `#btn-retour-accueil` conservé dans la barre de `#vue-mois`). `afficherVue`/`vueActive` inchangés (les `.vue` restent frères dans `.contenu-app`). Adapter `rendreCorbeille` (elle appelait `afficherVue` elle-même : la faire passer par `activerNav("vue-corbeille")` aussi quand appelée directement). Échap (installerClavier) : dans galerie/doublons/rangement/corbeille → `allerA("vue-mois")`.
Supprimer : les handlers des onglets `.onglet`, `#btn-outils`, `#btn-retour-outils` ; déplacer le handler `#btn-reset-tout` tel quel (il vit maintenant dans la modale Réglages).

- [ ] **Step 4 : i18n** — FR : `"nav.trier": "Trier"`, `"nav.galerie": "Galerie"`, `"nav.albums": "Albums"` ; EN : `"Sort"`, `"Gallery"`, `"Albums"`.

- [ ] **Step 5 : Vérifier** — build OK ; appli dev : la barre latérale apparaît après ouverture d'un dossier, sections Trier/Doublons/Rangement/Corbeille fonctionnelles, section active surlignée, F11 en tri replie la barre, Échap revient à Trier, Réglages contient le reset global.

- [ ] **Step 6 : Commit** — `"Barre latérale permanente : navigation Trier/Galerie/Albums/Doublons/Rangement/Corbeille"`

---

### Task 4 : Galerie (grille chronologique, filtres, badges, lazy)

**Files:**
- Modify: `index.html` (nouvelle `#vue-galerie` dans `.contenu-app`)
- Modify: `src/main.ts`
- Modify: `src/styles.css`, `src/i18n.ts`

- [ ] **Step 1 : HTML `#vue-galerie`** (après `#vue-mois`) :

```html
    <section id="vue-galerie" class="vue" hidden>
      <header class="barre">
        <span class="titre-dossier" id="titre-galerie"></span>
        <select id="filtre-galerie" class="btn">
          <option value="tout" data-i18n="galerie.tout"></option>
          <option value="nontriees" data-i18n="galerie.nonTriees"></option>
          <option value="gardees" data-i18n="galerie.gardees"></option>
          <option value="favoris" data-i18n="galerie.favoris"></option>
          <option value="videos" data-i18n="galerie.videos"></option>
        </select>
        <select id="saut-galerie" class="btn"></select>
        <input id="taille-galerie" type="range" min="90" max="260" value="150" />
        <span class="espace"></span>
        <span id="bilan-galerie" class="progression"></span>
      </header>
      <div id="defil-galerie" class="defilable">
        <div id="sections-galerie"></div>
      </div>
      <div id="barre-selection" class="barre-selection" hidden>
        <span id="bilan-selection"></span>
        <button id="sel-favori" class="btn">&#9733; <span data-i18n="galerie.favori"></span></button>
        <select id="sel-album-cible" class="btn"></select>
        <button id="sel-ajouter" class="btn" data-i18n="albums.ajouterA"></button>
        <button id="sel-retirer" class="btn" data-i18n="albums.retirer" hidden></button>
        <button id="sel-corbeille" class="btn btn-danger-leger" data-i18n="mois.corbeille"></button>
        <button id="sel-annuler" class="btn" data-i18n="galerie.annulerSel"></button>
      </div>
    </section>
```

- [ ] **Step 2 : Rendu dans `main.ts`.** État galerie + rendu par sections, miniatures chargées **à l'apparition** via un seul `IntersectionObserver` (jamais 8 000 requêtes d'un coup) :

```ts
/* ═══ Galerie ═══ */
let albumOuvert: string | null = null; // null = galerie complète ; sinon nom d'album ou ALBUM_FAVORIS
let selectionGalerie = new Set<string>();
let ancreSelection: string | null = null; // pour Maj+clic

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
  // Saut rapide par mois
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
    v.innerHTML = `<video src="${convertFileSrc(src(m.rel))}#t=0.1" preload="none" muted></video><span class="marque">${t("vignette.video")}</span>`;
    // preload=none : la frame n'est chargée qu'à l'apparition
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
  const dec = etat.decisions[m.rel];
  if (etat.favoris.includes(m.rel)) badges.append("★");
  if (!dec) badges.append(badges.textContent ? " ·" : "", t("galerie.badgeNonTriee"));
  v.appendChild(badges);
  v.addEventListener("click", (e) => clicVignette(m.rel, e));       // Task 5
  v.addEventListener("dblclick", () => ouvrirVisionneuse(m.rel));    // Task 5
  v.draggable = true;
  v.addEventListener("dragstart", (e) => demarrerDrag(m.rel, e));    // Task 7
  return v;
}

function observateurVideo(video: HTMLVideoElement) {
  const obs = new IntersectionObserver((ent) => {
    if (ent[0].isIntersecting) { video.preload = "metadata"; obs.disconnect(); }
  }, { rootMargin: "600px" });
  obs.observe(video);
}
```

Câblage : `#filtre-galerie` et `#taille-galerie` → `rendreGalerie()` (input du range : ne relancer que `setProperty`) ; `#saut-galerie` change → `document.getElementById(valeur)?.scrollIntoView()`.

- [ ] **Step 3 : CSS**

```css
/* ═══ Galerie ═══ */
#sections-galerie .grille-vignettes {
  grid-template-columns: repeat(auto-fill, minmax(var(--taille-vignette, 150px), 1fr));
}
.vignette-galerie.selectionnee { outline: 3px solid var(--accent); }
.badges-galerie { position: absolute; top: 4px; left: 6px; font-size: .68rem;
  color: #fff; text-shadow: 0 1px 3px #000; pointer-events: none; }
.barre-selection { display: flex; gap: 10px; align-items: center; justify-content: center;
  padding: 10px; border-top: 1px solid var(--bord); background: var(--panneau); }
```

(Vérifier que `.grille-vignettes` utilise déjà `grid` ; sinon reprendre ses colonnes avec la variable.)

- [ ] **Step 4 : i18n** — FR : `"galerie.tout": "Tout"`, `"galerie.nonTriees": "Non triées"`, `"galerie.gardees": "Gardées"`, `"galerie.favoris": "Favoris"`, `"galerie.videos": "Vidéos"`, `"galerie.bilan": "{n} fichiers"`, `"galerie.badgeNonTriee": "à trier"`, `"galerie.favori": "Favori"`, `"galerie.annulerSel": "Annuler la sélection"` + EN équivalents (`"All"`, `"Unsorted"`, `"Kept"`, `"Favorites"`, `"Videos"`, `"{n} files"`, `"to sort"`, `"Favorite"`, `"Clear selection"`).

- [ ] **Step 5 : Vérifier** — build OK ; galerie fluide sur main_tri (8 000+ fichiers), défilement sans blocage, filtres et saut par mois fonctionnels, badges corrects.

- [ ] **Step 6 : Commit** — `"Galerie chronologique : filtres, badges, miniatures lazy par IntersectionObserver"`

---

### Task 5 : Sélection multiple + visionneuse + barre d'action

**Files:**
- Modify: `src/main.ts`, `index.html` (visionneuse), `src/styles.css`, `src/i18n.ts`

- [ ] **Step 1 : Sélection dans `main.ts`.**

```ts
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
```

**Rectangle de sélection** (pointerdown sur le fond de `#defil-galerie`, pas sur une vignette) : créer un `<div class="rectangle-selection">` positionné en absolu dans `#defil-galerie` (position: relative), suivre pointermove, à chaque frame ajouter à la sélection les vignettes dont le `getBoundingClientRect()` intersecte le rectangle (sans Ctrl : repartir d'une sélection vide au pointerdown), pointerup détruit le rectangle. **Ctrl+A** (clavier, vue-galerie) : sélectionner `mediasGalerie()` entier. **Échap** : si sélection non vide, la vider (sinon comportement Task 3).

- [ ] **Step 2 : Visionneuse.** HTML (avant le dialogue Krino) :

```html
    <div id="visionneuse" class="visionneuse" hidden>
      <button id="vis-fermer" class="btn btn-ico vis-fermer">&times;</button>
      <button id="vis-prec" class="btn btn-ico vis-nav vis-prec">&larr;</button>
      <img id="vis-img" alt="" hidden />
      <video id="vis-video" controls hidden></video>
      <button id="vis-suiv" class="btn btn-ico vis-nav vis-suiv">&rarr;</button>
      <div id="vis-legende" class="vis-legende"></div>
    </div>
```

```ts
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
```

Clavier quand `#visionneuse` visible (prioritaire dans `installerClavier`, avant le test des dialogues) : ←/→ = `visIndex ± 1` (borné) + `montrerVis()`, Échap = fermer, touche favori = bascule le favori du média affiché + `montrerVis()`. Boutons `#vis-prec/#vis-suiv/#vis-fermer` idem. CSS :

```css
.visionneuse { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.92);
  display: flex; align-items: center; justify-content: center; }
.visionneuse img, .visionneuse video { max-width: 92vw; max-height: 88vh; }
.vis-fermer { position: absolute; top: 14px; right: 18px; }
.vis-nav { position: absolute; top: 50%; transform: translateY(-50%); }
.vis-prec { left: 14px; } .vis-suiv { right: 14px; }
.vis-legende { position: absolute; bottom: 12px; left: 0; right: 0;
  text-align: center; color: #ddd; font-size: .85rem; }
.rectangle-selection { position: absolute; border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent); z-index: 5; pointer-events: none; }
```

- [ ] **Step 3 : Actions de la barre.**

```ts
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
  rendreNavAlbums();   // compteurs (Task 6)
  rendreGalerie();
}
```

Câbler `#sel-favori/#sel-ajouter/#sel-retirer/#sel-corbeille` → `actionSelection(...)`, `#sel-annuler` → vider la sélection + `majSelectionVisuelle()`.

- [ ] **Step 4 : Vérifier** — build OK ; clic/Ctrl/Maj/rectangle/Ctrl+A ; double-clic ouvre la visionneuse, flèches naviguent ; « Corbeille » sur 2 photos les retire de la galerie et elles apparaissent dans la Corbeille (restaurables).

- [ ] **Step 5 : Commit** — `"Galerie : sélection multiple (Ctrl/Maj/rectangle), visionneuse, barre d'action (favori/album/corbeille)"`

---

### Task 6 : Albums dans la barre latérale + vue album

**Files:**
- Modify: `src/main.ts`, `src/i18n.ts`, `index.html` (boutons de la vue album)

- [ ] **Step 1 : `rendreNavAlbums()`** — alimente `#nav-albums` :

```ts
function rendreNavAlbums() {
  const conteneur = $("#nav-albums");
  conteneur.innerHTML = "";
  const entree = (nom: string, libelle: string) => {
    const b = document.createElement("button");
    b.className = "nav-item nav-album";
    b.dataset.album = nom;
    b.textContent = libelle;
    b.addEventListener("click", () => {
      albumOuvert = nom;
      allerA("vue-galerie");
    });
    // cibles de drop : Task 7
    conteneur.appendChild(b);
  };
  entree(ALBUM_FAVORIS, t("albums.favoris", { n: etat.favoris.length }));
  for (const nom of Object.keys(etat.albums).sort()) {
    entree(nom, `${nom} (${etat.albums[nom].length})`);
  }
}
```

Appeler `rendreNavAlbums()` dans `ouvrirDossier`, après `sauver()` d'un favori (`basculerFavori`), et après chaque `actionSelection`. Le clic sur « Galerie » dans la nav remet `albumOuvert = null` avant `allerA("vue-galerie")`.

- [ ] **Step 2 : Vue album = galerie filtrée.** Dans la barre de `#vue-galerie`, ajouter deux boutons (visibles seulement si `albumOuvert`) :

```html
        <button id="btn-exporter-album2" class="btn" data-i18n="albums.exporter" hidden></button>
        <button id="btn-supprimer-album2" class="btn btn-danger-leger" data-i18n="albums.supprimer" hidden></button>
```

Dans `rendreGalerie()` : `hidden = !albumOuvert` pour l'export, `hidden = !albumOuvert || albumOuvert === ALBUM_FAVORIS` pour la suppression. Handlers : reprendre la logique existante d'`installerAlbums` — **export** : `confirmer` → loader `albums.exportEnCours` → `invoke("exporter_album", ...)` → `informer(t("albums.exportes", ...))` ; **suppression** : `confirmer(t("confirm.supprimerAlbum", { a }), { danger: true })` → `delete etat.albums[a]` → `albumOuvert = null` → `sauver` → `rendreNavAlbums` + `rendreGalerie`. `#nav-nouvel-album` : `demander(t("albums.nomNouveau"))` → créer → `rendreNavAlbums()` → ouvrir le nouvel album.

- [ ] **Step 3 : Purger l'ancien module.** Supprimer de `main.ts` : `installerAlbums`, `rendreAlbum`, `rendreChoixAlbums`, `majActionsAlbum`, `albumCourant`, `selectionAlbum` et leurs câblages ; de `index.html` : ce qui reste de `#mod-albums` (fait en Task 3, vérifier). `grep -n "mod-albums\|choix-album\|rendreAlbum(" src/main.ts index.html` → aucune occurrence.

- [ ] **Step 4 : Vérifier** — build OK ; albums listés avec compteurs dans la barre, clic ouvre l'album, retirer/export/suppression (avec confirmation Krino) fonctionnent, favoris à jour en direct.

- [ ] **Step 5 : Commit** — `"Albums dans la barre latérale, vue album en galerie filtrée, confirmation de suppression"`

---

### Task 7 : Glisser-déposer vers les albums

**Files:**
- Modify: `src/main.ts`, `src/styles.css`

- [ ] **Step 1 : Drag côté vignettes** (référencé en Task 4) :

```ts
let dragEnCours: string[] = [];
function demarrerDrag(rel: string, e: DragEvent) {
  if (!selectionGalerie.has(rel)) {
    selectionGalerie = new Set([rel]);
    majSelectionVisuelle();
  }
  dragEnCours = [...selectionGalerie];
  const fantome = document.createElement("div");
  fantome.className = "fantome-drag";
  fantome.textContent = t("galerie.fantomeDrag", { n: dragEnCours.length });
  document.body.appendChild(fantome);
  e.dataTransfer!.setDragImage(fantome, 20, 20);
  e.dataTransfer!.effectAllowed = "copy";
  setTimeout(() => fantome.remove());
}
```

- [ ] **Step 2 : Drop côté nav-albums** — dans `rendreNavAlbums`, sur chaque entrée :

```ts
    b.addEventListener("dragover", (e) => { e.preventDefault(); b.classList.add("drop-cible"); });
    b.addEventListener("dragleave", () => b.classList.remove("drop-cible"));
    b.addEventListener("drop", async (e) => {
      e.preventDefault();
      b.classList.remove("drop-cible");
      if (!dragEnCours.length) return;
      if (nom === ALBUM_FAVORIS) {
        etat.favoris = [...new Set([...etat.favoris, ...dragEnCours])];
      } else {
        const liste = etat.albums[nom] ?? (etat.albums[nom] = []);
        for (const r of dragEnCours) if (!liste.includes(r)) liste.push(r);
      }
      dragEnCours = [];
      await sauver();
      rendreNavAlbums();
    });
```

CSS : `.fantome-drag { position: fixed; top: -100px; padding: 6px 12px; background: var(--accent); color: #fff; border-radius: 14px; font-size: .8rem; }`

- [ ] **Step 3 : i18n** — FR `"galerie.fantomeDrag": "{n} photo(s)"` ; EN `"{n} photo(s)"`.

- [ ] **Step 4 : Vérifier** — glisser 1 photo puis une sélection de 5 sur un album : compteur mis à jour, surlignage au survol, pas de doublon dans l'album.

- [ ] **Step 5 : Commit** — `"Glisser-déposer de la sélection vers les albums de la barre latérale"`

---

### Task 8 : Finitions — tutoriel, loaders, version, publication

**Files:**
- Modify: `src/main.ts` (ETAPES_TUTO), `src/i18n.ts` (tuto.*), `README.md`, `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`

- [ ] **Step 1 : Tutoriel** — mettre à jour les cibles déplacées : l'étape qui visait `#btn-revue` reste ; ajouter/adapter une étape pour la barre latérale (`cible: "#barre-laterale"`) avec textes FR/EN (`tuto.*` : mentionner Galerie et albums). Vérifier que chaque `cible` des `ETAPES_TUTO` existe encore dans le DOM (`document.querySelector` ne doit jamais renvoyer null pendant le tuto).

- [ ] **Step 2 : Loaders** — vérifier que les opérations longues affichent le loader : ouverture de galerie/album > 2 000 éléments (`montrerChargement` autour du premier `rendreGalerie` si `mediasGalerie().length > 2000`, puis `cacherChargement` après le premier rendu), export d'album (déjà fait), corbeille de masse (déjà fait).

- [ ] **Step 3 : README** — section Fonctionnalités : remplacer la description « partie Organiser » par les deux modes + galerie + drag & drop.

- [ ] **Step 4 : Version 0.8.0** — `sed` sur `package.json`, `src-tauri/tauri.conf.json` (`"version": "0.8.0"`), `src-tauri/Cargo.toml` (`version = "0.8.0"`).

- [ ] **Step 5 : Vérification finale** — `npm run build` ; `rtk proxy cargo build` (dans `src-tauri`, PATH rustup exporté) ; parcours complet dans l'appli dev sur `krino_demo` (tutoriel) puis main_tri : trier un mois, galerie, sélection, album, drag, corbeille, doublons, rangement (SANS lancer le rangement sur main_tri), F5, F11.

- [ ] **Step 6 : Commit + push** — `"v0.8 — deux modes Trier/Organiser : barre latérale, galerie, sélection multiple, drag & drop, dialogues Krino"` puis `git push`.

---

## Self-review

- **Couverture spec :** §1 barre latérale → Task 3 ; §2 galerie/visionneuse/re-décision → Tasks 4-5 ; §3 sélection/albums/drag → Tasks 5-7 ; §4 dialogues/loaders/confirmation album → Tasks 1-2, 6, 8 ; §5 périmètre → Task 8. Écart assumé vs spec : pas de `galerie.ts`/`selection.ts` séparés (état partagé dans `main.ts`, seul `dialogues.ts` est extrait) — noté en tête d'architecture.
- **Placeholders :** aucun TBD ; chaque étape code montre le code.
- **Cohérence des noms :** `rendreGalerie`, `mediasGalerie`, `selectionGalerie`, `albumOuvert`, `rendreNavAlbums`, `actionSelection`, `demarrerDrag`, `ALBUM_FAVORIS`, `confirmer/demander/informer` utilisés de façon uniforme entre les tâches.
