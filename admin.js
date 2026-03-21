const SESSION_KEY = 'meyram-admin-session';

const runtime = {
  apiBase: (document.querySelector('meta[name="apollo-api-base"]')?.getAttribute('content') || '').replace(/\/$/, ''),
  supabaseUrl: (document.querySelector('meta[name="apollo-supabase-url"]')?.getAttribute('content') || '').replace(/\/$/, ''),
  supabaseAnonKey: document.querySelector('meta[name="apollo-supabase-anon-key"]')?.getAttribute('content') || ''
};

const emptyAiSettings = () => ({
  publicBrand: 'Meyram Cinema',
  assistantBrand: 'Meyram AI',
  faqAge: '',
  faqProcess: '',
  faqGeneric: '',
  systemPromptOverride: ''
});

const emptyProject = () => ({
  id: '',
  title: '',
  genre: '',
  poster: '',
  banner: '',
  promoVideoUrl: '',
  countdownDate: '',
  description: '',
  director: '',
  ageRange: '',
  isPublished: true,
  roles: []
});

const state = {
  session: loadStoredSession(),
  loading: false,
  error: '',
  dashboard: null,
  applications: [],
  users: [],
  usersTotal: 0,
  leads: [],
  videos: [],
  projects: [],
  aiSettings: emptyAiSettings(),
  selectedProjectId: null
};

const elements = {
  authCard: document.getElementById('adminAuthCard'),
  authForm: document.getElementById('adminAuthForm'),
  emailInput: document.getElementById('adminEmailInput'),
  passwordInput: document.getElementById('adminPasswordInput'),
  error: document.getElementById('adminError'),
  refresh: document.getElementById('adminRefresh'),
  signOut: document.getElementById('adminSignOut'),
  addAdmin: document.getElementById('adminAddAdmin'),
  content: document.getElementById('adminContent'),
  stats: document.getElementById('adminStats'),
  aiSettingsForm: document.getElementById('aiSettingsForm'),
  projectEditorForm: document.getElementById('projectEditorForm'),
  newProjectButton: document.getElementById('newProjectButton'),
  resetProjectButton: document.getElementById('resetProjectButton'),
  projectsCount: document.getElementById('projectsCount'),
  projectsCatalogList: document.getElementById('projectsCatalogList'),
  applicationsCount: document.getElementById('applicationsCount'),
  applicationsTableBody: document.getElementById('applicationsTableBody'),
  usersCount: document.getElementById('usersCount'),
  usersTableBody: document.getElementById('usersTableBody'),
  leadsCount: document.getElementById('leadsCount'),
  leadsTableBody: document.getElementById('leadsTableBody'),
  videosCount: document.getElementById('videosCount'),
  videosList: document.getElementById('videosList')
};

init();

function init() {
  elements.authForm?.addEventListener('submit', onSubmitAuth);
  elements.refresh?.addEventListener('click', () => loadAdminData());
  elements.signOut?.addEventListener('click', signOut);
  elements.addAdmin?.addEventListener('click', openAddAdminModal);
  elements.aiSettingsForm?.addEventListener('submit', onSaveAiSettings);
  elements.projectEditorForm?.addEventListener('submit', onSaveProject);
  elements.newProjectButton?.addEventListener('click', () => selectProject(null));
  elements.resetProjectButton?.addEventListener('click', () => selectProject(state.selectedProjectId));
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeyDown);

  if (state.session?.accessToken) {
    loadAdminData();
  } else {
    render();
  }
}

function loadStoredSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredSession(session) {
  state.session = session;
  if (session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

function normalizeSession(payload) {
  const expiresIn = Number(payload?.expires_in || 3600);
  return {
    accessToken: String(payload?.access_token || '').trim(),
    refreshToken: String(payload?.refresh_token || '').trim(),
    expiresAt: Date.now() + expiresIn * 1000,
    user: payload?.user || null
  };
}

async function onSubmitAuth(event) {
  event.preventDefault();
  const email = String(elements.emailInput?.value || '').trim();
  const password = String(elements.passwordInput?.value || '').trim();

  if (!email || !password) {
    state.error = 'Электрон пошта мен құпиясөзді енгізіңіз.';
    render();
    return;
  }

  state.loading = true;
  state.error = '';
  render();

  try {
    const session = await signInWithPassword(email, password);
    saveStoredSession(session);
    elements.passwordInput.value = '';
    await loadAdminData();
  } catch (error) {
    state.loading = false;
    state.error = error.message || 'Кіру мүмкін болмады.';
    render();
  }
}

async function signInWithPassword(email, password) {
  ensureSupabaseClientConfigured();
  const response = await fetch(`${runtime.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: runtime.supabaseAnonKey,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ email, password })
  });

  const data = await parseJsonResponse(response);
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.msg || data?.error_description || data?.error || 'Электрон пошта немесе құпиясөз қате.');
  }

  return normalizeSession(data);
}

async function refreshAuthSession() {
  ensureSupabaseClientConfigured();
  if (!state.session?.refreshToken) {
    throw new Error('Сессияны жаңарту мүмкін болмады. Қайта кіріңіз.');
  }

  const response = await fetch(`${runtime.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: runtime.supabaseAnonKey,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ refresh_token: state.session.refreshToken })
  });

  const data = await parseJsonResponse(response);
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.msg || data?.error_description || data?.error || 'Сессия мерзімі аяқталды. Қайта кіріңіз.');
  }

  const session = normalizeSession(data);
  saveStoredSession(session);
  return session;
}

async function ensureAdminSession() {
  if (!state.session?.accessToken) {
    throw new Error('Әкімші панеліне кіру керек.');
  }

  const expiresSoon = Number(state.session.expiresAt || 0) <= Date.now() + 60_000;
  if (expiresSoon) {
    return refreshAuthSession();
  }

  return state.session;
}

async function signOut() {
  const accessToken = state.session?.accessToken;
  try {
    if (accessToken && runtime.supabaseUrl && runtime.supabaseAnonKey) {
      await fetch(`${runtime.supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: runtime.supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`
        }
      });
    }
  } catch {
    // noop
  }

  saveStoredSession(null);
  state.dashboard = null;
  state.applications = [];
  state.users = [];
  state.usersTotal = 0;
  state.leads = [];
  state.videos = [];
  state.projects = [];
  state.aiSettings = emptyAiSettings();
  state.selectedProjectId = null;
  state.error = '';
  state.loading = false;
  render();
}

async function loadAdminData() {
  if (!state.session?.accessToken || !runtime.apiBase) {
    render();
    return;
  }

  state.loading = true;
  state.error = '';
  render();

  try {
    await ensureAdminSession();

    const pageType = document.body.getAttribute('data-page') || '';
    const userFilter = pageType === 'admins' ? 'admins' : (pageType === 'users' ? 'site' : '');
    const usersUrl = '/admin/users?limit=100' + (userFilter ? '&filter=' + userFilter : '');

    const [dashboard, applications, users, leads, videos, projects, aiSettings] = await Promise.all([
      fetchAdminJson('/admin/dashboard'),
      fetchAdminJson('/admin/project-applications?limit=24'),
      fetchAdminJson(usersUrl),
      fetchAdminJson('/admin/chat-leads?limit=24'),
      fetchAdminJson('/admin/video-submissions?limit=24'),
      fetchAdminJson('/admin/projects?limit=100'),
      fetchAdminJson('/admin/ai-settings')
    ]);

    state.dashboard = dashboard;
    state.applications = applications.items || [];
    state.users = (users.items || []).map(normalizeAdminUserRecord);
    state.usersTotal = Number(users.total || state.users.length || 0);
    state.leads = leads.items || [];
    state.videos = videos.items || [];
    state.projects = (projects.items || []).map(normalizeProjectRecord);
    state.aiSettings = normalizeAiSettings(aiSettings.item || {});
    if (!state.selectedProjectId && state.projects.length) {
      state.selectedProjectId = state.projects[0].id;
    }
  } catch (error) {
    state.error = error.message || 'Admin деректерін жүктеу мүмкін болмады.';
  } finally {
    state.loading = false;
    render();
  }
}

function renderApplications() {
  if (!elements.applicationsCount || !elements.applicationsTableBody) return;
  elements.applicationsCount.textContent = String(state.applications.length || 0);
  if (!state.applications.length) {
    elements.applicationsTableBody.innerHTML = `<tr><td colspan="6" class="admin-empty">${state.loading ? 'Жүктелуде...' : 'Әзірге өтінім жоқ.'}</td></tr>`;
    return;
  }
  elements.applicationsTableBody.innerHTML = state.applications.map((item) => `
    <tr>
      <td><div class="admin-cell__title">${escapeHtml(item.project_title || '—')}</div><div class="admin-cell__meta">${escapeHtml(item.role_title || '—')}</div></td>
      <td><div class="admin-cell__title">${escapeHtml(item.full_name || '—')}</div><div class="admin-cell__meta">Жасы: ${escapeHtml(item.age || '—')} · ${escapeHtml(item.city || '—')}</div></td>
      <td><div>${escapeHtml(item.parent_name || '—')}</div><div class="admin-cell__meta">${escapeHtml(item.phone || '—')}</div></td>
      <td><span class="admin-pill${item.status === 'new' ? '' : ' admin-pill--muted'}">${escapeHtml(item.status || 'new')}</span></td>
      <td>${formatDate(item.created_at)}</td>
      <td class="admin-table__actions">${renderActionMenu('application', item.id, [
        { action: 'edit', label: 'Өңдеу' },
        { action: 'delete', label: 'Жою', destructive: true }
      ])}</td>
    </tr>
  `).join('');
}

function renderUsers() {
  if (!elements.usersCount || !elements.usersTableBody) return;
  elements.usersCount.textContent = String(state.usersTotal || state.users.length || 0);
  if (!state.users.length) {
    elements.usersTableBody.innerHTML = `<tr><td colspan="6" class="admin-empty">${state.loading ? 'Жүктелуде...' : 'Әзірге тіркелген қолданушы жоқ.'}</td></tr>`;
    return;
  }

  elements.usersTableBody.innerHTML = state.users.map((item) => `
    <tr>
      <td><div class="admin-cell__title">${escapeHtml(item.email || '—')}</div><div class="admin-cell__meta">ID: ${escapeHtml(item.id || '—')}</div></td>
      <td><div>${escapeHtml(item.fullName || '—')}</div><div class="admin-cell__meta">Соңғы кіруі: ${formatDate(item.lastSignInAt)}</div></td>
      <td>${escapeHtml(item.phone || '—')}</td>
      <td><span class="admin-pill admin-pill--muted">${escapeHtml(item.role || 'authenticated')}</span></td>
      <td>${formatDate(item.createdAt)}</td>
      <td class="admin-table__actions">${renderActionMenu('user', item.id, [
        { action: 'edit', label: 'Өңдеу' },
        { action: 'delete', label: 'Жою', destructive: true }
      ])}</td>
    </tr>
  `).join('');
}

function renderLeads() {
  if (!elements.leadsCount || !elements.leadsTableBody) return;
  elements.leadsCount.textContent = String(state.leads.length || 0);
  if (!state.leads.length) {
    elements.leadsTableBody.innerHTML = `<tr><td colspan="6" class="admin-empty">${state.loading ? 'Жүктелуде...' : 'Әзірге чат өтінімдері жоқ.'}</td></tr>`;
    return;
  }
  elements.leadsTableBody.innerHTML = state.leads.map((item) => `
    <tr>
      <td><div class="admin-cell__title">${escapeHtml(item.child_name || '—')}</div><div class="admin-cell__meta">Жасы: ${escapeHtml(item.child_age || '—')}</div></td>
      <td><div>${escapeHtml(item.parent_name || '—')}</div><div class="admin-cell__meta">${escapeHtml(item.phone || '—')}</div></td>
      <td>${escapeHtml(item.city || '—')}</td>
      <td>${escapeHtml(item.experience || '—')}</td>
      <td>${formatDate(item.created_at)}</td>
      <td class="admin-table__actions">${renderActionMenu('lead', item.id, [
        { action: 'edit', label: 'Өңдеу' },
        { action: 'delete', label: 'Жою', destructive: true }
      ])}</td>
    </tr>
  `).join('');
}

function renderVideos() {
  if (!elements.videosCount || !elements.videosList) return;
  elements.videosCount.textContent = String(state.videos.length || 0);
  if (!state.videos.length) {
    elements.videosList.innerHTML = `<div class="admin-empty">${state.loading ? 'Жүктелуде...' : 'Әзірге видео-визитка жоқ.'}</div>`;
    return;
  }
  elements.videosList.innerHTML = state.videos.map((item) => `
    <article class="admin-video-card">
      <div class="admin-video-card__header">
        <div>
          <strong>${escapeHtml(item.file_name || 'video.webm')}</strong>
          <p>${formatDate(item.created_at)}</p>
        </div>
        ${renderActionMenu('video', item.id, [
          { action: 'view', label: 'Көру' },
          { action: 'delete', label: 'Жою', destructive: true }
        ])}
      </div>
      <p>Сессия: ${escapeHtml(item.session_id || '—')}</p>
      <p>Өлшемі: ${formatBytes(item.file_size)}</p>
      <p>Path: ${escapeHtml(item.storage_path || '—')}</p>
      <div class="admin-video-card__footer">
        <button class="admin-button admin-button--ghost admin-button--small" type="button" data-direct-action="view-video" data-id="${escapeHtml(item.id || '')}">Видео ашу</button>
      </div>
    </article>
  `).join('');
}

async function onSaveAiSettings(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const settings = {
    publicBrand: String(formData.get('publicBrand') || '').trim(),
    assistantBrand: String(formData.get('assistantBrand') || '').trim(),
    faqAge: String(formData.get('faqAge') || '').trim(),
    faqProcess: String(formData.get('faqProcess') || '').trim(),
    faqGeneric: String(formData.get('faqGeneric') || '').trim(),
    systemPromptOverride: String(formData.get('systemPromptOverride') || '').trim()
  };

  await fetchAdminJson('/admin/ai-settings', {
    method: 'POST',
    body: JSON.stringify({ settings })
  });

  state.aiSettings = settings;
  state.error = '';
  render();
}

async function onSaveProject(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  let roles = [];

  try {
    roles = JSON.parse(String(formData.get('rolesJson') || '[]').trim() || '[]');
    if (!Array.isArray(roles)) {
      throw new Error('Рөлдер тізімі JSON массив болуы керек');
    }
  } catch {
    state.error = 'Рөлдер тізімі JSON пішімі дұрыс емес.';
    render();
    return;
  }

  const countdownRaw = String(formData.get('countdownDate') || '').trim();
  const project = {
    id: String(formData.get('idVisible') || formData.get('id') || '').trim(),
    title: String(formData.get('title') || '').trim(),
    genre: String(formData.get('genre') || '').trim(),
    poster: String(formData.get('poster') || '').trim(),
    banner: String(formData.get('banner') || '').trim(),
    promoVideoUrl: String(formData.get('promoVideoUrl') || '').trim(),
    countdownDate: countdownRaw ? new Date(countdownRaw).toISOString() : '',
    description: String(formData.get('description') || '').trim(),
    director: String(formData.get('director') || '').trim(),
    ageRange: String(formData.get('ageRange') || '').trim(),
    isPublished: formData.get('isPublished') === 'on',
    roles
  };

  if (!project.title) {
    state.error = 'Жоба атауы міндетті.';
    render();
    return;
  }

  const response = await fetchAdminJson('/admin/projects', {
    method: 'POST',
    body: JSON.stringify({ project })
  });

  const saved = normalizeProjectRecord(response.raw || response.item || project);
  const existingIndex = state.projects.findIndex((item) => item.id === saved.id);
  if (existingIndex >= 0) {
    state.projects.splice(existingIndex, 1, saved);
  } else {
    state.projects.unshift(saved);
  }
  state.selectedProjectId = saved.id;
  state.error = '';
  render();
}

async function fetchAdminJson(path, options = {}, hasRetried = false) {
  const session = await ensureAdminSession();
  const hasBody = options.body !== undefined && options.body !== null && options.body !== '';
  const response = await fetch(`${runtime.apiBase}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(hasBody ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      Authorization: `Bearer ${session.accessToken}`,
      ...(options.headers || {})
    }
  });

  const data = await parseJsonResponse(response);

  if (response.status === 401 && !hasRetried && state.session?.refreshToken) {
    await refreshAuthSession();
    return fetchAdminJson(path, options, true);
  }

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || 'Admin request failed');
  }
  return data;
}


function renderActionMenu(entity, id, actions) {
  return `
    <div class="admin-actions" data-actions>
      <button class="admin-icon-button admin-icon-button--menu" type="button" data-action-menu-button aria-label="Әрекеттер">
        <span></span><span></span><span></span>
      </button>
      <div class="admin-action-menu" role="menu">
        ${actions.map((item) => `
          <button
            class="admin-action-menu__item${item.destructive ? ' is-destructive' : ''}"
            type="button"
            data-action-menu-item
            data-entity="${escapeHtml(entity)}"
            data-action="${escapeHtml(item.action)}"
            data-id="${escapeHtml(id || '')}">
            ${escapeHtml(item.label)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

async function onDocumentClick(event) {
  const closeButton = event.target.closest('[data-modal-close]');
  if (closeButton) {
    closeAdminModal();
    return;
  }

  const directAction = event.target.closest('[data-direct-action]');
  if (directAction) {
    const action = directAction.getAttribute('data-direct-action');
    const id = directAction.getAttribute('data-id') || '';
    if (action === 'view-video' && id) {
      event.preventDefault();
      await openVideoPreview(id);
    }
    return;
  }

  const menuItem = event.target.closest('[data-action-menu-item]');
  if (menuItem) {
    event.preventDefault();
    event.stopPropagation();
    closeActionMenus();
    try {
      await handleMenuAction(
        menuItem.getAttribute('data-entity') || '',
        menuItem.getAttribute('data-action') || '',
        menuItem.getAttribute('data-id') || ''
      );
    } catch (err) {
      state.error = err?.message || 'Әрекет орындалмады.';
      render();
    }
    return;
  }

  const menuButton = event.target.closest('[data-action-menu-button]');
  if (menuButton) {
    event.preventDefault();
    event.stopPropagation();
    toggleActionMenu(menuButton.closest('[data-actions]'));
    return;
  }

  if (event.target.classList?.contains('admin-modal')) {
    closeAdminModal();
    return;
  }

  closeActionMenus();
}

function onDocumentKeyDown(event) {
  if (event.key === 'Escape') {
    closeActionMenus();
    closeAdminModal();
  }
}

function closeActionMenus() {
  document.querySelectorAll('.admin-actions.is-open').forEach((node) => node.classList.remove('is-open'));
}

function toggleActionMenu(container) {
  if (!container) return;
  const shouldOpen = !container.classList.contains('is-open');
  closeActionMenus();
  if (shouldOpen) {
    container.classList.add('is-open');
  }
}

function getRecordByEntity(entity, id) {
  const key = String(id || '');
  if (!key) return null;
  switch (entity) {
    case 'application':
      return state.applications.find((item) => String(item.id) === key) || null;
    case 'user':
      return state.users.find((item) => String(item.id) === key) || null;
    case 'lead':
      return state.leads.find((item) => String(item.id) === key) || null;
    case 'video':
      return state.videos.find((item) => String(item.id) === key) || null;
    case 'project':
      return state.projects.find((item) => String(item.id) === key) || null;
    default:
      return null;
  }
}

async function handleMenuAction(entity, action, id) {
  const idStr = String(id || '').trim();
  // Видео: id из кнопки меню — не требуем совпадения в state (иначе Жою молча не срабатывал)
  if (entity === 'video' && idStr) {
    if (action === 'view') {
      await openVideoPreview(idStr);
      return;
    }
    if (action === 'delete') {
      const ok = window.confirm('Бұл видеоны өшіргіңіз келе ме?');
      if (!ok) return;
      state.error = '';
      await fetchAdminJson(`/admin/video-submissions/${encodeURIComponent(idStr)}`, { method: 'DELETE' });
      await loadAdminData();
      return;
    }
  }

  const record = getRecordByEntity(entity, idStr);
  if (!record) return;

  if (entity === 'project') {
    if (action === 'edit') {
      selectProject(id);
      elements.projectEditorForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (action === 'delete') {
      const ok = window.confirm('Бұл жобаны өшіргіңіз келе ме?');
      if (!ok) return;
      await fetchAdminJson(`/admin/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.projects = state.projects.filter((item) => String(item.id) !== String(id));
      if (state.selectedProjectId === id) {
        state.selectedProjectId = state.projects[0]?.id || null;
      }
      renderProjectsPanel();
      return;
    }
  }

  if (action === 'delete') {
    const labels = {
      application: 'өтінімді',
      user: 'қолданушыны',
      lead: 'чат өтінімін'
    };
    const ok = window.confirm(`Бұл ${labels[entity] || 'жазбаны'} өшіргіңіз келе ме?`);
    if (!ok) return;
    const endpoint = {
      application: `/admin/project-applications/${encodeURIComponent(id)}`,
      user: `/admin/users/${encodeURIComponent(id)}`,
      lead: `/admin/chat-leads/${encodeURIComponent(id)}`
    }[entity];
    if (!endpoint) return;
    await fetchAdminJson(endpoint, { method: 'DELETE' });
    await loadAdminData();
    return;
  }

  if (action === 'edit') {
    openEditModal(entity, record);
  }
}

function openAddAdminModal() {
  openAdminModal({
    title: 'Әкімшіні қосу',
    content: `
      <form class="admin-form admin-modal__form" id="adminAddAdminForm">
        <div class="admin-form__grid admin-form__grid--2">
          <label class="admin-field">
            <span>Электрондық пошта</span>
            <input name="email" type="email" required placeholder="admin@meyram.kz" autocomplete="username">
          </label>
          <label class="admin-field">
            <span>Құпиясөз</span>
            <input name="password" type="password" required minlength="6" placeholder="Кемінде 6 таңба" autocomplete="new-password">
          </label>
        </div>
        <p class="admin-auth__error" id="adminAddAdminError" style="min-height:1.2em"></p>
        <div class="admin-form__actions admin-modal__actions">
          <button class="admin-button admin-button--ghost" type="button" data-modal-close>Жабу</button>
          <button class="admin-button" type="submit">Қосу</button>
        </div>
      </form>
    `
  });

  const form = document.getElementById('adminAddAdminForm');
  const errEl = document.getElementById('adminAddAdminError');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = String(form.email?.value || '').trim();
    const password = String(form.password?.value || '');

    if (errEl) errEl.textContent = '';
    if (!email || !password) {
      if (errEl) errEl.textContent = 'Электрон пошта мен құпиясөзді енгізіңіз.';
      return;
    }
    if (password.length < 6) {
      if (errEl) errEl.textContent = 'Құпиясөз кемінде 6 таңбадан тұруы керек.';
      return;
    }

    try {
      await fetchAdminJson('/admin/admins', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      closeAdminModal();
      await loadAdminData();
    } catch (err) {
      if (errEl) errEl.textContent = err?.message || 'Қосу мүмкін болмады.';
    }
  });
}

function openEditModal(entity, record) {
  const config = getEditConfig(entity, record);
  if (!config) return;

  openAdminModal({
    title: config.title,
    content: `
      <form class="admin-form admin-modal__form" id="adminEntityEditForm">
        <div class="admin-form__grid admin-form__grid--2">
          ${config.fields.map((field) => renderModalField(field)).join('')}
        </div>
        <div class="admin-form__actions admin-modal__actions">
          <button class="admin-button admin-button--ghost" type="button" data-modal-close>Жабу</button>
          <button class="admin-button" type="submit">Сақтау</button>
        </div>
      </form>
    `
  });

  document.getElementById('adminEntityEditForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const endpoint = config.endpoint(record.id);
    await fetchAdminJson(endpoint, {
      method: 'PATCH',
      body: JSON.stringify({ item: payload })
    });
    closeAdminModal();
    await loadAdminData();
  });
}

function getEditConfig(entity, record) {
  if (entity === 'application') {
    return {
      title: 'Өтінімді өңдеу',
      endpoint: (id) => `/admin/project-applications/${encodeURIComponent(id)}`,
      fields: [
        { name: 'full_name', label: 'Үміткер', value: record.full_name || '' },
        { name: 'age', label: 'Жасы', value: record.age || '' },
        { name: 'city', label: 'Қала', value: record.city || '' },
        { name: 'parent_name', label: 'Ата-ана', value: record.parent_name || '' },
        { name: 'phone', label: 'Телефон', value: record.phone || '' },
        { name: 'status', label: 'Күйі', value: record.status || 'new' }
      ]
    };
  }

  if (entity === 'user') {
    return {
      title: 'Қолданушыны өңдеу',
      endpoint: (id) => `/admin/users/${encodeURIComponent(id)}`,
      fields: [
        { name: 'email', label: 'Электрон пошта', value: record.email || '' },
        { name: 'full_name', label: 'Аты', value: record.fullName || '' },
        { name: 'phone', label: 'Телефон', value: record.phone || '' },
        { name: 'role', label: 'Рөлі', value: record.role || 'authenticated' }
      ]
    };
  }

  if (entity === 'lead') {
    return {
      title: 'Чат өтінімін өңдеу',
      endpoint: (id) => `/admin/chat-leads/${encodeURIComponent(id)}`,
      fields: [
        { name: 'child_name', label: 'Бала', value: record.child_name || '' },
        { name: 'child_age', label: 'Жасы', value: record.child_age || '' },
        { name: 'city', label: 'Қала', value: record.city || '' },
        { name: 'parent_name', label: 'Ата-ана', value: record.parent_name || '' },
        { name: 'phone', label: 'Телефон', value: record.phone || '' },
        { name: 'experience', label: 'Тәжірибе', value: record.experience || '' },
        { name: 'note', label: 'Ескерту', value: record.note || '', wide: true, type: 'textarea' }
      ]
    };
  }

  return null;
}

function renderModalField(field) {
  const content = field.type === 'textarea'
    ? `<textarea name="${escapeHtml(field.name)}">${escapeHtml(field.value || '')}</textarea>`
    : `<input name="${escapeHtml(field.name)}" type="text" value="${escapeHtml(field.value || '')}">`;

  return `
    <label class="admin-field${field.wide ? ' admin-field--wide' : ''}">
      <span>${escapeHtml(field.label)}</span>
      ${content}
    </label>
  `;
}

async function openVideoPreview(id) {
  const response = await fetchAdminJson(`/admin/video-submissions/${encodeURIComponent(id)}/url`);
  const item = response.item || {};
  const signedUrl = response.signedUrl || '';
  if (!signedUrl) {
    throw new Error('Видео сілтемесі дайын болмады.');
  }

  openAdminModal({
    title: item.file_name || 'Видео',
    wide: true,
    content: `
      <div class="admin-video-preview">
        <video class="admin-video-preview__player" controls playsinline src="${escapeHtml(signedUrl)}"></video>
        <div class="admin-video-preview__meta">
          <div><strong>Өлшемі:</strong> ${escapeHtml(formatBytes(item.file_size))}</div>
          <div><strong>Сессия:</strong> ${escapeHtml(item.session_id || '—')}</div>
          <div><strong>Жүктелген уақыты:</strong> ${escapeHtml(formatDate(item.created_at))}</div>
          <div><strong>Path:</strong> ${escapeHtml(item.storage_path || '—')}</div>
          <a class="admin-button admin-button--ghost" href="${escapeHtml(signedUrl)}" target="_blank" rel="noreferrer">Жаңа бетте ашу</a>
        </div>
      </div>
    `
  });
}

function ensureAdminModalRoot() {
  let modal = document.getElementById('adminModalRoot');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'adminModalRoot';
  modal.className = 'admin-modal-root';
  modal.hidden = true;
  document.body.appendChild(modal);
  return modal;
}

function openAdminModal({ title, content, wide = false }) {
  const root = ensureAdminModalRoot();
  root.hidden = false;
  root.innerHTML = `
    <div class="admin-modal">
      <div class="admin-modal__backdrop" data-modal-close></div>
      <section class="admin-modal__dialog${wide ? ' admin-modal__dialog--wide' : ''}" role="dialog" aria-modal="true">
        <div class="admin-modal__header">
          <h3>${escapeHtml(title)}</h3>
          <button class="admin-icon-button" type="button" data-modal-close aria-label="Жабу">×</button>
        </div>
        <div class="admin-modal__body">${content}</div>
      </section>
    </div>
  `;
  document.body.classList.add('admin-modal-open');
}

function closeAdminModal() {
  const root = document.getElementById('adminModalRoot');
  if (!root) return;
  root.hidden = true;
  root.innerHTML = '';
  document.body.classList.remove('admin-modal-open');
}


function render() {
  if (elements.error) {
    elements.error.textContent = state.error;
    elements.error.hidden = !state.error;
  }

  const isAuthed = Boolean(state.session?.accessToken);
  let contentErr = document.getElementById('adminContentError');
  if (elements.content && !contentErr) {
    contentErr = document.createElement('div');
    contentErr.id = 'adminContentError';
    contentErr.className = 'admin-content-error';
    contentErr.setAttribute('role', 'alert');
    elements.content.insertBefore(contentErr, elements.content.firstChild);
  }
  if (contentErr) {
    contentErr.textContent = state.error || '';
    contentErr.hidden = !state.error || !isAuthed;
  }

  document.body.classList.toggle('admin-authenticated', isAuthed);
  document.body.classList.toggle('admin-guest', !isAuthed);

  elements.authCard.hidden = isAuthed;
  elements.content.hidden = !isAuthed;
  elements.refresh.hidden = !isAuthed;
  elements.signOut.hidden = !isAuthed;
  if (elements.addAdmin) elements.addAdmin.hidden = !isAuthed;

  renderStats();
  renderAiSettingsForm();
  renderProjectsPanel();
  renderApplications();
  renderUsers();
  renderLeads();
  renderVideos();
}

function renderStats() {
  if (!elements.stats) return;
  if (!state.dashboard?.stats) {
    elements.stats.innerHTML = '';
    return;
  }

  const cards = [
    ['Жобаға өтінімдер', state.dashboard.stats.projectApplications],
    ['Қолданушылар', state.usersTotal],
    ['Чат өтінімдері', state.dashboard.stats.chatLeads],
    ['Видео-визиткалар', state.dashboard.stats.videoSubmissions]
  ];

  elements.stats.innerHTML = cards.map(([label, value]) => `
    <article class="admin-stat">
      <span class="admin-stat__label">${escapeHtml(label)}</span>
      <div class="admin-stat__value">${Number(value || 0)}</div>
    </article>
  `).join('');
}

function renderAiSettingsForm() {
  if (!elements.aiSettingsForm) return;
  setFormValue(elements.aiSettingsForm, 'publicBrand', state.aiSettings.publicBrand);
  setFormValue(elements.aiSettingsForm, 'assistantBrand', state.aiSettings.assistantBrand);
  setFormValue(elements.aiSettingsForm, 'faqAge', state.aiSettings.faqAge);
  setFormValue(elements.aiSettingsForm, 'faqProcess', state.aiSettings.faqProcess);
  setFormValue(elements.aiSettingsForm, 'faqGeneric', state.aiSettings.faqGeneric);
  setFormValue(elements.aiSettingsForm, 'systemPromptOverride', state.aiSettings.systemPromptOverride);
}

function renderProjectsPanel() {
  if (!elements.projectsCount || !elements.projectsCatalogList || !elements.projectEditorForm) return;
  elements.projectsCount.textContent = String(state.projects.length || 0);
  const selected = getSelectedProject();

  if (!state.projects.length) {
    elements.projectsCatalogList.innerHTML = `<div class="admin-empty">${state.loading ? 'Жүктелуде...' : 'Әзірге жоба жоқ.'}</div>`;
  } else {
    elements.projectsCatalogList.innerHTML = state.projects.map((project) => `
      <article class="admin-project-card${project.id === state.selectedProjectId ? ' is-active' : ''}" data-project-id="${escapeHtml(project.id)}">
        <div class="admin-project-card__toolbar">
          ${renderActionMenu('project', project.id, [
            { action: 'edit', label: 'Өңдеу' },
            { action: 'delete', label: 'Жою', destructive: true }
          ])}
        </div>
        ${project.poster ? `<img src="${escapeHtml(project.poster)}" alt="${escapeHtml(project.title)}">` : ''}
        <div class="admin-project-card__title">${escapeHtml(project.title)}</div>
        <div class="admin-project-card__meta">${escapeHtml(project.genre || 'Жанр көрсетілмеген')}</div>
        <div class="admin-project-card__tags">
          <span class="admin-project-card__tag">${project.isPublished ? 'Сайтта' : 'Draft'}</span>
          <span class="admin-project-card__tag">Рөлдер: ${Array.isArray(project.roles) ? project.roles.length : 0}</span>
        </div>
      </article>
    `).join('');

    elements.projectsCatalogList.querySelectorAll('[data-project-id]').forEach((node) => {
      node.addEventListener('click', () => selectProject(node.getAttribute('data-project-id')));
    });
  }

  populateProjectForm(selected || emptyProject());
}

function getSelectedProject() {
  return state.projects.find((item) => item.id === state.selectedProjectId) || null;
}

function selectProject(projectId) {
  state.selectedProjectId = projectId || null;
  renderProjectsPanel();
}

function populateProjectForm(project) {
  const form = elements.projectEditorForm;
  if (!form) return;
  setFormValue(form, 'id', project.id || '');
  setFormValue(form, 'idVisible', project.id || '');
  setFormValue(form, 'title', project.title || '');
  setFormValue(form, 'genre', project.genre || '');
  setFormValue(form, 'poster', project.poster || '');
  setFormValue(form, 'banner', project.banner || '');
  setFormValue(form, 'promoVideoUrl', project.promoVideoUrl || '');
  setFormValue(form, 'countdownDate', toDateTimeLocal(project.countdownDate || ''));
  setFormValue(form, 'description', project.description || '');
  setFormValue(form, 'director', project.director || '');
  setFormValue(form, 'ageRange', project.ageRange || '');
  const checkbox = form.elements.namedItem('isPublished');
  if (checkbox) checkbox.checked = project.isPublished !== false;
  setFormValue(form, 'rolesJson', JSON.stringify(project.roles || [], null, 2));
}

function normalizeProjectRecord(project) {
  return {
    id: String(project.id || '').trim(),
    title: String(project.title || '').trim(),
    genre: String(project.genre || '').trim(),
    poster: String(project.poster || '').trim(),
    banner: String(project.banner || '').trim(),
    promoVideoUrl: String(project.promoVideoUrl || project.promo_video_url || '').trim(),
    countdownDate: String(project.countdownDate || project.countdown_date || '').trim(),
    description: String(project.description || '').trim(),
    director: String(project.director || '').trim(),
    ageRange: String(project.ageRange || project.age_range || '').trim(),
    isPublished: project.isPublished ?? project.is_published ?? true,
    roles: Array.isArray(project.roles) ? project.roles : []
  };
}

function normalizeAiSettings(settings) {
  return {
    publicBrand: String(settings.publicBrand || '').trim(),
    assistantBrand: String(settings.assistantBrand || '').trim(),
    faqAge: String(settings.faqAge || '').trim(),
    faqProcess: String(settings.faqProcess || '').trim(),
    faqGeneric: String(settings.faqGeneric || '').trim(),
    systemPromptOverride: String(settings.systemPromptOverride || '').trim()
  };
}

function normalizeAdminUserRecord(user) {
  const metadata = user.user_metadata || {};
  return {
    id: String(user.id || '').trim(),
    email: String(user.email || '').trim(),
    phone: String(user.phone || '').trim(),
    role: String(user.appRole || user.role || metadata.role || 'authenticated').trim(),
    fullName: String(metadata.full_name || metadata.name || metadata.fullName || '').trim(),
    createdAt: String(user.created_at || '').trim(),
    lastSignInAt: String(user.last_sign_in_at || '').trim()
  };
}

function setFormValue(form, name, value) {
  const field = form.elements.namedItem(name);
  if (field) field.value = value ?? '';
}

function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('kk-KZ', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function ensureSupabaseClientConfigured() {
  if (!runtime.supabaseUrl || !runtime.supabaseAnonKey) {
    throw new Error('Supabase client баптауы жоқ.');
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
