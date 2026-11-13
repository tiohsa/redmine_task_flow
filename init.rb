Redmine::Plugin.register :redmine_task_flow do
  name 'Redmine Task Flow'
  description 'Visual DAG task flow editor and bulk issue creator for Redmine'
  version '0.1.0'
  requires_redmine version_or_higher: '6.0.0'

  project_module :task_flow do
    permission :create_issues_via_flow, { task_flows: [:index, :bootstrap, :bulk_create] }, require: :member
  end

  menu :project_menu, :task_flow, { controller: 'task_flows', action: 'index' },
       caption: :label_task_flow, after: :new_issue, param: :project_id,
       if: proc { |project|
         User.current.allowed_to?(:create_issues_via_flow, project) &&
           User.current.allowed_to?(:add_issues, project) &&
           User.current.allowed_to?(:manage_issue_relations, project)
       }
end
