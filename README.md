= Redmine Task Flow

Redmine plugin that provides a visual DAG task flow editor and bulk issue/relation creator.

== Requirements

* Redmine 6.0, 6.1, or 7.0 and a Ruby version supported by that Redmine release.
* Enable the +Task Flow+ (+task_flow+) module on target projects.
* Users need +create_issues_via_flow+, +add_issues+, and +manage_issue_relations+ permissions.

Ruby and Rails are supplied by Redmine; no plugin-specific gems or database migrations are required.
Prebuilt frontend bundles (+assets/javascripts/task_flow.js+ and +assets/stylesheets/task_flow.css+) are included in the repository.

* {Redmine releases}[https://www.redmine.org/projects/redmine/wiki/Download]
* {Redmine runtime requirements}[https://www.redmine.org/projects/redmine/wiki/RedmineInstall]

== Installation

Place this directory at +plugins/redmine_task_flow+ in the Redmine installation and restart Redmine.

== Development & Frontend Build

The frontend is built with React, TypeScript, Vite, Tailwind CSS, Zustand, +@xyflow/react+, and +dagre+ under +frontend/+.
To rebuild the plugin assets after editing +frontend/src/+:

  cd frontend
  npm install
  npm run build

When developing with the parent Docker Compose environment (+../../docker-compose.yml+, Redmine 7.0.2 at +http://localhost:3000+), restart the +redmine+ service after updating Ruby files, routes, views, or built assets:

  docker compose -f ../../docker-compose.yml up -d
  docker compose -f ../../docker-compose.yml restart redmine

== Tests

=== Frontend (Vitest)

  cd frontend
  npm test

=== Backend (Minitest)

Configure a separate +test+ database in Redmine's +config/database.yml+ and prepare it according to Redmine's testing instructions.

From the Redmine root:

  RAILS_ENV=test bundle exec rails test plugins/redmine_task_flow/test

Or inside the Docker Compose +redmine+ container (from +plugins/redmine_task_flow+):

  docker compose -f ../../docker-compose.yml exec -e RAILS_ENV=test redmine bundle exec rails test plugins/redmine_task_flow/test

Browser verification against a running Redmine instance (e.g. +http://localhost:3000+) should also be performed for UI flows, persistence, and permission checks.
