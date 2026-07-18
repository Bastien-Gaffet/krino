# Krino

> Du grec κρίνω — *juger, trier, décider*.

Application de bureau pour **épurer sa photothèque** : on parcourt ses photos et
vidéos mois par mois, et pour chacune on décide — **garder** ou **jeter** — au
clavier, à la souris ou d'un **swipe**. Rien n'est supprimé sans une revue et
une validation explicites, et tout passe d'abord par une corbeille interne.

Construit avec [Tauri 2](https://tauri.app) (Rust + WebView) : exécutable léger,
démarrage instantané, aucune dépendance à installer pour l'utilisateur final.

## ✨ Fonctionnalités

- **Tri par mois** : les fichiers sont regroupés par mois (date de modification),
  présentés chronologiquement, avec progression par mois.
- **Trois façons de décider** : boutons à la souris, raccourcis clavier
  **configurables** (défaut : → garder, ← jeter, ⌫ annuler), et **swipe**
  gauche/droite façon Tinder avec animation.
- **Revue de fin de mois** : avant toute action, un écran récapitule les
  gardées et les jetées (cliquer sur une vignette inverse sa décision), puis on
  **valide** — les fichiers jetés partent dans la corbeille interne.
- **Corbeille interne** (`.krino/corbeille`) : les fichiers y conservent leur
  arborescence d'origine. On peut **tout restaurer** ou **vider définitivement**
  pour libérer l'espace.
- **Mois faits** marqués ✔, refaisables individuellement ; **reset global** pour
  une deuxième passe d'épuration.
- **Filtres** : tri chronologique (les deux sens), par taille, par nombre de
  fichiers, par restants à trier ; option pour masquer les mois faits.
- **Accélérateurs** : préchargement des images suivantes, bouton « Garder le
  reste », annulation illimitée dans la session, reprise automatique du dernier
  dossier.
- **Vidéos** prises en charge (lecture directe dans la visionneuse).
- **Thème clair / sombre / automatique** (suit le mode de Windows).
- **Mois regroupés par année** (désactivable) avec aperçu de 3 photos en éventail sur chaque carte.
- **Tutoriel intégré** au premier lancement, sur un dossier d'images de démonstration — revisionnable depuis les Réglages.
- **Comparateur de rafales**, **zoom** à la molette, regroupement par **date EXIF ou date de fichier**, HEIC/TIFF via Windows Imaging Component.

## 🚀 Développement

Prérequis : [Rust](https://rustup.rs) (toolchain MSVC sous Windows), Node.js.

```bash
npm install
npm run tauri dev     # lancement en mode développement
npm run tauri build   # exécutable + installeur dans src-tauri/target/release
```

## 🗂️ Données

- L'état du tri (décisions, mois validés, raccourcis) est stocké dans
  `<dossier>/.krino/etat.json` — le dossier trié est autonome, l'état voyage avec lui.
- Formats reconnus : jpg, jpeg, png, gif, webp, bmp, tiff, avif / mp4, mov,
  m4v, webm, mkv, avi, 3gp.
- Limitation actuelle : le regroupement utilise la **date de modification** des
  fichiers (pas l'EXIF), et le format HEIC n'est pas affiché par la WebView.

## 🛡️ Sécurité des données

Krino ne supprime **jamais** un fichier directement :

1. décider (garder/jeter) ne touche pas au disque ;
2. valider un mois **déplace** les jetés vers `.krino/corbeille` ;
3. seule l'action « Vider la corbeille », confirmée, supprime réellement.

Les conditions d'utilisation (avec décharge de responsabilité) sont affichées et
doivent être acceptées au premier lancement. **Faites une sauvegarde avant tout tri.**

## L'application est bloquée par Windows ?

Krino n'est pas signé par un certificat commercial ; Windows peut donc se méfier :

- **SmartScreen** (« Windows a protégé votre ordinateur ») : cliquer sur
  **Informations complémentaires** puis **Exécuter quand même**. Cela n'arrive
  qu'au premier lancement.
- **Microsoft Defender** signale le fichier : ouvrir Sécurité Windows →
  *Protection contre les virus et menaces* → *Historique de protection*,
  sélectionner l'entrée concernant Krino et choisir **Autoriser**.
- **Smart App Control** (Windows 11) : cette protection **n'a pas de liste
  d'exclusions** — elle bloque tout exécutable non signé. Il faut soit la
  désactiver (Sécurité Windows → *Contrôle des applications et du navigateur* →
  *Paramètres de Smart App Control* → Désactivé, action irréversible), soit
  renoncer à utiliser Krino sur cette machine.

Le code est ouvert : vous pouvez l'auditer et compiler vous-même l'exécutable
(`npm run tauri build`) plutôt que de télécharger la release.

## Licence

MIT — voir [LICENSE](LICENSE). Logiciel fourni « tel quel », sans garantie.
