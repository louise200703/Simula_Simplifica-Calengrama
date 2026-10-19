(function () {
  'use strict';

  const STORAGE_KEY = 'estudaMaisData';
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  function makeDefaultState() {
    const availability = {};
    DAYS.forEach((day) => {
      availability[day] = { intervals: [], goalMinutes: 120 };
    });
    return {
      version: 1,
      settings: { appName: 'Calêngrama', lastPlan: null, maxMixedSubjectsPerDay: 1 },
      subjects: [],
      works: [],
      projects: [],
      availability,
      commitments: [],
      sessions: []
    };
  }

  function normalizeState(value) {
    const defaults = makeDefaultState();
    if (!value || typeof value !== 'object') return defaults;
    const result = { ...defaults, ...value };
    result.settings = { ...defaults.settings, ...(value.settings || {}) };
    const mixedLimit = Number.parseInt(result.settings.maxMixedSubjectsPerDay, 10);
    result.settings.maxMixedSubjectsPerDay = Number.isInteger(mixedLimit) ? Math.min(5, Math.max(1, mixedLimit)) : 1;
    result.subjects = Array.isArray(value.subjects) ? value.subjects : [];
    result.works = Array.isArray(value.works) ? value.works : [];
    result.projects = Array.isArray(value.projects) ? value.projects : [];
    result.commitments = Array.isArray(value.commitments) ? value.commitments : [];
    result.sessions = Array.isArray(value.sessions) ? value.sessions : [];
    result.availability = { ...defaults.availability, ...(value.availability || {}) };
    DAYS.forEach((day) => {
      const savedDay = result.availability[day] || {};
      result.availability[day] = {
        intervals: Array.isArray(savedDay.intervals) ? savedDay.intervals : [],
        goalMinutes: Number.isFinite(Number(savedDay.goalMinutes)) ? Number(savedDay.goalMinutes) : 120
      };
    });
    return result;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : makeDefaultState();
    } catch (error) {
      console.error('Não foi possível ler os dados salvos:', error);
      return makeDefaultState();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error('Não foi possível salvar os dados:', error);
      return false;
    }
  }

  function makeId(prefix) {
    const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix || 'item'}-${randomPart}`;
  }

  window.AppStorage = { load, save, makeId, makeDefaultState };
})();
