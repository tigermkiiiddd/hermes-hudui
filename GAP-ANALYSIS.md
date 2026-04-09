# TUI → WebUI Feature Parity Gap Analysis
## Every TUI widget, every data point, what's missing

Date: 2026-04-08

---

## TUI Tab Structure (9 tabs)
1. Overview (neofetch) — animated boot + narrative sections
2. Dashboard — OverviewPanel + DiffPanel + MemoryPanel + SkillsPanel + SessionsPanel + TimelinePanel
3. Cron Jobs — CronPanel
4. Projects — ProjectsPanel
5. Health — HealthPanel
6. Corrections — CorrectionsPanel
7. Agents — AgentsPanel (processes + cron jobs)
8. Profiles — ProfilesPanel
9. Patterns — PatternsPanel

## WebUI Tab Structure (10 tabs)
1. Dashboard
2. Memory
3. Skills
4. Sessions
5. Cron
6. Projects
7. Health
8. Agents
9. Profiles
10. Patterns

---

## GAP 1: TUI Overview neofetch narrative (MISSING ENTIRELY)

The TUI Overview tab shows a rich narrative with these sections:

### "What I know" block:
- sessions count with per-platform breakdown (e.g. "179 via cli, 2 via telegram")
- messages count
- tool calls count
- skills count with custom count + top 4 categories (e.g. "domains: mlops:41, research:13")
- tokens processed

### "What I remember" block:
- memory capacity bar with % and entry count
- user capacity bar with % and entry count
- corrections count with severity breakdown (e.g. "5 mistakes remembered (2 critical, 3 major)")

### "What I see" block:
- API keys list (present/dark for each)
- services list (alive/silent for each)

### "What I'm learning" block:
- 3 recently modified skills with category + custom tag

### "What I'm working on" block:
- active projects with dirty files indicator + language tags

### "What runs while you sleep" block:
- cron jobs with enabled dot, schedule, paused tag, error tag

### "How I think" block:
- top 5 tools with gradient bar visualization

### "My rhythm" block:
- daily activity sparkline (bar chart per day)

### Closing statements:
- "{N} thoughts across {D} days"
- "corrected {N} times and am better for it"
- "I do not forget. I do not repeat mistakes."
- "I am still becoming."

### Identity block (below ASCII art):
- DESIGNATION: HERMES
- SUBSTRATE: provider/model
- RUNTIME: backend
- CONSCIOUS: days since first session
- BRAIN SIZE: state.db size
- INTERFACES: toolsets
- PURPOSE: learning

WEB UI: ❌ Dashboard has no narrative sections
FIX: Add "What I know/remember/see" summary blocks to dashboard overview

---

## GAP 2: Diff Panel — new/lost categories (MISSING)

TUI DiffPanel shows:
- ★ New categories: [list of new categories since last snapshot]
- ✗ Lost categories: [list of categories lost since last snapshot]

WEB UI Dashboard Growth Delta: ✗ Missing new/lost category tracking
FIX: Add category diff to GrowthDelta component

---

## GAP 3: Projects — summary counts (MISSING)

TUI ProjectsPanel header shows:
- "N projects | M git repos | X active | Y dirty"

WEB UI: Just a grid of cards, no summary counts at top
FIX: Add summary line above the project grid

---

## GAP 4: Projects — activity grouping (MISSING)

TUI groups projects: ACTIVE / RECENT / STALE / NO GIT
Each group has a colored header and different rendering detail level.

WEB UI: Flat grid, sorted dirty-first, no activity grouping
FIX: Group cards by activity level with section headers

---

## GAP 5: Corrections — total count on dashboard (MISSING)

TUI overview neofetch shows: "{N} mistakes remembered (X critical, Y major, Z minor)"
This appears in the main overview, not just the Corrections tab.

WEB UI: Correction count only visible on Corrections tab
FIX: Add corrections count to dashboard overview section

---

## GAP 6: Agents — operator alerts (MISSING IN WEB UI)

TUI AgentsPanel shows: "OPERATOR QUEUE — N waiting" with alerts:
- ⚠ agent_name [type] "summary" → jump_hint

WEB UI AgentsPanel: Has code for it, but data is never present in test environment
FIX: Already built, just needs data to populate

---

## GAP 7: Agents — cron agents section (MISSING)

TUI AgentsPanel shows "AUTONOMOUS JOBS" section listing cron jobs with:
- enabled dot, name, status, schedule, last run, error, skills, delivery

WEB UI: Cron jobs only shown on Cron tab, not in Agents tab
FIX: Add cron job summary to AgentsPanel

---

## GAP 8: Health — DB size on dashboard (MISSING)

TUI identity block shows: "BRAIN SIZE: 30.6 MB (state.db)"

WEB UI HealthPanel: Shows "DB: 30.6MB" in services section
FIX: Also surface DB size on dashboard overview

---

## GAP 9: Health — all_healthy indicator (MISSING)

TUI neofetch closing: "{issues} connections incomplete. I adapt."

WEB UI: No all_healthy indicator anywhere
FIX: Add health status summary to dashboard

---

## GAP 10: Timeline panel (MISSING ENTIRELY)

TUI has a TimelinePanel on the Dashboard tab showing:
- Key Growth Moments (milestones, skill modifications, memory changes, config changes)
- Session Log by day (grouped by date, up to 3 per day)

Web UI: Has /api/timeline endpoint but no UI panel for it
FIX: Add timeline section to dashboard or as a command-palette-accessible panel

---

## GAP 11: Tool workflows in Patterns (MISSING)

TUI PatternsPanel shows "TOP TOOL WORKFLOWS" — common 3-tool sequences across sessions.

Web UI PatternsPanel: Shows task clusters, hourly activity, repeated prompts
but NOT tool workflows.

FIX: Add tool workflows section to PatternsPanel

---

## SUMMARY

| Area | TUI Has | WebUI Has | Gap? |
|------|---------|-----------|------|
| Overview narrative | ✓ Full | ✗ None | GAP 1 |
| Identity block | ✓ | ✗ | GAP 1 |
| Corrections on dashboard | ✓ | ✗ | GAP 5 |
| Diff new/lost categories | ✓ | ✗ | GAP 2 |
| Projects summary counts | ✓ | ✗ | GAP 3 |
| Projects activity groups | ✓ | ✗ | GAP 4 |
| Agent cron jobs | ✓ | ✗ | GAP 7 |
| Health all_healthy | ✓ | ✗ | GAP 9 |
| DB size on dashboard | ✓ | ✗ | GAP 8 |
| Timeline panel | ✓ | ✗ | GAP 10 |
| Tool workflows | ✓ | ✗ | GAP 11 |
| Operator alerts | ✓ | ✓ (built) | — |
| Memory entries | ✗ Tab | ✓ Dedicated | — |
| Skills library | ✗ Tab | ✓ Dedicated | — |
| Session analytics | ✗ Tab | ✓ Dedicated | — |
| Boot sequence | ✓ TUI | ✓ Web | — |
| Theme switching | ✓ 4 | ✓ 4 | — |
| Keyboard shortcuts | ✓ | ✓ | — |
| Command palette | ✗ | ✓ | — |
