# HomeCrew design

Tokens, dials, design read, references, and the UI pre-flight for every screen in the app. This is the file `docs/Plan.md` §5 points at; the plan stays the source for product decisions, this file is the working reference for anyone touching UI.

Design work follows the Taste Skill (`.claude/skills/design-taste-frontend`). It is written for landing pages, so we take its discipline (brief inference, dials, anti-default rules, dark-mode protocol, pre-flight, "AI tells" list) and leave its React/Next defaults behind. The app is Vue 3 with plain CSS tokens.

## 1. Design read

Every UI ticket starts with this one line before any code, per Taste Skill §0.B:

> Reading this as: Android-native consumer utility for two tired parents, with a calm, warm, Material-3-flavored language, leaning toward native CSS tokens + Phosphor icons + restrained motion.

Dials (Taste Skill §1, §7):

| Dial | Value | Why |
|---|---|---|
| `DESIGN_VARIANCE` | 4 | Symmetric grid, predictable placement. Used one-handed at 9 pm with a baby on the other arm. |
| `MOTION_INTENSITY` | 3 | Presses, sheet open, one count-up. Nothing idle. |
| `VISUAL_DENSITY` | 5 | A category grid and a task list per screen; never a dashboard. |

This is not a portfolio piece. Consistency beats cleverness.

## 2. References

Palette and style come from the consistently top-rated organizer and chore apps on Google Play: Todoist, TickTick, Sweepy, Tody, Microsoft To Do, Notion. Reviewers praise the same traits, and those are what we copy.

| Trait shared by top-rated organizers | How we apply it |
|---|---|
| One neutral base (warm off-white / warm off-black), never pure white or black | `--bg` and `--surface` tokens below |
| One saturated brand accent used sparingly | One primary: FAB, active tab, household bar, primary buttons. Nowhere else. |
| Per-area colors as a secondary system (Sweepy's rooms, Tody's urgency colors) | Seven category colors, only on category tiles, chips and chart segments |
| Big, rounded, tappable cards; bottom navigation; one obvious action per screen | 16 px card radius, 48 px minimum touch target, bottom tab bar with 4 tabs + FAB |
| Progress shown as a single calm bar, not a dashboard | Household bar is the only chart on the Log screen |
| Dark mode that keeps the accent recognisable | Same hue, lifted lightness, in both themes |

Explicitly avoided (Taste Skill §9 plus our own): purple-to-blue gradients, glassmorphism, emoji as UI icons, three equal feature cards, confetti on every tap, leaderboards, red overdue badges. Badges nag, and streak burnout applies to exhausted parents.

## 3. Color tokens

CSS custom properties in `src/styles/tokens.css`, swapped under `[data-theme="dark"]`. Default follows `prefers-color-scheme`; Settings offers a manual override (system / light / dark). No hard-coded colors anywhere in SFCs. An ESLint `no-restricted-syntax` rule rejects hex literals in `<style>` blocks.

### Brand and neutrals

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F4EF` | `#131512` | App background (warm off-white / warm off-black) |
| `--surface` | `#FDFCF9` | `#1C1F1C` | Cards, sheets |
| `--surface-2` | `#EFECE4` | `#262A26` | Nested surfaces, chips, pressed state |
| `--border` | `#E1DDD3` | `#33382F` | Hairlines |
| `--text` | `#1E1D1A` | `#EDEBE4` | Primary text (contrast >= 12:1 on `--bg`) |
| `--text-2` | `#5F5C55` | `#A7A59C` | Secondary text (>= 4.5:1) |
| `--primary` | `#1F8A70` | `#4FD1B3` | Brand teal-green: FAB, active tab, household bar, primary buttons |
| `--on-primary` | `#FFFFFF` | `#0E2A23` | Text on primary |
| `--primary-soft` | `#DDF2EC` | `#1C3A33` | Tinted backgrounds behind primary content |
| `--points` | `#C98A1E` | `#F2B85B` | Points, coins, reward costs, streak |
| `--success` | `#2F8F4E` | `#6CCB8A` | Synced, acknowledged |
| `--warn` | `#B9741C` | `#E8A33D` | Pending sync, pending claim |
| `--danger` | `#B8433A` | `#F07A70` | Destructive actions only (reset data, decline) |

### Category colors

Secondary system. Each has a `-soft` tint for tile backgrounds.

| Category | Token | Light | Dark |
|---|---|---|---|
| Kitchen | `--cat-kitchen` | `#D9603F` | `#F08A6A` |
| Laundry | `--cat-laundry` | `#3F6FD4` | `#7FA3F0` |
| Floors | `--cat-floors` | `#7A5AD9` | `#A88DF0` |
| Bathroom | `--cat-bathroom` | `#2492A8` | `#5FC5D8` |
| Kids | `--cat-kids` | `#C9508C` | `#EA84B6` |
| Home | `--cat-home` | `#5A9A3A` | `#8FC96C` |
| Admin | `--cat-admin` | `#6B6F7A` | `#A0A4AE` |

Contrast is checked in CI with a small Vitest (`tests/tokens/contrast.test.ts`) that runs WCAG contrast math over the token file: every text token on every surface >= 4.5:1, every category color on its own `-soft` tint >= 3:1 (large text / icon threshold).

### tokens.css starting point

```css
:root {
  color-scheme: light;
  --bg: #F6F4EF;
  --surface: #FDFCF9;
  --surface-2: #EFECE4;
  --border: #E1DDD3;
  --text: #1E1D1A;
  --text-2: #5F5C55;
  --primary: #1F8A70;
  --on-primary: #FFFFFF;
  --primary-soft: #DDF2EC;
  --points: #C98A1E;
  --success: #2F8F4E;
  --warn: #B9741C;
  --danger: #B8433A;
  --cat-kitchen: #D9603F;
  --cat-laundry: #3F6FD4;
  --cat-floors: #7A5AD9;
  --cat-bathroom: #2492A8;
  --cat-kids: #C9508C;
  --cat-home: #5A9A3A;
  --cat-admin: #6B6F7A;

  --radius-card: 16px;
  --radius-button: 12px;
  --radius-chip: 999px;
  --radius-sheet: 28px;
  --gutter: 16px;
  --card-pad: 16px;
  --list-gap: 8px;
  --touch: 48px;
  --dur-press: 120ms;
  --dur-sheet: 200ms;
  --dur-count: 300ms;
}

[data-theme="dark"] {
  color-scheme: dark;
  --bg: #131512;
  --surface: #1C1F1C;
  --surface-2: #262A26;
  --border: #33382F;
  --text: #EDEBE4;
  --text-2: #A7A59C;
  --primary: #4FD1B3;
  --on-primary: #0E2A23;
  --primary-soft: #1C3A33;
  --points: #F2B85B;
  --success: #6CCB8A;
  --warn: #E8A33D;
  --danger: #F07A70;
  --cat-kitchen: #F08A6A;
  --cat-laundry: #7FA3F0;
  --cat-floors: #A88DF0;
  --cat-bathroom: #5FC5D8;
  --cat-kids: #EA84B6;
  --cat-home: #8FC96C;
  --cat-admin: #A0A4AE;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-press: 0ms;
    --dur-sheet: 0ms;
    --dur-count: 0ms;
  }
}
```

The `-soft` category tints are derived in CSS (`color-mix(in oklab, var(--cat-kitchen) 14%, var(--surface))`) so the token file stays at one value per category per theme. The `system` theme setting removes the `data-theme` attribute and lets a `prefers-color-scheme: dark` media block apply the same dark values.

## 4. Typography, spacing, shape, motion

- **Type**: `Inter Tight` for headings and numbers (tabular figures on, so points align), `Inter` for body. Self-hosted, `font-display: swap`. Scale: 12 / 14 / 16 / 20 / 24 / 32. Points on tiles are 20 semibold; the household number is 32.
- **Spacing**: 4 px grid; screen gutter 16; card padding 16; list gap 8.
- **Shape**: cards 16 px, buttons 12 px, chips 999 px, bottom sheet top corners 28 px (Material 3 sheet).
- **Elevation**: none in light except the bottom bar and sheets (one soft shadow). Dark uses surface tiers instead of shadows.
- **Motion**: 120 ms ease-out for presses, 200 ms for sheet open, points count-up on the household bar (300 ms). All animations gated by `prefers-reduced-motion`. No idle animation anywhere.
- **Icons**: `@phosphor-icons/vue`, weight `regular`, size 24 (20 in chips). One family; no hand-drawn SVG icons; no emoji as icons. Category glyphs: `CookingPot`, `TShirt`, `Broom`, `Bathtub`, `Baby`, `Plant`, `Notepad`, `Star`.
- **Copy**: short, no exclamation marks, no em-dashes or en-dashes in UI strings (Taste Skill §9.G), verbs first ("Log pots", not "Pots logged successfully!").

## 5. Core components

| Component | Behaviour |
|---|---|
| `AppShell` | Bottom tab bar (Log, Today, Overview, Rewards), center FAB "Kitchen Reset", top status strip (sync dot, update toast). Safe-area aware. |
| `HouseholdBar` | Single rounded bar, `--primary` fill, "187 / 250" in tabular numerals, tap to expand into member split. |
| `CategoryTile` | 2-column grid tile; category color icon on `-soft` tint; count of tasks done today as small avatars in the corner. |
| `TaskButton` | Full-width 56 px button: icon, name, points chip. Press: haptic + toast with Undo. Long-press: sheet (log for partner / kid, backdate, add note). Shows avatar dots for completions today. |
| `TaskGroup` | Parent card with sub-item chips (Bathroom, Hand-wash dishes). Chip tap logs the sub-item; chip supports a x2 badge; "Do all" logs everything plus the combo bonus. |
| `Toast` | Bottom, above tab bar, 4 s, one action (Undo). Queue of one; a new toast replaces the old. |
| `SplitBars` | Two horizontal bars per category, one per adult, same category color at two opacities. |
| `HeatStrip` | 7 or 30 squares, filled with `--primary` when counters were logged that day. |
| `RewardCard` | Name, cost in `--points`, commitment text, Claim button (disabled with reason if balance is short). |
| `Sheet` | Bottom sheet, 28 px top radius, drag handle, scrim. Used for every secondary action so the main screens stay two-tap. |
| `EmptyState` | Icon + one sentence + one action. Never a blank screen. |

Screens, their layouts, states and acceptance criteria are in `docs/Plan.md` §5.5. Routes are hash routes (`#/log`, `#/today`, `#/overview`, `#/rewards`, `#/kid`, `#/settings`, `#/welcome`).

## 6. Dark mode protocol

Dual-mode from the first commit, following Taste Skill §8:

- Semantic tokens only (`--surface`, `--text`, `--primary`), never raw colors in components.
- Hierarchy parity: if the FAB is the loudest thing in light it is the loudest thing in dark.
- Brand fidelity: teal stays teal, lifted in lightness, never desaturated to grey.
- No pure `#000000` or `#FFFFFF` on surfaces or backgrounds.
- Default follows the system. A manual toggle exists because the app is used at night and some phones lack scheduled dark mode.
- Every PR that touches UI attaches screenshots in both modes. The CI visual check renders `#/log` and `#/overview` in both themes with Playwright and fails on missing tokens (any computed color not derived from a custom property).

## 7. Accessibility

- Touch targets >= 48 px, focus rings visible for keyboard and switch users.
- All icons carry `aria-label`; category color is never the only signal (icon + label always present).
- Text scales with system font size up to 200% without clipping the tile grid (grid collapses to one column at large sizes).
- `prefers-reduced-motion` disables count-ups and slide-ins.
- Screen reader announces toasts (`role="status"`).

## 8. UI pre-flight (paste into the PR for every UI ticket)

Adapted from Taste Skill §14 for an installed PWA. The landing-page rows (hero, logo wall, bento, marquee) do not apply here and are dropped. Every remaining box must honestly pass, or the PR is not done.

- [ ] Design read declared at the top of the ticket or PR, dials stated (4 / 3 / 5 unless argued otherwise)
- [ ] Zero em-dashes or en-dashes in any visible string (UI copy, empty states, toasts, aria-labels)
- [ ] No hard-coded colors; every color comes from a token in `tokens.css`
- [ ] One accent (`--primary`) used only for FAB, active tab, household bar, primary buttons
- [ ] Category color appears only on tiles, chips and chart segments, always beside an icon and a label
- [ ] One radius system: 16 card / 12 button / 999 chip / 28 sheet
- [ ] Every touch target >= 48 px; every text on its surface >= 4.5:1; contrast test green
- [ ] Icons from `@phosphor-icons/vue` only, weight regular, no hand-rolled SVG, no emoji as icons
- [ ] Every animation justified in one sentence; all gated by `prefers-reduced-motion`; nothing idle
- [ ] Empty, loading (offline / from cache) and error states present for every new screen or list
- [ ] Rendered and screenshotted in light and dark, both attached to the PR
- [ ] Safe-area insets respected; nothing hidden behind the gesture bar or the bottom tab bar
- [ ] Copy re-read: verbs first, no exclamation marks, no filler ("successfully", "awesome")
- [ ] No AI tells from Taste Skill §9: gradients, glassmorphism, three equal cards, decorative dots, confetti
