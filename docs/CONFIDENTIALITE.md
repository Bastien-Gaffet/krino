# Confidentialité — Krino

Cette page est la notice complète (destinée au dépôt et au futur site
vitrine). La version affichée dans l'application (Réglages → Confidentialité)
en est un résumé identique sur le fond.

## Ce que Krino ne fait jamais

Krino trie vos photos et vidéos **entièrement en local**. Le contenu de vos
fichiers, leurs noms, leurs chemins de dossiers ne sont jamais lus par un
serveur, transmis sur le réseau, ni stockés ailleurs que sur votre machine
(dans le dossier que vous avez choisi, y compris la corbeille interne
`.krino/corbeille`).

Les deux seuls échanges réseau de Krino sont :

1. la vérification de mise à jour au démarrage (requête vers GitHub) ;
2. si vous laissez les statistiques anonymes activées (réglage par défaut),
   l'envoi périodique des compteurs décrits ci-dessous.

## Responsable du traitement

Bastien Gaffet, auteur et éditeur de Krino.
Contact : bastien.gaffet2007@gmail.com

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
  indiquant votre identifiant anonyme (affiché dans Réglages, bouton
  « Copier »).

## Désinstallation

Le désinstalleur Windows de Krino propose, en fin de désinstallation, un
choix explicite : conserver vos réglages et votre identifiant anonyme (pour
les retrouver en cas de réinstallation), ou tout supprimer proprement,
identifiant anonyme compris. Voir la section « Désinstallation » du README.

## Sécurité

Les échanges avec le serveur se font en HTTPS. Côté base de données, la
sécurité au niveau des lignes (Row Level Security) est activée sans aucune
policy directe : un client ne peut ni lire, ni modifier les données d'une
autre installation ; tous les accès passent par des fonctions serveur dédiées
et contrôlées (voir `supabase/migrations/0001_stats_publiques.sql`).
