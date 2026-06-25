#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

compose_file="compose.yml"
env_file=".env"
migrations_dir="runtime/db/migrations"

compose() {
  if docker info >/dev/null 2>&1; then
    docker compose "$@"
    return
  fi
  sudo docker compose "$@"
}

if [ ! -f "$env_file" ]; then
  echo "Missing $env_file on server." >&2
  exit 1
fi

if [ ! -d "$migrations_dir" ]; then
  echo "Missing $migrations_dir." >&2
  exit 1
fi

compose --env-file "$env_file" -f "$compose_file" exec -T postgres sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "create table if not exists public.self_host_schema_migrations (version text primary key, applied_at timestamptz not null default now())"'

for migration in "$migrations_dir"/*.sql; do
  [ -e "$migration" ] || continue
  version="$(basename "$migration")"
  applied="$(compose --env-file "$env_file" -f "$compose_file" exec -T postgres sh -c \
    "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -At -c \"select 1 from public.self_host_schema_migrations where version = '$version'\"")"

  if [ "$applied" = "1" ]; then
    echo "skip $version"
    continue
  fi

  echo "apply $version"
  compose --env-file "$env_file" -f "$compose_file" exec -T postgres sh -c \
    'psql -v ON_ERROR_STOP=1 -1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$migration"
  compose --env-file "$env_file" -f "$compose_file" exec -T postgres sh -c \
    "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"insert into public.self_host_schema_migrations(version) values ('$version')\""
done
