# Wake — Project Charter

> Speed, time **and fuel-consumption** planner for the **Solstice-class fleet** (5 ships). Combined
> project: the voyage grid/workspace of `~/Projects/voyage-speed-template` (Speed Templates) merged
> with the consumption engine and parameter surface of `~/Projects/voyage-planner` (SL Class Voyage
> Planner). Both originals remain untouched. Same engineering philosophy as
> `~/Projects/Voyage_Tracker_v8`: static, no backend, JSON is the record.

**Naming:** the product is **Wake** (renamed from "Speed Planner SL", 2026-07-06). Display name and
version live in `src/appMeta.ts` (shown greyed next to the wordmark). The bundle `APP_ID` stays
`'voyage-speed-planner-sl'` deliberately — it is stamped inside saved `.json` files.

## 1. What this app is

A static SPA that plans each voyage's legs and solves the **speed ↔ ETA/time** relationship over
every passage, and — on the **Consumption** command — computes the voyage's fuel burn per leg and
per fuel with the SL Class engine model (see §8). A port leg's passage runs from the **previous** port's **FAW** (Full Away) to this
leg's arrival; all timestamps convert to absolute UTC minutes via each leg's **UTC offset**, so a
mid-crossing timezone change is exact. Two solve directions per port leg:

- **SPD** mode — operator enters the times → Speed (kn) is computed.
- **TIME** mode — operator enters a target Speed → ETA is computed.

It also splits the maneuvering (**St/By**) phase per port call into **Arrival** (`Arr − ETA`,
pilot→berth) and **Departure** (`FAW − Dep`, berth→pilot); each takes a manual distance and the app
computes the slow maneuvering speed (distance ÷ that time). **Overnight port stays** span two date
rows (as in the Excel template): the arrival row has Arr but no Dep/FAW, the next row has Dep/FAW
but no ETA/Arr — port time then runs from the first row's Arr to the second row's Dep
(`portOvernight` on the LegView; the continuation row has no passage of its own, and the FAW carry
for the next passage comes from the departure row).

**Folder-backed (the live record).** On sign-in the operator picks a **folder**; every `.json` in it
is read and shown as a **file → voyages tree** (files chronological, voyages by start date). Edits,
new voyages, and pasted voyages write **straight back** to the originating file in the folder (no
backend, no database; localStorage holds only the lightweight session). Voyages can be **copied from
one file and pasted into another**, renaming + re-dating on paste. The fleet's official **Excel
(.xlsx)** template export remains. Each `.json` still carries a `shipId` (shown as a tag) — ship is no
longer part of identity or a per-ship workspace boundary; the folder is. Chromium/Edge only (File
System Access directory + file write).

## 2. Tech stack

- React 19 + Vite 7, `@vitejs/plugin-react`
- Tailwind CSS v4 (CSS-first; palette + fonts as theme tokens in `src/index.css`)
- TypeScript (strict) + Vitest
- Fonts: Manrope (UI) + IBM Plex Mono (numerics)
- `vite.config.ts` `base: './'` (relative) — runs from a GitHub Pages subpath **and** from a
  corporate network share. Do not hardcode an absolute base.

## 3. Architecture

- **`src/domain/`** is the brain and is framework-free:
  - `time.ts` — `dayNum`, `hhmmToMin`, `minToHHMM`, `fmtHM`, `instUTC`, `fmtDate`.
  - `calculations.ts` — `computeVoyage(voyage) → { legViews[], summary }`. **The single source of
    truth for every displayed number.** Ported verbatim from the design artifact's `compute()`.
    Locked by `calculations.test.ts`. Change numbers here, never in components.
  - `password.ts` — the daily gate (see §5).
  - `schedule.ts` — sidebar quarter grouping. `seed.ts` — `seedForShip()` returns empty (the app
    ships no demo data); `seedVoyages()` remains only as a unit-test fixture (tree-shaken from prod).
- **`src/storage/`** — `workspace.ts` (**folder layer**: `pickWorkspaceDir`, `readWorkspace` =
  parse every `.json` sorted chronologically, `writeWorkspaceFile` = write a file's bundle back in
  place, `createWorkspaceFile`), `bundle.ts` (JSON shape + validation, mirrors v8's `exportImport.ts`),
  `excel.ts` (Excel export — see §7). `jsonFile.ts`/`persist.ts`/`seed.ts` are legacy single-file/
  per-ship modules, no longer wired into the app (kept for reference/tests).
- **`src/hooks/useWorkspace.ts`** — the state machine: dir handle + files, selection (file + voyage),
  leg mutations, lock/version + daily-password edit gate, **cross-file copy/paste**, debounced
  write-back to disk (~1s; `Save` flushes now; a `beforeunload` guard in `App.tsx` warns if the tab
  closes while a write is still queued), and Excel export. Components are presentational.
- **`src/components/`** — `App.tsx` composes Header + Sidebar + main (CruiseCard, SummaryCards,
  LegsTable/LegRow, VersionHistory, MathExplainer) + `EditPasswordModal` (edit gate) + UnlockModal +
  Toast. The app opens read-only; there is no entry gate (see §5).

## 4. Data model

A **Leg** (`src/types.ts`) is one table row. `type` ∈ `Port | Sea | Tender` (Tender computes like a
Port); `mode` ∈ `speed | time`. Times are `HH:MM` strings; `utc` is signed hours as a string;
`openLoop`/`seaCond` are `HH:MM` durations. A **Voyage** holds `legs[]`, `versions[]`, `locked`,
`ended`, `loggedBy`. The on-disk **Bundle** is `{ bundleVersion, app, exportedAt, selectedId,
voyages }`; `parseBundle` also accepts a bare single-voyage JSON (permissive import, v8-style).
`parseBundle` **normalizes every voyage and leg on read** — `type`/`mode` are clamped to known
values and all leg fields coerced to strings — so a hand-edited file can't crash a row.

## 5. Access model — identify, open read-only, password-on-edit

The app **opens in VIEW mode**. There is no entry password; the daily password is requested only
when an allowed user enables editing.

1. **Identify** (`LandingScreen` → `useSession`): enter name + pick role (no ship). Persisted in
   `localStorage` (`vst_session`).
2. **Choose folder** (`FolderGate` → `useWorkspace.openFolder`): pick the folder of `.json` files —
   the live record (§1).
3. **Enable Edit** (`EditPasswordModal`, wired in `useWorkspace`): clicking *Enable Edit* prompts for
   the **daily password** — **`bridge` + today's local date (`YYYY-MM-DD`)**, e.g. `bridge2026-06-25`
   (`domain/password.ts`). On success the session is stamped edit-authorised in `sessionStorage`
   (`vst_unlocked` = today's date), so it is asked at most once per day; it re-prompts after local
   midnight — re-checked on window focus/visibility and a timer, so a tab left open past midnight
   also drops back to VIEW mode. If the current voyage is locked, accepting the password also unlocks
   it (version note "Edit enabled"). **Enable Edit** is reachable even with no file selected, so an
   empty folder isn't a dead end (the empty-state also offers a *New .json file* button).

**Roles** (`domain/roles.ts`): Admin, Master, Navigation Officer, Environmental Officer may
unlock/edit; **Marine is view-only**. `editable = !locked && roleCanEdit && editAuthorized`. The role
gates the Enable Edit/Lock toggle, New Voyage, JSON Open, and all inputs. Name + role are stamped
into `loggedBy` on every committed change (lock/unlock/new voyage), so the on-disk record carries
attribution.

**Neither the password nor the role is real security** — the keyword is shared, the date is public,
and roles are picked at the landing screen with nothing verifying them. They are workflow guards.
Real access control is the workstation (Windows lock / share ACL), same stance as v8's "Edit Mode is
a guard, not a boundary." No secret is stored. If a real barrier is ever needed, replace these
modules; do not pretend the current gates are ones.

## 6. Conventions

- All math lives in `domain/calculations.ts` + `domain/time.ts` and is unit-tested. Never compute
  voyage numbers inside a component.
- Visual target = the design artifact at 1380×900. Palette/fonts are theme tokens in
  `src/index.css`; use Tailwind utilities against them, with a few arbitrary pixel widths for the
  dense table.
- **Contrast is axe-verified (0 violations, WCAG AA).** Text colors must come from the theme tokens
  (`text-muted`, `text-faint`, `var(--color-*)`), never from raw hex or `opacity-*` dimming — the
  tokens carry per-theme overrides (Harbor [default] / admiralty / console) tuned to ≥ 4.5:1 on their own
  surfaces. Text on tinted chips mixes ink in (`color-mix(in srgb, <tint> 40%, var(--color-ink))`).
- Content comes from the chosen **folder** of `.json` files (§1) — one tree of files → voyages. Ships
  (`domain/ships.ts`) survive only as a `shipId` tag per file + for Excel naming. Crews add voyages
  with New Voyage (into the selected file) or by pasting a copy from another file. Legs are free-text
  ports (no catalog).
- **Accessibility conventions** (2026-07-19 pass against the Vercel web-interface-guidelines; keep
  new UI to them):
  - Titles are real headings: `<h1>` on Landing/FolderGate (App keeps one sr-only `<h1>` per screen),
    `<h2>` for every dialog and panel title (`aria-labelledby` targets included).
  - Never `outline-none` without a focus replacement — the global `:focus-visible` ring in
    `index.css` is the default cue; `focus:border-cyan` alone is not enough. Exception: the skip-link
    target `<main tabIndex={-1}>`, focused only programmatically.
  - Backdrop click-catchers are `<button aria-label="Close">` **siblings** of the panel (never a
    wrapper — that nests button-in-button), plus Escape-to-close; modals go through
    `useModalDialog` (focus trap + restore).
  - Async updates announce themselves: `aria-live="polite"` / `role="status"` on the stale banner,
    warnings, and unsaved indicators; decorative glyphs get `aria-hidden`.
  - Destructive actions confirm first: leg delete (portalled from the row) and cruise delete both go
    through `ConfirmModal`.
  - No bare `transition` (= `transition: all`) — name the properties (`transition-[filter]`,
    `transition-colors`); the skip-link animates `transform`, not `top`.
  - Non-auth inputs carry a `name` + `autoComplete="off"`; placeholders show an example and end
    with `…`; user-supplied strings truncate/`break-words` (route chips, filenames, version notes).

## 7. Excel round-trip (`src/storage/excel.ts`)

Imports and exports the fleet's official **Speed Templates** workbook 1:1 (layout, fonts, colours,
formulas). **Write/export uses `exceljs`** (styled output); **read/import uses `SheetJS` (`xlsx`)** —
exceljs's `xlsx.load` hangs in-browser under Vite, while SheetJS reads reliably. Both are lazy-loaded
via dynamic `import()` (own chunks). `parseSheet` is a pure, bounded cell-accessor parser shared by
the read path; `parseWorkbook` feeds it SheetJS cells.

**Workbook = one sheet per voyage** (sheet name = voyage id). Per sheet: R1 ship name (navy
`#002060` fill, white Arial 24), R5 start port, R6 date range, R7 headers, data rows from R8, then a
`Total:` SUM row. Columns **A–P**: `Date`(weekday A + date B) · `Port` · `Type` (D=port, C=sea,
T=tender) · `Distance` · `Time`(formula `=(24/24+H{r}-K{prevPort})+N-M/24`) · `Speed`(formula
`=E/F/24`, `0.0`) · `ETA`(red) · `Arrival` · `Departure` · `FAW`(red) · `Sunrise` · `Sunset` ·
`ZT`("UTC -5") · `Remarks` · `Open Loop Time` (**decimal hours**, e.g. 6.5 = 06:30). Embark/disembark
rows are navy with white text; port-call names use Century Gothic; Speed has a conditional format
`> 20 → light-red fill / dark-red text`.

**Field mapping** is in `excel.ts` (`typeToCode`/`codeToType`, `utcToZT`/`ztToUtc`,
`hoursToHHMM`/`hhmmToHours`). The Time/Speed formulas are written so Excel recomputes natively, and
ignored on import (the app recomputes). **The template has no columns for St/By Arr/Dep distances or
Sea Condition** — those are app-only fields, kept in the app + the `.json` record but intentionally
NOT in the Excel file (the `.json` bundle is the lossless record; Excel is the official report).

Import detects the ship from the title (e.g. "Celebrity Eclipse" → `EC`) and writes the imported
voyages as a **new `.json` file in the folder** (`useWorkspace.doImportExcel` → `createWorkspaceFile`),
then selects it. Round-trip is locked by `excel.test.ts` (exceljs build → SheetJS parse).

The consumption fields (`stbyArrPowerMW`/`stbyDepPowerMW` on legs, `consumptionOverrides`/
`consumption` on voyages, `consumptionDefaults` on the bundle) join `stbyArrDist` in the
**app-only** bucket: kept in the `.json` record, intentionally NOT in the Excel file.

## 8. Consumption model (`src/domain/consumption/`)

The SL Class engine, ported verbatim from `~/Projects/voyage-planner` (4 × Wärtsilä 16V46,
`NOMINAL_KW = 16800`; DG3 MGO-locked — no HFO bunker line; DG4 open-loop scrubber only):

- `trialData.ts` — FAT curves (speed → prop kW, load fraction → SFOC g/kWh).
- `interpolation.ts` / `loadSharing.ts` / `consumption.ts` — the shared plant core
  `computePlantConsumption(totalKW, engines, sfocDet, minEngines)` → `CalculationResult` (per-fuel
  t/h, per-DG loads, overload flags): selects DGs from the real lineup (fuel-priority, availability)
  and load-shares. Every phase is a thin wrapper = a power demand + a lineup **transform** + a
  minimum-DG floor. `computeConsumption` (sea) wraps it with the speed-derived demand;
  `computePortConsumption` (Port/Tender) wraps it with `harbourEngines` (forces every DG to the
  configured `inPortFuel`, clamped to each DG's legal fuels) + the port boiler. `closeLoopEngines`
  (forces DG4 HFO→MGO) is applied by every St/By phase and by the close portion of a sea leg. Load
  limits HFO/LSFO 0.8, MGO 0.7; selection priority HFO → LSFO → MGO; min 2 DGs at speed (St/By floor
  = `stby.engineCount`). Boiler rates (`portBoilerRate` 0.20, `seaBoilerRate` 0.14 t/h MGO) are
  settings. The old abstract `computeStaticConsumption`/`computeStbyConsumption` (count + single fuel
  + MGO-escalation loop) are gone — extra MGO DGs are now emergent from fuel-priority selection over
  the closed-loop lineup.
- `blend.ts` — a leg's `openLoop` hours split it into pure-open / 2 h changeover (50/50 blend) /
  pure-close portions (extracted from the SL planner's SeaLegPlanner).
- `settings.ts` — `resolveSettings(defaults, overrides)`: **ship defaults live on the bundle file**
  (`consumptionDefaults`), **per-voyage overrides on the voyage** (`consumptionOverrides`); merged,
  clamped to `SETTING_RANGES`, illegal fuels corrected. Tolerant normalizers for bundle parsing.
- `voyageConsumption.ts` — `computeVoyageConsumption(voyage, settings)` maps `computeVoyage`'s leg
  views onto the engine. Per port call: **Sea passage** (passage hours × blended open/close rates at
  the solved or target speed, + the sailing boiler), **St/By arrival/departure** (power =
  per-leg MW override, else speed-derived `interpPropPower(stbySpeed) + propAux +
  thrusterAvgKW(hours) + hotelLoad` when a St/By distance exists — prop auxiliaries run during
  St/By too (CE) — else the `stby.avgPowerMW` fallback; that power is met by the **closed-loop
  lineup** `closeLoopEngines(settings.engines)` with a `stby.engineCount` floor, so the fuel mix and
  availability come from the real DGs), **Port stay** (hotel DGs on the `inPortFuel` harbour lineup +
  port boiler; **Tender legs** instead run the tender plant — a 2nd DG always online with
  a fixed total output, CE 2026-07-07: 11,000 kW on 2 DGs, `settings.tender`). Produces the
  `VoyageConsumption` snapshot: resolved settings, per-leg phases with DG breakdowns, totals by
  fuel, warnings, and an `inputSignature` used to flag the report **stale** when legs/parameters
  change after a run.

**Maneuvering assumptions (Chief-Engineer-validated, 2026-07-07)** — the trial curve only knows
the propeller, so St/By phases add a thruster **profile** instead of a flat allowance:
`thrusterIdleKW` (default 1,080 = 3 × 360 kW) for the whole phase except the final 30 minutes,
which run at `thrusterHighKW` (default 9,000 = 3 × 3,000 kW); `thrusterAvgKW` time-weights the two
(a ≤ 30 min phase is all high output). Both are visible and editable in Fuel Setup. Standby is
modeled **closed-loop at all times** and runs the **real DG lineup**: the St/By demand is fed to the
shared core against `closeLoopEngines(settings.engines)` with a `stby.engineCount` floor, so the fuel
split follows the lineup (DG1/DG2 stay HFO, DG3 MGO-locked, DG4→MGO) and honours DG availability —
e.g. with one HFO-capable DG offline the plant runs 1×HFO + 2×MGO. Boilers: **port 0.20 t/h**,
**sailing 0.14 t/h**, both MGO, now editable ship-default + per-voyage settings (`portBoilerRate` /
`seaBoilerRate`). In-port fuel is a policy setting `inPortFuel` (default MGO) forced on every DG in
port + tendering via `harbourEngines`. **Behaviour shift (CE-confirmed 2026-07-07 — St/By runs the
sea lineup, closed-loop):** St/By previously ran a fixed `stby.fuelType` (MGO) with an MGO-escalation
loop; it now inherits the sea lineup's HFO on DG1/DG2, so an existing all-MGO-standby setup shifts to
a mixed HFO/MGO split — voyage total tonnage barely moves (SFOC is fuel-independent) but the HFO/MGO
attribution changes. The CE chose this (St/By keeps the sea fuel) over forcing harbour MGO on
maneuvering; if that ever reverses, apply `harbourEngines(inPortFuel)` to St/By instead of
`closeLoopEngines`.
These replaced the pre-2026-07-07 `maneuverAuxKW` (2,000 kW flat) and 0.18 t/h port-only boiler; old
snapshots flag stale and recalculate, and old files carrying `maneuverAuxKW` (or a pre-core snapshot
lacking the per-phase `result`) drop it on read (tolerant normalizers).

UI: **Fuel Setup** (`ConsumptionSettingsModal`, ship-defaults + this-voyage tabs with override
pills) and **Consumption** (runs the calc; in edit mode the snapshot + a version entry persist to
the voyage, in view mode the result shows transiently). The main area under the CruiseCard is a
**two-tab view**: *Ports & Times* (summary cards + legs grid + version history) and *Fuel
Consumption* (`ConsumptionReport` rendered inline; empty state offers Calculate; the tab shows an
amber dot when the snapshot is stale). `useWorkspace.showReport` is the active-tab flag and resets
to Ports & Times on voyage change. **Saving parameters auto-recalculates**:
`setConsumptionDefaults`/`setVoyageOverrides` refresh the current voyage's existing snapshot
immediately, so a persisted report never sits on old parameters (leg edits still go through the
stale banner → Recalculate). `ConsumptionReport` is the only results
surface (no legs-table columns / summary cards / Excel changes); its per-leg St/By MW inputs are
the one edit affordance. Fuel colors are stable: HFO orange, MGO green, LSFO indigo.

**Bundle v2**: `parseBundle` accepts v1 (consumption fields absent) and v2; always writes v2. The
snapshot's numbers are trusted on read, its envelope validated — garbage blobs drop, never crash.
A snapshot from before the shared-plant-core rewrite (St/By/Port phases lacking the per-phase
`result: CalculationResult` the report renders) is dropped whole on read, so the report falls back to
its empty state and the user recalculates rather than crashing.

The engine is golden-locked via the **sea** cases: `consumption.test.ts` pins `computeConsumption`
rates (speed 15/22/0) captured from the reference engine in `~/Projects/voyage-planner`, and these
proved the shared-core extraction faithful. If numbers must change, change them there first or
document the divergence. **Documented divergences (CE assumptions, 2026-07-07):** port boiler
0.20 t/h vs the reference's 0.18, the sailing boiler (reference has none), the thruster profile
replacing the flat maneuvering aux, and the lineup-driven St/By/Port model (real closed-loop /
harbour lineup with availability, replacing the reference's abstract count+fuel and the app's earlier
MGO-escalation loop). The DG SFOC/load-sharing math itself remains golden-locked. **CE-confirmed
2026-07-07:** St/By keeps the sea lineup's HFO (closed-loop), so existing all-MGO-standby setups
re-attribute St/By burn from MGO to HFO (total tonnage unchanged).

*Last updated: 2026-07-19.*
