# Couple Fitness Streak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-page shared streak tracker for Wen Jing and Javen. It shows a personal streak for each of them, a couple streak, and weekly freezes, and it's published as a private Claude Artifact backed by a shared database.

**Architecture:** All streak logic lives in a plain-JS module (`src/streak.js`) with no DOM or database access, so it's unit-tested with `node --test`. The page (`index.html`) loads that module, subscribes to the `checkins` collection through the Artifact `db` capability, and recalculates everything from the raw check-ins on every render.

**Tech Stack:** Vanilla HTML/CSS/JS, Node 26 built-in test runner (`node:test`), Claude Artifact `db` capability, and Google Fonts (Big Shoulders Display, Instrument Sans).

**Spec:** `docs/superpowers/specs/2026-10-12-couple-streak-design.md`

## Global Constraints

- People are fixed: ids `wenjing` and `javen`, shown as "Wen Jing" and "Javen".
- Dates are local calendar dates as `YYYY-MM-DD` strings. Date arithmetic uses UTC day numbers, never local clocks, so daylight-saving changes can't shift a day.
- Weeks run Monday–Sunday. Each person gets one freeze per week, assigned to the earliest missed day of that week.
- Today is never `missed` or `frozen`. It's either `done` or `pending`.
- Frozen days keep a streak alive but don't add to the count.
- The challenge start is the earliest valid check-in by either person.
- Each check-in is stored as doc `checkins/<person>_<date>` with body `{ person, date, at }`.
- No streak numbers are stored. They're always calculated from the check-ins.
- The page must follow the Artifact contract: no `<html>/<head>/<body>` tags, `<title>` first, colour tokens on `:root` with dark-mode overrides, an explicit body background, `localStorage` wrapped in try/catch, and a 16px side gutter.

## Review Focus

1. **Junk or duplicate data in the shared store:** rows with an unknown person, malformed date, future date or duplicate date must be ignored or deduplicated, not crash the page or inflate a streak. Tested in Task 1.
2. **Daylight-saving weekends:** `addDays` across 2026-03-29 and 2026-11-01 must land on the next calendar date. Tested in Task 1.
3. **Page left open past midnight:** "today" must roll over without a reload. `localToday` uses the local clock and the page re-renders every minute. The pure part is tested in Task 1, and the UI wiring is checked in Task 3.
4. **Javen opens the page without write access:** tapping must show a clear "ask for Contributor access" message, not fail silently. Handled in Task 3.
5. **Double taps or two devices:** tapping twice, or checking in on two phones, must still give one check-in. Covered by the deterministic doc id (Task 3) and the deduplication test (Task 1).

---

### Task 1: Date helpers and personal streaks

**Files:**
- Create: `src/streak.js`
- Test: `test/streak.test.js`

**Interfaces:**
- Produces (on `module.exports` in Node, `window.Streak` in the browser):
  - `addDays(date: string, k: number): string`
  - `weekStart(date: string): string` returns the Monday of that week
  - `localToday(now?: Date): string`
  - `computeAll(checkins: {person, date}[], today: string): { start: string|null, people: { wenjing: Person, javen: Person }, couple: { streak: number, days: Map<string,Status> } }`
  - `Person = { streak: number, doneToday: boolean, freezesLeft: 0|1, days: Map<string, Status> }`
  - `Status = "done" | "frozen" | "missed" | "pending"`

- [ ] **Step 1: Write the failing tests**

`test/streak.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../src/streak.js");

// 2026-10-05 is a Monday; 2026-10-12 is the next Monday.
const ci = (person, ...dates) => dates.map((date) => ({ person, date }));

test("addDays crosses month ends and DST weekends", () => {
  assert.equal(S.addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(S.addDays("2026-11-01", 1), "2026-11-02");
  assert.equal(S.addDays("2026-03-29", 1), "2026-03-30");
  assert.equal(S.addDays("2026-01-01", -1), "2025-12-31");
});

test("weekStart returns the Monday", () => {
  assert.equal(S.weekStart("2026-10-05"), "2026-10-05");
  assert.equal(S.weekStart("2026-10-11"), "2026-10-05");
  assert.equal(S.weekStart("2026-10-12"), "2026-10-12");
});

test("localToday formats the local date", () => {
  assert.equal(S.localToday(new Date(2026, 9, 12, 23, 59)), "2026-10-12");
  assert.equal(S.localToday(new Date(2026, 0, 3, 0, 1)), "2026-01-03");
});

test("empty history", () => {
  const r = S.computeAll([], "2026-10-12");
  assert.equal(r.start, null);
  assert.equal(r.people.wenjing.streak, 0);
  assert.equal(r.people.wenjing.doneToday, false);
  assert.equal(r.people.wenjing.freezesLeft, 1);
  assert.equal(r.people.wenjing.days.get("2026-10-12"), "pending");
  assert.equal(r.couple.streak, 0);
});

test("today pending does not break the streak", () => {
  const r = S.computeAll(ci("wenjing", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"), "2026-10-10");
  assert.equal(r.people.wenjing.streak, 5);
  assert.equal(r.people.wenjing.doneToday, false);
  assert.equal(r.people.wenjing.days.get("2026-10-10"), "pending");
});

test("checking in today adds one", () => {
  const r = S.computeAll(ci("wenjing", "2026-10-09", "2026-10-10"), "2026-10-10");
  assert.equal(r.people.wenjing.streak, 2);
  assert.equal(r.people.wenjing.doneToday, true);
});

test("a mid-week miss is frozen and keeps the streak", () => {
  const r = S.computeAll(ci("wenjing", "2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"), "2026-10-10");
  assert.equal(r.people.wenjing.days.get("2026-10-07"), "frozen");
  assert.equal(r.people.wenjing.streak, 4);
  assert.equal(r.people.wenjing.freezesLeft, 0);
});

test("a second miss in the same week breaks the streak", () => {
  const r = S.computeAll(ci("wenjing", "2026-10-05", "2026-10-06", "2026-10-08", "2026-10-10"), "2026-10-10");
  assert.equal(r.people.wenjing.days.get("2026-10-07"), "frozen");
  assert.equal(r.people.wenjing.days.get("2026-10-09"), "missed");
  assert.equal(r.people.wenjing.streak, 1);
});

test("freeze resets on Monday", () => {
  // Miss Sat 10th (frozen, week 1) and Mon 12th (frozen, week 2).
  const r = S.computeAll(
    ci("wenjing", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-11", "2026-10-13"),
    "2026-10-13",
  );
  assert.equal(r.people.wenjing.days.get("2026-10-10"), "frozen");
  assert.equal(r.people.wenjing.days.get("2026-10-12"), "frozen");
  assert.equal(r.people.wenjing.streak, 7);
  assert.equal(r.people.wenjing.freezesLeft, 0);
});

test("missing Sat and Sun breaks on Sunday", () => {
  const r = S.computeAll(ci("wenjing", "2026-10-09", "2026-10-12"), "2026-10-12");
  assert.equal(r.people.wenjing.days.get("2026-10-10"), "frozen");
  assert.equal(r.people.wenjing.days.get("2026-10-11"), "missed");
  assert.equal(r.people.wenjing.streak, 1);
  assert.equal(r.people.wenjing.freezesLeft, 1);
});

test("challenge starts at the first check-in by either person", () => {
  const r = S.computeAll(ci("javen", "2026-10-08", "2026-10-09"), "2026-10-10");
  assert.equal(r.start, "2026-10-08");
  assert.equal(r.people.javen.days.has("2026-10-07"), false);
  assert.equal(r.people.wenjing.days.get("2026-10-08"), "frozen");
  assert.equal(r.people.wenjing.days.get("2026-10-09"), "missed");
  assert.equal(r.people.wenjing.streak, 0);
  assert.equal(r.people.javen.streak, 2);
});

test("junk rows are ignored and duplicates count once", () => {
  const rows = [
    { person: "wenjing", date: "2026-10-09" },
    { person: "wenjing", date: "2026-10-09" },
    { person: "someone", date: "2026-10-08" },
    { person: "javen", date: "not-a-date" },
    { person: "javen", date: "2026-10-30" },
    null,
    { date: "2026-10-01" },
  ];
  const r = S.computeAll(rows, "2026-10-10");
  assert.equal(r.start, "2026-10-09");
  assert.equal(r.people.wenjing.streak, 1);
  assert.equal(r.people.javen.streak, 0);
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `node --test test/`
Expected: FAIL with `Cannot find module '../src/streak.js'`

- [ ] **Step 3: Write the implementation**

`src/streak.js`:

```js
// Pure streak logic for the couple fitness streak. No DOM, no storage.
(function (root) {
  const PEOPLE = ["wenjing", "javen"];
  const DAY_MS = 86400000;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function toNum(date) {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / DAY_MS;
  }
  function toDate(n) {
    return new Date(n * DAY_MS).toISOString().slice(0, 10);
  }
  function addDays(date, k) {
    return toDate(toNum(date) + k);
  }
  function weekStart(date) {
    const n = toNum(date);
    const mondayIndex = (new Date(n * DAY_MS).getUTCDay() + 6) % 7;
    return toDate(n - mondayIndex);
  }
  function localToday(now = new Date()) {
    const pad = (x) => String(x).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function isValid(c, today) {
    return !!c && PEOPLE.includes(c.person) && typeof c.date === "string" &&
      DATE_RE.test(c.date) && c.date <= today;
  }

  // Status of every day from start to today for one person.
  function personDays(doneDates, start, today) {
    const days = new Map();
    if (start) {
      const usedWeeks = new Set();
      for (let d = start; d < today; d = addDays(d, 1)) {
        if (doneDates.has(d)) { days.set(d, "done"); continue; }
        const w = weekStart(d);
        if (usedWeeks.has(w)) { days.set(d, "missed"); continue; }
        usedWeeks.add(w);
        days.set(d, "frozen");
      }
    }
    days.set(today, doneDates.has(today) ? "done" : "pending");
    return days;
  }

  // Count done days walking back from today; frozen days are skipped, missed stops.
  function streakFrom(days, today) {
    let count = days.get(today) === "done" ? 1 : 0;
    for (let d = addDays(today, -1); days.has(d); d = addDays(d, -1)) {
      const s = days.get(d);
      if (s === "missed") break;
      if (s === "done") count++;
    }
    return count;
  }

  function freezesLeft(days, today) {
    for (let d = weekStart(today); d < today; d = addDays(d, 1)) {
      if (days.get(d) === "frozen") return 0;
    }
    return 1;
  }

  function computeAll(checkins, today) {
    const clean = (checkins || []).filter((c) => isValid(c, today));
    let start = null;
    for (const c of clean) if (!start || c.date < start) start = c.date;

    const people = {};
    for (const p of PEOPLE) {
      const done = new Set(clean.filter((c) => c.person === p).map((c) => c.date));
      const days = personDays(done, start, today);
      people[p] = {
        days,
        streak: streakFrom(days, today),
        doneToday: done.has(today),
        freezesLeft: freezesLeft(days, today),
      };
    }
    return { start, people, couple: coupleOf(people, today) };
  }

  function coupleOf(people, today) {
    return { streak: 0, days: new Map() }; // replaced in Task 2
  }

  const api = { PEOPLE, addDays, weekStart, localToday, computeAll };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Streak = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
```

- [ ] **Step 4: Run the tests to check they pass**

Run: `node --test test/`
Expected: all tests PASS. The "empty history" test only checks `couple.streak === 0`, which the stub returns.

- [ ] **Step 5: Commit**

```bash
git add src/streak.js test/streak.test.js
git commit -m "feat: personal streak logic with weekly freezes"
```

---

### Task 2: Couple streak and history grid

**Files:**
- Modify: `src/streak.js` (replace the `coupleOf` stub, add `gridDates`, export it)
- Test: `test/streak.test.js` (append)

**Interfaces:**
- Consumes: `addDays`, `weekStart`, `streakFrom` and `computeAll` from Task 1.
- Produces:
  - `computeAll(...).couple = { streak: number, days: Map<string, Status> }`
  - `gridDates(today: string, weeks: number): string[]` returns `7*weeks` dates from a Monday to the Sunday of today's week.

- [ ] **Step 1: Write the failing tests** (append to `test/streak.test.js`)

```js
test("couple streak breaks when only one person misses", () => {
  const rows = [
    ...ci("wenjing", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"),
    ...ci("javen", "2026-10-05", "2026-10-06", "2026-10-09"),
  ];
  const r = S.computeAll(rows, "2026-10-10");
  assert.equal(r.people.javen.days.get("2026-10-07"), "frozen");
  assert.equal(r.people.javen.days.get("2026-10-08"), "missed");
  assert.equal(r.couple.days.get("2026-10-08"), "missed");
  assert.equal(r.couple.streak, 1);
  assert.equal(r.people.wenjing.streak, 5);
  assert.equal(r.people.javen.streak, 1);
});

test("a freeze keeps the couple streak alive without counting", () => {
  const rows = [
    ...ci("wenjing", "2026-10-05", "2026-10-06", "2026-10-07"),
    ...ci("javen", "2026-10-05", "2026-10-06"),
  ];
  const r = S.computeAll(rows, "2026-10-08");
  assert.equal(r.couple.days.get("2026-10-07"), "frozen");
  assert.equal(r.couple.days.get("2026-10-08"), "pending");
  assert.equal(r.couple.streak, 2);
});

test("couple today counts only when both are done", () => {
  const one = S.computeAll(ci("wenjing", "2026-10-12"), "2026-10-12");
  assert.equal(one.couple.days.get("2026-10-12"), "pending");
  assert.equal(one.couple.streak, 0);
  const both = S.computeAll([...ci("wenjing", "2026-10-12"), ...ci("javen", "2026-10-12")], "2026-10-12");
  assert.equal(both.couple.days.get("2026-10-12"), "done");
  assert.equal(both.couple.streak, 1);
});

test("gridDates covers whole weeks ending on today's Sunday", () => {
  const g = S.gridDates("2026-10-13", 5);
  assert.equal(g.length, 35);
  assert.equal(g[0], "2026-09-14");
  assert.equal(g[34], "2026-10-18");
  assert.ok(g.includes("2026-10-13"));
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `node --test test/`
Expected: FAIL. The couple assertions get `undefined`, and `S.gridDates is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/streak.js`, replace the `coupleOf` stub with:

```js
  function coupleOf(people, today) {
    const a = people.wenjing.days;
    const b = people.javen.days;
    const ok = (s) => s === "done" || s === "frozen";
    const days = new Map();
    for (const [d, sa] of a) {
      const sb = b.get(d);
      if (d === today) days.set(d, sa === "done" && sb === "done" ? "done" : "pending");
      else if (!ok(sa) || !ok(sb)) days.set(d, "missed");
      else days.set(d, sa === "done" && sb === "done" ? "done" : "frozen");
    }
    return { days, streak: streakFrom(days, today) };
  }

  function gridDates(today, weeks) {
    const first = addDays(weekStart(today), -7 * (weeks - 1));
    return Array.from({ length: 7 * weeks }, (_, i) => addDays(first, i));
  }
```

Then change the export line to:

```js
  const api = { PEOPLE, addDays, weekStart, localToday, computeAll, gridDates };
```

- [ ] **Step 4: Run the tests to check they pass**

Run: `node --test test/`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/streak.js test/streak.test.js
git commit -m "feat: couple streak and history grid dates"
```

---

### Task 3: Page, publish and verify

**Files:**
- Create: `index.html`
- Publish: `index.html` as the Artifact page, with `src/streak.js` published at `streak.js`

**Interfaces:**
- Consumes: `window.Streak.{PEOPLE, localToday, computeAll, gridDates}` from Tasks 1–2, and `claude.use("db")` from the Artifact runtime: `db.collection("checkins").onSnapshot(next, error)` and `doc(id).set(body)` / `.delete()`. Errors are `{code}`.
- Produces: the published Artifact URL.

- [ ] **Step 1: Write `index.html`**

```html
<title>Wen Jing &amp; Javen's Streak</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;900&family=Instrument+Sans:wght@400;500;600&display=swap">
<style>
/* Layout: scoreboard number on top, the check-in button, then two running lanes (one per person), each with its own 5-week log */
:root {
  --bg: #F2F4F7; --surface: #FFFFFF; --fg: #151821; --muted: #5D6575; --line: #DDE1E8;
  --accent: #2A4BF2; --on-accent: #FFFFFF;
  --done: #1E9E5A; --frozen: #4FB3E6; --missed: #E5484D; --empty: #E6E9EF; --on-ice: #0B1A24;
  --display: "Big Shoulders Display", "Arial Narrow", Impact, sans-serif;
  --body: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0F1218; --surface: #181C25; --fg: #EEF1F6; --muted: #9AA3B5; --line: #2A303C;
    --accent: #7088FF; --on-accent: #0B0E14;
    --done: #3CCB7F; --frozen: #6CC8F2; --missed: #FF6B6F; --empty: #252B36;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #0F1218; --surface: #181C25; --fg: #EEF1F6; --muted: #9AA3B5; --line: #2A303C;
  --accent: #7088FF; --on-accent: #0B0E14;
  --done: #3CCB7F; --frozen: #6CC8F2; --missed: #FF6B6F; --empty: #252B36;
  color-scheme: dark;
}
body { background: var(--bg); color: var(--fg); font-family: var(--body); font-size: 15px; line-height: 1.5; }
.wrap { max-width: 760px; margin: 0 auto; padding-inline: 16px; padding-block: 28px 48px; display: grid; gap: 20px; }
.board { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px 24px; flex-wrap: wrap; }
.eyebrow { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin: 0; }
.big { font-family: var(--display); font-weight: 900; font-size: clamp(80px, 22vw, 136px); line-height: .82; font-variant-numeric: tabular-nums; margin: 6px 0 4px; }
.big small { font-size: .26em; font-weight: 700; margin-left: .25em; color: var(--muted); letter-spacing: .04em; text-transform: uppercase; }
.sub { margin: 0; color: var(--muted); }
.who-line { color: var(--muted); font-size: 14px; }
.who-line strong { color: var(--fg); }
.link { background: none; border: 0; padding: 0; color: var(--accent); text-decoration: underline; cursor: pointer; font: inherit; }
.picker { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 20px 16px; display: grid; gap: 12px; }
.pick-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pick, .go { font-family: var(--display); font-weight: 900; text-transform: uppercase; letter-spacing: .04em; border: 0; border-radius: 14px; cursor: pointer; }
.pick { font-size: 26px; padding: 16px 8px; background: var(--accent); color: var(--on-accent); }
.go { font-size: 30px; padding: 18px; width: 100%; background: var(--accent); color: var(--on-accent); }
.go.is-done { background: var(--surface); color: var(--done); box-shadow: inset 0 0 0 2px var(--done); }
.go:disabled { opacity: .6; cursor: progress; }
button:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.msg { margin: 0; color: var(--missed); font-weight: 500; }
.lanes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 16px; }
.lane { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; display: grid; gap: 14px; min-width: 0; }
.lane.is-me { border-color: var(--accent); }
.lane-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; }
.name { font-family: var(--display); font-weight: 700; font-size: 28px; text-transform: uppercase; letter-spacing: .03em; line-height: 1; }
.count { text-align: right; }
.num { font-family: var(--display); font-weight: 900; font-size: 52px; line-height: .9; font-variant-numeric: tabular-nums; }
.unit { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: var(--empty); color: var(--fg); }
.chip.good { background: var(--done); color: var(--on-accent); }
.chip.ice { background: var(--frozen); color: var(--on-ice); }
.cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.dow { font-size: 10px; color: var(--muted); text-align: center; font-weight: 600; }
.cell { aspect-ratio: 1; max-width: 100%; border-radius: 5px; background: var(--empty); }
.cell.done { background: var(--done); }
.cell.frozen { background: var(--frozen); }
.cell.missed { background: var(--missed); }
.cell.pending { background: transparent; box-shadow: inset 0 0 0 2px var(--accent); }
.cell.future { background: transparent; box-shadow: inset 0 0 0 1px var(--line); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; color: var(--muted); margin: 0; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.rules { margin: 0; font-size: 13px; color: var(--muted); max-width: 65ch; }
@media (prefers-reduced-motion: no-preference) {
  .go, .pick { transition: transform .12s ease; }
  .go:active, .pick:active { transform: scale(.98); }
}
</style>

<main class="wrap">
  <header class="board">
    <div>
      <p class="eyebrow">Together streak</p>
      <div class="big" id="couple-num">0<small>days</small></div>
      <p class="sub" id="couple-sub">Loading check-ins…</p>
    </div>
    <div class="who-line" id="who-line" hidden>Checking in as <strong id="who-name"></strong> · <button class="link" id="switch" type="button">Switch</button></div>
  </header>

  <section class="picker" id="picker" hidden>
    <p class="eyebrow">Who's checking in on this phone?</p>
    <div class="pick-row">
      <button class="pick" id="pick-wenjing" type="button" data-person="wenjing">Wen Jing</button>
      <button class="pick" id="pick-javen" type="button" data-person="javen">Javen</button>
    </div>
  </section>

  <button class="go" id="go" type="button" hidden>Done today ✓</button>
  <p class="msg" id="msg" hidden></p>

  <section class="lanes" id="lanes"></section>

  <p class="legend">
    <span><i style="background:var(--done)"></i>Trained</span>
    <span><i style="background:var(--frozen)"></i>Freeze used</span>
    <span><i style="background:var(--missed)"></i>Missed</span>
    <span><i style="box-shadow:inset 0 0 0 2px var(--accent)"></i>Today</span>
  </p>
  <p class="rules">Each of you gets one freeze a week (Monday to Sunday). It covers your first missed day automatically. Freezes keep a streak alive but don't add to it. The together streak only grows on days you both train.</p>
</main>

<script src="streak.js"></script>
<script>
const NAMES = { wenjing: "Wen Jing", javen: "Javen" };
const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const STATUS_LABEL = { done: "trained", frozen: "freeze used", missed: "missed", pending: "not yet", future: "", empty: "" };
const $ = (id) => document.getElementById(id);

let me = null;
try { const saved = localStorage.getItem("streak-me"); if (NAMES[saved]) me = saved; } catch (e) {}
let checkins = [];
let db = null;
let loaded = false;
let busy = false;

function showMsg(text) { $("msg").textContent = text; $("msg").hidden = false; }
function hideMsg() { $("msg").hidden = true; }

function laneEl(person, data, today) {
  const lane = document.createElement("article");
  lane.className = "lane" + (person === me ? " is-me" : "");

  const head = document.createElement("div");
  head.className = "lane-head";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = NAMES[person];
  const count = document.createElement("div");
  count.className = "count";
  count.innerHTML = '<div class="num"></div><div class="unit"></div>';
  count.querySelector(".num").textContent = data.streak;
  count.querySelector(".unit").textContent = data.streak === 1 ? "day" : "days";
  head.append(name, count);

  const chips = document.createElement("div");
  chips.className = "chips";
  const today1 = document.createElement("span");
  today1.className = "chip" + (data.doneToday ? " good" : "");
  today1.textContent = data.doneToday ? "Trained today" : "Not yet today";
  const freeze = document.createElement("span");
  freeze.className = "chip" + (data.freezesLeft ? " ice" : "");
  freeze.textContent = data.freezesLeft ? "1 freeze left this week" : "Freeze used this week";
  chips.append(today1, freeze);

  const cal = document.createElement("div");
  cal.className = "cal";
  cal.setAttribute("role", "img");
  cal.setAttribute("aria-label", `${NAMES[person]}'s last 5 weeks`);
  for (const d of DOW) { const h = document.createElement("div"); h.className = "dow"; h.textContent = d; cal.append(h); }
  for (const d of Streak.gridDates(today, 5)) {
    const status = data.days.get(d) || (d > today ? "future" : "empty");
    const cell = document.createElement("div");
    cell.className = "cell " + status;
    cell.title = STATUS_LABEL[status] ? `${d}: ${STATUS_LABEL[status]}` : d;
    cal.append(cell);
  }

  lane.append(head, chips, cal);
  return lane;
}

function coupleLine(r) {
  if (!loaded) return "Loading check-ins…";
  if (!r.start) return "Tap Done today to start your streak.";
  const w = r.people.wenjing.doneToday, j = r.people.javen.doneToday;
  if (w && j) return "You both trained today.";
  if (w) return "Waiting on Javen today.";
  if (j) return "Waiting on Wen Jing today.";
  return "Neither of you has checked in today yet.";
}

function render() {
  const today = Streak.localToday();
  const r = Streak.computeAll(checkins, today);

  $("couple-num").firstChild.nodeValue = r.couple.streak;
  $("couple-sub").textContent = db === null && loaded ? "" : coupleLine(r);

  $("picker").hidden = !!me;
  $("who-line").hidden = !me;
  if (me) $("who-name").textContent = NAMES[me];

  const go = $("go");
  go.hidden = !me || !db;
  if (me) {
    const done = r.people[me].doneToday;
    go.textContent = done ? "Done ✓ · tap to undo" : "Done today ✓";
    go.classList.toggle("is-done", done);
    go.disabled = busy || !loaded;
  }

  $("lanes").replaceChildren(...Streak.PEOPLE.map((p) => laneEl(p, r.people[p], today)));
}

function choose(person) {
  me = person;
  try { if (person) localStorage.setItem("streak-me", person); else localStorage.removeItem("streak-me"); } catch (e) {}
  render();
}
$("pick-wenjing").addEventListener("click", () => choose("wenjing"));
$("pick-javen").addEventListener("click", () => choose("javen"));
$("switch").addEventListener("click", () => choose(null));

$("go").addEventListener("click", async () => {
  if (!me || !db || busy || !loaded) return;
  const today = Streak.localToday();
  const done = Streak.computeAll(checkins, today).people[me].doneToday;
  const ref = db.collection("checkins").doc(`${me}_${today}`);
  busy = true; hideMsg(); render();
  try {
    if (done) await ref.delete();
    else await ref.set({ person: me, date: today, at: new Date().toISOString() });
  } catch (e) {
    const code = e && e.code;
    if (code === "invalid_argument") showMsg("This page won't let you save check-ins. Ask the person who shared it to give you Contributor access.");
    else if (code === "quota_exceeded") showMsg("The check-in store is full, so this one wasn't saved.");
    else showMsg("Couldn't save your check-in. Check your connection and tap again.");
  }
  busy = false; render();
});

// Keep "today" correct if the page stays open past midnight.
setInterval(render, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });

render();

(async () => {
  db = window.claude && window.claude.use ? await window.claude.use("db") : null;
  if (!db) {
    loaded = true;
    showMsg("Shared check-ins aren't available here. Open this page from its claude.ai link while signed in.");
    render();
    return;
  }
  db.collection("checkins").limit(1000).onSnapshot(
    (snap) => { checkins = snap.docs.map((d) => d.data()); loaded = true; hideMsgIfLoadError(); render(); },
    () => { showMsg("Lost the connection to your check-ins. Reload the page to reconnect."); },
  );
  render();
})();

function hideMsgIfLoadError() {
  if ($("msg").textContent.startsWith("Lost the connection")) hideMsg();
}
</script>
```

- [ ] **Step 2: Check the page locally**

Run: `node --test test/`, which should still pass. The page loads `streak.js` from its own folder, the same way it will once published, so copy both files into a preview folder in the session scratchpad (`<scratchpad>` below):

```bash
mkdir -p <scratchpad>/preview && cp index.html src/streak.js <scratchpad>/preview/
```

Open `file://<scratchpad>/preview/index.html` in the in-app browser. Expected: the picker shows, the "Shared check-ins aren't available here" message appears (there's no db outside claude.ai), both lanes render with empty calendars and today outlined, and there are no console errors. Take one look at phone width in dark mode.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: streak page with shared check-ins"
```

- [ ] **Step 4: Publish**

Call Artifact `publish` with:
- `file_path: index.html`
- `files: { "streak.js": "src/streak.js" }`
- `capabilities: { db: {} }`
- `icon: "trophy"`
- `description: "Wen Jing and Javen's daily workout check-ins, with personal streaks, a together streak and weekly freezes."`

- [ ] **Step 5: Functional pass**

Use `ArtifactData` `set` to write the probe doc `checkins/wenjing_2026-10-12` = `{person:"wenjing", date:"2026-10-12", at:"<now>"}`. Then `list` the `checkins` collection and confirm the doc reads back. Delete the probe with `if_version`. Finally, `list` again and expect an empty collection.

- [ ] **Step 6: Hand over**

Give the user the link and tell them to share it with Javen as **Contributor** so Javen can check in.
