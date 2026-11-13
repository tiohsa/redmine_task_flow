= Redmine Task Flow

Redmine plugin that adds task date editing and issue dependency management to the Gantt chart.

== Requirements

* Redmine 6.0, 6.1, or 7.0 and a Ruby version supported by that Redmine release.
* The Redmine REST API must be enabled for issue and relation updates.
* Users need the appropriate permissions to edit issues and manage relations.

The template targets the same Redmine series as +redmine_canvas_gantt+:
6.0, 6.1, and 7.0. Ruby, Rails, jQuery, and jQuery UI are supplied by Redmine;
this plugin does not install or pin separate copies of those libraries.
Use the versions supported by your Redmine installation.

* {Redmine releases}[https://www.redmine.org/projects/redmine/wiki/Download]
* {Redmine runtime requirements}[https://www.redmine.org/projects/redmine/wiki/RedmineInstall]

== Installation

Place this directory at +plugins/redmine_task_flow+ in the Redmine installation and restart Redmine. No plugin-specific gems or database migrations are currently required.

== Tests

Configure a separate +test+ database in Redmine's +config/database.yml+ and
prepare it according to Redmine's testing instructions. From the Redmine root, run:

  RAILS_ENV=test bundle exec rails test plugins/redmine_task_flow/test

The plugin includes existing Gantt chart JavaScript; its behavior should also be checked in a browser against the Redmine version in use.

The internal +my_gantt_plugin+ module and view paths retain their original names; the registered plugin identifier is +redmine_task_flow+.
