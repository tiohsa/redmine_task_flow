import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const tools = new URL('./', import.meta.url);

test('Ratchet Mode allows existing occurrences and rejects new or stale exceptions', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'task-flow-architecture-'));
  context.after(() => rm(root, { recursive: true, force: true }));

  async function write(file, content) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  await mkdir(join(root, 'verification'));
  for (const name of ['check-architecture.mjs', 'check-spec-coverage.mjs', 'check-typescript.mjs', 'check_ruby.rb']) {
    await copyFile(new URL(name, tools), join(root, 'verification', name));
  }
  await write('frontend/package.json', '{}');
  await write('frontend/tsconfig.json', '{"include":["src","tests"],"compilerOptions":{"module":"ESNext"}}');
  await symlink(fileURLToPath(new URL('../frontend/node_modules', tools)), join(root, 'frontend/node_modules'), 'dir');

  const app = 'frontend/src/App.ts';
  const legacy = 'window.localStorage.getItem("x");\n';
  const baseline = 'verification/architecture-baseline.json';

  async function check(args = [], env = {}) {
    const log = join(root, 'result.txt');
    const fd = openSync(log, 'w');
    try {
      const child = spawn(process.execPath, ['verification/check-architecture.mjs', ...args], {
        cwd: root,
        env: { ...process.env, TASK_FLOW_BASELINE_REFERENCE: '', ...env },
        stdio: ['ignore', fd, fd],
      });
      const status = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
      });
      return { status, output: await readFile(log, 'utf8') };
    } finally {
      closeSync(fd);
    }
  }

  await write(app, legacy);
  const initial = await check(['--print-baseline']);
  assert.equal(initial.status, 0, initial.output);
  assert.equal(JSON.parse(initial.output).length, 1);
  await write(baseline, initial.output);

  await write(app, '\n' + legacy);
  assert.equal((await check()).status, 0);
  await write(app, legacy.repeat(2));
  const duplicate = await check();
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.output, /App\.ts:2 \[raw-browser-api\]/);

  const reference = 'verification/reference.json';
  await write(reference, initial.output);
  await write(baseline, (await check(['--print-baseline'])).output);
  const expanded = await check([], { TASK_FLOW_BASELINE_REFERENCE: join(root, reference) });
  assert.equal(expanded.status, 1);
  assert.match(expanded.output, /比較元のベースラインにない例外/);
  await write(baseline, initial.output);

  await write(app, '');
  const stale = await check();
  assert.equal(stale.status, 1);
  assert.match(stale.output, /解消済みの例外/);
  await write(baseline, '[]');

  const feature = 'frontend/src/features/preview';
  await write(feature + '/index.ts', 'export { preview } from "./internal/domain/value";\n');
  await write(feature + '/internal/domain/value.ts', 'export const preview = 1;\n');
  await write(app, 'import { preview } from "./features/preview/index";\nexport { preview };\n');
  await write('app/services/task_flow/features/preview/public.rb', 'module TaskFlow::Features::Preview\n  class Public; end\nend\n');
  await write('app/controllers/preview_controller.rb', '::TaskFlow::Features::Preview::Public.new\n');
  const undocumented = await check();
  assert.equal(undocumented.status, 1);
  assert.match(undocumented.output, /\[spec-coverage\] docs\/preview\/SPEC\.md/);
  await write('docs/preview/SPEC.md', '- 正常系 `PREVIEW-01` ノードの件数を返す。\n- 境界値 `PREVIEW-02` 空なら 0 を返す。\n');
  await write('frontend/tests/contract.test.ts', 'test("PREVIEW-01 counts nodes", () => { expect(preview(["a"])).toBe(1); });\n');
  await write('test/contract_test.rb', "test 'PREVIEW-02 counts an empty flow' do\n  assert_equal 0, preview([])\nend\n");
  const valid = await check();
  assert.equal(valid.status, 0, valid.output);

  await write('frontend/tests/contract.test.ts', 'test.skip("PREVIEW-01 counts nodes", () => { expect(preview(["a"])).toBe(1); });\n');
  const skipped = await check();
  assert.equal(skipped.status, 1);
  assert.match(skipped.output, /\[spec-coverage\].+PREVIEW-01/);
  await write('frontend/tests/contract.test.ts', 'test("PREVIEW-01 counts nodes", () => { expect(preview(["a"])).toBe(1); });\n');

  await write(app, 'export { preview } from "./features/preview/internal/domain/value";\ntype X = import("./features/preview/internal/domain/value").T;\n');
  await write(feature + '/internal/domain/value.ts', 'import "../../index";\n// @ts-ignore\nexport const preview = window["fetch"]("/");\n');
  await write('app/controllers/preview_controller.rb', '::TaskFlow::Features::Preview::Internal::Value.new\n# rubocop:disable all\nActiveRecord::Base.connection.execute("SELECT 1")\n');
  const invalid = await check();
  assert.equal(invalid.status, 1);
  assert.match(invalid.output, /App\.ts:1 \[feature-public-entry\]/);
  assert.match(invalid.output, /App\.ts:2 \[feature-public-entry\]/);
  assert.match(invalid.output, /value\.ts:1 \[domain-direction\]/);
  assert.match(invalid.output, /value\.ts:2 \[no-suppression\]/);
  assert.match(invalid.output, /value\.ts:3 \[raw-browser-api\]/);
  assert.match(invalid.output, /preview_controller\.rb:1 \[feature-public-entry\]/);
  assert.match(invalid.output, /preview_controller\.rb:2 \[no-suppression\]/);
  assert.match(invalid.output, /preview_controller\.rb:3 \[raw-sql\]/);

  const frontendTest = 'frontend/tests/preview.test.ts';
  const backendTest = 'test/preview_test.rb';
  await write(app, '');
  await write(feature + '/internal/domain/value.ts', 'export const preview = 1;\n');
  await write('app/controllers/preview_controller.rb', '');
  await write(frontendTest, `
import { preview } from '../src/features/preview';
vi.mock('../src/api/client');
test('public contract', () => {
  expect(preview).toBe(1);
  expect(() => action()).toThrow(RangeError);
});
`);
  await write(backendTest, `
test 'public contract' do
  assert_equal 1, TaskFlow::Features::Preview::Public.call
  assert_raises(ArgumentError) { action }
end
`);
  const publicTests = await check();
  assert.equal(publicTests.status, 0, publicTests.output);

  const weakTests = `import '../src/features/preview/internal/domain/value';
vi.mock(import('../src/features/preview'));
test('weak assertions', () => {
  expect(value).toBeDefined();
  expect(() => action()).toThrow();
});
test.each([1])('spy only', () => {
  expect(spy).toHaveBeenCalledWith(1);
});
test('too many assertions', () => {
${Array.from({ length: 6 }, (_, index) => `  expect(value).toBe(${index});`).join('\n')}
});
`;
  await write(frontendTest, weakTests);
  await write(backendTest, `# rubocop:disable all
def test_weak
  TaskFlow::Features::Preview::Internal::Value.call
  ::TaskFlow::Features::Preview::Public.stub(:call, 1) { action }
  assert_raises() { action }
  assert_not_nil action
end
test('spy only') { assert_called spy }
test 'too many assertions' do
${Array.from({ length: 6 }, (_, index) => `  assert_equal ${index}, value`).join('\n')}
end
`);
  const poorTests = await check();
  assert.equal(poorTests.status, 1);
  for (const [file, lines] of [
    ['preview.test.ts', ['1 [feature-public-entry]', '2 [test-internal-mock]', '4 [test-weak-assertion]',
      '5 [test-weak-assertion]', '7 [test-spy-only]', '10 [test-size]']],
    ['preview_test.rb', ['1 [no-suppression]', '3 [feature-public-entry]', '4 [test-internal-mock]',
      '5 [test-weak-assertion]', '6 [test-weak-assertion]', '8 [test-spy-only]', '9 [test-size]']],
  ]) {
    for (const line of lines) {
      assert.ok(poorTests.output.includes(`${file}:${line}`), poorTests.output);
    }
  }

  const existingTests = await check(['--print-baseline']);
  assert.equal(existingTests.status, 0, existingTests.output);
  await write(baseline, existingTests.output);
  await write(frontendTest, '\n' + weakTests);
  assert.equal((await check()).status, 0);
  await write(frontendTest, weakTests.replace('expect(value).toBe(5);', 'expect(value).toBe(50);'));
  const changedCase = await check();
  assert.equal(changedCase.status, 1);
  assert.ok(changedCase.output.includes('preview.test.ts:10 [test-size]'), changedCase.output);
});
