require_relative '../../test_helper'

class TaskFlowBootstrapPresenterTest < ActiveSupport::TestCase
  fixtures :projects, :users, :email_addresses, :roles, :members, :member_roles,
           :trackers, :projects_trackers, :enabled_modules, :issue_statuses,
           :issues, :issue_categories, :workflows, :custom_fields,
           :custom_fields_projects, :custom_fields_trackers, :enumerations, :versions

  def test_as_json_includes_tracker_fields_custom_fields_and_project_metadata
    project = Project.find(1)
    user = User.find(2)

    qa_tracker = Tracker.create!(
      name: 'QA Review',
      default_status_id: IssueStatus.first.id,
      core_fields: Tracker::CORE_FIELDS - ['fixed_version_id']
    )
    project.trackers << qa_tracker

    list_cf = IssueCustomField.create!(
      name: 'Target Component',
      field_format: 'list',
      possible_values: %w[Frontend Backend],
      is_required: true,
      is_for_all: true,
      trackers: [qa_tracker]
    )

    payload = TaskFlow::BootstrapPresenter.new(project, user).as_json
    assert_equal project.id, payload.dig(:project, :id)
    assert_equal project.identifier, payload.dig(:project, :identifier)
    assert_equal user.id, payload[:current_user_id]

    qa_data = payload[:trackers].find { |t| t[:id] == qa_tracker.id }
    assert qa_data, 'Expected QA Review tracker in bootstrap payload'
    assert_includes qa_data[:disabled_core_fields], 'fixed_version_id'
    assert_equal qa_tracker.default_status_id, qa_data[:default_status_id]
    assert_kind_of Array, qa_data[:allowed_status_ids]

    cf_data = qa_data[:custom_fields].find { |cf| cf[:id] == list_cf.id }
    assert cf_data, 'Expected Target Component custom field'
    assert_equal 'list', cf_data[:field_format]
    assert_equal true, cf_data[:is_required]
    assert_equal %w[Frontend Backend], cf_data[:possible_values]
  end
end
