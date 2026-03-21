// ── API Helper ──────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API ${res.status}`);
  }
  return res.json();
}

// ── Toast ───────────────────────────────────────────────────────────

function toast(message, type = 'success') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = 'all 0.2s ease';
    setTimeout(() => el.remove(), 200);
  }, 2500);
}

// ── Sidebar Navigation ──────────────────────────────────────────────

document.querySelectorAll('.sidebar-item[data-page]').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-item[data-page]').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    item.classList.add('active');
    const page = item.dataset.page;
    document.getElementById(`page-${page}`).classList.add('active');

    if (page === 'reactions') loadReactions();
    if (page === 'keywords') loadKeywords();
    if (page === 'settings') loadSettings();
    if (page === 'sessions') loadSessions();

    // Close sidebar on mobile
    if (window.innerWidth <= 900) {
      document.getElementById('sidebar').classList.remove('open');
    }
  });
});

// ── Dashboard ───────────────────────────────────────────────────────

let pollInterval;
let lastSessionStatus = 'idle'; // track for adaptive polling
const POLL_ACTIVE = 5000;   // 5s when session is running
const POLL_IDLE = 30000;    // 30s when idle

async function refreshDashboard() {
  try {
    const [status, stats, recent] = await Promise.all([
      api('GET', '/status'),
      api('GET', '/stats?days=7'),
      api('GET', '/reactions?limit=10'),
    ]);

    // Status badge
    const badge = document.getElementById('statusBadge');
    const statusText = document.getElementById('statusText');
    if (status.loginInProgress) {
      badge.className = 'badge badge-warning';
      statusText.textContent = 'Logging in...';
    } else if (status.needsRelogin) {
      badge.className = 'badge badge-error';
      statusText.textContent = 'Login Required';
    } else {
      badge.className = `badge badge-${status.status === 'running' ? 'running' : 'idle'}`;
      statusText.textContent = status.status === 'running' ? 'Running' : 'Idle';
    }

    // Login banner
    const loginBanner = document.getElementById('loginBanner');
    if (status.loginInProgress) {
      loginBanner.style.display = 'flex';
      loginBanner.querySelector('.banner-text').textContent =
        'Login in progress... Complete in the browser window.';
    } else if (status.needsRelogin) {
      loginBanner.style.display = 'flex';
      loginBanner.querySelector('.banner-text').textContent = !status.loggedIn
        ? 'First time setup. Click "Login to LinkedIn" in the sidebar.'
        : 'Session expired. Please reconnect via the sidebar.';
    } else {
      loginBanner.style.display = 'none';
    }

    // Buttons
    document.getElementById('btnStart').disabled = status.status === 'running' || status.needsRelogin;
    document.getElementById('btnStop').disabled = status.status !== 'running';

    // Stat cards
    document.getElementById('todayCount').textContent = status.daily.achieved;
    document.getElementById('todayTarget').textContent = `Target: ${status.daily.target}`;
    const pct = status.daily.target > 0 ? (status.daily.achieved / status.daily.target * 100) : 0;
    document.getElementById('todayProgress').style.width = `${Math.min(100, pct)}%`;

    document.getElementById('sessionsCount').textContent = status.sessionsToday;
    document.getElementById('sessionsDetail').textContent = `${status.completedToday} completed`;

    document.getElementById('currentStatus').textContent =
      status.loginInProgress ? 'Logging in' :
      status.needsRelogin ? 'Login needed' :
      status.status === 'running' ? 'Running' : 'Idle';
    document.getElementById('statusDetail').textContent =
      status.loginInProgress ? 'Browser window open' :
      status.needsRelogin ? 'Re-login required' :
      status.status === 'running' ? 'Session active' : 'Ready';

    const totalReactions = (stats.stats || []).reduce((sum, d) => sum + d.total, 0);
    document.getElementById('totalReactions').textContent = totalReactions;

    renderWeekChart(stats.stats || []);
    renderReactionTypes(stats.stats || []);
    renderRecentActivity(recent.reactions || []);

    // Adaptive polling: speed up when active, slow down when idle
    const currentStatus = status.status === 'running' || status.loginInProgress ? 'active' : 'idle';
    if (currentStatus !== lastSessionStatus) {
      lastSessionStatus = currentStatus;
      clearInterval(pollInterval);
      pollInterval = setInterval(refreshDashboard, currentStatus === 'active' ? POLL_ACTIVE : POLL_IDLE);
    }
  } catch (err) {
    console.error('Dashboard refresh error:', err);
  }
}

function renderWeekChart(stats) {
  const container = document.getElementById('weekChart');
  if (!stats.length) {
    container.innerHTML = '<div class="empty-state" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">No data yet</div>';
    return;
  }
  const maxVal = Math.max(...stats.map(d => d.total), 1);
  const last7 = stats.slice(0, 7).reverse();
  container.innerHTML = last7.map(d => {
    const height = Math.max(4, (d.total / maxVal) * 100);
    const day = new Date(d.day + 'T00:00:00').toLocaleDateString('en', { weekday: 'short' });
    return `<div class="chart-bar-group">
      <div class="chart-value">${d.total}</div>
      <div class="chart-bar" style="height:${height}px"></div>
      <div class="chart-label">${day}</div>
    </div>`;
  }).join('');
}

function renderReactionTypes(stats) {
  const container = document.getElementById('reactionTypesChart');
  const totals = { like: 0, celebrate: 0, insightful: 0, love: 0, support: 0, funny: 0 };
  for (const d of stats) {
    totals.like += d.likes || 0;
    totals.celebrate += d.celebrates || 0;
    totals.insightful += d.insightfuls || 0;
    totals.love += d.loves || 0;
    totals.support += d.supports || 0;
    totals.funny += d.funnys || 0;
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  if (total === 0) {
    container.innerHTML = '<div class="empty-state">No data yet</div>';
    return;
  }
  const types = [
    { name: 'Like', key: 'like', color: 'var(--blue-500)' },
    { name: 'Celebrate', key: 'celebrate', color: 'var(--amber-400)' },
    { name: 'Insightful', key: 'insightful', color: 'var(--violet-400)' },
    { name: 'Love', key: 'love', color: 'var(--rose-500)' },
    { name: 'Support', key: 'support', color: 'var(--green-400)' },
    { name: 'Funny', key: 'funny', color: 'var(--cyan-400)' },
  ].filter(t => totals[t.key] > 0);

  container.innerHTML = types.map(t => {
    const pct = Math.round(totals[t.key] / total * 100);
    return `<div class="hbar-row">
      <div class="hbar-label">${t.name}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${pct}%;background:${t.color};"></div></div>
      <div class="hbar-count">${totals[t.key]}</div>
    </div>`;
  }).join('');
}

function renderRecentActivity(reactions) {
  const tbody = document.getElementById('recentActivity');
  if (!reactions.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No reactions yet</td></tr>';
    return;
  }
  tbody.innerHTML = reactions.map(r => `<tr class="clickable-row" data-url="${escapeHtml(r.post_url || r.post_urn)}" title="Click to view post on LinkedIn">
    <td>${formatTime(r.reacted_at)}</td>
    <td>${escapeHtml(r.author)}</td>
    <td><span class="reaction-badge reaction-${escapeHtml(r.reaction_type)}">${escapeHtml(r.reaction_type)}</span></td>
    <td><span class="match-badge match-${escapeHtml(r.match_level)}">${escapeHtml(r.match_level)}</span></td>
    <td style="color:var(--text-muted);">${escapeHtml(r.matched_keyword || '')}</td>
  </tr>`).join('');
}

// ── Session Controls ────────────────────────────────────────────────

async function startSession() {
  try {
    const result = await api('POST', '/session/start');
    toast(result.message || 'Session started');
    refreshDashboard();
  } catch { toast('Failed to start session', 'error'); }
}

async function stopSession() {
  try {
    const result = await api('POST', '/session/stop');
    toast(result.message || 'Session stopped');
    refreshDashboard();
  } catch { toast('Failed to stop session', 'error'); }
}

async function openLogin() {
  try {
    const result = await api('POST', '/login/start');
    toast(result.message || 'Login browser opened');
    refreshDashboard();
    const loginPoll = setInterval(async () => {
      try {
        const s = await api('GET', '/login/status');
        if (!s.inProgress) {
          clearInterval(loginPoll);
          if (s.loggedIn) toast('LinkedIn connected!');
          refreshDashboard();
        }
      } catch {}
    }, 2000);
    setTimeout(() => clearInterval(loginPoll), 5 * 60 * 1000);
  } catch { toast('Failed to open login', 'error'); }
}

// ── Reactions Page ──────────────────────────────────────────────────

let reactionsOffset = 0;

async function loadReactions() {
  reactionsOffset = 0;
  const data = await api('GET', '/reactions?limit=50&offset=0');
  renderAllReactions(data.reactions, false);
}

async function loadMoreReactions() {
  reactionsOffset += 50;
  const data = await api('GET', `/reactions?limit=50&offset=${reactionsOffset}`);
  renderAllReactions(data.reactions, true);
}

function renderAllReactions(reactions, append) {
  const tbody = document.getElementById('allReactions');
  const html = reactions.map(r => `<tr class="clickable-row" data-url="${escapeHtml(r.post_url || r.post_urn)}" title="Click to view post on LinkedIn">
    <td>${formatTime(r.reacted_at)}</td>
    <td>${escapeHtml(r.author)}</td>
    <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);">${escapeHtml(r.content_snippet || '')}</td>
    <td><span class="reaction-badge reaction-${escapeHtml(r.reaction_type)}">${escapeHtml(r.reaction_type)}</span></td>
    <td><span class="match-badge match-${escapeHtml(r.match_level)}">${escapeHtml(r.match_level)}</span></td>
    <td style="color:var(--text-muted);">${escapeHtml(r.matched_keyword || '')}</td>
  </tr>`).join('');
  if (append) {
    tbody.insertAdjacentHTML('beforeend', html);
  } else {
    tbody.innerHTML = html || '<tr><td colspan="6" class="empty-state">No reactions yet</td></tr>';
  }
}

// ── Keywords Page ───────────────────────────────────────────────────

let keywordsData = { primary: [], secondary: [], reactionMap: {}, fuzzyThreshold: 0.3 };

async function loadKeywords() {
  keywordsData = await api('GET', '/keywords');
  renderTags('primary', keywordsData.primary);
  renderTags('secondary', keywordsData.secondary);

  const map = keywordsData.reactionMap || {};
  document.getElementById('map-celebrate').value = (map.celebrate || []).join(', ');
  document.getElementById('map-insightful').value = (map.insightful || []).join(', ');
  document.getElementById('map-love').value = (map.love || []).join(', ');
  document.getElementById('map-support').value = (map.support || []).join(', ');
  document.getElementById('fuzzyThreshold').value = keywordsData.fuzzyThreshold || 0.3;

  const toggle = document.getElementById('reactToAllToggle');
  toggle.checked = keywordsData.reactToAll === true;
  updateToggleUI(keywordsData.reactToAll === true);
}

function renderTags(type, keywords) {
  const container = document.getElementById(`${type}Tags`);
  const input = container.querySelector('.tags-input');
  container.querySelectorAll('.tag').forEach(t => t.remove());
  for (const kw of keywords) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${escapeHtml(kw)} <span class="remove" data-tag-type="${escapeHtml(type)}">&times;</span>`;
    container.insertBefore(tag, input);
  }
}

function handleTagInput(e, type) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const val = e.target.value.trim();
  if (!val) return;
  keywordsData[type].push(val);
  renderTags(type, keywordsData[type]);
  e.target.value = '';
}

function removeTag(el, type) {
  const tag = el.parentElement;
  const text = tag.textContent.replace('\u00d7', '').trim();
  keywordsData[type] = keywordsData[type].filter(k => k !== text);
  tag.remove();
}

// Delegated handler for tag remove buttons (no inline onclick)
document.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('.remove[data-tag-type]');
  if (removeBtn) removeTag(removeBtn, removeBtn.dataset.tagType);
});

function toggleReactToAll() {
  const isOn = document.getElementById('reactToAllToggle').checked;
  keywordsData.reactToAll = isOn;
  updateToggleUI(isOn);
}

function updateToggleUI(isOn) {
  const section = document.getElementById('keywordSection');
  if (section) section.classList.toggle('section-disabled', isOn);
}

async function saveKeywords() {
  const parseList = (id) => document.getElementById(id).value.split(',').map(s => s.trim()).filter(Boolean);
  keywordsData.reactionMap = {
    celebrate: parseList('map-celebrate'),
    insightful: parseList('map-insightful'),
    love: parseList('map-love'),
    support: parseList('map-support'),
    funny: keywordsData.reactionMap?.funny || [],
  };
  keywordsData.fuzzyThreshold = parseFloat(document.getElementById('fuzzyThreshold').value) || 0.3;
  try {
    await api('POST', '/keywords', keywordsData);
    toast('Keywords saved');
  } catch { toast('Failed to save keywords', 'error'); }
}

// ── Settings Page ───────────────────────────────────────────────────

async function loadSettings() {
  const settings = await api('GET', '/settings');
  for (const [key, value] of Object.entries(settings)) {
    const el = document.getElementById(`set-${key}`);
    if (el) el.value = value;
  }
}

async function saveSettings() {
  const fields = [
    'MORNING_WINDOW', 'AFTERNOON_WINDOW', 'EVENING_WINDOW',
    'DAILY_TARGET_MIN', 'DAILY_TARGET_MAX',
    'MAX_JITTER_MINUTES', 'MAX_SESSION_MINUTES', 'TIMEZONE',
    'VIEWPORT_WIDTH', 'VIEWPORT_HEIGHT'
  ];
  const settings = {};
  for (const key of fields) {
    const el = document.getElementById(`set-${key}`);
    if (el && el.value) settings[key] = el.value;
  }
  try {
    await api('POST', '/settings', settings);
    toast('Settings saved');
  } catch { toast('Failed to save settings', 'error'); }
}

// ── Sessions Page ───────────────────────────────────────────────────

async function loadSessions() {
  const data = await api('GET', '/sessions');
  const tbody = document.getElementById('sessionHistory');
  if (!data.sessions.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No sessions yet</td></tr>';
    return;
  }
  tbody.innerHTML = data.sessions.map(s => `<tr>
    <td>${escapeHtml(s.date)}</td>
    <td style="text-transform:capitalize;">${escapeHtml(s.window)}</td>
    <td>${formatTime(s.started_at)}</td>
    <td>${s.ended_at ? formatTime(s.ended_at) : '-'}</td>
    <td>${Number(s.posts_scrolled) || 0}</td>
    <td>${Number(s.posts_matched) || 0}</td>
    <td style="font-weight:600;">${Number(s.posts_reacted) || 0}</td>
    <td>${Number(s.posts_skipped) || 0}</td>
    <td><span class="badge badge-${s.status === 'completed' ? 'completed' : s.status === 'error' ? 'error' : 'idle'}"><span class="dot"></span> ${escapeHtml(s.status)}</span></td>
  </tr>`).join('');
}

// ── Utilities ───────────────────────────────────────────────────────

function formatTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function openLinkedInPost(url) {
  if (!url) {
    toast('Post link not available', 'error');
    return;
  }
  // Ensure it's a full URL
  if (url.startsWith('/')) {
    url = 'https://www.linkedin.com' + url;
  } else if (!url.startsWith('http')) {
    url = 'https://www.linkedin.com/feed/update/' + encodeURIComponent(url);
  }
  // Block non-http protocols (XSS prevention)
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
  } catch { return; }
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ── SSE Live Log ────────────────────────────────────────────────────

function connectSSE() {
  const es = new EventSource('/api/events');
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'session_started') {
        document.getElementById('liveSessionCard').style.display = '';
        document.getElementById('liveSessionLog').textContent = 'Session starting...\n';
        refreshDashboard();
      } else if (data.type === 'session_log') {
        const el = document.getElementById('liveSessionLog');
        el.textContent += data.message + '\n';
        el.scrollTop = el.scrollHeight;
      } else if (data.type === 'session_ended') {
        document.getElementById('liveSessionLog').textContent += `\nSession ended (code ${data.code})\n`;
        refreshDashboard();
        setTimeout(() => {
          const card = document.getElementById('liveSessionCard');
          if (card) card.style.display = 'none';
        }, 30000);
      }
    } catch {}
  };
  es.onerror = () => { es.close(); setTimeout(connectSSE, 5000); };
}

// ── Delegated click handler for clickable rows ──────────────────────

document.addEventListener('click', (e) => {
  const row = e.target.closest('.clickable-row[data-url]');
  if (row) openLinkedInPost(row.dataset.url);
});

// ── Init ────────────────────────────────────────────────────────────

refreshDashboard();
pollInterval = setInterval(refreshDashboard, POLL_IDLE); // start slow, speeds up if active
connectSSE();

document.addEventListener('visibilitychange', () => {
  clearInterval(pollInterval);
  if (!document.hidden) {
    refreshDashboard();
    const rate = lastSessionStatus === 'active' ? POLL_ACTIVE : POLL_IDLE;
    pollInterval = setInterval(refreshDashboard, rate);
  }
});
