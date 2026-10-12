// Pure streak logic for the couple fitness streak. No DOM, no storage.
(function (root) {
  const PEOPLE = ["wenjing", "javen"];
  const DAY_MS = 86400000;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const EARLIEST = "2026-01-01"; // nothing real predates the app; keeps a junk row from looping years

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
      DATE_RE.test(c.date) && c.date >= EARLIEST && c.date <= today &&
      toDate(toNum(c.date)) === c.date;
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

  // Trained and frozen days from this week's Monday through today.
  function weekProgress(days, today) {
    const week = { done: 0, frozen: 0 };
    for (let d = weekStart(today); d <= today; d = addDays(d, 1)) {
      const s = days.get(d);
      if (s === "done" || s === "frozen") week[s]++;
    }
    return week;
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
        week: weekProgress(days, today),
      };
    }
    return { start, people, couple: coupleOf(people, today) };
  }

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

  // Which person a signed-in Google account belongs to, or null.
  function personFor(emails, email) {
    if (!email) return null;
    const e = String(email).trim().toLowerCase();
    for (const p of PEOPLE) {
      if (emails[p] && String(emails[p]).trim().toLowerCase() === e) return p;
    }
    return null;
  }

  const api = { PEOPLE, addDays, weekStart, localToday, computeAll, gridDates, personFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Streak = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
