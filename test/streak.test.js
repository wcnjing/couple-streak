const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../public/streak.js");

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
  assert.equal(r.people.wenjing.streak, 5);
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
  assert.equal(r.people.wenjing.streak, 9);
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
  assert.equal(r.couple.streak, 3);
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

test("impossible or ancient dates are ignored", () => {
  const rows = [
    ...ci("javen", "2026-10-08", "2026-10-09"),
    { person: "javen", date: "2026-02-30" },
    { person: "wenjing", date: "0000-00-00" },
    { person: "wenjing", date: "2026-13-01" },
  ];
  const r = S.computeAll(rows, "2026-10-10");
  assert.equal(r.start, "2026-10-08");
  assert.equal(r.people.javen.streak, 2);
});

test("week progress counts trained and frozen days this week", () => {
  const r = S.computeAll(ci("wenjing", "2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"), "2026-10-09");
  assert.deepEqual(r.people.wenjing.week, { done: 4, frozen: 1 });
  const fresh = S.computeAll(ci("wenjing", "2026-10-09", "2026-10-12"), "2026-10-13");
  assert.deepEqual(fresh.people.wenjing.week, { done: 1, frozen: 0 });
  assert.deepEqual(S.computeAll([], "2026-10-13").people.javen.week, { done: 0, frozen: 0 });
});

test("personFor maps a signed-in email to a person, ignoring case", () => {
  const emails = { wenjing: "WJ@Example.com", javen: "javen@example.com" };
  assert.equal(S.personFor(emails, "wj@example.com"), "wenjing");
  assert.equal(S.personFor(emails, "JAVEN@example.com"), "javen");
  assert.equal(S.personFor(emails, "stranger@example.com"), null);
  assert.equal(S.personFor(emails, null), null);
  assert.equal(S.personFor({ wenjing: "", javen: "" }, ""), null);
});

test("a streak made only of freezes is zero", () => {
  // Javen never trained; his first missed day is frozen but isn't a streak on its own.
  const r = S.computeAll(ci("wenjing", "2026-10-12", "2026-10-13"), "2026-10-14");
  assert.equal(r.people.javen.days.get("2026-10-12"), "frozen");
  assert.equal(r.people.javen.streak, 0);
  assert.equal(r.people.wenjing.streak, 2);
});

test("together streak keeps counting across weeks", () => {
  // Three full weeks (Mon 28 Sep to Sun 18 Oct) with one frozen day each week for Javen.
  const dates = [];
  for (let d = "2026-09-28"; d <= "2026-10-18"; d = S.addDays(d, 1)) dates.push(d);
  const javenSkips = new Set(["2026-09-30", "2026-10-07", "2026-10-14"]);
  const rows = [...ci("wenjing", ...dates), ...ci("javen", ...dates.filter((d) => !javenSkips.has(d)))];
  const r = S.computeAll(rows, "2026-10-18");
  assert.equal(r.couple.streak, 21);
  assert.equal(r.people.javen.streak, 21);
});
