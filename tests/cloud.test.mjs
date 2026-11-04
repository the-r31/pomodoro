import test from 'node:test';
import assert from 'node:assert/strict';
import { capture, applySnapshot, decideSync, validateSnapshot, fingerprint } from '../src/cloud-data.ts';
function store() { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }; }
test('old snapshots remain readable and timer checkpoints sync without live execution', () => {
  const s = store(), old = capture(s); delete old.values['pomo-timer-checkpoint'];
  validateSnapshot(old); assert.equal(fingerprint(old), fingerprint(capture(s)));
  s.setItem('pomo-timer-checkpoint', JSON.stringify({ mode: 'focus', left: 30, total: 60, running: false, cycle: 0, endAt: 0, segmentStart: 0, sessionId: 'session1', task: '', segments: [] }));
  const target = store(); applySnapshot(target, capture(s));
  assert.equal(JSON.parse(target.getItem('pomo-timer-checkpoint')).left, 30);
  const invalid = capture(s); invalid.values['pomo-timer-checkpoint'] = '{"running":true}';
  assert.throws(() => validateSnapshot(invalid));
});
test('cloud snapshots exclude tokens, running timers and reminder delivery', () => {
  const s = store(); s.setItem('pomo-auth', 'secret'); s.setItem('pomo-timer', '{}'); s.setItem('pomo-reminder-delivery', '{}');
  const snapshot = capture(s); validateSnapshot(snapshot);
  assert.equal(JSON.stringify(snapshot).includes('secret'), false);
  assert.equal('pomo-timer' in snapshot.values, false);
});
test('legacy tasks are imported without editing the original store', () => {
  const s = store(); s.setItem('pomo-tasks', '[{"id":"1","title":"Existing","done":false}]');
  const snapshot = capture(s);
  assert.equal(JSON.parse(snapshot.values['pomo-workspace']).tasks[0].title, 'Existing');
  assert.equal(s.getItem('pomo-workspace'), null);
});
test('three-way decisions preserve divergent edits and detect remote deletions', () => {
  const s = store(); const base = capture(s);
  s.setItem('pomo-lists', '[{"id":"1","name":"Work","background":"plain"}]'); const local = capture(s);
  assert.equal(decideSync(base, local, base), 'push');
  assert.equal(decideSync(base, base, local), 'pull');
  s.setItem('pomo-habits', '[]'); const remote = capture(s);
  assert.equal(decideSync(base, local, remote), 'conflict');
  assert.equal(decideSync(base, local, local), 'same');
});
test('invalid or incomplete downloads never partially replace local data', () => {
  const s = store(); s.setItem('pomo-history', '{"2026-11-03":2}'); const before = capture(s);
  const invalid = structuredClone(before); invalid.values['pomo-habits'] = '{}';
  assert.throws(() => applySnapshot(s, invalid)); assert.equal(fingerprint(capture(s)), fingerprint(before));
  assert.throws(() => validateSnapshot({ format: 1, values: {} }));
});
test('pull updates the canonical task store and compatibility copy, leaving timer untouched', () => {
  const s = store(); const target = store(); s.setItem('pomo-tasks', '[{"id":"1","title":"Cloud task","done":false}]');
  target.setItem('pomo-timer', '{"left":99}'); applySnapshot(target, capture(s));
  assert.equal(JSON.parse(target.getItem('pomo-tasks'))[0].title, 'Cloud task');
  assert.equal(target.getItem('pomo-timer'), '{"left":99}');
});
