require_relative 'lib/my_gantt_plugin/hooks'

Redmine::Plugin.register :redmine_task_flow do
  name 'Redmine Task Flow'
  description 'Gantt chart task and dependency editing for Redmine'
  version '0.0.1'
  requires_redmine version_or_higher: '6.0.0'
end
