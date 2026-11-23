# Token Launch Radar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/alyssaxacexdaemon-bot/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/alyssaxacexdaemon-bot/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A dashboard that ranks pre-token protocols by what their token would be worth,
with a farm plan for each one. Built for the make.fun token launch radar bounty.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot
at `/input/snapshot.json` — 758 protocols as of 2026-11-14 — and writes:

- `board.json`: 200 ranked rows (the 40-protocol watchlist plus 160 early rows
  the model rates highest), each with an implied token value and a farm plan.
- `data.js`: the dashboard's data, beside the page.
- `dashboard/`: the page itself — sortable and filterable board, a detail view
  for every protocol, the live tokens on their own tab, and the model stated
  plainly.
- `screenshots/`: the board, a detail view and a filtered view.
- `dossier.json`: built with `buildDossier` from `vendor/makefun-board.ts`.

## The value model (radar-3)

Implied value = TVL × category multiple × growth × maturity.

- **Category multiple:** the median market-cap-to-TVL ratio of the category's
  protocols that already have a token, when at least four of them do — shrunk
  toward the market-wide median (0.169×) with four pseudo-observations. Fewer
  than four takes the market median. The multiples are computed from the
  snapshot at run time, never baked in.
- **Growth:** the seven-day TVL change, clamped to −60%…+120%, weighted one half.
- **Maturity:** how long the protocol has run with no token, 0.6 at listing
  rising to 1.0 at three years.
- **Chains:** tested on the snapshot and cut — multi-chain protocols do not
  trade at a premium (correlation −0.02), so the multiplier is 1.00 for every row.

The same function scores every row; no protocol is special-cased by name.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Two runs write byte-identical bytes.
