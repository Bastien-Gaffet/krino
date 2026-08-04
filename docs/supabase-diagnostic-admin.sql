-- À exécuter une fois dans l'éditeur SQL de Supabase, APRÈS
-- docs/supabase-diagnostic.sql. Ajoute :
--   1. une table de présence par appareil (pour connaître la population
--      totale par OS/modèle, pas seulement celle qui plante) ;
--   2. les fonctions d'agrégation utilisées par la page d'admin
--      (site/admin-diagnostics.html), verrouillées à ton propre compte.
--
-- Remplace l'adresse ci-dessous si besoin avant d'exécuter.
create or replace function public.krino_est_admin() returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'krino.app@gmail.com';
$$;

-- ── Population (un enregistrement par appareil, mis à jour à chaque ping) ──

create table if not exists public.krino_appareils (
  anon_id uuid primary key,
  appareil text,
  os text,
  version_app text,
  premiere_fois timestamptz not null default now(),
  derniere_fois timestamptz not null default now()
);

alter table public.krino_appareils enable row level security;
revoke all on public.krino_appareils from anon, authenticated;

create or replace function public.krino_appareil(
  p_anon_id uuid,
  p_appareil text,
  p_os text,
  p_version_app text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.krino_appareils (anon_id, appareil, os, version_app, derniere_fois)
  values (p_anon_id, p_appareil, p_os, p_version_app, now())
  on conflict (anon_id) do update
    set appareil = excluded.appareil,
        os = excluded.os,
        version_app = excluded.version_app,
        derniere_fois = now();
end;
$$;

grant execute on function public.krino_appareil(uuid, text, text, text) to anon;

-- ── Extraction de marque à partir du modèle (heuristique simple) ──

create or replace function public.krino_marque(p_appareil text) returns text
language sql immutable
as $$
  select case
    when p_appareil ilike 'SM-%' or p_appareil ilike '%samsung%' then 'Samsung'
    when p_appareil ilike 'Pixel%' then 'Google'
    when p_appareil ilike '%xiaomi%' or p_appareil ilike 'Redmi%' or p_appareil ilike 'M20%' then 'Xiaomi'
    when p_appareil ilike 'ONEPLUS%' or p_appareil ilike '%oneplus%' then 'OnePlus'
    when p_appareil ilike '%huawei%' then 'Huawei'
    when p_appareil ilike 'CPH%' or p_appareil ilike '%oppo%' then 'Oppo'
    when p_appareil ilike '%motorola%' or p_appareil ilike 'moto %' then 'Motorola'
    when p_appareil ilike 'sony%' or p_appareil ilike 'XQ-%' then 'Sony'
    else coalesce(nullif(split_part(p_appareil, ' ', 1), ''), 'Autre')
  end;
$$;

-- ── Fonctions d'agrégation pour la page d'admin (authenticated + email admin) ──

create or replace function public.krino_admin_resume()
returns table(utilisateurs bigint, rapports_bugs bigint, appareils_distincts bigint, os_distincts bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.krino_est_admin() then raise exception 'accès refusé'; end if;
  return query
    select
      (select count(*) from public.krino_appareils),
      (select count(*) from public.krino_diagnostics),
      (select count(distinct appareil) from public.krino_appareils),
      (select count(distinct os) from public.krino_appareils);
end;
$$;

create or replace function public.krino_admin_taux_par_os()
returns table(categorie text, utilisateurs bigint, rapports_bugs bigint, taux numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not public.krino_est_admin() then raise exception 'accès refusé'; end if;
  return query
    select a.os, count(distinct a.anon_id),
           coalesce(d.n, 0),
           round(coalesce(d.n, 0)::numeric / nullif(count(distinct a.anon_id), 0), 3)
    from public.krino_appareils a
    left join (select os, count(*) n from public.krino_diagnostics group by os) d using (os)
    group by a.os, d.n
    order by utilisateurs desc;
end;
$$;

create or replace function public.krino_admin_taux_par_marque()
returns table(categorie text, utilisateurs bigint, rapports_bugs bigint, taux numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not public.krino_est_admin() then raise exception 'accès refusé'; end if;
  return query
    select public.krino_marque(a.appareil) as marque,
           count(distinct a.anon_id),
           coalesce(sum(d.n), 0)::bigint,
           round(coalesce(sum(d.n), 0)::numeric / nullif(count(distinct a.anon_id), 0), 3)
    from public.krino_appareils a
    left join (
      select appareil, count(*) n from public.krino_diagnostics group by appareil
    ) d on d.appareil = a.appareil
    group by marque
    order by utilisateurs desc;
end;
$$;

create or replace function public.krino_admin_taux_par_version_app()
returns table(categorie text, utilisateurs bigint, rapports_bugs bigint, taux numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not public.krino_est_admin() then raise exception 'accès refusé'; end if;
  return query
    select a.version_app, count(distinct a.anon_id),
           coalesce(d.n, 0),
           round(coalesce(d.n, 0)::numeric / nullif(count(distinct a.anon_id), 0), 3)
    from public.krino_appareils a
    left join (select version_app, count(*) n from public.krino_diagnostics group by version_app) d
      using (version_app)
    group by a.version_app, d.n
    order by categorie desc;
end;
$$;

create or replace function public.krino_admin_bugs_par_jour(p_jours int default 30)
returns table(jour date, rapports_bugs bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.krino_est_admin() then raise exception 'accès refusé'; end if;
  return query
    select cree_le::date, count(*)
    from public.krino_diagnostics
    where cree_le >= now() - (p_jours || ' days')::interval
    group by cree_le::date
    order by cree_le::date;
end;
$$;

create or replace function public.krino_admin_messages_frequents(p_limite int default 15)
returns table(message text, occurrences bigint, derniere_fois timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.krino_est_admin() then raise exception 'accès refusé'; end if;
  return query
    select d.message, count(*), max(d.cree_le)
    from public.krino_diagnostics d
    group by d.message
    order by count(*) desc
    limit p_limite;
end;
$$;

grant execute on function public.krino_admin_resume() to authenticated;
grant execute on function public.krino_admin_taux_par_os() to authenticated;
grant execute on function public.krino_admin_taux_par_marque() to authenticated;
grant execute on function public.krino_admin_taux_par_version_app() to authenticated;
grant execute on function public.krino_admin_bugs_par_jour(int) to authenticated;
grant execute on function public.krino_admin_messages_frequents(int) to authenticated;
