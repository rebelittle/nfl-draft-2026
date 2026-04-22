/**
 * 2026 NFL Draft Pool Tracker - main app
 *
 * Architecture:
 *   - Fetches three JSON files: data/actual.json, data/entries.json, data/scoring.json
 *   - Re-renders on each load. To update during draft night: edit actual.json, commit, push.
 *   - GitHub Pages serves with cache headers that give fresh data within a minute or two.
 */

const state = {
  actuals: null,
  entries: null,
  scoring: null,
  results: null
};

async function loadData() {
  const bust = `?t=${Date.now()}`;
  const [actualRes, entriesRes, scoringRes] = await Promise.all([
    fetch(`data/actual.json${bust}`),
    fetch(`data/entries.json${bust}`),
    fetch(`data/scoring.json${bust}`)
  ]);
  state.actuals = await actualRes.json();
  state.entries = (await entriesRes.json()).entries;
  state.scoring = (await scoringRes.json()).rules;
  state.results = ScoringEngine.scoreAll(state.entries, state.actuals);
}

// ================== RENDERERS ==================

function renderTicker() {
  const el = document.getElementById('ticker');
  const made = state.actuals.picks.filter(ScoringEngine.isPickMade);
  const items = [];

  items.push(`<span class="ticker-item"><span class="ticker-dot"></span><strong>2026 NFL DRAFT</strong> Round 1</span>`);
  items.push(`<span class="ticker-item"><strong>${made.length}/32</strong> picks in</span>`);

  if (state.results.length) {
    const leader = state.results[0];
    items.push(`<span class="ticker-item">Leader: <strong>${leader.entry.name}</strong> &middot; ${leader.total} pts</span>`);
  }

  made.slice(-6).forEach(p => {
    items.push(`<span class="ticker-item">Pk ${p.pick} &middot; <strong>${p.team}</strong> &middot; ${p.player} (${p.position || '?'})</span>`);
  });

  state.scoring.forEach(r => {
    items.push(`<span class="ticker-item">${r.label} <strong>+${r.points}</strong></span>`);
  });

  // Duplicate once for seamless scroll
  const html = items.join(' &middot; ');
  el.innerHTML = html + ' &middot; ' + html;
}

function renderStatus() {
  const made = state.actuals.picks.filter(ScoringEngine.isPickMade).length;
  document.getElementById('picksMade').textContent = `${made} / 32`;
  document.getElementById('pickProgress').textContent = `${made} / 32`;

  const ts = state.actuals.lastUpdated;
  if (ts) {
    const d = new Date(ts);
    document.getElementById('lastUpdated').textContent = `Updated ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
}

function renderOnClock() {
  const card = document.getElementById('onClockCard');
  const next = state.actuals.picks.find(p => !ScoringEngine.isPickMade(p));

  if (!next) {
    card.className = 'on-clock-card idle';
    card.innerHTML = `
      <div class="label">Round 1 Complete</div>
      <div class="pick-num">32</div>
      <div class="team-name">Final Scoring Active</div>
    `;
    return;
  }

  const teamLabel = next.team || 'TBD';
  card.className = 'on-clock-card';
  card.innerHTML = `
    <div class="label">On the Clock</div>
    <div class="pick-num">${next.pick}</div>
    <div class="team-name">${teamLabel}</div>
  `;
}

function renderScoringCard() {
  const el = document.getElementById('scoringList');
  el.innerHTML = state.scoring.map(r => `
    <div class="scoring-row">
      <span>${r.label}</span>
      <span class="pts">+${r.points}</span>
    </div>
  `).join('');
}

function renderLeaderboard() {
  const body = document.getElementById('leaderboardBody');
  if (!state.results.length) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: var(--ink-low);">No entries yet</td></tr>`;
    return;
  }

  body.innerHTML = state.results.map((r, idx) => `
    <tr class="clickable rank-${idx + 1}" onclick="openDetail('${r.entry.id}')">
      <td class="rank">${idx + 1}</td>
      <td class="name">${r.entry.name}</td>
      <td class="num">${r.hits}</td>
      <td class="num">${r.correctTeams}</td>
      <td class="num">${r.correctPlayers}</td>
      <td class="points">${r.total}</td>
    </tr>
  `).join('');
}

function renderPickGrid() {
  const grid = document.getElementById('pickGrid');
  const onClockPick = (state.actuals.picks.find(p => !ScoringEngine.isPickMade(p)) || {}).pick;

  grid.innerHTML = state.actuals.picks.map(p => {
    const made = ScoringEngine.isPickMade(p);
    const onClock = p.pick === onClockPick;
    const cls = made ? 'made' : (onClock ? 'on-clock' : 'pending');
    const teamLabel = p.team || '&mdash;';
    const tradeTag = p.tradeFrom ? `<div class="pick-trade">via ${p.tradeFrom}</div>` : '';

    let body;
    if (made) {
      body = `
        <div class="pick-player">${p.player}</div>
        <span class="pick-position">${p.position || 'POS'}</span>
      `;
    } else if (onClock) {
      body = `<div class="pick-clock">&bull; ON THE CLOCK</div>`;
    } else {
      body = `<div class="pick-waiting">Awaiting pick</div>`;
    }

    return `
      <div class="pick-card ${cls}">
        <div class="pick-card-top">
          <div class="pick-number">${String(p.pick).padStart(2, '0')}</div>
          <div style="text-align: right;">
            <div class="pick-team">${teamLabel}</div>
            ${tradeTag}
          </div>
        </div>
        ${body}
      </div>
    `;
  }).join('');
}

// ================== DETAIL MODAL ==================

function openDetail(entryId) {
  const result = state.results.find(r => r.entry.id === entryId);
  if (!result) return;

  document.getElementById('detailName').textContent = result.entry.name;
  document.getElementById('detailScore').textContent = result.total;
  document.getElementById('detailMeta').textContent = `${result.hits} hits · rank #${state.results.indexOf(result) + 1}`;

  const body = document.getElementById('detailBody');
  const rows = [];

  result.pickScores.forEach(ps => {
    const actual = state.actuals.picks.find(p => p.pick === ps.pick);
    const madeStr = ScoringEngine.isPickMade(actual)
      ? `${actual.team} &middot; ${actual.player} <span style="color: var(--ink-low)">(${actual.position || '?'})</span>`
      : `<span class="pending">pending</span>`;

    const predStr = `${ps.prediction.team || '?'} &middot; ${ps.prediction.player || '?'} <span style="color: var(--ink-low)">(${ps.prediction.position || '?'})</span>`;

    let tagHtml;
    if (ps.tier === 'pending') tagHtml = `<span class="hit-tag none">Pending</span>`;
    else if (ps.pts > 0) tagHtml = `<span class="hit-tag">${tierLabel(ps.tier)}</span>`;
    else tagHtml = `<span class="hit-tag none">Miss</span>`;

    const ptsCls = ps.pts > 0 ? 'hit' : 'miss';

    rows.push(`
      <tr>
        <td>${ps.pick}</td>
        <td>${predStr}</td>
        <td>${madeStr}</td>
        <td>${tagHtml}</td>
        <td class="pts ${ptsCls}">${ps.pts > 0 ? '+' + ps.pts : '-'}</td>
      </tr>
    `);
  });

  // Trade predictions (if any)
  result.tradeScores.forEach((ts, i) => {
    const predStr = `${ts.prediction.fromTeam} &rarr; ${ts.prediction.toTeam}`;
    let tagHtml;
    if (ts.pts === 10) tagHtml = `<span class="hit-tag">Both teams</span>`;
    else if (ts.pts === 6) tagHtml = `<span class="hit-tag">One team</span>`;
    else tagHtml = `<span class="hit-tag none">Miss</span>`;

    const ptsCls = ts.pts > 0 ? 'hit' : 'miss';
    rows.push(`
      <tr>
        <td>T${i+1}</td>
        <td>Trade: ${predStr}</td>
        <td>${ts.detail || '-'}</td>
        <td>${tagHtml}</td>
        <td class="pts ${ptsCls}">${ts.pts > 0 ? '+' + ts.pts : '-'}</td>
      </tr>
    `);
  });

  body.innerHTML = rows.join('');
  document.getElementById('detailOverlay').classList.add('open');
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
}

function tierLabel(tier) {
  switch (tier) {
    case 'team_player':   return 'Team + Player';
    case 'player_number': return 'Player + Number';
    case 'position_team': return 'Position + Team';
    case 'player_round1': return 'Player in R1';
    case 'trade_both':    return 'Both teams';
    case 'trade_one':     return 'One team';
    default:              return 'Miss';
  }
}

// ================== BOOT ==================

async function init() {
  try {
    await loadData();
    renderTicker();
    renderStatus();
    renderOnClock();
    renderScoringCard();
    renderLeaderboard();
    renderPickGrid();
  } catch (err) {
    console.error('Init failed:', err);
    document.body.innerHTML = `<div style="padding: 4rem; font-family: monospace; color: #ff6b6b;">Failed to load data: ${err.message}</div>`;
  }
}

// Esc closes modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDetail();
});

// Auto-refresh every 60s during draft night
setInterval(async () => {
  try {
    await loadData();
    renderTicker();
    renderStatus();
    renderOnClock();
    renderLeaderboard();
    renderPickGrid();
  } catch (_) { /* ignore transient fetch errors */ }
}, 60_000);

init();
