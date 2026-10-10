const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? files(name) : /\.[jt]sx?$/.test(name) ? [name] : [];
  });
}
const routes = files(path.join(root, 'app'))
  .filter((file) => !path.basename(file).startsWith('_') && !path.basename(file).startsWith('+'))
  .map((file) => '/' + path.relative(path.join(root, 'app'), file).replace(/\\/g, '/').replace(/\.[jt]sx?$/, '').replace(/\/index$/, ''));
const normalize = (route) => route.split(/[?#]/)[0].replace(/\/$/, '') || '/';
const patterns = routes.flatMap((route) => [route, route.replace(/\/\([^/]+\)/g, '')]).map((route) => {
  const escaped = normalize(route).split('/').map((part) => /^\[.*\]$/.test(part) ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
  return new RegExp('^' + escaped + '$');
});
const failures = [];
let checked = 0;
for (const dir of ['app', 'components', 'constants', 'utils']) {
  for (const file of files(path.join(root, dir))) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const verify = (node) => {
      while (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
      const target = ts.isStringLiteralLike(node) ? node.text
        : ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map((span) => '__id__' + span.literal.text).join('')
        : '';
      if (!target.startsWith('/')) return;
      checked++;
      if (!patterns.some((pattern) => pattern.test(normalize(target)))) {
        failures.push(`${path.relative(root, file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} ${target}`);
      }
    };
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText(source) === 'router' && ['push', 'replace', 'navigate'].includes(node.expression.name.text)) {
        if (node.arguments[0]) {
          let target = node.arguments[0];
          while (ts.isAsExpression(target)) target = target.expression;
          verify(target);
        }
      }
      if (ts.isPropertyAssignment(node) && ['route', 'pathname', 'href'].includes(node.name.getText(source).replace(/['"]/g, ''))) verify(node.initializer);
      if (ts.isJsxAttribute(node) && node.name.getText(source) === 'href' && node.initializer) {
        const target = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
        if (target) verify(target);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}
if (failures.length) {
  console.error('Broken mobile routes:\n' + failures.join('\n'));
  process.exitCode = 1;
} else console.log(`Verified ${checked} literal navigation targets against ${routes.length} mobile routes. Dynamic IDs and external URLs require smoke testing.`);
