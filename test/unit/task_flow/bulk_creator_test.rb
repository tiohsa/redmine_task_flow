require_relative '../../test_helper'

class TaskFlowBulkCreatorTest < ActiveSupport::TestCase
  fixtures :projects, :users, :email_addresses, :roles, :members, :member_roles,
           :trackers, :projects_trackers, :enabled_modules, :issue_statuses,
           :issues, :issue_categories, :workflows, :custom_fields,
           :custom_fields_projects, :custom_fields_trackers, :enumerations, :versions

  def setup
    @project = Project.find(1)
    @project.enable_module!(:task_flow)
    @role = Role.find(1)
    @role.add_permission!(:create_issues_via_flow, :add_issues, :manage_issue_relations)
    @user = User.find(2)
    @tracker = @project.trackers.first
    @status_id = @tracker.default_status_id
    @priority_id = IssuePriority.active.first.id
  end

  def base_issue(temp_id, overrides = {})
    {
      temp_id: temp_id,
      parent_temp_id: nil,
      is_group: false,
      tracker_id: @tracker.id,
      subject: "Subject #{temp_id}",
      status_id: @status_id,
      priority_id: @priority_id,
      estimated_hours: 8
    }.merge(overrides)
  end

  def test_ut_be_01_parent_branch_merge_and_soonest_start_with_non_working_days
    # 2026-11-20 is Friday. With non_working_week_days [6, 7] (Sat, Sun):
    # A ends Friday 2026-11-20.
    # A -> B (delay: 1): soonest_start skips Sat(21), Sun(22) + 1 working day -> Tuesday 2026-11-24.
    with_settings non_working_week_days: %w[6 7], parent_issue_dates: 'derived', parent_issue_done_ratio: 'derived' do
      issues_payload = [
        base_issue('g1', is_group: true, estimated_hours: nil, start_date: nil, due_date: nil),
        base_issue('a', parent_temp_id: 'g1', start_date: '2026-11-19', due_date: '2026-11-20', estimated_hours: 8),
        base_issue('b', parent_temp_id: 'g1', start_date: '2026-11-20', due_date: '2026-11-20', estimated_hours: 8),
        base_issue('c', parent_temp_id: 'g1', start_date: '2026-11-20', due_date: '2026-11-20', estimated_hours: 8),
        base_issue('d', parent_temp_id: 'g1', start_date: '2026-11-20', due_date: '2026-11-20', estimated_hours: 8)
      ]
      relations_payload = [
        { source_temp_id: 'a', target_temp_id: 'b', relation_type: 'precedes', delay: 1 },
        { source_temp_id: 'a', target_temp_id: 'c', relation_type: 'precedes', delay: 0 },
        { source_temp_id: 'b', target_temp_id: 'd', relation_type: 'precedes', delay: 0 },
        { source_temp_id: 'c', target_temp_id: 'd', relation_type: 'precedes', delay: 0 }
      ]

      result = nil
      assert_difference 'Issue.count', 5 do
        assert_difference 'IssueRelation.count', 4 do
          result = TaskFlow::BulkCreator.new(
            project: @project,
            user: @user,
            issues: issues_payload,
            relations: relations_payload
          ).call
        end
      end

      assert result[:ok], "Expected ok: true, got #{result.inspect}"
      by_temp = result[:issues].index_by { |i| i[:temp_id] }

      parent = Issue.find(by_temp['g1'][:id])
      issue_a = Issue.find(by_temp['a'][:id])
      issue_b = Issue.find(by_temp['b'][:id])
      issue_c = Issue.find(by_temp['c'][:id])
      issue_d = Issue.find(by_temp['d'][:id])

      # Parent linkage
      [issue_a, issue_b, issue_c, issue_d].each do |child|
        assert_equal parent.id, child.parent_id
        assert child.lft > parent.lft && child.rgt < parent.rgt
      end

      # soonest_start & non-working weekend skip
      assert_equal Date.new(2026, 11, 24), issue_b.start_date
      assert_equal Date.new(2026, 11, 23), issue_c.start_date
      assert_equal Date.new(2026, 11, 25), issue_d.start_date

      # Returned dates match reloaded DB values
      assert_equal issue_b.start_date.iso8601, by_temp['b'][:start_date]
      assert_equal issue_d.due_date.iso8601, by_temp['d'][:due_date]
      assert_equal parent.start_date.iso8601, by_temp['g1'][:start_date]
      assert_equal parent.due_date.iso8601, by_temp['g1'][:due_date]
      assert_equal 32.0, parent.total_estimated_hours.to_f
    end
  end

  def test_ut_be_02_topological_order_creation_and_group_nil_initialization
    with_settings parent_issue_dates: 'derived' do
      # Downstream 't2' is listed BEFORE upstream 't1', and 'g1' is listed last with dummy dates
      issues_payload = [
        base_issue('t2', parent_temp_id: 'g1', start_date: '2026-11-18', due_date: '2026-11-19', estimated_hours: 8),
        base_issue('t1', parent_temp_id: 'g1', start_date: '2026-11-16', due_date: '2026-11-17', estimated_hours: 8),
        base_issue('g1', is_group: true, start_date: '2099-01-01', due_date: '2099-12-31', estimated_hours: 999)
      ]
      relations_payload = [
        { source_temp_id: 't1', target_temp_id: 't2', relation_type: 'precedes', delay: 0 }
      ]

      result = TaskFlow::BulkCreator.new(
        project: @project,
        user: @user,
        issues: issues_payload,
        relations: relations_payload
      ).call

      assert result[:ok]
      by_temp = result[:issues].index_by { |i| i[:temp_id] }

      assert by_temp['g1'][:id] < by_temp['t1'][:id]
      assert by_temp['t1'][:id] < by_temp['t2'][:id]

      # Parent dates were initialized nil and derived from children (not 2099)
      assert_equal '2026-11-16', by_temp['g1'][:start_date]
      assert_equal '2026-11-19', by_temp['g1'][:due_date]
    end
  end

  def test_ut_be_03_disabled_core_fields_ignored_via_safe_attributes
    qa_tracker = Tracker.create!(
      name: 'QA Review Temp',
      default_status_id: @status_id,
      core_fields: Tracker::CORE_FIELDS - ['fixed_version_id']
    )
    @project.trackers << qa_tracker
    version = @project.versions.first || Version.create!(project: @project, name: 'v1.0')

    issues_payload = [
      base_issue('qa1', tracker_id: qa_tracker.id, fixed_version_id: version.id)
    ]

    result = TaskFlow::BulkCreator.new(
      project: @project,
      user: @user,
      issues: issues_payload,
      relations: []
    ).call

    assert result[:ok]
    created = Issue.find(result[:issues].first[:id])
    assert_nil created.fixed_version_id
  end

  def test_ut_be_04_rollback_all_on_partial_validation_failure
    required_cf = IssueCustomField.create!(
      name: 'Required Component',
      field_format: 'list',
      possible_values: %w[Frontend Backend],
      is_required: true,
      is_for_all: true,
      trackers: [@tracker]
    )

    issues_payload = [
      base_issue('t1', custom_field_values: { required_cf.id.to_s => 'Frontend' }),
      base_issue('t2', custom_field_values: { required_cf.id.to_s => 'Backend' }),
      base_issue('t3', custom_field_values: {}) # missing required CF
    ]
    relations_payload = [
      { source_temp_id: 't1', target_temp_id: 't2', relation_type: 'precedes', delay: 0 }
    ]

    result = nil
    assert_no_difference 'Issue.count' do
      assert_no_difference 'IssueRelation.count' do
        result = TaskFlow::BulkCreator.new(
          project: @project,
          user: @user,
          issues: issues_payload,
          relations: relations_payload
        ).call
      end
    end

    refute result[:ok]
    assert_equal 't3', result[:errors].first[:temp_id]
    assert result[:errors].first[:messages].any?
  end

  def test_ut_be_05_pre_transaction_structural_and_limit_rejections
    # 1. Cycle detection (A -> B -> A)
    cycle_result = TaskFlow::BulkCreator.new(
      project: @project,
      user: @user,
      issues: [base_issue('a'), base_issue('b')],
      relations: [
        { source_temp_id: 'a', target_temp_id: 'b', relation_type: 'precedes', delay: 0 },
        { source_temp_id: 'b', target_temp_id: 'a', relation_type: 'precedes', delay: 0 }
      ]
    ).call
    refute cycle_result[:ok]

    # 2. Group endpoint in relation
    group_edge_result = TaskFlow::BulkCreator.new(
      project: @project,
      user: @user,
      issues: [base_issue('g1', is_group: true), base_issue('a')],
      relations: [
        { source_temp_id: 'g1', target_temp_id: 'a', relation_type: 'precedes', delay: 0 }
      ]
    ).call
    refute group_edge_result[:ok]

    # 3. Nested group
    nested_group_result = TaskFlow::BulkCreator.new(
      project: @project,
      user: @user,
      issues: [
        base_issue('g1', is_group: true),
        base_issue('g2', is_group: true, parent_temp_id: 'g1')
      ],
      relations: []
    ).call
    refute nested_group_result[:ok]

    # 4. Duplicate edge & self-loop
    dup_and_self_result = TaskFlow::BulkCreator.new(
      project: @project,
      user: @user,
      issues: [base_issue('a'), base_issue('b')],
      relations: [
        { source_temp_id: 'a', target_temp_id: 'b', relation_type: 'precedes', delay: 0 },
        { source_temp_id: 'a', target_temp_id: 'b', relation_type: 'precedes', delay: 0 },
        { source_temp_id: 'a', target_temp_id: 'a', relation_type: 'precedes', delay: 0 }
      ]
    ).call
    refute dup_and_self_result[:ok]

    # 5. Missing temp_id references
    missing_ref_result = TaskFlow::BulkCreator.new(
      project: @project,
      user: @user,
      issues: [base_issue('a', parent_temp_id: 'non_existent')],
      relations: [
        { source_temp_id: 'a', target_temp_id: 'missing_target', relation_type: 'precedes', delay: 0 }
      ]
    ).call
    refute missing_ref_result[:ok]

    # 6. Limit exceeded (> 100 issues, > 200 relations)
    too_many_issues = (1..101).map { |i| base_issue("t#{i}") }
    limit_issues_result = TaskFlow::BulkCreator.new(
      project: @project,
      user: @user,
      issues: too_many_issues,
      relations: []
    ).call
    refute limit_issues_result[:ok]

    too_many_rels = (1..201).map do |i|
      { source_temp_id: 'a', target_temp_id: 'b', relation_type: 'precedes', delay: i }
    end
    limit_rels_result = TaskFlow::BulkCreator.new(
      project: @project,
      user: @user,
      issues: [base_issue('a'), base_issue('b')],
      relations: too_many_rels
    ).call
    refute limit_rels_result[:ok]
  end
end
