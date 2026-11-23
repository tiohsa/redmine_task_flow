require 'set'

module TaskFlow
  class BulkCreator
    MAX_ISSUES = 100
    MAX_RELATIONS = 200
    ISSUE_SAFE_ATTR_KEYS = %i[
      tracker_id subject status_id priority_id
      assigned_to_id fixed_version_id estimated_hours
      start_date due_date description custom_field_values
    ].freeze

    def initialize(project:, user:, issues:, relations:)
      @project = project
      @user = user
      @issues = Array(issues).map { |item| item.deep_symbolize_keys }
      @relations = Array(relations).map { |item| item.deep_symbolize_keys }
    end

    def call
      validation_errors = validate_before_transaction
      return { ok: false, errors: validation_errors } if validation_errors.any?

      ordered_issues, topo_index = topological_sort_issues
      ordered_relations = sort_relations(topo_index)

      created_issues = {}
      created_relations = []
      errors = []

      Issue.transaction do
        failed_temp_ids = Set.new

        ordered_issues.each do |item|
          temp_id = item[:temp_id].to_s
          issue = Issue.new(project: @project, author: @user)
          attrs = build_safe_attributes(item, created_issues, failed_temp_ids)
          issue.send(:safe_attributes=, attrs, @user)

          if issue.save
            created_issues[temp_id] = issue
          else
            failed_temp_ids.add(temp_id)
            errors << { temp_id: temp_id, messages: issue.errors.full_messages }
          end
        end

        if errors.empty?
          ordered_relations.each do |rel_item|
            source_id = rel_item[:source_temp_id].to_s
            target_id = rel_item[:target_temp_id].to_s
            next if failed_temp_ids.include?(source_id) || failed_temp_ids.include?(target_id)

            relation = IssueRelation.new(
              # Parent and child saves can move the endpoints in the issue tree.
              issue_from_id: created_issues.fetch(source_id).id,
              issue_to_id: created_issues.fetch(target_id).id,
              relation_type: 'precedes',
              delay: rel_item[:delay].nil? ? 0 : rel_item[:delay].to_i
            )

            if relation.save
              created_relations << {
                id: relation.id,
                source_temp_id: source_id,
                target_temp_id: target_id
              }
            else
              errors << { temp_id: target_id, messages: relation.errors.full_messages }
            end
          end
        end

        raise ActiveRecord::Rollback if errors.any?

        created_issues.each_value(&:reload)
      end

      return { ok: false, errors: errors } if errors.any?

      result_issues = @issues.map do |item|
        temp_id = item[:temp_id].to_s
        issue = created_issues[temp_id]
        {
          temp_id: temp_id,
          id: issue.id,
          start_date: issue.start_date&.iso8601,
          due_date: issue.due_date&.iso8601
        }
      end

      {
        ok: true,
        issues: result_issues,
        relations: created_relations
      }
    end

    private

    def validate_before_transaction
      errors = []

      if @issues.empty?
        errors << { temp_id: nil, messages: [I18n.t('task_flow.errors.empty_issues')] }
        return errors
      end

      if @issues.size > MAX_ISSUES
        errors << { temp_id: nil, messages: [I18n.t('task_flow.errors.too_many_issues', max: MAX_ISSUES)] }
      end

      if @relations.size > MAX_RELATIONS
        errors << { temp_id: nil, messages: [I18n.t('task_flow.errors.too_many_relations', max: MAX_RELATIONS)] }
      end

      return errors if errors.any?

      issue_map = {}
      @issues.each do |item|
        temp_id = item[:temp_id].to_s
        if temp_id.blank?
          errors << { temp_id: nil, messages: [I18n.t('task_flow.errors.blank_temp_id')] }
          next
        end
        if issue_map.key?(temp_id)
          errors << { temp_id: temp_id, messages: [I18n.t('task_flow.errors.duplicate_temp_id', temp_id: temp_id)] }
          next
        end
        issue_map[temp_id] = item
      end

      @issues.each do |item|
        temp_id = item[:temp_id].to_s
        parent_temp_id = item[:parent_temp_id].presence&.to_s
        next if parent_temp_id.nil?

        if parent_temp_id == temp_id
          errors << { temp_id: temp_id, messages: [I18n.t('task_flow.errors.self_parent_not_allowed')] }
        elsif !issue_map.key?(parent_temp_id)
          errors << {
            temp_id: temp_id,
            messages: [I18n.t('task_flow.errors.missing_parent_temp_id', parent_temp_id: parent_temp_id)]
          }
        elsif truthy?(item[:is_group])
          errors << { temp_id: temp_id, messages: [I18n.t('task_flow.errors.nested_group_not_allowed')] }
        end
      end

      seen_edges = Set.new
      @relations.each do |rel|
        source_id = rel[:source_temp_id].to_s
        target_id = rel[:target_temp_id].to_s
        rel_type = (rel[:relation_type].presence || 'precedes').to_s

        unless rel_type == 'precedes'
          errors << {
            temp_id: target_id.presence || source_id.presence,
            messages: [I18n.t('task_flow.errors.invalid_relation_type', relation_type: rel_type)]
          }
        end

        unless issue_map.key?(source_id)
          errors << {
            temp_id: source_id.presence,
            messages: [I18n.t('task_flow.errors.missing_relation_endpoint', temp_id: source_id)]
          }
        end

        unless issue_map.key?(target_id)
          errors << {
            temp_id: target_id.presence,
            messages: [I18n.t('task_flow.errors.missing_relation_endpoint', temp_id: target_id)]
          }
        end

        next unless issue_map.key?(source_id) && issue_map.key?(target_id)

        if source_id == target_id
          errors << { temp_id: source_id, messages: [I18n.t('task_flow.errors.self_loop_not_allowed')] }
          next
        end

        if truthy?(issue_map[source_id][:is_group])
          errors << { temp_id: source_id, messages: [I18n.t('task_flow.errors.group_relation_not_allowed')] }
        end

        if truthy?(issue_map[target_id][:is_group])
          errors << { temp_id: target_id, messages: [I18n.t('task_flow.errors.group_relation_not_allowed')] }
        end

        edge_key = [source_id, target_id]
        if seen_edges.include?(edge_key)
          errors << {
            temp_id: target_id,
            messages: [I18n.t('task_flow.errors.duplicate_relation', source: source_id, target: target_id)]
          }
        else
          seen_edges.add(edge_key)
        end
      end

      return errors if errors.any?

      sorted_tasks, = topological_sort_tasks(issue_map)
      task_count = @issues.count { |item| !truthy?(item[:is_group]) }
      if sorted_tasks.size < task_count
        sorted_set = sorted_tasks.to_set
        cycle_node = @issues.find { |item| !truthy?(item[:is_group]) && !sorted_set.include?(item[:temp_id].to_s) }
        errors << {
          temp_id: cycle_node&.dig(:temp_id)&.to_s,
          messages: [I18n.t('task_flow.errors.cycle_detected')]
        }
      end

      errors
    end

    def topological_sort_issues
      issue_map = @issues.each_with_object({}) { |item, acc| acc[item[:temp_id].to_s] = item }
      group_issues = @issues.select { |item| truthy?(item[:is_group]) }
      sorted_task_ids, = topological_sort_tasks(issue_map)
      task_issues = sorted_task_ids.map { |id| issue_map[id] }

      ordered = group_issues + task_issues
      topo_index = {}
      ordered.each_with_index { |item, idx| topo_index[item[:temp_id].to_s] = idx }
      [ordered, topo_index]
    end

    def topological_sort_tasks(issue_map)
      task_ids = @issues.reject { |item| truthy?(item[:is_group]) }.map { |item| item[:temp_id].to_s }
      in_degree = task_ids.each_with_object({}) { |id, acc| acc[id] = 0 }
      adjacency = task_ids.each_with_object({}) { |id, acc| acc[id] = [] }

      @relations.each do |rel|
        source_id = rel[:source_temp_id].to_s
        target_id = rel[:target_temp_id].to_s
        next unless in_degree.key?(source_id) && in_degree.key?(target_id)

        adjacency[source_id] << target_id
        in_degree[target_id] += 1
      end

      queue = task_ids.select { |id| in_degree[id].zero? }
      sorted = []

      until queue.empty?
        current = queue.shift
        sorted << current
        adjacency[current].each do |nxt|
          in_degree[nxt] -= 1
          queue << nxt if in_degree[nxt].zero?
        end
      end

      [sorted, in_degree]
    end

    def sort_relations(topo_index)
      @relations.sort_by do |rel|
        [
          topo_index[rel[:source_temp_id].to_s] || 0,
          topo_index[rel[:target_temp_id].to_s] || 0
        ]
      end
    end

    def build_safe_attributes(item, created_issues, failed_temp_ids)
      attrs = {}
      ISSUE_SAFE_ATTR_KEYS.each do |key|
        next unless item.key?(key)

        attrs[key.to_s] = item[key]
      end

      if truthy?(item[:is_group])
        attrs['start_date'] = nil
        attrs['due_date'] = nil
        attrs['estimated_hours'] = nil
      end

      parent_temp_id = item[:parent_temp_id].presence&.to_s
      if parent_temp_id && !failed_temp_ids.include?(parent_temp_id) && created_issues.key?(parent_temp_id)
        attrs['parent_issue_id'] = created_issues[parent_temp_id].id
      end

      attrs
    end

    def truthy?(val)
      val == true || val == 'true' || val == 1 || val == '1'
    end
  end
end
