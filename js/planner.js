(function () {
  'use strict';

  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const DAY_NAMES = { mon: 'segunda-feira', tue: 'terça-feira', wed: 'quarta-feira', thu: 'quinta-feira', fri: 'sexta-feira', sat: 'sábado', sun: 'domingo' };
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

  function isoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDate(value) {
    if (!value) return null;
    const parts = String(value).split('-').map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }

  function dayKey(date) {
    return DAY_KEYS[date.getDay()];
  }

  function dayKeyForDate(value) {
    const parsed = parseDate(value);
    return parsed ? dayKey(parsed) : 'mon';
  }

  function toMinutes(time) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time || ''));
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function fromMinutes(minutes) {
    const value = Math.max(0, Math.min(1439, Math.round(minutes)));
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }

  function percentRemaining(status, progress) {
    if (status === 'completed') return 0;
    if (status === 'in-progress') return Math.max(1, 100 - Math.min(99, Math.max(1, Number(progress) || 1))) / 100;
    return 1;
  }

  function activityRecord(fields) {
    return {
      id: fields.id,
      sourceType: fields.sourceType,
      sourceId: fields.sourceId,
      title: fields.title,
      detail: fields.detail || '',
      typeLabel: fields.typeLabel,
      subjectId: fields.subjectId || '',
      subjectName: fields.subjectName || '',
      allowMixedPeriods: fields.allowMixedPeriods !== false,
      color: fields.color || '#E7B600',
      duration: Math.max(0, Math.round(Number(fields.duration) || 0)),
      startDate: fields.startDate || '',
      dueDate: fields.dueDate || '',
      dueTime: fields.dueTime || '23:59',
      status: fields.status || 'not-started',
      progress: Number(fields.progress) || 0,
      priority: fields.priority || 'medium',
      dependsOn: Array.isArray(fields.dependsOn) ? [...new Set(fields.dependsOn)] : [],
      dependencyLabel: fields.dependencyLabel || '',
      sequenceNumber: Number(fields.sequenceNumber) || 0
    };
  }

  function collectActivities(state) {
    const activities = [];
    const completedSessionMinutes = new Map();
    const unitTaskIds = new Map();
    const lessonTaskIds = new Map();

    (state.sessions || []).filter((session) => session.status === 'completed').forEach((session) => {
      const key = `${session.sourceType}:${session.sourceId}`;
      completedSessionMinutes.set(key, (completedSessionMinutes.get(key) || 0) + (Number(session.estimatedMinutes) || 0));
    });
    const remainingFor = (sourceType, sourceId, duration, status, progress) => {
      const estimatedRemaining = Math.ceil((Number(duration) || 0) * percentRemaining(status, progress));
      if (status !== 'in-progress') return Math.max(0, estimatedRemaining - (completedSessionMinutes.get(`${sourceType}:${sourceId}`) || 0));
      return estimatedRemaining;
    };
    const addActivity = (fields) => {
      const activity = activityRecord(fields);
      if (activity.duration > 0) {
        activities.push(activity);
      }
      return activity.duration > 0 ? activity.id : '';
    };

    // Course content is collected in the order shown in the subject editor: unit order, then lesson order.
    // Each later content item depends on all earlier pending content in that subject.
    state.subjects.forEach((subject) => {
      const units = Array.isArray(subject.units) ? subject.units : [];
      const precedingContentIds = [];
      units.forEach((unit, unitIndex) => {
        const lessons = Array.isArray(unit.lessons) ? unit.lessons : [];
        lessons.forEach((lesson, lessonIndex) => {
          const lessonTaskList = [];
          const status = lesson.status || 'not-started';
          const lessonRemaining = remainingFor('lesson', lesson.id, lesson.duration, status, lesson.progress);
          const lessonKey = `lesson:${lesson.id}`;
          if (status !== 'completed' && lessonRemaining > 0) {
            const id = addActivity({
              id: lessonKey, sourceType: 'lesson', sourceId: lesson.id,
              title: `Unidade ${unitIndex + 1} · Aula ${lessonIndex + 1}: ${lesson.title}`, detail: `${unit.name} · conteúdo sequencial`,
              typeLabel: 'Aula / conteúdo', subjectId: subject.id, subjectName: subject.name, allowMixedPeriods: subject.allowMixedPeriods !== false, color: subject.color,
              duration: lessonRemaining, startDate: subject.contentStart || '', dueDate: subject.contentEnd || '',
              status, progress: lesson.progress, priority: 'medium', dependsOn: precedingContentIds,
              sequenceNumber: lessonIndex + 1
            });
            if (id) {
              precedingContentIds.push(id);
              lessonTaskList.push(id);
            }
          }

          if (lesson.hasExercise && (lesson.exerciseStatus || 'not-started') !== 'completed') {
            const exerciseStatus = lesson.exerciseStatus || 'not-started';
            const exerciseRemaining = remainingFor('exercise', lesson.id, lesson.exerciseDuration || 30, exerciseStatus, lesson.exerciseProgress);
            if (exerciseRemaining > 0) {
              const id = addActivity({
                id: `exercise:${lesson.id}`, sourceType: 'exercise', sourceId: lesson.id,
                title: `Exercícios da aula ${lessonIndex + 1}: ${lesson.title}`, detail: `${unit.name} · após a aula correspondente`,
                typeLabel: 'Exercícios', subjectId: subject.id, subjectName: subject.name, allowMixedPeriods: subject.allowMixedPeriods !== false, color: subject.color,
                duration: exerciseRemaining, startDate: subject.contentStart || '', dueDate: subject.contentEnd || '',
                status: exerciseStatus, progress: lesson.exerciseProgress || 0, priority: 'medium',
                dependsOn: [...precedingContentIds], sequenceNumber: lessonIndex + 1
              });
              if (id) {
                precedingContentIds.push(id);
                  lessonTaskList.push(id);
              }
            }
          }
          // A work linked to this lesson must wait for this lesson and all earlier pending content.
          lessonTaskIds.set(lesson.id, [...precedingContentIds]);
        });
        // Linking a work to a unit means completing content through the end of that unit first.
        unitTaskIds.set(unit.id, [...precedingContentIds]);
      });
    });

    state.works.forEach((work) => {
      if ((work.status || 'not-started') === 'completed') return;
      const remaining = remainingFor('work', work.id, work.duration, work.status, work.progress);
      if (remaining <= 0) return;
      const subject = state.subjects.find((item) => item.id === work.subjectId);
      let dependsOn = [];
      if (work.prerequisiteType === 'unit' && work.prerequisiteId) dependsOn = unitTaskIds.get(work.prerequisiteId) || [];
      if (work.prerequisiteType === 'lesson' && work.prerequisiteId) dependsOn = lessonTaskIds.get(work.prerequisiteId) || [];
      const prerequisite = work.prerequisiteType && work.prerequisiteId
        ? findPrerequisite(state, work.prerequisiteType, work.prerequisiteId) : null;
      activities.push(activityRecord({
        id: `work:${work.id}`, sourceType: 'work', sourceId: work.id, title: work.title,
        detail: [work.description || '', prerequisite ? `Pré-requisito: ${prerequisite.label}` : ''].filter(Boolean).join(' · '),
        typeLabel: work.categoryLabel || 'Trabalho', subjectId: work.subjectId,
        subjectName: subject ? subject.name : '', color: subject ? subject.color : '#D6A72C', duration: remaining,
        startDate: work.startDate || '', dueDate: work.dueDate || '', dueTime: work.dueTime || '23:59',
        status: work.status, progress: work.progress, priority: work.priority, dependsOn,
        dependencyLabel: prerequisite ? prerequisite.label : ''
      }));
    });

    state.projects.forEach((project) => {
      const subject = state.subjects.find((item) => item.id === project.subjectId);
      const stages = (Array.isArray(project.stages) ? project.stages : [])
        .map((stage, index) => ({ ...stage, _stageNumber: Number(stage.order) > 0 ? Number(stage.order) : index + 1, _originalIndex: index }))
        .sort((a, b) => a._stageNumber - b._stageNumber || a._originalIndex - b._originalIndex);
      const precedingStageIds = [];
      stages.forEach((stage, index) => {
        if ((stage.status || 'not-started') === 'completed') return;
        const remaining = remainingFor('stage', stage.id, stage.duration, stage.status, stage.progress);
        if (remaining <= 0) return;
        const id = addActivity({
          id: `stage:${stage.id}`, sourceType: 'stage', sourceId: stage.id,
          title: `Etapa ${index + 1}: ${stage.title}`, detail: project.title,
          typeLabel: 'Etapa de projeto', subjectId: project.subjectId, subjectName: subject ? subject.name : '',
          color: subject ? subject.color : '#D6A72C', duration: remaining,
          startDate: stage.startDate || project.startDate || '', dueDate: stage.dueDate || project.dueDate || '',
          dueTime: stage.dueTime || project.dueTime || '23:59', status: stage.status, progress: stage.progress,
          priority: stage.priority || project.priority || 'medium', dependsOn: precedingStageIds,
          sequenceNumber: index + 1
        });
        if (id) precedingStageIds.push(id);
      });
      // Projects without stages are deliberately not planned as a single duration-based task.
    });

    return activities;
  }

  function findSessionSourceRecord(state, session) {
    if (!state || !session) return null;

    if (session.sourceType === 'lesson' || session.sourceType === 'exercise') {
      for (const subject of state.subjects || []) {
        for (const unit of subject.units || []) {
          const lesson = (unit.lessons || []).find((item) => item.id === session.sourceId);
          if (lesson) {
            const isExercise = session.sourceType === 'exercise';
            return {
              item: lesson,
              statusKey: isExercise ? 'exerciseStatus' : 'status',
              progressKey: isExercise ? 'exerciseProgress' : 'progress',
              kind: isExercise ? 'exercise' : 'lesson'
            };
          }
        }
      }
    }

    if (session.sourceType === 'work') {
      const item = (state.works || []).find((entry) => entry.id === session.sourceId);
      if (item) return { item, statusKey: 'status', progressKey: 'progress', kind: 'work' };
    }

    if (session.sourceType === 'project') {
      const item = (state.projects || []).find((entry) => entry.id === session.sourceId);
      if (item) return { item, statusKey: 'status', progressKey: 'progress', kind: 'project' };
    }

    if (session.sourceType === 'stage') {
      for (const project of state.projects || []) {
        const item = (project.stages || []).find((stage) => stage.id === session.sourceId);
        if (item) return { item, statusKey: 'status', progressKey: 'progress', kind: 'stage', project };
      }
    }

    return null;
  }

  // A completed study session and a completed academic activity are different events.
  // When the user records a session, explicitly update the source activity so future
  // planning cannot mistake already-finished work for untouched work.
  function applySessionCompletion(state, session, outcome, progress, completedAt = new Date().toISOString()) {
    if (!session) return { ok: false, message: 'A sessão não foi encontrada.' };
    const target = findSessionSourceRecord(state, session);
    if (!target) return { ok: false, message: 'Não foi possível localizar a atividade relacionada a esta sessão.' };

    if (outcome === 'session-only') {
      const percentage = Number(progress);
      if (!Number.isInteger(percentage) || percentage < 1 || percentage > 99) {
        return { ok: false, message: 'Informe uma porcentagem de progresso entre 1% e 99%.' };
      }
      target.item[target.statusKey] = 'in-progress';
      target.item[target.progressKey] = percentage;
    } else if (outcome === 'activity-completed') {
      target.item[target.statusKey] = 'completed';
      target.item[target.progressKey] = 100;
      if (target.kind === 'project' && Array.isArray(target.item.stages)) {
        target.item.stages.forEach((stage) => {
          stage.status = 'completed';
          stage.progress = 100;
        });
      }
    } else {
      return { ok: false, message: 'Escolha se concluiu apenas a sessão ou a atividade inteira.' };
    }

    session.status = 'completed';
    session.completedAt = session.completedAt || completedAt;
    return { ok: true, activityStatus: target.item[target.statusKey], progress: target.item[target.progressKey], kind: target.kind };
  }

  function findPrerequisite(state, type, id) {
    for (let subjectIndex = 0; subjectIndex < (state.subjects || []).length; subjectIndex += 1) {
      const subject = state.subjects[subjectIndex];
      for (let unitIndex = 0; unitIndex < (subject.units || []).length; unitIndex += 1) {
        const unit = subject.units[unitIndex];
        if (type === 'unit' && unit.id === id) return { label: `${subject.name} · Unidade ${unitIndex + 1}: ${unit.name}`, subject, unit };
        for (let lessonIndex = 0; lessonIndex < (unit.lessons || []).length; lessonIndex += 1) {
          const lesson = unit.lessons[lessonIndex];
          if (type === 'lesson' && lesson.id === id) return { label: `${subject.name} · Unidade ${unitIndex + 1}, aula ${lessonIndex + 1}: ${lesson.title}`, subject, unit, lesson };
        }
      }
    }
    return null;
  }

  // Resolve a session title from its source record so edits appear immediately
  // without requiring the student to regenerate the whole schedule.
  function getSessionDisplayTitle(state, session) {
    if (!session) return '';

    if (session.sourceType === 'lesson' || session.sourceType === 'exercise') {
      for (const subject of state.subjects || []) {
        const units = Array.isArray(subject.units) ? subject.units : [];
        for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
          const lessons = Array.isArray(units[unitIndex].lessons) ? units[unitIndex].lessons : [];
          for (let lessonIndex = 0; lessonIndex < lessons.length; lessonIndex += 1) {
            const lesson = lessons[lessonIndex];
            if (lesson.id !== session.sourceId) continue;
            if (session.sourceType === 'exercise') return `Exercícios da aula ${lessonIndex + 1}: ${lesson.title}`;
            return `Unidade ${unitIndex + 1} · Aula ${lessonIndex + 1}: ${lesson.title}`;
          }
        }
      }
    }

    if (session.sourceType === 'work') {
      const work = (state.works || []).find((item) => item.id === session.sourceId);
      if (work) return work.title;
    }

    if (session.sourceType === 'project') {
      const project = (state.projects || []).find((item) => item.id === session.sourceId);
      if (project) return project.title;
    }

    if (session.sourceType === 'stage') {
      for (const project of state.projects || []) {
        const stages = (Array.isArray(project.stages) ? project.stages : [])
          .map((stage, index) => ({ ...stage, _stageNumber: Number(stage.order) > 0 ? Number(stage.order) : index + 1, _originalIndex: index }))
          .sort((a, b) => a._stageNumber - b._stageNumber || a._originalIndex - b._originalIndex);
        const index = stages.findIndex((stage) => stage.id === session.sourceId);
        if (index >= 0) return `Etapa ${index + 1}: ${stages[index].title}`;
      }
    }

    return session.title || '';
  }

  // Derives visible breaks between every pair of consecutive study sessions, regardless of subject/activity.
  // A longer pause is used after each configured number of sessions.
  function getBreaksBetweenSessions(state, dateString) {
    const shortBreak = Math.max(0, Math.min(60, Number(state?.settings?.breakMinutes ?? 10)));
    const longBreak = Math.max(0, Math.min(60, Number(state?.settings?.longBreakMinutes ?? 0)));
    const longAfter = Math.max(2, Math.min(10, Number(state?.settings?.longBreakAfterSessions ?? 3)));
    const sessions = (state.sessions || [])
      .filter((session) => session.date === dateString && ['planned', 'completed'].includes(session.status || 'planned'))
      .filter((session) => toMinutes(session.startTime) !== null && toMinutes(session.endTime) !== null && toMinutes(session.endTime) > toMinutes(session.startTime))
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    const commitments = (state.commitments || []).filter((item) => item.date === dateString)
      .map((item) => ({ start: toMinutes(item.startTime), end: toMinutes(item.endTime) }))
      .filter((item) => item.start !== null && item.end !== null && item.end > item.start);
    const pauses = [];
    for (let index = 0; index < sessions.length - 1; index += 1) {
      const previous = sessions[index];
      const next = sessions[index + 1];
      const start = toMinutes(previous.endTime);
      const duration = ((index + 1) % longAfter === 0 && longBreak > 0) ? longBreak : shortBreak;
      const end = start === null ? null : start + duration;
      const nextStart = toMinutes(next.startTime);
      if (!duration || start === null || end === null || nextStart === null || nextStart < end) continue;
      if (commitments.some((item) => item.start < end && item.end > start)) continue;
      const overlapsAnotherCalendarSession = sessions.some((item) => {
        if (item.id === previous.id || item.id === next.id) return false;
        const itemStart = toMinutes(item.startTime);
        const itemEnd = toMinutes(item.endTime);
        return itemStart !== null && itemEnd !== null && itemStart < end && itemEnd > start;
      });
      if (overlapsAnotherCalendarSession) continue;
      pauses.push({
        afterSessionId: previous.id,
        beforeSessionId: next.id,
        startTime: fromMinutes(start),
        endTime: fromMinutes(end),
        durationMinutes: duration,
        title: duration === longBreak && longBreak > shortBreak ? 'Pausa prolongada para descanso' : 'Pausa para descanso',
        isLongBreak: duration === longBreak && longBreak > shortBreak
      });
    }
    return pauses;
  }

  function rangesSubtract(start, end, blocks) {
    let ranges = [{ start, end }];
    blocks.forEach((block) => {
      const next = [];
      ranges.forEach((range) => {
        if (block.end <= range.start || block.start >= range.end) {
          next.push(range);
        } else {
          if (block.start > range.start) next.push({ start: range.start, end: block.start });
          if (block.end < range.end) next.push({ start: block.end, end: range.end });
        }
      });
      ranges = next;
    });
    return ranges;
  }

  function makeTimeSlots(state, fromDate, horizonDays, fixedSessions = []) {
    const regularSlots = [];
    const overflowSlots = [];
    for (let offset = 0; offset < horizonDays; offset += 1) {
      const date = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + offset);
      const dateString = isoDate(date);
      const schedule = state.availability[dayKey(date)] || { intervals: [], goalMinutes: 0 };
      const reservedMinutes = fixedSessions.filter((item) => item.date === dateString && ['planned', 'completed'].includes(item.status))
        .reduce((sum, item) => sum + (Number(item.estimatedMinutes) || 0), 0);
      // The daily goal is the normal planning target. Only time beyond that target
      // becomes overflow capacity, used if an activity cannot fit before its deadline.
      let regularLeft = Math.max(0, (Number(schedule.goalMinutes) || 0) - reservedMinutes);
      const breakMinutes = Math.max(0, Math.min(60, Number(state.settings?.breakMinutes ?? 10)));
      const fixedSessionBlocks = fixedSessions.filter((item) => item.date === dateString).flatMap((item) => {
        const start = toMinutes(item.startTime);
        const end = toMinutes(item.endTime);
        if (start === null || end === null || end <= start) return [];
        const blocks = [{ start, end }];
        if (breakMinutes > 0) blocks.push({ start: end, end: end + breakMinutes });
        return blocks;
      });
      const commitments = state.commitments.filter((item) => item.date === dateString)
        .map((item) => ({ start: toMinutes(item.startTime), end: toMinutes(item.endTime) }))
        .filter((item) => item.start !== null && item.end !== null && item.end > item.start)
        .concat(fixedSessionBlocks)
        .sort((a, b) => a.start - b.start);
      const currentMinutes = dateString === isoDate(new Date()) ? (new Date().getHours() * 60 + new Date().getMinutes()) : 0;
      const intervals = [...(schedule.intervals || [])]
        .map((item) => ({ start: Math.max(toMinutes(item.start) ?? 0, currentMinutes), end: toMinutes(item.end) }))
        .filter((item) => item.start !== null && item.end !== null && item.end > item.start)
        .sort((a, b) => a.start - b.start);
      intervals.forEach((interval) => {
        rangesSubtract(interval.start, interval.end, commitments).forEach((range) => {
          let cursor = range.start;
          const availableLength = range.end - range.start;
          const regularLength = Math.min(availableLength, regularLeft);
          if (regularLength > 0) {
            regularSlots.push({ date: dateString, start: cursor, cursor, end: cursor + regularLength, overflow: false });
            cursor += regularLength;
            regularLeft -= regularLength;
          }
          // Keep the extra segment separate so normal target-hours are always tried first.
          if (cursor < range.end) {
            overflowSlots.push({ date: dateString, start: cursor, cursor, end: range.end, overflow: true });
          }
        });
      });
    }
    // Scheduling iterates through normal slots first, then uses overflow slots only
    // for work that still has unallocated time after normal capacity was considered.
    return [...regularSlots, ...overflowSlots];
  }

  function isDisciplineContent(session) {
    return Boolean(session && session.subjectId && (session.sourceType === 'lesson' || session.sourceType === 'exercise'));
  }

  function canPlaceDisciplineContent(candidate, alreadyPlanned, state, maxMixedSubjectsPerDay) {
    if (!isDisciplineContent(candidate)) return true;
    const candidateSubject = (state.subjects || []).find((subject) => subject.id === candidate.subjectId);
    // Legacy sessions/subjects default to allowing mixing so existing data remains usable.
    const candidateAllowsMixing = candidate.allowMixedPeriods !== undefined
      ? candidate.allowMixedPeriods !== false
      : candidateSubject?.allowMixedPeriods !== false;
    const daySubjects = new Set(alreadyPlanned
      .filter((session) => session.date === candidate.date && isDisciplineContent(session))
      .map((session) => session.subjectId));
    const otherSubjectIds = [...daySubjects].filter((id) => id !== candidate.subjectId);

    // A subject not opted into mixed periods gets a day without content from other subjects.
    if (!candidateAllowsMixing) return otherSubjectIds.length === 0;

    // Mixed sessions may only include other subjects that also opted in.
    const otherSubjectsAllowMixing = otherSubjectIds.every((id) => {
      const subject = (state.subjects || []).find((item) => item.id === id);
      return subject && subject.allowMixedPeriods !== false;
    });
    const distinctSubjectCount = daySubjects.size + (daySubjects.has(candidate.subjectId) ? 0 : 1);
    return otherSubjectsAllowMixing && distinctSubjectCount <= maxMixedSubjectsPerDay;
  }

  function generate(state, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayString = isoDate(today);
    const horizonDays = Math.max(30, Math.min(180, Number(options.horizonDays) || 120));
    const activities = collectActivities(state);
    const rawMixLimit = Number.parseInt(state.settings?.maxMixedSubjectsPerDay, 10);
    const maxMixedSubjectsPerDay = Number.isInteger(rawMixLimit) ? Math.min(5, Math.max(1, rawMixLimit)) : 1;
    const missingDeadline = activities.filter((item) => !parseDate(item.dueDate));
    const invalidWindow = activities.filter((item) => parseDate(item.startDate) && parseDate(item.dueDate) && parseDate(item.startDate) > parseDate(item.dueDate));
    const usable = activities.filter((item) => parseDate(item.dueDate) && !(parseDate(item.startDate) && parseDate(item.startDate) > parseDate(item.dueDate)));

    usable.forEach((item) => {
      if (!item.startDate || item.startDate < todayString) item.startDate = todayString;
    });
    const sortByUrgency = (a, b) => {
      const dueDifference = (parseDate(a.dueDate) || new Date(8640000000000000)) - (parseDate(b.dueDate) || new Date(8640000000000000));
      if (dueDifference) return dueDifference;
      const priorityDifference = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
      if (priorityDifference) return priorityDifference;
      return b.duration - a.duration;
    };
    usable.forEach((item) => {
      if (!item.startDate || item.startDate < todayString) item.startDate = todayString;
    });

    const allActivityIds = new Set(activities.map((activity) => activity.id));
    const activeKeys = new Set(usable.map((activity) => activity.id));
    const remainingByKey = new Map(usable.map((activity) => [activity.id, activity.duration]));
    const fixedSessions = [];
    const movedCandidates = state.sessions.filter((session) => {
      const key = `${session.sourceType}:${session.sourceId}`;
      return session.status === 'planned' && session.manuallyMoved && session.date >= todayString && activeKeys.has(key) && session.date <= (usable.find((activity) => activity.id === key)?.dueDate || session.date);
    }).sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
    movedCandidates.forEach((session) => {
      const dayKey = dayKeyForDate(session.date);
      const intervals = state.availability[dayKey]?.intervals || [];
      const insideInterval = intervals.some((interval) => session.startTime >= interval.start && session.endTime <= interval.end);
      const hasCommitmentConflict = state.commitments.some((item) => item.date === session.date && session.startTime < item.endTime && session.endTime > item.startTime);
      const hasSessionConflict = fixedSessions.some((item) => item.date === session.date && session.startTime < item.endTime && session.endTime > item.startTime);
      const existingDailyMinutes = fixedSessions.filter((item) => item.date === session.date).reduce((sum, item) => sum + (Number(item.estimatedMinutes) || 0), 0);
      const dailyGoal = Number(state.availability[dayKey]?.goalMinutes) || 0;
      const sessionMinutes = Number(session.estimatedMinutes) || 0;
      const remainingForActivity = remainingByKey.get(`${session.sourceType}:${session.sourceId}`) || 0;
      const mixingAllowed = canPlaceDisciplineContent(session, fixedSessions, state, maxMixedSubjectsPerDay);
      if (insideInterval && !hasCommitmentConflict && !hasSessionConflict && existingDailyMinutes + sessionMinutes <= dailyGoal && sessionMinutes <= remainingForActivity && mixingAllowed) {
        fixedSessions.push(session);
        remainingByKey.set(`${session.sourceType}:${session.sourceId}`, Math.max(0, remainingForActivity - sessionMinutes));
      }
    });
    // Preserve manually moved future sessions only if the routine, daily goal, deadlines and commitments still permit them.
    const fixedMinutesByKey = new Map();
    const fixedEndByKey = new Map();
    fixedSessions.forEach((session) => {
      const key = `${session.sourceType}:${session.sourceId}`;
      fixedMinutesByKey.set(key, (fixedMinutesByKey.get(key) || 0) + (Number(session.estimatedMinutes) || 0));
      const endMoment = { date: session.date, minute: toMinutes(session.endTime) ?? 0 };
      const current = fixedEndByKey.get(key);
      if (!current || `${endMoment.date}T${String(endMoment.minute).padStart(4, '0')}` > `${current.date}T${String(current.minute).padStart(4, '0')}`) fixedEndByKey.set(key, endMoment);
    });
    usable.forEach((activity) => {
      const key = activity.id;
      activity.duration = Math.max(0, activity.duration - (fixedMinutesByKey.get(key) || 0));
    });
    const schedulable = usable.filter((activity) => activity.duration > 0);
    // A completed session occupies the time it was actually performed and counts toward
    // the daily study goal. Reserve today's/future completed session slots so regeneration
    // cannot accidentally schedule a new activity over a period already marked as done.
    const occupiedCompletedSessions = state.sessions.filter((session) =>
      session.status === 'completed' && session.date >= todayString
    );
    const slots = makeTimeSlots(state, today, horizonDays, [...occupiedCompletedSessions, ...fixedSessions]);
    const generatedSessions = [];
    const unplaced = [];
    const successfulTasks = new Set();
    const completionMomentByKey = new Map(fixedEndByKey);
    // If a manually moved planned session already covers an activity's full remaining estimate,
    // it can satisfy dependencies at its real calendar time without creating duplicate sessions.
    usable.filter((activity) => activity.duration <= 0 && fixedEndByKey.has(activity.id)).forEach((activity) => successfulTasks.add(activity.id));
    const pending = new Map(schedulable.map((activity) => [activity.id, activity]));

    const laterMoment = (left, right) => {
      if (!left) return right;
      if (!right) return left;
      return `${left.date}T${String(left.minute).padStart(4, '0')}` >= `${right.date}T${String(right.minute).padStart(4, '0')}` ? left : right;
    };
    const scheduleActivity = (activity) => {
      let remaining = activity.duration;
      let skippedByMixingRule = false;
      const earliest = parseDate(activity.startDate) || today;
      const due = parseDate(activity.dueDate);
      const dueMinute = toMinutes(activity.dueTime) ?? 1439;
      if (!due || due < today) {
        unplaced.push({ ...activity, remaining, reason: 'O prazo já passou.' });
        return false;
      }
      let minimumMoment = fixedEndByKey.get(activity.id) || null;
      for (const dependencyId of activity.dependsOn || []) {
        const dependencyMoment = completionMomentByKey.get(dependencyId);
        if (dependencyMoment) minimumMoment = laterMoment(minimumMoment, dependencyMoment);
      }
      const canUseOnDate = (slot) => {
        if (slot.date < isoDate(earliest) || slot.date > activity.dueDate) return false;
        if (minimumMoment && slot.date < minimumMoment.date) return false;
        if ((activity.sourceType === 'lesson' || activity.sourceType === 'exercise') && !canPlaceDisciplineContent({
          date: slot.date, subjectId: activity.subjectId, sourceType: activity.sourceType,
          allowMixedPeriods: activity.allowMixedPeriods
        }, [...fixedSessions, ...generatedSessions], state, maxMixedSubjectsPerDay)) {
          skippedByMixingRule = true;
          return false;
        }
        return true;
      };
      const capacityForSlot = (slot) => {
        if (!canUseOnDate(slot)) return 0;
        // Use a local cursor for each activity so a prerequisite time limit does not
        // mutate or erase a slot that could still serve another activity.
        const cursor = Math.max(slot.cursor, minimumMoment && slot.date === minimumMoment.date ? minimumMoment.minute : slot.cursor);
        let endLimit = slot.end;
        if (slot.date === activity.dueDate) endLimit = Math.min(endLimit, dueMinute);
        return Math.max(0, endLimit - cursor);
      };
      const slotOrder = (a, b) => `${a.date}T${String(a.start).padStart(4, '0')}`.localeCompare(`${b.date}T${String(b.start).padStart(4, '0')}`);
      const regularSlots = slots.filter((slot) => !slot.overflow).sort(slotOrder);
      // The user enters any whole-minute duration (for example, 00:37). A session uses
      // that full preference unless the activity's actual remaining work is shorter.
      const preferredSessionMinutes = Math.max(1, Math.min(180, Number(state.settings?.preferredSessionMinutes) || 60));
      const breakMinutes = Math.max(0, Math.min(60, Number(state.settings?.breakMinutes ?? 10)));
      const longBreakMinutes = Math.max(0, Math.min(60, Number(state.settings?.longBreakMinutes ?? 0)));
      const longBreakAfterSessions = Math.max(2, Math.min(10, Number(state.settings?.longBreakAfterSessions ?? 3)));
      const sessionCountForDate = (date, extraSessions = []) =>
        (state.sessions || []).filter((item) => item.date === date && ['planned', 'completed'].includes(item.status || 'planned')).length +
        generatedSessions.filter((item) => item.date === date).length + extraSessions.filter((item) => item.date === date).length;
      const restAfterSession = (date, countOverride) => {
        const count = countOverride ?? sessionCountForDate(date);
        return count > 0 && count % longBreakAfterSessions === 0 && longBreakMinutes > 0 ? longBreakMinutes : breakMinutes;
      };

      // Reserve the requested pause across all available slot segments on that date.
      // This also carries a rest across the boundary between normal-goal and overflow time.
      const reserveBreakAcrossSlots = (slotList, date, breakStart, breakEnd) => {
        if (breakEnd <= breakStart) return;
        slotList.forEach((candidate) => {
          if (candidate.date !== date || candidate.start >= breakEnd || candidate.end <= breakStart) return;
          candidate.cursor = Math.max(candidate.cursor, Math.min(breakEnd, candidate.end));
        });
      };

      // Simulate placement without mutating live slots. This checks whether the task
      // fits inside the normal daily goals after session breaks and full-sized chunks
      // are taken into account. If not, the real planner may use overflow time.
      const canFitOnSlots = (sourceSlots) => {
        const simulatedSlots = sourceSlots.map((slot) => ({ ...slot })).sort(slotOrder);
        let simulatedRemaining = remaining;
        const simulatedSessionsByDate = new Map();
        for (const simulatedSlot of simulatedSlots) {
          if (simulatedRemaining <= 0) break;
          if (!canUseOnDate(simulatedSlot)) continue;
          let cursor = Math.max(simulatedSlot.cursor, minimumMoment && simulatedSlot.date === minimumMoment.date ? minimumMoment.minute : simulatedSlot.cursor);
          let endLimit = simulatedSlot.end;
          if (simulatedSlot.date === activity.dueDate) endLimit = Math.min(endLimit, dueMinute);
          while (simulatedRemaining > 0 && cursor < endLimit) {
            cursor = Math.max(cursor, simulatedSlot.cursor);
            const chunk = simulatedRemaining < preferredSessionMinutes ? simulatedRemaining : preferredSessionMinutes;
            // Never create a short non-final session merely to use a small leftover gap.
            if (endLimit - cursor < chunk) break;
            const sessionEnd = cursor + chunk;
            simulatedRemaining -= chunk;
            cursor = sessionEnd;
            const alreadyCounted = sessionCountForDate(simulatedSlot.date) + (simulatedSessionsByDate.get(simulatedSlot.date) || 0) + 1;
            simulatedSessionsByDate.set(simulatedSlot.date, (simulatedSessionsByDate.get(simulatedSlot.date) || 0) + 1);
            const rest = alreadyCounted % longBreakAfterSessions === 0 && longBreakMinutes > 0 ? longBreakMinutes : breakMinutes;
            if (simulatedRemaining > 0 && rest > 0) {
              reserveBreakAcrossSlots(simulatedSlots, simulatedSlot.date, sessionEnd, sessionEnd + rest);
              cursor = sessionEnd + rest;
            }
            simulatedSlot.cursor = Math.max(simulatedSlot.cursor, Math.min(cursor, simulatedSlot.end));
          }
        }
        return simulatedRemaining <= 0;
      };

      // Keep the normal goal whenever the activity can genuinely fit there. Breaks and
      // session boundaries are included in this check, otherwise urgent tasks could be
      // incorrectly reported as impossible instead of using available overflow time.
      const normalPlanFits = canFitOnSlots(regularSlots);
      const candidateSlots = (normalPlanFits ? regularSlots : slots.filter((slot) => canUseOnDate(slot)))
        .filter((slot) => capacityForSlot(slot) > 0)
        .sort(slotOrder);

      for (const slot of candidateSlots) {
        if (remaining <= 0) break;
        if (!canUseOnDate(slot)) continue;
        let cursor = Math.max(slot.cursor, minimumMoment && slot.date === minimumMoment.date ? minimumMoment.minute : slot.cursor);
        let endLimit = slot.end;
        if (slot.date === activity.dueDate) endLimit = Math.min(endLimit, dueMinute);
        while (remaining > 0 && cursor < endLimit) {
          cursor = Math.max(cursor, slot.cursor);
          const chunk = remaining < preferredSessionMinutes ? remaining : preferredSessionMinutes;
          // Only the final session may be shorter than the chosen duration, and it must
          // fit completely in an available interval. Small leftover gaps are left unused.
          if (endLimit - cursor < chunk) break;
          const sessionEnd = cursor + chunk;
          generatedSessions.push({
            id: window.AppStorage.makeId('session'), date: slot.date,
            startTime: fromMinutes(cursor), endTime: fromMinutes(sessionEnd),
            title: activity.title, detail: activity.detail, typeLabel: activity.typeLabel,
            sourceType: activity.sourceType, sourceId: activity.sourceId, subjectId: activity.subjectId,
            subjectName: activity.subjectName, color: activity.color, estimatedMinutes: chunk,
            status: 'planned', priority: activity.priority, dependencyLabel: activity.dependencyLabel || '',
            beyondDailyGoal: Boolean(slot.overflow)
          });
          remaining -= chunk;
          cursor = sessionEnd;
          // A break separates consecutive study sessions across all activities and disciplines.
          // Every Nth session on the day can trigger a longer recovery break.
          const dailySessionCount = sessionCountForDate(slot.date);
          const rest = restAfterSession(slot.date, dailySessionCount);
          if (rest > 0) {
            reserveBreakAcrossSlots(slots, slot.date, sessionEnd, sessionEnd + rest);
            cursor = sessionEnd + rest;
          }
          slot.cursor = Math.max(slot.cursor, Math.min(cursor, slot.end));
          if (cursor >= endLimit) break;
        }
      }
      if (remaining > 0) {
        let reason = `Faltaram ${remaining} min de horários disponíveis antes do prazo.`;
        if (skippedByMixingRule) reason += ' A preferência de mesclagem ou o limite diário de disciplinas também restringiu parte dos períodos.';
        if (!slots.length) reason = 'Nenhum horário de estudo está configurado ou disponível.';
        unplaced.push({ ...activity, remaining, reason });
        return false;
      }
      const generatedForActivity = generatedSessions.filter((session) => `${session.sourceType}:${session.sourceId}` === activity.id);
      let completion = fixedEndByKey.get(activity.id) || null;
      generatedForActivity.forEach((session) => {
        completion = laterMoment(completion, { date: session.date, minute: toMinutes(session.endTime) ?? 0 });
      });
      if (completion) completionMomentByKey.set(activity.id, completion);
      successfulTasks.add(activity.id);
      return true;
    };

    // Topological planning: only schedule an activity after all pending prerequisites have been fully planned.
    while (pending.size) {
      const ready = [...pending.values()].filter((activity) =>
        (activity.dependsOn || []).every((dependencyId) => !allActivityIds.has(dependencyId) || successfulTasks.has(dependencyId))
      ).sort(sortByUrgency);
      if (!ready.length) {
        for (const activity of pending.values()) {
          const unmet = (activity.dependsOn || []).filter((dependencyId) => !successfulTasks.has(dependencyId));
          const labels = unmet.map((dependencyId) => activities.find((item) => item.id === dependencyId)?.title || 'conteúdo anterior').filter(Boolean);
          const uniqueLabels = [...new Set(labels)];
          unplaced.push({
            ...activity, remaining: activity.duration,
            reason: uniqueLabels.length
              ? `Aguardando pré-requisito(s) que não puderam ser planejados: ${uniqueLabels.join(', ')}.`
              : 'Não foi possível resolver a sequência de pré-requisitos desta atividade.'
          });
        }
        pending.clear();
        break;
      }
      // Process only currently ready activities. The next loop re-checks dependencies after each batch.
      for (const activity of ready) {
        if (!pending.has(activity.id)) continue;
        pending.delete(activity.id);
        scheduleActivity(activity);
      }
    }

    const projectsWithoutStages = state.projects.filter((project) => (project.status || 'not-started') !== 'completed' && !(project.stages || []).length);
    // Only future plans are regenerated; completed and explicitly missed sessions remain as history.
    const history = state.sessions.filter((session) => session.status === 'completed' || session.status === 'not-completed');
    const pastCommittedPlans = state.sessions.filter((session) => session.status === 'planned' && session.date < todayString);
    const newSessions = [...history, ...pastCommittedPlans, ...fixedSessions, ...generatedSessions]
      .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
    const warnings = [];
    if (missingDeadline.length) warnings.push(`${missingDeadline.length} atividade(s) não possuem prazo final e não entraram no cronograma.`);
    if (projectsWithoutStages.length) warnings.push(`${projectsWithoutStages.length} projeto(s) ainda não possuem etapas. Adicione e numere as etapas para incluí-los no cronograma.`);
    if (invalidWindow.length) warnings.push(`${invalidWindow.length} atividade(s) têm início planejado posterior ao prazo final.`);
    if (unplaced.length) warnings.push(`${unplaced.length} atividade(s) não foram totalmente acomodadas no calendário, mesmo após tentar aproveitar horários livres além da meta diária.`);
    if (generatedSessions.some((session) => session.beyondDailyGoal)) warnings.push('Para reduzir o risco de atraso, algumas sessões foram colocadas em horários livres além da meta diária. Os compromissos e os intervalos de disponibilidade foram respeitados.');
    if (!activities.length) warnings.push('Não há atividades pendentes para planejar. Cadastre conteúdos, trabalhos ou projetos.');
    if (activities.length && !slots.length) warnings.push('Configure seus períodos de estudo na aba Rotina e horários antes de gerar o cronograma.');

    return {
      sessions: newSessions,
      generatedCount: generatedSessions.length,
      unplaced,
      warnings,
      summary: { activityCount: activities.length, scheduledMinutes: generatedSessions.reduce((sum, item) => sum + item.estimatedMinutes, 0), horizonDays, generatedAt: new Date().toISOString() }
    };
  }

  window.StudyPlanner = { generate, collectActivities, findPrerequisite, getSessionDisplayTitle, getBreaksBetweenSessions, applySessionCompletion, isoDate, parseDate, dayKey, toMinutes, fromMinutes, DAY_NAMES };
})();
