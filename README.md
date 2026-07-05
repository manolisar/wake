# Speed Planner SL

A static, single-page **speed & time planner** for the **Solstice-class fleet** (5 ships).
Each voyage is a list of legs (port calls, at-sea days, tender/anchorage calls); the app solves
the **speed ↔ ETA/time** relationship over each passage using the time since the previous port's
**FAW** (Full Away) and per-leg **UTC offsets**, so timezone changes across a crossing are exact.

Built to the same philosophy as **Voyage Tracker v8**: no backend, no database — a static bundle
that reads and writes plain **`.json`** files in a folder you choose. The folder is the live record:
every `.json` in it is shown as a **file → voyages tree**, and edits write straight back to the
originating file (Chromium/Edge File System Access).

## Features

- Live, dependency-free calculations per leg:
  - **SPD** mode — enter the times, the app computes **Speed** (kn).
  - **TIME** mode — enter a target **Speed**, the app computes the **ETA**.
  - **St/By split** — Arrival (`Arr − ETA`, pilot→berth) and Departure (`FAW − Dep`, berth→pilot)
    maneuvering phases, each with a manual distance and a computed maneuvering **speed**.
  - Per-leg **Port hours**, **Daylight** (sunset − sunrise), Open Loop / Sea Condition.
- Seven summary cards (port calls, distance, average speed, steaming/St-By/port time, sea condition).
- **Folder-backed**: pick a folder of `.json` files; the sidebar shows them as a tree (files
  chronological, voyages by start date). Each file carries a `shipId` tag (1 of 5 Solstice-class) —
  the ship is a label, not a workspace boundary.
- Add templates into the selected file, create new `.json` files, and **copy a voyage from one file
  and paste it into another** (renamed + re-dated on paste). Search across all cruises and ports.
- **Lock / Edit** workflow with a reason-logged **version history**, stamped with the signed-in user.
- Edits, pastes, and new voyages **write straight back to disk** (debounced ~1s; **Save** flushes now).
  The `.json` bundle is the lossless record — no localStorage autosave, no database.
- **Excel round-trip** — **Import** the fleet's official Speed Templates `.xlsx` and **Export** back
  in the exact same format and colours (navy title, red ETA/FAW, live Time/Speed formulas, Total
  row, Speed > 20 highlight). One sheet per voyage; import detects the ship from the title. Excel
  handling uses `exceljs`, lazy-loaded so it never weighs down the initial page.

## Access model — identify, open read-only, password-on-edit

The app **opens in VIEW mode** — there is no entry password.

1. **Identify**: enter your name and pick a role (no ship).
2. **Choose a folder** of `.json` files — the live record.
3. **Enable Edit**: clicking *Enable Edit* prompts for the **daily password** — the steady keyword
   **`bridge`** followed by **today's date** in `YYYY-MM-DD`, read from the local machine clock.

> Example — on 25 Jun 2026 the password is `bridge2026-06-25`.

Once accepted, the session is edit-authorised for the rest of the local day (asked at most once per
day; it re-prompts after local midnight, including in a tab left open). If the current voyage is
locked, accepting the password also unlocks it.

**Roles:** Admin, Master, Navigation Officer, and Environmental Officer may edit; **Marine is
view-only**. Your name + role are stamped on every committed change.

**This is a convenience gate, not real security** — the keyword is shared, the date is public, and
roles are self-selected with nothing verifying them. Real access control onboard is the workstation
itself (Windows lock screen / share ACL), as in v8. No secret is stored; the password check is a
plain client-side string compare (`src/domain/password.ts`). If you need a genuine barrier, replace
these with a real auth layer.

## Tech stack

React 19 · Vite 7 · Tailwind CSS v4 (CSS-first) · TypeScript · Vitest.
`vite.config.ts` uses a **relative base** (`base: './'`) so the built bundle runs both from a
GitHub Pages subpath and when opened from a corporate network share / static host.

**Browser:** the folder workflow uses the File System Access directory + file-write APIs, so it
needs a Chromium browser (**Chrome/Edge only**).

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm test             # math + password + bundle unit tests
npm run build        # production bundle in dist/
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml` (lint → typecheck → test → build → Pages).
For a network-share deployment, run `npm run build` and copy `dist/` to the share — the relative
base means it runs from any path.

## Layout

```
src/
├── domain/        time, calculations (the solver), password, roles, schedule, ships
├── storage/       workspace (folder layer: read/write .json files), bundle (JSON shape +
│                  validation), excel (xlsx I/O), idbHandle (remember last folder)
├── hooks/         useWorkspace (state machine: selection, leg mutations, lock/version,
│                  daily-password edit gate, cross-file copy/paste, debounced write-back),
│                  useSession, useTheme
└── components/    LandingScreen, FolderGate, Header, Sidebar, CruiseCard, SummaryCards,
                   LegsTable/LegRow, VersionHistory, MathExplainer, EditPasswordModal,
                   UnlockModal, PasteVoyageModal, Toast, Icons
```

> Note: `storage/persist.ts`, `jsonFile.ts`, and `seed.ts` are legacy single-file/per-ship modules
> kept for reference/tests — they are no longer wired into the app.

The calculation engine (`src/domain/calculations.ts`) is a pure function over a voyage and is the
single source of truth for every displayed number; `src/domain/calculations.test.ts` locks the
results.
