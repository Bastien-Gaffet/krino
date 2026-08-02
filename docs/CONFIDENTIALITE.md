# Confidentialité — Krino

Cette page est la notice complète (dépôt, site vitrine, et fiche Play Store).
La version affichée dans l'application (Réglages → Confidentialité) en est un
résumé identique sur le fond. Krino existe en deux versions — desktop
(Windows) et mobile (Android) — qui partagent le même principe mais accèdent
différemment à vos photos ; les deux sont décrites ci-dessous.

## Ce que Krino ne fait jamais

Krino trie vos photos et vidéos **entièrement en local**. Le contenu de vos
fichiers, leurs noms, leurs chemins de dossiers ne sont jamais lus par un
serveur, transmis sur le réseau, ni stockés ailleurs que sur votre appareil.

Les deux seuls échanges réseau de Krino sont :

1. sur desktop, la vérification de mise à jour au démarrage (requête vers
   GitHub) — sur Android, les mises à jour passent par le Play Store, Krino
   ne fait aucune requête de ce type ;
2. si vous laissez les statistiques anonymes activées (réglage par défaut),
   l'envoi périodique des compteurs décrits ci-dessous.

## Accès à vos photos

**Desktop (Windows).** Vous choisissez explicitement un dossier à trier.
Krino ne voit que ce dossier ; les photos jetées sont déplacées dans une
corbeille interne à ce dossier (`.krino/corbeille`), et ne sont supprimées
définitivement que lorsque vous le demandez.

**Mobile (Android).** Krino demande l'autorisation d'accéder à votre
photothèque (permission « Photos et vidéos »), nécessaire pour afficher vos
photos et vous permettre de les trier — c'est la fonction même de
l'application, elle ne peut pas fonctionner sans. Les photos jetées sont
envoyées à **la corbeille du système Android** (la même que celle de
l'application Fichiers ou Google Photos), avec une rétention de 30 jours et
une confirmation explicite du système à chaque envoi — jamais de suppression
silencieuse. Aucune photo, vignette ou métadonnée n'est jamais transmise hors
de votre appareil : le tri, l'affichage des vignettes et la mise à la
corbeille se font entièrement via les API Android locales (MediaStore).

### Permissions demandées sur Android

| Permission | Pourquoi |
|---|---|
| Photos et vidéos (`READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`) | Afficher votre photothèque pour la trier — la fonction principale de l'application. |
| Accès limité aux photos sélectionnées (`READ_MEDIA_VISUAL_USER_SELECTED`, Android 14+) | Détecter le cas où vous n'avez autorisé qu'une sélection de photos, pour vous en informer plutôt que de le confondre avec un refus. |

Aucune autre permission n'est demandée : ni localisation, ni contacts, ni
réseau/téléphone, ni stockage plus large que la photothèque.

## Responsable du traitement

Bastien Gaffet, auteur et éditeur de Krino.
Contact : krino.app@gmail.com

## Données collectées

Si le réglage « Envoyer des statistiques d'usage anonymes » est activé
(Réglages → Statistiques anonymes) :

| Donnée | Détail |
|---|---|
| Identifiant anonyme | UUID aléatoire généré sur l'appareil au premier lancement, stocké localement. Ne contient et ne permet de retrouver aucune information sur vous. |
| Nombre de photos passées en revue | Incrémenté à chaque décision « garder »/« jeter » prise dans l'application. |
| Nombre de photos supprimées | Incrémenté à chaque déplacement vers la corbeille interne (validation de mois, doublons, sélection dans la galerie). |
| Date | Date (jour) à laquelle ces compteurs sont envoyés. |

Aucune photo, aucun nom de fichier, aucun chemin de dossier, aucune adresse IP
n'est enregistré par le serveur au-delà du temps strictement nécessaire au
traitement de la requête HTTP.

## Finalité et base légale

Ces compteurs, agrégés à ceux de l'ensemble des utilisateurs, servent à
afficher des statistiques publiques (nombre d'installations, nombre de photos
triées/supprimées par la communauté) sur le site de Krino, et à suivre
l'usage général de l'application pour orienter son développement.

Base légale retenue : **intérêt légitime** (RGPD art. 6.1.f), compte tenu du
caractère anonyme, agrégé et minimal des données — aucun profilage, aucune
donnée permettant d'identifier directement ou indirectement une personne
physique.

## Conservation

Architecture volontairement minimisée : le serveur **ne conserve aucun
historique quotidien lié à un identifiant précis**. Chaque envoi incrémente
directement des compteurs globaux, communs à tous les utilisateurs. Seule une
petite table associe votre identifiant anonyme à deux dates (première et
dernière utilisation), pour compter les installations sans les compter deux
fois — rien de plus n'y est jamais écrit.

## Destinataires et hébergement

Personne d'autre que l'auteur de Krino n'a accès à ces données. Elles sont
hébergées chez [Supabase](https://supabase.com), dans une région de l'Union
européenne. Aucune vente, aucun partage à des fins publicitaires ou
commerciales.

## Vos droits

- **Opposition immédiate** : décochez « Envoyer des statistiques d'usage
  anonymes » dans Réglages — plus rien n'est envoyé à partir de cet instant.
- **Effacement local** : le bouton « Réinitialiser mes statistiques » dans
  Réglages supprime votre identifiant anonyme et les compteurs en attente sur
  votre appareil. Un nouvel identifiant sera généré si vous réactivez le
  réglage plus tard, ce qui comptera comme une nouvelle installation côté
  serveur.
- **Effacement côté serveur / question** : contactez l'adresse ci-dessus en
  indiquant votre identifiant anonyme, affiché dans Réglages (bouton
  « Copier » sur desktop, sélectionnable directement sur mobile).

## Désinstallation

**Android.** La désinstallation standard (comme n'importe quelle application)
supprime tout ce que Krino a stocké sur l'appareil, identifiant anonyme
compris — aucune étape supplémentaire. Vos photos, elles, ne sont jamais
affectées : Krino ne fait qu'y accéder via MediaStore, il n'en est jamais
propriétaire.

**Windows.** Le désinstalleur Krino propose, en fin de désinstallation, un
choix explicite : conserver vos réglages et votre identifiant anonyme (pour
les retrouver en cas de réinstallation), ou tout supprimer proprement,
identifiant anonyme compris. Voir la section « Désinstallation » du README.

## Sécurité

Les échanges avec le serveur se font en HTTPS. Côté base de données, la
sécurité au niveau des lignes (Row Level Security) est activée sans aucune
policy directe : un client ne peut ni lire, ni modifier les données d'une
autre installation ; tous les accès passent par des fonctions serveur dédiées
et contrôlées (voir `supabase/migrations/0001_stats_publiques.sql`).
