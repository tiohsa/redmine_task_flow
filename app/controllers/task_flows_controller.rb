class TaskFlowsController < ApplicationController
  menu_item :task_flow

  before_action :find_project_by_project_id
  before_action :authorize
  before_action :authorize_task_flow_permissions

  def index
  end

  def bootstrap
    render json: TaskFlow::BootstrapPresenter.new(@project, User.current).as_json
  end

  def bulk_create
    result = TaskFlow::BulkCreator.new(
      project: @project,
      user: User.current,
      issues: permitted_issues_params,
      relations: permitted_relations_params
    ).call

    if result[:ok]
      render json: { issues: result[:issues], relations: result[:relations] }, status: :created
    else
      render json: { errors: result[:errors] }, status: :unprocessable_entity
    end
  end

  private

  # Use Rails session authentication and CSRF protection for .json endpoints
  # instead of Redmine's stateless API-key mode.
  def api_request?
    false
  end

  def authorize_task_flow_permissions
    allowed = User.current.allowed_to?(:create_issues_via_flow, @project) &&
              User.current.allowed_to?(:add_issues, @project) &&
              User.current.allowed_to?(:manage_issue_relations, @project)
    return if allowed

    if request.format.json?
      render json: { error: l(:notice_not_authorized) }, status: :forbidden
    else
      render_403
    end
  end

  def permitted_issues_params
    Array(params[:issues]).map do |item|
      raw = item.is_a?(ActionController::Parameters) ? item : ActionController::Parameters.new(item)
      permitted = raw.permit(
        :temp_id, :parent_temp_id, :is_group,
        :tracker_id, :subject, :status_id, :priority_id,
        :assigned_to_id, :fixed_version_id, :estimated_hours,
        :start_date, :due_date, :description
      ).to_h.deep_symbolize_keys

      if raw[:custom_field_values].is_a?(ActionController::Parameters)
        permitted[:custom_field_values] = raw[:custom_field_values].to_unsafe_h.transform_keys(&:to_s)
      elsif raw[:custom_field_values].is_a?(Hash)
        permitted[:custom_field_values] = raw[:custom_field_values].transform_keys(&:to_s)
      end

      permitted
    end
  end

  def permitted_relations_params
    Array(params[:relations]).map do |item|
      raw = item.is_a?(ActionController::Parameters) ? item : ActionController::Parameters.new(item)
      raw.permit(:source_temp_id, :target_temp_id, :relation_type, :delay).to_h.deep_symbolize_keys
    end
  end
end
