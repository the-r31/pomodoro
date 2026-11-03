import test from 'node:test';
import assert from 'node:assert/strict';
import { periodDays, shiftPeriod, hourlyMinutes, duration } from '../src/stats-data.ts';
test('calendar ranges cover leap years and Monday-based weeks', () => {
  assert.equal(periodDays(new Date(2024, 1, 20), 'Month').length, 29);
  assert.equal(periodDays(new Date(2024, 1, 20), 'Year').length, 366);
  assert.equal(periodDays(new Date(2026, 10, 3), 'Week')[0].getDay(), 1);
  assert.equal(shiftPeriod(new Date(2026, 2, 31), 'Month', -1).getMonth(), 1);
});
test('hourly totals split at hour boundaries and exclude paused gaps', () => {
  const at = (h, m) => +new Date(2026, 10, 3, h, m);
  const hours = hourlyMinutes([{ segments: [{ start: at(9, 50), end: at(10, 10) }, { start: at(10, 30), end: at(10, 45) }] }], new Date(at(0, 0)), new Date(2026, 10, 4));
  assert.equal(hours[9], 10); assert.equal(hours[10], 25);
  assert.equal(hours.reduce((a, b) => a + b), 35);
});
test('hourly totals clip segments to the selected calendar range', () => {
  const hours = hourlyMinutes([{ segments: [{ start: +new Date(2026, 10, 2, 23, 50), end: +new Date(2026, 10, 3, 0, 10) }] }], new Date(2026, 10, 3), new Date(2026, 10, 4));
  assert.equal(hours[0], 10);
  assert.equal(hours[23], 0);
  assert.equal(duration(131), '2h 11m');
});
