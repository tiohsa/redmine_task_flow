require_relative '../test_helper'

class TaskFlowsTest < Redmine::IntegrationTest
  fixtures :projects, :users, :email_addresses, :roles, :members, :member_roles,
           :trackers, :projects_trackers, :enabled_modules, :issue_statuses,
           :issues, :issue_categories, :workflows, :custom_fields,
           :custom_fields_projects, :custom_fields_trackers, :enumerations, :versions

  def setup
    @project = Project.find(1)
    @project.enable_module!(:task_flow)

    @role = Role.find(1)
    @role.add_permission!(:create_issues_via_flow, :add_issues, :manage_issue_relations)

    @user = User.find(2) # jsmith, member of project 1 with role 1
  end

  def test_it_be_01_bootstrap_returns_expected_master_data
    log_user('jsmith', 'jsmith')

    get "/projects/#{@project.identifier}/task_flow/bootstrap.json"
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal @project.id, json.dig('project', 'id')
    assert_equal @project.identifier, json.dig('project', 'identifier')
    assert_equal @user.id, json['current_user_id']

    assert_kind_of Array, json['trackers']
    assert json['trackers'].any?
    first_tracker = json['trackers'].first
    assert first_tracker.key?('default_status_id')
    assert first_tracker.key?('allowed_status_ids')
    assert first_tracker.key?('disabled_core_fields')
    assert first_tracker.key?('custom_fields')

    assert_kind_of Array, json['statuses']
    assert_kind_of Array, json['priorities']
    assert_kind_of Array, json['assignable_users']
    assert_kind_of Array, json['versions']
  end

  def test_it_be_02_permission_checks_module_disabled_and_404
    log_user('jsmith', 'jsmith')

    # Full permissions -> menu is visible and index returns 200
    get "/projects/#{@project.identifier}/task_flow"
    assert_response :success
    assert_select 'a.task-flow', count: 1

    # Missing each of the 3 required permissions -> 403 and menu hidden
    [:create_issues_via_flow, :add_issues, :manage_issue_relations].each do |missing_perm|
      @role.remove_permission!(missing_perm)

      get "/projects/#{@project.identifier}/task_flow"
      assert_response :forbidden, "Expected 403 HTML when missing #{missing_perm}"

      get "/projects/#{@project.identifier}/task_flow/bootstrap.json"
      assert_response :forbidden, "Expected 403 JSON on bootstrap when missing #{missing_perm}"

      post "/projects/#{@project.identifier}/task_flow/bulk_create.json",
           params: { issues: [], relations: [] }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }
      assert_response :forbidden, "Expected 403 JSON on bulk_create when missing #{missing_perm}"

      # Menu should be hidden when viewing project overview
      get "/projects/#{@project.identifier}"
      assert_response :success
      assert_select 'a.task-flow', count: 0

      @role.add_permission!(missing_perm)
    end

    # Module disabled -> 403
    @project.disable_module!(:task_flow)
    get "/projects/#{@project.identifier}/task_flow/bootstrap.json"
    assert_response :forbidden
    @project.enable_module!(:task_flow)

    # Non-existent project -> 404
    get '/projects/non-existent-project-xyz/task_flow/bootstrap.json'
    assert_response :not_found
  end

  def test_it_be_03_csrf_protection_and_no_api_key_exposure
    log_user('jsmith', 'jsmith')
    @user.api_key # ensure api_token exists

    get "/projects/#{@project.identifier}/task_flow"
    assert_response :success
    assert_select '#redmine-task-flow-root.task-flow-root'
    refute_includes response.body, @user.api_key

    # Verify CSRF protection is enforced when forgery protection is enabled
    previous_forgery_protection = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    begin
      post "/projects/#{@project.identifier}/task_flow/bulk_create.json",
           params: { issues: [{ temp_id: 't1', subject: 'Test' }], relations: [] }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }
      assert_includes [403, 422], response.status
    ensure
      ActionController::Base.allow_forgery_protection = previous_forgery_protection
    end
  end

  def test_it_be_04_bulk_create_success_and_validation_error_contracts
    log_user('jsmith', 'jsmith')
    tracker = @project.trackers.first
    status_id = tracker.default_status_id
    priority_id = IssuePriority.active.first.id

    # Valid payload -> 201 Created
    valid_payload = {
      issues: [
        {
          temp_id: 't1',
          parent_temp_id: nil,
          is_group: false,
          tracker_id: tracker.id,
          subject: 'Task 1',
          status_id: status_id,
          priority_id: priority_id,
          start_date: '2026-11-16',
          due_date: '2026-11-17'
        },
        {
          temp_id: 't2',
          parent_temp_id: nil,
          is_group: false,
          tracker_id: tracker.id,
          subject: 'Task 2',
          status_id: status_id,
          priority_id: priority_id,
          start_date: '2026-11-18',
          due_date: '2026-11-19'
        }
      ],
      relations: [
        {
          source_temp_id: 't1',
          target_temp_id: 't2',
          relation_type: 'precedes',
          delay: 0
        }
      ]
    }

    assert_difference 'Issue.count', 2 do
      assert_difference 'IssueRelation.count', 1 do
        post "/projects/#{@project.identifier}/task_flow/bulk_create.json",
             params: valid_payload.to_json,
             headers: { 'CONTENT_TYPE' => 'application/json' }
      end
    end

    assert_response :created
    json = JSON.parse(response.body)
    assert_equal 2, json['issues'].size
    assert_equal 1, json['relations'].size
    assert_equal 't1', json['issues'][0]['temp_id']
    assert json['issues'][0]['id'].is_a?(Integer)
    assert_equal '2026-11-16', json['issues'][0]['start_date']
    assert_equal '2026-11-17', json['issues'][0]['due_date']

    # Invalid payload (blank subject) -> 422 Unprocessable Entity
    invalid_payload = {
      issues: [
        {
          temp_id: 'bad_1',
          is_group: false,
          tracker_id: tracker.id,
          subject: '',
          status_id: status_id,
          priority_id: priority_id
        }
      ],
      relations: []
    }

    assert_no_difference 'Issue.count' do
      post "/projects/#{@project.identifier}/task_flow/bulk_create.json",
           params: invalid_payload.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }
    end

    assert_response :unprocessable_entity
    err_json = JSON.parse(response.body)
    assert_equal 'bad_1', err_json.dig('errors', 0, 'temp_id')
    assert err_json.dig('errors', 0, 'messages').any?
  end
end
