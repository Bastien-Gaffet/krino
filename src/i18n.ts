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

  "nav.trier": "Trier",
  "nav.galerie": "Galerie",
  "nav.albums": "Albums",

  "galerie.tout": "Tout",
  "galerie.nonTriees": "Non triées",
  "galerie.gardees": "Gardées",
  "galerie.favoris": "Favoris",
  "galerie.videos": "Vidéos",
  "galerie.bilan": "{n} fichiers",
  "galerie.badgeNonTriee": "à trier",
  "galerie.favori": "Favori",
  "galerie.annulerSel": "Annuler la sélection",
  "galerie.vide": "Aucun fichier ne correspond au filtre.",
  "galerie.fantomeDrag": "{n} photo(s)",

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
  "tuto.7": "La barre latérale est le cœur de Krino : Trier pour le tri par cartes, Galerie pour tout revoir sans refaire le tri (sélection multiple, glisser vers un album), tes Albums, les Doublons, le Rangement et la Corbeille.",
  "tuto.8": "C'est tout ! Réglages te permet de changer le thème, la langue, les raccourcis, le regroupement, et de revoir ce tutoriel. Bon tri !",

  "erreur.dejaPresent": "Un fichier existe déjà à l'emplacement d'origine",

  "chargement.corbeille": "Chargement de la corbeille…",
  "chargement.galerie": "Préparation de la galerie…",
  "chargement.vignettes": "{a} / {b} aperçus",

  "maj.titre": "Mise à jour disponible",
  "maj.texte": "Krino {v} est disponible (tu utilises la {l}).",
  "maj.telecharger": "Télécharger",
  "maj.plusTard": "Plus tard",
  "maj.aJour": "Krino est à jour ({l}).",
  "maj.erreur": "Impossible de vérifier les mises à jour (hors ligne ?).",
  "maj.installer": "Installer maintenant",
  "maj.telechargement": "Téléchargement… {p} %",
  "maj.redemarrage": "Installation… Krino va redémarrer.",
  "maj.erreurInstall": "L'installation a échoué : {e}\nTu peux télécharger la mise à jour manuellement sur la page GitHub.",
  "bloquee.detecte": "Windows a refusé l'accès au dossier — Krino est peut-être bloqué par Smart App Control ou Microsoft Defender.\n\nOuvrir la page d'aide pour débloquer l'application ?",
  "reglages.maj": "Vérifier les mises à jour",
  "reglages.bloquee": "Application bloquée par Windows ?",

  "kofi.titre": "Krino te plaît ?",
  "kofi.texte": "Si tu apprécies ce que je fais, tu peux me soutenir — chaque petit geste compte énormément !",
  "kofi.bouton": "Me soutenir sur Ko-fi",
  "kofi.plusTard": "Plus tard",

  "mois.outils": "Outils",
  "outils.titre": "Outils — Doublons & similaires",
  "outils.aide": "Trouve les fichiers en double dans le dossier. Rien n'est décidé automatiquement : dans chaque groupe, clique sur les vignettes pour choisir ce qui est gardé et ce qui part à la corbeille (récupérable).",
  "outils.exact": "Doublons exacts (contenu strictement identique)",
  "outils.similaires": "Photos semblables (recompressées, redimensionnées…)",
  "outils.seuil": "Tolérance :",
  "outils.seuil0": "stricte",
  "outils.seuil2": "normale",
  "outils.seuil4": "large (faux positifs probables)",
  "outils.analyser": "Analyser",
  "outils.analyse": "Analyse des doublons…",
  "outils.avertissement": "Semblable n'est pas identique : des rafales ou des retouches peuvent être regroupées. Vérifie chaque groupe — un clic sur une vignette bascule garder / jeter.",
  "outils.groupe": "Groupe {i} — {n} fichiers",
  "outils.bilan": "{g} groupes · {n} à jeter",
  "outils.verifier": "Vérifier ({n})",
  "outils.verifTitre": "Vérification avant corbeille",
  "outils.verifAide": "Voici les fichiers qui partiront à la corbeille (récupérables). Clique une vignette pour la retirer de la liste, ou double-clique pour l'agrandir. « Valider » effectue le déplacement.",
  "outils.verifBilan": "{n} à jeter · {t}",
  "outils.verifVide": "Plus aucun fichier à jeter.",
  "outils.appliquer": "Déplacer {n} vers la corbeille",
  "outils.aucun": "Aucun doublon trouvé.",
  "outils.deplaces": "{n} fichiers déplacés vers la corbeille interne — récupérables tant qu'elle n'est pas vidée.",
  "confirm.doublons": "Déplacer {n} fichiers ({t}) vers la corbeille de Krino ?\nRien n'est supprimé tant que la corbeille n'est pas vidée.",

  "outils.ongletDoublons": "Doublons",
  "outils.ongletRangement": "Rangement",
  "outils.ongletAlbums": "Favoris & albums",

  "rangement.aide": "Range tous les fichiers du dossier dans une arborescence Année/Mois (ex. 2026/06_Juin), d'après la date de prise de vue EXIF (ou la date de fichier, selon le réglage). Chaque déplacement est consigné : le dernier rangement peut être annulé.",
  "rangement.lancer": "Ranger par date",
  "rangement.annulerDernier": "Annuler le dernier rangement",
  "rangement.enCours": "Rangement en cours…",
  "rangement.annulation": "Annulation du rangement…",
  "rangement.resultat": "{d} fichiers rangés · {i} déjà en place ou ignorés",
  "rangement.annule": "{n} fichiers remis à leur emplacement d'origine.",
  "rangement.apercuTitre": "Arborescence qui sera créée",
  "rangement.apercuTotal": "Total : {n} fichiers",
  "rangement.apercuVide": "Aucun média à ranger.",
  "confirm.rangement": "Ranger tous les fichiers en Année/Mois ?\nLes fichiers seront DÉPLACÉS dans le dossier ouvert. Un journal permet d'annuler le dernier rangement.",
  "confirm.annulerRangement": "Remettre les fichiers du dernier rangement à leur emplacement d'origine ?",

  "tri.favoriTitre": "Ajouter/retirer des favoris",
  "reglages.favori": "Favori",
  "reglages.parMois": "Regrouper par mois calendaire",
  "reglages.parEvenement": "Regrouper par événement (séances espacées de plus de 6 h)",

  "albums.aide": "Les favoris (marqués pendant le tri avec ★) et les albums sont des collections : les fichiers restent à leur place. « Exporter » copie l'album dans le dossier Albums/<nom>. Clique sur une vignette pour la sélectionner.",
  "albums.favoris": "★ Favoris ({n})",
  "albums.nomFavoris": "Favoris",
  "albums.nouveau": "Nouvel album",
  "albums.supprimer": "Supprimer l'album",
  "albums.exporter": "Exporter en dossier",
  "albums.ajouterA": "Ajouter à cet album",
  "albums.deplacer": "Déplacer dans l'album",
  "albums.retirer": "Retirer de la collection",
  "albums.afficherPlus": "Afficher plus",
  "albums.afficherMoins": "Afficher moins",
  "albums.tousAlbums": "Tous les albums…",
  "albums.choixTitre": "Déplacer vers un album",
  "albums.creer": "Créer un album",
  "albums.nbAlbums": "{n} albums",
  "albums.nbPhotos": "{n} photo(s)",
  "albums.selection": "{n} sélectionné(s)",
  "albums.nomNouveau": "Nom du nouvel album (thème, projet, personne…) :",
  "albums.videFavoris": "Aucun favori — pendant le tri, appuie sur F ou clique sur ★ pour marquer une photo.",
  "albums.videAlbum": "Album vide — sélectionne des photos dans les Favoris puis « Ajouter à cet album ».",
  "albums.exportEnCours": "Copie des fichiers…",
  "albums.exportes": "{n} fichiers copiés dans Albums/{a}.",
  "confirm.supprimerAlbum": "Supprimer l'album « {a} » ? (les photos ne sont pas touchées)",
  "confirm.exporterAlbum": "Copier les {n} fichiers de « {a} » dans le dossier Albums/{a} ?",

  "chargement.annuler": "Annuler la tâche",
  "confirm.annulerTache": "Annuler la tâche en cours ?\nSi tu la relances plus tard, elle devra recommencer de zéro.",

  "dialogue.ok": "OK",
  "dialogue.annuler": "Annuler",
};

const EN: Dico = {
  "accueil.sousTitre": "Sort your photos, one decision at a time.",
  "accueil.choisir": "Choose a folder",
  "accueil.reprendre": "Resume: {d}",
  "accueil.titreDialogue": "Photo folder to sort",

  "nav.trier": "Sort",
  "nav.galerie": "Gallery",
  "nav.albums": "Albums",

  "galerie.tout": "All",
  "galerie.nonTriees": "Unsorted",
  "galerie.gardees": "Kept",
  "galerie.favoris": "Favorites",
  "galerie.videos": "Videos",
  "galerie.bilan": "{n} files",
  "galerie.badgeNonTriee": "to sort",
  "galerie.favori": "Favorite",
  "galerie.annulerSel": "Clear selection",
  "galerie.vide": "No file matches the filter.",
  "galerie.fantomeDrag": "{n} photo(s)",

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
  "tuto.7": "The sidebar is the heart of Krino: Sort for card-based sorting, Gallery to review everything without re-sorting (multi-select, drag to an album), your Albums, Duplicates, Organizing and the Trash.",
  "tuto.8": "That's it! Settings lets you change the theme, language, shortcuts, grouping, and replay this tutorial. Happy sorting!",

  "erreur.dejaPresent": "A file already exists at the original location",

  "chargement.corbeille": "Loading the trash…",
  "chargement.galerie": "Preparing the gallery…",
  "chargement.vignettes": "{a} / {b} previews",

  "maj.titre": "Update available",
  "maj.texte": "Krino {v} is available (you are on {l}).",
  "maj.telecharger": "Download",
  "maj.plusTard": "Later",
  "maj.aJour": "Krino is up to date ({l}).",
  "maj.erreur": "Could not check for updates (offline?).",
  "maj.installer": "Install now",
  "maj.telechargement": "Downloading… {p}%",
  "maj.redemarrage": "Installing… Krino will restart.",
  "maj.erreurInstall": "Installation failed: {e}\nYou can download the update manually from the GitHub page.",
  "bloquee.detecte": "Windows denied access to the folder — Krino may be blocked by Smart App Control or Microsoft Defender.\n\nOpen the help page to unblock the app?",
  "reglages.maj": "Check for updates",
  "reglages.bloquee": "App blocked by Windows?",

  "kofi.titre": "Enjoying Krino?",
  "kofi.texte": "If you enjoy what I do, consider supporting me! Every little bit means the world!",
  "kofi.bouton": "Support me on Ko-fi",
  "kofi.plusTard": "Later",

  "mois.outils": "Tools",
  "outils.titre": "Tools — Duplicates & similar",
  "outils.aide": "Finds duplicate files in the folder. Nothing is decided automatically: in each group, click the thumbnails to choose what is kept and what goes to the trash (recoverable).",
  "outils.exact": "Exact duplicates (strictly identical content)",
  "outils.similaires": "Similar photos (recompressed, resized…)",
  "outils.seuil": "Tolerance:",
  "outils.seuil0": "strict",
  "outils.seuil2": "normal",
  "outils.seuil4": "loose (false positives likely)",
  "outils.analyser": "Analyze",
  "outils.analyse": "Analyzing duplicates…",
  "outils.avertissement": "Similar is not identical: bursts or edited photos may be grouped together. Check every group — clicking a thumbnail toggles keep / trash.",
  "outils.groupe": "Group {i} — {n} files",
  "outils.bilan": "{g} groups · {n} to trash",
  "outils.verifier": "Review ({n})",
  "outils.verifTitre": "Review before trashing",
  "outils.verifAide": "These files will be moved to the trash (recoverable). Click a thumbnail to remove it from the list, or double-click to enlarge it. \"Confirm\" performs the move.",
  "outils.verifBilan": "{n} to trash · {t}",
  "outils.verifVide": "No more files to trash.",
  "outils.appliquer": "Move {n} to trash",
  "outils.aucun": "No duplicates found.",
  "outils.deplaces": "{n} files moved to the internal trash — recoverable until it is emptied.",
  "confirm.doublons": "Move {n} files ({t}) to Krino's trash?\nNothing is deleted until the trash is emptied.",

  "outils.ongletDoublons": "Duplicates",
  "outils.ongletRangement": "Organizing",
  "outils.ongletAlbums": "Favorites & albums",

  "rangement.aide": "Sorts every file of the folder into a Year/Month tree (e.g. 2026/06_Juin), based on the EXIF shooting date (or the file date, depending on the setting). Every move is journaled: the last run can be undone.",
  "rangement.lancer": "Organize by date",
  "rangement.annulerDernier": "Undo last organizing",
  "rangement.enCours": "Organizing…",
  "rangement.annulation": "Undoing the organizing…",
  "rangement.resultat": "{d} files organized · {i} already in place or skipped",
  "rangement.annule": "{n} files moved back to their original location.",
  "rangement.apercuTitre": "Folder tree that will be created",
  "rangement.apercuTotal": "Total: {n} files",
  "rangement.apercuVide": "No media to organize.",
  "confirm.rangement": "Organize all files into Year/Month?\nFiles will be MOVED inside the open folder. A journal allows undoing the last run.",
  "confirm.annulerRangement": "Move the files of the last organizing run back to their original location?",

  "tri.favoriTitre": "Add/remove from favorites",
  "reglages.favori": "Favorite",
  "reglages.parMois": "Group by calendar month",
  "reglages.parEvenement": "Group by event (sessions more than 6 h apart)",

  "albums.aide": "Favorites (marked during sorting with ★) and albums are collections: files stay where they are. “Export” copies the album into the Albums/<name> folder. Click a thumbnail to select it.",
  "albums.favoris": "★ Favorites ({n})",
  "albums.nomFavoris": "Favorites",
  "albums.nouveau": "New album",
  "albums.supprimer": "Delete album",
  "albums.exporter": "Export as folder",
  "albums.ajouterA": "Add to this album",
  "albums.deplacer": "Move to album",
  "albums.retirer": "Remove from collection",
  "albums.afficherPlus": "Show more",
  "albums.afficherMoins": "Show less",
  "albums.tousAlbums": "All albums…",
  "albums.choixTitre": "Move to an album",
  "albums.creer": "Create an album",
  "albums.nbAlbums": "{n} albums",
  "albums.nbPhotos": "{n} photo(s)",
  "albums.selection": "{n} selected",
  "albums.nomNouveau": "Name of the new album (theme, project, person…):",
  "albums.videFavoris": "No favorites yet — while sorting, press F or click ★ to mark a photo.",
  "albums.videAlbum": "Empty album — select photos in Favorites then “Add to this album”.",
  "albums.exportEnCours": "Copying files…",
  "albums.exportes": "{n} files copied to Albums/{a}.",
  "confirm.supprimerAlbum": "Delete the album “{a}”? (photos are untouched)",
  "confirm.exporterAlbum": "Copy the {n} files of “{a}” into the Albums/{a} folder?",

  "chargement.annuler": "Cancel task",
  "confirm.annulerTache": "Cancel the current task?\nIf you run it again later, it will have to start over from scratch.",

  "dialogue.ok": "OK",
  "dialogue.annuler": "Cancel",
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
