// ── API Helper ──────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  return res.json();
}

// ── Toast Notifications ─────────────────────────────────────────────

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Navigation ──────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`page-${tab.dataset.page}`).classList.add('active');

    // Load data for the page
    const page = tab.dataset.page;
    if (page === 'reactions') loadReactions();
    if (page === 'keywords') loadKeywords();
    if (page === 'settings') loadSettings();
    if (page === 'sessions') loadSessions();
  });
});

// ── Dashboard ───────────────────────────────────────────────────────

let pollInterval;

async function refreshDashboard() {
  try {
    const status = await api('GET', '/status');
    const stats = await api('GET', '/stats?days=7');
    const recent = await api('GET', '/reactions?limit=10');

    // Update status badge
    const badge = document.getElementById('statusBadge');
    const statusText = document.getElementById('statusText');
    if (status.needsRelogin) {
      badge.className = 'badge badge-error';
      statusText.textContent = 'Login Required';
    } else {
      badge.className = `badge badge-${status.status === 'running' ? 'running' : 'idle'}`;
      statusText.textContent = status.status === 'running' ? 'Running' : 'Idle';
    }

    // Login banner
    const loginBanner = document.getElementById('loginBanner');
    if (status.needsRelogin) {
      loginBanner.style.display = 'flex';
      loginBanner.querySelector('.banner-text').textContent = !status.loggedIn
        ? 'First time setup: Click "Login to LinkedIn" to connect your account. You only need to do this once.'
        : 'LinkedIn session expired. Please click "Login to LinkedIn" to reconnect. The OTP holder will need to approve once.';
    } else {
      loginBanner.style.display = 'none';
    }

    // Update buttons
    document.getElementById('btnStart').disabled = status.status === 'running' || status.needsRelogin;
    document.getElementById('btnStop').disabled = status.status !== 'running';

    // Update stats cards
    document.getElementById('todayCount').textContent = status.daily.achieved;
    document.getElementById('todayTarget').textContent = `Target: ${status.daily.target}`;
    const pct = status.daily.target > 0 ? (status.daily.achieved / status.daily.target * 100) : 0;
    document.getElementById('todayProgress').style.width = `${Math.min(100, pct)}%`;

    document.getElementById('sessionsCount').textContent = status.sessionsToday;
    document.getElementById('sessionsDetail').textContent = `${status.completedToday} completed`;

    document.getElementById('currentStatus').textContent =
      status.needsRelogin ? 'Login needed' :
      status.status === 'running' ? 'Running...' : 'Idle';
    document.getElementById('statusDetail').textContent =
      status.needsRelogin ? 'Session expired — re-login required' :
      status.status === 'running' ? 'Session in progress' : 'Ready to start';

    // Total reactions
    const totalReactions = (stats.stats || []).reduce((sum, d) => sum + d.total, 0);
    document.getElementById('totalReactions').textContent = totalReactions;

    // Week chart
    renderWeekChart(stats.stats || []);

    // Reaction types chart
    renderReactionTypes(stats.stats || []);

    // Recent activity
    renderRecentActivity(recent.reactions || []);
  } catch (err) {
    console.error('Dashboard refresh error:', err);
  }
}

function renderWeekChart(stats) {
  const container = document.getElementById('weekChart');
  if (!stats.length) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; display: flex; align-items: center; justify-content: center; width: 100%;">No data yet</div>';
    return;
  }

  const maxVal = Math.max(...stats.map(d => d.total), 1);
  const last7 = stats.slice(0, 7).reverse();

  container.innerHTML = last7.map(d => {
    const height = Math.max(4, (d.total / maxVal) * 100);
    const day = new Date(d.day + 'T00:00:00').toLocaleDateString('en', { weekday: 'short' });
    return `
      <div class="chart-bar-group">
        <div class="chart-value">${d.total}</div>
        <div class="chart-bar" style="height: ${height}px"></div>
        <div class="chart-label">${day}</div>
      </div>
    `;
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
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">No data yet</div>';
    return;
  }

  const types = [
    { name: 'Like', key: 'like', color: 'var(--like)' },
    { name: 'Celebrate', key: 'celebrate', color: 'var(--celebrate)' },
    { name: 'Insightful', key: 'insightful', color: 'var(--insightful)' },
    { name: 'Love', key: 'love', color: 'var(--love)' },
    { name: 'Support', key: 'support', color: 'var(--support)' },
    { name: 'Funny', key: 'funny', color: 'var(--funny)' },
  ].filter(t => totals[t.key] > 0);

  container.innerHTML = types.map(t => {
    const pct = Math.round(totals[t.key] / total * 100);
    return `
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
        <div style="width: 80px; font-size: 13px;">${t.name}</div>
        <div style="flex: 1; height: 20px; background: var(--bg); border-radius: 4px; overflow: hidden;">
          <div style="height: 100%; width: ${pct}%; background: ${t.color}; border-radius: 4px; transition: width 0.3s;"></div>
        </div>
        <div style="width: 50px; text-align: right; font-size: 13px; font-weight: 600;">${totals[t.key]}</div>
      </div>
    `;
  }).join('');
}

function renderRecentActivity(reactions) {
  const tbody = document.getElementById('recentActivity');
  if (!reactions.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No reactions yet</td></tr>';
    return;
  }

  tbody.innerHTML = reactions.map(r => `
    <tr>
      <td>${formatTime(r.reacted_at)}</td>
      <td>${escapeHtml(r.author)}</td>
      <td><span class="reaction-badge reaction-${r.reaction_type}">${r.reaction_type}</span></td>
      <td><span class="match-badge match-${r.match_level}">${r.match_level}</span></td>
      <td style="color: var(--text-muted); font-size: 12px;">${escapeHtml(r.matched_keyword || '')}</td>
    </tr>
  `).join('');
}

// ── Session Controls ────────────────────────────────────────────────

async function startSession() {
  try {
    const result = await api('POST', '/session/start');
    toast(result.message || 'Session started');
    refreshDashboard();
  } catch (err) {
    toast('Failed to start session', 'error');
  }
}

async function stopSession() {
  try {
    const result = await api('POST', '/session/stop');
    toast(result.message || 'Session stopped');
    refreshDashboard();
  } catch (err) {
    toast('Failed to stop session', 'error');
  }
}

async function openLogin() {
  try {
    const result = await api('POST', '/login/start');
    toast(result.message || 'Login browser opened');
  } catch (err) {
    toast('Failed to open login', 'error');
  }
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
  const html = reactions.map(r => `
    <tr>
      <td>${formatTime(r.reacted_at)}</td>
      <td>${escapeHtml(r.author)}</td>
      <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(r.content_snippet || '')}</td>
      <td><span class="reaction-badge reaction-${r.reaction_type}">${r.reaction_type}</span></td>
      <td><span class="match-badge match-${r.match_level}">${r.match_level}</span></td>
      <td style="font-size: 12px; color: var(--text-muted);">${escapeHtml(r.matched_keyword || '')}</td>
    </tr>
  `).join('');

  if (append) {
    tbody.innerHTML += html;
  } else {
    tbody.innerHTML = html || '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No reactions yet</td></tr>';
  }
}

// ── Keywords Page ───────────────────────────────────────────────────

let keywordsData = { primary: [], secondary: [], reactionMap: {}, fuzzyThreshold: 0.3 };

async function loadKeywords() {
  keywordsData = await api('GET', '/keywords');
  renderTags('primary', keywordsData.primary);
  renderTags('secondary', keywordsData.secondary);

  // Reaction map textareas
  const map = keywordsData.reactionMap || {};
  document.getElementById('map-celebrate').value = (map.celebrate || []).join(', ');
  document.getElementById('map-insightful').value = (map.insightful || []).join(', ');
  document.getElementById('map-love').value = (map.love || []).join(', ');
  document.getElementById('map-support').value = (map.support || []).join(', ');
  document.getElementById('fuzzyThreshold').value = keywordsData.fuzzyThreshold || 0.3;
}

function renderTags(type, keywords) {
  const container = document.getElementById(`${type}Tags`);
  const input = container.querySelector('.tags-input');

  // Remove existing tags
  container.querySelectorAll('.tag').forEach(t => t.remove());

  // Add new tags before the input
  for (const kw of keywords) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${escapeHtml(kw)} <span class="remove" onclick="removeTag(this, '${type}')">&times;</span>`;
    container.insertBefore(tag, input);
  }
}

function handleTagInput(e, type) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = e.target;
  const value = input.value.trim();
  if (!value) return;

  keywordsData[type].push(value);
  renderTags(type, keywordsData[type]);
  input.value = '';
}

function removeTag(el, type) {
  const tag = el.parentElement;
  const text = tag.textContent.replace('×', '').trim();
  keywordsData[type] = keywordsData[type].filter(k => k !== text);
  tag.remove();
}

async function saveKeywords() {
  // Collect reaction map from textareas
  const parseList = (id) => document.getElementById(id).value
    .split(',').map(s => s.trim()).filter(Boolean);

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
  } catch (err) {
    toast('Failed to save keywords', 'error');
  }
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
  } catch (err) {
    toast('Failed to save settings', 'error');
  }
}

// ── Sessions Page ───────────────────────────────────────────────────

async function loadSessions() {
  const data = await api('GET', '/sessions');
  const tbody = document.getElementById('sessionHistory');

  if (!data.sessions.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">No sessions yet</td></tr>';
    return;
  }

  tbody.innerHTML = data.sessions.map(s => `
    <tr>
      <td>${s.date}</td>
      <td>${s.window}</td>
      <td>${formatTime(s.started_at)}</td>
      <td>${s.ended_at ? formatTime(s.ended_at) : '-'}</td>
      <td>${s.posts_scrolled}</td>
      <td>${s.posts_matched}</td>
      <td style="font-weight: 600;">${s.posts_reacted}</td>
      <td>${s.posts_skipped}</td>
      <td>
        <span class="badge badge-${s.status === 'completed' ? 'running' : s.status === 'error' ? 'error' : 'idle'}">
          <span class="dot"></span> ${s.status}
        </span>
      </td>
    </tr>
  `).join('');
}

// ── Utilities ───────────────────────────────────────────────────────

function formatTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleString('en', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ── Init ────────────────────────────────────────────────────────────

refreshDashboard();
pollInterval = setInterval(refreshDashboard, 5000); // Poll every 5s
