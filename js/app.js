(function () {
  'use strict';

  const state = window.AppStorage.load();
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const weekdays = [
    { key: 'mon', label: 'Segunda-feira', short: 'Seg', jsDay: 1 },
    { key: 'tue', label: 'Terça-feira', short: 'Ter', jsDay: 2 },
    { key: 'wed', label: 'Quarta-feira', short: 'Qua', jsDay: 3 },
    { key: 'thu', label: 'Quinta-feira', short: 'Qui', jsDay: 4 },
    { key: 'fri', label: 'Sexta-feira', short: 'Sex', jsDay: 5 },
    { key: 'sat', label: 'Sábado', short: 'Sáb', jsDay: 6 },
    { key: 'sun', label: 'Domingo', short: 'Dom', jsDay: 0 }
  ];
  const viewMeta = {
    overview: ['SEU SEMESTRE, COM MAIS CALMA', 'Visão geral'],
    calendar: ['SEU TEMPO, ORGANIZADO', 'Calêngrama'],
    subjects: ['CONTEÚDOS E UNIDADES', 'Disciplinas'],
    works: ['ENTREGAS E AVALIAÇÕES', 'Trabalhos'],
    projects: ['ETAPAS E ENTREGAS', 'Projetos'],
    routine: ['SUA DISPONIBILIDADE REAL', 'Rotina e horários']
  };
  let currentView = 'overview';
  let calendarMode = 'week';
  let calendarDate = new Date();
  let dialogSubmitHandler = null;
  let toastTimer = null;

  function todayISO() { return StudyPlanner.isoDate(new Date()); }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }
  function makeId(prefix) { return AppStorage.makeId(prefix); }
  function formatDate(value, options = { day: '2-digit', month: 'short' }) {
    const date = StudyPlanner.parseDate(value);
    return date ? new Intl.DateTimeFormat('pt-BR', options).format(date) : 'Sem data';
  }
  function formatLongDate(value) {
    const date = StudyPlanner.parseDate(value);
    return date ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date) : 'Sem data';
  }
  function formatMinutes(minutes) {
    const value = Math.max(0, Number(minutes) || 0);
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    if (hours && rest) return `${hours}h ${rest}min`;
    if (hours) return `${hours}h`;
    return `${rest} min`;
  }
  function statusLabel(status) {
    return ({ 'not-started': 'Não iniciada', 'in-progress': 'Em andamento', completed: 'Concluída' })[status] || 'Não iniciada';
  }
  function statusClass(status) {
    return ({ 'not-started': 'status-not-started', 'in-progress': 'status-in-progress', completed: 'status-completed' })[status] || 'status-not-started';
  }
  function priorityLabel(priority) {
    return ({ low: 'Baixa', medium: 'Média', high: 'Alta' })[priority] || 'Média';
  }
  function findSubject(id) { return state.subjects.find((subject) => subject.id === id); }
  function saveState(message = 'Alterações salvas.') {
    const ok = AppStorage.save(state);
    if (ok && message) toast(message, 'success');
    if (!ok) toast('Não foi possível salvar. Verifique o espaço disponível do navegador.', 'error');
    return ok;
  }
  function toast(message, type = 'info') {
    const region = $('#toastRegion');
    if (!region) return;
    region.innerHTML = `<div class="toast toast-${escapeHTML(type)}">${escapeHTML(message)}</div>`;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { region.innerHTML = ''; }, 4200);
  }
  function decorateColors(root = document) {
    $$('[data-color]', root).forEach((element) => {
      const color = element.dataset.color;
      if (/^#[0-9a-f]{6}$/i.test(color || '')) element.style.setProperty('--item-color', color);
    });
  }
  function modal(title, eyebrow, body, onSubmit, options = {}) {
    const dialog = $('#appDialog');
    $('#dialogTitle').textContent = title;
    $('#dialogEyebrow').textContent = eyebrow || 'CALÊNGRAMA';
    $('#dialogBody').innerHTML = body;
    $('#dialogBody').dataset.subjectId = '';
    $('#dialogBody').dataset.projectId = '';
    $('#dialogSubmit').textContent = options.submitText || 'Salvar';
    $('#dialogSubmit').hidden = options.hideSubmit || false;
    $('#dialogFooter').hidden = options.hideFooter || false;
    dialogSubmitHandler = onSubmit || null;
    if (!dialog.open) dialog.showModal();
    decorateColors(dialog);
    const colorInput = $('#colorInput', dialog);
    const colorHex = $('#colorHex', dialog);
    if (colorInput && colorHex) {
      colorInput.addEventListener('input', () => {
        colorHex.value = colorInput.value.toUpperCase();
        const preview = $('#colorPreview', dialog);
        if (preview) preview.style.setProperty('--item-color', colorInput.value);
      });
      colorHex.addEventListener('input', () => {
        const normalized = normalizeHex(colorHex.value);
        if (normalized) {
          colorInput.value = normalized;
          const preview = $('#colorPreview', dialog);
          if (preview) preview.style.setProperty('--item-color', normalized);
        }
      });
    }
  }
  function closeModal() {
    const dialog = $('#appDialog');
    if (dialog.open) dialog.close();
    dialogSubmitHandler = null;
  }
  function normalizeHex(value) {
    let hex = String(value || '').trim();
    if (!hex.startsWith('#')) hex = `#${hex}`;
    if (/^#[0-9a-f]{3}$/i.test(hex)) hex = `#${hex.slice(1).split('').map((part) => part + part).join('')}`;
    return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : '';
  }
  function field(label, inputHTML, help = '') {
    return `<label class="form-field"><span>${escapeHTML(label)}</span>${inputHTML}${help ? `<small>${escapeHTML(help)}</small>` : ''}</label>`;
  }
  function input(name, label, value = '', type = 'text', attrs = '') {
    return field(label, `<input id="${escapeHTML(name)}" name="${escapeHTML(name)}" type="${escapeHTML(type)}" value="${escapeHTML(value)}" ${attrs}>`);
  }
  function textarea(name, label, value = '', attrs = '') {
    return field(label, `<textarea id="${escapeHTML(name)}" name="${escapeHTML(name)}" rows="3" ${attrs}>${escapeHTML(value)}</textarea>`);
  }
  function select(name, label, options, value, attrs = '') {
    return field(label, `<select id="${escapeHTML(name)}" name="${escapeHTML(name)}" ${attrs}>${options.map((option) => `<option value="${escapeHTML(option.value)}" ${option.value === value ? 'selected' : ''}>${escapeHTML(option.label)}</option>`).join('')}</select>`);
  }
  function subjectOptions(selected = '') {
    return [{ value: '', label: 'Sem disciplina associada' }, ...state.subjects.map((subject) => ({ value: subject.id, label: subject.name }))];
  }
  function workPrerequisiteOptions(selected = '', subjectId = '') {
    const options = [{ value: '', label: 'Nenhum pré-requisito' }];
    const subjects = subjectId
      ? state.subjects.filter((subject) => subject.id === subjectId)
      : state.subjects;
    subjects.forEach((subject) => {
      (subject.units || []).forEach((unit, unitIndex) => {
        const subjectPrefix = subjectId ? '' : `${subject.name} · `;
        options.push({ value: `unit:${unit.id}`, label: `${subjectPrefix}Unidade ${unitIndex + 1}: ${unit.name} (unidade completa)` });
        (unit.lessons || []).forEach((lesson, lessonIndex) => {
          options.push({ value: `lesson:${lesson.id}`, label: `${subjectPrefix}Unidade ${unitIndex + 1}, aula ${lessonIndex + 1}: ${lesson.title}` });
        });
      });
    });
    return options;
  }

  function refreshWorkPrerequisiteOptions(selectedValue = '', subjectId = '') {
    const prerequisiteSelect = $('#workPrerequisite');
    if (!prerequisiteSelect) return;
    const options = workPrerequisiteOptions(selectedValue, subjectId);
    prerequisiteSelect.replaceChildren(...options.map((item) => {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      option.selected = item.value === selectedValue;
      return option;
    }));
    // If the previously selected prerequisite belongs to another discipline, reset to no prerequisite.
    if (!options.some((item) => item.value === selectedValue)) prerequisiteSelect.value = '';
  }
  function statusOptions(selected = 'not-started') {
    return [
      { value: 'not-started', label: 'Não iniciada' },
      { value: 'in-progress', label: 'Em andamento' },
      { value: 'completed', label: 'Concluída' }
    ];
  }
  function priorityOptions(selected = 'medium') {
    return [
      { value: 'low', label: 'Baixa' }, { value: 'medium', label: 'Média' }, { value: 'high', label: 'Alta' }
    ];
  }
  function setPlanOutdated(message = 'Dados alterados. Gere novamente o cronograma para aplicar as mudanças.') {
    state.settings.planOutdated = true;
    AppStorage.save(state);
    if (message) toast(message, 'info');
    renderCurrentView();
  }
  function regeneratePlan() {
    const result = StudyPlanner.generate(state);
    state.sessions = result.sessions;
    state.settings.lastPlan = result.summary;
    state.settings.planOutdated = false;
    state.settings.planWarnings = result.warnings;
    state.settings.unplacedActivities = result.unplaced;
    AppStorage.save(state);
    renderAll();
    if (result.generatedCount) toast(`Cronograma atualizado: ${result.generatedCount} sessão(ões) distribuída(s).`, 'success');
    else toast('Planejamento recalculado. Veja os avisos no calendário.', result.warnings.length ? 'warning' : 'success');
  }

  function switchView(view) {
    if (!viewMeta[view]) return;
    currentView = view;
    $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
    $$('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
    $('#viewEyebrow').textContent = viewMeta[view][0];
    $('#viewTitle').textContent = viewMeta[view][1];
    $('#topGenerate').classList.toggle('hidden', view !== 'overview');
    // Creation buttons live inside their respective pages, avoiding duplicate actions in the top bar.
    $('#contextAction').classList.add('hidden');
    renderCurrentView();
    if (window.innerWidth <= 680) {
      $('#sidebar').classList.add('mobile-hidden');
      $('#mobileMenuToggle').setAttribute('aria-expanded', 'false');
    }
  }
  function renderCurrentView() {
    if (currentView === 'overview') renderOverview();
    if (currentView === 'calendar') renderCalendar();
    if (currentView === 'subjects') renderSubjects();
    if (currentView === 'works') renderWorks();
    if (currentView === 'projects') renderProjects();
    if (currentView === 'routine') renderRoutine();
    decorateColors();
  }
  function renderAll() {
    renderOverview(); renderCalendar(); renderSubjects(); renderWorks(); renderProjects(); renderRoutine(); decorateColors();
  }

  function activityCounts() {
    const subjectLessons = state.subjects.flatMap((subject) => (subject.units || []).flatMap((unit) => unit.lessons || []));
    const projectStages = state.projects.flatMap((project) => project.stages || []);
    const activities = [
      ...subjectLessons,
      ...subjectLessons.filter((lesson) => lesson.hasExercise).map((lesson) => ({ status: lesson.exerciseStatus || 'not-started' })),
      ...state.works,
      ...state.projects.filter((project) => !(project.stages || []).length),
      ...projectStages
    ];
    return {
      subjects: state.subjects.length,
      pending: activities.filter((item) => (item.status || 'not-started') !== 'completed').length,
      completed: activities.filter((item) => item.status === 'completed').length,
      sessionsToday: state.sessions.filter((session) => session.date === todayISO() && session.status === 'planned').length
    };
  }
  function renderOverview() {
    const counts = activityCounts();
    $('#overviewStats').innerHTML = `
      <article class="stat-card"><span class="stat-symbol stat-symbol-yellow">✿</span><div><p>Disciplinas</p><strong>${counts.subjects}</strong><span class="stat-foot">cadastradas</span></div></article>
      <article class="stat-card"><span class="stat-symbol stat-symbol-peach">☷</span><div><p>Atividades pendentes</p><strong>${counts.pending}</strong><span class="stat-foot">ainda por concluir</span></div></article>
      <article class="stat-card"><span class="stat-symbol stat-symbol-green">✓</span><div><p>Concluídas</p><strong>${counts.completed}</strong><span class="stat-foot">atividades finalizadas</span></div></article>
      <article class="stat-card"><span class="stat-symbol stat-symbol-lilac">◷</span><div><p>Sessões de hoje</p><strong>${counts.sessionsToday}</strong><span class="stat-foot">planejadas no calendário</span></div></article>`;

    const upcoming = [
      ...state.works.filter((work) => work.status !== 'completed' && work.dueDate).map((work) => ({ id: work.id, title: work.title, dueDate: work.dueDate, type: work.categoryLabel || 'Trabalho', sourceType: 'work' })),
      ...state.projects.filter((project) => project.status !== 'completed' && project.dueDate).map((project) => ({ id: project.id, title: project.title, dueDate: project.dueDate, type: 'Projeto', sourceType: 'project' }))
    ].filter((item) => item.dueDate >= todayISO()).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
    $('#upcomingList').innerHTML = upcoming.length ? upcoming.map((item) => `
      <div class="upcoming-item"><div class="date-tile"><strong>${escapeHTML(formatDate(item.dueDate, { day: '2-digit' }).replace(/\D/g, ''))}</strong><span>${escapeHTML(formatDate(item.dueDate, { month: 'short' }))}</span></div><div class="upcoming-copy"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.type)} · ${escapeHTML(formatLongDate(item.dueDate))}</span></div><span class="due-arrow" aria-hidden="true">›</span></div>`).join('') : emptyState('Sem prazos próximos', 'Cadastre um trabalho ou projeto para acompanhar suas entregas.');

    const todaySessions = state.sessions.filter((session) => session.date === todayISO()).sort((a, b) => a.startTime.localeCompare(b.startTime));
    $('#todayPlan').innerHTML = todaySessions.length ? todaySessions.map((session) => `
      <div class="today-session" data-color="${escapeHTML(session.color || '#E7B600')}"><span class="session-bar"></span><div><strong>${escapeHTML(StudyPlanner.getSessionDisplayTitle(state, session))}</strong><span>${escapeHTML(session.startTime)}–${escapeHTML(session.endTime)} · ${escapeHTML(session.typeLabel || 'Estudo')}</span></div><span class="status-pill ${session.status === 'planned' ? 'session-planned' : session.status === 'completed' ? 'status-completed' : 'session-missed'}">${session.status === 'planned' ? 'Planejada' : session.status === 'completed' ? 'Concluída' : 'Não concluída'}</span></div>`).join('') : emptyState('Seu dia ainda está em aberto', 'Gere o cronograma depois de cadastrar atividades e horários.');

    const steps = [
      { label: 'Cadastre uma disciplina', done: state.subjects.length > 0, view: 'subjects' },
      { label: 'Informe seus horários disponíveis', done: weekdays.some((day) => state.availability[day.key]?.intervals?.length), view: 'routine' },
      { label: 'Adicione um trabalho ou projeto', done: state.works.length + state.projects.length > 0, view: 'works' }
    ];
    $('#setupSteps').innerHTML = steps.map((step, index) => `<button class="setup-step ${step.done ? 'is-done' : ''}" type="button" data-go="${step.view}"><span class="setup-check">${step.done ? '✓' : String(index + 1).padStart(2, '0')}</span><span>${escapeHTML(step.label)}</span><span class="setup-arrow">${step.done ? '✓' : '→'}</span></button>`).join('');
  }
  function emptyState(title, description, actionLabel = '', action = '') {
    return `<div class="empty-state"><span class="empty-flower" aria-hidden="true">✿</span><strong>${escapeHTML(title)}</strong><p>${escapeHTML(description)}</p>${actionLabel ? `<button class="button button-soft" type="button" data-action="${escapeHTML(action)}">${escapeHTML(actionLabel)}</button>` : ''}</div>`;
  }

  function renderSubjects() {
    const root = $('#subjectsList');
    if (!state.subjects.length) {
      root.innerHTML = emptyState('Nenhuma disciplina cadastrada', 'Adicione uma disciplina, escolha sua cor e organize as unidades e aulas.', '＋ Nova disciplina', 'new-subject');
      return;
    }
    root.innerHTML = state.subjects.map((subject) => {
      const lessons = (subject.units || []).flatMap((unit) => unit.lessons || []);
      const complete = lessons.filter((lesson) => lesson.status === 'completed').length;
      const percent = lessons.length ? Math.round(complete / lessons.length * 100) : 0;
      return `<article class="subject-card" data-color="${escapeHTML(subject.color || '#E7B600')}">
        <div class="subject-card-top"><span class="subject-color-mark"></span><span class="subject-date">${subject.contentEnd ? `Conteúdo até ${escapeHTML(formatDate(subject.contentEnd))}` : 'Prazo de conteúdo não definido'}</span><button class="more-button" type="button" data-subject-action="edit" data-id="${escapeHTML(subject.id)}" aria-label="Editar ${escapeHTML(subject.name)}">✎</button></div>
        <h3>${escapeHTML(subject.name)}</h3><p class="card-description">${escapeHTML(subject.description || 'Sem descrição adicional.')}</p>
        <div class="subject-meta"><span>${(subject.units || []).length} unidade(s)</span><span>${lessons.length} aula(s)</span><span>${complete} concluída(s)</span><span>${subject.allowMixedPeriods === false ? 'Dia exclusivo' : 'Pode mesclar'}</span></div>
        <div class="progress-row"><div class="progress-track"><span style="width:${percent}%"></span></div><span>${percent}%</span></div>
        <div class="card-actions"><button class="button button-soft" type="button" data-subject-action="content" data-id="${escapeHTML(subject.id)}">Gerenciar conteúdo</button><button class="icon-button danger-button" type="button" data-subject-action="delete" data-id="${escapeHTML(subject.id)}" aria-label="Excluir ${escapeHTML(subject.name)}">×</button></div>
      </article>`;
    }).join('');
  }
  function renderWorks() {
    const query = ($('#workSearch')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const filter = $('#workFilter')?.value || 'all';
    const works = state.works.filter((work) => {
      const matchesQuery = !query || `${work.title} ${work.description || ''}`.toLocaleLowerCase('pt-BR').includes(query);
      const matchesFilter = filter === 'all' || (work.status || 'not-started') === filter;
      return matchesQuery && matchesFilter;
    }).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    $('#worksList').innerHTML = works.length ? works.map((work) => {
      const subject = findSubject(work.subjectId);
      return `<article class="work-row" data-color="${escapeHTML(subject?.color || '#E7B600')}"><span class="work-color"></span><div class="work-main"><div class="work-title-line"><h3>${escapeHTML(work.title)}</h3><span class="status-pill ${statusClass(work.status)}">${statusLabel(work.status)}</span></div><p>${escapeHTML(work.categoryLabel || 'Trabalho')}${subject ? ` · ${escapeHTML(subject.name)}` : ''}${work.dueDate ? ` · Entrega: ${escapeHTML(formatLongDate(work.dueDate))}` : ''}</p>${work.description ? `<p class="work-description">${escapeHTML(work.description)}</p>` : ''}${work.prerequisiteType && work.prerequisiteId ? `<p class="work-description"><strong>Pré-requisito:</strong> ${escapeHTML(StudyPlanner.findPrerequisite(state, work.prerequisiteType, work.prerequisiteId)?.label || 'Conteúdo vinculado')}</p>` : ''}<div class="work-progress-line"><div class="progress-track"><span style="width:${work.status === 'completed' ? 100 : work.status === 'in-progress' ? work.progress : 0}%"></span></div><span>${work.status === 'completed' ? 100 : work.status === 'in-progress' ? work.progress : 0}%</span><span class="priority-label priority-${escapeHTML(work.priority)}">Prioridade ${escapeHTML(priorityLabel(work.priority).toLowerCase())}</span></div></div><div class="row-actions"><button class="text-button" type="button" data-work-action="status" data-id="${escapeHTML(work.id)}">Status</button><button class="text-button" type="button" data-work-action="edit" data-id="${escapeHTML(work.id)}">Editar</button><button class="icon-button danger-button" type="button" data-work-action="delete" data-id="${escapeHTML(work.id)}" aria-label="Excluir ${escapeHTML(work.title)}">×</button></div></article>`;
    }).join('') : emptyState('Nenhum trabalho encontrado', query || filter !== 'all' ? 'Tente mudar a busca ou o filtro.' : 'Seus trabalhos e relatórios aparecerão aqui.', query || filter !== 'all' ? '' : '＋ Novo trabalho', query || filter !== 'all' ? '' : 'new-work');
  }
  function renderProjects() {
    $('#projectsList').innerHTML = state.projects.length ? state.projects.map((project) => {
      const stages = project.stages || [];
      const complete = stages.filter((stage) => stage.status === 'completed').length;
      const percent = stages.length ? Math.round(complete / stages.length * 100) : 0;
      const displayedStatus = stages.length ? (complete === stages.length ? 'completed' : stages.some((stage) => stage.status === 'in-progress' || stage.progress > 0 || stage.status === 'completed') ? 'in-progress' : 'not-started') : 'not-started';
      const subject = findSubject(project.subjectId);
      return `<article class="project-card" data-color="${escapeHTML(subject?.color || '#E7B600')}"><div class="project-card-top"><span class="project-symbol">◇</span><span class="status-pill ${statusClass(displayedStatus)}">${statusLabel(displayedStatus)}</span><button class="more-button" type="button" data-project-action="edit" data-id="${escapeHTML(project.id)}" aria-label="Editar ${escapeHTML(project.title)}">✎</button></div><h3>${escapeHTML(project.title)}</h3><p class="card-description">${escapeHTML(project.description || 'Sem descrição adicional.')}</p><div class="project-meta"><span>${stages.length} etapa(s)</span><span>${project.dueDate ? `Prazo ${escapeHTML(formatDate(project.dueDate))}` : 'Sem prazo final'}</span></div><div class="progress-row"><div class="progress-track"><span style="width:${percent}%"></span></div><span>${percent}%</span></div><div class="card-actions"><button class="button button-soft" type="button" data-project-action="stages" data-id="${escapeHTML(project.id)}">Gerenciar etapas</button>${stages.length ? '' : `<span class="muted-copy">Adicione etapas para planejar</span>`}<button class="icon-button danger-button" type="button" data-project-action="delete" data-id="${escapeHTML(project.id)}" aria-label="Excluir ${escapeHTML(project.title)}">×</button></div></article>`;
    }).join('') : emptyState('Nenhum projeto cadastrado', 'Separe projetos acadêmicos das tarefas comuns e divida-os em etapas.', '＋ Novo projeto', 'new-project');
  }

  function renderRoutine() {
    const mixedLimitControl = $('#maxMixedSubjectsPerDay');
    if (mixedLimitControl) mixedLimitControl.value = String(Math.min(5, Math.max(1, Number(state.settings.maxMixedSubjectsPerDay) || 1)));
    $('#routineDays').innerHTML = weekdays.map((day) => {
      const data = state.availability[day.key] || { intervals: [], goalMinutes: 120 };
      const intervals = data.intervals || [];
      return `<article class="routine-day"><div class="routine-day-heading"><div><span class="day-short">${day.short}</span><h3>${day.label}</h3></div><button class="icon-button" type="button" data-routine-action="goal" data-day="${day.key}" aria-label="Editar meta de ${day.label}" title="Editar meta diária">⚙</button></div><p class="goal-caption">Meta: ${escapeHTML(formatMinutes(data.goalMinutes))} de estudo</p><div class="interval-list">${intervals.length ? intervals.map((interval) => `<div class="interval-chip"><span>◷ ${escapeHTML(interval.start)}–${escapeHTML(interval.end)}</span><button type="button" data-routine-action="edit-interval" data-day="${day.key}" data-id="${escapeHTML(interval.id)}" aria-label="Editar período ${escapeHTML(interval.start)} a ${escapeHTML(interval.end)}">✎</button><button type="button" data-routine-action="delete-interval" data-day="${day.key}" data-id="${escapeHTML(interval.id)}" aria-label="Excluir período">×</button></div>`).join('') : `<p class="small-empty">Nenhum horário configurado.</p>`}</div><button class="button button-outline add-interval" type="button" data-routine-action="add-interval" data-day="${day.key}">＋ Adicionar período</button></article>`;
    }).join('');
    const commitments = [...state.commitments].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
    $('#commitmentsList').innerHTML = commitments.length ? commitments.map((item) => `<div class="commitment-row"><span class="commitment-icon">▦</span><div class="commitment-copy"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(formatLongDate(item.date))} · ${escapeHTML(item.startTime)}–${escapeHTML(item.endTime)}</span>${item.description ? `<small>${escapeHTML(item.description)}</small>` : ''}</div><button class="text-button" type="button" data-commitment-action="edit" data-id="${escapeHTML(item.id)}">Editar</button><button class="icon-button danger-button" type="button" data-commitment-action="delete" data-id="${escapeHTML(item.id)}" aria-label="Excluir compromisso">×</button></div>`).join('') : emptyState('Nenhum compromisso pontual', 'Consultas, eventos e outros bloqueios podem ser cadastrados aqui.', '＋ Novo compromisso', 'new-commitment');
  }

  function dateRangeForCalendar() {
    const current = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), calendarDate.getDate());
    if (calendarMode === 'month') return { start: new Date(current.getFullYear(), current.getMonth(), 1), end: new Date(current.getFullYear(), current.getMonth() + 1, 0) };
    const first = new Date(current); const day = (first.getDay() + 6) % 7; first.setDate(first.getDate() - day);
    const last = new Date(first); last.setDate(first.getDate() + 6);
    return { start: first, end: last };
  }
  function moveCalendar(amount) {
    if (calendarMode === 'month') calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + amount, 1);
    else calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), calendarDate.getDate() + amount * 7);
    renderCalendar();
  }
  function eventsForDate(date) {
    const value = StudyPlanner.isoDate(date);
    const events = [];
    state.sessions.filter((session) => session.date === value).forEach((session) => events.push({ kind: 'session', item: session, start: session.startTime || '00:00' }));
    state.commitments.filter((item) => item.date === value).forEach((item) => events.push({ kind: 'commitment', item, start: item.startTime || '00:00' }));
    state.works.filter((item) => item.dueDate === value).forEach((item) => events.push({ kind: 'due', item, start: item.dueTime || '23:59' }));
    state.projects.filter((item) => item.dueDate === value).forEach((item) => events.push({ kind: 'due', item, start: item.dueTime || '23:59' }));
    state.subjects.filter((item) => item.contentEnd === value).forEach((item) => events.push({ kind: 'due-subject', item, start: '23:59' }));
    return events.sort((a, b) => a.start.localeCompare(b.start));
  }
  function eventHTML(event) {
    if (event.kind === 'session') {
      const item = event.item;
      const status = item.status || 'planned';
      return `<article class="calendar-event session-event ${status === 'completed' ? 'event-completed' : status === 'not-completed' ? 'event-missed' : ''}" data-color="${escapeHTML(item.color || '#E7B600')}"><div class="event-time">${escapeHTML(item.startTime)}–${escapeHTML(item.endTime)}</div><strong>${escapeHTML(StudyPlanner.getSessionDisplayTitle(state, item))}</strong><span>${escapeHTML(item.typeLabel || 'Estudo')}</span>${status === 'planned' ? `<div class="event-actions"><button type="button" data-session-action="completed" data-id="${escapeHTML(item.id)}">Concluída</button><button type="button" data-session-action="not-completed" data-id="${escapeHTML(item.id)}">Não concluída</button><button type="button" data-session-action="move" data-id="${escapeHTML(item.id)}" aria-label="Alterar horário">↗</button></div>` : `<span class="event-status">${status === 'completed' ? '✓ Sessão concluída' : '↻ Sessão não concluída'}</span>`}</article>`;
    }
    if (event.kind === 'commitment') return `<article class="calendar-event commitment-event"><div class="event-time">${escapeHTML(event.item.startTime)}–${escapeHTML(event.item.endTime)}</div><strong>${escapeHTML(event.item.title)}</strong><span>Compromisso</span></article>`;
    const item = event.item;
    return `<article class="calendar-event due-event"><div class="event-time">Prazo · ${escapeHTML(item.dueTime || '23:59')}</div><strong>${escapeHTML(item.title || item.name)}</strong><span>${event.kind === 'due-subject' ? 'Fim da disponibilidade do conteúdo' : 'Entrega final'}</span></article>`;
  }
  function renderCalendar() {
    const range = dateRangeForCalendar();
    const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
    if (calendarMode === 'month') $('#calendarPeriod').textContent = monthName.format(calendarDate);
    else $('#calendarPeriod').textContent = `${formatDate(StudyPlanner.isoDate(range.start), { day: 'numeric', month: 'short' })} – ${formatDate(StudyPlanner.isoDate(range.end), { day: 'numeric', month: 'short', year: 'numeric' })}`;
    $$('.segmented').forEach((button) => button.classList.toggle('active', button.dataset.calendarMode === calendarMode));
    if (calendarMode === 'week') {
      const cards = [];
      const date = new Date(range.start);
      for (let index = 0; index < 7; index += 1) {
        const value = StudyPlanner.isoDate(date);
        const events = eventsForDate(date);
        cards.push(`<section class="calendar-day ${value === todayISO() ? 'is-today' : ''}"><header class="calendar-day-header"><span>${new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', '')}</span><strong>${date.getDate()}</strong></header><div class="day-events">${events.length ? events.map(eventHTML).join('') : '<p class="calendar-empty">Dia livre</p>'}</div></section>`);
        date.setDate(date.getDate() + 1);
      }
      $('#calendarGrid').innerHTML = `<div class="week-grid">${cards.join('')}</div>`;
    } else {
      const firstOfMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
      const start = new Date(firstOfMonth); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      const days = [];
      for (let index = 0; index < 42; index += 1) {
        const date = new Date(start); date.setDate(start.getDate() + index);
        const value = StudyPlanner.isoDate(date);
        const events = eventsForDate(date);
        days.push(`<section class="month-day ${date.getMonth() !== calendarDate.getMonth() ? 'outside-month' : ''} ${value === todayISO() ? 'is-today' : ''}"><div class="month-day-heading"><span>${date.getDate()}</span>${events.length ? `<span class="event-count">${events.length}</span>` : ''}</div><div class="month-events">${events.slice(0, 3).map((event) => `<div class="month-event ${event.kind === 'commitment' ? 'mini-commitment' : event.kind === 'due' || event.kind === 'due-subject' ? 'mini-due' : 'mini-session'}" data-color="${escapeHTML(event.item.color || '#E7B600')}"><span>${event.kind === 'session' ? escapeHTML(event.item.startTime) : event.kind === 'commitment' ? escapeHTML(event.item.startTime) : '•'}</span> ${escapeHTML(event.kind === 'session' ? StudyPlanner.getSessionDisplayTitle(state, event.item) : (event.item.title || event.item.name))}</div>`).join('')}${events.length > 3 ? `<small>+${events.length - 3} eventos</small>` : ''}</div></section>`);
      }
      $('#calendarGrid').innerHTML = `<div class="month-grid"><div class="weekday-head">Seg</div><div class="weekday-head">Ter</div><div class="weekday-head">Qua</div><div class="weekday-head">Qui</div><div class="weekday-head">Sex</div><div class="weekday-head">Sáb</div><div class="weekday-head">Dom</div>${days.join('')}</div>`;
    }
    const warningList = state.settings.planWarnings || [];
    const unplaced = state.settings.unplacedActivities || [];
    $('#planWarnings').innerHTML = `${state.settings.planOutdated ? `<div class="notice notice-warning"><span>!</span><div><strong>O plano precisa ser atualizado.</strong><p>Você alterou dados que podem afetar a distribuição das sessões.</p></div><button class="button button-soft" type="button" data-action="generate">Reorganizar</button></div>` : ''}${warningList.length ? `<div class="notice notice-warning"><span>!</span><div><strong>Atenção ao planejamento</strong><ul>${warningList.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>${unplaced.length ? `<details><summary>Ver atividades sem espaço suficiente (${unplaced.length})</summary><ul>${unplaced.map((item) => `<li><strong>${escapeHTML(item.title)}</strong>: ${escapeHTML(item.reason)}</li>`).join('')}</ul></details>` : ''}</div></div>` : ''}`;
    decorateColors($('#calendarGrid'));
  }

  function openSubjectDialog(subjectId = '') {
    const subject = subjectId ? findSubject(subjectId) : null;
    modal(subject ? 'Editar disciplina' : 'Nova disciplina', 'DISCIPLINAS', `
      ${input('subjectName', 'Nome da disciplina', subject?.name || '', 'text', 'required maxlength="100"')}
      ${textarea('subjectDescription', 'Descrição (opcional)', subject?.description || '')}
      <div class="form-grid two-columns">${input('contentStart', 'Início da disponibilidade', subject?.contentStart || '', 'date')}${input('contentEnd', 'Fim da disponibilidade do conteúdo', subject?.contentEnd || '', 'date')}</div>
      <div class="form-field"><span>Cor da disciplina</span><div class="color-picker-layout"><label class="color-picker-control" for="colorInput"><input id="colorInput" name="color" type="color" value="${escapeHTML(subject?.color || '#E7B600')}" aria-label="Escolher cor da disciplina"></label><div class="color-preview" id="colorPreview" data-color="${escapeHTML(subject?.color || '#E7B600')}"><span></span><div><strong>Prévia da cor</strong><small>Você verá a cor enquanto escolhe.</small></div></div></div><label class="hex-field" for="colorHex"><span>Código HEX</span><input id="colorHex" name="colorHex" type="text" value="${escapeHTML((subject?.color || '#E7B600').toUpperCase())}" maxlength="7" pattern="^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$" aria-describedby="colorHelp"></label><small id="colorHelp" class="field-help">Digite uma cor como #F4D35E ou selecione-a no quadro de cores.</small></div>
      <label class="checkbox-field"><input type="checkbox" name="allowMixedPeriods" ${subject?.allowMixedPeriods !== false ? 'checked' : ''}><span>Adicionar a períodos mesclados</span></label>
      <p class="form-note">Se desmarcar, o Calêngrama tentará reservar dias sem aulas ou exercícios de outras disciplinas. Trabalhos e projetos não seguem esta regra. O período acima se aplica às aulas e aos exercícios; trabalhos e projetos têm seus próprios prazos.</p>`, (form) => {
      const name = form.get('subjectName').trim();
      const start = form.get('contentStart'); const end = form.get('contentEnd');
      const typedHex = String(form.get('colorHex') || '').trim();
      const color = typedHex ? normalizeHex(typedHex) : normalizeHex(form.get('color'));
      if (!name) return validationError('Informe o nome da disciplina.');
      if (!color) return validationError('Informe um código HEX válido ou escolha uma cor.');
      if (start && end && start > end) return validationError('A data inicial precisa ser anterior à data final.');
      const allowMixedPeriods = form.get('allowMixedPeriods') === 'on';
      if (subject) Object.assign(subject, { name, description: form.get('subjectDescription').trim(), contentStart: start, contentEnd: end, color, allowMixedPeriods });
      else state.subjects.push({ id: makeId('subject'), name, description: form.get('subjectDescription').trim(), contentStart: start, contentEnd: end, color, allowMixedPeriods, units: [] });
      closeModal(); saveState('Disciplina salva.'); setPlanOutdated('Disciplina atualizada. Reorganize o cronograma para aplicar mudanças de prazo ou conteúdo.');
    });
  }
  function validationError(message) { toast(message, 'error'); }
  function openContentManager(subjectId) {
    const subject = findSubject(subjectId);
    if (!subject) return;
    const units = subject.units || [];
    const body = `${units.length ? units.map((unit) => `<section class="content-unit"><div class="content-unit-heading"><div><span class="unit-kicker">UNIDADE</span><h3>${escapeHTML(unit.name)}</h3></div><div class="tiny-actions"><button class="text-button" type="button" data-content-action="edit-unit" data-unit-id="${escapeHTML(unit.id)}">Editar</button><button class="text-button text-danger" type="button" data-content-action="delete-unit" data-unit-id="${escapeHTML(unit.id)}">Excluir</button></div></div><div class="lesson-list">${(unit.lessons || []).length ? unit.lessons.map((lesson) => `<div class="lesson-row"><span class="lesson-icon">${lesson.status === 'completed' ? '✓' : '◷'}</span><div class="lesson-copy"><strong>${escapeHTML(lesson.title)}</strong><span>${escapeHTML(formatMinutes(lesson.duration))}${lesson.hasExercise ? ` · exercício ${escapeHTML(formatMinutes(lesson.exerciseDuration || 30))}` : ''} · ${escapeHTML(statusLabel(lesson.status || 'not-started'))}${lesson.status === 'in-progress' ? ` (${lesson.progress}%)` : ''}</span></div><button class="text-button" type="button" data-content-action="status-lesson" data-id="${escapeHTML(lesson.id)}">Status</button>${lesson.hasExercise ? `<button class="text-button" type="button" data-content-action="status-exercise" data-id="${escapeHTML(lesson.id)}">Exercício: ${escapeHTML(statusLabel(lesson.exerciseStatus || 'not-started'))}${lesson.exerciseStatus === 'in-progress' ? ` ${escapeHTML(lesson.exerciseProgress)}%` : ''}</button>` : ''}<button class="text-button" type="button" data-content-action="edit-lesson" data-unit-id="${escapeHTML(unit.id)}" data-id="${escapeHTML(lesson.id)}">Editar</button><button class="icon-button danger-button" type="button" data-content-action="delete-lesson" data-unit-id="${escapeHTML(unit.id)}" data-id="${escapeHTML(lesson.id)}" aria-label="Excluir aula">×</button></div>`).join('') : '<p class="small-empty">Esta unidade ainda não possui aulas.</p>'}</div><button class="button button-outline button-small" type="button" data-content-action="add-lesson" data-unit-id="${escapeHTML(unit.id)}">＋ Adicionar aula</button></section>`).join('') : emptyState('Nenhuma unidade cadastrada', 'Crie unidades para organizar as aulas e os exercícios.')}
      <div class="manager-footer"><button class="button button-soft" type="button" data-content-action="add-unit">＋ Nova unidade</button><span class="muted-copy">${units.length} unidade(s) · ${units.reduce((sum, unit) => sum + (unit.lessons || []).length, 0)} aula(s)</span></div>`;
    modal(`Conteúdo: ${subject.name}`, 'DISCIPLINAS', body, null, { hideSubmit: true, hideFooter: true });
    $('#dialogBody').dataset.subjectId = subjectId;
    $('#dialogClose').focus();
  }
  function handleContentManagerClick(event) {
    const button = event.target.closest('[data-content-action]');
    if (!button) return;
    const action = button.dataset.contentAction;
    const subjectId = (state.subjects.find((subject) => (subject.units || []).some((unit) => unit.id === button.dataset.unitId || (unit.lessons || []).some((lesson) => lesson.id === button.dataset.id))) || {}).id;
    // The subject identity is also stored on the dialog for actions that do not include a unit id.
    const activeSubjectId = $('#dialogBody').dataset.subjectId || subjectId;
    if (activeSubjectId) $('#dialogBody').dataset.subjectId = activeSubjectId;
    if (action === 'add-unit') openUnitDialog(activeSubjectId || getSubjectFromContentDialog());
    else if (action === 'edit-unit') openUnitDialog(activeSubjectId || getSubjectFromContentDialog(), button.dataset.unitId);
    else if (action === 'delete-unit') deleteUnit(activeSubjectId || getSubjectFromContentDialog(), button.dataset.unitId);
    else if (action === 'add-lesson') openLessonDialog(activeSubjectId || getSubjectFromContentDialog(), button.dataset.unitId);
    else if (action === 'edit-lesson') openLessonDialog(activeSubjectId || getSubjectFromContentDialog(), button.dataset.unitId, button.dataset.id);
    else if (action === 'delete-lesson') deleteLesson(activeSubjectId || getSubjectFromContentDialog(), button.dataset.unitId, button.dataset.id);
    else if (action === 'status-lesson') openStatusDialog('lesson', button.dataset.id, activeSubjectId || getSubjectFromContentDialog());
    else if (action === 'status-exercise') openStatusDialog('exercise', button.dataset.id, activeSubjectId || getSubjectFromContentDialog());
  }
  function getSubjectFromContentDialog() { return $('#dialogBody').dataset.subjectId || ''; }
  function restoreContentManager(subjectId) {
    closeModal(); openContentManager(subjectId);
  }
  function openUnitDialog(subjectId, unitId = '') {
    const subject = findSubject(subjectId);
    if (!subject) { toast('Não consegui identificar a disciplina. Feche e abra o gerenciador de conteúdo novamente.', 'error'); return; }
    const unit = (subject.units || []).find((item) => item.id === unitId);
    modal(unit ? 'Editar unidade' : 'Nova unidade', subject.name, `${input('unitName', 'Nome da unidade', unit?.name || '', 'text', 'required maxlength="100"')}`, (form) => {
      const name = form.get('unitName').trim();
      if (!name) return validationError('Informe o nome da unidade.');
      if (unit) unit.name = name; else subject.units.push({ id: makeId('unit'), name, lessons: [] });
      closeModal(); AppStorage.save(state); setPlanOutdated('Unidade salva.'); closeModal(); openContentManager(subjectId);
    });
  }
  function openLessonDialog(subjectId, unitId, lessonId = '') {
    const subject = findSubject(subjectId); const unit = subject?.units?.find((item) => item.id === unitId);
    if (!subject || !unit) return;
    const lesson = (unit.lessons || []).find((item) => item.id === lessonId);
    modal(lesson ? 'Editar aula' : 'Nova aula', `${subject.name} · ${unit.name}`, `
      ${input('lessonTitle', 'Título da aula ou conteúdo', lesson?.title || '', 'text', 'required maxlength="120"')}
      <div class="form-grid two-columns">${input('lessonDuration', 'Duração (minutos)', lesson?.duration ?? 45, 'number', 'min="1" max="1440" required')}${select('lessonStatus', 'Status', statusOptions(), lesson?.status || 'not-started')}</div>
      <div class="form-grid two-columns">${input('lessonProgress', 'Conclusão (%)', lesson?.progress ?? 0, 'number', 'min="1" max="99"')}${input('lessonExerciseDuration', 'Duração do exercício (min)', lesson?.exerciseDuration ?? 30, 'number', 'min="1" max="1440"')}</div>
      <label class="checkbox-field"><input id="hasExercise" name="hasExercise" type="checkbox" ${lesson?.hasExercise ? 'checked' : ''}><span>Esta aula possui exercício associado</span></label>
      <p class="form-note">Se o status for “Em andamento”, informe uma porcentagem entre 1% e 99%.</p>`, (form) => {
      const title = form.get('lessonTitle').trim(); const duration = Number(form.get('lessonDuration')); const status = form.get('lessonStatus'); const progress = Number(form.get('lessonProgress'));
      if (!title || !Number.isFinite(duration) || duration <= 0) return validationError('Informe um título e uma duração válida.');
      if (status === 'in-progress' && !(progress >= 1 && progress <= 99)) return validationError('Para “Em andamento”, informe uma porcentagem entre 1% e 99%.');
      const values = { title, duration, status, progress: status === 'completed' ? 100 : status === 'not-started' ? 0 : progress, hasExercise: form.get('hasExercise') === 'on', exerciseDuration: Math.max(1, Number(form.get('lessonExerciseDuration')) || 30), exerciseStatus: lesson?.exerciseStatus || 'not-started', exerciseProgress: lesson?.exerciseProgress || 0 };
      if (lesson) Object.assign(lesson, values); else unit.lessons.push({ id: makeId('lesson'), ...values });
      closeModal(); AppStorage.save(state); setPlanOutdated('Aula salva.'); closeModal(); openContentManager(subjectId);
    });
  }
  function deleteUnit(subjectId, unitId) {
    const subject = findSubject(subjectId); if (!subject) return;
    const unit = subject.units.find((item) => item.id === unitId); if (!unit) return;
    if (!window.confirm(`Excluir a unidade “${unit.name}” e suas aulas?`)) return;
    subject.units = subject.units.filter((item) => item.id !== unitId);
    AppStorage.save(state); setPlanOutdated('Unidade excluída.'); closeModal(); openContentManager(subjectId);
  }
  function deleteLesson(subjectId, unitId, lessonId) {
    const subject = findSubject(subjectId); const unit = subject?.units?.find((item) => item.id === unitId); if (!unit) return;
    const lesson = unit.lessons.find((item) => item.id === lessonId); if (!lesson) return;
    if (!window.confirm(`Excluir a aula “${lesson.title}”?`)) return;
    unit.lessons = unit.lessons.filter((item) => item.id !== lessonId);
    AppStorage.save(state); setPlanOutdated('Aula excluída.'); closeModal(); openContentManager(subjectId);
  }

  function openWorkDialog(workId = '') {
    const work = workId ? state.works.find((item) => item.id === workId) : null;
    const categories = [
      { value: 'Trabalho', label: 'Trabalho' }, { value: 'Relatório', label: 'Relatório' }, { value: 'Prova', label: 'Prova' },
      { value: 'Exercício avaliativo', label: 'Exercício avaliativo' }, { value: 'Outro', label: 'Outro' }
    ];
    const prerequisiteValue = work?.prerequisiteType && work?.prerequisiteId ? `${work.prerequisiteType}:${work.prerequisiteId}` : '';
    modal(work ? 'Editar trabalho' : 'Novo trabalho', 'TRABALHOS', `
      ${input('workTitle', 'Título', work?.title || '', 'text', 'required maxlength="120"')}
      ${select('workCategory', 'Tipo de atividade', categories, work?.categoryLabel || 'Trabalho')}
      ${textarea('workDescription', 'Descrição (opcional)', work?.description || '')}
      ${select('workSubject', 'Disciplina relacionada', subjectOptions(work?.subjectId || ''), work?.subjectId || '')}
      ${select('workPrerequisite', 'Conteúdo que precisa ser estudado antes', workPrerequisiteOptions(prerequisiteValue, work?.subjectId || ''), prerequisiteValue)}
      <p class="form-note">Ao selecionar uma disciplina, a lista de pré-requisitos mostrará apenas as unidades e aulas dela. Se nenhuma disciplina estiver selecionada, serão exibidos conteúdos de todas as disciplinas; ao escolher um deles, o trabalho será associado à respectiva disciplina. O cronograma planejará o pré-requisito antes do trabalho.</p>
      <div class="form-grid two-columns">${input('workStart', 'Início do planejamento (opcional)', work?.startDate || '', 'date')}${input('workDue', 'Prazo de entrega', work?.dueDate || '', 'date', 'required')}</div>
      <div class="form-grid three-columns">${input('workDueTime', 'Horário limite', work?.dueTime || '23:59', 'time', 'required')}${input('workDuration', 'Duração estimada (min)', work?.duration ?? 120, 'number', 'min="1" max="10000" required')}${select('workPriority', 'Prioridade', priorityOptions(), work?.priority || 'medium')}</div>
      <p class="form-note">O prazo deste trabalho é independente da data final de estudo da disciplina.</p>`, (form) => {
      const title = form.get('workTitle').trim(); const dueDate = form.get('workDue'); const duration = Number(form.get('workDuration')); const startDate = form.get('workStart');
      const prerequisiteValue = String(form.get('workPrerequisite') || '');
      const separator = prerequisiteValue.indexOf(':');
      let prerequisiteType = separator > 0 ? prerequisiteValue.slice(0, separator) : '';
      let prerequisiteId = separator > 0 ? prerequisiteValue.slice(separator + 1) : '';
      let subjectId = form.get('workSubject');
      if (!['unit', 'lesson'].includes(prerequisiteType)) { prerequisiteType = ''; prerequisiteId = ''; }
      const prerequisite = prerequisiteType ? StudyPlanner.findPrerequisite(state, prerequisiteType, prerequisiteId) : null;
      if (prerequisiteType && !prerequisite) return validationError('O conteúdo escolhido como pré-requisito não existe mais. Selecione-o novamente.');
      if (prerequisite && subjectId && prerequisite.subject.id !== subjectId) {
        return validationError('O pré-requisito precisa pertencer à disciplina selecionada.');
      }
      if (prerequisite && !subjectId) subjectId = prerequisite.subject.id;
      if (!title || !dueDate || !Number.isFinite(duration) || duration <= 0) return validationError('Preencha título, prazo e duração válida.');
      if (startDate && startDate > dueDate) return validationError('O início do planejamento não pode ser posterior ao prazo final.');
      const values = { title, categoryLabel: form.get('workCategory'), description: form.get('workDescription').trim(), subjectId, prerequisiteType, prerequisiteId, startDate, dueDate, dueTime: form.get('workDueTime') || '23:59', duration, priority: form.get('workPriority') || 'medium' };
      if (work) Object.assign(work, values); else state.works.push({ id: makeId('work'), ...values, status: 'not-started', progress: 0 });
      closeModal(); AppStorage.save(state); setPlanOutdated('Trabalho salvo. Gere novamente o cronograma para distribuir ou atualizar as sessões.');
    });
    const workSubjectSelect = $('#workSubject');
    const workPrerequisiteSelect = $('#workPrerequisite');
    if (workSubjectSelect && workPrerequisiteSelect) {
      workSubjectSelect.addEventListener('change', () => {
        refreshWorkPrerequisiteOptions(workPrerequisiteSelect.value, workSubjectSelect.value);
      });
      // Ensure an existing prerequisite is shown only when it belongs to the selected discipline.
      refreshWorkPrerequisiteOptions(prerequisiteValue, workSubjectSelect.value);
    }
  }
  function openProjectDialog(projectId = '') {
    const project = projectId ? state.projects.find((item) => item.id === projectId) : null;
    modal(project ? 'Editar projeto' : 'Novo projeto', 'PROJETOS', `
      ${input('projectTitle', 'Nome do projeto', project?.title || '', 'text', 'required maxlength="120"')}
      ${textarea('projectDescription', 'Descrição (opcional)', project?.description || '')}
      ${select('projectSubject', 'Disciplina relacionada (opcional)', subjectOptions(project?.subjectId || ''), project?.subjectId || '')}
      <div class="form-grid two-columns">${input('projectStart', 'Data de início', project?.startDate || '', 'date')}${input('projectDue', 'Prazo final', project?.dueDate || '', 'date', 'required')}</div>
      <div class="form-grid two-columns">${input('projectDueTime', 'Horário limite', project?.dueTime || '23:59', 'time', 'required')}${select('projectPriority', 'Prioridade', priorityOptions(), project?.priority || 'medium')}</div>
      <p class="form-note">Projetos são organizados por etapas numeradas, não por uma duração total do projeto. Depois de salvar, use “Gerenciar etapas” para cadastrar a Etapa 1, Etapa 2 e assim por diante. Cada etapa terá sua própria estimativa para o calendário.</p>`, (form) => {
      const title = form.get('projectTitle').trim(); const dueDate = form.get('projectDue'); const startDate = form.get('projectStart');
      if (!title || !dueDate) return validationError('Preencha o nome e o prazo final.');
      if (startDate && startDate > dueDate) return validationError('A data de início não pode ser posterior ao prazo final.');
      const values = { title, description: form.get('projectDescription').trim(), subjectId: form.get('projectSubject'), startDate, dueDate, dueTime: form.get('projectDueTime') || '23:59', priority: form.get('projectPriority') || 'medium' };
      if (project) Object.assign(project, values); else state.projects.push({ id: makeId('project'), ...values, status: 'not-started', progress: 0, stages: [] });
      closeModal(); AppStorage.save(state); setPlanOutdated('Projeto salvo. Adicione etapas numeradas para incluí-lo no cronograma.');
    });
  }
  function openProjectStages(projectId) {
    const project = state.projects.find((item) => item.id === projectId); if (!project) return;
    const stages = (project.stages || []).map((stage, index) => ({ ...stage, _stageNumber: Number(stage.order) > 0 ? Number(stage.order) : index + 1, _originalIndex: index }))
      .sort((a, b) => a._stageNumber - b._stageNumber || a._originalIndex - b._originalIndex);
    const body = `${stages.length ? `<div class="stage-list">${stages.map((stage, index) => `<article class="stage-row"><div><span class="stage-number">ETAPA ${index + 1}</span><strong>${escapeHTML(stage.title)}</strong><span>Estimativa: ${escapeHTML(formatMinutes(stage.duration))} · ${escapeHTML(statusLabel(stage.status || 'not-started'))}${stage.status === 'in-progress' ? ` (${stage.progress}%)` : ''} · prazo ${escapeHTML(formatDate(stage.dueDate || project.dueDate))}</span></div><div class="tiny-actions"><button class="text-button" type="button" data-stage-action="status" data-id="${escapeHTML(stage.id)}">Status</button><button class="text-button" type="button" data-stage-action="edit" data-id="${escapeHTML(stage.id)}">Editar</button><button class="icon-button danger-button" type="button" data-stage-action="delete" data-id="${escapeHTML(stage.id)}" aria-label="Excluir etapa">×</button></div></article>`).join('')}</div>` : emptyState('Nenhuma etapa criada', 'Este projeto será planejado por etapas numeradas. Adicione a primeira etapa para que ele entre no cronograma.')}
      <div class="manager-footer"><button class="button button-soft" type="button" data-stage-action="add">＋ Nova etapa</button><span class="muted-copy">${stages.length} etapa(s) numerada(s)</span></div>`;
    modal(`Etapas: ${project.title}`, 'PROJETOS', body, null, { hideSubmit: true, hideFooter: true });
    $('#dialogBody').dataset.projectId = projectId;
  }
  function handleProjectStageClick(event) {
    const button = event.target.closest('[data-stage-action]'); if (!button) return;
    const projectId = $('#dialogBody').dataset.projectId; const action = button.dataset.stageAction;
    if (action === 'add') openStageDialog(projectId);
    if (action === 'edit') openStageDialog(projectId, button.dataset.id);
    if (action === 'status') openStatusDialog('stage', button.dataset.id, projectId);
    if (action === 'delete') deleteStage(projectId, button.dataset.id);
  }
  function openStageDialog(projectId, stageId = '') {
    const project = state.projects.find((item) => item.id === projectId); if (!project) return;
    const stage = (project.stages || []).find((item) => item.id === stageId);
    modal(stage ? 'Editar etapa' : 'Nova etapa', project.title, `
      ${input('stageTitle', 'Nome da etapa', stage?.title || '', 'text', 'required maxlength="120"')}
      ${textarea('stageDescription', 'Descrição opcional', stage?.description || '')}
      <div class="form-grid two-columns">${input('stageStart', 'Início da etapa', stage?.startDate || project.startDate || '', 'date')}${input('stageDue', 'Prazo da etapa', stage?.dueDate || project.dueDate || '', 'date', 'required')}</div>
      <div class="form-grid two-columns">${input('stageDueTime', 'Horário limite', stage?.dueTime || '23:59', 'time', 'required')}${input('stageDuration', 'Tempo estimado da etapa (min)', stage?.duration ?? 60, 'number', 'min="1" max="10000" required')}</div>
      ${select('stagePriority', 'Prioridade', priorityOptions(), stage?.priority || project.priority || 'medium')}`, (form) => {
      const title = form.get('stageTitle').trim(); const dueDate = form.get('stageDue'); const startDate = form.get('stageStart'); const duration = Number(form.get('stageDuration'));
      if (!title || !dueDate || !Number.isFinite(duration) || duration <= 0) return validationError('Preencha nome, prazo e duração válida.');
      if (startDate && startDate > dueDate) return validationError('O início não pode ser posterior ao prazo final.');
      const values = { title, description: form.get('stageDescription').trim(), startDate, dueDate, dueTime: form.get('stageDueTime') || '23:59', duration, priority: form.get('stagePriority') || 'medium' };
      if (!Array.isArray(project.stages)) project.stages = [];
      if (stage) Object.assign(stage, values); else project.stages.push({ id: makeId('stage'), ...values, order: project.stages.length + 1, status: 'not-started', progress: 0 });
      project.stages.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
      project.stages.forEach((item, index) => { item.order = index + 1; });
      closeModal(); AppStorage.save(state); setPlanOutdated('Etapa salva.'); closeModal(); openProjectStages(projectId);
    });
  }
  function deleteStage(projectId, stageId) {
    const project = state.projects.find((item) => item.id === projectId); if (!project) return;
    const stage = (project.stages || []).find((item) => item.id === stageId); if (!stage) return;
    if (!window.confirm(`Excluir a etapa “${stage.title}”?`)) return;
    project.stages = project.stages.filter((item) => item.id !== stageId);
    project.stages.forEach((item, index) => { item.order = index + 1; });
    AppStorage.save(state); setPlanOutdated('Etapa excluída; a numeração foi atualizada.'); closeModal(); openProjectStages(projectId);
  }

  function findStatusTarget(type, id, parentId = '') {
    if (type === 'lesson') {
      for (const subject of state.subjects) for (const unit of subject.units || []) {
        const lesson = (unit.lessons || []).find((item) => item.id === id);
        if (lesson) return { item: lesson, title: lesson.title, isExercise: false };
      }
    }
    if (type === 'exercise') {
      for (const subject of state.subjects) for (const unit of subject.units || []) {
        const lesson = (unit.lessons || []).find((item) => item.id === id);
        if (lesson) return { item: lesson, title: `Exercícios: ${lesson.title}`, isExercise: true };
      }
    }
    if (type === 'work') { const item = state.works.find((entry) => entry.id === id); if (item) return { item, title: item.title }; }
    if (type === 'project') { const item = state.projects.find((entry) => entry.id === id); if (item) return { item, title: item.title }; }
    if (type === 'stage') { const project = state.projects.find((entry) => entry.id === parentId || (entry.stages || []).some((stage) => stage.id === id)); const item = project?.stages?.find((stage) => stage.id === id); if (item) return { item, title: item.title, parent: project }; }
    if (type === 'subject') { const item = findSubject(id); if (item) return { item, title: item.name }; }
    return null;
  }
  function openStatusDialog(type, id, parentId = '') {
    const target = findStatusTarget(type, id, parentId); if (!target) return;
    const item = target.item;
    const status = target.isExercise ? (item.exerciseStatus || 'not-started') : (item.status || 'not-started');
    const progress = target.isExercise ? (item.exerciseProgress || 0) : (item.progress || 0);
    modal(`Atualizar status`, target.title, `${select('activityStatus', 'Status da atividade', statusOptions(), status)}<div id="progressFieldWrap" class="${status === 'in-progress' ? '' : 'hidden'}">${input('activityProgress', 'Porcentagem concluída (1% a 99%)', Math.min(99, Math.max(1, progress || 1)), 'number', 'min="1" max="99"')}</div><p class="form-note">Ao salvar “Em andamento”, a porcentagem é obrigatória. O cronograma será reorganizado após a confirmação.</p>`, (form) => {
      const nextStatus = form.get('activityStatus');
      const nextProgress = Number(form.get('activityProgress'));
      if (nextStatus === 'in-progress' && !(nextProgress >= 1 && nextProgress <= 99)) return validationError('Informe uma porcentagem de 1% a 99% para continuar.');
      const actualStatus = nextStatus;
      const actualProgress = actualStatus === 'completed' ? 100 : actualStatus === 'not-started' ? 0 : nextProgress;
      if (target.isExercise) { item.exerciseStatus = actualStatus; item.exerciseProgress = actualProgress; }
      else { item.status = actualStatus; item.progress = actualProgress; }
      if (type === 'project' && actualStatus === 'completed' && Array.isArray(item.stages)) {
        item.stages.forEach((stage) => { stage.status = 'completed'; stage.progress = 100; });
      }
      if (type === 'project' && actualStatus === 'not-started' && Array.isArray(item.stages)) {
        item.stages.forEach((stage) => { stage.status = 'not-started'; stage.progress = 0; });
      }
      if (type === 'project' && actualStatus === 'in-progress' && Array.isArray(item.stages)) {
        item.progress = actualProgress;
      }
      closeModal(); regeneratePlan();
    });
    $('#activityStatus').addEventListener('change', () => {
      const wrap = $('#progressFieldWrap');
      wrap.classList.toggle('hidden', $('#activityStatus').value !== 'in-progress');
    });
  }

  function openCommitmentDialog(commitmentId = '') {
    const item = commitmentId ? state.commitments.find((entry) => entry.id === commitmentId) : null;
    modal(item ? 'Editar compromisso' : 'Novo compromisso', 'ROTINA E HORÁRIOS', `
      ${input('commitmentTitle', 'Nome do compromisso', item?.title || '', 'text', 'required maxlength="100"')}
      ${textarea('commitmentDescription', 'Descrição opcional', item?.description || '')}
      ${input('commitmentDate', 'Data', item?.date || todayISO(), 'date', 'required')}
      <div class="form-grid two-columns">${input('commitmentStart', 'Início', item?.startTime || '14:00', 'time', 'required')}${input('commitmentEnd', 'Término', item?.endTime || '16:00', 'time', 'required')}</div>
      <p class="form-note">O bloqueio vale apenas para a data escolhida e não muda os intervalos da sua rotina semanal.</p>`, (form) => {
      const title = form.get('commitmentTitle').trim(); const date = form.get('commitmentDate'); const startTime = form.get('commitmentStart'); const endTime = form.get('commitmentEnd');
      if (!title || !date || !startTime || !endTime || startTime >= endTime) return validationError('Preencha o compromisso e confira se o término é posterior ao início.');
      const values = { title, description: form.get('commitmentDescription').trim(), date, startTime, endTime };
      if (item) Object.assign(item, values); else state.commitments.push({ id: makeId('commitment'), ...values });
      closeModal(); AppStorage.save(state); setPlanOutdated('Compromisso salvo. Reorganize o cronograma para respeitar este bloqueio.');
    });
  }
  function openIntervalDialog(dayKey, intervalId = '') {
    const data = state.availability[dayKey]; if (!data) return;
    const day = weekdays.find((item) => item.key === dayKey);
    const interval = data.intervals.find((item) => item.id === intervalId);
    modal(interval ? 'Editar período disponível' : 'Adicionar período disponível', day.label, `
      <div class="form-grid two-columns">${input('intervalStart', 'Início', interval?.start || '08:00', 'time', 'required')}${input('intervalEnd', 'Término', interval?.end || '11:00', 'time', 'required')}</div>
      <p class="form-note">Você pode adicionar mais de um intervalo no mesmo dia. Períodos sobrepostos não são permitidos.</p>`, (form) => {
      const start = form.get('intervalStart'); const end = form.get('intervalEnd');
      if (!start || !end || start >= end) return validationError('O horário final precisa ser posterior ao inicial.');
      const overlaps = data.intervals.some((existing) => existing.id !== intervalId && start < existing.end && end > existing.start);
      if (overlaps) return validationError('Esse período se sobrepõe a outro intervalo do mesmo dia.');
      if (interval) Object.assign(interval, { start, end }); else data.intervals.push({ id: makeId('interval'), start, end });
      data.intervals.sort((a, b) => a.start.localeCompare(b.start));
      closeModal(); AppStorage.save(state); setPlanOutdated('Disponibilidade salva. Reorganize o cronograma para usar os novos horários.');
    });
  }
  function openGoalDialog(dayKey) {
    const data = state.availability[dayKey]; const day = weekdays.find((item) => item.key === dayKey);
    modal(`Meta diária: ${day.label}`, 'ROTINA E HORÁRIOS', `${input('dailyGoal', 'Meta de estudo (minutos por dia)', data.goalMinutes ?? 120, 'number', 'min="0" max="1440" required')}<p class="form-note">Use 0 se não quiser planejar estudos dentro da meta normal nesse dia. Se houver risco de atraso, o Calêngrama poderá usar outros intervalos livres antes do prazo, sem ocupar compromissos.</p>`, (form) => {
      const value = Number(form.get('dailyGoal'));
      if (!Number.isFinite(value) || value < 0 || value > 1440) return validationError('Informe uma meta entre 0 e 1440 minutos.');
      data.goalMinutes = value;
      closeModal(); AppStorage.save(state); setPlanOutdated('Meta diária salva.');
    });
  }

  function sessionById(id) { return state.sessions.find((session) => session.id === id); }
  function handleSessionAction(action, id) {
    const session = sessionById(id); if (!session) return;
    if (action === 'completed') {
      session.status = 'completed'; session.completedAt = new Date().toISOString();
      AppStorage.save(state); toast('Sessão registrada. Atualize o status e a porcentagem da atividade se isso refletir seu progresso.', 'success'); renderAll();
    } else if (action === 'not-completed') {
      session.status = 'not-completed'; session.markedAt = new Date().toISOString();
      AppStorage.save(state); toast('Sessão marcada como não concluída. O cronograma será reorganizado.', 'info'); regeneratePlan();
    } else if (action === 'move') openMoveSessionDialog(session.id);
  }
  function findSessionSource(session) {
    if (session.sourceType === 'work') return state.works.find((item) => item.id === session.sourceId);
    if (session.sourceType === 'project') return state.projects.find((item) => item.id === session.sourceId);
    if (session.sourceType === 'stage') { for (const project of state.projects) { const stage = (project.stages || []).find((item) => item.id === session.sourceId); if (stage) return { dueDate: stage.dueDate || project.dueDate }; } }
    if (session.sourceType === 'lesson' || session.sourceType === 'exercise') { for (const subject of state.subjects) { for (const unit of subject.units || []) { if ((unit.lessons || []).some((lesson) => lesson.id === session.sourceId)) return { dueDate: subject.contentEnd }; } } }
    return null;
  }
  function openMoveSessionDialog(sessionId) {
    const session = sessionById(sessionId); if (!session) return;
    modal('Alterar horário da sessão', 'CALENDÁRIO', `
      <p class="form-note">${escapeHTML(StudyPlanner.getSessionDisplayTitle(state, session))}</p>
      ${input('sessionDate', 'Data', session.date, 'date', 'required')}
      <div class="form-grid two-columns">${input('sessionStart', 'Início', session.startTime, 'time', 'required')}${input('sessionEnd', 'Término', session.endTime, 'time', 'required')}</div>
      <p class="form-note">O horário será validado contra seus intervalos, compromissos e outras sessões. Se alterar a disponibilidade, o plano poderá precisar ser reorganizado.</p>`, (form) => {
      const date = form.get('sessionDate'); const startTime = form.get('sessionStart'); const endTime = form.get('sessionEnd');
      if (!date || !startTime || !endTime || startTime >= endTime) return validationError('Confira a data e os horários da sessão.');
      if (date < todayISO()) return validationError('Não é possível mover uma sessão para uma data passada.');
      const key = weekdays.find((day) => day.jsDay === StudyPlanner.parseDate(date)?.getDay())?.key;
      const intervals = state.availability[key]?.intervals || [];
      const insideInterval = intervals.some((interval) => startTime >= interval.start && endTime <= interval.end);
      const conflictCommitment = state.commitments.some((item) => item.date === date && startTime < item.endTime && endTime > item.startTime);
      const conflictSession = state.sessions.some((item) => item.id !== session.id && item.date === date && item.status === 'planned' && startTime < item.endTime && endTime > item.startTime);
      if (!insideInterval) return validationError('A sessão precisa caber em um dos intervalos disponíveis deste dia.');
      if (conflictCommitment || conflictSession) return validationError('Esse horário conflita com um compromisso ou outra sessão.');
      const sourceItem = findSessionSource(session);
      if (sourceItem?.dueDate && date > sourceItem.dueDate) return validationError('Essa data ultrapassa o prazo final da atividade.');
      if (sourceItem?.dueDate && date === sourceItem.dueDate && sourceItem.dueTime && endTime > sourceItem.dueTime) return validationError('O término da sessão ultrapassa o horário limite da atividade.');
      const newDayGoal = key ? Number(state.availability[key]?.goalMinutes || 0) : 0;
      const duration = StudyPlanner.toMinutes(endTime) - StudyPlanner.toMinutes(startTime);
      const alreadyPlanned = state.sessions.filter((item) => item.id !== session.id && item.date === date && item.status === 'planned').reduce((sum, item) => sum + (Number(item.estimatedMinutes) || 0), 0);
      if (duration + alreadyPlanned > newDayGoal) return validationError('Essa mudança ultrapassaria a meta diária de estudo configurada.');
      const oldDate = session.date; Object.assign(session, { date, startTime, endTime, estimatedMinutes: StudyPlanner.toMinutes(endTime) - StudyPlanner.toMinutes(startTime), manuallyMoved: true });
      closeModal(); state.settings.planOutdated = true; AppStorage.save(state); toast(oldDate === date ? 'Horário da sessão alterado.' : 'Sessão movida para outra data. Revise o restante do cronograma.', 'success'); renderAll();
    });
  }

  function handleMainClick(event) {
    const go = event.target.closest('[data-go]');
    if (go) { switchView(go.dataset.go); return; }
    const action = event.target.closest('[data-action]');
    if (action) {
      const type = action.dataset.action;
      if (type === 'new-subject') openSubjectDialog();
      if (type === 'new-work') openWorkDialog();
      if (type === 'new-project') openProjectDialog();
      if (type === 'new-commitment') openCommitmentDialog();
      if (type === 'generate') regeneratePlan();
      return;
    }
    const subjectAction = event.target.closest('[data-subject-action]');
    if (subjectAction) {
      const id = subjectAction.dataset.id; const type = subjectAction.dataset.subjectAction;
      if (type === 'edit') openSubjectDialog(id);
      if (type === 'content') { $('#dialogBody').dataset.subjectId = id; openContentManager(id); $('#dialogBody').dataset.subjectId = id; }
      if (type === 'status') openContentManager(id);
      if (type === 'delete') deleteSubject(id);
      return;
    }
    const workAction = event.target.closest('[data-work-action]');
    if (workAction) {
      const id = workAction.dataset.id; const type = workAction.dataset.workAction;
      if (type === 'edit') openWorkDialog(id);
      if (type === 'status') openStatusDialog('work', id);
      if (type === 'delete') deleteWork(id);
      return;
    }
    const projectAction = event.target.closest('[data-project-action]');
    if (projectAction) {
      const id = projectAction.dataset.id; const type = projectAction.dataset.projectAction;
      if (type === 'edit') openProjectDialog(id);
      if (type === 'stages') { openProjectStages(id); $('#dialogBody').dataset.projectId = id; }
      if (type === 'status') { const project = state.projects.find((item) => item.id === id); if (project && (project.stages || []).length) openProjectStages(id); else openStatusDialog('project', id); }
      if (type === 'delete') deleteProject(id);
      return;
    }
    const routineAction = event.target.closest('[data-routine-action]');
    if (routineAction) {
      const id = routineAction.dataset.id; const day = routineAction.dataset.day; const type = routineAction.dataset.routineAction;
      if (type === 'add-interval') openIntervalDialog(day);
      if (type === 'edit-interval') openIntervalDialog(day, id);
      if (type === 'goal') openGoalDialog(day);
      if (type === 'delete-interval') {
        const data = state.availability[day]; data.intervals = data.intervals.filter((item) => item.id !== id);
        AppStorage.save(state); setPlanOutdated('Período removido.');
      }
      return;
    }
    const commitmentAction = event.target.closest('[data-commitment-action]');
    if (commitmentAction) {
      const item = state.commitments.find((entry) => entry.id === commitmentAction.dataset.id); if (!item) return;
      if (commitmentAction.dataset.commitmentAction === 'edit') openCommitmentDialog(item.id);
      if (commitmentAction.dataset.commitmentAction === 'delete') {
        if (window.confirm(`Excluir o compromisso “${item.title}”?`)) { state.commitments = state.commitments.filter((entry) => entry.id !== item.id); AppStorage.save(state); setPlanOutdated('Compromisso excluído.'); }
      }
      return;
    }
    const sessionAction = event.target.closest('[data-session-action]');
    if (sessionAction) { handleSessionAction(sessionAction.dataset.sessionAction, sessionAction.dataset.id); return; }
  }
  function deleteSubject(id) {
    const item = findSubject(id); if (!item) return;
    if (!window.confirm(`Excluir a disciplina “${item.name}”, suas unidades e aulas? Trabalhos e projetos associados permanecerão, mas perderão o vínculo com ela.`)) return;
    state.subjects = state.subjects.filter((subject) => subject.id !== id);
    state.works.forEach((work) => { if (work.subjectId === id) work.subjectId = ''; });
    state.projects.forEach((project) => { if (project.subjectId === id) project.subjectId = ''; });
    regeneratePlan();
  }
  function deleteWork(id) {
    const item = state.works.find((work) => work.id === id); if (!item) return;
    if (!window.confirm(`Excluir “${item.title}”?`)) return;
    state.works = state.works.filter((work) => work.id !== id); AppStorage.save(state); setPlanOutdated('Trabalho excluído.');
  }
  function deleteProject(id) {
    const item = state.projects.find((project) => project.id === id); if (!item) return;
    if (!window.confirm(`Excluir o projeto “${item.title}” e suas etapas?`)) return;
    state.projects = state.projects.filter((project) => project.id !== id); AppStorage.save(state); setPlanOutdated('Projeto excluído.');
  }

  function updateTodayLabel() {
    const now = new Date();
    $('#todayLabel').textContent = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short', day: 'numeric', month: 'short'
    }).format(now).replace('.', '');
  }

  function initialize() {
    updateTodayLabel();
    // Mantém a data do cabeçalho atualizada mesmo se a aba ficar aberta durante a virada do dia.
    window.setInterval(updateTodayLabel, 60_000);
    window.addEventListener('focus', updateTodayLabel);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) updateTodayLabel();
    });
    $('#mainNav').addEventListener('click', (event) => { const button = event.target.closest('[data-view]'); if (button) switchView(button.dataset.view); });
    $('#sidebarCollapse').addEventListener('click', () => {
      if (window.innerWidth <= 680) {
        const isHidden = $('#sidebar').classList.toggle('mobile-hidden');
        $('#mobileMenuToggle').setAttribute('aria-expanded', isHidden ? 'false' : 'true');
        $('#mobileMenuToggle').setAttribute('aria-label', isHidden ? 'Abrir menu' : 'Fechar menu');
        $('#sidebarCollapse').setAttribute('aria-label', isHidden ? 'Abrir menu' : 'Fechar menu');
        return;
      }
      const collapsed = $('#sidebar').classList.toggle('collapsed');
      $('#sidebarCollapse').setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
      $('#sidebarCollapse').title = collapsed ? 'Expandir menu' : 'Recolher menu';
      $('#sidebarCollapse').querySelector('span').textContent = collapsed ? '›' : '‹';
      try { localStorage.setItem('estudaMaisSidebarCollapsed', collapsed ? '1' : '0'); } catch (error) { console.warn('A preferência do menu não pôde ser salva.', error); }
    });
    try { if (localStorage.getItem('estudaMaisSidebarCollapsed') === '1') $('#sidebar').classList.add('collapsed'); } catch (error) { console.warn('A preferência do menu não pôde ser lida.', error); }
    $('#topGenerate').addEventListener('click', regeneratePlan);
    $('#contextAction').addEventListener('click', () => {});
    $('#newSubject').addEventListener('click', () => openSubjectDialog());
    $('#newWork').addEventListener('click', () => openWorkDialog());
    $('#newProject').addEventListener('click', () => openProjectDialog());
    $('#newCommitment').addEventListener('click', () => openCommitmentDialog());
    $('#maxMixedSubjectsPerDay').addEventListener('change', (event) => {
      const value = Number.parseInt(event.currentTarget.value, 10);
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        event.currentTarget.value = String(state.settings.maxMixedSubjectsPerDay || 1);
        toast('Escolha um limite entre 1 e 5 disciplinas.', 'error');
        return;
      }
      state.settings.maxMixedSubjectsPerDay = value;
      setPlanOutdated('Limite de disciplinas por dia atualizado. Reorganize o cronograma para aplicar a preferência.');
    });
    $('#calendarGenerate').addEventListener('click', regeneratePlan);
    $('#calendarPrev').addEventListener('click', () => moveCalendar(-1));
    $('#calendarNext').addEventListener('click', () => moveCalendar(1));
    $('#calendarToday').addEventListener('click', () => { calendarDate = new Date(); renderCalendar(); });
    $$('.segmented').forEach((button) => button.addEventListener('click', () => { calendarMode = button.dataset.calendarMode; renderCalendar(); }));
    $('#workSearch').addEventListener('input', renderWorks);
    $('#workFilter').addEventListener('change', renderWorks);
    $('#mainContent').addEventListener('click', handleMainClick);
    $('#dialogBody').addEventListener('click', (event) => {
      if (event.target.closest('[data-content-action]')) handleContentManagerClick(event);
      else if (event.target.closest('[data-stage-action]')) handleProjectStageClick(event);
    });
    $('#mobileMenuToggle').addEventListener('click', () => {
      const hidden = $('#sidebar').classList.toggle('mobile-hidden');
      $('#mobileMenuToggle').setAttribute('aria-expanded', hidden ? 'false' : 'true');
      $('#mobileMenuToggle').setAttribute('aria-label', hidden ? 'Abrir menu' : 'Fechar menu');
    });
    if (window.innerWidth <= 680) {
      $('#sidebar').classList.add('mobile-hidden');
      $('#mobileMenuToggle').setAttribute('aria-expanded', 'false');
    }
    $('#dialogClose').addEventListener('click', closeModal);
    $('#dialogCancel').addEventListener('click', closeModal);
    $('#dialogForm').addEventListener('submit', (event) => {
      event.preventDefault();
      if (typeof dialogSubmitHandler !== 'function') { closeModal(); return; }
      const form = new FormData(event.currentTarget);
      dialogSubmitHandler(form);
    });
    $('#appDialog').addEventListener('click', (event) => { if (event.target === $('#appDialog')) closeModal(); });
    $('#appDialog').addEventListener('close', () => { dialogSubmitHandler = null; });
    renderAll();
    switchView('overview');
  }

  document.addEventListener('DOMContentLoaded', initialize);
})();
