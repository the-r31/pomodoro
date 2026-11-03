import test from 'node:test';
import assert from 'node:assert/strict';
import { validSchedule, layoutEvents } from '../src/calendar-data.ts';
const task = (id, start, end) => ({ id, title: id, done: false, schedule: { date: '2026-11-03', start, end, color: 'blue' } });
test('rejects invalid dates, malformed times and reversed or overnight intervals', () => {
  assert.equal(validSchedule(task('a', '09:00', '10:00').schedule), true);
  assert.equal(validSchedule({ ...task('a', '09:00', '10:00').schedule, date: '2026-02-30' }), false);
  assert.equal(validSchedule(task('a', '24:00', '25:00').schedule), false);
  assert.equal(validSchedule(task('a', '09:00', '09:00').schedule), false);
  assert.equal(validSchedule(task('a', '23:00', '01:00').schedule), false);
  assert.equal(validSchedule(undefined), false);
});
test('overlapping events get distinct columns; adjacent events reclaim full width', () => {
  const result = layoutEvents([task('a', '09:00', '11:00'), task('b', '09:30', '10:00'), task('c', '10:00', '10:30'), task('d', '11:00', '12:00')]);
  assert.deepEqual(result.map(x => [x.task.id, x.column, x.columns]), [['a', 0, 2], ['b', 1, 2], ['c', 1, 2], ['d', 0, 1]]);
});
