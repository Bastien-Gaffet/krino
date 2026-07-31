-- Statistiques d'usage anonymes de Krino, pour le graphe public du site vitrine.
--
-- Principe de minimisation : le serveur ne conserve JAMAIS d'historique
-- quotidien lié à un identifiant anonyme précis. Chaque appel de krino_ping()
-- incrémente directement des compteurs globaux (krino_totaux,
-- krino_totaux_quotidiens) ; seule krino_installations garde une trace par
-- installation, réduite à un identifiant aléatoire + deux dates, pour compter
-- le nombre d'installations sans les compter deux fois.
--
-- Aucune table n'est lisible directement par le client (anon) : tout passe par
-- des fonctions SECURITY DEFINER, ce qui empêche un client de lire ou de
-- modifier les données d'une autre installation.

create table public.krino_installations (
  anon_id uuid primary key,
  first_seen date not null default current_date,
  last_seen date not null default current_date
);

create table public.krino_totaux (
  id boolean primary key default true check (id),
  photos_revues bigint not null default 0,
  photos_supprimees bigint not null default 0
);
insert into public.krino_totaux (id) values (true) on conflict do nothing;

create table public.krino_totaux_quotidiens (
  jour date primary key,
  photos_revues bigint not null default 0,
  photos_supprimees bigint not null default 0,
  nouvelles_installations integer not null default 0
);

alter table public.krino_installations enable row level security;
alter table public.krino_totaux enable row level security;
alter table public.krino_totaux_quotidiens enable row level security;
-- Volontairement aucune policy : sans policy, RLS bloque tout accès direct
-- (anon comme authenticated). Seules les fonctions SECURITY DEFINER ci-dessous
-- peuvent lire/écrire ces tables.

revoke all on public.krino_installations from anon, authenticated;
revoke all on public.krino_totaux from anon, authenticated;
revoke all on public.krino_totaux_quotidiens from anon, authenticated;

-- Enregistre un « ping » : n décisions prises et n suppressions depuis le
-- dernier envoi, pour l'identifiant anonyme p_anon_id. Incrémental (le client
-- envoie uniquement ce qui est nouveau depuis le dernier envoi réussi).
create or replace function public.krino_ping(
  p_anon_id uuid,
  p_jour date,
  p_revues integer,
  p_supprimees integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nouvelle_installation boolean;
  v_jour date := p_jour;
begin
  if p_revues is null or p_supprimees is null
     or p_revues < 0 or p_supprimees < 0
     or p_revues > 100000 or p_supprimees > 100000 then
    raise exception 'valeurs hors limites';
  end if;
  -- L'horloge du client n'est pas fiable ; on borne à une semaine glissante
  -- pour éviter qu'une horloge déréglée ne pollue la série quotidienne.
  if v_jour is null or v_jour < current_date - interval '7 days' or v_jour > current_date then
    v_jour := current_date;
  end if;

  insert into public.krino_installations (anon_id, first_seen, last_seen)
  values (p_anon_id, v_jour, v_jour)
  on conflict (anon_id) do update set last_seen = greatest(krino_installations.last_seen, excluded.last_seen)
  returning (xmax = 0) into v_nouvelle_installation; -- xmax=0 : une ligne a vraiment été insérée, pas seulement mise à jour

  if p_revues > 0 or p_supprimees > 0 then
    update public.krino_totaux set
      photos_revues = photos_revues + p_revues,
      photos_supprimees = photos_supprimees + p_supprimees
    where id = true;
  end if;

  insert into public.krino_totaux_quotidiens (jour, photos_revues, photos_supprimees, nouvelles_installations)
  values (v_jour, p_revues, p_supprimees, case when v_nouvelle_installation then 1 else 0 end)
  on conflict (jour) do update set
    photos_revues = krino_totaux_quotidiens.photos_revues + excluded.photos_revues,
    photos_supprimees = krino_totaux_quotidiens.photos_supprimees + excluded.photos_supprimees,
    nouvelles_installations = krino_totaux_quotidiens.nouvelles_installations + excluded.nouvelles_installations;
end;
$$;

grant execute on function public.krino_ping(uuid, date, integer, integer) to anon;

-- Totaux cumulés depuis toujours, pour les compteurs du site (« X photos
-- triées », « Y installations »).
create or replace function public.krino_stats_publiques()
returns table(
  installations bigint,
  photos_revues bigint,
  photos_supprimees bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*) from public.krino_installations),
    (select photos_revues from public.krino_totaux where id = true),
    (select photos_supprimees from public.krino_totaux where id = true);
$$;

grant execute on function public.krino_stats_publiques() to anon;

-- Série quotidienne (p_jours derniers jours, trous comblés à zéro) pour le
-- graphe dynamique du site.
create or replace function public.krino_serie_quotidienne(p_jours integer default 90)
returns table(
  jour date,
  photos_revues bigint,
  photos_supprimees bigint,
  nouvelles_installations integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    j.jour::date,
    coalesce(t.photos_revues, 0),
    coalesce(t.photos_supprimees, 0),
    coalesce(t.nouvelles_installations, 0)
  from generate_series(
    current_date - (greatest(least(p_jours, 3650), 1) - 1),
    current_date,
    interval '1 day'
  ) as j(jour)
  left join public.krino_totaux_quotidiens t on t.jour = j.jour::date
  order by j.jour;
$$;

grant execute on function public.krino_serie_quotidienne(integer) to anon;
