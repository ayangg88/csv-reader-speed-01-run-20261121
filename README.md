# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/ayangg88/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/ayangg88/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: `solve.js` answers every
case exactly as csv-reader does — same columns, rows and errors on broken CSV
(BOM, blank lines, stray CRs, quoted fields with doubled quotes and embedded
line breaks, junk after a closing quote, unterminated quotes, short and long
rows) — while reading with `indexOf` jumps instead of one character at a
time. The line end is tracked across a record so an unquoted field needs a
single `indexOf`, quoted fields jump to the next quote, and fields are
returned as slices instead of concatenations.

`main.ts` is the program the harness runs: it reads every case from
`/input/cases.json`, answers each with `run()` from `solve.js`, and writes
`/output/answers.json`.

## Local grade

On the kit's practice set (6 cases, ~10 MB of CSV) the entry answers 6/6
cases identically to csv-reader 1.0.0, and a 20,056-case fuzz against the
reference matches exactly. Local CPU time for `run()` on the practice set is
roughly 0.1–0.2 s warm, against ~1.2 s for the house baseline; cold
single-shot it is about 0.4 s against ~1.1 s for the baseline.

```sh
node cli/makefun.mjs grade-local --kit <kit> --bot <this repository> --driver docker
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=ye9vf8mj&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
