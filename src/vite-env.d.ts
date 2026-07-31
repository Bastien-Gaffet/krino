/// <reference types="vite/client" />

declare module "*.jpg" {
  const url: string;
  export default url;
}

interface ImportMetaEnv {
  /** URL du projet Supabase pour les statistiques anonymes (optionnel : no-op si absent). */
  readonly VITE_SUPABASE_URL?: string;
  /** Clé publique anon Supabase (protégée par RLS côté serveur, voir supabase/README.md). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
