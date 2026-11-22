import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { issues as typescriptIssues, testTitles } from './check-typescript.mjs';
import { checkSpecCoverage } from './check-spec-coverage.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const baselinePath = new URL('./architecture-baseline.json', import.meta.url);
const run = promisify(execFile);
const { stdout } = await run('ruby', ['verification/check_ruby.rb'], { cwd: root });
const ruby = JSON.parse(stdout);
const issues = [...typescriptIssues, ...ruby.issues];

const sourceLines = new Map();
function entryFor({ file, line, rule, subject, caseSource, lastLine }) {
  if (!sourceLines.has(file)) {
    sourceLines.set(file, readFileSync(new URL('../' + file, import.meta.url), 'utf8').split(/\r?\n/));
  }
  const lines = sourceLines.get(file);
  const source = lines[line - 1].trim();
  const testCase = caseSource ?? (lastLine ? lines.slice(line - 1, lastLine).join('\n') : undefined);
  const fingerprint = testCase === undefined ? '' : createHash('sha256').update(testCase.replace(/\r\n/g, '\n')).digest('hex');
  return [file, rule, subject, fingerprint ? `${source} [sha256:${fingerprint}]` : source];
}

const entries = issues.map(entryFor);

function countEntries(baseline) {
  const counts = new Map();
  for (const entry of baseline) {
    const key = JSON.stringify(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

if (process.argv[2] === '--print-baseline' && process.argv.length === 3) {
  const rows = entries.map((entry) => JSON.stringify(entry)).sort();
  process.stdout.write(rows.length ? '[\n  ' + rows.join(',\n  ') + '\n]\n' : '[]\n');
} else if (process.argv.length === 2) {
  for (const error of checkSpecCoverage(root, [...testTitles, ...ruby.testTitles])) {
    console.error(`[spec-coverage] ${error}`);
    process.exitCode = 1;
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  if (!Array.isArray(baseline) || !baseline.every((entry) =>
    Array.isArray(entry) && entry.length === 4 && entry.every((value) => typeof value === 'string'))) {
    throw new Error('architecture-baseline.json の各行にパス、ルール、対象、ソース行を指定してください。');
  }

  const previousBaseline = process.env.TASK_FLOW_BASELINE_REFERENCE;
  if (previousBaseline) {
    const previousCounts = countEntries(JSON.parse(readFileSync(previousBaseline, 'utf8')));
    for (const [entry, count] of countEntries(baseline)) {
      if (count > (previousCounts.get(entry) ?? 0)) {
        console.error(`比較元のベースラインにない例外を追加できません ${entry}`);
        process.exitCode = 1;
      }
    }
  }
  const remaining = countEntries(baseline);
  issues.forEach(({ file, line, rule, subject, message }, index) => {
    const key = JSON.stringify(entries[index]);
    if (remaining.has(key)) {
      const count = remaining.get(key);
      if (count === 1) remaining.delete(key);
      else remaining.set(key, count - 1);
    } else {
      console.error(`${file}:${line} [${rule}] ${subject} — ${message}`);
      process.exitCode = 1;
    }
  });
  for (const [entry, count] of remaining) {
    console.error(`解消済みの例外をベースラインから削除してください (${count} 件) ${entry}`);
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log(`境界チェック PASS（既存例外 ${baseline.length} 件）`);
} else {
  console.error('使い方: node verification/check-architecture.mjs [--print-baseline]');
  process.exitCode = 2;
}
