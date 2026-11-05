import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryToken, recoveryError, workspaceLocked } from '../src/account-security.ts';

const project = 'https://example.supabase.co';
test('recovery accepts only recovery tokens for the configured auth endpoint', () => {
  assert.equal(recoveryToken(`${project}/auth/v1/verify?token=abc&type=recovery`, project), 'abc');
  assert.equal(recoveryToken(`${project}/auth/v1/verify?token_hash=abc&type=recovery`, project), 'abc');
  for (const link of ['invalid', `${project}/?token=abc&type=recovery`,
    'https://attacker.test/auth/v1/verify?token=abc&type=recovery',
    `${project}/auth/v1/verify?token=abc&type=signup`, `${project}/auth/v1/verify?type=recovery`,
    'https://user:pass@example.supabase.co/auth/v1/verify?token=abc&type=recovery']) {
    assert.throws(() => recoveryToken(link, project));
  }
});
test('expired or reused links and throttling provide actionable errors', () => {
  assert.match(recoveryError({ code: 'otp_expired', message: 'OTP expired' }), /expired or was already used/);
  assert.match(recoveryError({ code: 'over_request_rate_limit', message: 'rate' }), /wait/);
});
test('an expired session or another account cannot display the saved account workspace', () => {
  assert.equal(workspaceLocked('alice', undefined), true);
  assert.equal(workspaceLocked('alice', 'bob'), true);
  assert.equal(workspaceLocked('alice', 'alice'), false);
  assert.equal(workspaceLocked('guest', undefined), false);
  assert.equal(workspaceLocked(null, undefined), false);
});
