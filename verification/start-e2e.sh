#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
compose=(docker compose -f ../../docker-compose.yml -f verification/compose.e2e.yml)

"${compose[@]}" up -d --wait db
"${compose[@]}" exec -T db sh -ec '
  export MYSQL_PWD="${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:?Missing MariaDB root password}}"
  exec mariadb --user=root
' <<'SQL'
CREATE DATABASE IF NOT EXISTS `redmine_task_flow_e2e` CHARACTER SET utf8mb4;
CREATE USER IF NOT EXISTS 'task_flow_e2e'@'%' IDENTIFIED BY 'task-flow-e2e-db-local';
GRANT ALL PRIVILEGES ON `redmine\_task\_flow\_e2e`.* TO 'task_flow_e2e'@'%';
SQL

"${compose[@]}" up -d --wait task-flow-e2e
"${compose[@]}" exec -T --user redmine task-flow-e2e bundle exec rails runner \
  plugins/redmine_task_flow/verification/seed-e2e.rb </dev/null

printf '%s\n' 'http://127.0.0.1:3001/projects/task-flow-e2e/task_flow'
