const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function extractFunction(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} not found`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} function body not closed`);
}

function loadFunctions(filePath, names) {
  const source = fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(names.map((name) => extractFunction(source, name)).join('\n'), context);
  return context;
}

const popup = loadFunctions('packages/extension/src/popup.js', [
  'riskLevelFromScore',
  'riskDisplayLabel',
  'resolveAuthoritativeRiskLevel',
  'extractRiskLevel',
]);

const background = loadFunctions('packages/extension/src/background.js', [
  'resolveAuthoritativeRiskLevel',
  'extractRiskLevel',
]);

test('popup BLOCK verdict wins over high numeric score', () => {
  const payload = {
    final_verdict: 'BLOCK',
    risk_and_signals: { risk: 86 },
  };

  assert.equal(popup.extractRiskLevel(payload), 'HIGH');
  assert.equal(popup.riskDisplayLabel(popup.extractRiskLevel(payload)), 'Not safe');
});

test('popup NEEDS_REVIEW verdict wins over high numeric score', () => {
  const payload = {
    final_verdict: 'NEEDS_REVIEW',
    risk_and_signals: { risk: 94 },
  };

  assert.equal(popup.extractRiskLevel(payload), 'MEDIUM');
  assert.equal(popup.riskDisplayLabel(popup.extractRiskLevel(payload)), 'Review');
});

test('popup falls back to numeric score when verdict is missing', () => {
  assert.equal(popup.extractRiskLevel({ risk_and_signals: { risk: 86 } }), 'LOW');
});

test('background BLOCK verdict wins over high numeric score', () => {
  assert.equal(
    background.extractRiskLevel({
      governance_bundle: { decision: { final_verdict: 'BLOCK' } },
      risk_and_signals: { risk: 86 },
    }),
    'HIGH',
  );
});

test('background falls back to numeric score when verdict is missing', () => {
  assert.equal(background.extractRiskLevel({ risk_and_signals: { risk: 86 } }), 'LOW');
});
