/* Internationalisation : dictionnaires français / anglais.
   Les textes statiques du HTML portent un attribut data-i18n (ou data-i18n-html
   pour le contenu riche) ; les textes dynamiques passent par t(). */

export type Langue = "fr" | "en";

type Dico = Record<string, string>;

const FR: Dico = {
  "accueil.sousTitre": "Trier ses photos, une décision à la fois.",
  "accueil.choisir": "Choisir un dossier",
  "accueil.reprendre": "Reprendre : {d}",
  "accueil.titreDialogue": "Dossier de photos à trier",

  "mois.dossier": "Dossier",
  "mois.inverser": "Inverser l'ordre",
  "tri.date": "Date",
  "tri.taille": "Taille",
  "tri.nombre": "Nombre de fichiers",
  "tri.restants": "Restants à trier",
  "mois.masquerFaits": "Masquer les mois faits",
  "mois.corbeille": "Corbeille",
  "mois.reglages": "Réglages",
  "mois.reset": "Reset global",
  "mois.resetTitre": "Tout remettre à zéro pour une nouvelle passe",
  "mois.fichiers": "{n} fichiers · {t}",
  "mois.fait": "Fait",
  "mois.decides": "{a}/{b} décidés",
  "mois.refaire": "Refaire ce mois",
  "mois.entete": "{d} — {n} fichiers",

  "tri.retour": "Retour aux mois",
  "tri.rafale": "Comparer la rafale ({n})",
  "tri.annuler": "Annuler",
  "tri.annulerTitre": "Annuler la dernière décision",
  "tri.garderReste": "Garder le reste",
  "tri.garderResteTitre": "Marquer tout le reste comme gardé",
  "tri.revue": "Revue du mois",
  "tri.garder": "Garder",
  "tri.jeter": "Jeter",
  "tri.aideZoom": "Molette : zoom · double-clic : réinitialiser · F11 : plein écran",
  "finMois.titre": "Mois terminé",
  "finMois.texte": "Toutes les décisions sont prises. Passe en revue le mois pour valider.",

  "rafale.titre": "Comparateur — photos similaires",
  "rafale.aide": "Clique sur une photo pour basculer garder / jeter. Tout est appliqué d'un coup.",
  "rafale.appliquer": "Appliquer",
  "rafale.bilan": "{g} à garder, {j} à jeter",
  "rafale.garder": "GARDER",
  "rafale.jeter": "JETER",

  "revue.titre": "Revue — {m}",
  "revue.valider": "Valider le mois",
  "revue.aide": "Clique sur une vignette pour changer sa décision.",
  "revue.gardees": "Gardées",
  "revue.jetees": "Jetées",
  "revue.bilan": "{g} gardées · {j} jetées ({t} à libérer)",
  "revue.nonDecides": "{n} photo(s) de ce mois ne sont pas encore décidées — termine le tri avant de valider.",

  "corbeille.titre": "Corbeille",
  "corbeille.aide": "Les fichiers validés attendent ici avant suppression réelle. Clique sur « Restaurer » pour récupérer un fichier.",
  "corbeille.restaurerTout": "Tout restaurer",
  "corbeille.vider": "Vider définitivement",
  "corbeille.bilan": "{n} fichiers · {t} récupérables",
  "corbeille.vide": "vide",
  "corbeille.restaurer": "Restaurer",
  "corbeille.restaures": "{n} fichiers restaurés.",
  "vignette.video": "vidéo",

  "chargement.analyse": "Analyse du dossier…",
  "chargement.arborescence": "Parcours de l'arborescence…",
  "chargement.progression": "{a} / {b} fichiers analysés",
  "chargement.revue": "Préparation de la revue…",
  "chargement.validation": "Déplacement vers la corbeille…",

  "valide.titre": "Mois validé",
  "valide.texte": "{n} fichiers ({t}) ont été déplacés vers la corbeille interne.",
  "valide.menu": "Retour aux mois",
  "valide.suivant": "Mois suivant",

  "reglages.titre": "Réglages",
  "reglages.apparence": "Apparence",
  "reglages.themeAuto": "Automatique (suit le mode de Windows)",
  "reglages.themeSombre": "Sombre",
  "reglages.themeClair": "Clair",
  "reglages.langue": "Langue / Language",
  "reglages.langueAuto": "Automatique (langue du système)",
  "reglages.affichage": "Affichage des mois",
  "reglages.grouperAnnees": "Regrouper les mois par année",
  "reglages.regroupement": "Regroupement par mois",
  "reglages.exif": "Date de prise de vue (EXIF), sinon date du fichier",
  "reglages.fichier": "Date de modification du fichier",
  "reglages.raccourcis": "Raccourcis clavier",
  "reglages.raccourcisAide": "Clique sur un champ puis appuie sur la touche voulue (Échap pour annuler).",
  "reglages.garder": "Garder",
  "reglages.jeter": "Jeter",
  "reglages.annuler": "Annuler la décision",
  "reglages.valider": "Revue / Valider",
  "reglages.suivant": "Mois suivant",
  "reglages.aide": "Aide",
  "reglages.tuto": "Revoir le tutoriel",
  "reglages.cgu": "Conditions d'utilisation",
  "reglages.fermer": "Fermer",

  "cgu.titre": "Conditions d'utilisation",
  "cgu.accepter": "J'accepte",
  "cgu.html":
    "<p><strong>Krino déplace et supprime des fichiers.</strong> Son rôle est précisément de vous aider à effacer des photos et vidéos.</p>" +
    "<p>Garde-fous intégrés : aucune décision ne touche au disque avant la validation d'un mois ; les fichiers validés sont d'abord <strong>déplacés dans la corbeille interne</strong> (<code>.krino/corbeille</code>) ; seule l'action « Vider définitivement », confirmée, supprime réellement les fichiers.</p>" +
    "<p><strong>Décharge de responsabilité</strong> — Krino est fourni « tel quel », sans aucune garantie (licence MIT). En l'utilisant, vous acceptez que ses auteurs ne puissent être tenus responsables d'aucune perte de données, y compris la suppression définitive de photos ou de vidéos, quelle qu'en soit la cause (mauvaise manipulation, bug, coupure de courant…).</p>" +
    "<p><strong>Faites une sauvegarde de vos fichiers avant tout tri.</strong></p>",

  "confirm.refaireMois": "Refaire {m} ? Les décisions de ce mois seront effacées (la corbeille n'est pas touchée).",
  "confirm.reset": "Reset global : effacer TOUTES les décisions et refaire une passe complète ?\n(La corbeille n'est pas touchée.)",
  "confirm.garderReste": "Marquer les {n} fichiers restants comme gardés ?",
  "confirm.validerMois": "Valider {m} ?\n\n{n} fichiers ({t}) seront déplacés vers la corbeille de Krino.\nRien n'est supprimé tant que la corbeille n'est pas vidée.",
  "confirm.vider": "Vider la corbeille DÉFINITIVEMENT ? Cette action est irréversible.",
  "confirm.tuto": "Première utilisation : suivre le petit tutoriel (2 minutes, sur des images de démonstration) ?",

  "tuto.suivant": "Suivant",
  "tuto.terminer": "Terminer",
  "tuto.quitter": "Quitter le tutoriel",
  "tuto.0": "Bienvenue dans Krino. Ce tutoriel utilise un dossier d'images de démonstration — tes vraies photos ne sont pas touchées.",
  "tuto.1": "Voici tes mois, regroupés par année. Chaque carte montre un aperçu, le nombre de fichiers, la taille et la progression du tri.",
  "tuto.2": "Le menu déroulant change le critère de tri, et la petite flèche inverse l'ordre. On peut aussi masquer les mois déjà faits.",
  "tuto.3": "Ouvrons le premier mois. Pour chaque photo : bouton Garder ou Jeter, flèches du clavier (→ garder, ← jeter), ou glisse la carte à droite/gauche comme un deck.",
  "tuto.4": "La molette zoome dans l'image, le double-clic réinitialise. « Annuler » (ou Retour arrière) rattrape une erreur. Si des photos ont été prises en rafale, un bouton « Comparer la rafale » apparaît.",
  "tuto.5": "Quand toutes les décisions sont prises, la Revue du mois (Entrée) récapitule tout : clique sur une vignette pour changer d'avis, puis « Valider le mois ».",
  "tuto.6": "À la validation, les photos jetées sont DÉPLACÉES dans la corbeille interne de Krino — rien n'est encore supprimé. L'écran Corbeille permet de tout vérifier, restaurer fichier par fichier, ou vider définitivement pour libérer l'espace.",
  "tuto.7": "C'est tout ! Réglages te permet de changer le thème, la langue, les raccourcis, le regroupement, et de revoir ce tutoriel. Bon tri !",

  "erreur.dejaPresent": "Un fichier existe déjà à l'emplacement d'origine",
};

const EN: Dico = {
  "accueil.sousTitre": "Sort your photos, one decision at a time.",
  "accueil.choisir": "Choose a folder",
  "accueil.reprendre": "Resume: {d}",
  "accueil.titreDialogue": "Photo folder to sort",

  "mois.dossier": "Folder",
  "mois.inverser": "Reverse order",
  "tri.date": "Date",
  "tri.taille": "Size",
  "tri.nombre": "File count",
  "tri.restants": "Left to sort",
  "mois.masquerFaits": "Hide finished months",
  "mois.corbeille": "Trash",
  "mois.reglages": "Settings",
  "mois.reset": "Global reset",
  "mois.resetTitre": "Clear everything for a fresh sorting pass",
  "mois.fichiers": "{n} files · {t}",
  "mois.fait": "Done",
  "mois.decides": "{a}/{b} decided",
  "mois.refaire": "Redo this month",
  "mois.entete": "{d} — {n} files",

  "tri.retour": "Back to months",
  "tri.rafale": "Compare burst ({n})",
  "tri.annuler": "Undo",
  "tri.annulerTitre": "Undo the last decision",
  "tri.garderReste": "Keep the rest",
  "tri.garderResteTitre": "Mark all remaining files as kept",
  "tri.revue": "Month review",
  "tri.garder": "Keep",
  "tri.jeter": "Trash",
  "tri.aideZoom": "Wheel: zoom · double-click: reset · F11: fullscreen",
  "finMois.titre": "Month finished",
  "finMois.texte": "All decisions are made. Review the month to confirm.",

  "rafale.titre": "Comparator — similar photos",
  "rafale.aide": "Click a photo to toggle keep / trash. Everything is applied at once.",
  "rafale.appliquer": "Apply",
  "rafale.bilan": "{g} to keep, {j} to trash",
  "rafale.garder": "KEEP",
  "rafale.jeter": "TRASH",

  "revue.titre": "Review — {m}",
  "revue.valider": "Confirm month",
  "revue.aide": "Click a thumbnail to change its decision.",
  "revue.gardees": "Kept",
  "revue.jetees": "Trashed",
  "revue.bilan": "{g} kept · {j} trashed ({t} to free)",
  "revue.nonDecides": "{n} photo(s) in this month are still undecided — finish sorting before confirming.",

  "corbeille.titre": "Trash",
  "corbeille.aide": "Confirmed files wait here before real deletion. Click “Restore” to recover a file.",
  "corbeille.restaurerTout": "Restore all",
  "corbeille.vider": "Empty permanently",
  "corbeille.bilan": "{n} files · {t} recoverable",
  "corbeille.vide": "empty",
  "corbeille.restaurer": "Restore",
  "corbeille.restaures": "{n} files restored.",
  "vignette.video": "video",

  "chargement.analyse": "Analyzing folder…",
  "chargement.arborescence": "Walking the file tree…",
  "chargement.progression": "{a} / {b} files analyzed",
  "chargement.revue": "Preparing the review…",
  "chargement.validation": "Moving to trash…",

  "valide.titre": "Month confirmed",
  "valide.texte": "{n} files ({t}) were moved to the internal trash.",
  "valide.menu": "Back to months",
  "valide.suivant": "Next month",

  "reglages.titre": "Settings",
  "reglages.apparence": "Appearance",
  "reglages.themeAuto": "Automatic (follows Windows mode)",
  "reglages.themeSombre": "Dark",
  "reglages.themeClair": "Light",
  "reglages.langue": "Langue / Language",
  "reglages.langueAuto": "Automatic (system language)",
  "reglages.affichage": "Month display",
  "reglages.grouperAnnees": "Group months by year",
  "reglages.regroupement": "Month grouping",
  "reglages.exif": "Shooting date (EXIF), file date otherwise",
  "reglages.fichier": "File modification date",
  "reglages.raccourcis": "Keyboard shortcuts",
  "reglages.raccourcisAide": "Click a field then press the desired key (Escape to cancel).",
  "reglages.garder": "Keep",
  "reglages.jeter": "Trash",
  "reglages.annuler": "Undo decision",
  "reglages.valider": "Review / Confirm",
  "reglages.suivant": "Next month",
  "reglages.aide": "Help",
  "reglages.tuto": "Replay the tutorial",
  "reglages.cgu": "Terms of use",
  "reglages.fermer": "Close",

  "cgu.titre": "Terms of use",
  "cgu.accepter": "I accept",
  "cgu.html":
    "<p><strong>Krino moves and deletes files.</strong> Its very purpose is to help you erase photos and videos.</p>" +
    "<p>Built-in safeguards: no decision touches the disk before a month is confirmed; confirmed files are first <strong>moved to the internal trash</strong> (<code>.krino/corbeille</code>); only the confirmed “Empty permanently” action actually deletes files.</p>" +
    "<p><strong>Disclaimer</strong> — Krino is provided “as is”, without any warranty (MIT license). By using it, you accept that its authors cannot be held liable for any data loss, including the permanent deletion of photos or videos, whatever the cause (mishandling, bug, power failure…).</p>" +
    "<p><strong>Back up your files before any sorting.</strong></p>",

  "confirm.refaireMois": "Redo {m}? This month's decisions will be cleared (the trash is untouched).",
  "confirm.reset": "Global reset: clear ALL decisions and start a fresh pass?\n(The trash is untouched.)",
  "confirm.garderReste": "Mark the {n} remaining files as kept?",
  "confirm.validerMois": "Confirm {m}?\n\n{n} files ({t}) will be moved to Krino's trash.\nNothing is deleted until the trash is emptied.",
  "confirm.vider": "Empty the trash PERMANENTLY? This cannot be undone.",
  "confirm.tuto": "First run: follow the short tutorial (2 minutes, on demo images)?",

  "tuto.suivant": "Next",
  "tuto.terminer": "Finish",
  "tuto.quitter": "Quit tutorial",
  "tuto.0": "Welcome to Krino. This tutorial uses a folder of demo images — your real photos are untouched.",
  "tuto.1": "Here are your months, grouped by year. Each card shows a preview, the file count, the size and the sorting progress.",
  "tuto.2": "The dropdown changes the sort criterion, and the small arrow reverses the order. You can also hide finished months.",
  "tuto.3": "Let's open the first month. For each photo: Keep or Trash button, arrow keys (→ keep, ← trash), or swipe the card right/left like a deck.",
  "tuto.4": "The wheel zooms into the picture, double-click resets. “Undo” (or Backspace) fixes a mistake. If photos were shot in a burst, a “Compare burst” button appears.",
  "tuto.5": "Once every decision is made, the Month review (Enter) sums everything up: click a thumbnail to change your mind, then “Confirm month”.",
  "tuto.6": "On confirmation, trashed photos are MOVED to Krino's internal trash — nothing is deleted yet. The Trash screen lets you check everything, restore file by file, or empty permanently to free space.",
  "tuto.7": "That's it! Settings lets you change the theme, language, shortcuts, grouping, and replay this tutorial. Happy sorting!",

  "erreur.dejaPresent": "A file already exists at the original location",
};

const DICOS: Record<Langue, Dico> = { fr: FR, en: EN };

let langueActive: Langue = "fr";

export function resoudreLangue(pref: string): Langue {
  if (pref === "fr" || pref === "en") return pref;
  return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function definirLangue(l: Langue) {
  langueActive = l;
}

export function langue(): Langue {
  return langueActive;
}

/** Traduit une clé, avec substitution des {variables}. */
export function t(cle: string, vars?: Record<string, string | number>): string {
  let texte = DICOS[langueActive][cle] ?? DICOS.fr[cle] ?? cle;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      texte = texte.split(`{${k}}`).join(String(v));
    }
  }
  return texte;
}

/** Applique les traductions aux éléments statiques du HTML. */
export function appliquerTraductions() {
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n!);
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-html]")) {
    el.innerHTML = t(el.dataset.i18nHtml!);
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-title]")) {
    el.title = t(el.dataset.i18nTitle!);
  }
}
