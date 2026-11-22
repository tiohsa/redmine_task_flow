#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
compose=(docker compose -f ../../docker-compose.yml -f verification/compose.e2e.yml)

"${compose[@]}" up -d --wait db
"${compose[@]}" exec -T db sh -ec '
  export MYSQL_PWD="${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:?Missing MariaDB root password}}"
  exec mariadb --user=root
' <<'SQL'
CREATE DATABASE IF NOT EXISTS `redmine_task_flow_test` CHARACTER SET utf8mb4;
CREATE USER IF NOT EXISTS 'task_flow_test'@'%' IDENTIFIED BY 'task-flow-minitest-db-local';
GRANT ALL PRIVILEGES ON `redmine\_task\_flow\_test`.* TO 'task_flow_test'@'%';
SQL

if (($# == 0)); then
  set -- plugins/redmine_task_flow/test
fi

exec "${compose[@]}" run --rm -T --no-deps task-flow-minitest bundle exec rails test "$@" </dev/null
