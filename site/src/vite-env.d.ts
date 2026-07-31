/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL du projet Supabase pour les statistiques publiques (voir ../supabase/README.md). */
  readonly VITE_SUPABASE_URL?: string;
  /** Clé publique anon Supabase (protégée par RLS côté serveur). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
