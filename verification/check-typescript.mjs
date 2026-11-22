import { dirname, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { API } = await import(require.resolve('typescript/unstable/sync'));
const { SyntaxKind: Kind, getLeadingCommentRanges, getTrailingCommentRanges } =
  await import(require.resolve('typescript/unstable/ast'));

const sourceRoot = resolve(root, 'frontend/src');
const testRoot = resolve(root, 'frontend/tests');
const config = resolve(root, 'frontend/tsconfig.json');
const featurePath = /^features\/([^/]+)(?:\/(.*))?$/;
const purePath = /^(?:domain\/|features\/[^/]+\/internal\/domain\/)/;
const adapterPath = /^(?:components\/|store\/|App(?:\.tsx)?$|main(?:\.tsx)?$)/;
const corePath = /^(?:core\/|api\/client(?:\.ts)?$)/;
const browserApis = /^(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|setTimeout|setInterval|clearTimeout|clearInterval|indexedDB)$/;
const suppression = /(?:eslint-(?:disable|enable)|biome-ignore|oxlint-disable|@ts-(?:ignore|expect-error|nocheck))\b/;
const testFile = /(?:^|\/)__(?:tests|specs)__\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;
const weakMatchers = new Set(['toBeDefined', 'toBeTruthy', 'toBeFalsy']);
const exceptionMatchers = new Set(['toThrow', 'toThrowError']);
export const issues = [];
export const testTitles = [];

function checkFile(source, filename) {
  const path = relative(sourceRoot, filename);
  const file = relative(root, filename);
  const ownFeature = path.match(featurePath)?.[1];
  const isTest = filename.startsWith(testRoot + '/') || testFile.test(path);
  const pure = !isTest && purePath.test(path);
  const commentOffsets = new Set();

  function report(rule, offset, subject, message, endOffset) {
    const line = source.text.slice(0, offset).split('\n').length;
    const caseSource = endOffset === undefined ? undefined : source.text.slice(offset, endOffset);
    issues.push({ file, line, rule, subject, message, caseSource });
  }

  function modulePath(name) {
    if (name.startsWith('/src/')) return relative(sourceRoot, resolve(sourceRoot, name.slice(5)));
    if (name.startsWith('.')) return relative(sourceRoot, resolve(dirname(filename), name));
    return null;
  }

  function checkImport(node, specifier) {
    const position = node.getStart(source);
    if (!specifier || ![Kind.StringLiteral, Kind.NoSubstitutionTemplateLiteral].includes(specifier.kind)) {
      report('static-import', position, node.getText(source), '境界を検証できるリテラルのモジュールパスを指定してください。');
      return;
    }

    const name = specifier.text;
    const target = modulePath(name);
    const feature = target?.match(featurePath);
    if (feature && (isTest || ownFeature !== feature[1]) && feature[2] !== undefined && !/^index(?:\.ts)?$/.test(feature[2])) {
      report('feature-public-entry', position, name, '機能の index.ts を経由してください。');
    }
    if (!isTest && ownFeature && target && adapterPath.test(target)) {
      report('feature-direction', position, name, 'UI・ストアから機能を呼び出し、機能が必要とする型は types/ に置いてください。');
    }
    if (pure && (!target || (
      !target.startsWith('types/') &&
      !target.startsWith('domain/') &&
      !(ownFeature && target.startsWith(`features/${ownFeature}/internal/domain/`))
    ))) {
      report('domain-direction', position, name, 'ドメインからは純粋なドメインと types/ の型を参照し、外部依存はアダプターへ渡してください。');
    }
  }

  function checkComments(node) {
    if (corePath.test(path)) return;
    const comments = [
      ...(getLeadingCommentRanges(source.text, node.pos) ?? []),
      ...(getTrailingCommentRanges(source.text, node.end) ?? []),
    ];
    for (const { pos, end } of comments) {
      if (commentOffsets.has(pos)) continue;
      commentOffsets.add(pos);
      const text = source.text.slice(pos, end);
      const directive = text.match(suppression);
      if (directive) {
        report('no-suppression', pos, directive[0], '型・lint の原因を修正するか、外部 API との変換を core/ に集約してください。');
      }
    }
  }

  function checkTestCase(node, callee) {
    const [callback] = node.arguments.slice(-1);
    if (!callback || ![Kind.ArrowFunction, Kind.FunctionExpression].includes(callback.kind)) return;

    const [title] = node.arguments;
    if (title?.kind === Kind.StringLiteral && !/\.(?:skip|todo|fails)\b/.test(callee)) {
      testTitles.push(title.text);
    }
    let assertions = 0;
    let spyAssertions = 0;
    function inspect(child) {
      if (child.kind === Kind.CallExpression && child.expression.kind === Kind.PropertyAccessExpression) {
        const { name, expression } = child.expression;
        let actual = expression;
        while (actual.kind === Kind.PropertyAccessExpression) actual = actual.expression;
        if (actual.kind === Kind.CallExpression && actual.expression.getText(source) === 'expect') {
          assertions++;
          const weak = weakMatchers.has(name.text) || (exceptionMatchers.has(name.text) && !child.arguments.length);
          if (weak) {
            report('test-weak-assertion', child.getStart(source), name.text, '具体的な結果・状態・エラー型やメッセージを検証してください。');
          } else if (/^to(?:HaveBeen|Be)Called|^toHave(?:Last|Nth)?Returned/.test(name.text)) {
            spyAssertions++;
          }
        }
      }
      child.forEachChild(inspect);
    }
    inspect(callback.body);

    const position = node.getStart(source);
    const lines = source.text.slice(position, node.end).split('\n').length;
    if (assertions > 5 || lines > 40) {
      report('test-size', position, 'test case', '1 ケースを 5 検証・40 行以内に分け、共通の準備はヘルパーにまとめてください。', node.end);
    }
    if (spyAssertions && assertions === spyAssertions) {
      report('test-spy-only', position, 'test case', 'スパイの呼び出しに加えて、利用者が観測できる結果や状態を検証してください。', node.end);
    }
  }

  function checkTestCall(node, callee) {
    if (/^(?:it|test)(?:\.(?:only|skip|concurrent|sequential|fails))?$/.test(callee) ||
        /^\s*(?:it|test)(?:\.\w+)*\.(?:each|for)(?:\(|`)/.test(callee)) {
      checkTestCase(node, callee);
    }
    if (!/^(?:vi|vitest)\.(?:mock|doMock)$/.test(callee)) return;

    let [specifier] = node.arguments;
    if (specifier?.kind === Kind.CallExpression && specifier.expression.kind === Kind.ImportKeyword) {
      [specifier] = specifier.arguments;
    }
    const literal = specifier && [Kind.StringLiteral, Kind.NoSubstitutionTemplateLiteral].includes(specifier.kind);
    const target = literal && modulePath(specifier.text);
    if (!literal || (target && !target.startsWith('../') && !corePath.test(target))) {
      report('test-internal-mock', node.getStart(source), callee, '製品モジュールを差し替えず、api/client.ts・core/ または外部 I/O を差し替えてください。');
    }
  }

  function visit(node) {
    checkComments(node);
    switch (node.kind) {
      case Kind.ImportDeclaration:
      case Kind.ExportDeclaration:
        if (node.moduleSpecifier) checkImport(node, node.moduleSpecifier);
        break;
      case Kind.ExternalModuleReference:
        checkImport(node, node.expression);
        break;
      case Kind.ImportType:
        checkImport(node, node.argument.literal);
        break;
      case Kind.CallExpression: {
        const callee = node.expression.getText(source);
        if (node.expression.kind === Kind.ImportKeyword || callee === 'require') checkImport(node, node.arguments[0]);
        if (callee === 'import.meta.glob') checkImport(node, undefined);
        if (isTest) checkTestCall(node, callee);
        break;
      }
    }

    if (!isTest && !corePath.test(path)) {
      const { parent } = node;
      const property = parent?.kind === Kind.PropertyAccessExpression && parent.name === node;
      const indexed = parent?.kind === Kind.ElementAccessExpression && parent.argumentExpression === node;
      const globalProperty = (property || indexed) && /^(?:window|globalThis|self)$/.test(parent.expression.getText(source));
      const bare = node.kind === Kind.Identifier && !property && !indexed;
      if ((bare || globalProperty) && browserApis.test(node.text)) {
        report('raw-browser-api', node.getStart(source), node.text, '通信は api/client.ts、ブラウザー I/O やタイマーは core/ の公開関数を使ってください。');
      }
      if (pure && bare && /^(?:window|document|HTMLElement|crypto)$/.test(node.text)
          && !(parent?.kind === Kind.PropertyAccessExpression && browserApis.test(parent.name.text))) {
        report('domain-browser-api', node.getStart(source), node.text, 'ブラウザー依存は core/ または UI に置き、ドメインには値を渡してください。');
      }
    }

    node.forEachChild(visit);
  }

  visit(source);
  checkComments(source.endOfFileToken);
}

const api = new API({ cwd: root });
try {
  const snapshot = api.updateSnapshot({ openProjects: [config] });
  try {
    const project = snapshot.getProject(config);
    const files = project.rootFiles.filter((file) => file.startsWith(sourceRoot + '/') || file.startsWith(testRoot + '/'));
    if (!files.some((file) => file.startsWith(sourceRoot + '/'))) {
      throw new Error('frontend/src の TypeScript ソースを取得できません。');
    }
    for (const file of files) checkFile(project.program.getSourceFile(file), file);
  } finally {
    snapshot.dispose();
  }
} finally {
  api.close();
}
