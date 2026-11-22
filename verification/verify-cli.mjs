#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const frontend = join(root, 'frontend');
const args = process.argv.slice(2);
const local = args.length === 1 && args[0] === '--local';
const start = performance.now();
const elapsed = (since) => Math.round(performance.now() - since);
const checks = [];
const metrics = {};
const artifacts = [];

async function readSmokeBudget() {
  const began = performance.now();
  try {
    const { features } = JSON.parse(await readFile(new URL('./feature-map.json', import.meta.url), 'utf8'));
    const editor = features.find(({ id }) => id === 'task-flow-editor');
    const budget = editor?.performanceBudget?.maxSmokeDurationMs;
    if (!Number.isSafeInteger(budget) || budget <= 0) {
      throw new Error('task-flow-editor の performanceBudget.maxSmokeDurationMs に正の整数を設定してください。');
    }
    checks.push({ id: 'feature-map', status: 'passed', durationMs: elapsed(began) });
    return budget;
  } catch (error) {
    console.error(`[feature-map] ${error.message}`);
    checks.push({ id: 'feature-map', status: 'failed', durationMs: elapsed(began) });
  }
}

function run(id, command, commandArgs, { cwd = root, after } = {}) {
  if (after && checks.find((check) => check.id === after)?.status !== 'passed') {
    checks.push({ id, status: 'skipped', durationMs: 0, dependency: after });
    return Promise.resolve();
  }
  console.error(`[${id}] ${command} ${commandArgs.join(' ')}`);
  const began = performance.now();
  return new Promise((done) => {
    const child = spawn(command, commandArgs, { cwd, stdio: ['ignore', 2, 2] });
    child.on('error', (error) => {
      console.error(error.message);
      checks.push({ id, status: 'failed', durationMs: elapsed(began), error: error.code });
      done();
    });
    child.on('exit', (exitCode, signal) => {
      const result = { id, status: exitCode === 0 ? 'passed' : 'failed', durationMs: elapsed(began), exitCode, signal };
      checks.push(result);
      done(result);
    });
  });
}

if (args.length && !local) {
  console.error('使い方: node verification/verify-cli.mjs [--local]');
  checks.push({ id: 'arguments', status: 'failed', durationMs: 0 });
} else {
  const output = await mkdtemp(join(tmpdir(), 'task-flow-verify-'));
  const build = join(output, 'build');
  try {
    const smokeBudget = await readSmokeBudget();
    await run('architecture', process.execPath, ['verification/check-architecture.mjs']);
    await run('architecture-tests', process.execPath, ['--test', 'verification/architecture.test.mjs']);
    await run('typescript', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.json'], { cwd: frontend });
    await run('vitest', 'npm', ['test'], { cwd: frontend });
    await run('vite-build', process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', build], { cwd: frontend });
    if (!local) {
      const compose = ['compose', '-f', '../../docker-compose.yml', 'exec', '-T', '-e', 'RAILS_ENV=test', 'redmine'];
      await run('rails-test-config', 'docker', [...compose, 'ruby', '-rerb', '-ryaml', '-e',
        'c = YAML.safe_load(ERB.new(File.read("config/database.yml")).result, aliases: true); abort "Configure a dedicated test database in config/database.yml" unless c["test"].is_a?(Hash) && !c["test"].empty?']);
      await run('minitest', 'docker', [...compose, 'bundle', 'exec', 'rails', 'test', 'plugins/redmine_task_flow/test'], { after: 'rails-test-config' });
      const smoke = await run('browser-smoke', process.execPath, ['verification/browser-smoke.mjs', build, output], { after: 'vite-build' });
      if (smoke) {
        metrics.browserSmokeDurationMs = smoke.durationMs;
        if (smokeBudget && smoke.durationMs > smokeBudget) {
          console.error(`[browser-smoke] ${smoke.durationMs} ms が上限 ${smokeBudget} ms を超えました。`);
          checks.push({ id: 'browser-smoke-budget', status: 'failed', durationMs: 0, limitMs: smokeBudget });
        }
      }
    }
  } finally {
    await rm(build, { recursive: true, force: true });
    artifacts.push(...(await readdir(output)).sort().map((name) => join(output, name)));
    if (!artifacts.length) await rm(output, { recursive: true, force: true });
  }
}

const passed = checks.every(({ status }) => status === 'passed');
console.log(JSON.stringify({
  status: passed ? 'passed' : 'failed',
  scope: local ? 'local' : 'all',
  checks,
  durationMs: elapsed(start),
  metrics,
  artifacts,
}, null, 2));
process.exitCode = passed ? 0 : 1;
