require_relative '../test_helper'

class RedmineTaskFlowPluginTest < ActiveSupport::TestCase
  def test_plugin_is_registered_under_its_directory_name
    plugin = Redmine::Plugin.find(:redmine_task_flow)

    assert_equal 'Redmine Task Flow', plugin.name
  end
end
