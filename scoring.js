/**
 * Scoring engine for the 2026 NFL Draft Pool.
 *
 * Scoring tiers (highest wins per prediction, mutually exclusive per pick):
 *   5 pts  Correct Team + Correct Player (exact hit)
 *   4 pts  Correct Player + Correct Pick Number (pick was traded, player still right)
 *   2 pts  Correct Position + Correct Team
 *   1 pt   Correct Player anywhere in Round 1
 *
 * Trade predictions (separate bucket, not tied to a pick slot):
 *   6 pts  One team correct (either sender OR receiver matches)
 *   10 pts Both teams correct
 */

const ScoringEngine = (function () {

  function norm(s) {
    return (s || '').toString().trim().toUpperCase();
  }

  function isPickMade(actualPick) {
    return actualPick && actualPick.team && actualPick.player;
  }

  /**
   * Score a single pick prediction against the full actuals.
   * Returns { pts, tier, detail } where tier is one of:
   *   'team_player' (5), 'player_number' (4), 'position_team' (2),
   *   'player_round1' (1), 'none' (0), 'pending' (null)
   */
  function scorePick(prediction, actuals) {
    const pickNum = prediction.pick;
    const predTeam = norm(prediction.team);
    const predPlayer = norm(prediction.player);
    const predPos = norm(prediction.position);

    const actualAtSlot = actuals.picks.find(p => p.pick === pickNum);

    // If this slot's pick has been made, evaluate against it for team/position/player-at-this-slot tiers
    const slotMade = isPickMade(actualAtSlot);

    // Has the predicted player been drafted anywhere in round 1 yet?
    const playerPickInR1 = actuals.picks.find(p =>
      isPickMade(p) && norm(p.player) === predPlayer
    );

    // Tier 1: Correct Team + Player (5 pts) - requires slot made, both match
    if (slotMade) {
      if (norm(actualAtSlot.team) === predTeam && norm(actualAtSlot.player) === predPlayer) {
        return {
          pts: 5,
          tier: 'team_player',
          detail: `Exact hit: ${actualAtSlot.team} took ${actualAtSlot.player}`
        };
      }
    }

    // Tier 2: Correct Player + Correct Pick Number (4 pts)
    // Player was taken at this exact pick number, but the team was different (pick was traded)
    if (slotMade) {
      if (norm(actualAtSlot.player) === predPlayer && norm(actualAtSlot.team) !== predTeam) {
        return {
          pts: 4,
          tier: 'player_number',
          detail: `Right player, traded pick: ${actualAtSlot.team} took ${actualAtSlot.player} at ${pickNum}`
        };
      }
    }

    // Tier 3: Correct Position + Correct Team (2 pts)
    if (slotMade) {
      if (norm(actualAtSlot.team) === predTeam && norm(actualAtSlot.position) === predPos && predPos !== '') {
        return {
          pts: 2,
          tier: 'position_team',
          detail: `Right team, right position: ${actualAtSlot.team} took ${actualAtSlot.position}`
        };
      }
    }

    // Tier 4: Correct Player in Round 1 (1 pt)
    // Only applies if the slot is either made OR if the player is already taken elsewhere in R1
    if (playerPickInR1) {
      return {
        pts: 1,
        tier: 'player_round1',
        detail: `${predPlayer} went at pick ${playerPickInR1.pick}`
      };
    }

    // Determine pending vs miss:
    // If the slot is not yet made AND the predicted player has not been drafted yet, it's still pending.
    if (!slotMade) {
      // Also check if the player has already gone in R1 (would have hit tier 4 above, so no).
      // Player could still be drafted later in R1 for the 1-pt hit, so pending.
      return { pts: 0, tier: 'pending', detail: null };
    }

    // Slot made, player not yet taken but could still be taken later in R1 for 1 pt
    // Any pick later than the current slot that hasn't been made yet means player can still score the 1-pt tier.
    const anyRemaining = actuals.picks.some(p => !isPickMade(p) && p.pick > pickNum);
    if (anyRemaining) {
      return { pts: 0, tier: 'pending', detail: 'Player still eligible for 1-pt (remaining picks)' };
    }

    // Slot made, player never drafted in R1: confirmed miss
    return { pts: 0, tier: 'none', detail: 'No match' };
  }

  /**
   * Score trade predictions. Each entry has tradePredictions: [{fromTeam, toTeam, pickRange?}]
   * For each predicted trade, check if it appears in actuals.trades.
   */
  function scoreTrades(tradePredictions, actuals) {
    const results = [];
    const actualTrades = actuals.trades || [];

    (tradePredictions || []).forEach(tp => {
      const predFrom = norm(tp.fromTeam);
      const predTo = norm(tp.toTeam);

      let bestMatch = { pts: 0, tier: 'none', detail: 'No matching trade' };

      actualTrades.forEach(at => {
        const actFrom = norm(at.fromTeam);
        const actTo = norm(at.toTeam);
        if (actFrom === predFrom && actTo === predTo) {
          if (bestMatch.pts < 10) bestMatch = { pts: 10, tier: 'trade_both', detail: `${actFrom} traded to ${actTo}` };
        } else if (actFrom === predFrom || actTo === predTo || actFrom === predTo || actTo === predFrom) {
          if (bestMatch.pts < 6) bestMatch = { pts: 6, tier: 'trade_one', detail: 'One team correct' };
        }
      });

      results.push({ prediction: tp, ...bestMatch });
    });

    return results;
  }

  /**
   * Score an entire entry: returns per-pick scores + trade scores + totals.
   */
  function scoreEntry(entry, actuals) {
    const pickScores = entry.picks.map(p => ({
      pick: p.pick,
      prediction: p,
      ...scorePick(p, actuals)
    }));

    const tradeScores = scoreTrades(entry.tradePredictions, actuals);

    const total = pickScores.reduce((s, r) => s + r.pts, 0)
                + tradeScores.reduce((s, r) => s + r.pts, 0);

    const correctTeams = pickScores.filter(r =>
      r.tier === 'team_player' || r.tier === 'position_team'
    ).length;
    const correctPlayers = pickScores.filter(r =>
      r.tier === 'team_player' || r.tier === 'player_number' || r.tier === 'player_round1'
    ).length;
    const hits = pickScores.filter(r => r.pts > 0).length
               + tradeScores.filter(r => r.pts > 0).length;

    return {
      entry,
      pickScores,
      tradeScores,
      total,
      hits,
      correctTeams,
      correctPlayers
    };
  }

  function scoreAll(entries, actuals) {
    return entries.map(e => scoreEntry(e, actuals))
                  .sort((a, b) => b.total - a.total || b.hits - a.hits);
  }

  return { scorePick, scoreTrades, scoreEntry, scoreAll, isPickMade };
})();

// Expose for both browser (window) and Node (vm sandbox / globalThis)
if (typeof globalThis !== 'undefined') globalThis.ScoringEngine = ScoringEngine;
if (typeof module !== 'undefined' && module.exports) module.exports = ScoringEngine;
