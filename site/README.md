# Site vitrine — Krino

Site statique (Vite + TypeScript, sans framework) présentant Krino : capture
d'écran, téléchargement, et statistiques d'usage publiques (voir
[`../docs/CONFIDENTIALITE.md`](../docs/CONFIDENTIALITE.md)). Déployé sur
Netlify, piloté par `.github/workflows/site.yml` — pas par l'intégration Git
native de Netlify (voir plus bas pourquoi).

## Développement local

```bash
cd site
npm install
npm run dev      # http://localhost:5173
npm run build    # sortie dans site/dist
```

Sans variables d'environnement, la section « Statistiques » affiche
simplement « Statistiques bientôt disponibles » — le reste du site fonctionne
normalement.

Pour tester avec de vraies données, créer `site/.env` (ignoré par git) :

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

(mêmes valeurs que pour l'application, voir `../supabase/README.md`.)

## Mise en place de Netlify (à faire une fois)

Le site est déployé **uniquement via `netlify-cli` depuis GitHub Actions**
(pas via l'intégration Git de Netlify), pour que tout — build de
l'application, migrations Supabase, build+déploiement du site — passe par le
même endroit (GitHub Actions) plutôt que d'avoir deux systèmes de CI qui
réagissent au même push.

1. Créer un compte sur [netlify.com](https://www.netlify.com) si besoin.
2. Installer `netlify-cli` en local (`npm install -g netlify-cli`) et lancer
   `netlify login`.
3. Créer le site, sans le lier à un dépôt Git :
   ```bash
   netlify sites:create --name krino
   ```
   Noter le **Site ID** affiché (aussi visible dans Site settings → Site
   details → Site ID).
4. Générer un jeton personnel : User settings → Applications → **New access
   token**.
5. Ajouter dans les secrets du repo GitHub (`Settings → Secrets and variables
   → Actions`) :
   - `NETLIFY_AUTH_TOKEN` — le jeton généré à l'étape 4.
   - `NETLIFY_SITE_ID` — le Site ID de l'étape 3.
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — si pas déjà fait pour
     l'application (voir `../supabase/README.md`), pour que le site build
     avec les vraies statistiques.
6. Pousser sur `main` (ou lancer le workflow manuellement) : `site.yml`
   construit et déploie automatiquement.

Domaine par défaut : `https://krino.netlify.app` (ou le nom disponible le
plus proche). Un domaine personnalisé peut être ajouté ensuite depuis le
dashboard Netlify, sans rien changer au workflow.
