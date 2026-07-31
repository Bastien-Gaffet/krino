-- Stub minimal de ce que fournit Supabase et qu'un Postgres nu n'a pas :
-- les rôles anon/authenticated/service_role utilisés par les GRANT des
-- migrations. Sert uniquement à vérifier que les migrations s'appliquent
-- proprement sur une base vierge (CI + local), jamais utilisé en production.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated;
