/**
 * JSON Schema (Draft 2020-12) describing the exported Task Flow JSON payload
 * (`SerializedFlowData` with `schema_version: 1`).
 */
export const TASK_FLOW_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Redmine Task Flow Export JSON',
  description:
    'Redmine Task Flow でエクスポート／インポートされるタスクフロー定義（schema_version: 1）',
  type: 'object',
  required: ['schema_version', 'baseDate', 'nodes', 'edges'],
  additionalProperties: false,
  properties: {
    schema_version: {
      type: 'integer',
      const: 1,
      description: 'スキーマバージョン（固定値 1）',
    },
    baseDate: {
      type: 'string',
      format: 'date',
      description: 'フロー基準日（YYYY-MM-DD）',
    },
    nodes: {
      type: 'array',
      description: 'タスクおよび親グループ枠ノードの配列',
      items: {
        $ref: '#/$defs/TaskFlowNode',
      },
    },
    edges: {
      type: 'array',
      description: '先行・後続の依存関係エッジ配列',
      items: {
        $ref: '#/$defs/TaskFlowEdge',
      },
    },
  },
  $defs: {
    TaskFlowNode: {
      type: 'object',
      required: ['id', 'type', 'position', 'data'],
      properties: {
        id: {
          type: 'string',
          minLength: 1,
          description: 'ノードの一意な一時 ID',
        },
        type: {
          type: 'string',
          enum: ['taskNode', 'groupNode'],
          description: 'ノード種別（taskNode: 通常タスク / groupNode: 親グループ枠）',
        },
        position: {
          type: 'object',
          required: ['x', 'y'],
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
        },
        parentId: {
          type: ['string', 'null'],
          description: '所属する親グループノードの id',
        },
        extent: {
          type: 'string',
          enum: ['parent'],
          description: '親グループ内への移動制限（parent）',
        },
        style: {
          type: 'object',
          properties: {
            width: { type: 'number' },
            height: { type: 'number' },
          },
        },
        selected: {
          type: 'boolean',
          description: '選択状態（エクスポート時は false）',
        },
        data: {
          $ref: '#/$defs/TaskNodeData',
        },
      },
    },
    TaskNodeData: {
      type: 'object',
      required: [
        'subject',
        'trackerId',
        'statusId',
        'priorityId',
        'assignedToId',
        'fixedVersionId',
        'estimatedHours',
        'startDate',
        'dueDate',
        'lockDates',
        'description',
        'customFieldValues',
      ],
      properties: {
        subject: { type: 'string', description: 'チケット題名' },
        trackerId: { type: 'integer', description: 'トラッカー ID' },
        statusId: { type: 'integer', description: 'ステータス ID' },
        priorityId: { type: 'integer', description: '優先度 ID' },
        assignedToId: {
          type: ['integer', 'null'],
          description: '担当者ユーザー ID（未割当は null）',
        },
        fixedVersionId: {
          type: ['integer', 'null'],
          description: '対象バージョン ID（未設定は null）',
        },
        estimatedHours: {
          type: ['number', 'null'],
          minimum: 0,
          description: '予定工数（時間）',
        },
        startDate: {
          type: ['string', 'null'],
          format: 'date',
          description: '開始日（YYYY-MM-DD）',
        },
        dueDate: {
          type: ['string', 'null'],
          format: 'date',
          description: '期日（YYYY-MM-DD）',
        },
        lockDates: {
          type: 'boolean',
          description: '日程自動伝播からの保護フラグ',
        },
        description: { type: 'string', description: 'チケット説明' },
        customFieldValues: {
          type: 'object',
          description: 'カスタムフィールド値マップ（キー: フィールド ID 文字列）',
          additionalProperties: { type: 'string' },
        },
        createdIssueId: {
          type: ['integer', 'null'],
          description: '作成済み Redmine チケット ID（エクスポート時は null）',
        },
      },
    },
    TaskFlowEdge: {
      type: 'object',
      required: ['id', 'source', 'target'],
      properties: {
        id: { type: 'string', minLength: 1, description: 'エッジの一意 ID' },
        source: { type: 'string', minLength: 1, description: '先行ノード ID' },
        target: { type: 'string', minLength: 1, description: '後続ノード ID' },
        type: {
          type: 'string',
          enum: ['dependencyEdge'],
          description: 'エッジ種別',
        },
        selected: {
          type: 'boolean',
          description: '選択状態（エクスポート時は false）',
        },
        data: {
          type: 'object',
          required: ['delay'],
          properties: {
            delay: {
              type: 'integer',
              minimum: 0,
              description: '先行タスク完了からの遅延日数（営業日）',
            },
          },
        },
      },
    },
  },
} as const;

export const TASK_FLOW_JSON_SCHEMA_TEXT = JSON.stringify(
  TASK_FLOW_JSON_SCHEMA,
  null,
  2,
);
