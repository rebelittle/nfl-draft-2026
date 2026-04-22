/**
 * 2026 NFL Draft Pool — Entry Submission Form
 *
 * Workflow:
 *   1. User fills name + 32 picks (player dropdown from ESPN top 100)
 *   2. Optional: toggle TRADE on any pick, enter predicted partner team
 *   3. On submit: generate normalized JSON entry + Venmo deep link + QR code
 *   4. User downloads JSON, pays Venmo, sends JSON to admin
 *
 * No backend. Everything client-side. Admin appends JSON to data/entries.json manually.
 */

const VENMO_USER = 'Reagan333';
const ENTRY_FEE = 5;

const state = {
  players: [],
  draftOrder: [],
  allTeams: [],
  picks: {}, // { 1: { playerRank, isTrade, tradeFromTeam } }
};

// ============== LOAD ==============

async function loadData() {
  const res = await fetch(`players.json?t=${Date.now()}`);
  const data = await res.json();
  state.players = data.players;
  state.draftOrder = data.draftOrder;
  state.allTeams = data.allTeams;
}

// ============== RENDER ==============

function renderPickGrid() {
  const grid = document.getElementById('pickGrid');
  grid.innerHTML = state.draftOrder.map(slot => `
    <div class="pick-row" data-pick="${slot.pick}">
      <div class="pick-num">${String(slot.pick).padStart(2, '0')}</div>
      <div class="pick-team">${slot.team}</div>
      <div class="pick-controls">
        <select class="player-select" data-pick="${slot.pick}">
          <option value="">-- select player --</option>
          ${state.players.map(p =>
            `<option value="${p.rank}">${p.rank}. ${p.name} (${p.position}, ${p.school})</option>`
          ).join('')}
        </select>
        <button type="button" class="trade-toggle" data-pick="${slot.pick}">trade</button>
        <select class="trade-partner" data-pick="${slot.pick}">
          <option value="">trade to...</option>
          ${state.allTeams.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div class="player-meta" id="meta-${slot.pick}"></div>
    </div>
  `).join('');

  // wire up events
  grid.querySelectorAll('.player-select').forEach(sel => {
    sel.addEventListener('change', () => onPickChange(parseInt(sel.dataset.pick), sel));
  });
  grid.querySelectorAll('.trade-toggle').forEach(btn => {
    btn.addEventListener('click', () => onTradeToggle(parseInt(btn.dataset.pick), btn));
  });
  grid.querySelectorAll('.trade-partner').forEach(sel => {
    sel.addEventListener('change', () => onTradePartnerChange(parseInt(sel.dataset.pick), sel));
  });
}

function onPickChange(pickNum, selectEl) {
  const rank = selectEl.value ? parseInt(selectEl.value) : null;
  if (!rank) {
    delete state.picks[pickNum]?.playerRank;
    if (state.picks[pickNum] && !state.picks[pickNum].isTrade) delete state.picks[pickNum];
  } else {
    state.picks[pickNum] = state.picks[pickNum] || {};
    state.picks[pickNum].playerRank = rank;
  }
  updateRowDisplay(pickNum);
  updateSummary();
}

function onTradeToggle(pickNum, btn) {
  state.picks[pickNum] = state.picks[pickNum] || {};
  state.picks[pickNum].isTrade = !state.picks[pickNum].isTrade;
  if (!state.picks[pickNum].isTrade) state.picks[pickNum].tradeFromTeam = null;
  btn.classList.toggle('active', state.picks[pickNum].isTrade);
  updateRowDisplay(pickNum);
  updateSummary();
}

function onTradePartnerChange(pickNum, sel) {
  if (!state.picks[pickNum]) state.picks[pickNum] = {};
  state.picks[pickNum].tradeFromTeam = sel.value || null;
  updateSummary();
}

function updateRowDisplay(pickNum) {
  const row = document.querySelector(`.pick-row[data-pick="${pickNum}"]`);
  const meta = document.getElementById(`meta-${pickNum}`);
  const pick = state.picks[pickNum];

  row.classList.toggle('has-pick', !!(pick && pick.playerRank));
  row.classList.toggle('trade', !!(pick && pick.isTrade));

  if (pick && pick.playerRank) {
    const player = state.players.find(p => p.rank === pick.playerRank);
    meta.textContent = `Rank ${player.rank} ${player.position}`;
    if (pick.isTrade && pick.tradeFromTeam) {
      const slot = state.draftOrder.find(s => s.pick === pickNum);
      meta.textContent += ` · TRADE: ${pick.tradeFromTeam} → ${slot.team}`;
    } else if (pick.isTrade) {
      meta.textContent += ` · TRADE: needs partner team`;
    }
  } else {
    meta.textContent = '';
  }
}

function updateSummary() {
  const filled = Object.values(state.picks).filter(p => p.playerRank).length;
  const trades = Object.values(state.picks).filter(p => p.isTrade && p.tradeFromTeam).length;
  document.getElementById('filledCount').textContent = filled;
  document.getElementById('tradeCount').textContent = trades;
  document.getElementById('generateBtn').disabled =
    filled < 32 || !document.getElementById('name').value.trim();
}

document.getElementById('name').addEventListener('input', updateSummary);

// ============== GENERATE ==============

document.getElementById('generateBtn').addEventListener('click', generateEntry);

function generateEntry() {
  const name = document.getElementById('name').value.trim();
  if (!name) return;

  // Build picks array in pool format
  const picks = state.draftOrder.map(slot => {
    const pick = state.picks[slot.pick];
    if (!pick || !pick.playerRank) return null;
    const player = state.players.find(p => p.rank === pick.playerRank);
    return {
      pick: slot.pick,
      team: slot.team,
      player: player.name,
      position: player.position,
    };
  }).filter(Boolean);

  // Build trade predictions
  const tradePredictions = [];
  Object.entries(state.picks).forEach(([pickNum, pick]) => {
    if (pick.isTrade && pick.tradeFromTeam) {
      const slot = state.draftOrder.find(s => s.pick === parseInt(pickNum));
      tradePredictions.push({
        fromTeam: pick.tradeFromTeam,
        toTeam: slot.team,
        atPick: parseInt(pickNum)
      });
    }
  });

  if (picks.length !== 32) {
    alert(`You only have ${picks.length}/32 picks. Fill all 32 before generating.`);
    return;
  }

  // Validate: no duplicate players
  const playerNames = picks.map(p => p.player);
  const dupes = playerNames.filter((n, i) => playerNames.indexOf(n) !== i);
  if (dupes.length) {
    alert(`Duplicate player(s) detected: ${[...new Set(dupes)].join(', ')}. Each player can only be picked once.`);
    return;
  }

  const entry = {
    id: name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36),
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

  // Show JSON
  const jsonStr = JSON.stringify(entry, null, 2);
  document.getElementById('jsonPreview').textContent = jsonStr;

  // Download button
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

  // Venmo deep link
  const venmoNote = encodeURIComponent(`2026 NFL Draft Pool entry: ${entry.name}`);
  const venmoUrl = `https://account.venmo.com/payment-link?audience=private&amount=${ENTRY_FEE}&note=${venmoNote}&recipients=${VENMO_USER}&txn=pay`;
  document.getElementById('venmoBtn').href = venmoUrl;

  // QR code (uses qrcode.js library)
  const canvas = document.getElementById('qr-canvas');
  if (window.QRCode) {
    QRCode.toCanvas(canvas, venmoUrl, { width: 180, margin: 1, color: { dark: '#000', light: '#fff' } });
  }

  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============== INIT ==============

async function init() {
  try {
    await loadData();
    renderPickGrid();
    updateSummary();
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `<div style="padding:4rem; font-family:monospace; color:#ff6b6b;">Failed to load: ${err.message}</div>`;
  }
}
init();
