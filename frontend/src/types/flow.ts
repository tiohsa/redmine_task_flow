import type { Edge, Node } from '@xyflow/react';

export interface BootstrapProject {
  id: number;
  identifier: string;
  name: string;
}

export interface CustomFieldMeta {
  id: number;
  name: string;
  field_format: string;
  is_required: boolean;
  possible_values?: string[];
  default_value?: string | null;
}

export interface TrackerMeta {
  id: number;
  name: string;
  default_status_id: number;
  allowed_status_ids: number[];
  disabled_core_fields: string[];
  custom_fields: CustomFieldMeta[];
}

export interface StatusMeta {
  id: number;
  name: string;
  is_default: boolean;
}

export interface PriorityMeta {
  id: number;
  name: string;
  is_default: boolean;
}

export interface UserMeta {
  id: number;
  name: string;
}

export interface VersionMeta {
  id: number;
  name: string;
}

export interface BootstrapData {
  project: BootstrapProject;
  trackers: TrackerMeta[];
  statuses: StatusMeta[];
  priorities: PriorityMeta[];
  assignable_users: UserMeta[];
  versions: VersionMeta[];
  current_user_id: number;
}

export interface TaskNodeData extends Record<string, unknown> {
  subject: string;
  trackerId: number;
  statusId: number;
  priorityId: number;
  assignedToId: number | null;
  fixedVersionId: number | null;
  estimatedHours: number | null;
  startDate: string | null;
  dueDate: string | null;
  lockDates: boolean;
  description: string;
  customFieldValues: Record<string, string>;
  createdIssueId?: number | null;
}

export type TaskFlowNodeType = 'taskNode' | 'groupNode';
export type TaskFlowNode = Node<TaskNodeData, TaskFlowNodeType>;

export interface DependencyEdgeData extends Record<string, unknown> {
  delay: number;
}

export type TaskFlowEdge = Edge<DependencyEdgeData, 'dependencyEdge'>;

export interface FlowSnapshot {
  nodes: TaskFlowNode[];
  edges: TaskFlowEdge[];
  baseDate: string;
}

export interface CreatedIssueResult {
  id: number;
  startDate: string | null;
  dueDate: string | null;
}

export interface BulkCreateIssuePayload {
  temp_id: string;
  parent_temp_id: string | null;
  is_group: boolean;
  tracker_id: number;
  subject: string;
  status_id: number;
  priority_id: number;
  assigned_to_id: number | null;
  fixed_version_id: number | null;
  estimated_hours: number | null;
  start_date: string | null;
  due_date: string | null;
  custom_field_values: Record<string, string>;
  description: string;
}

export interface BulkCreateRelationPayload {
  source_temp_id: string;
  target_temp_id: string;
  relation_type: 'precedes';
  delay: number;
}

export interface BulkCreateRequestPayload {
  issues: BulkCreateIssuePayload[];
  relations: BulkCreateRelationPayload[];
}

export interface BulkCreateSuccessResponse {
  issues: Array<{
    temp_id: string;
    id: number;
    start_date: string | null;
    due_date: string | null;
  }>;
  relations: Array<{
    id: number;
    source_temp_id: string;
    target_temp_id: string;
  }>;
}

export interface BulkCreateErrorItem {
  temp_id: string | null;
  messages: string[];
}

export interface BulkCreateErrorResponse {
  errors: BulkCreateErrorItem[];
}

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}
