# frozen_string_literal: true

database = ActiveRecord::Base.connection.select_value('SELECT DATABASE()')
abort "Expected redmine_task_flow_e2e, connected to #{database.inspect}" unless database == 'redmine_task_flow_e2e'

ActiveRecord::Base.transaction do
  loader = Redmine::DefaultData::Loader
  loader.load('en') if loader.no_data?

  project = Project.find_or_initialize_by(identifier: 'task-flow-e2e')
  if project.new_record?
    project.name = 'Task Flow E2E'
    project.is_public = false
    project.enabled_module_names = %w[issue_tracking task_flow]
    project.trackers = Tracker.order(:position)
    project.save!
  end

  user = User.find_or_initialize_by(login: 'task-flow-e2e')
  if user.new_record?
    user.firstname = 'Task Flow'
    user.lastname = 'E2E'
    user.mail = 'task-flow-e2e@example.invalid'
    user.language = 'ja'
    user.password = 'task-flow-e2e-local'
    user.password_confirmation = user.password
    user.save!
  end

  unless project.members.exists?(user_id: user.id)
    role = Role.find_by!(name: 'Manager', builtin: 0)
    role.add_permission!(:create_issues_via_flow, :add_issues, :manage_issue_relations)
    project.members.create!(user: user, roles: [role])
  end
end
