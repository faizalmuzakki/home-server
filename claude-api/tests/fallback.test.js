import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldFallbackToAgy,
  isQuotaReason,
  resolveFallbackModel,
  parseAgyJson,
  resetQuotaCooldown,
} from '../src/routes/prompt.js';

test('shouldFallbackToAgy detects weekly limit and 429 status', () => {
  const weeklyLimitFixture = {
    parsed: {
      type: 'result',
      is_error: true,
      api_error_status: 429,
      api_error: 'usage_limit_reached',
      result: "You've hit your weekly limit · resets 10am (Asia/Jakarta)",
    },
    stderr: '',
    code: 1,
  };
  assert.equal(shouldFallbackToAgy(weeklyLimitFixture), 'api_429');
  assert.equal(isQuotaReason('api_429'), true);
});

test('shouldFallbackToAgy detects usage limit reached in subtype or result', () => {
  const resultTextLimit = {
    parsed: {
      is_error: true,
      result: "You've hit your limit · resets tomorrow",
    },
    stderr: '',
    code: 1,
  };
  assert.equal(shouldFallbackToAgy(resultTextLimit), 'quota_limit');
  assert.equal(isQuotaReason('quota_limit'), true);

  const subtypeLimit = {
    parsed: {
      is_error: true,
      subtype: 'usage_limit_reached',
    },
    stderr: '',
    code: 1,
  };
  assert.equal(shouldFallbackToAgy(subtypeLimit), 'quota_limit');
});

test('shouldFallbackToAgy detects auth and model errors (401, 403, 404, 529)', () => {
  assert.equal(shouldFallbackToAgy({ parsed: { api_error_status: 401 } }), 'api_401');
  assert.equal(shouldFallbackToAgy({ parsed: { api_error_status: 403 } }), 'api_403');
  assert.equal(shouldFallbackToAgy({ parsed: { api_error_status: 404 } }), 'api_404');
  assert.equal(shouldFallbackToAgy({ parsed: { api_error_status: 529 } }), 'api_529');
});

test('shouldFallbackToAgy does not trigger on success or max_turns', () => {
  assert.equal(shouldFallbackToAgy({ parsed: { type: 'result' }, code: 0 }), null);
  assert.equal(shouldFallbackToAgy({ parsed: { subtype: 'error_max_turns' }, code: 1 }), null);
});

test('resolveFallbackModel defaults to high effort and appends tier', () => {
  const def = resolveFallbackModel();
  assert.equal(def.agyModel, 'gemini-3.8-flash-high');
  assert.equal(def.canonicalModel, 'gemini-3.8-flash');
  assert.equal(def.effort, 'high');

  const med = resolveFallbackModel('medium');
  assert.equal(med.agyModel, 'gemini-3.8-flash-medium');
  assert.equal(med.canonicalModel, 'gemini-3.8-flash');
  assert.equal(med.effort, 'medium');

  const low = resolveFallbackModel('low');
  assert.equal(low.agyModel, 'gemini-3.8-flash-low');
  assert.equal(low.canonicalModel, 'gemini-3.8-flash');
  assert.equal(low.effort, 'low');
});

test('resolveFallbackModel handles pre-suffixed models without duplicating tier', () => {
  const orig = process.env.FALLBACK_MODEL;
  try {
    process.env.FALLBACK_MODEL = 'gpt-oss-120b-medium';
    const res = resolveFallbackModel('high');
    assert.equal(res.agyModel, 'gpt-oss-120b-medium');
    assert.equal(res.canonicalModel, 'gpt-oss-120b');
    assert.equal(res.effort, 'medium');
  } finally {
    process.env.FALLBACK_MODEL = orig;
  }
});

test('parseAgyJson parses clean single-line JSON', () => {
  const jsonStr = JSON.stringify({
    conversation_id: 'test-123',
    status: 'SUCCESS',
    response: 'Hello world',
    usage: { input_tokens: 10, output_tokens: 2 },
  });
  const parsed = parseAgyJson(jsonStr);
  assert.equal(parsed.status, 'SUCCESS');
  assert.equal(parsed.response, 'Hello world');
  assert.equal(parsed.conversation_id, 'test-123');
});

test('parseAgyJson parses multi-line stdout with warning lines preceding JSON', () => {
  const multiLine = `
jetski: no output produced — a tool required the "command" permission
{"conversation_id":"c7157f52","status":"SUCCESS","response":"parsed result","usage":{"input_tokens":5}}
`;
  const parsed = parseAgyJson(multiLine);
  assert.ok(parsed);
  assert.equal(parsed.status, 'SUCCESS');
  assert.equal(parsed.response, 'parsed result');
});

test('parseAgyJson returns null on empty or non-JSON input', () => {
  assert.equal(parseAgyJson(''), null);
  assert.equal(parseAgyJson('fatal error'), null);
  assert.equal(parseAgyJson(null), null);
});
