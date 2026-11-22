import { existsSync, globSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export function checkSpecCoverage(root, testTitles) {
  const featureRoots = [
    ['frontend/src/features', 'index.ts'],
    ['app/services/task_flow/features', 'public.rb'],
  ];
  const features = new Set();
  const errors = [];
  for (const [directory, entry] of featureRoots) {
    for (const path of globSync(`${directory}/*/`, { cwd: root })) {
      if (!existsSync(join(root, path, entry))) errors.push(`${path}: 公開入口 ${entry} を置いてください。`);
      features.add(basename(path).replaceAll('_', '-'));
    }
  }

  const testIds = new Set(testTitles.map((title) => title.split(/\s+/, 1)[0]));
  for (const feature of features) {
    const spec = `docs/${feature}/SPEC.md`;
    if (!existsSync(join(root, spec))) {
      errors.push(`${spec}: 正常系と境界値または失敗系の受け入れ条件を書いてください。`);
      continue;
    }

    const source = readFileSync(join(root, spec), 'utf8');
    const scenarios = [...source.matchAll(/^- (正常系|境界値|失敗系) `([A-Z][A-Z0-9-]+)`[ \t]+\S[^\r\n]*$/gm)];
    if (!scenarios.some(([, kind]) => kind === '正常系') || !scenarios.some(([, kind]) => kind !== '正常系')) {
      errors.push(`${spec}: 「- 正常系 \`TEST-ID\` 条件」と「- 境界値（または失敗系） \`TEST-ID\` 条件」を対応づけてください。`);
    }
    for (const [, , id] of scenarios) {
      if (!testIds.has(id)) errors.push(`${spec}: ${id} で始まるテスト名を追加してください。`);
    }
  }
  return errors;
}
