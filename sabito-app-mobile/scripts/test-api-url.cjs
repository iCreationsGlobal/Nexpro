const ts = require('typescript');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/config/resolveApiUrl.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const context = { exports: {}, URL };
vm.runInNewContext(code, context);
const resolve = context.exports.resolveApiUrl;
assert.equal(resolve('http://localhost:5001/api', '192.168.1.20:8081', true), 'http://192.168.1.20:5001/api');
assert.equal(resolve('http://10.0.2.2:5001', '10.1.1.2:8081', true), 'http://10.1.1.2:5001/api');
assert.equal(resolve('https://api.example.com/api/', '192.168.1.20:8081', true), 'https://api.example.com/api');
assert.equal(resolve('http://localhost:5001/api', 'test.exp.direct:8081', true), 'http://localhost:5001/api');
assert.equal(resolve('http://localhost:5001/api', '192.168.1.20:8081', false), 'http://localhost:5001/api');
assert.equal(resolve('http://localhost:5001/api', undefined, true), 'http://localhost:5001/api');
console.log('6 API address checks passed');
