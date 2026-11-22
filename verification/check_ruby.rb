require 'json'
require 'ripper'

def walk_syntax(node, &block)
  return unless node.is_a?(Array)

  yield node
  node.each { |child| walk_syntax(child, &block) }
end

def call_parts(node)
  case node.first
  when :command then [node[1], node[2]]
  when :command_call then [node[3], node[4], node[1]]
  when :method_add_arg
    token, _, receiver = call_parts(node[1])
    [token, node[2], receiver]
  when :call then [node[3], nil, node[1]]
  when :fcall, :vcall then [node[1]]
  else []
  end
end

def constant_name(node)
  return unless node.is_a?(Array)

  case node.first
  when :@const then node[1]
  when :var_ref, :top_const_ref then constant_name(node[1])
  when :const_path_ref
    prefix = constant_name(node[1])
    "#{prefix}::#{node[2][1]}" if prefix
  end
end

def check_test_case(token, body, report)
  line = token[2][0]
  last_line = line
  assertions = {}
  walk_syntax(body) do |node|
    if node[0].is_a?(Symbol) && node[0].to_s.start_with?('@')
      last_line = [last_line, node[2][0] + node[1].count("\n")].max
    end

    method, arguments, = call_parts(node)
    name = method&.at(1)
    next unless name.is_a?(String) && name.match?(/\A(?:assert|refute)(?:_|\z)/)

    # 親の method_add_arg から訪問するため、引数なしの子ノードを重複計上しない。
    next if assertions.key?(method[2])

    assertions[method[2]] = name
    bare_raises = name == 'assert_raises' && (arguments.nil? || arguments == [] || arguments == [:arg_paren, nil])
    if bare_raises || %w[assert_not_nil refute_nil assert_nothing_raised].include?(name)
      report.call('test-weak-assertion', method[2][0], name, '具体的な結果・状態・エラー型やメッセージを検証してください。')
    end
  end
  if assertions.size > 5 || last_line - line + 1 > 40
    report.call('test-size', line, 'test case', '1 ケースを 5 検証・40 行以内に分け、共通の準備はヘルパーにまとめてください。', last_line)
  end
  if !assertions.empty? && assertions.values.all? { |name| name.match?(/\A(?:assert|refute)_(?:not_)?(?:called|received)/) }
    report.call('test-spy-only', line, 'test case', 'モックの呼び出しに加えて、利用者が観測できる結果や状態を検証してください。', last_line)
  end
end

def check_tests(syntax, report, test_titles)
  walk_syntax(syntax) do |node|
    case node.first
    when :def
      check_test_case(node[1], node[3], report) if node[1][1].start_with?('test_')
    when :method_add_block
      method, arguments, = call_parts(node[1])
      next unless method&.at(1) == 'test'

      arguments = arguments[1] if arguments&.first == :arg_paren
      title = arguments[1].first if arguments&.first == :args_add_block && arguments[1].is_a?(Array)
      if title&.first == :string_literal && title[1].length == 2 && title[1][1][0] == :@tstring_content
        test_titles << title[1][1][1]
      end
      check_test_case(method, node[2], report)
    when :method_add_arg, :command_call
      method, _, receiver = call_parts(node)
      constant = constant_name(receiver)
      if method&.at(1) == 'stub' && constant&.start_with?('TaskFlow::') && !constant.start_with?('TaskFlow::Infrastructure::')
        report.call('test-internal-mock', method[2][0], constant, '製品モジュールを差し替えず、TaskFlow::Infrastructure または外部 I/O を差し替えてください。')
      end
    end
  end
end

root = File.expand_path('..', __dir__)
feature_prefix = %w[TaskFlow Features].freeze
file_prefix = 'app/services/task_flow/features/'
infra_prefix = 'app/services/task_flow/infrastructure/'
raw_methods = %w[find_by_sql count_by_sql select_all select_rows select_value select_values exec_query exec_insert exec_update exec_delete execute].freeze
framework_constants = %w[ActionController ActiveRecord ApplicationController ApplicationRecord Rails Issue IssueRelation Project User].freeze
issues = []
test_titles = []

Dir.chdir(root) do
  Dir['{app,config,test}/**/*.rb', 'init.rb'].sort.each do |file|
    source = File.read(file)
    syntax = Ripper.sexp(source)
    abort "#{file}: Ruby の構文を確認してください。" unless syntax

    tokens = Ripper.lex(source)
    test_file = file.start_with?('test/') || file.end_with?('_test.rb', '_spec.rb')
    infrastructure = file.start_with?(infra_prefix)
    if file.start_with?(file_prefix)
      namespace = file.delete_prefix(file_prefix).split('/').first
      own_feature = namespace.split('_').map(&:capitalize).join
    end
    pure = !test_file && file.start_with?(file_prefix) && file.include?('/internal/domain/')
    report = lambda do |rule, line, subject, message, last_line = nil|
      issues << { file: file, line: line, rule: rule, subject: subject, message: message, lastLine: last_line }
    end
    check_tests(syntax, report, test_titles) if test_file

    unless infrastructure
      tokens.each do |(line, _), type, text|
        next unless type == :on_comment && text.match?(/\b(?:rubocop:(?:disable|todo)|standard:disable|steep:ignore|typed:\s*(?:ignore|false))\b/)

        report.call('no-suppression', line, text.strip, '抑止コメントを外し、型・lint の原因を修正してください。')
      end
    end

    significant = tokens.reject { |_, type, _| %i[on_sp on_ignored_nl on_comment].include?(type) }
    significant.each_with_index do |((line, _), type, text), index|
      previous = significant[index - 1] if index.positive?
      if !test_file && !infrastructure && type == :on_ident && raw_methods.include?(text) &&
         !%w[: def].include?(previous&.at(2))
        report.call('raw-sql', line, text, 'Redmine のモデル API を使うか、SQL を TaskFlow::Infrastructure に集約してください。')
      end
      if pure && type == :on_const && framework_constants.include?(text)
        report.call('domain-framework', line, text, 'Redmine/Rails の値を公開サービス側で変換して、ドメインへ渡してください。')
      end

      if type == :on_ident && %w[require require_relative load autoload].include?(text)
        path_token = significant.drop(index + 1).take_while { |token| token[1] != :on_nl }.find { |token| token[1] == :on_tstring_content }
        path = path_token&.at(2)
        if path && (path.include?('task_flow/features/') ||
                    File.expand_path(path, File.dirname(file)).start_with?(File.join(root, file_prefix)))
          report.call('feature-autoload', line, path, 'Rails の自動読み込みを使い、機能への参照は Public 定数を経由してください。')
        end
      end

      next unless type == :on_const && %w[TaskFlow Features].include?(text)
      if text == 'Features' && previous&.at(2) == '::' && index >= 2 && significant[index - 2][1] == :on_const
        next
      end

      names = [text]
      cursor = index + 1
      while significant[cursor]&.at(2) == '::' && significant[cursor + 1]&.at(1) == :on_const
        names << significant[cursor + 1][2]
        cursor += 2
      end
      names = ['TaskFlow', *names] if names.first == 'Features' && file.start_with?('app/services/task_flow/')
      next unless names.take(2) == feature_prefix && names.length >= 3

      _, _, feature, entry = names
      if (test_file || own_feature != feature) && (entry != 'Public' || names.length != 4)
        report.call('feature-public-entry', line, names.join('::'), 'TaskFlow::Features::<Feature>::Public を経由してください。')
      elsif pure && (own_feature != feature || entry != 'Internal' || names[4] != 'Domain')
        report.call('domain-direction', line, names.join('::'), 'ドメインからは同じ機能の Internal::Domain を参照してください。')
      end
    end
  end
end

puts JSON.generate(issues: issues, testTitles: test_titles)
