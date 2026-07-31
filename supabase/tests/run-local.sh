#!/usr/bin/env bash
# Rejoue toutes les migrations sur une base Postgres jetable, pour vérifier
# qu'elles s'appliquent proprement depuis zéro avant un déploiement. À lancer
# avant de pousser une migration : le push sur main la déploie automatiquement
# en production (voir ../README.md).
#
#   ./supabase/tests/run-local.sh
#
# En local, le script gère lui-même un conteneur Docker (réutilisé s'il tourne
# déjà ; la base de test, elle, est toujours recréée de zéro). En CI, où
# Postgres est déjà fourni en service, on lui passe l'URL :
#
#   KRINO_TEST_PSQL_URL=postgres://postgres:postgres@localhost:5432 ./run-local.sh
set -euo pipefail

CONTAINER=krino-migtest
IMAGE=postgres:16-alpine
DB=krino_test
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"
URL="${KRINO_TEST_PSQL_URL:-}"

if [ -n "$URL" ]; then
  psql_admin() { psql -v ON_ERROR_STOP=1 -q "$URL/postgres"; }
  psql_db() { psql -v ON_ERROR_STOP=1 -q "$URL/$DB"; }
else
  psql_admin() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres; }
  psql_db() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d "$DB"; }

  if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "-- démarrage du conteneur $CONTAINER"
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
    until docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
  fi
fi

echo "-- base $DB recréée"
printf 'drop database if exists %s;\ncreate database %s;\n' "$DB" "$DB" | psql_admin >/dev/null

for stub in "$HERE"/stub-*.sql; do
  psql_db < "$stub"
  echo "   stub appliqué : $(basename "$stub")"
done

for migration in "$MIGRATIONS"/[0-9]*.sql; do
  if psql_db < "$migration" > /tmp/krino-migtest-out.txt 2>&1; then
    echo "   migration ok : $(basename "$migration")"
  else
    echo "::error::échec de la migration $(basename "$migration")"
    cat /tmp/krino-migtest-out.txt
    exit 1
  fi
done

echo "-- toutes les migrations s'appliquent proprement depuis zéro"
