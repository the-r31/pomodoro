import test from 'node:test';
import assert from 'node:assert/strict';
import { localDay, remainingSeconds, nextBreak } from '../src/timer.ts';

test('a delayed tick or restored timer uses elapsed wall time', () => {
  assert.equal(remainingSeconds(100000, 75000), 25);
  assert.equal(remainingSeconds(100000, 99999), 1);
  assert.equal(remainingSeconds(100000, 100000), 0);
  assert.equal(remainingSeconds(100000, 200000), 0);
});

test('day keys use the local calendar even near midnight', () => {
  assert.equal(localDay(new Date(2026, 10, 3, 0, 1)), '2026-11-03');
  assert.equal(localDay(new Date(2026, 0, 1, 23, 59)), '2026-01-01');
});

test('long breaks reset the cycle, including when the interval was reduced', () => {
  assert.deepEqual(nextBreak(0, 4), { cycle: 1, mode: 'short' });
  assert.deepEqual(nextBreak(3, 4), { cycle: 0, mode: 'long' });
  assert.deepEqual(nextBreak(3, 2), { cycle: 0, mode: 'long' });
  assert.deepEqual(nextBreak(0, 1), { cycle: 0, mode: 'long' });
});
