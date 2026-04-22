# 2026 NFL Draft Pool — Live Tracker

Static site for tracking a $5 mock draft pool. Entries are compared against the actual draft as it happens, using the pool's scoring rules.

**Live site:** https://rebelittle.github.io/nfl-draft-2026/

## Scoring

| Outcome | Points |
|---|--:|
| Correct Team + Player | 5 |
| Correct Player + Correct Pick Number | 4 |
| Correct Position + Correct Team | 2 |
| Correct Player in 1st Round (anywhere) | 1 |
| Correct Team Trade (one team) | 6 |
| Correct Team Trade (both teams) | 10 |

## File structure

```
index.html        Main page (dark broadcast theme)
app.js            Fetches JSON, renders UI, auto-refreshes every 60s
scoring.js        Scoring engine (pool rules, 11 unit tests pass)
data/
  scoring.json    The 6 scoring rules
  entries.json    All entrants with their 32-pick slates + trade predictions
  actual.json     The live draft results (edit this during the draft)
test-scoring.js   Node test runner for the scoring engine
```

## Draft-night workflow

1. **Before the draft:** edit `data/entries.json` to add each entrant. Follow the shape of the existing `reagan` entry.
2. **During the draft:** as each pick comes in, update `data/actual.json`:
   ```json
   { "pick": 1, "team": "LV", "player": "Fernando Mendoza", "position": "QB", "tradeFrom": null }
   ```
   If the pick was traded, set `tradeFrom` to the original team code (e.g., `"tradeFrom": "NYG"`). For trades, also append to the `trades` array:
   ```json
   { "fromTeam": "NYG", "toTeam": "JAX" }
   ```
3. **Commit + push:** the page refetches on reload, and also auto-refreshes every 60 seconds.

## GitHub Pages setup

1. Push these files to `main`.
2. Repo settings → Pages → Source: `Deploy from a branch` → Branch: `main` → Folder: `/ (root)` → Save.
3. Site goes live at `https://rebelittle.github.io/nfl-draft-2026/` within ~1 minute.

## Local testing

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Run the scoring tests:
```bash
node test-scoring.js
```
# nfl-draft-2026
