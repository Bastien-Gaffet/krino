-- À exécuter une fois dans l'éditeur SQL de Supabase (Dashboard > SQL Editor).
-- Ajoute la table + fonction RPC pour les rapports de diagnostic technique
-- (opt-in, anonymes) envoyés par src/telemetrie.ts::signalerErreur().
--
-- Ne contient jamais de nom de fichier, de chemin, ni de contenu photo — le
-- message est déjà assaini côté client (voir journaliserEchec() dans
-- src/mobile/main.ts). Voir docs/CONFIDENTIALITE.md pour la politique.

create table if not exists public.krino_diagnostics (
  id bigint generated always as identity primary key,
  anon_id uuid not null,
  appareil text,
  os text,
  version_app text,
  message text not null,
  cree_le timestamptz not null default now()
);

alter table public.krino_diagnostics enable row level security;

-- Personne ne lit/écrit directement la table via l'API publique : seule la
-- fonction RPC ci-dessous (SECURITY DEFINER) peut y insérer.
revoke all on public.krino_diagnostics from anon, authenticated;

create or replace function public.krino_diagnostic(
  p_anon_id uuid,
  p_appareil text,
  p_os text,
  p_version_app text,
  p_message text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.krino_diagnostics (anon_id, appareil, os, version_app, message)
  values (p_anon_id, p_appareil, p_os, p_version_app, left(p_message, 500));
end;
$$;

grant execute on function public.krino_diagnostic(uuid, text, text, text, text) to anon;

-- Pour consulter les rapports reçus (toi, dans le SQL Editor — pas via l'API
-- publique, verrouillée ci-dessus) :
--   select * from public.krino_diagnostics order by cree_le desc limit 50;

-- Nettoyage recommandé : ces rapports ne servent qu'au débogage à court
-- terme, pas à un historique permanent. Purge manuelle ou, si tu préfères
-- l'automatiser, une tâche planifiée (pg_cron, si activé sur ton projet) :
--   select cron.schedule('purge-krino-diagnostics', '0 3 * * *',
--     $$delete from public.krino_diagnostics where cree_le < now() - interval '30 days'$$);
