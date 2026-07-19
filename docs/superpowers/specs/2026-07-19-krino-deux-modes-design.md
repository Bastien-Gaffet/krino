# Krino v0.8 — Deux modes : Trier / Organiser

Validé par Bastien le 19/07/2026 (brainstorming avec maquettes : navigation B, albums B+C).

## Objectif

Faire de Krino un vrai gestionnaire en deux espaces : **Trier** (l'existant, inchangé)
et **Organiser** (galerie, albums, doublons, rangement), reliés par une **barre
latérale permanente** — et supprimer tous les popups natifs de la WebView.

## 1. Barre latérale (navigation)

- Colonne gauche fixe ~200 px, présente dans toutes les vues après ouverture d'un
  dossier ; l'accueil (choix du dossier) et le tutoriel restent plein écran.
- Contenu, de haut en bas :
  - Logo/nom **KRINO** + nom du dossier ouvert (tronqué, title complet).
  - **Trier** (vue mois → tri swipe → revue, flux actuel inchangé).
  - **Galerie** (nouvelle section, cf. §2).
  - **Albums** : liste dépliée — « ★ Favoris », chaque album (nom + compteur),
    « + Nouvel album ». Clic = ouvre l'album en galerie filtrée. Cible de
    glisser-déposer (cf. §3).
  - **Doublons** (module actuel, sorti de l'ancienne vue Outils à onglets).
  - **Rangement** (module actuel, idem).
  - En bas : **Corbeille**, **Réglages** (le reset global vit dans Réglages).
- Section active surlignée (accent). Échap ramène à la section Trier (vue mois).
- Plein écran F11 en tri : la barre se replie (comme la barre du haut aujourd'hui).
- L'ancienne vue « Outils » à onglets et le bouton « Organiser » disparaissent.

## 2. Galerie

- Grille chronologique de **tous** les médias (validés ou non), titres de section
  par mois ou événement (suit le réglage de regroupement existant).
- Badges d'état sur vignette : gardée / jetée-en-corbeille n'apparaît pas (les
  fichiers en corbeille ne sont pas dans la galerie), non triée, ★ favori,
  pastille vidéo. Vignettes via le cache miniatures existant, chargement lazy
  par section (IntersectionObserver) — jamais 8 000 <img> d'un coup.
- Barre du haut : filtres (tout / non triées / gardées / favoris / vidéos),
  curseur de taille des vignettes, saut rapide vers un mois (select).
- Clic simple = sélection (cf. §3). **Double-clic = visionneuse** plein cadre :
  image/vidéo, zoom molette, flèches gauche/droite pour naviguer, Échap pour
  sortir, ★ pour favori.
- **Re-décision ponctuelle** sans reset du mois : action « Corbeille » sur la
  sélection → déplacement vers `.krino/corbeille` (réutilise `valider_mois`),
  confirmation Krino au préalable. Les compteurs/mois se mettent à jour.

## 3. Sélection multiple & albums (B + C)

- Sélection : clic (remplace), **Ctrl+clic** (bascule), **Maj+clic** (plage),
  **rectangle** de sélection à la souris sur le fond de la grille, **Ctrl+A**
  (section visible), Échap vide la sélection.
- **Barre d'action** en bas, visible dès qu'une sélection existe :
  `n sélectionnées · ★ Favori · Ajouter à un album ▾ · Corbeille · Annuler`.
  « Ajouter à un album » liste les albums + « Nouvel album… ».
- **Glisser-déposer** : traîner la sélection depuis la grille vers un album de la
  barre latérale (ou « ★ Favoris ») ; l'album se surligne au survol, drop = ajout.
  Implémentation HTML5 drag events avec image fantôme « n photos ».
- Les albums restent des **collections virtuelles** dans `etat.albums` (les
  fichiers ne bougent pas) ; ajout possible depuis n'importe quelle photo, sans
  passer par les Favoris. Export en dossier `Albums/<nom>` inchangé.
- Vue album = galerie filtrée sur son contenu, avec les mêmes sélection/actions
  plus « Retirer de l'album » et « Exporter en dossier ».
- **Supprimer un album** : bouton dans la vue album, confirmation Krino
  obligatoire (les photos ne sont pas touchées).

## 4. Dialogues Krino (fin des popups natifs)

- Un composant unique `dialoguer()` (Promise) sur un `<dialog>` stylé, centré,
  thème clair/sombre, trois variantes :
  - `confirmer(message, {danger?})` → bouton Confirmer/Annuler, Entrée/Échap ;
  - `demander(message, {valeurInitiale?})` → champ texte (nom d'album…) ;
  - `informer(message)` → OK (remplace alert).
- **Tous** les `alert/confirm/prompt` du code passent par ce composant (plus
  aucune mention localhost, plus de popup collé en haut).
- Les opérations potentiellement longues (ouverture d'album volumineux, export,
  ajout massif, re-décision de masse) affichent le loader existant.

## 5. Hors périmètre / inchangé

Tri swipe, revue, validation, corbeille, doublons, rangement, favoris (touche F),
regroupement par événement, updater, Ko-fi (sans case « ne plus proposer »),
tutoriel, i18n fr/en (toutes les nouvelles chaînes traduites dans les deux
langues). Version cible : 0.8.0.

## Notes techniques

- `index.html`/`main.ts` grossissent : extraire les nouveaux morceaux en modules
  (`src/dialogues.ts`, `src/galerie.ts`, `src/selection.ts`) ; l'existant reste
  dans `main.ts` pour limiter le churn.
- La galerie lit `medias` déjà scannés ; aucun nouveau backend sauf réutilisation
  de `valider_mois` (corbeille) et `exporter_album`.
- Tutoriel : les cibles de bulles qui référencent des boutons déplacés devront
  être mises à jour vers la barre latérale.
