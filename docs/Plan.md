# HomeCrew — Household Chores PWA

*Plan, product design, and technical architecture*
*Draft v0.6 — September 2026*

*v0.6: the MVP data layer is a shared Google Sheet behind an Apps Script web app (ADR-0001, `docs/Architecture.md`). Firestore moves to the upgrade path.*

---

## 1. Why this exists (the real problem)

Two adults, a 5-year-old, a 6-month-old. Chores never end, laundry is a daily flood, and the thing that makes the home feel "under control" is simple: **clear counters at the end of the day**.

Underneath the logistics is a fairness problem that most chore apps make worse:

- **A lot of the daily work is invisible.** Trash out, pots washed, dinner cooked, kitchen cleaned *again* — that's 60–90 minutes of work every single day, and by 9 pm it has been undone by dinner. Nobody "sees" it because the outcome is just a normal kitchen.
- **Big visible tasks get all the credit.** Cleaning the balcony once a month is noticed. Unloading the dishwasher 25 times a month is not.
- **Both people feel like they're doing more.** This is normal — each person sees 100% of their own effort and maybe 40% of the other's. The fix isn't to argue about it; it's to make the data boring and visible so nobody has to argue.

So the goal of the app is **not** "gamify chores." It is:

1. Make the daily grind count, in numbers both of you agreed on in advance.
2. Make logging so fast it actually happens (two taps, no typing).
3. Show a week/month picture that replaces "I feel like…" with "here's what happened."
4. Turn points into actual rest — solo me-time — because the scarcest resource in a house with a baby is uninterrupted time, not money.

### Design principles

| Principle | What it means in the app |
|---|---|
| **Credit the grind** | Recurring daily tasks are worth real points; a "kitchen reset" (pots + counters + trash) is a named, high-value combo. |
| **Two taps to log** | Category → task → done. Confirmation is a toast with Undo. No forms. |
| **Household goal, not a race** | The main progress bar is *household* points vs weekly target. Individual split is one tap away, not the headline. |
| **Agreed prices** | Point values are set *together* in a 10-minute session. Changing them requires both to accept (soft rule; app just shows "proposed by X"). |
| **Rest is the currency** | Rewards are mostly protected solo time. Redeeming a reward is a *commitment by the other partner*, not just a badge. |
| **Kid-visible, not kid-driven** | 5-year-old gets a star board with 3–4 age-appropriate tasks; baby-care tasks count for adults. |

---

## 2. Household model

```
Household "Home" (= one shared Google Sheet; each phone connects with a setup link)
 ├── Adult A  (full account)
 ├── Adult B  (full account)
 ├── Kid (5)  (star mode, logged by an adult, own tiny reward list)
 └── Baby (6m) — not a member; baby-care tasks belong to whichever adult did them
```

Roles:
- **Adult**: log tasks for self, log on behalf of kid, redeem rewards, edit catalog.
- **Kid profile**: no login; adults tap "Mia did it" on kid tasks. Kid sees stars, not points.

---

## 3. Task catalog

Points are a rough measure of **effort × unpleasantness × how much it protects the "clean counters" goal**. Values below are a starting proposal — the app ships with these as defaults and you edit them together.

Scale: 1 pt ≈ 5 minutes of tolerable work. Unpleasant or interrupt-heavy tasks get a bump.

### 🍳 Kitchen (the daily loop)

| Task | Pts | Freq | Notes |
|---|---|---|---|
| Cook dinner | 6 | daily | Includes the mess it creates |
| **Hand-wash dishes** (group) | | daily | Anything that doesn't go in the dishwasher — tap what you actually did |
| ↳ Pots | 2 | daily | |
| ↳ Pans / wok | 2 | daily | Burnt-on = the worst one |
| ↳ Oven trays / casserole dishes | 2 | as needed | |
| ↳ Knives + cutting boards | 1 | daily | |
| ↳ Blender / mixer / food-processor parts | 2 | as needed | |
| ↳ Big stuff (stock pot, drying rack, bins, lunchboxes) | 1 | as needed | |
| Dry + put away hand-washed items | 1 | daily | Nobody wants a full drying rack |
| Clean kitchen counters (full wipe) | 3 | daily | **The end-goal task** |
| Load + start dishwasher | 2 | daily | |
| Unload dishwasher | 2 | daily | |
| Take out trash / recycling | 2 | daily | +1 if it's a rainy/night run |
| Clear food from sink + empty strainer | 2 | daily | Unpleasantness premium; see §12.7 |
| Wash baby bottles / pump parts | 3 | daily | Fiddly, unpleasant |
| Sterilize bottles | 1 | daily | |
| Clean stove / hob | 3 | weekly | |
| Clean coffee machine (drip tray, grounds bin, milk system) | 2 | weekly | |
| Descale coffee machine | 3 | monthly | The one everyone forgets |
| Clean dishwasher (filter, spray arms, door seal) | 3 | monthly | |
| Fridge cleanout + wipe | 4 | biweekly | |
| Meal plan for the week | 3 | weekly | Invisible mental load — counts |
| Grocery shopping (big run) | 5 | weekly | |
| Put groceries away | 2 | weekly | |

**Combo: "Kitchen Reset"** = hand-wash dishes (any sub-items, min. pots or pans) + counters + trash + dishwasher loaded, same evening → **+3 bonus** (typically 13–15 total). This is the single most valuable thing anyone can do for the house, and the app should say so.

Why the dishes are split: "wash pots" as one 4-pt button undercounts the night you scrubbed a burnt pan, two pots, the baking tray and the blender. Sub-items let you log the actual pile in three taps. A sub-item can also be tapped twice (two pots) — the app shows a ×2 badge.

### 👕 Laundry (the weekly flood)

| Task | Pts | Freq |
|---|---|---|
| Wash cycle (sort + load + start) | 2 | ~daily |
| Move to dryer / hang to dry | 2 | ~daily |
| Fold one load | 3 | ~daily |
| Pair socks + sort underwear (on top of folding) | +1 | per load |
| Put folded clothes away | 2 | ~daily |
| Change bed sheets (one bed) | 3 | weekly |
| Wash + change crib/baby bedding | 3 | weekly |
| Iron (per session) | 3 | as needed |
| Clean dryer lint filter | 1 | every load / weekly |
| Clean dryer (condenser, water tank, drum) | 3 | monthly |
| Clean washing machine (drawer, door seal, drum wash) | 3 | monthly |

Note: a full laundry cycle start-to-put-away is **9 pts**. With a baby, that's likely one load a day. Treat it as such — see §8.

### 🧹 Floors & surfaces

| Task | Pts | Freq |
|---|---|---|
| Pick everything up off the floor (whole flat) | 3 | daily |
| Vacuum whole home | 5 | 2×/week |
| Vacuum one room | 2 | as needed |
| Wet-mop floors | 5 | weekly |
| Dust (shelves, surfaces) | 3 | weekly |
| Clean computer table | 2 | weekly |
| Clean bedroom shelves | 2 | weekly |

### 🚿 Bathroom

The bathroom is a **group task**: it appears as one button with three sub-items. You can tap a single sub-item (e.g. just the toilet on a Tuesday) or tap all three to get the full-bathroom bonus.

| Task | Pts | Freq |
|---|---|---|
| **Clean bathroom** (group) | | |
| ↳ Toilet (bowl, seat, outside, floor around it) | 4 | 2×/week |
| ↳ Sink + mirror + counter | 2 | weekly |
| ↳ Shower / tub (walls, floor, glass) | 4 | weekly |
| ↳ Clear shower drain / hair catcher | 4 | weekly | Priced for unpleasantness, not for who sheds; see §12.7 |
| Bathroom floor (mop) | 2 | weekly |
| Replace towels | 1 | weekly |
| Empty diaper bin | 2 | 2–3×/week |
| Empty sanitary bin (bag, wipe, new bag) | 2 | weekly |

**Combo: "Full bathroom"** = toilet + sink + shower, same day → **+2 bonus** (total 12).

Group tasks in the app: a task can have `parentId`. The category screen shows the parent as a card with its sub-items as chips inside; tapping a chip logs that sub-item; a "Do all" button logs all of them and the combo bonus. Same pattern later for anything else you want to split (e.g. Kitchen Reset could become a group instead of a detected combo).

### 👶 Kids & baby (adult tasks, count for adults)

| Task | Pts | Freq |
|---|---|---|
| Bath the kids | 4 | daily |
| Bedtime routine (5-y-o) | 4 | daily |
| Night feed / night wake-up (per wake) | 3 | nightly |
| Sort/organize kids' clothes (outgrown, seasons) | 5 | monthly |
| Organize toys | 3 | weekly |
| Organize kids' drawings/paintings (keep/photo/recycle) | 3 | monthly |
| Prep daycare/school bag | 2 | daily |
| Doctor/daycare admin (appointments, forms) | 3 | as needed |

### 🪴 Home & outside

| Task | Pts | Freq |
|---|---|---|
| Water plants | 2 | 2×/week |
| Clean balcony | 5 | monthly |
| Organize storage room | 8 | quarterly |
| Take out big recycling / bulky waste | 4 | as needed |
| Sort mail, pay bills | 2 | weekly |

### ⭐ Kid tasks (5-year-old, star mode)

| Task | Stars |
|---|---|
| Put toys in the box | 1 |
| Put dirty clothes in the hamper | 1 |
| Help set the table | 1 |
| Water one plant with the small can | 1 |
| Match socks from the laundry | 2 |

Kid rewards (5 stars): pick the bedtime story, choose Saturday breakfast, 15 min extra playground, sticker sheet.

---

## 4. Points economy & rewards

### Weekly household target

Add up the "should happen" frequency × points ≈ **~250 pts/week** for this household. The app shows one bar: **Household: 187 / 250**. Tap it to see the split.

Rule of thumb you agree on: the split doesn't need to be 50/50 — someone on parental leave, someone working late, someone recovering from a night of feeds — it needs to be **known and discussed**, not guessed.

### Bonuses

- **Kitchen Reset** combo: +3 (see above)
- **Streak**: counters cleaned 5 days in a row → +5 (household bonus, split evenly — it's a team win)
- **Rainy-day/night tasks**: +1 on trash, bins
- **"I noticed"**: partner can tap 👏 on a logged task → +1. Cheap, but it's a thank-you with a receipt.

### Rewards (redeem with points)

The rewards are the point. They should be things you actually crave right now.

**Solo me-time (the main category)**

| Reward | Cost | The other partner commits to… |
|---|---|---|
| 1h uninterrupted coffee out, alone | 20 | Solo with both kids for 1h |
| 2h reading / gaming / hobby, door closed, phone off | 35 | Solo with both kids for 2h |
| Sleep in on a weekend (until 9:30) | 40 | Morning shift with both kids |
| Solo gym / run / walk (90 min) | 30 | Solo with both kids |
| Long bath, door locked, no questions | 15 | Handle everything for 45 min |
| Evening out with friends (3h+) | 60 | Full evening + bedtime solo |
| "Chore-free day" (no expectations, no logging) | 50 | Covers the daily loop that day |

**Small treats**

| Reward | Cost |
|---|---|
| Fancy coffee / pastry delivered | 10 |
| Pick the movie, no veto | 10 |
| Takeout dinner (nobody cooks or cleans) | 25 |
| Order that small thing from the wishlist | 30 |

**Couple rewards (pooled points, both spend)**

| Reward | Cost |
|---|---|
| Babysitter evening | 100 (pooled) |
| Weekend morning: one parent takes both kids out, other one gets the house *empty* | 40 (pooled) |

Redemption flow: pick reward → app creates a **"claim"** the other partner acknowledges (one tap) → it's on the shared calendar (optional). Points are deducted on acknowledgment, not on request.

---

## 5. Design system & pages

### 5.1 Design direction

Design work follows the **Taste Skill** framework (https://www.tasteskill.dev, install name `design-taste-frontend`, `npx skills add Leonxlnx/taste-skill`). It is written for landing pages, so we take its discipline (brief inference, dials, anti-default rules, dark-mode protocol, pre-flight check, "AI tells" list) and leave its React/Next defaults behind. Every UI ticket starts with a one-line **Design Read** before code, per the skill:

> Reading this as: Android-native consumer utility for two tired parents, with a calm, warm, Material-3-flavored language, leaning toward native CSS tokens + Phosphor icons + restrained motion.

Dials for this project: `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 5`. This is a tool used one-handed at 9 pm with a baby on the other arm; it is not a portfolio piece. Consistency beats cleverness.

**Reference apps.** The palette and style are pulled from the consistently top-rated organizer and chore apps on Google Play: Todoist, TickTick, Sweepy, Tody, Microsoft To Do, Notion. Reviewers of these apps praise the same things, and those are the traits we copy:

| Trait shared by top-rated organizers | How we apply it |
|---|---|
| One neutral base (warm off-white / warm off-black), never pure white or black | `--surface` tokens below |
| One saturated brand accent used sparingly (Todoist's red, TickTick's blue) | One primary, used for the FAB, active tab, progress bar, primary buttons. Nowhere else. |
| Per-area colors as a *secondary* system (Sweepy's rooms, Tody's urgency colors) | Seven category colors, only on category tiles, chips and chart segments |
| Big, rounded, tappable cards; bottom navigation; one obvious action per screen | 16 px card radius, 48 px minimum touch target, bottom tab bar with 4 tabs + FAB |
| Progress shown as a single calm bar, not a dashboard | Household bar is the only chart on the Log screen |
| Dark mode that keeps the accent recognisable | Same hue, lifted lightness, in both themes |

Explicitly avoided (Taste Skill "AI tells" + our own): purple-to-blue gradients, glassmorphism, emoji as UI icons, three equal feature cards, confetti on every tap, leaderboards, red overdue badges (they nag; Tidywell's ADHD research on streak burnout applies to exhausted parents too).

### 5.2 Color tokens

CSS custom properties, swapped under `[data-theme="dark"]`; default follows `prefers-color-scheme`, with a manual override in Settings (system / light / dark). No hard-coded colors anywhere in SFCs; ESLint rule `no-restricted-syntax` on hex literals in `<style>` blocks.

**Brand & neutrals**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F4EF` | `#131512` | App background (warm off-white / warm off-black) |
| `--surface` | `#FDFCF9` | `#1C1F1C` | Cards, sheets |
| `--surface-2` | `#EFECE4` | `#262A26` | Nested surfaces, chips, pressed state |
| `--border` | `#E1DDD3` | `#33382F` | Hairlines |
| `--text` | `#1E1D1A` | `#EDEBE4` | Primary text (contrast ≥ 12:1 on `--bg`) |
| `--text-2` | `#5F5C55` | `#A7A59C` | Secondary text (≥ 4.5:1) |
| `--primary` | `#1F8A70` | `#4FD1B3` | Brand teal-green: FAB, active tab, household bar, primary buttons |
| `--on-primary` | `#FFFFFF` | `#0E2A23` | Text on primary |
| `--primary-soft` | `#DDF2EC` | `#1C3A33` | Tinted backgrounds behind primary content |
| `--points` | `#C98A1E` | `#F2B85B` | Points, coins, reward costs, streak |
| `--success` | `#2F8F4E` | `#6CCB8A` | Synced, acknowledged |
| `--warn` | `#B9741C` | `#E8A33D` | Pending sync, pending claim |
| `--danger` | `#B8433A` | `#F07A70` | Destructive actions only (reset data, decline) |

**Category colors** (secondary system; each has a `-soft` tint for tile backgrounds)

| Category | Light | Dark |
|---|---|---|
| Kitchen | `#D9603F` | `#F08A6A` |
| Laundry | `#3F6FD4` | `#7FA3F0` |
| Floors | `#7A5AD9` | `#A88DF0` |
| Bathroom | `#2492A8` | `#5FC5D8` |
| Kids | `#C9508C` | `#EA84B6` |
| Home | `#5A9A3A` | `#8FC96C` |
| Admin | `#6B6F7A` | `#A0A4AE` |

Contrast is checked in CI with a tiny Vitest that runs WCAG contrast math over the token file: every `text` on every `surface` ≥ 4.5:1, every category color on its own `-soft` tint ≥ 3:1 (large text / icon threshold).

### 5.3 Typography, spacing, shape, motion

- **Type**: `Inter Tight` for headings and numbers (tabular figures on, so points align), `Inter` for body; self-hosted with `font-display: swap`. Scale: 12 / 14 / 16 / 20 / 24 / 32. Points on tiles are 20 semibold; the household number is 32.
- **Spacing**: 4 px grid; screen gutter 16; card padding 16; list gap 8.
- **Shape**: cards 16 px, buttons 12 px, chips 999 px, bottom sheet top corners 28 px (Material 3 sheet).
- **Elevation**: none in light except the bottom bar and sheets (one soft shadow); dark uses surface tiers instead of shadows.
- **Motion**: 120 ms ease-out for presses, 200 ms for sheet open, points count-up on the household bar (300 ms). All animations gated by `prefers-reduced-motion`. No idle animation anywhere.
- **Icons**: `@phosphor-icons/vue`, weight `regular`, size 24 (20 in chips). One family; no hand-drawn SVG icons. Category glyphs: `CookingPot`, `TShirt`, `Broom`, `Bathtub`, `Baby`, `Plant`, `Notepad`, `Star`.
- **Copy**: short, no exclamation marks, no em-dashes in UI strings (Taste Skill §9.G), verbs first ("Log pots", not "Pots logged successfully!").

### 5.4 Core components

| Component | Behaviour |
|---|---|
| `AppShell` | Bottom tab bar (Log · Today · Overview · Rewards), center FAB "Kitchen Reset", top status strip (sync dot, update toast). Safe-area aware. |
| `HouseholdBar` | Single rounded bar, `--primary` fill, "187 / 250" in tabular numerals, tap to expand into member split. |
| `CategoryTile` | 2-column grid tile; category color icon on `-soft` tint; count of tasks done today as small avatars in the corner. |
| `TaskButton` | Full-width 56 px button: icon, name, points chip. Press → haptic + toast with Undo. Long-press → sheet (log for partner / kid, backdate, add note). Shows avatar dots for completions today. |
| `TaskGroup` | Parent card with sub-item chips (Bathroom, Hand-wash dishes). Chip tap logs the sub-item; chip supports ×2 badge; "Do all" logs everything + combo bonus. |
| `Toast` | Bottom, above tab bar, 4 s, one action (Undo). Queue of one; a new toast replaces the old. |
| `SplitBars` | Two horizontal bars per category, one per adult, same category color at two opacities. |
| `HeatStrip` | 7 or 30 squares, filled with `--primary` when counters were logged that day. |
| `RewardCard` | Name, cost in `--points`, commitment text, Claim button (disabled with reason if balance is short). |
| `Sheet` | Bottom sheet, 28 px top radius, drag handle, scrim; used for every secondary action so the main screens stay two-tap. |
| `EmptyState` | Icon + one sentence + one action. Never a blank screen. |

### 5.5 Pages

Each page lists purpose, layout, states, and the acceptance criteria that become its test cases. Routes are hash routes.

#### `#/welcome` Welcome / Connect
- **Purpose**: first run. Connect this phone to the household sheet, or try the demo.
- **Layout**: app name, one sentence ("Make the daily grind count"), one big field for the **setup link** (pasted, or pre-filled when the link itself was opened) and a *Connect* button, then "Who are you?" with one button per member from the sheet. Below the fold: a "Try the demo" link that loads `MemoryRepo` with seed data.
- **States**: offline (connecting requires network; explain and offer demo), invalid link or wrong secret (the script answers 401), member already claimed by another phone (warn, allow).
- **Acceptance**: a valid setup link stores the endpoint and secret on this device, loads the household, and routes to `#/log`; a wrong secret shows an inline error without leaving the screen and stores nothing; demo never calls the network.

#### `#/log` Log (home)
- **Purpose**: log a task in two taps.
- **Layout**: `HouseholdBar` → date + "You today: 14 pts" → **Quick row** (3 learned tasks + Kitchen Reset) → 2-column `CategoryTile` grid (Kitchen, Laundry, Floors, Bathroom, Kids, Home, Admin) → kid star tile.
- **States**: first day (quick row shows the three seeded defaults: pots, counters, trash); offline (bar still computes from cache, sync dot amber); update available (toast).
- **Acceptance**: tapping a quick task creates one `complete` event with `points` = task's current points and `forUid` = current user; Undo within 4 s appends an `undo` event; the household bar updates within one frame from local state (no network round-trip).

#### `#/log/:category` Category
- **Purpose**: all tasks in one category.
- **Layout**: header in category color, list of `TaskButton` / `TaskGroup`, archived tasks hidden, "Add task" at the bottom (opens the editor sheet).
- **States**: empty category (`EmptyState` with "Add your first task"); a task already done today by both adults (two avatar dots, still tappable).
- **Acceptance**: sub-item chip tap logs only that sub-item; "Do all" on Bathroom emits three `complete` events plus one `bonus` event with a deterministic id; tapping the same chip twice yields two events and a ×2 badge.

#### `#/today` Today
- **Purpose**: see what happened today, thank each other.
- **Layout**: reverse-chronological list grouped by hour; each row = avatar, task, points, time, clap button. Undone events shown struck-through for 24 h.
- **States**: nothing logged (`EmptyState`: "Quiet so far"); partner's events arriving live (row slides in, 200 ms).
- **Acceptance**: clap creates one `kudos` event and is idempotent per (event, actor); rows render from the same derived state as the household bar (one source of truth).

#### `#/overview` Week / Month
- **Purpose**: replace "I feel like" with "here's what happened."
- **Layout**: segmented control Week | Month → `HouseholdBar` for the period → member split (two columns: points, task count, top category) → `SplitBars` by category → `HeatStrip` "Counters clean" → combos & bonuses list → Export CSV.
- **States**: partial week (bar shows target pro-rated to today); previous periods via left/right arrows; loading older months (skeleton, then data).
- **Acceptance**: week boundaries are Monday 00:00 household-local, including across DST; category totals sum to member totals; CSV export contains every event in the period with ISO timestamps.

#### `#/rewards` Rewards
- **Purpose**: turn points into rest.
- **Layout**: wallet header (my balance, partner balance, pooled) → pending claims (mine to acknowledge first) → catalog grouped Solo / Treats / Couple / Kid → "Add reward".
- **States**: insufficient balance (Claim disabled, "12 more points"); claim pending (card shows amber "Waiting for B"); acknowledged (green, on a calendar if connected).
- **Acceptance**: Claim creates a `claim` event and does not change balance; `ack` by the *other* adult deducts `cost` from `forUid` (or pooled); a user cannot ack their own claim; decline refunds nothing because nothing was taken.

#### `#/kid` Star board
- **Purpose**: the 5-year-old's screen, shown by an adult.
- **Layout**: big friendly tiles with icons, star counter, reward shelf. Larger type, no points, no adult data.
- **Acceptance**: kid events accrue `stars`, never adult points; the screen is reachable only from an adult session (no separate login).

#### `#/schedule` Schedule (issue #64)
- **Purpose**: answer "when does it come back?" at the moment a task is logged, and show what is due, what is coming up and what was done recently. Design: `docs/design/schedule/` and the canvas linked from #64.
- **Layout**: sections Today (due and overdue), Tomorrow, This week, Later; each row = category icon, task, "N days ago · who", points, due day. Below, Recently done for the last 7 days with "back in N days". Tapping a due row logs it (the same two-tap promise as Log) and opens the Next time? sheet.
- **Next time? sheet**: after a `complete` on Log, Category or Today, when the task has an interval. Chips Tomorrow / 3 days / 5 days / 7 days / Pick a date with the task's `intervalDays` preselected (fallback from `freq`: daily 1, weekly 7, biweekly 14, monthly 30, quarterly 90, adhoc none); one tap on "Schedule for <day>" appends a `schedule` event; "Not now" leaves the task listed. Undo within 4 s drops the schedule with the completion.
- **States**: a scheduled task is away until the household-local start of its due day: hidden from its category rows, the quick row and the due dots, shown under a muted "Scheduled" fold on the Category screen ("back Tue 15", tap to bring back early via `unschedule`). On the due day it returns with a Due chip and "Last done N days ago by X"; overdue stays listed with the day it was due. Nothing scheduled: `EmptyState` "Nothing scheduled yet. Log a task and pick its next time."
- **Acceptance**: `deriveSchedule` is pure and DST-safe; the effective schedule is the latest `schedule` whose completion is not undone, not unscheduled and not superseded by a later completion; both phones derive the same lists from the same events; kid tasks never get the sheet.

#### `#/settings` Settings
- **Purpose**: everything that is not daily.
- **Layout**: sections: Household (name, setup link with copy button, members, colors) · Tasks (list with search, edit, archive, reorder, points) · Rewards · Weekly target · Appearance (system / light / dark) · Sync panel (online, outbox count, last poll, member, script version, SW version, "Sync now") · Data (export JSON, import JSON, reset with typed confirmation) · About.
- **Acceptance**: editing a task's points does not change historical events; import of a bad file shows Zod issues line by line; reset requires typing the household name.

#### Sheets (not routes)
- **Task editor**: name, category, points stepper, frequency, parent (for sub-items), archive.
- **Log options** (long-press): for whom, when (Now / Earlier today / Last night / pick), note.
- **Reward editor**: name, cost, kind, commitment text.
- **Claim detail**: who, what, when, acknowledge / decline.

### 5.6 Dark mode protocol

Dual-mode from the first commit, following Taste Skill §8: semantic tokens only, hierarchy parity (if the FAB is the loudest thing in light it is the loudest thing in dark), brand teal stays teal, no pure `#000`/`#fff`. Default follows the system; a manual toggle exists because the app is used at night and some phones lack scheduled dark mode. Every PR that touches UI attaches screenshots in both modes; the CI visual check renders `#/log` and `#/overview` in both themes with Playwright and fails on missing tokens (any computed color not derived from a custom property).

### 5.7 Accessibility

- Touch targets ≥ 48 px, focus rings visible for keyboard/switch users.
- All icons have `aria-label`; category color is never the only signal (icon + label always present).
- Text scales with system font size up to 200% without clipping the tile grid (grid collapses to one column at large sizes).
- `prefers-reduced-motion` disables count-ups and slide-ins.
- Screen reader announces toasts (`role="status"`).

---

## 6. Technical architecture

### 6.1 Summary

- **PWA** built with **Vue 3 + TypeScript + Vite**, hosted on **GitHub Pages** (static). Installable on Android via "Add to Home screen"; full-screen, own icon, works offline.
- **Local-first**: the UI reads and writes a local store first; the network is a background concern. Nothing in the app ever waits on a request.
- **Sync** via a **shared Google Sheet** behind a small Apps Script web app (both free). GitHub Pages can't sync anything by itself, it's just files, so one external piece is unavoidable if two phones are to share data. The sheet doubles as the admin UI: the task catalog and point values are edited in the spreadsheet itself. Decision in ADR-0001; mechanics in `docs/Architecture.md`.
- **Event-sourced**: completions, undos, kudos and reward claims are append-only events. Points, balances and stats are *derived* from events by pure functions. This makes sync conflict-free, undo trivial, and history honest.
- **Typed end-to-end with Zod**: every piece of data crossing a boundary (sheet ↔ app, IndexedDB ↔ app, localStorage ↔ app, import file ↔ app) is parsed through a Zod schema. TypeScript types are inferred from the schemas, so there is exactly one source of truth for shape.

### 6.2 What makes a good PWA architecture

A PWA is just a website with three promises: it installs, it works offline, and it feels native. Most PWAs break those promises because the *architecture* treats offline as an error state. The principles below are what the rest of this section implements.

| Principle | What it means here |
|---|---|
| **App shell, precached** | HTML/JS/CSS/icons/fonts are precached by the service worker. The app opens instantly from the home screen even in airplane mode. Data is loaded separately from the shell. |
| **Local-first, not offline-tolerant** | Reads come from local storage; writes go to local storage and are queued. Sync is a background process that reconciles. "Offline" is not a mode — it's the default that the network occasionally improves. |
| **Append-only events, derived state** | Two phones both offline for a day can never conflict if all they do is append events with unique IDs. Balances, streaks, and charts are pure functions over the event list — no stored counters that can drift. |
| **Pure domain core** | Points rules, combo detection, week/month rollups live in plain TypeScript with zero imports from Vue or the data layer. This is the part with unit tests, and it's the part you'll tweak most. |
| **Validate at the boundaries** | Anything from the network, disk, or a user-supplied file is `schema.parse()`d before it touches the domain. Inside the boundary, types are trusted. A corrupted doc or an old-version event fails loudly in dev, and is skipped-with-log in prod, instead of silently producing NaN points. |
| **Small bundle, fast paint** | Target < 80 KB gzipped total. No backend SDK: the data layer is `fetch` plus a few hundred lines of repo code. Route-level code splitting. No UI framework CSS. |
| **Static-host friendly routing** | GitHub Pages has no server rewrites, so use **hash routing** (`/#/log`). A refresh on `/week` would 404; `/#/week` never does. |
| **Safe service-worker updates** | `registerType: 'prompt'` — the new SW waits; the app shows "Update available → Reload." Auto-updating mid-tap is how you lose an event. |
| **Secret on the device, not in the bundle** | The bundle is public. The only secret, the household's API key, arrives once via the setup link and lives in the phone's storage; the Apps Script rejects requests without it. This is obscurity-grade security, which is the right grade for two people's chore log (ADR-0001). |
| **Native feel** | 48 px touch targets, haptic tick on log, safe-area insets, `theme_color` matching the shell, no 300 ms tap delay (Vite default viewport meta handles this), transitions ≤ 150 ms, dark mode via `prefers-color-scheme`. |
| **Observable enough** | A tiny in-app "Sync" panel: last poll time, outbox count, script version, SW version, current member. Solves 90% of "why isn't it showing on your phone?" without a debugger. |

### 6.3 The sync question (two phones, one household)

GitHub Pages serves static files only; there is no server, no database, no auth. Options:

| Option | Cost | Real-time | Effort | Verdict |
|---|---|---|---|---|
| **Google Sheet + Apps Script web app** | Free | No: poll every 30 s and on app focus | Low: ~150 lines of Apps Script, a `fetch`-based repo, a small outbox | ✅ **MVP choice** (ADR-0001). Two users, data visible and editable in a spreadsheet, no extra accounts |
| **Firebase Firestore** (Spark free tier) | Free at this scale (50k reads/day) | Yes, live listeners | Low: SDK from npm, works from static hosting, has its own offline queue | ✅ The upgrade path if live updates or more than a handful of users ever matter |
| **Supabase** (free tier) | Free | Yes (Realtime channel) | Low to medium: Postgres tables, RLS policies; no built-in offline queue (you'd keep the outbox) | ✅ Alternative upgrade path if you prefer SQL / open source |
| **PocketBase** on a tiny VPS | ~€3-5/mo | Yes | Medium: you run a server | Fine if you already have a box |
| **Excel file (.xlsx) in Drive** | Free | No | Medium, fragile | ❌ No row-level API: every write is download, edit, re-upload the whole file; two phones clobber each other |
| **GitHub repo as DB** (fine-grained PAT, write `data.json` via GitHub API) | Free | No: poll every ~30 s | Medium, hacky | ⚠️ Works, but: token on device, rate limits, JSON merge conflicts, deploy lag |
| **Manual**: export/import JSON, share via chat | Free | No | Trivial | Fallback only; you'll stop doing it in a week |
| **WebRTC peer-to-peer** | Free | Only when both phones are online at once | High | ❌ Not for this |
| **Cloudflare Worker + D1/KV** | Free tier | Poll or Durable Objects | Medium | Solid if you know Workers; more plumbing than either of the top two |

**Decision: a shared Google Sheet for the MVP.** With two users, what Firestore buys (live listeners, a built-in offline queue, per-user security rules) is worth less than what a spreadsheet buys: both partners can see and edit the data, point values included, in a tool they already use, and the Phase 0 "agree the rules" session happens directly in the sheet. The event-sourced model is what makes a spreadsheet safe as a store: the `events` tab is append-only, one row per event, deduplicated by id. What Firestore did for free we write ourselves, and it is small: an outbox in IndexedDB that replays on reconnect, and a poll every 30 s. The `HouseholdRepo` interface is the seam; swapping `SheetsRepo` for a `FirestoreRepo` later touches nothing above it. Full mechanics in `docs/Architecture.md`.

### 6.4 Stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | Catches shape bugs in the derive logic; pairs with Zod for runtime safety |
| Framework | **Vue 3** (`<script setup lang="ts">`, Composition API) | Small, reactive, great mobile DX; SFCs keep each screen self-contained |
| Build | **Vite** | Fast dev, native ESM, first-class PWA plugin |
| State | **Pinia** | Vue's standard store; stores hold the event list and expose derived getters computed by the domain layer |
| Router | **vue-router** in `createWebHashHistory()` mode | Hash routing for GitHub Pages |
| Utilities | **VueUse** | `useOnline`, `useVibrate`, `usePreferredDark`, `useIntervalFn`, `useSwipe` — avoids hand-rolling browser glue |
| Validation / types | **Zod** | One schema per entity; `z.infer` for types; `safeParse` at every boundary; versioned schemas for migrations |
| Data | **Google Sheet** behind a bound **Apps Script** web app; client side is `fetch` inside `SheetsRepo` | No SDK; JSON over HTTPS; script deployed with `clasp` (ADR-0001) |
| Local extras | **idb-keyval** for the outbox and the last-known snapshot (events, tasks, rewards); `localStorage` via VueUse `useStorage` (with Zod) for tiny UI prefs only | Endpoint + secret, member id, last tab, theme |
| PWA | **vite-plugin-pwa** (Workbox) | Manifest generation, precache manifest, `prompt` update strategy |
| Styling | Plain CSS + semantic custom properties (`tokens.css`), scoped in SFCs | Token strategy per Taste Skill §8.A; light + dark from day one; no framework CSS |
| Icons | `@phosphor-icons/vue` (one family, weight regular) | Taste Skill icon rule; no hand-drawn SVG icons, no emoji as icons |
| Fonts | Self-hosted Inter + Inter Tight, `font-display: swap` | No Google Fonts `<link>` in production |
| Design process | Taste Skill (`design-taste-frontend`) | Design read + dials + pre-flight on every UI ticket (§5.1) |
| Engineering process | Matt Pocock skills (`mattpocock-skills`) | grill → spec → tickets → tdd → code-review (§7) |
| Charts | Hand-rolled inline SVG components | Bars, heat-strip; no library |
| Tests | **Vitest** for the domain layer; **@vue/test-utils** for a few components; Zod schemas double as fixtures | Fast, colocated |
| Quality | ESLint (`eslint-plugin-vue` + `@typescript-eslint`), Prettier, `vue-tsc --noEmit` in CI | Type-check SFC templates too |
| Deploy | **GitHub Actions** → `gh-pages` branch | Push to `main` = deployed |

Not chosen and why: Nuxt (SSR is pointless on a static host and adds weight), Vuetify/Quasar (heavy; this app has ~8 components), Firebase in v1 (see ADR-0001: nothing it adds is needed for two users), Dexie (idb-keyval is enough for an outbox and one snapshot; revisit only if queries over local data are ever needed).

### 6.5 Layered architecture

```
┌───────────────────────────────────────────────────────────────┐
│  UI            Vue SFCs (screens, components)                 │
│                reads Pinia getters, calls store actions        │
├───────────────────────────────────────────────────────────────┤
│  App state     Pinia stores                                   │
│                householdStore, catalogStore, eventStore,      │
│                syncStore — hold parsed data, expose getters   │
│                that call the domain layer                     │
├───────────────────────────────────────────────────────────────┤
│  Domain        Pure TypeScript, no Vue, no fetch              │
│                derive.ts (balances, rollups, streaks)         │
│                combos.ts (Kitchen Reset, Full bathroom)       │
│                schedule.ts (what's "due")                     │
│                ids.ts, time.ts (week boundaries)              │
├───────────────────────────────────────────────────────────────┤
│  Schemas       Zod: Task, Reward, Event, Household, Member    │
│                + z.infer types + version migrations           │
├───────────────────────────────────────────────────────────────┤
│  Data          Repository interface + SheetsRepo              │
│                (and MemoryRepo for tests/demo mode)           │
│                every read → schema.safeParse; every write     │
│                → schema.parse before send                     │
└───────────────────────────────────────────────────────────────┘
        Dependencies point downward only. Domain imports Schemas.
        Data imports Schemas. Nothing below imports Vue or Pinia.
```

The `Repository` interface is the seam that keeps the app portable:

```ts
export interface HouseholdRepo {
  watchHousehold(id: string, cb: (h: Household) => void): Unsubscribe
  watchTasks(id: string, cb: (t: Task[]) => void): Unsubscribe
  watchRewards(id: string, cb: (r: Reward[]) => void): Unsubscribe
  watchEvents(id: string, since: Date, cb: (e: ChoreEvent[]) => void): Unsubscribe
  appendEvent(id: string, e: ChoreEvent): Promise<void>
  upsertTask(id: string, t: Task): Promise<void>
  upsertReward(id: string, r: Reward): Promise<void>
  connect(link: SetupLink): Promise<Household>   // validates endpoint + secret, returns the household
  sync(): Promise<SyncResult>                     // flush outbox, poll new rows; no-op for MemoryRepo
}
```

Swap `SheetsRepo` for a `FirestoreRepo` or `SupabaseRepo` later and nothing above the line changes. `SheetsRepo` polls, a Firestore repo would push; the `watch*` callbacks hide the difference. `MemoryRepo` powers a "demo household" on the landing page and every domain test.

### 6.6 Data model with Zod schemas

`src/schemas/*.ts` — the single source of truth for shape *and* type.

```ts
import { z } from 'zod'

export const Id = z.string().min(1).max(128)   // uuid from the app; stable slugs for seeds; combo-{key}-{day}-{hid} for bonuses
export const Category = z.enum(['kitchen','laundry','floors','bathroom','kids','home','admin','kid'])
export const Freq = z.enum(['daily','weekly','biweekly','monthly','quarterly','adhoc'])

export const Member = z.object({
  uid: z.string(),
  name: z.string().min(1).max(24),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  role: z.enum(['adult','kid']),
})
export type Member = z.infer<typeof Member>

export const Household = z.object({
  v: z.literal(1),
  id: Id,
  name: z.string(),
  weeklyTarget: z.number().int().positive(),
  tz: z.string(),                   // IANA zone; weeks start Monday 00:00 here
  members: z.record(z.string(), Member),
  createdAt: z.coerce.date(),
})
export type Household = z.infer<typeof Household>

export const Task = z.object({
  v: z.literal(1),
  id: Id,
  name: z.string().min(1).max(60),
  category: Category,
  points: z.number().int().min(0).max(50),
  freq: Freq,
  forRole: z.enum(['adult','kid']).default('adult'),
  parentId: Id.optional(),          // sub-item of a group (Toilet → Clean bathroom)
  comboBonus: z.number().int().min(0).optional(), // on a parent: bonus when all sub-items done same day
  archived: z.boolean().default(false),
  sort: z.number().int().default(0),
  updatedAt: z.coerce.date(),
  updatedBy: z.string(),
})
export type Task = z.infer<typeof Task>

export const Reward = z.object({
  v: z.literal(1),
  id: Id,
  name: z.string(),
  cost: z.number().int().positive(),
  kind: z.enum(['solo','treat','pooled','kid']),
  commitment: z.string().optional(),   // what the other partner promises
  archived: z.boolean().default(false),
  updatedAt: z.coerce.date(),
  updatedBy: z.string(),
})
export type Reward = z.infer<typeof Reward>

// Events are a discriminated union — Zod narrows on `type`,
// so `switch (e.type)` in derive.ts is exhaustive and typed.
const EventBase = z.object({
  v: z.literal(1),
  id: Id,
  actorUid: z.string(),          // who tapped
  at: z.coerce.date(),           // when the deed happened (may be backdated)
  loggedAt: z.coerce.date(),     // server timestamp
  note: z.string().max(140).optional(),
})
export const ChoreEvent = z.discriminatedUnion('type', [
  EventBase.extend({ type: z.literal('complete'), taskId: Id, forUid: z.string(),
                     points: z.number().int().min(0) }),   // snapshot at log time
  EventBase.extend({ type: z.literal('undo'),     refEventId: Id }),
  EventBase.extend({ type: z.literal('kudos'),    refEventId: Id, points: z.literal(1) }),
  EventBase.extend({ type: z.literal('claim'),    rewardId: Id, forUid: z.string(), cost: z.number().int() }),
  EventBase.extend({ type: z.literal('ack'),      refEventId: Id }),
  EventBase.extend({ type: z.literal('decline'),  refEventId: Id }),
  EventBase.extend({ type: z.literal('adjust'),   forUid: z.string(), points: z.number().int(), note: z.string() }),
  EventBase.extend({ type: z.literal('bonus'),    forUid: z.string(), points: z.number().int(),
                     combo: z.string(), day: z.string() }),  // derived server-free: emitted by client when combo completes
])
export type ChoreEvent = z.infer<typeof ChoreEvent>

// Import/export file
export const Backup = z.object({
  v: z.literal(1),
  exportedAt: z.coerce.date(),
  household: Household, tasks: z.array(Task), rewards: z.array(Reward), events: z.array(ChoreEvent),
})
```

How Zod is used at each boundary:

- **Sheet → app**: every row the script returns goes through `ChoreEvent.safeParse` (or `Task` / `Reward`). Failures are logged with the row's id and skipped (never crash the UI over one bad row). In dev, a failure throws.
- **App → sheet**: `ChoreEvent.parse(evt)` right before the event is queued in the outbox. Dates travel as ISO strings and the sheet's columns are formatted as plain text, so nothing is reinterpreted as a spreadsheet date.
- **Backup import**: `Backup.safeParse(JSON.parse(file))` → show a readable error list from `ZodError.issues` instead of "import failed".
- **localStorage prefs**: `useStorage('prefs', defaults, { serializer: zodSerializer(Prefs) })`.
- **Migrations**: `v` is a literal per version. `migrate.ts` has `v0 → v1` transforms; the repo runs `z.union([TaskV1, TaskV0.transform(upgrade)])` so old docs keep parsing after a schema change.

Why snapshot `points` on the event: if you re-price "pans" from 2 to 3 next month, last month's history stays true.

Sheet layout (one spreadsheet = one household; one tab per entity; header row = field names; one row per record; full column list in `docs/Architecture.md`):

```
household   key | value                  name, weeklyTarget, tz, createdAt, v
members     uid | name | color | role    two adults + kid; uid is a short slug ("ana", "ben", "mia")
tasks       one row per Task             columns = Task fields; edit points here, together
rewards     one row per Reward           columns = Reward fields
events      one row per ChoreEvent       append-only; columns = union of all event fields; loggedAt stamped by the script
```
```

For ~40 events/day, a month is ~1,200 rows and a year ~15,000, which Sheets handles comfortably. The client asks the script for `events since <loggedAt>` on every poll, so a steady-state poll returns a handful of rows. On first connect it loads from the start of the previous month; older months load on demand for the Month view.

### 6.7 Domain layer: derive

`src/domain/derive.ts` — pure, tested, framework-free:

```ts
export function deriveState({ events, tasks, rewards, household, now }: DeriveInput): Derived
```

returns

```ts
interface Derived {
  balances: Record<uid, number>         // complete + kudos + bonus + adjust − acknowledged claims
  stars: Record<uid, number>            // kid stars; a separate economy
  pooled: number
  week:  Rollup   // Mon 00:00 local → now
  month: Rollup
  pendingClaims: Claim[]
  streaks: { countersClean: number }
  heatStrip: { day: string; countersDone: boolean }[]
  quickRow: Task[]                      // top 3 by count, last 14 days
  dueDots: Record<Category, boolean>    // any task past its freq window
}
interface Rollup {
  household: number; target: number
  byMember: Record<uid, { points: number; count: number }>
  byCategory: Record<Category, Record<uid, number>>
  combos: { name: string; count: number }[]
}
```

Rules that live only here: undo cancels its ref event; a `bonus` event is emitted client-side by `combos.ts` when the day's completes satisfy a combo (idempotent per `combo+day`, so two phones racing produce one bonus thanks to a deterministic id `combo-{key}-{day}-{hid}`); kid tasks accrue stars, not points.

### 6.8 Sync & conflict handling

- **Events** are append-only with client-generated UUIDs, so two phones never conflict. Both offline for a day, both come back, the sheet ends up with both sets. The script appends under `LockService` and skips any id already present, so a retried request cannot double-log.
- **Undo** is itself an event (`type: 'undo'`, `refEventId`), so it merges cleanly.
- **Combo bonuses** use deterministic ids (`combo-{key}-{day}-{hid}`), so if both phones emit the same bonus the second append is a no-op, not a double bonus.
- **Catalog** edits (tasks, rewards) are last-write-wins on `updatedAt`, enforced by the script: an older `updatedAt` is rejected and the client re-pulls. The UI shows "edited by B, 2 min ago" so silent overwrites are visible. Edits made directly in the spreadsheet are picked up on the next poll like any other change.
- **Offline**: every write goes to an **outbox** in IndexedDB first and is applied to local state immediately; the household bar never waits. `syncStore` flushes the outbox whenever the app is online, in order, and removes an entry only after the script confirms it. The last-known snapshot (events since the previous month, tasks, rewards, household) is cached in IndexedDB so the app opens with data in airplane mode.
- **Polling**: `SheetsRepo` polls `events since <last loggedAt>` every 30 s while the app is visible, plus immediately on `visibilitychange`, on `online`, and after every outbox flush. A partner's tap shows up within about 30 s, or instantly when you open the app. `syncStore` exposes `online`, `outboxCount`, `lastPollAt` for the status dot.
- **Time**: `at` is the phone's local time for the deed; `loggedAt` is stamped by the script when the row is appended and is the cursor for polling. Week boundaries are Monday 00:00 in the household's timezone (stored on the household tab; both phones in the same house, so one tz).

### 6.9 Identity & security

- **No accounts.** The household is the sheet. Each phone stores three things: the script URL, the household **secret**, and which member it is. All three come from the **setup link** the first phone generates in Settings (`https://<user>.github.io/homecrew/#/welcome?s=<base64 of {url, secret}>`) and shares with the other phone over any private channel.
- **Member identity** is self-declared: on connect you pick your name from the members tab and the phone remembers it. There is nothing to protect against between two partners; the choice exists for attribution, not access control.
- **Secret check**: the Apps Script compares the `secret` in every request against a value in its Script Properties and answers 401 otherwise. The secret never appears in the repo or the bundle. Rotating it means editing one property and re-sharing the setup link.
- **Script deployment**: "Execute as me" (the sheet owner), access "Anyone". The script is the only path into the sheet from the app; the sheet itself is shared with the other partner as an editor so both can edit the catalog by hand.
- **Append-only** is enforced by the script's API surface: there is no action that edits or deletes an event row. Editing history by hand in the sheet stays possible and is treated as a feature (fix a mistyped point value), with the Zod parse as the guard against broken rows.
- **Threat model**: someone who obtains the URL and the secret could read or add chore events. Nothing sensitive is stored. This is the accepted trade-off of ADR-0001; the upgrade path (Firestore with per-user rules) exists if it ever stops being acceptable.

### 6.10 PWA specifics for Android

- `manifest.webmanifest`: `display: standalone`, `theme_color`/`background_color` = shell dark, maskable 512 px icon, `start_url: "./#/log"`, `shortcuts` (Android long-press icon: "Kitchen Reset", "Log trash", "Laundry").
- Service worker (`vite-plugin-pwa`): precache shell; `registerType: 'prompt'`; runtime `CacheFirst` for fonts/icons. Requests to the Apps Script URL are `NetworkOnly`: the repo owns its cache and its outbox, and the service worker never caches API responses.
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`; `env(safe-area-inset-*)` padding for the gesture bar.
- Haptic tick on log via VueUse `useVibrate([10])`.
- Install prompt: catch `beforeinstallprompt`, show a one-time "Add to home screen" card in Settings.
- Web Push works for Android PWAs but needs a push server that signs VAPID messages. Apps Script cannot do that, so notifications are out of v1; if the 9 pm habit needs a nudge, a time-driven Apps Script trigger can send an email or a Google Chat message instead.

### 6.11 Repo layout

```
homecrew/
├── .github/
│   ├── workflows/ci.yml deploy.yml preview.yml
│   ├── ISSUE_TEMPLATE/ feature.md bug.md design.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS
├── CONTEXT.md                        # shared vocabulary (grill-with-docs)
├── docs/
│   ├── Plan.md                       # this document
│   ├── Architecture.md               # how the pieces fit: data flow, sheet layout, script API, sync
│   ├── adr/                          # architecture decision records
│   ├── design/DESIGN.md              # tokens, dials, design read, references
│   └── specs/                        # published specs
├── public/
│   ├── icons/ (192, 512, maskable)
│   └── robots.txt
├── src/
│   ├── main.ts                       # createApp, pinia, router, PWA register
│   ├── App.vue                       # shell: tab bar, sync icon, update toast
│   ├── router.ts                     # createWebHashHistory
│   ├── config.ts                     # SetupLink parsing; endpoint + secret + member id from localStorage
│   ├── schemas/                      # Zod: household.ts task.ts reward.ts event.ts backup.ts migrate.ts
│   ├── domain/                       # PURE: derive.ts combos.ts schedule.ts time.ts ids.ts seed.ts
│   ├── data/                         # repo.ts (interface) sheetsRepo.ts outbox.ts snapshot.ts memoryRepo.ts
│   ├── stores/                       # Pinia: household.ts catalog.ts events.ts sync.ts prefs.ts
│   ├── composables/                  # useToast.ts useHaptic.ts useInstallPrompt.ts
│   ├── components/                   # BigButton.vue TaskGroup.vue Bar.vue HeatStrip.vue Avatar.vue Toast.vue
│   ├── screens/                      # Log.vue Category.vue Today.vue Overview.vue Rewards.vue Settings.vue Join.vue
│   └── styles/                       # tokens.css (light + dark) base.css fonts.css
├── tests/
│   ├── domain/derive.test.ts combos.test.ts schedule.test.ts time.test.ts
│   ├── schemas/event.test.ts migrate.test.ts
│   ├── data/sheetsRepo.test.ts outbox.test.ts   # fake fetch; replay + dedupe
│   ├── stores/events.test.ts
│   ├── components/TaskGroup.test.ts Toast.test.ts RewardCard.test.ts
│   ├── tokens/contrast.test.ts
│   └── e2e/*.spec.ts                 # Playwright, one per page
├── apps-script/                      # the backend: Code.js (doPost router, sheet I/O), appsscript.json, .clasp.json
│   └── README.md                     # deploy: clasp push && clasp deploy -i <deploymentId>
├── vite.config.ts                    # base: '/homecrew/', VitePWA({ registerType: 'prompt', manifest })
├── tsconfig.json                     # strict, "moduleResolution": "bundler"
└── README.md
```

### 6.12 Testing & quality

The full test discipline (red first, regression tests for bugs, per-layer coverage gates) is in §7.5. Summary of what lives where:

- **Domain** (most of the tests): table-driven Vitest cases — "two pots + pans + counters + trash + dishwasher on same day → bonus emitted once", "undo removes points", "week rollup respects Monday boundary across DST", "kid tasks don't touch adult balance".
- **Schemas**: round-trip tests (`parse(serialize(x)) deep-equals x`), rejection tests (points 51, missing `v`), migration tests (`v0` fixture → `v1`).
- **Repo**: `MemoryRepo` in tests; `SheetsRepo` against a fake `fetch` (Vitest) for parse-before-send, skip-bad-rows, outbox replay and dedupe. The Apps Script has a `runTests` function run from the script editor against a scratch sheet before each deploy (manual, documented in `apps-script/README.md`).
- **Components**: a handful — `TaskGroup.vue` sub-item taps emit the right task ids; `Toast.vue` undo calls the store.
- **CI** (`deploy.yml`): `npm ci` → `vue-tsc --noEmit` → `eslint` → `vitest run` → `vite build` → publish `dist/` to `gh-pages`. A red test blocks deploy.

### 6.13 Deploy

```yaml
name: deploy
on: { push: { branches: [main] } }
permissions: { contents: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck && npm run lint && npm test
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

`ci.yml` runs the same checks on every PR (required status checks, see §7.4); `preview.yml` publishes each PR's build under `/pr-<n>/` so it can be installed on a phone before merging. Repo → Settings → Pages → source `gh-pages` branch. App lives at `https://<user>.github.io/homecrew/`. The Apps Script is deployed separately and rarely: `clasp push && clasp deploy -i <deploymentId>` from `apps-script/`, updating the existing deployment so the URL in the setup link never changes.

---
## 7. Engineering process & quality

The process is deliberately small: every change is an issue, becomes a branch, is built test-first, goes through a PR with a review, and merges only when CI is green. No exceptions for "tiny fixes"; those are exactly the ones that break the points math.

### 7.1 Agent skills used

Two skill sets are installed in the repo and used by whoever is doing the work, human or agent.

**Matt Pocock's "Skills for Real Engineers"** (https://github.com/mattpocock/skills) for planning, tickets, and building:

```
claude plugins install mattpocock-skills        # Claude Code
npx skills@latest add mattpocock/skills         # Codex / others / editable copy
```

Then `/setup-matt-pocock-skills` once: issue tracker = **GitHub Issues**, triage labels = the set in §7.3, docs location = `docs/`.

| Skill | When we use it |
|---|---|
| `/grill-with-docs` | Before any feature bigger than a bug fix. Interviews the author until the design tree is resolved and updates `CONTEXT.md` (glossary) and `docs/adr/` inline. Run it on this Plan first. |
| `/to-spec` | Turns the grilled conversation into a spec and publishes it as a GitHub issue (the *epic*). |
| `/to-tickets` | Breaks the spec into tracer-bullet tickets with blocking edges, as linked GitHub issues. Each ticket is one PR. |
| `/triage` | Moves new issues (bugs, ideas from the parking lot) through the label state machine. |
| `/implement` | Builds a ticket, driving `/tdd` at the agreed seams and finishing with `/code-review` before the commit. |
| `/tdd` | Red → green → refactor, one vertical slice at a time. Mandatory for the domain and schema layers, default everywhere. |
| `/diagnosing-bugs` | Every bug: first a test that goes red on the bug, then minimise, hypothesise, fix, and keep the test as the regression guard. |
| `/code-review` | Two-axis review (standards + spec fidelity) run as the first review on every PR, before the human review. |
| `/improve-codebase-architecture` | Every few weeks; surfaces deepening opportunities in `domain/` and `data/`. |
| `/handoff` | End of a session: compact the state so the next session (or the other partner) can continue. |
| `/prototype` | For design questions with real trade-offs (e.g. quick-row layouts): several toggleable variations on one route, thrown away after the decision. |

**Taste Skill** (https://www.tasteskill.dev) for anything visual, as described in §5.1. Its pre-flight checklist (§14 of the skill) is pasted into the PR template for UI tickets and must honestly pass.

### 7.2 Repo documents

```
CONTEXT.md          shared vocabulary: "event", "complete", "combo", "claim", "ack",
                    "household bar", "quick row", "group task", "sub-item", "star"
docs/adr/           one file per decision (0001-google-sheet-as-mvp-database.md,
                    0002-append-only-events.md, 0003-vue-over-react.md, ...)
docs/design/DESIGN.md   tokens, dials, design read, reference screenshots
docs/specs/         specs published by /to-spec (mirrored from the issue)
.github/ISSUE_TEMPLATE/  feature.md, bug.md, design.md
.github/PULL_REQUEST_TEMPLATE.md
.github/CODEOWNERS  both partners own everything; UI paths also require the design checklist
```

### 7.3 Issue workflow

```
idea / bug
   │  /triage
   ▼
[needs-spec] ──/grill-with-docs──▶ [spec] ──/to-spec──▶ epic issue
                                                        │  /to-tickets
                                                        ▼
                                                   tickets (ready)
                                                        │
                                          branch  feat/123-short-name
                                                        │  /implement (+ /tdd)
                                                        ▼
                                                   PR (draft → ready)
                                                        │  /code-review, then human review
                                                        ▼
                                                   CI green → squash merge → deploy
```

Labels: `needs-spec`, `spec`, `ready`, `in-progress`, `blocked`, `bug`, `design`, `chore`, `good-first`. A ticket is a **work package**: one behaviour, one PR, finishable in an evening, with its acceptance criteria copied from §5.5 or the spec and written as the names of the tests that will prove it.

Ticket template (what `/to-tickets` produces, edited by hand if needed):

```
Title: Log a task from the quick row
Blocked by: #12 (event store), #14 (derive.ts balances)
Blocks:     #19 (undo toast)

Behaviour
  Tapping a quick-row task creates one `complete` event for the current user
  with the task's current points and updates the household bar from local state.

Tests that must go red first
  - domain: deriveState adds points to forUid for a complete event
  - store:  eventStore.complete(taskId) appends a valid ChoreEvent (Zod parse passes)
  - ui:     QuickRow emits complete with the task id on tap

Out of scope
  Undo (#19), long-press options (#21)

Done when
  - all three tests exist, were seen failing, now pass
  - vue-tsc, eslint, vitest, build all green in CI
  - screenshots light + dark attached (UI ticket)
  - reviewed by the other partner (or by /code-review + self if solo that week)
```

### 7.4 Branch, PR and merge rules

- `main` is protected: no direct pushes, PR required, 1 approving review, CI status checks required, branch must be up to date, squash merge only, linear history.
- Branch names: `feat/123-quick-row`, `fix/140-dst-week-boundary`, `chore/…`, `design/…`.
- Commits inside a branch are free-form; the squash commit message follows Conventional Commits (`feat(log): quick row logging (#123)`), which feeds `CHANGELOG.md` via changesets.
- PR template sections: *What* (one paragraph), *Why* (link to ticket), *Tests* (list the tests added and paste the red run output or CI link for the first failing run), *Screenshots light/dark* (UI), *Taste Skill pre-flight* (UI), *Risk* (data model? migration? rules change?).
- Review order: `/code-review` first (it catches the mechanical things), then the human reviewer reads for intent, naming against `CONTEXT.md`, and whether the tests would actually catch the bug the ticket describes.
- A PR that changes `schemas/` or `apps-script/` needs both partners' approval and an ADR if the change is not backward compatible.
- Deploy is the merge. Preview: each PR also deploys to `https://<user>.github.io/homecrew/pr-123/` via a second Pages job so it can be installed on a phone before merging.

### 7.5 Test discipline: red, then green, then it stays green

Every behaviour in this app is covered by a test that was **seen failing before the code existed** and passes afterwards. That is the definition of "covered" here; a test written after the fact that passes on first run has never demonstrated it can fail, so it proves nothing about regressions.

Rules:

1. **Red first, always.** Write the test, run it, confirm it fails *for the right reason* (a missing function fails differently from a wrong result; only the second counts). Then write the least code that passes. Then refactor with the test still green. `/tdd` enforces this loop.
2. **Bugs start with a regression test.** The first commit on any `fix/` branch is a test that reproduces the bug and fails on `main`. The fix is the second commit. The test keeps the name of the bug: `week boundary uses household tz across DST (#140)`.
3. **Tests describe behaviour, not implementation.** `deriveState gives undo'd events zero points`, not `calls filterUndone`. If a refactor breaks a test without changing behaviour, the test was wrong.
4. **No snapshot-only tests, no "renders without crashing" tests.** They go green on anything.
5. **One assertion of intent per test.** Multiple `expect`s are fine when they check one behaviour; three behaviours means three tests.
6. **Test data comes from Zod schemas.** Fixtures are built with a small `make(Task, overrides)` helper that parses the result, so a fixture can never be a shape the app would reject.
7. **Determinism.** Time is injected (`now: Date`), ids are injected, `Math.random` is banned in `domain/`. No test depends on wall-clock or on order of another test.

What each layer proves:

| Layer | Tool | What is tested | Regression it must catch |
|---|---|---|---|
| `domain/` | Vitest, table-driven | balances, rollups, combos, streaks, week/month boundaries, due logic, star vs point separation | any change in points math, double-counted bonus, off-by-one on Monday |
| `schemas/` | Vitest | accept/reject cases, round-trip serialize/parse, `v0 → v1` migration fixtures | a field renamed without a migration, points > 50 sneaking in |
| `data/` | Vitest with a fake `fetch`; Apps Script `runTests` function run against a scratch sheet before each deploy (manual) | repo writes parse before send, reads skip bad rows without throwing, outbox replays after reconnect and never duplicates, script rejects a wrong secret and a duplicate event id | a row that breaks the poll, an outbox replay that double-logs, a script change that opens the sheet |
| `stores/` | Vitest with `MemoryRepo` | actions append correct events, getters reflect derived state, undo window | undo appending the wrong ref, quick row learning from the wrong window |
| components | Vitest + `@vue/test-utils` | `TaskGroup` emits sub-item ids, ×2 badge, toast Undo wiring, `RewardCard` disabled reason | UI that emits the wrong task, claim button enabled with short balance |
| end-to-end | Playwright on the built PWA (one spec per page in §5.5) | two-tap log, offline log then reconnect, connect by setup link, claim/ack across two browser contexts, light/dark screenshots | broken service worker, hash route 404, theme regression |
| tokens | Vitest | WCAG contrast over `tokens.css` | a palette tweak that drops below 4.5:1 |

Gates in CI (all required for merge): `vue-tsc --noEmit`, `eslint`, `vitest run --coverage` with **100% line coverage on `domain/` and `schemas/`** (these are pure and small; anything untested there is a future argument about points), 80% elsewhere, Playwright smoke on the built bundle, contrast test. Coverage numbers are a floor, not the goal; the red-first rule is the goal.

Optional but recommended once the domain settles: **mutation testing** with Stryker on `domain/` once a month. It rewrites the code (flips `<` to `<=`, deletes a branch) and checks that some test goes red. A surviving mutant is a test that would not catch that regression; fix the test, not the mutant.

### 7.6 Definition of Done

A ticket is done when: the behaviour is in `main`; its tests exist, were seen red, are green, and are named after the behaviour; `CONTEXT.md` has any new term; an ADR exists if a decision was made; the PR has both-mode screenshots for UI; the preview build was installed on at least one real phone; and the other partner can explain what changed from the PR description alone.

---

## 8. A realistic weekly rhythm (the non-app part)

The app tracks; this is the operating plan it tracks against. Adjust freely.

**Daily non-negotiables (≈ 20 pts/day between two adults)**
- One laundry load moves one step (wash → dry → fold → away). One load a day beats three loads on Saturday.
- Kitchen Reset after dinner. Whoever cooked does *not* do the reset — swap. (Cook = 6, Reset ≈ 13–15; cooking is worth less because the app is trying to make the reset happen.)
- Floor pickup before bedtime routine (5 min, the 5-year-old helps for a star).
- Bottles/pump parts washed.

**Weekly slots**
- Mon: toilet + bathroom sink (quick)
- Tue: vacuum
- Wed: dust + computer table
- Thu: toilet again + towels
- Fri: fridge glance, meal plan, order groceries
- Sat: full bathroom, mop, sheets
- Sun: toys, kids' clothes check, week review (5 min, in the app, together)

**Monthly**: balcony, drawings/paintings, storage nibble (30 min, not the whole day), appliance day (descale coffee machine, dishwasher filter, dryer condenser, washing machine drum wash — do them all on the first Sunday and they stop being a mystery).

**The Sunday 5-minute review** is the actual feature. Open the Month view, look at the by-category split, ask two questions: *"What felt heavy this week?"* and *"What do you want to redeem?"* That's it. No scorekeeping arguments — the numbers already did that part.

---

## 9. Roadmap

### Phase 0 — Agree the rules (1 evening, no code)
- Go through §3 together, edit point values, delete tasks you don't do, add the ones missing.
- Pick 5 rewards each that you'd actually want.
- Set weekly target.
- Output: `seed.ts` data.
- Install both skill sets, run `/setup-matt-pocock-skills`, run `/grill-with-docs` on this Plan, publish the first spec + tickets. Write `CONTEXT.md` and the first three ADRs (Google Sheet as MVP database, already written as ADR-0001; append-only events; Vue).
- Set up the repo: branch protection, CI, PR/issue templates, `tokens.css` with both themes, `DESIGN.md` with the design read.

### Phase 1 — MVP (1–2 weekends)
- Vite + Vue 3 + TypeScript + Pinia + vite-plugin-pwa, hash router, dark theme.
- Zod schemas for Household/Task/Reward/Event; `MemoryRepo` + `SheetsRepo` behind the `HouseholdRepo` interface; outbox + snapshot in IndexedDB.
- Google Sheet with the tab layout from `docs/Architecture.md`, Apps Script deployed, setup-link flow, member pick. Seed the tasks and rewards tabs from `seed.ts` through the script's `seed` action.
- Log screen with categories, big buttons, toast + undo. Quick row.
- Today screen.
- Week overview: household bar, split, by-category.
- Domain layer (`derive.ts`, `combos.ts`) with Vitest tests.
- Deploy to GitHub Pages; install on both phones.
- Every item above is a ticket with red-first tests; nothing lands without a PR and review.
- **Success = both phones logging and seeing each other within 30 s, and instantly on opening the app,, in light and dark.**

### Phase 2 — Rewards & fairness (1 weekend)
- Schedule tab and the Next time? sheet (#64): `intervalDays`, `schedule`/`unschedule` events, away tasks folded on Category.
- Rewards catalog, claim/acknowledge flow, wallet.
- Kitchen Reset combo detection + bonus.
- Kudos 👏 (+1).
- Month view, heat-strip for counters.
- Backdating, "log for partner", kid star mode.
- CSV/JSON export.

### Phase 3 — Polish (as you feel like it)
- Streak bonus.
- Android app shortcuts (Kitchen Reset from the icon).
- Update toast.
- A 9 pm nudge via a time-driven Apps Script trigger (email or Google Chat), only if the habit isn't sticking.
- Move to Firestore or Supabase behind the same `HouseholdRepo` if live updates start to matter (ADR-0001 upgrade path).
- Auto-suggest "due" tasks based on `freq` and last completion (gentle, not nagging: a small dot on the category).

### Explicit non-goals
- No leaderboards, no "winner of the week", no shaming notifications.
- No time tracking / stopwatch. Points are agreed estimates, not measurements.
- No multi-household, no social features.

---

## 10. Open decisions

| Decision | Options | Lean |
|---|---|---|
| Framework | Vue 3 vs Svelte vs vanilla | Vue 3 + TypeScript (decided) |
| Data layer | Google Sheet + Apps Script vs Firestore vs Supabase | Google Sheet for the MVP (decided, ADR-0001) |
| Local store | idb-keyval outbox + snapshot vs Dexie | idb-keyval (decided; one queue, one snapshot) |
| Validation | Zod vs Valibot vs none | Zod (decided) |
| Styling | CSS tokens vs Tailwind v4 | CSS tokens (decided; ~10 components, tokens are the theme) |
| Icons | Phosphor vs Tabler vs Material Symbols | Phosphor (decided) |
| Issue tracker | GitHub Issues vs Linear vs local files | GitHub Issues (decided; same place as the code) |
| Push notifications | Web Push (needs a push server) vs Apps Script email nudge vs none | None in v1 |
| Identity | Shared secret + self-declared member vs Google sign-in | Shared secret for the MVP (decided, ADR-0001) |
| Cooking vs reset split | Cook 6 / Reset 14 as proposed, or equal | Decide in Phase 0 — this one matters for you specifically |
| Night feeds | Count per wake (3) vs flat "night duty" (8) | Flat per night is easier to log at 3 am |
| Kid points | Separate stars vs contribute to household | Separate; keeps the adult economy clean |

---

## 11. Ideas parking lot

- **"Invisible load" tasks**: booking appointments, remembering birthdays, restocking diapers. Add a category "🧠 Admin" with a generic 2-pt "handled a thing" button + optional note.
- **Photo proof for the satisfying ones**: clear counter photo attached to the reset. Not for checking — for the before/after dopamine. (A Drive folder next to the sheet, written by the script.)
- **Weekly auto-summary card**: shareable image "This week: 231 pts, 38 kitchen resets this month, counters clean 26/30 days."
- **Guest mode**: grandparents visiting can log without joining.
- **Reward calendar integration**: acknowledged claim creates a Google Calendar event on both calendars ("A: solo coffee, B: kids").
- **"Low battery" flag**: either partner can set a daily flag "running on empty" → the other gets a heads-up and the target for the day is halved. Cheaper than the argument.

---

## 12. Messes, standards and not fighting about it

The recurring friction (cutlery thrown in any way, pots left dry, trash left in the bathroom, things not put back) is the most common household argument there is, and it has a well-studied shape. This section is the app's answer to it, and the reasoning behind why the app deliberately does **not** have a "photo the mess, deduct points" feature.

### 12.1 What the research says

| Concept | Source | What it means for us |
|---|---|---|
| Loss aversion | Kahneman & Tversky, prospect theory | A deducted point hurts about twice as much as an earned point helps. Deductions create resentment, not habits. |
| Punishment vs reinforcement | Operant conditioning literature (Skinner onward) | Punishment suppresses behaviour only while the punisher is present and produces avoidance of the punisher. Reinforcement builds behaviour that lasts. |
| Criticism / contempt | Gottman Institute longitudinal couples research | Criticism ("you always leave...") and contempt are the strongest predictors of relationship failure. A photo of a mess with a countdown is both. |
| Actor-observer bias | Jones & Nisbett; attribution research | We explain our own lapses by circumstances ("I had the baby") and the other person's by character ("she is messy"). Both partners in this house currently do this. |
| Sleep deprivation and executive function | Sleep research (e.g. Walker; Killgore) | With a 6-month-old, both adults are cognitively impaired. Forgetting to put water in a pot is an executive-function failure, not a values statement. |
| Mental load / anticipation | Daminger 2019, "The Cognitive Dimension of Household Labor" | The invisible work is anticipating, deciding, monitoring. Whoever notices the mess is already carrying load; the app should hand the *task* over, not the *judgment*. |
| Minimum standard of care | Eve Rodsky, *Fair Play* | Conflict comes from unstated, different standards. Agree the standard once, together, per task. Then ownership is clear and reminders stop. |
| Implementation intentions | Gollwitzer 1999 | "When X, then Y" plans ("when I put a pot down, I fill it with water") roughly double follow-through versus intentions alone. |
| Friction / choice architecture | Thaler & Sunstein, *Nudge*; Fogg, *Tiny Habits* | Make the right action the easiest one. Most "won't" problems are "hard to" problems. |
| Chronotypes | Circadian research (Roenneberg) | People are reliably better at tasks in their alert window. Assign slots by when each person is actually functional. |

### 12.2 House standards (agreed once, shown in the app)

Each category screen has a small **Standard** card, written together in one sitting and editable by either partner with "proposed by" shown. Three lines maximum. Proposed starting set:

- **Kitchen**: pots and pans get water before they're left. Cutlery handles down in the basket. Food scraps go in the compost bin, not the sink; the strainer gets emptied by whoever fills it. Counter is "done" when nothing is on it except the coffee machine and the fruit bowl.
- **Bathroom**: bin bag goes out when the lid doesn't close; a spare bag lives under the bin. Hair from the shower goes in the bin, not down the drain (a drain catcher lives in the shower so this is a ten-second job). Used sanitary products go in the lidded sanitary bin next to the toilet, which always has a bag in it.
- **Floors**: whatever is on the floor at bedtime gets swept into the toy box, not sorted. Sorting is a separate task.
- **Laundry**: the hamper is the only place for dirty clothes. Anything on the floor is not laundry yet.

These are the *only* things either partner can point at. Everything else is preference, and preference is not a chore.

### 12.3 Loose ends: request with a bounty, never a deduction

Replaces the "photo + timer + deduct" idea with the same mechanics minus the punishment.

- Either adult can create a **Loose end**: optional photo, one line ("pan on stove, no water"), category. Two per person per day, hard cap. The cap is the feature; it makes the tool unusable for nagging.
- A loose end has **no owner and no blame**. Whoever clears it taps "Done" and gets **+2 points**, including the person who created it. Handling your own loose end is fine.
- Nothing is ever deducted. If a loose end is still open after 24 h it moves silently to a shared *Loose ends* list on the Today screen. No notification, no red badge.
- **Leave-no-trace bonus**: if the Loose ends list is empty at midnight, both adults get +5. Framed as gain, it targets exactly the behaviour the deduction was meant to target.
- Loose ends never appear in the Overview split. They are not a scoreboard.

Data model: one new event type `looseend` with `photoRef?`, `text`, `category`, plus `clear` events referencing it; the bonus is emitted by `combos.ts` with a deterministic id like the other combos. Photos go to a Drive folder next to the sheet (`looseends/{id}.jpg`, written by the script), resized client-side to 800 px, auto-deleted after 30 days.

### 12.4 Owned slots by chronotype

One partner is most functional late at night, the other runs out of steam after dinner. So:

- **Night owner** runs the Kitchen Reset after the kids are down: full 13 to 15 pts, every night, no negotiation. This is where most of the week's kitchen points live, so the night person will "win" the kitchen column, which is fine and correct.
- **Morning owner** runs the floor pickup, dishwasher unload, and first laundry step before daycare.
- Cooking and the reset are never done by the same person on the same night.

Owned slots are stored as `defaultOwner` on the task and appear as a small avatar on the task button. They are defaults, not locks; anyone can still log anything.

### 12.5 Tips feed

- One card per day on the Today screen, opt-in per person in Settings, dismissable, saveable to a personal "Saved tips" list.
- Content: short, practical, reel-style ("Five-minute counter reset: left to right, top to bottom"), pulled from a curated JSON file in the repo (`content/tips.json`, ~100 entries, both partners can add via PR).
- Rule: a tip is **never** triggered by a loose end, a request, or the other partner's action. The moment it becomes a delivery mechanism for a hint, it is criticism with extra steps. The feed is random, or keyed to the day of the week's slot (laundry tips on laundry day).
- Optional later: a "Try it" button that creates the task with a 2-point bonus the first week, using the implementation-intention pattern ("when I finish cooking, I fill the pan").

### 12.6 The conversation itself

The app cannot have this conversation for you, but it can make it short. Gottman's "soft start-up" is the evidence-based script: describe the situation (not the person), say what you feel, say what you need, in under a minute. "When the pans sit dry overnight, I spend ten extra minutes scrubbing in the morning and start the day resentful. Can we agree pans get water before bed?" Then stop talking.

Two things to expect and not fight: she will raise the baby, and she will be right that baby care is work. The app already counts it (Kids category, night wakes). If the Overview shows she is carrying the nights, that is data, not an excuse, and the fair response is to move a daytime slot to you, not to argue about the pan.

The weekly five-minute review (§8) is the only scheduled place for this topic. Outside it, use loose ends.

### 12.7 Pricing unpleasant tasks (the unpleasantness premium)

Some tasks are worth more because they are unpleasant, not because they are long. That is already in the pricing rule (§3) and it is fair to use it. The tasks below carry an explicit premium: the price is set for how much nobody wants to do them, so that doing them is clearly worth someone's while.

| Task | Pts | Friction fix that makes it a small job |
|---|---|---|
| Clear shower drain / hair catcher | 4 | Silicone drain catcher + small lidded bin within reach of the shower |
| Toilet (bowl, seat, outside, floor) | 4 | Brush and spray live next to the toilet, not under the sink; 2 min while the kids are in the bath |
| Clear food from sink + empty strainer | 2 | Strainer basket in the drain, compost bin under the sink with a lid; scrape plates into it before they reach the sink |
| Empty sanitary bin | 2 | Lidded sanitary bin next to the toilet with a roll of bags in the bottom; a bag is always ready |
| Empty diaper bin | 2 | Same: bags stored in the bin base |

Two guardrails so a price stays a price and does not become a message:

- **The same-hair test.** Set the price you would set if the hair, the crumbs or the sanitary bin were yours. Both partners approve any price change; "proposed by" is visible in the app. A price aimed at a person is noticed instantly and costs more goodwill than it buys.
- **Fix the friction first.** Every row above has a five-euro object that turns the job from unpleasant into small. Add the one-line standard, then the points become a bonus for a small job, which is what points are best at.

Behavioural note: paying for a task can crowd out intrinsic motivation, but nobody has intrinsic motivation to clear a drain or a sanitary bin, so points are the right tool here. They are the wrong tool when the real fix is a five-euro object, and they are the wrong tool entirely if the price list starts to read as a list of one person's habits. Set all of these prices in the same sitting, together, alongside the tasks the other partner finds unpleasant, so the premium list belongs to the house and not to a complaint.
