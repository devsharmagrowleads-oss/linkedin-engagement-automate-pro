// ── API Helper ──────────────────────────────────────────────────────

async function api(path) {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Navigation (desktop sidebar + mobile nav) ───────────────────────

function switchPage(page) {
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-btn').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  document.querySelectorAll(`[data-page="${page}"]`).forEach(i => i.classList.add('active'));
  document.getElementById(`page-${page}`).classList.add('active');

  if (page === 'activity') loadActivity();
  if (page === 'teams') loadTeams();
}

document.querySelectorAll('[data-page]').forEach(item => {
  item.addEventListener('click', () => switchPage(item.dataset.page));
});

// ── Team Overview ───────────────────────────────────────────────────

async function loadUsers() {
  try {
    const data = await api('/users');
    const users = data.users || [];

    document.getElementById('totalMembers').textContent = users.length;
    document.getElementById('activeToday').textContent = users.filter(u => u.sessions_today > 0).length;
    document.getElementById('inactiveCount').textContent = users.filter(u => u.inactive).length;
    document.getElementById('sessionsToday').textContent = users.reduce((sum, u) => sum + (u.sessions_today || 0), 0);

    renderUsersTable(users);
    renderUserCards(users);
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTable');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">No team members yet. Waiting for first session report...</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => {
    const { badge, rowClass } = getUserStatus(u);
    const linkedinDisplay = u.linkedin_url
      ? `<a class="profile-link" href="${escapeHtml(u.linkedin_url)}" target="_blank">${escapeHtml(u.linkedin_name)}</a>`
      : escapeHtml(u.linkedin_name);

    return `<tr class="${rowClass}">
      <td>${badge}</td>
      <td><strong>${escapeHtml(u.user_name)}</strong></td>
      <td>${escapeHtml(u.team)}</td>
      <td>${linkedinDisplay}</td>
      <td>${u.sessions_today || 0}</td>
      <td>${u.reactions_today || 0}</td>
      <td>${u.total_sessions || 0}</td>
      <td title="${escapeHtml(u.last_seen)}">${timeAgo(u.last_seen)}</td>
    </tr>`;
  }).join('');
}

function renderUserCards(users) {
  const container = document.getElementById('userCards');
  if (!users.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">No team members yet</div>';
    return;
  }

  container.innerHTML = users.map(u => {
    const { badge, cardClass } = getUserStatus(u);
    const linkedinDisplay = u.linkedin_url
      ? `<a class="profile-link" href="${escapeHtml(u.linkedin_url)}" target="_blank">${escapeHtml(u.linkedin_name)}</a>`
      : escapeHtml(u.linkedin_name);

    return `<div class="user-card ${cardClass}">
      <div class="user-card-header">
        <div>
          <div class="user-card-name">${escapeHtml(u.user_name)}</div>
          <div class="user-card-team">${escapeHtml(u.team)}</div>
        </div>
        ${badge}
      </div>
      <div class="user-card-stats">
        <div class="user-card-stat">
          <div class="user-card-stat-value">${u.sessions_today || 0}</div>
          <div class="user-card-stat-label">Sessions</div>
        </div>
        <div class="user-card-stat">
          <div class="user-card-stat-value">${u.reactions_today || 0}</div>
          <div class="user-card-stat-label">Reactions</div>
        </div>
        <div class="user-card-stat">
          <div class="user-card-stat-value">${u.total_sessions || 0}</div>
          <div class="user-card-stat-label">Total</div>
        </div>
      </div>
      <div class="user-card-linkedin">
        <span>${linkedinDisplay}</span>
        <span>${timeAgo(u.last_seen)}</span>
      </div>
    </div>`;
  }).join('');
}

function getUserStatus(u) {
  if (u.inactive) {
    return {
      badge: '<span class="badge badge-inactive"><span class="dot"></span> Inactive</span>',
      rowClass: 'row-inactive',
      cardClass: 'card-inactive',
    };
  } else if (u.idle) {
    return {
      badge: '<span class="badge badge-idle"><span class="dot"></span> Idle</span>',
      rowClass: 'row-idle',
      cardClass: 'card-idle',
    };
  }
  return {
    badge: '<span class="badge badge-active"><span class="dot"></span> Active</span>',
    rowClass: '',
    cardClass: 'card-active-user',
  };
}

// ── Activity Log ────────────────────────────────────────────────────

async function loadActivity() {
  try {
    const data = await api('/activity?limit=100');
    const activity = data.activity || [];
    const tbody = document.getElementById('activityTable');

    if (!activity.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted);">No activity yet</td></tr>';
      return;
    }

    tbody.innerHTML = activity.map(a => {
      const statusClass = a.status === 'completed' ? 'badge-completed'
        : a.status === 'error' ? 'badge-error' : 'badge-browse';

      return `<tr>
        <td>${formatTime(a.reported_at)}</td>
        <td><strong>${escapeHtml(a.user_name)}</strong></td>
        <td>${escapeHtml(a.team)}</td>
        <td>${escapeHtml(a.linkedin_name)}</td>
        <td style="text-transform:capitalize;">${escapeHtml(a.window)}</td>
        <td><span class="badge ${statusClass}">${escapeHtml(a.status)}</span></td>
        <td>${a.posts_scrolled || 0}</td>
        <td>${a.posts_matched || 0}</td>
        <td><strong>${a.posts_reacted || 0}</strong></td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error('Failed to load activity:', err);
  }
}

// ── Team Stats ──────────────────────────────────────────────────────

async function loadTeams() {
  try {
    const data = await api('/teams');
    const teams = data.teams || [];
    const tbody = document.getElementById('teamsTable');

    if (!teams.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text-muted);">No teams yet</td></tr>';
      return;
    }

    tbody.innerHTML = teams.map(t => `<tr>
      <td><strong>${escapeHtml(t.team)}</strong></td>
      <td>${t.members}</td>
      <td>${t.total_sessions}</td>
      <td>${t.total_reactions}</td>
    </tr>`).join('');
  } catch (err) {
    console.error('Failed to load teams:', err);
  }
}

// ── Init ────────────────────────────────────────────────────────────

loadUsers();
setInterval(loadUsers, 30000);
