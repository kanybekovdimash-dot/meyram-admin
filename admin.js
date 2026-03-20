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
  elements.aiSettingsForm?.addEventListener('submit', onSaveAiSettings);
  elements.projectEditorForm?.addEventListener('submit', onSaveProject);
  elements.newProjectButton?.addEventListener('click', () => selectProject(null));
  elements.resetProjectButton?.addEventListener('click', () => selectProject(state.selectedProjectId));

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

    const [dashboard, applications, users, leads, videos, projects, aiSettings] = await Promise.all([
      fetchAdminJson('/admin/dashboard'),
      fetchAdminJson('/admin/project-applications?limit=24'),
      fetchAdminJson('/admin/users?limit=24'),
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
    elements.applicationsTableBody.innerHTML = `<tr><td colspan="5" class="admin-empty">${state.loading ? 'Жүктелуде...' : 'Әзірге өтінім жоқ.'}</td></tr>`;
    return;
  }
  elements.applicationsTableBody.innerHTML = state.applications.map((item) => `
    <tr>
      <td><div class="admin-cell__title">${escapeHtml(item.project_title || '—')}</div><div class="admin-cell__meta">${escapeHtml(item.role_title || '—')}</div></td>
      <td><div class="admin-cell__title">${escapeHtml(item.full_name || '—')}</div><div class="admin-cell__meta">Жасы: ${escapeHtml(item.age || '—')} · ${escapeHtml(item.city || '—')}</div></td>
      <td><div>${escapeHtml(item.parent_name || '—')}</div><div class="admin-cell__meta">${escapeHtml(item.phone || '—')}</div></td>
      <td><span class="admin-pill${item.status === 'new' ? '' : ' admin-pill--muted'}">${escapeHtml(item.status || 'new')}</span></td>
      <td>${formatDate(item.created_at)}</td>
    </tr>
  `).join('');
}

function renderUsers() {
  if (!elements.usersCount || !elements.usersTableBody) return;
  elements.usersCount.textContent = String(state.usersTotal || state.users.length || 0);
  if (!state.users.length) {
    elements.usersTableBody.innerHTML = `<tr><td colspan="5" class="admin-empty">${state.loading ? 'Жүктелуде...' : 'Әзірге тіркелген қолданушы жоқ.'}</td></tr>`;
    return;
  }

  elements.usersTableBody.innerHTML = state.users.map((item) => `
    <tr>
      <td><div class="admin-cell__title">${escapeHtml(item.email || '—')}</div><div class="admin-cell__meta">ID: ${escapeHtml(item.id || '—')}</div></td>
      <td><div>${escapeHtml(item.fullName || '—')}</div><div class="admin-cell__meta">Соңғы кіруі: ${formatDate(item.lastSignInAt)}</div></td>
      <td>${escapeHtml(item.phone || '—')}</td>
      <td><span class="admin-pill admin-pill--muted">${escapeHtml(item.role || 'authenticated')}</span></td>
      <td>${formatDate(item.createdAt)}</td>
    </tr>
  `).join('');
}

function renderLeads() {
  if (!elements.leadsCount || !elements.leadsTableBody) return;
  elements.leadsCount.textContent = String(state.leads.length || 0);
  if (!state.leads.length) {
    elements.leadsTableBody.innerHTML = `<tr><td colspan="5" class="admin-empty">${state.loading ? 'Жүктелуде...' : 'Әзірге чат өтінімдері жоқ.'}</td></tr>`;
    return;
  }
  elements.leadsTableBody.innerHTML = state.leads.map((item) => `
    <tr>
      <td><div class="admin-cell__title">${escapeHtml(item.child_name || '—')}</div><div class="admin-cell__meta">Жасы: ${escapeHtml(item.child_age || '—')}</div></td>
      <td><div>${escapeHtml(item.parent_name || '—')}</div><div class="admin-cell__meta">${escapeHtml(item.phone || '—')}</div></td>
      <td>${escapeHtml(item.city || '—')}</td>
      <td>${escapeHtml(item.experience || '—')}</td>
      <td>${formatDate(item.created_at)}</td>
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
      <strong>${escapeHtml(item.file_name || 'video.webm')}</strong>
      <p>Сессия: ${escapeHtml(item.session_id || '—')}</p>
      <p>Өлшемі: ${formatBytes(item.file_size)}</p>
      <p>Path: ${escapeHtml(item.storage_path || '—')}</p>
      <p>${formatDate(item.created_at)}</p>
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
  const response = await fetch(`${runtime.apiBase}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
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

function render() {
  elements.error.hidden = !state.error;
  elements.error.textContent = state.error;

  const isAuthed = Boolean(state.session?.accessToken);
  document.body.classList.toggle('admin-authenticated', isAuthed);
  document.body.classList.toggle('admin-guest', !isAuthed);

  elements.authCard.hidden = isAuthed;
  elements.content.hidden = !isAuthed;
  elements.refresh.hidden = !isAuthed;
  elements.signOut.hidden = !isAuthed;

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
