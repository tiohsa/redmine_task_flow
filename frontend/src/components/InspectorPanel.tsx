import React, { useEffect, useRef } from 'react';
import { useFlowStore } from '../store/useFlowStore';
import { validateNodeAttributes } from '../domain/nodeValidation';
import type { CustomFieldMeta, FlowSnapshot } from '../types/flow';

export const InspectorPanel: React.FC = () => {
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const editSnapshotRef = useRef<FlowSnapshot | null>(null);

  const bootstrap = useFlowStore((s) => s.bootstrap);
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const baseDate = useFlowStore((s) => s.baseDate);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const selectedEdgeId = useFlowStore((s) => s.selectedEdgeId);
  const validationErrors = useFlowStore((s) => s.validationErrors);
  const isSubmitted = useFlowStore((s) => s.isSubmitted);
  const focusSubjectSeq = useFlowStore((s) => s.focusSubjectSeq);
  const isInspectorCollapsed = useFlowStore((s) => s.isInspectorCollapsed);

  const deleteSelected = useFlowStore((s) => s.deleteSelected);
  const detachFromGroup = useFlowStore((s) => s.detachFromGroup);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const updateEdgeDelay = useFlowStore((s) => s.updateEdgeDelay);
  const pushSnapshot = useFlowStore((s) => s.pushSnapshot);
  const toggleInspectorCollapsed = useFlowStore(
    (s) => s.toggleInspectorCollapsed,
  );

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;
  const selectedEdge = selectedEdgeId
    ? edges.find((e) => e.id === selectedEdgeId) ?? null
    : null;

  useEffect(() => {
    if (focusSubjectSeq > 0 && selectedNode && subjectInputRef.current) {
      subjectInputRef.current.focus();
      subjectInputRef.current.select();
    }
    // Only focus when focusSubjectSeq explicitly increments (add node / dblclick), not on every node selection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSubjectSeq]);

  const captureSnapshotOnFocus = () => {
    editSnapshotRef.current = {
      nodes,
      edges,
      baseDate,
    };
  };

  const commitSnapshotOnBlur = (changed: boolean) => {
    if (changed && editSnapshotRef.current) {
      pushSnapshot(editSnapshotRef.current);
    }
    editSnapshotRef.current = null;
  };

  const renderCustomFieldInput = (
    cf: CustomFieldMeta,
    value: string,
    onChangeVal: (val: string) => void,
  ) => {
    const commonClass =
      'w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-xs focus:outline-none focus:border-sky-500 disabled:bg-slate-100';
    const selectClass =
      'w-full border border-slate-300 rounded-lg pl-2.5 pr-7 py-1.5 bg-white text-xs focus:outline-none focus:border-sky-500 disabled:bg-slate-100';

    if (cf.field_format === 'list') {
      return (
        <select
          value={value}
          disabled={isSubmitted}
          onChange={(e) => onChangeVal(e.target.value)}
          className={selectClass}
        >
          <option value="">（選択してください）</option>
          {(cf.possible_values ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (cf.field_format === 'bool') {
      return (
        <select
          value={value}
          disabled={isSubmitted}
          onChange={(e) => onChangeVal(e.target.value)}
          className={selectClass}
        >
          <option value="">（未選択）</option>
          <option value="1">はい</option>
          <option value="0">いいえ</option>
        </select>
      );
    }

    if (cf.field_format === 'text') {
      return (
        <textarea
          rows={2}
          value={value}
          disabled={isSubmitted}
          onFocus={captureSnapshotOnFocus}
          onChange={(e) =>
            updateNodeData(
              selectedNode!.id,
              {
                customFieldValues: {
                  ...selectedNode!.data.customFieldValues,
                  [String(cf.id)]: e.target.value,
                },
              },
              { recordHistory: false },
            )
          }
          onBlur={() => commitSnapshotOnBlur(true)}
          className={commonClass}
        />
      );
    }

    if (cf.field_format === 'int' || cf.field_format === 'float') {
      return (
        <input
          type="number"
          step={cf.field_format === 'float' ? '0.1' : '1'}
          value={value}
          disabled={isSubmitted}
          onChange={(e) => onChangeVal(e.target.value)}
          className={commonClass}
        />
      );
    }

    if (cf.field_format === 'date') {
      return (
        <input
          type="date"
          value={value}
          disabled={isSubmitted}
          onChange={(e) => onChangeVal(e.target.value)}
          className={commonClass}
        />
      );
    }

    // Default / fallback string input
    return (
      <input
        type="text"
        value={value}
        disabled={isSubmitted}
        onFocus={captureSnapshotOnFocus}
        onChange={(e) =>
          updateNodeData(
            selectedNode!.id,
            {
              customFieldValues: {
                ...selectedNode!.data.customFieldValues,
                [String(cf.id)]: e.target.value,
              },
            },
            { recordHistory: false },
          )
        }
        onBlur={() => commitSnapshotOnBlur(true)}
        className={commonClass}
      />
    );
  };

  const renderContent = () => {
    if (selectedEdge) {
      const src = nodes.find((n) => n.id === selectedEdge.source);
      const tgt = nodes.find((n) => n.id === selectedEdge.target);
      const delay = Number(selectedEdge.data?.delay ?? 0) || 0;

      return (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 space-y-1">
            <div className="font-bold">先行・後続関係 (precedes)</div>
            <p className="text-sky-700">
              先行チケット完了後、待機日数（delay）を経過してから後続チケットを開始します。
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block text-[11px]">
                先行タスク (Source)
              </span>
              <span className="font-semibold text-slate-800">
                {src?.data.subject || selectedEdge.source}
              </span>
            </div>
            <div className="flex justify-center text-slate-400">↓</div>
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block text-[11px]">
                後続タスク (Target)
              </span>
              <span className="font-semibold text-slate-800">
                {tgt?.data.subject || selectedEdge.target}
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="edge-delay-input"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              待機日数 / ラグ (IssueRelation#delay)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="edge-delay-input"
                type="number"
                min={0}
                max={60}
                disabled={isSubmitted}
                value={delay}
                onChange={(e) =>
                  updateEdgeDelay(selectedEdge.id, Number(e.target.value))
                }
                className="w-24 border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-sm font-medium focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
              />
              <span className="text-xs text-slate-500">
                日（0〜60、0 = 翌日から着手）
              </span>
            </div>
          </div>
        </div>
      );
    }

    if (selectedNode) {
      const isGroup = selectedNode.type === 'groupNode';
      const tracker = bootstrap?.trackers.find(
        (t) => t.id === Number(selectedNode.data.trackerId),
      );
      const disabledFields = new Set(tracker?.disabled_core_fields ?? []);
      const allowedStatusIds = new Set(tracker?.allowed_status_ids ?? []);
      const availableStatuses = (bootstrap?.statuses ?? []).filter(
        (s) => allowedStatusIds.size === 0 || allowedStatusIds.has(s.id),
      );

      const localErrors = validateNodeAttributes(selectedNode, bootstrap);
      const serverErrors = validationErrors[selectedNode.id] ?? [];
      const errors = serverErrors.length > 0 ? serverErrors : localErrors;

      const parentGroup =
        !isGroup && selectedNode.parentId
          ? nodes.find((n) => n.id === selectedNode.parentId)
          : null;

      return (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-xs">
          {errors.length > 0 && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs space-y-1">
              <div className="font-bold">入力エラーがあります</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {parentGroup && (
            <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-indigo-500 block">
                  親チケット (parent_issue_id)
                </span>
                <span className="font-semibold truncate block">
                  {parentGroup.data.subject || '親チケット'}
                </span>
              </div>
              {!isSubmitted && (
                <button
                  type="button"
                  onClick={() => detachFromGroup(selectedNode.id)}
                  className="text-[11px] px-2 py-1 bg-white border border-indigo-200 rounded hover:bg-indigo-100 text-indigo-700 shrink-0"
                >
                  枠から外す
                </button>
              )}
            </div>
          )}

          {/* Subject */}
          <div>
            <label
              htmlFor="field-subject"
              className="block font-semibold text-slate-700 mb-1"
            >
              題名 (Subject) <span className="text-rose-500">*</span>
            </label>
            <input
              ref={subjectInputRef}
              id="field-subject"
              type="text"
              disabled={isSubmitted}
              value={selectedNode.data.subject}
              placeholder="例: 決済APIの設計書作成"
              onFocus={captureSnapshotOnFocus}
              onChange={(e) =>
                updateNodeData(
                  selectedNode.id,
                  { subject: e.target.value },
                  { recordHistory: false },
                )
              }
              onBlur={() => commitSnapshotOnBlur(true)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
            />
          </div>

          {/* Tracker & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label
                htmlFor="field-tracker"
                className="block font-semibold text-slate-700 mb-1"
              >
                トラッカー <span className="text-rose-500">*</span>
              </label>
              <select
                id="field-tracker"
                disabled={isSubmitted}
                value={selectedNode.data.trackerId}
                onChange={(e) =>
                  updateNodeData(selectedNode.id, {
                    trackerId: Number(e.target.value),
                  })
                }
                className="w-full border border-slate-300 rounded-lg pl-2.5 pr-7 py-1.5 bg-white focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
              >
                {(bootstrap?.trackers ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label
                htmlFor="field-status"
                className="block font-semibold text-slate-700 mb-1"
              >
                ステータス
              </label>
              <select
                id="field-status"
                disabled={isSubmitted}
                value={selectedNode.data.statusId}
                onChange={(e) =>
                  updateNodeData(selectedNode.id, {
                    statusId: Number(e.target.value),
                  })
                }
                className="w-full border border-slate-300 rounded-lg pl-2.5 pr-7 py-1.5 bg-white focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
              >
                {availableStatuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority & Assignee */}
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label
                htmlFor="field-priority"
                className="block font-semibold text-slate-700 mb-1"
              >
                優先度
              </label>
              <select
                id="field-priority"
                disabled={isSubmitted}
                value={selectedNode.data.priorityId}
                onChange={(e) =>
                  updateNodeData(selectedNode.id, {
                    priorityId: Number(e.target.value),
                  })
                }
                className="w-full border border-slate-300 rounded-lg pl-2.5 pr-7 py-1.5 bg-white focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
              >
                {(bootstrap?.priorities ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div
              className={`min-w-0 ${
                disabledFields.has('assigned_to_id')
                  ? 'opacity-40 pointer-events-none'
                  : ''
              }`}
            >
              <label
                htmlFor="field-assignee"
                className="block font-semibold text-slate-700 mb-1"
              >
                担当者
              </label>
              <select
                id="field-assignee"
                disabled={isSubmitted || disabledFields.has('assigned_to_id')}
                value={selectedNode.data.assignedToId ?? ''}
                onChange={(e) =>
                  updateNodeData(selectedNode.id, {
                    assignedToId: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
                className="w-full border border-slate-300 rounded-lg pl-2.5 pr-7 py-1.5 bg-white focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
              >
                <option value="">（未割当）</option>
                {(bootstrap?.assignable_users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Version & Estimated Hours */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className={`min-w-0 ${
                disabledFields.has('fixed_version_id')
                  ? 'opacity-40 pointer-events-none'
                  : ''
              }`}
            >
              <label
                htmlFor="field-version"
                className="block font-semibold text-slate-700 mb-1"
              >
                対象バージョン
              </label>
              <select
                id="field-version"
                disabled={isSubmitted || disabledFields.has('fixed_version_id')}
                value={selectedNode.data.fixedVersionId ?? ''}
                onChange={(e) =>
                  updateNodeData(selectedNode.id, {
                    fixedVersionId: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
                className="w-full border border-slate-300 rounded-lg pl-2.5 pr-7 py-1.5 bg-white focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
              >
                <option value="">（なし）</option>
                {(bootstrap?.versions ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div
              className={`min-w-0 ${
                isGroup || disabledFields.has('estimated_hours')
                  ? 'opacity-60'
                  : ''
              }`}
            >
              <label
                htmlFor="field-estimated-hours"
                className="block font-semibold text-slate-700 mb-1"
              >
                予定工数 (h)
              </label>
              <input
                id="field-estimated-hours"
                type="number"
                min={0}
                step="0.5"
                disabled={
                  isSubmitted ||
                  isGroup ||
                  disabledFields.has('estimated_hours')
                }
                value={selectedNode.data.estimatedHours ?? ''}
                placeholder={isGroup ? '自動集計' : '8.0'}
                onChange={(e) =>
                  updateNodeData(selectedNode.id, {
                    estimatedHours:
                      e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-700">
                スケジュール日程
              </span>
              {!isGroup && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-600">
                  <input
                    type="checkbox"
                    disabled={isSubmitted}
                    checked={!!selectedNode.data.lockDates}
                    onChange={(e) =>
                      updateNodeData(selectedNode.id, {
                        lockDates: e.target.checked,
                      })
                    }
                    className="rounded text-sky-600 focus:ring-sky-500"
                  />
                  <span>手動日程で固定</span>
                </label>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="min-w-0">
                <label
                  htmlFor="field-start-date"
                  className="block text-[11px] text-slate-500 mb-1"
                >
                  開始日
                </label>
                <input
                  id="field-start-date"
                  type="date"
                  disabled={
                    isSubmitted ||
                    isGroup ||
                    disabledFields.has('start_date')
                  }
                  value={selectedNode.data.startDate ?? ''}
                  onChange={(e) =>
                    updateNodeData(selectedNode.id, {
                      startDate: e.target.value || null,
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="field-due-date"
                  className="block text-[11px] text-slate-500 mb-1"
                >
                  期日
                </label>
                <input
                  id="field-due-date"
                  type="date"
                  disabled={
                    isSubmitted || isGroup || disabledFields.has('due_date')
                  }
                  value={selectedNode.data.dueDate ?? ''}
                  onChange={(e) =>
                    updateNodeData(selectedNode.id, {
                      dueDate: e.target.value || null,
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
                />
              </div>
            </div>

            {isGroup && (
              <p className="text-[11px] text-indigo-600">
                ※ 親チケットは Redmine 標準仕様により子チケットの期間・工数から自動集計されます。
              </p>
            )}
          </div>

          {/* Custom Fields */}
          {tracker && tracker.custom_fields.length > 0 && (
            <div className="space-y-2.5 pt-1 border-t border-slate-200">
              <div className="font-semibold text-slate-700 flex items-center justify-between">
                <span>カスタムフィールド</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  トラッカー連動
                </span>
              </div>
              <div className="space-y-2.5">
                {tracker.custom_fields.map((cf) => {
                  const val =
                    selectedNode.data.customFieldValues?.[String(cf.id)] ?? '';
                  return (
                    <div key={cf.id}>
                      <label className="block font-medium text-slate-700 mb-1">
                        {cf.name}{' '}
                        {cf.is_required && (
                          <span className="text-rose-500">*</span>
                        )}
                      </label>
                      {renderCustomFieldInput(cf, val, (newVal) =>
                        updateNodeData(selectedNode.id, {
                          customFieldValues: {
                            ...selectedNode.data.customFieldValues,
                            [String(cf.id)]: newVal,
                          },
                        }),
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Description */}
          <div
            className={
              disabledFields.has('description')
                ? 'opacity-40 pointer-events-none'
                : ''
            }
          >
            <label
              htmlFor="field-description"
              className="block font-semibold text-slate-700 mb-1"
            >
              説明 (Description)
            </label>
            <textarea
              id="field-description"
              rows={3}
              disabled={isSubmitted || disabledFields.has('description')}
              value={selectedNode.data.description}
              placeholder="作業内容や完了条件（Definition of Done）を記入..."
              onFocus={captureSnapshotOnFocus}
              onChange={(e) =>
                updateNodeData(
                  selectedNode.id,
                  { description: e.target.value },
                  { recordHistory: false },
                )
              }
              onBlur={() => commitSnapshotOnBlur(true)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-sky-500 disabled:bg-slate-100"
            />
          </div>
        </div>
      );
    }

    // Empty state
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400">
        <svg
          className="w-12 h-12 mb-3 text-slate-300"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
          />
        </svg>
        <p className="text-sm font-medium text-slate-600">
          ノードまたは矢印を選択してください
        </p>
        <p className="text-xs mt-1 leading-relaxed">
          左のキャンバスでタスクをクリックすると、トラッカー・担当者・工数・日程・必須カスタムフィールドを編集できます。
        </p>
      </div>
    );
  };

  const subtitle = selectedEdge
    ? 'Dependency Edge'
    : selectedNode
      ? selectedNode.type === 'groupNode'
        ? 'Parent Issue Group'
        : 'Task Issue Node'
      : 'Inspector';

  const title = selectedEdge
    ? '依存関係（先行・後続）の設定'
    : selectedNode?.type === 'groupNode'
      ? '親チケット枠の属性編集'
      : 'チケット属性編集';

  if (isInspectorCollapsed) {
    return (
      <aside
        aria-label="インスペクタパネル"
        className="w-10 bg-white border-l border-slate-200 shadow-lg z-20 flex flex-col items-center py-3 shrink-0"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleInspectorCollapsed();
          }}
          aria-expanded="false"
          aria-label="インスペクタパネルを展開"
          title="パネルを展開"
          className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="インスペクタパネル"
      className="w-80 max-w-full sm:w-96 lg:w-[420px] xl:w-[460px] bg-white border-l border-slate-200 shadow-lg z-20 flex flex-col shrink-0"
    >
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
            {subtitle}
          </span>
          <h2 className="text-sm font-bold text-slate-800 m-0 truncate">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(selectedNode || selectedEdge) && !isSubmitted && (
            <button
              type="button"
              onClick={deleteSelected}
              className="px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition"
            >
              削除
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleInspectorCollapsed();
            }}
            aria-expanded="true"
            aria-label="インスペクタパネルを折りたたむ"
            title="パネルを折りたたむ"
            className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-200/70 rounded-lg transition"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      {renderContent()}
    </aside>
  );
};
