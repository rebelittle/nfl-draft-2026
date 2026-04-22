// Quick sanity test for scoring.js. Run: node test-scoring.js
// Verifies each scoring tier fires correctly.

// Stub the module for Node (scoring.js uses an IIFE returning a global)
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('./scoring.js', 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const ScoringEngine = sandbox.ScoringEngine;

let passed = 0, failed = 0;
function assert(name, cond, detail) {
  if (cond) { console.log(`  PASS  ${name}`); passed++; }
  else { console.log(`  FAIL  ${name}  -- ${detail || ''}`); failed++; }
}

// ---------- FIXTURES ----------

const actuals = {
  picks: [
    { pick: 1, team: 'TEN', player: 'Arch Manning',   position: 'QB',   tradeFrom: null },
    { pick: 2, team: 'CLE', player: 'Drew Allar',     position: 'QB',   tradeFrom: null },
    { pick: 3, team: 'JAX', player: 'Caleb Downs',    position: 'S',    tradeFrom: 'NYG' }, // pick was traded
    { pick: 4, team: 'NE',  player: 'Ryan Williams',  position: 'WR',   tradeFrom: null },
    { pick: 5, team: 'LV',  player: 'Spencer Fano',   position: 'OT',   tradeFrom: null },
    // picks 6-32 not yet made
    ...Array.from({ length: 27 }, (_, i) => ({
      pick: i + 6, team: null, player: null, position: null, tradeFrom: null
    }))
  ],
  trades: [
    { fromTeam: 'NYG', toTeam: 'JAX', picksSent: [3], picksReceived: [10, 45] }
  ]
};

// ---------- TEST 1: tier 1, exact hit ----------
const t1 = ScoringEngine.scorePick(
  { pick: 1, team: 'TEN', player: 'Arch Manning', position: 'QB' },
  actuals
);
assert('Tier 1 (5pt): exact hit', t1.pts === 5 && t1.tier === 'team_player', JSON.stringify(t1));

// ---------- TEST 2: tier 2, player right + pick number right, team wrong (traded) ----------
const t2 = ScoringEngine.scorePick(
  { pick: 3, team: 'NYG', player: 'Caleb Downs', position: 'S' },
  actuals
);
assert('Tier 2 (4pt): player + number, team traded', t2.pts === 4 && t2.tier === 'player_number', JSON.stringify(t2));

// ---------- TEST 3: tier 3, position + team right, player wrong ----------
const t3 = ScoringEngine.scorePick(
  { pick: 2, team: 'CLE', player: 'DJ Lagway', position: 'QB' },
  actuals
);
assert('Tier 3 (2pt): position + team', t3.pts === 2 && t3.tier === 'position_team', JSON.stringify(t3));

// ---------- TEST 4: tier 4, predicted player taken elsewhere in R1 ----------
const t4 = ScoringEngine.scorePick(
  { pick: 2, team: 'CAR', player: 'Arch Manning', position: 'QB' }, // wrong team, wrong pick, but player went at pick 1
  actuals
);
assert('Tier 4 (1pt): player in round 1 only', t4.pts === 1 && t4.tier === 'player_round1', JSON.stringify(t4));

// ---------- TEST 5: pending, slot not made and player not yet drafted ----------
const t5 = ScoringEngine.scorePick(
  { pick: 10, team: 'CHI', player: 'Jeremiah Smith', position: 'WR' },
  actuals
);
assert('Pending: slot unmade', t5.pts === 0 && t5.tier === 'pending', JSON.stringify(t5));

// ---------- TEST 6: confirmed miss ----------
// All picks made = no opportunity for the 1-pt tier anywhere else.
const actualsAllMade = {
  picks: Array.from({ length: 32 }, (_, i) => ({
    pick: i + 1, team: `T${i+1}`, player: `Player${i+1}`, position: 'X'
  })),
  trades: []
};
const t6 = ScoringEngine.scorePick(
  { pick: 1, team: 'WRONG', player: 'Nobody', position: 'ZZ' },
  actualsAllMade
);
assert('Confirmed miss: nothing matches', t6.pts === 0 && t6.tier === 'none', JSON.stringify(t6));

// ---------- TEST 7: trade prediction, both teams correct ----------
const tradeBoth = ScoringEngine.scoreTrades(
  [{ fromTeam: 'NYG', toTeam: 'JAX' }],
  actuals
);
assert('Trade (10pt): both teams', tradeBoth[0].pts === 10, JSON.stringify(tradeBoth));

// ---------- TEST 8: trade prediction, one team correct ----------
const tradeOne = ScoringEngine.scoreTrades(
  [{ fromTeam: 'NYG', toTeam: 'CLE' }],  // from correct, to wrong
  actuals
);
assert('Trade (6pt): one team', tradeOne[0].pts === 6, JSON.stringify(tradeOne));

// ---------- TEST 9: trade prediction, both wrong ----------
const tradeNone = ScoringEngine.scoreTrades(
  [{ fromTeam: 'BUF', toTeam: 'KC' }],
  actuals
);
assert('Trade miss: neither team', tradeNone[0].pts === 0, JSON.stringify(tradeNone));

// ---------- TEST 10: highest-tier precedence (team+player beats pos+team) ----------
const t10 = ScoringEngine.scorePick(
  { pick: 1, team: 'TEN', player: 'Arch Manning', position: 'QB' },
  actuals
);
assert('Precedence: tier 1 wins over tier 3', t10.tier === 'team_player', JSON.stringify(t10));

// ---------- TEST 11: full entry total ----------
const entry = {
  id: 'test',
  name: 'Test',
  picks: [
    { pick: 1, team: 'TEN', player: 'Arch Manning',  position: 'QB' }, // 5
    { pick: 2, team: 'CLE', player: 'DJ Lagway',     position: 'QB' }, // 2
    { pick: 3, team: 'NYG', player: 'Caleb Downs',   position: 'S' },  // 4
    { pick: 4, team: 'NE',  player: 'Ryan Williams', position: 'WR' }  // 5
  ],
  tradePredictions: [
    { fromTeam: 'NYG', toTeam: 'JAX' } // 10
  ]
};
const full = ScoringEngine.scoreEntry(entry, actuals);
assert('Full entry: expected total', full.total === 5 + 2 + 4 + 5 + 10, `got ${full.total}`);

// ---------- SUMMARY ----------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
