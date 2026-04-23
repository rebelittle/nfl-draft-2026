/**
 * 2026 NFL Draft Pool — Entry Submission Form
 * No backend. Generates JSON + Venmo deep link client-side.
 */

const VENMO_USER = 'Reagan333';
const ENTRY_FEE = 5;

const state = {
  players: [],
  draftOrder: [],
  allTeams: [],
  picks: {},   // { pickNum: playerRank }
  trades: []   // [{ fromTeam, toTeam, atPick }]
};

async function loadData() {
  const res = await fetch(`players.json?t=${Date.now()}`);
  const data = await res.json();
  state.players = data.players;
  state.draftOrder = data.draftOrder;
  state.allTeams = data.allTeams;
}

// ============== PICKS ==============

function renderPickGrid() {
  const grid = document.getElementById('pickGrid');
  grid.innerHTML = state.draftOrder.map(slot => `
    <div class="pick-row" data-pick="${slot.pick}">
      <div class="pick-num">${String(slot.pick).padStart(2, '0')}</div>
      <div class="pick-team">${slot.team}</div>
      <select class="player-select" data-pick="${slot.pick}">
        <option value="">-- select player --</option>
        ${state.players.map(p =>
          `<option value="${p.rank}">${p.rank}. ${p.name} (${p.position}, ${p.school})</option>`
        ).join('')}
      </select>
      <div class="player-meta" id="meta-${slot.pick}"></div>
    </div>
  `).join('');

  grid.querySelectorAll('.player-select').forEach(sel => {
    sel.addEventListener('change', () => onPickChange(parseInt(sel.dataset.pick), sel));
  });
}

function onPickChange(pickNum, selectEl) {
  const rank = selectEl.value ? parseInt(selectEl.value) : null;
  if (!rank) {
    delete state.picks[pickNum];
  } else {
    state.picks[pickNum] = rank;
  }
  updateRowDisplay(pickNum);
  updateSummary();
}

function updateRowDisplay(pickNum) {
  const row = document.querySelector(`.pick-row[data-pick="${pickNum}"]`);
  const meta = document.getElementById(`meta-${pickNum}`);
  const rank = state.picks[pickNum];
  row.classList.toggle('has-pick', !!rank);
  if (rank) {
    const player = state.players.find(p => p.rank === rank);
    meta.textContent = `Rank ${player.rank} · ${player.position} · ${player.school}`;
  } else {
    meta.textContent = '';
  }
}

// ============== TRADES ==============

document.getElementById('addTradeBtn').addEventListener('click', addTrade);

function addTrade() {
  state.trades.push({ fromTeam: '', toTeam: '', atPick: '' });
  renderTrades();
  updateSummary();
}

function removeTrade(idx) {
  state.trades.splice(idx, 1);
  renderTrades();
  updateSummary();
}

function updateTrade(idx, field, value) {
  state.trades[idx][field] = field === 'atPick' ? (value ? parseInt(value) : '') : value;
  updateSummary();
}

function renderTrades() {
  const list = document.getElementById('tradesList');
  if (!state.trades.length) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = state.trades.map((t, i) => `
    <div class="trade-row">
      <span class="trade-label">From</span>
      <select onchange="updateTrade(${i}, 'fromTeam', this.value)">
        <option value="">team...</option>
        ${state.allTeams.map(team =>
          `<option value="${team}" ${t.fromTeam === team ? 'selected' : ''}>${team}</option>`
        ).join('')}
      </select>
      <span class="arrow">&rarr;</span>
      <select onchange="updateTrade(${i}, 'toTeam', this.value)">
        <option value="">team...</option>
        ${state.allTeams.map(team =>
          `<option value="${team}" ${t.toTeam === team ? 'selected' : ''}>${team}</option>`
        ).join('')}
      </select>
      <input type="number" class="pick-input" min="1" max="32"
             placeholder="pick #" value="${t.atPick}"
             onchange="updateTrade(${i}, 'atPick', this.value)" />
      <button type="button" class="remove-btn" onclick="removeTrade(${i})">&times;</button>
    </div>
  `).join('');
}

// expose for inline handlers
window.updateTrade = updateTrade;
window.removeTrade = removeTrade;

// ============== SUMMARY ==============

function updateSummary() {
  const filled = Object.keys(state.picks).length;
  const validTrades = state.trades.filter(t => t.fromTeam && t.toTeam && t.atPick).length;
  document.getElementById('filledCount').textContent = filled;
  document.getElementById('tradeCount').textContent = validTrades;
  document.getElementById('generateBtn').disabled =
    filled < 32 || !document.getElementById('name').value.trim();
}

document.getElementById('name').addEventListener('input', updateSummary);

// ============== GENERATE ==============

document.getElementById('generateBtn').addEventListener('click', generateEntry);

function generateEntry() {
  const name = document.getElementById('name').value.trim();
  if (!name) return;

  const picks = state.draftOrder.map(slot => {
    const rank = state.picks[slot.pick];
    if (!rank) return null;
    const player = state.players.find(p => p.rank === rank);
    return {
      pick: slot.pick,
      team: slot.team,
      player: player.name,
      position: player.position,
    };
  }).filter(Boolean);

  if (picks.length !== 32) {
    alert(`You only have ${picks.length}/32 picks. Fill all 32 before generating.`);
    return;
  }

  const playerNames = picks.map(p => p.player);
  const dupes = playerNames.filter((n, i) => playerNames.indexOf(n) !== i);
  if (dupes.length) {
    alert(`Duplicate player(s): ${[...new Set(dupes)].join(', ')}. Each player can only be picked once.`);
    return;
  }

  const tradePredictions = state.trades
    .filter(t => t.fromTeam && t.toTeam && t.atPick)
    .map(t => ({
      fromTeam: t.fromTeam,
      toTeam: t.toTeam,
      atPick: t.atPick
    }));

  // Apply trade-shifted team ownership to picks (matches Cam-style scoring)
  tradePredictions.forEach(t => {
    const pick = picks.find(p => p.pick === t.atPick);
    if (pick) pick.team = t.toTeam;
  });

  const entry = {
    id: name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
        + '-' + Date.now().toString(36),
    name,
    submittedAt: new Date().toISOString(),
    picks,
    tradePredictions
  };

  showResult(entry);
}

function showResult(entry) {
  const panel = document.getElementById('resultPanel');
  panel.classList.add('show');

  const jsonStr = JSON.stringify(entry, null, 2);
  document.getElementById('jsonPreview').textContent = jsonStr;

  document.getElementById('downloadBtn').onclick = () => {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `entry-${entry.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const mailtoBody = encodeURIComponent(
    `New 2026 NFL Draft Pool entry from ${entry.name}\n\n` +
    `--- JSON (copy everything between the lines into entries.json) ---\n\n` +
    jsonStr +
    `\n\n--- end ---\n\n` +
    `Venmo sent? [ ] yes  [ ] no\n` +
    `Notes:\n`
  );
  const mailtoSubject = encodeURIComponent(`NFL Draft Pool Entry: ${entry.name}`);
  document.getElementById('emailBtn').href =
    `mailto:reaganlittle05@gmail.com?subject=${mailtoSubject}&body=${mailtoBody}`;

  const venmoNote = encodeURIComponent(`2026 NFL Draft Pool entry: ${entry.name}`);
  const venmoUrl = `https://account.venmo.com/payment-link?audience=private&amount=${ENTRY_FEE}&note=${venmoNote}&recipients=${VENMO_USER}&txn=pay`;
  document.getElementById('venmoBtn').href = venmoUrl;

  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============== INIT ==============

async function init() {
  try {
    await loadData();
    renderPickGrid();
    renderTrades();
    updateSummary();
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `<div style="padding:4rem; font-family:monospace; color:#ff6b6b;">Failed to load: ${err.message}</div>`;
  }
}
init();
