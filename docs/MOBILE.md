# Krino mobile — étude et architecture cible

> Statut : **étude validée, pas encore commencée.** Décisions prises le 2026-07-31.
> Ce document existe pour qu'on puisse attaquer sans re-réfléchir.

## Objectif

Une version téléphone de Krino, réduite au **pré-tri** : on swipe ses photos
directement sur le mobile, là où elles sont prises, pour que la photothèque
arrive déjà dégrossie sur le PC.

## Décisions

| Question | Choix |
|---|---|
| Modèle | **Application autonome.** Le téléphone décide *et* agit : les photos jetées partent à la corbeille système. Aucune synchronisation avec le desktop. |
| Plateforme | **Android d'abord**, iOS dans un second temps. |
| Périmètre | **Mode « Trier » uniquement.** Tout le mode « Organiser » reste sur desktop. |

## Pourquoi ce n'est pas un simple portage

Le frontend se réutilise presque tel quel — `src/main.ts`, `src/styles.css`,
`src/i18n.ts` (fr/en/es), et le swipe est déjà tactile. **Le backend, lui, est à
réécrire intégralement.** Trois raisons structurelles, pas trois détails :

1. **Il n'y a pas de dossier racine.** Tout Krino desktop part de
   `open({ directory: true })` (`src/main.ts:428`) puis d'un `walkdir` récursif.
   Or le folder picker de `tauri-plugin-dialog` est
   [explicitement non supporté sur Android et iOS](https://v2.tauri.app/plugin/dialog/).
   Sur mobile il n'y a pas d'arborescence à parcourir : il y a une **photothèque**
   qu'on interroge (MediaStore sur Android, PhotoKit sur iOS).

2. **La corbeille interne est impossible.** `valider_mois` déplace les fichiers
   dans `.krino/corbeille` en conservant leur arborescence, et `etat.json` vit
   dans le dossier trié pour que « l'état voyage avec le dossier ». Sur mobile
   on ne déplace pas un fichier de la photothèque — on demande au système de le
   mettre à la corbeille.

3. **Les 248 lignes du module `wic` sont hors-jeu.** C'est de l'API Windows pure,
   et elle porte quatre choses critiques : miniatures, orientation EXIF, décodage
   HEIC/TIFF, et le dHash des doublons. Le HEIC compte d'ailleurs *plus* sur
   mobile — c'est le format par défaut de l'iPhone.

**La bonne nouvelle :** Android rend ces trois murs plus faciles que le desktop,
pas plus durs. Voir la correspondance ci-dessous.

## Correspondance des commandes

| Desktop (`src-tauri/src/lib.rs`) | Android |
|---|---|
| `scanner(racine)` — walkdir + kamadak-exif | Requête MediaStore (`_ID`, `DATE_TAKEN`, `SIZE`, `MIME_TYPE`). Plus de paramètre `racine`. |
| `miniature()` — WIC 320 px + rotation EXIF | `ContentResolver.loadThumbnail(uri, Size)` |
| `apercu_png()` — WIC → PNG base64 | URI `content://` servi directement à la WebView |
| `valider_mois()` — move vers `.krino/corbeille` | `MediaStore.createTrashRequest(uris)` |
| `lister_corbeille()` | Requête `IS_TRASHED = 1` |
| `restaurer_fichier(s)()` | `IS_TRASHED = 0` via `createWriteRequest` |
| `vider_corbeille()` | `MediaStore.createDeleteRequest(uris)` |
| `supprimer_definitivement()` | idem `createDeleteRequest` |
| `lire_etat()` / `ecrire_etat()` | Stockage privé de l'app, indexé par ID MediaStore |
| `chercher_doublons()` — dHash via WIC | dHash sur les bitmaps de `loadThumbnail` — **reporté v2** |
| `ranger_par_date()`, `exporter_album()`, `creer_dossier_demo()` | ✗ hors périmètre |

Deux gains à souligner :

- **`loadThumbnail` remplace tout le module `wic` à lui seul.** Android décode le
  HEIC nativement et renvoie une vignette déjà correctement orientée. Les quatre
  responsabilités de `wic` s'évaporent en un appel plateforme.
- **`DATE_TAKEN` est déjà extrait de l'EXIF par le système.** Le regroupement par
  mois ne nécessite plus `kamadak-exif` ni le choix « date EXIF ou date fichier ».

## La corbeille système : un cadeau, pas un compromis

`createTrashRequest` correspond presque littéralement à la philosophie de Krino
(« rien n'est supprimé sans revue et validation explicites ») :

- rétention **30 jours**, restauration possible via `IS_TRASHED` ;
- **jusqu'à 2000 URIs par requête, pour une seule confirmation utilisateur** —
  donc **une confirmation par validation de mois**, pas une par photo ;
- c'est la corbeille de Google Photos / Fichiers : l'utilisateur la connaît déjà
  et peut y récupérer ses fichiers même après désinstallation de Krino.

Conséquence : `.krino/corbeille` n'est pas à réimplémenter, et le filet de
sécurité est fourni *par l'OS*, ce qui est plus solide que notre dossier maison.

Requiert **Android 11 (API 30)**. C'est le minSdk retenu.

## Structure de code

Un seul crate, compilation conditionnelle — l'UI et l'i18n restent partagées :

```
src/                     frontend commun (branchement à l'exécution desktop/mobile)
src-tauri/src/
  lib.rs                 surface de commandes commune
  wic.rs                 #[cfg(windows)]
  android.rs             #[cfg(target_os = "android")]  + plugin Kotlin
```

**Correction préalable indispensable :** dans `src-tauri/Cargo.toml`, la
dépendance `windows` est déclarée inconditionnellement. Elle doit passer sous
`[target.'cfg(windows)'.dependencies]`, sinon toute compilation Android échoue.

## Points de vigilance

- **Permissions Google Play.** `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` sont des
  permissions sensibles : leur usage large exige que la gestion de photos soit la
  fonction principale de l'app. Krino qualifie sans ambiguïté, mais un formulaire
  de déclaration est à remplir lors de la publication.
- **Accès partiel (Android 14+).** L'utilisateur peut n'accorder l'accès qu'à une
  sélection de photos (`READ_MEDIA_VISUAL_USER_SELECTED`), ce qui casse le modèle
  « je trie toute ma photothèque ». À détecter et à expliquer dans l'UI.
- **Stabilité des identifiants.** Les `_ID` MediaStore peuvent changer si le média
  est réindexé — l'état de tri risque de se désolidariser des photos. Prévoir une
  identité de repli (`DATE_TAKEN` + `SIZE` + `DISPLAY_NAME`).
- **Mise à jour.** L'updater maison (manifeste GitHub + signature minisign) ne
  sert plus : c'est le Play Store qui gère. À désactiver côté mobile.
- **Signature.** Une keystore Android est nécessaire, distincte de la clé minisign
  desktop (voir la note sur les secrets de release).

## iOS, plus tard

Même frontend, mais un troisième backend en Swift sur PhotoKit. Nettement plus
coûteux : pas de corbeille batchée équivalente (la suppression PhotoKit demande
une confirmation système par lot, avec des règles propres), compte développeur à
99 $/an, et revue App Store. À n'attaquer qu'une fois la version Android validée
à l'usage.

## Prochaines étapes

1. Déplacer la dépendance `windows` sous `[target.'cfg(windows)'.dependencies]`.
2. Extraire `wic` de `lib.rs` vers `wic.rs` et poser la surface de commandes
   commune derrière `#[cfg]` — refactor pur, vérifiable sur desktop.
3. Adapter le frontend au périmètre mobile (mode Trier seul, plus d'écran
   d'ouverture de dossier). **Vérifiable sur téléphone sans aucun outillage
   Rust**, via un simple serveur Vite exposé.
4. Écrire le plugin Kotlin MediaStore (scan, vignettes, trash, restauration).
5. Chaîne de build APK + installation directe sur le téléphone pour test réel.

Les étapes 1 à 3 ne demandent ni SDK Android ni appareil : elles peuvent être
faites dès maintenant.
