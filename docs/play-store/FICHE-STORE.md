# Fiche Play Store — Krino

Textes prêts à copier-coller dans la Play Console. Ce que je n'ai pas pu
préparer (captures d'écran réelles, image de couverture, questionnaire de
classification, formulaire de sécurité des données — Google en tient le
développeur responsable, je n'ai pas rempli ça à ta place) est listé à la fin.

## Titre de l'application (30 caractères max)

```
Krino — Trier ses photos
```
(24 caractères)

## Description courte (80 caractères max)

```
Trie tes photos d'un swipe : garde ou jette, mois par mois. Gratuit.
```
(68 caractères)

## Description complète (4000 caractères max — celle-ci fait ~1490)

```
Des milliers de photos en vrac sur ton téléphone ? Krino te les fait passer en revue mois par mois, un swipe à la fois : garde à droite, jette à gauche — comme un jeu, pas comme une corvée.

COMMENT ÇA MARCHE
• Krino regroupe tes photos et vidéos par mois.
• Pour chaque mois, tu swipes : à droite pour garder, à gauche pour jeter.
• Une fois le mois terminé, tu valides — une seule confirmation pour tout le mois, pas une par photo.
• Les photos jetées partent dans la corbeille de ton téléphone (la même que Fichiers ou Google Photos), récupérables pendant 30 jours. Rien n'est supprimé définitivement sans que tu le décides.

RESPECTUEUX DE TA VIE PRIVÉE
Krino n'a pas de compte, pas de cloud, pas de publicité. Tes photos ne quittent jamais ton téléphone : le tri se fait entièrement en local, via les outils natifs d'Android (MediaStore). Aucune photo, aucun nom de fichier n'est jamais transmis à qui que ce soit.
Des statistiques d'usage totalement anonymes (nombre de photos triées, rien d'autre) peuvent être envoyées pour alimenter un graphe public — désactivables en un clic dans les réglages.

GRATUIT ET OPEN SOURCE
Aucune limite, aucun abonnement. Le code source est public sur GitHub, vérifiable par n'importe qui.

ET SUR ORDINATEUR ?
Krino existe aussi en version Windows, avec en plus : galerie, albums, détection des doublons, rangement automatique par dossier. Les deux versions sont indépendantes (chacune trie ses propres photos, pas de synchronisation entre elles).
```

## Catégorie

**Photographie** (ou Outils, en secours si Photographie est refusée pour un
motif de politique).

## Coordonnées

- E-mail de contact : `krino.app@gmail.com`
- Site web : `https://krino.netlify.app`
- Politique de confidentialité : `https://krino.netlify.app/confidentialite.html`
  (page créée et déployée dans le cadre de cette préparation — voir
  `site/confidentialite.html`)

## Icône haute résolution (512×512)

`docs/play-store/icone-512.png` — générée depuis `logo.png`, prête à
uploader telle quelle.

## Base factuelle pour le formulaire « Sécurité des données »

Google fait remplir ce formulaire par le développeur lui-même (question par
question, dans l'interface Play Console, dont les libellés évoluent) — voici
les faits à reporter, quels que soient les intitulés exacts du moment :

- **Photos et vidéos** : l'app y accède (permission `READ_MEDIA_IMAGES`/
  `READ_MEDIA_VIDEO`), **mais ne les collecte pas** au sens Play Store du
  terme — rien n'est transmis hors de l'appareil. Traitement 100 % local.
- **Identifiant anonyme** (UUID généré sur l'appareil) : transmis à un
  serveur (Supabase), mais uniquement si l'utilisateur laisse activé le
  réglage « statistiques anonymes » (activé par défaut, désactivable). Ne
  permet pas d'identifier la personne. Pas de partage avec un tiers.
- **Diagnostics** (modèle d'appareil, version d'OS, version de l'app, message
  d'erreur technique sans nom de fichier ni chemin) : transmis sous le même
  réglage opt-in, uniquement en cas d'échec technique réel dans l'app, pour
  le débogage. Correspond à la catégorie Play Store « App info and
  performance » / « Crash logs » ou « Diagnostics » selon l'intitulé du
  moment.
- **Aucune donnée financière, de localisation, de contacts, de santé,
  d'identité, de messages.**
- Chiffrement en transit : oui (HTTPS).
- Suppression des données possible : oui — bouton dans l'app + contact
  e-mail (détaillé dans la politique de confidentialité).
- Collecte optionnelle : oui, désactivable par l'utilisateur à tout moment.

Détail complet : `docs/CONFIDENTIALITE.md` (aussi en ligne sur
`https://krino.netlify.app/confidentialite.html`).

## Justification des permissions sensibles

Google demande une justification textuelle pour `READ_MEDIA_IMAGES`/
`READ_MEDIA_VIDEO` (formulaire dédié aux permissions sensibles) :

```
Krino est une application de tri de photothèque : son unique fonction est
d'afficher les photos et vidéos de l'utilisateur pour lui permettre de les
trier (garder/jeter) et d'envoyer celles jetées à la corbeille du système.
L'accès à la photothèque est donc la fonction principale de l'application,
pas un usage secondaire.
```

## Captures d'écran

`docs/play-store/captures-store/` — le jeu à uploader sur la fiche Play
Store : 5 visuels marketing 1080×1920 par langue (`fr/`, `en/`), avec mockup
de téléphone, titre accrocheur et fond travaillé (générés avec le skill
`app-store-screenshots`, à partir de captures du mode démo) :

1. `01-hero.png` — « Trie tes photos d'un swipe. » — carte de tri plein cadre
2. `02-device-bottom.png` — « Mois par mois, sans effort. » — liste des mois
3. `03-two-devices.png` — « Une confirmation. Tout le mois. » — swipe + revue de fin de mois
4. `04-device-top.png` — « Récupérable 30 jours. Jamais perdu. » — corbeille système (fond sombre)
5. `05-no-device.png` — « Gratuit, sans compte. 100% privé. » — slide texte seul

**Ce sont des photos de démonstration (banque d'images libres, pas de vraies
photos)** — utilisables telles quelles pour une première soumission, mais à
remplacer par de vraies captures prises sur l'APK dès que possible (plus
fidèles, et Google peut être plus exigeant sur l'authenticité des captures
avec le temps).

`docs/play-store/captures-demo/` — anciennes captures brutes (UI seule, sans
mockup ni titre), conservées en fallback si besoin de simples captures
d'écran plutôt que des visuels marketing.

## Ce qu'il reste — à faire dans la Play Console, pas préparable à l'avance

- **Image de couverture (feature graphic, 1024×500)** — travail graphique,
  pas fait ici.
- **Questionnaire de classification par âge (IARC)** — questionnaire
  interactif dans la console, à répondre toi-même (aucun contenu violent/
  choquant dans Krino, classification triviale mais c'est Google qui
  l'attribue via ce questionnaire, pas nous).
- **Formulaire « Sécurité des données »** — à remplir dans l'interface avec
  les faits ci-dessus, Google en tient le développeur responsable
  personnellement.
- **Upload de l'AAB** (`.github/workflows/android-play-store.yml`,
  déclenchement manuel une fois mergé sur `main`) et création de la fiche
  dans Play Console.
- **Pays de distribution**, prix (gratuit), programme de test (fermé/ouvert)
  avant publication complète si tu veux une phase de test au préalable.
