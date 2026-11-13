module TaskFlow
  class BootstrapPresenter
    def initialize(project, user = User.current)
      @project = project
      @user = user
    end

    def as_json(*)
      allowed_trackers = Issue.allowed_target_trackers(@project, @user).to_a
      first_default_status_id = allowed_trackers.first&.default_status_id

      {
        project: {
          id: @project.id,
          identifier: @project.identifier,
          name: @project.name
        },
        trackers: allowed_trackers.map { |tracker| serialize_tracker(tracker) },
        statuses: IssueStatus.sorted.map do |status|
          {
            id: status.id,
            name: status.name,
            is_default: status.id == first_default_status_id
          }
        end,
        priorities: IssuePriority.active.sorted.map do |priority|
          {
            id: priority.id,
            name: priority.name,
            is_default: priority.is_default?
          }
        end,
        assignable_users: @project.assignable_users.map do |user|
          {
            id: user.id,
            name: user.name
          }
        end,
        versions: @project.shared_versions.open.sorted.map do |version|
          {
            id: version.id,
            name: version.name
          }
        end,
        current_user_id: @user.id
      }
    end

    private

    def serialize_tracker(tracker)
      issue = Issue.new(project: @project, tracker: tracker, author: @user)
      {
        id: tracker.id,
        name: tracker.name,
        default_status_id: tracker.default_status_id,
        allowed_status_ids: issue.new_statuses_allowed_to(@user, true).map(&:id),
        disabled_core_fields: tracker.disabled_core_fields,
        custom_fields: visible_custom_fields(issue).map { |cf| serialize_custom_field(cf) }
      }
    end

    def visible_custom_fields(issue)
      issue.available_custom_fields.select { |cf| cf.visible_by?(@project, @user) }
    end

    def serialize_custom_field(cf)
      data = {
        id: cf.id,
        name: cf.name,
        field_format: cf.field_format,
        is_required: cf.is_required?
      }
      data[:possible_values] = Array(cf.possible_values).map(&:to_s) if cf.field_format == 'list'
      data
    end
  end
end
