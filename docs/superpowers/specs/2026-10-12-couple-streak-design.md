# Couple Fitness Streak — Design

Date: 2026-10-12

## Purpose

Wen Jing and Javen are doing a fitness challenge together and want to keep a streak going. The app makes it easy to check in each day and shows how each of you is doing, so you keep each other accountable.

**Success:** both of you can open one shared link on your phones, tap once to check in, and see accurate personal and couple streaks that update to reflect each other's check-ins.

## Decisions

| Topic | Decision |
|---|---|
| Streak types | Personal streak for each person, plus a couple streak, shown side by side |
| Check-in | One tap: "Done today". No notes, photos or numbers |
| Rest days | 1 freeze per person per week (Mon–Sun), applied automatically |
| Hosting | A private Claude Artifact link with the shared database (`db` capability) |
| People | Fixed: "Wen Jing" and "Javen" |
| Timezone | Both use the same timezone; dates are the viewer's local calendar date (YYYY-MM-DD) |

## Streak rules

For each person, every past day is one of:

- **done**: that person has a check-in for the date.
- **frozen**: no check-in, but it's the first missed day in that Mon–Sun week, so the weekly freeze covers it.
- **missed**: no check-in, and the week's freeze is already used.

Rules:

1. Freezes are assigned in date order. In any Mon–Sun week, the earliest day without a check-in becomes frozen, and later missed days that week are missed.
2. **Today** is never missed or frozen. It counts as done if checked in, otherwise it shows as *pending* and leaves the streak unchanged.
3. **Personal streak** is the number of consecutive done or frozen days, counted back from yesterday (or from today if today is done), stopping at the first missed day. Frozen days keep the streak alive but don't add to the count. The streak shows workouts, not covered days.
4. **Couple streak** works the same way, except a day only qualifies if *both* people are done or frozen. It counts days where both were done, and frozen days keep it alive without adding to the count.
5. **The challenge start** is the earliest check-in by either person. Days before it are ignored, so there are no misses before you started.
6. **Freezes left this week** is 1 if the person has no frozen day in the current Mon–Sun week, otherwise 0.

## Data

Collection `checkins`, with one document per person per day:

- doc id: `<person>_<YYYY-MM-DD>`, e.g. `wenjing_2026-10-12`. This makes check-ins idempotent: tapping twice doesn't create two check-ins.
- fields: `{ person: "wenjing" | "javen", date: "YYYY-MM-DD", at: <ISO timestamp> }`

The page doesn't store any streak numbers. It calculates everything from the check-ins every time it loads.

## UI (single page, works on a phone)

- **First visit:** asks "Who are you?" with two buttons, Wen Jing and Javen. The choice is saved in `localStorage` (wrapped in try/catch), with a small "switch" link to change it.
- **Header:** the couple streak shown big, with a 🔥 and a label like "days together".
- **Two cards:** one each for Wen Jing and Javen, each showing:
  - the personal streak
  - whether that person has checked in today
  - freezes left this week
- **Main button:** "Done today ✓" for the current viewer. Once tapped, it changes to "Done ✓ (undo)", and undo deletes today's check-in.
- **History:** a grid of the last 5 weeks with one row per person, coloured by done, frozen, missed or pending.
- **Updates:** data reloads on page load, after a check-in, and when the tab regains focus.
- **Display:** supports both light and dark mode.

## Structure

The streak logic is a set of pure functions (e.g. `computePerson(dates, today)` and `computeCouple(a, b, today)`) kept separate from the UI and database code, so it can be unit-tested with Node before publishing.

## Error handling

- If a database read or write fails, show a small inline message and keep the button usable to retry.
- If `localStorage` isn't available, ask "Who are you?" on each visit.

## Testing

Unit tests for the streak logic should cover:

- an empty history
- today still pending
- a freeze in the middle of a week
- a second miss in the same week breaking the streak
- a freeze resetting across the Sunday→Monday boundary
- a couple streak broken by only one person
- the challenge start date

After the tests pass, the page gets a manual check in the in-app browser.

## Out of scope

Notes, photos, numeric goals, push notifications, more than two people, and multiple timezones.
