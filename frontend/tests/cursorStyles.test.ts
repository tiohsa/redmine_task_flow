import { describe, expect, it } from 'vitest';
// @ts-expect-error @types/node is not installed in frontend devDependencies
import { readFileSync } from 'node:fs';

describe('cursor visibility styles', () => {
  const indexCss: string = readFileSync('src/index.css', 'utf-8');

  it('defines high-contrast SVG grab and grabbing cursors scoped under .task-flow-root', () => {
    expect(indexCss).toContain('--task-flow-cursor-grab: url("data:image/svg+xml,');
    expect(indexCss).toContain('--task-flow-cursor-grabbing: url("data:image/svg+xml,');
    expect(indexCss).toContain("fill='%23ffffff'");
    expect(indexCss).toContain("stroke='%230f172a'");
    expect(indexCss).toMatch(/--task-flow-cursor-grab:.*, grab;/);
    expect(indexCss).toMatch(/--task-flow-cursor-grabbing:.*, grabbing;/);
  });

  it('overrides React Flow pane, node, and selection grab/grabbing cursors within .task-flow-root', () => {
    const grabSelectors = [
      '.task-flow-root .react-flow__pane.draggable',
      '.task-flow-root .react-flow__node.draggable',
      '.task-flow-root .react-flow__nodesselection-rect',
    ];
    for (const selector of grabSelectors) {
      expect(indexCss).toContain(selector);
    }
    expect(indexCss).toContain('cursor: var(--task-flow-cursor-grab);');

    const grabbingSelectors = [
      '.task-flow-root .react-flow__pane.dragging',
      '.task-flow-root .react-flow__node.draggable.dragging',
    ];
    for (const selector of grabbingSelectors) {
      expect(indexCss).toContain(selector);
    }
    expect(indexCss).toContain('cursor: var(--task-flow-cursor-grabbing);');
  });
});
