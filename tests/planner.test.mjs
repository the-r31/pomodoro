import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFilter, matchesFilter, quadrant, taskChanges, reminderTarget } from '../src/planner-data.ts';
import { validSchedule, tasksOnDate, daySlice, shiftTask } from '../src/calendar-data.ts';
const task = { id: '1', title: 'Work', done: false, priority: 'high', schedule: { date: '2026-11-03', endDate: '2026-11-05', start: '23:00', end: '09:00', color: 'blue' } };
test('multi-day tasks appear only on intersecting dates and preserve duration when moved', () => {
  assert.equal(validSchedule(task.schedule), true);
  assert.equal(tasksOnDate([task], '2026-11-04').length, 1);
  assert.equal(tasksOnDate([task], '2026-11-06').length, 0);
  assert.equal(daySlice(task, '2026-11-04').schedule.start, '00:00');
  const moved = shiftTask(task, -3);
  assert.equal(moved.schedule.date, '2026-10-31');
  assert.equal(moved.schedule.endDate, '2026-11-02');
  assert.equal(validSchedule({ ...task.schedule, allDay: true, endDate: '2026-11-03' }), true);
});
test('AND/OR apply to date and priority, while list and status remain mandatory', () => {
  const f = { ...defaultFilter, date: 'today', priority: 'low' };
  assert.equal(matchesFilter(task, f, '2026-11-04', '2026-11-10'), false);
  assert.equal(matchesFilter(task, { ...f, logic: 'OR' }, '2026-11-04', '2026-11-10'), true);
  assert.equal(matchesFilter({ ...task, done: true }, { ...f, logic: 'OR' }, '2026-11-04', '2026-11-10'), false);
});
test('matrix automatic rules support explicit overrides', () => {
  assert.equal(quadrant(task, '2026-11-03'), 0);
  assert.equal(quadrant({ ...task, urgent: false }, '2026-11-03'), 1);
  assert.equal(quadrant({ ...task, important: false }, '2026-11-03'), 2);
  assert.equal(quadrant({ ...task, important: false, urgent: false }, '2026-11-03'), 3);
});
test('activity logs actual changes without inventing historical events or reorder noise', () => {
  assert.equal(taskChanges([task], [task], 1).length, 0);
  assert.deepEqual(taskChanges([task], [{ ...task, done: true, notes: 'Note' }], 1).map(a => a.action), ['Completed task', 'Updated notes']);
  assert.equal(taskChanges([task], [], 1)[0].title, 'Work');
});
test('reminders calculate before-start, end and all-day times and ignore completed tasks', () => {
  const reminder = { before: 30, repeat: 5 };
  assert.equal(reminderTarget({ ...task, reminder }).at, +new Date('2026-11-03T22:30:00'));
  assert.equal(reminderTarget({ ...task, reminder: { ...reminder, atEnd: true } }).at, +new Date('2026-11-05T09:00:00'));
  assert.equal(reminderTarget({ ...task, done: true, reminder }), null);
  assert.equal(reminderTarget({ ...task, schedule: { ...task.schedule, allDay: true }, reminder: { before: 0, repeat: 0 } }).at, +new Date('2026-11-03T09:00:00'));
});
