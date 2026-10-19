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

console.log('PASS: sequência das aulas, pré-requisitos, etapas de projetos, limites configuráveis, sessões mescladas, títulos dinâmicos e aproveitamento de horários livres além da meta.');
