'use strict';
const assert = require('node:assert/strict');
let idCounter = 0;
global.window = { AppStorage: { makeId(prefix = 'test') { idCounter += 1; return `${prefix}-${idCounter}`; } } };
require('../js/planner.js');
const planner = global.window.StudyPlanner;

const now = new Date(2026, 10, 2, 7, 0, 0); // Monday, before the configured study window.
const due = '2026-11-08';
function baseState() {
  const availability = {};
  for (const key of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    availability[key] = { intervals: [{ id: `interval-${key}`, start: '08:00', end: '12:00' }], goalMinutes: 240 };
  }
  return { subjects: [], works: [], projects: [], commitments: [], sessions: [], availability };
}
function firstSession(result, type, id) {
  return result.sessions.filter((session) => session.sourceType === type && session.sourceId === id && session.status === 'planned')
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))[0];
}
function lastSession(result, type, id) {
  return result.sessions.filter((session) => session.sourceType === type && session.sourceId === id && session.status === 'planned')
    .sort((a, b) => `${a.date}T${a.endTime}`.localeCompare(`${b.date}T${b.endTime}`)).at(-1);
}
function moment(session, key = 'startTime') { return `${session.date}T${session[key]}`; }

// 1. Lessons are planned in the stored pedagogical order across units.
{
  const state = baseState();
  state.subjects.push({ id: 'cs', name: 'Algoritmos', color: '#FACC15', contentStart: '2026-11-02', contentEnd: due, units: [
    { id: 'u1', name: 'Unidade 1', lessons: [
      { id: 'l1', title: 'Aula A', duration: 45, status: 'not-started' },
      { id: 'l2', title: 'Aula B', duration: 45, status: 'not-started' }
    ] },
    { id: 'u2', name: 'Unidade 2', lessons: [
      { id: 'l3', title: 'Aula C', duration: 45, status: 'not-started' }
    ] }
  ] });
  const result = planner.generate(state, { now });
  const l1 = firstSession(result, 'lesson', 'l1');
  const l2 = firstSession(result, 'lesson', 'l2');
  const l3 = firstSession(result, 'lesson', 'l3');
  assert.ok(l1 && l2 && l3, 'all three lesson tasks should be scheduled');
  assert.ok(moment(l1) < moment(l2), 'lesson 2 must follow lesson 1');
  assert.ok(moment(l2) < moment(l3), 'lesson in Unit 2 must follow pending lessons in Unit 1');
}

// 2. A work item linked to a lesson must be scheduled after that lesson.
{
  const state = baseState();
  state.subjects.push({ id: 'cs', name: 'Modelagem de Dados', color: '#60A5FA', contentStart: '2026-11-02', contentEnd: due, units: [
    { id: 'u1', name: 'Unidade 1', lessons: [{ id: 'prereq-lesson', title: 'Chaves primárias', duration: 60, status: 'not-started' }] }
  ] });
  state.works.push({ id: 'w1', title: 'Relatório da prática', subjectId: 'cs', prerequisiteType: 'lesson', prerequisiteId: 'prereq-lesson', dueDate: due, duration: 45, status: 'not-started', priority: 'high' });
  const result = planner.generate(state, { now });
  const lesson = lastSession(result, 'lesson', 'prereq-lesson');
  const work = firstSession(result, 'work', 'w1');
  assert.ok(lesson && work, 'lesson and dependent work should both be scheduled');
  assert.ok(moment(work) >= moment(lesson, 'endTime'), 'dependent work must not start before the lesson session ends');
}

// 3. A work linked to a whole unit waits for every pending lesson in that unit.
{
  const state = baseState();
  state.subjects.push({ id: 'math', name: 'Matemática', color: '#A78BFA', contentStart: '2026-11-02', contentEnd: due, units: [
    { id: 'unit-1', name: 'Funções', lessons: [
      { id: 'fn-1', title: 'Introdução', duration: 45, status: 'not-started' },
      { id: 'fn-2', title: 'Exemplos', duration: 45, status: 'not-started' }
    ] }
  ] });
  state.works.push({ id: 'w-unit', title: 'Lista da unidade', subjectId: 'math', prerequisiteType: 'unit', prerequisiteId: 'unit-1', dueDate: due, duration: 30, status: 'not-started' });
  const result = planner.generate(state, { now });
  const unit1 = lastSession(result, 'lesson', 'fn-1');
  const unit2 = lastSession(result, 'lesson', 'fn-2');
  const work = firstSession(result, 'work', 'w-unit');
  assert.ok(unit1 && unit2 && work, 'both lessons and linked work should be scheduled');
  assert.ok(moment(work) >= moment(unit2, 'endTime'), 'unit-linked work must follow all lessons in that unit');
}

// 4. If prerequisite content cannot fit before its deadline, dependent work is blocked with an explicit warning.
{
  const state = baseState();
  state.availability.mon = { intervals: [{ id: 'short', start: '08:00', end: '09:00' }], goalMinutes: 60 };
  for (const key of ['tue', 'wed', 'thu', 'fri', 'sat', 'sun']) state.availability[key] = { intervals: [], goalMinutes: 0 };
  state.subjects.push({ id: 'cs', name: 'Algoritmos', contentStart: '2026-11-02', contentEnd: '2026-11-02', units: [
    { id: 'u1', name: 'Unidade 1', lessons: [
      { id: 'must-fit-1', title: 'Aula 1', duration: 60, status: 'not-started' },
      { id: 'must-fit-2', title: 'Aula 2', duration: 60, status: 'not-started' }
    ] }
  ] });
  state.works.push({ id: 'blocked-work', title: 'Atividade após a unidade', subjectId: 'cs', prerequisiteType: 'unit', prerequisiteId: 'u1', dueDate: due, duration: 30, status: 'not-started' });
  const result = planner.generate(state, { now });
  assert.ok(result.unplaced.some((item) => item.sourceId === 'blocked-work' && /Aguardando pré-requisito/.test(item.reason)), 'dependent work must be blocked if prerequisite content could not be fully planned');
}

// 5. Projects are planned by ordered stages and not as one duration-only project task.
{
  const state = baseState();
  state.projects.push({ id: 'p1', title: 'Projeto', startDate: '2026-11-02', dueDate: due, stages: [
    { id: 's1', order: 1, title: 'Levantamento', duration: 45, dueDate: due, status: 'not-started' },
    { id: 's2', order: 2, title: 'Implementação', duration: 45, dueDate: due, status: 'not-started' }
  ] });
  const result = planner.generate(state, { now });
  const s1 = firstSession(result, 'stage', 's1');
  const s2 = firstSession(result, 'stage', 's2');
  assert.ok(s1 && s2, 'both project stages should be scheduled');
  assert.ok(moment(s1) < moment(s2), 'stage 2 must follow stage 1');
  assert.ok(!result.sessions.some((session) => session.sourceType === 'project' && session.sourceId === 'p1'), 'the project itself must not be scheduled as one duration-only task');
}

// 6. Mixed-period preference caps the number of distinct study subjects per day.
{
  const state = baseState();
  state.settings = { maxMixedSubjectsPerDay: 2 };
  for (let index = 1; index <= 4; index += 1) {
    state.subjects.push({
      id: `mix-${index}`, name: `Disciplina ${index}`, color: '#FACC15',
      allowMixedPeriods: true, contentStart: '2026-11-02', contentEnd: due,
      units: [{ id: `mix-u-${index}`, name: 'Unidade 1', lessons: [{
        id: `mix-l-${index}`, title: 'Aula', duration: 60, status: 'not-started'
      }] }]
    });
  }
  const result = planner.generate(state, { now });
  const lessonSessions = result.sessions.filter((session) => session.status === 'planned' && session.sourceType === 'lesson');
  assert.equal(lessonSessions.length, 4, 'all mixed-subject lessons should fit across the available days');
  const sessionsByDate = new Map();
  lessonSessions.forEach((session) => {
    if (!sessionsByDate.has(session.date)) sessionsByDate.set(session.date, new Set());
    sessionsByDate.get(session.date).add(session.subjectId);
  });
  for (const [date, subjects] of sessionsByDate) {
    assert.ok(subjects.size <= 2, `${date} must contain no more than 2 different discipline subjects`);
  }
}

// 7. The user-selected limit controls how many opt-in subjects can share one day.
{
  const state = baseState();
  state.settings = { maxMixedSubjectsPerDay: 3 };
  for (let index = 1; index <= 3; index += 1) {
    state.subjects.push({
      id: `mix-three-${index}`, name: `Disciplina ${index}`, color: '#FACC15', allowMixedPeriods: true,
      contentStart: '2026-11-02', contentEnd: due,
      units: [{ id: `mix-three-u-${index}`, name: 'Unidade 1', lessons: [{
        id: `mix-three-l-${index}`, title: 'Aula', duration: 60, status: 'not-started'
      }] }]
    });
  }
  const result = planner.generate(state, { now });
  const mondaySubjects = new Set(result.sessions.filter((session) => session.status === 'planned' && session.date === '2026-11-02' && session.sourceType === 'lesson').map((session) => session.subjectId));
  assert.equal(mondaySubjects.size, 3, 'a limit of three should allow three opted-in subjects to share a day when space is available');
}

// 8. A subject excluded from mixed periods must not share a day with content from another subject.
{
  const state = baseState();
  state.settings = { maxMixedSubjectsPerDay: 5 };
  state.subjects.push(
    { id: 'isolated', name: 'Disciplina exclusiva', color: '#FACC15', allowMixedPeriods: false, contentStart: '2026-11-02', contentEnd: due,
      units: [{ id: 'isolated-u', name: 'Unidade 1', lessons: [{ id: 'isolated-l', title: 'Aula exclusiva', duration: 60, status: 'not-started' }] }] },
    { id: 'mixed-a', name: 'Disciplina mesclável A', color: '#60A5FA', allowMixedPeriods: true, contentStart: '2026-11-02', contentEnd: due,
      units: [{ id: 'mixed-a-u', name: 'Unidade 1', lessons: [{ id: 'mixed-a-l', title: 'Aula A', duration: 60, status: 'not-started' }] }] },
    { id: 'mixed-b', name: 'Disciplina mesclável B', color: '#A78BFA', allowMixedPeriods: true, contentStart: '2026-11-02', contentEnd: due,
      units: [{ id: 'mixed-b-u', name: 'Unidade 1', lessons: [{ id: 'mixed-b-l', title: 'Aula B', duration: 60, status: 'not-started' }] }] }
  );
  const result = planner.generate(state, { now });
  const lessonSessions = result.sessions.filter((session) => session.status === 'planned' && session.sourceType === 'lesson');
  const exclusiveDates = new Set(lessonSessions.filter((session) => session.subjectId === 'isolated').map((session) => session.date));
  assert.ok(exclusiveDates.size > 0, 'the non-mixable subject should be scheduled');
  exclusiveDates.forEach((date) => {
    const otherSubjects = new Set(lessonSessions.filter((session) => session.date === date && session.subjectId !== 'isolated').map((session) => session.subjectId));
    assert.equal(otherSubjects.size, 0, 'no other subject lessons/exercises may share a day with an exclusive subject');
  });
}

// 9. Work and project stage sessions do not consume the discipline-mixing limit.
{
  const state = baseState();
  state.settings = { maxMixedSubjectsPerDay: 2 };
  state.subjects.push(
    { id: 'mix-a', name: 'Disciplina A', color: '#FACC15', allowMixedPeriods: true, contentStart: '2026-11-02', contentEnd: due,
      units: [{ id: 'mix-a-u', name: 'Unidade 1', lessons: [{ id: 'mix-a-l', title: 'Aula A', duration: 60, status: 'not-started' }] }] },
    { id: 'mix-b', name: 'Disciplina B', color: '#60A5FA', allowMixedPeriods: true, contentStart: '2026-11-02', contentEnd: due,
      units: [{ id: 'mix-b-u', name: 'Unidade 1', lessons: [{ id: 'mix-b-l', title: 'Aula B', duration: 60, status: 'not-started' }] }] }
  );
  state.works.push({ id: 'mix-work', title: 'Relatório', subjectId: 'mix-a', dueDate: due, duration: 30, status: 'not-started', priority: 'medium' });
  state.projects.push({ id: 'mix-project', title: 'Projeto', subjectId: 'mix-a', startDate: '2026-11-02', dueDate: due, priority: 'medium', stages: [
    { id: 'mix-stage', order: 1, title: 'Etapa 1', duration: 30, dueDate: due, status: 'not-started' }
  ] });
  const result = planner.generate(state, { now });
  const monday = '2026-11-02';
  assert.ok(result.sessions.some((session) => session.date === monday && session.sourceType === 'work' && session.status === 'planned'), 'work can be planned on a mixed study day');
  assert.ok(result.sessions.some((session) => session.date === monday && session.sourceType === 'stage' && session.status === 'planned'), 'project stage can be planned on a mixed study day');
  const disciplineSubjects = new Set(result.sessions.filter((session) => session.date === monday && session.status === 'planned' && ['lesson', 'exercise'].includes(session.sourceType)).map((session) => session.subjectId));
  assert.equal(disciplineSubjects.size, 2, 'only study content disciplines count toward the mixing limit');
}

// 10. Session labels read the current lesson title instead of a stale snapshot.
{
  const state = baseState();
  const lesson = { id: 'rename-lesson', title: 'Nome antigo', duration: 45, status: 'not-started' };
  state.subjects.push({ id: 'rename-subject', name: 'Disciplina', units: [{ id: 'rename-unit', name: 'Unidade 1', lessons: [lesson] }] });
  const session = { sourceType: 'lesson', sourceId: 'rename-lesson', title: 'Unidade 1 · Aula 1: Nome antigo' };
  assert.equal(planner.getSessionDisplayTitle(state, session), 'Unidade 1 · Aula 1: Nome antigo');
  lesson.title = 'Nome atualizado';
  assert.equal(planner.getSessionDisplayTitle(state, session), 'Unidade 1 · Aula 1: Nome atualizado', 'calendar display should pick up edits immediately without schedule regeneration');
  assert.equal(planner.getSessionDisplayTitle(state, { ...session, sourceType: 'exercise', title: 'Nome antigo' }), 'Exercícios da aula 1: Nome atualizado', 'exercise labels should also reflect the latest lesson name');
}


// 11. If normal daily-goal capacity cannot fit an urgent activity, free availability beyond the goal is used.
{
  const state = baseState();
  state.availability.mon = { intervals: [{ id: 'long-window', start: '08:00', end: '12:00' }], goalMinutes: 60 };
  for (const key of ['tue', 'wed', 'thu', 'fri', 'sat', 'sun']) state.availability[key] = { intervals: [], goalMinutes: 0 };
  state.works.push({ id: 'urgent-work', title: 'Trabalho urgente', dueDate: '2026-11-02', duration: 180, status: 'not-started', priority: 'high' });
  const result = planner.generate(state, { now });
  const workSessions = result.sessions.filter((session) => session.status === 'planned' && session.sourceType === 'work' && session.sourceId === 'urgent-work');
  assert.equal(workSessions.reduce((sum, session) => sum + session.estimatedMinutes, 0), 180, 'the urgent work should use free time beyond the daily goal when needed');
  assert.ok(workSessions.some((session) => session.beyondDailyGoal), 'sessions scheduled beyond the goal should be marked clearly in the plan data');
  assert.ok(!result.unplaced.some((activity) => activity.sourceId === 'urgent-work'), 'the work should not be reported as unplaced if free available time makes it fit');
}

// 12. Completing the whole activity from a session updates the source and removes its future plans.
{
  const state = baseState();
  const stage = { id: 'completion-stage', order: 1, title: 'Etapa concluída', duration: 90, dueDate: due, status: 'not-started', progress: 0 };
  state.projects.push({ id: 'completion-project', title: 'Projeto', dueDate: due, stages: [stage] });
  const session = { id: 'completion-session', sourceType: 'stage', sourceId: stage.id, date: '2026-11-02', startTime: '08:00', endTime: '08:30', estimatedMinutes: 30, status: 'planned' };
  state.sessions.push(session);
  const updated = planner.applySessionCompletion(state, session, 'activity-completed', 100, '2026-11-02T08:30:00.000Z');
  assert.equal(updated.ok, true, 'the activity completion should be accepted');
  assert.equal(stage.status, 'completed', 'the stage itself should become completed');
  assert.equal(stage.progress, 100, 'the completed stage should be at 100 percent');
  assert.equal(session.status, 'completed', 'the session should remain recorded as completed');
  const result = planner.generate(state, { now });
  assert.ok(!result.sessions.some((item) => item.status === 'planned' && item.sourceType === 'stage' && item.sourceId === stage.id), 'regeneration must not recreate future sessions for a completed stage');
  assert.ok(result.sessions.some((item) => item.id === session.id && item.status === 'completed'), 'the completed session remains in history');
}

// 13. Completing only a session requires total activity progress and schedules only the remaining portion.
{
  const state = baseState();
  state.works.push({ id: 'partial-work', title: 'Relatório parcial', dueDate: due, duration: 100, status: 'not-started', progress: 0, priority: 'medium' });
  const session = { id: 'partial-work-session', sourceType: 'work', sourceId: 'partial-work', date: '2026-11-02', startTime: '08:00', endTime: '08:30', estimatedMinutes: 30, status: 'planned' };
  state.sessions.push(session);
  const updated = planner.applySessionCompletion(state, session, 'session-only', 40, '2026-11-02T08:30:00.000Z');
  assert.equal(updated.ok, true, 'session-only completion should be accepted with valid progress');
  assert.equal(state.works[0].status, 'in-progress', 'the work should become in progress');
  assert.equal(state.works[0].progress, 40, 'the user-provided total progress should be saved');
  const result = planner.generate(state, { now });
  const futureWorkSessions = result.sessions.filter((item) => item.status === 'planned' && item.sourceType === 'work' && item.sourceId === 'partial-work');
  assert.equal(futureWorkSessions.reduce((sum, item) => sum + item.estimatedMinutes, 0), 60, 'only the 60 percent remaining should be planned');
  assert.ok(futureWorkSessions.every((item) => `${item.date}T${item.startTime}` >= `${session.date}T${session.endTime}`), 'new work must not overlap the completed session');
  assert.ok(result.sessions.some((item) => item.id === session.id && item.status === 'completed'), 'the completed session should stay in history');
}

// 14. An invalid progress value must not partially update the session or activity.
{
  const state = baseState();
  const work = { id: 'invalid-progress-work', title: 'Trabalho', dueDate: due, duration: 60, status: 'not-started', progress: 0 };
  state.works.push(work);
  const session = { id: 'invalid-progress-session', sourceType: 'work', sourceId: work.id, date: '2026-11-02', startTime: '08:00', endTime: '08:30', estimatedMinutes: 30, status: 'planned' };
  const result = planner.applySessionCompletion(state, session, 'session-only', 100, '2026-11-02T08:30:00.000Z');
  assert.equal(result.ok, false, '100 percent is invalid for a session-only update');
  assert.equal(work.status, 'not-started', 'invalid progress must not update the activity status');
  assert.equal(work.progress, 0, 'invalid progress must not update the activity percentage');
  assert.equal(session.status, 'planned', 'invalid progress must not mark the session completed');
}

// 15. A previously completed session can repair inconsistent legacy data without rewriting its history timestamp.
{
  const state = baseState();
  const work = { id: 'legacy-work', title: 'Trabalho já realizado', dueDate: due, duration: 60, status: 'not-started', progress: 0 };
  state.works.push(work);
  const originalCompletedAt = '2026-11-02T08:30:00.000Z';
  const session = { id: 'legacy-completed-session', sourceType: 'work', sourceId: work.id, date: '2026-11-02', startTime: '08:00', endTime: '08:30', estimatedMinutes: 30, status: 'completed', completedAt: originalCompletedAt };
  const result = planner.applySessionCompletion(state, session, 'activity-completed', 100, '2026-11-02T10:00:00.000Z');
  assert.equal(result.ok, true, 'the previously completed session should allow the source task to be completed');
  assert.equal(work.status, 'completed', 'legacy inconsistent activity status should be repairable');
  assert.equal(work.progress, 100, 'the repaired activity should be at 100 percent');
  assert.equal(session.completedAt, originalCompletedAt, 'repairing the activity must preserve the original session completion time');
}

// 16. Completing an exercise updates its exercise status, not the parent lesson status.
{
  const state = baseState();
  const lesson = { id: 'exercise-parent', title: 'Aula com exercício', duration: 45, status: 'in-progress', progress: 50, hasExercise: true, exerciseDuration: 30, exerciseStatus: 'not-started', exerciseProgress: 0 };
  state.subjects.push({ id: 'exercise-subject', name: 'Disciplina', contentEnd: due, units: [{ id: 'exercise-unit', name: 'Unidade', lessons: [lesson] }] });
  const session = { id: 'exercise-session', sourceType: 'exercise', sourceId: lesson.id, date: '2026-11-02', startTime: '08:00', endTime: '08:30', estimatedMinutes: 30, status: 'planned' };
  const result = planner.applySessionCompletion(state, session, 'activity-completed', 100, '2026-11-02T08:30:00.000Z');
  assert.equal(result.ok, true, 'exercise completion should be accepted');
  assert.equal(lesson.exerciseStatus, 'completed', 'the exercise status should be completed');
  assert.equal(lesson.exerciseProgress, 100, 'the exercise progress should be 100 percent');
  assert.equal(lesson.status, 'in-progress', 'the parent lesson progress must remain independent');
}


// 17. Session length and rest time are configurable; breaks do not count as study minutes.
{
  const state = baseState();
  state.settings = { preferredSessionMinutes: 60, breakMinutes: 10 };
  state.availability.mon = { intervals: [{ id: 'long-block', start: '08:00', end: '12:00' }], goalMinutes: 240 };
  state.works.push({ id: 'three-hour-work', title: 'Trabalho de três horas', dueDate: '2026-11-02', duration: 180, status: 'not-started', priority: 'high' });
  const result = planner.generate(state, { now });
  const sessions = result.sessions.filter((session) => session.sourceType === 'work' && session.sourceId === 'three-hour-work' && session.status === 'planned')
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
  assert.equal(sessions.length, 3, 'three hours of work with a one-hour preference should create three sessions');
  assert.deepEqual(sessions.map((session) => session.estimatedMinutes), [60, 60, 60], 'sessions should follow the preferred duration');
  assert.equal(sessions[0].endTime, '09:00');
  assert.equal(sessions[1].startTime, '09:10', 'a ten-minute rest should be reserved between sessions of the same activity');
  assert.equal(sessions[1].endTime, '10:10');
  assert.equal(sessions[2].startTime, '10:20', 'the second rest should also be reserved');
  assert.equal(sessions.reduce((sum, session) => sum + session.estimatedMinutes, 0), 180, 'breaks must not count toward the activity estimate');
}

// 18. The final session can be shorter than the preferred duration.
{
  const state = baseState();
  state.settings = { preferredSessionMinutes: 60, breakMinutes: 10 };
  state.availability.mon = { intervals: [{ id: 'short-final', start: '08:00', end: '12:00' }], goalMinutes: 240 };
  state.works.push({ id: 'short-final-work', title: 'Atividade de 80 minutos', dueDate: '2026-11-02', duration: 80, status: 'not-started', priority: 'high' });
  const result = planner.generate(state, { now });
  const sessions = result.sessions.filter((session) => session.sourceType === 'work' && session.sourceId === 'short-final-work' && session.status === 'planned')
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
  assert.deepEqual(sessions.map((session) => session.estimatedMinutes), [60, 20], 'the final session should use only the remaining work duration');
  assert.equal(sessions[1].startTime, '09:10', 'the configured break should remain between the two sessions');
}


// 19. User-entered nonstandard durations (for example 00:37) are preserved, and only
// the final remaining work chunk may be shorter than the selected session length.
{
  const state = baseState();
  state.settings = { preferredSessionMinutes: 37, breakMinutes: 10 };
  state.availability.mon = { intervals: [{ id: 'custom-minutes', start: '08:00', end: '12:00' }], goalMinutes: 180 };
  state.works.push({ id: 'custom-37-minute-work', title: 'Trabalho de três horas', dueDate: '2026-11-02', duration: 180, status: 'not-started', priority: 'high' });
  const result = planner.generate(state, { now });
  const sessions = result.sessions.filter((session) => session.sourceType === 'work' && session.sourceId === 'custom-37-minute-work' && session.status === 'planned')
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
  assert.deepEqual(sessions.map((session) => session.estimatedMinutes), [37, 37, 37, 37, 32], '37-minute preference should be used for each full session and the final session should be the 32 minutes remaining');
  assert.equal(sessions.reduce((sum, session) => sum + session.estimatedMinutes, 0), 180, 'all estimated work minutes must be scheduled');
  for (let index = 1; index < sessions.length; index += 1) {
    assert.equal(planner.toMinutes(sessions[index].startTime) - planner.toMinutes(sessions[index - 1].endTime), 10, 'a ten-minute break must be reserved between consecutive sessions, including when crossing the daily-goal boundary');
  }
  assert.equal(sessions.at(-1).startTime, '11:08', 'the final session must start after the break extending into overflow availability');
  assert.equal(result.unplaced.some((activity) => activity.sourceId === 'custom-37-minute-work'), false, 'the planner should use free time beyond the daily goal when session breaks require it');
}

// 20. A small leftover gap must not create an arbitrary short non-final session.
{
  const state = baseState();
  state.settings = { preferredSessionMinutes: 37, breakMinutes: 10 };
  state.availability.mon = {
    intervals: [
      { id: 'morning-short-gap', start: '08:00', end: '08:50' },
      { id: 'later-session', start: '09:00', end: '10:00' }
    ],
    goalMinutes: 110
  };
  state.works.push({ id: 'split-interval-work', title: 'Atividade de 80 minutos', dueDate: '2026-11-02', duration: 80, status: 'not-started', priority: 'high' });
  const result = planner.generate(state, { now });
  const sessions = result.sessions.filter((session) => session.sourceType === 'work' && session.sourceId === 'split-interval-work' && session.status === 'planned')
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
  assert.deepEqual(sessions.map((session) => session.estimatedMinutes), [37, 37, 6], 'the algorithm must leave a tiny gap unused rather than creating a short session before the final chunk');
  assert.equal(sessions[1].startTime, '09:00', 'the second full session should use the next available interval');
  assert.equal(sessions[2].startTime, '09:47', 'the final six-minute chunk should follow the configured rest');
  assert.equal(result.unplaced.some((activity) => activity.sourceId === 'split-interval-work'), false, 'the activity should fit over the available intervals');
}

// 21. The interface is a free-text HH:MM field, not a list of fixed duration options.
{
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const storage = fs.readFileSync(path.join(root, 'js', 'storage.js'), 'utf8');
  assert.match(html, /id="preferredSessionMinutes"[^>]*type="text"/s, 'session duration must be typed directly by the user');
  assert.match(html, /00:37/, 'the help text should demonstrate a nonstandard minute value');
  assert.match(app, /totalMinutes >= 1 && totalMinutes <= 180/, 'the parser must accept exact whole-minute values down to one minute');
  assert.match(storage, /Math\.min\(180, Math\.max\(1, sessionMinutes\)\)/, 'stored preferences must preserve values such as 37 minutes');
}


// 22. A rest break is reserved between consecutive sessions even when they belong to different activities.
{
  const state = baseState();
  state.settings = { preferredSessionMinutes: 30, breakMinutes: 10, maxMixedSubjectsPerDay: 2 };
  state.availability.mon = { intervals: [{ id: 'cross-activity', start: '08:00', end: '12:00' }], goalMinutes: 240 };
  for (const key of ['tue', 'wed', 'thu', 'fri', 'sat', 'sun']) state.availability[key] = { intervals: [], goalMinutes: 0 };
  state.works.push(
    { id: 'first-work', title: 'Primeiro trabalho', dueDate: '2026-11-02', duration: 30, status: 'not-started', priority: 'high' },
    { id: 'second-work', title: 'Segundo trabalho', dueDate: '2026-11-02', duration: 30, status: 'not-started', priority: 'medium' }
  );
  const result = planner.generate(state, { now });
  const first = firstSession(result, 'work', 'first-work');
  const second = firstSession(result, 'work', 'second-work');
  assert.ok(first && second, 'both separate activities should be planned');
  assert.equal(planner.toMinutes(second.startTime) - planner.toMinutes(first.endTime), 10, 'break must separate sessions from different activities');
}

// 23. The calendar can derive a visible rest marker between sessions, regardless of source activity.
{
  const state = {
    settings: { breakMinutes: 10 },
    commitments: [],
    sessions: [
      { id: 'rest-a', sourceType: 'lesson', sourceId: 'lesson-a', date: '2026-11-02', startTime: '08:00', endTime: '08:30', status: 'planned' },
      { id: 'rest-b', sourceType: 'work', sourceId: 'work-b', date: '2026-11-02', startTime: '08:40', endTime: '09:10', status: 'planned' }
    ]
  };
  const pauses = planner.getBreaksBetweenSessions(state, '2026-11-02');
  assert.equal(pauses.length, 1, 'a rest marker should be produced between consecutive study sessions');
  assert.deepEqual({ start: pauses[0].startTime, end: pauses[0].endTime, minutes: pauses[0].durationMinutes }, { start: '08:30', end: '08:40', minutes: 10 });
}

// 24. A longer break is shown after the configured number of consecutive sessions, across activities.
{
  const state = {
    settings: { breakMinutes: 10, longBreakMinutes: 30, longBreakAfterSessions: 3 },
    commitments: [],
    sessions: [
      { id: 'long-a', sourceType: 'lesson', date: '2026-11-02', startTime: '08:00', endTime: '08:30', status: 'planned' },
      { id: 'long-b', sourceType: 'work', date: '2026-11-02', startTime: '08:40', endTime: '09:10', status: 'planned' },
      { id: 'long-c', sourceType: 'project', date: '2026-11-02', startTime: '09:20', endTime: '09:50', status: 'planned' },
      { id: 'long-d', sourceType: 'lesson', date: '2026-11-02', startTime: '10:20', endTime: '10:50', status: 'planned' }
    ]
  };
  const pauses = planner.getBreaksBetweenSessions(state, '2026-11-02');
  assert.deepEqual(pauses.map((pause) => pause.durationMinutes), [10, 10, 30], 'a longer break should follow the third session regardless of activity type');
  assert.equal(pauses[2].isLongBreak, true, 'the longer break should be visibly identifiable');
}

// 24. Do not visually place a rest card on top of a commitment.
{
  const state = {
    settings: { breakMinutes: 10 },
    commitments: [{ date: '2026-11-02', startTime: '08:35', endTime: '08:45' }],
    sessions: [
      { id: 'rest-commit-a', sourceType: 'lesson', sourceId: 'lesson-a', date: '2026-11-02', startTime: '08:00', endTime: '08:30', status: 'planned' },
      { id: 'rest-commit-b', sourceType: 'work', sourceId: 'work-b', date: '2026-11-02', startTime: '08:45', endTime: '09:15', status: 'planned' }
    ]
  };
  assert.equal(planner.getBreaksBetweenSessions(state, '2026-11-02').length, 0, 'pause marker must not overlap a commitment');
}

// 25. Previously completed sessions also reserve their rest before new work is placed.
{
  const state = baseState();
  state.settings = { preferredSessionMinutes: 30, breakMinutes: 10 };
  state.availability.mon = { intervals: [{ id: 'after-completed', start: '08:00', end: '12:00' }], goalMinutes: 240 };
  state.sessions.push({ id: 'already-done', sourceType: 'lesson', sourceId: 'old-lesson', date: '2026-11-02', startTime: '08:00', endTime: '08:30', estimatedMinutes: 30, status: 'completed' });
  state.works.push({ id: 'after-done-work', title: 'Trabalho depois da sessão', dueDate: '2026-11-02', duration: 30, status: 'not-started', priority: 'high' });
  const result = planner.generate(state, { now });
  const work = firstSession(result, 'work', 'after-done-work');
  assert.ok(work, 'new work should still be schedulable after a completed session');
  assert.equal(work.startTime, '08:40', 'a ten-minute rest should be reserved after a previously completed session');
}

// 26. Setting the break to zero disables both enforced and visible rests.
{
  const state = baseState();
  state.settings = { preferredSessionMinutes: 30, breakMinutes: 0 };
  state.availability.mon = { intervals: [{ id: 'no-break', start: '08:00', end: '12:00' }], goalMinutes: 240 };
  state.works.push(
    { id: 'no-break-a', title: 'Trabalho A', dueDate: '2026-11-02', duration: 30, status: 'not-started', priority: 'high' },
    { id: 'no-break-b', title: 'Trabalho B', dueDate: '2026-11-02', duration: 30, status: 'not-started', priority: 'medium' }
  );
  const result = planner.generate(state, { now });
  const a = firstSession(result, 'work', 'no-break-a');
  const b = firstSession(result, 'work', 'no-break-b');
  assert.equal(b.startTime, a.endTime, 'with no rest selected, the next activity may start immediately');
  assert.deepEqual(planner.getBreaksBetweenSessions({ settings: state.settings, sessions: result.sessions, commitments: [] }, '2026-11-02'), [], 'no break markers should appear when rest time is zero');
}

// 25. Header title, compact session preferences, and day-specific unique pending count stay aligned with requirements.
{
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(app, /calendar: \['SEU TEMPO, ORGANIZADO', 'Calendário'\]/, 'the top title should be Calendário while product branding remains Calêngrama');
  assert.doesNotMatch(html, /preferredSessionHelp/, 'long help text for session duration should be removed');
  assert.doesNotMatch(html, /Descanso entre sessões da mesma atividade/, 'rest preference must apply across all study sessions');
  assert.match(app, /pendingToday = new Set\(\)/, 'pending card should count unique activities scheduled for today');
  assert.match(app, /kind === 'break'/, 'calendar rendering should recognize break events');
  assert.match(html, /legend-break/, 'the calendar legend should identify rest periods');
  assert.match(css, /\.break-event/, 'weekly calendar pause styling should be available');
  assert.match(css, /\.mini-break/, 'monthly calendar pause styling should be available');
  assert.match(readme, /quaisquer sessões consecutivas de estudo/, 'README should document breaks between all study sessions');
}

console.log('PASS: regras do cronograma, pausas globais e após sessões concluídas, descanso desativável, marcadores de pausa, contador diário por atividade, títulos e README atualizados.');
