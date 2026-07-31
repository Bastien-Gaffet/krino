# Statistiques anonymes — Supabase

Backend minimal pour les compteurs publics du site de Krino (photos passées en
revue, photos supprimées, nombre d'installations). Voir
[`docs/CONFIDENTIALITE.md`](../docs/CONFIDENTIALITE.md) pour la notice RGPD
complète, et `migrations/0001_stats_publiques.sql` pour le détail technique.

Le dossier est initialisé pour le CLI (`supabase init`, `config.toml`) ; les
migrations sont versionnées dans `migrations/`, appliquées automatiquement en
production par `.github/workflows/deploy-migrations.yml` à chaque push sur
`main` qui touche `supabase/migrations/**`.

## Mise en place (à faire une fois)

1. Créer un projet sur [supabase.com](https://supabase.com), **région Europe**
   (ex. `eu-central-1`) pour rester dans l'UE et simplifier la conformité.
2. Appliquer la migration une première fois, au choix :
   - dans l'éditeur SQL du dashboard, coller
     `migrations/0001_stats_publiques.sql` ;
   - ou en local : `npx supabase login`, puis
     `npx supabase link --project-ref <ref-du-projet>` et
     `npx supabase db push`.

   Les fois suivantes, ce sera automatique via GitHub Actions (voir plus bas).
3. Récupérer dans *Project Settings → API* :
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

   Ces deux valeurs sont publiques par construction (embarquées dans le
   binaire distribué et dans le site). La sécurité repose sur les policies RLS
   + fonctions `SECURITY DEFINER` de la migration, pas sur le secret de la clé.
4. En local, créer `.env` (déjà ignoré par git) à la racine du repo **et**
   dans `site/` :
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
5. Dans GitHub (`Settings → Secrets and variables → Actions`) :
   - Onglet **Secrets** : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (lus
     par `release.yml` et `site.yml`).
   - Pour le déploiement automatique des migrations (`deploy-migrations.yml`),
     ajouter en plus :
     - Onglet **Secrets** : `SUPABASE_ACCESS_TOKEN` (Account → Access Tokens
       sur supabase.com) et `SUPABASE_DB_PASSWORD` (mot de passe de la base,
       défini à la création du projet — réinitialisable dans Project Settings
       → Database si perdu).
     - Onglet **Variables** (valeur publique, pas un secret) :
       `SUPABASE_PROJECT_ID` (la référence du projet, ex. `abcdefghijklmnop`,
       visible dans Project Settings → General ou dans l'URL du dashboard).

Sans `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, `npm run build`/`npm run
tauri dev` fonctionnent normalement : la télémétrie se contente de ne rien
envoyer (no-op), et le site affiche « Statistiques bientôt disponibles ».

## Vérifier que ça tourne

```bash
# Rejoue les migrations sur une base Postgres jetable (Docker requis) :
./supabase/tests/run-local.sh
```

```sql
-- Une fois le projet lié, sur le vrai projet :
select * from krino_stats_publiques();
select * from krino_serie_quotidienne(30);
```

## Sécurité

Row Level Security est activé sur les 3 tables **sans aucune policy** : ni
`anon` ni `authenticated` ne peuvent lire ou écrire directement dessus. Tout
passe par les fonctions `krino_ping`, `krino_stats_publiques` et
`krino_serie_quotidienne`, en `SECURITY DEFINER`, seules à avoir `EXECUTE`
accordé à `anon`. Un client ne peut donc jamais lire les données d'une autre
installation ni falsifier un total au nom d'un autre `anon_id`.
