# FRONTEND REDESIGN BRIEF — Identity Risk Analyzer

> Paste this into Claude Code in the existing project. This is a **redesign task**, not a rebuild.
> Keep all backend, API contracts, data models, routing, and business logic exactly as they are.
> You are changing **only the presentation layer**: layout, visual hierarchy, typography, color usage, spacing, motion, and component composition.
> Do not add features. Do not change what the app *does*. Change how it *reads*.

---

## 0. THE PROBLEM (diagnose before you touch anything)

The current UI works but looks "AI-generated" and unfocused. Concretely, these are the failures you must fix — I am listing them so you design against them deliberately, not by taste:

1. **No single focal point.** The eye lands nowhere. Everything competes.
2. **Multiple primary buttons on one screen.** "Запустить скан" appears twice (top bar + hero) and a third bright CTA "Открыть дашборд" sits next to it. Plus "Экспорт." There must be **exactly one** primary action visible per screen; everything else is secondary (ghost/outline) or tertiary (text).
3. **Accent color is everywhere, so it means nothing.** The cyan is smeared across headings, buttons, badges, icons, the radar. An accent must be **rare** to work as an accent.
4. **Flat hierarchy.** Hero headline, radar, module cards, the "43" score, and floating badges all shout at the same volume. There is no clear order of importance.
5. **Duplicated information.** "Только чтение · Domain Users · без секретов" is printed twice (under the buttons AND in a pill bottom-left). Floating "4 критических объекта" and "AD Security Score 43" stickers look pasted onto the radar at random.
6. **Marketing page and working tool are fused.** A full-height marketing hero ("Обнаружьте проблему…") sits on top of the actual operational cards. Decide the identity of each screen: the landing sells the platform vision; the dashboard is a dense operator console. They should look and behave differently.
7. **The light theme looks unfinished** (weak contrast, near-white radar on near-white bg). Ship **one** theme, dark, done properly. Only add a light theme afterward if it can meet the same contrast bar.

Before writing code, write a 5–8 line critique of the current screens in your own words confirming you see these issues, then design against them.

---

## 1. DESIGN DIRECTION (commit to one — no generic dashboard defaults)

Read the `frontend-design` skill first and follow it. Target aesthetic: **a professional security-operations product** — the kind of tool a SOC analyst keeps open all day. References in spirit (do not copy): Linear's restraint, Vercel/observability dashboards' calm density, Grafana/Datadog information hierarchy, PingCastle's seriousness. The feeling is **quiet confidence and precision**, not a flashy landing page.

Principles, in priority order:

- **Hierarchy over decoration.** Every screen has ONE thing the eye should hit first (usually the AD Security Score or the primary action), a clear second tier, and everything else recedes.
- **Restraint with the accent.** Choose ONE accent color and use it only for: the single primary action, the current nav item, and focused/active states. Nothing else. Risk colors (red/amber/emerald) are a *separate* semantic system used only for risk data — never decoratively.
- **Let it breathe.** More negative space. Fewer boxes. Not everything needs a card border. Group by spacing and typography, not by drawing rectangles around everything.
- **Data is the hero, chrome is invisible.** The numbers and findings are the product. Backgrounds, borders, and labels should almost disappear.
- **Calm motion.** Animation confirms and guides; it never performs. Respect `prefers-reduced-motion`.

---

## 2. DESIGN SYSTEM (define as tokens, then use everywhere — no ad-hoc values)

Put these in Tailwind config + CSS variables. Nothing hardcoded in components.

**Color (dark, single theme):**
- Background: a layered near-black — base (`~#0A0C10`), raised surface (`~#12151C`), overlay (`~#181C24`). Use elevation to separate zones instead of borders.
- Text: primary (`~#E6E9EF`), secondary (`~#9BA3B0`), muted (`~#5B6472`). Three levels only.
- Borders: barely-there (`rgba(255,255,255,0.06–0.10)`). Hairlines, not lines.
- **Accent: pick ONE** (recommend a refined cyan-teal or a controlled violet). Used sparingly per §1.
- **Risk semantics (data only):** Critical `#F0464C`, High `#F59E42`, Medium `#E7C14B`, Low `#3FB98A`. Each also has a low-alpha background for chips.
- Glow/aurora: allowed but very subtle, low opacity, behind content — never competing with data.

**Typography:**
- One strong display/sans for headings (e.g. Inter Tight / Geist / Satoshi) and **a monospace for all numbers, DNs, sAMAccountNames, scores, timestamps** (e.g. Geist Mono / JetBrains Mono). Numbers in mono is the single biggest "this looks like a real tool" upgrade.
- Define a real type scale (e.g. 12 / 13 / 14 / 16 / 20 / 28 / 40 / 56) and stick to it. Tighten letter-spacing on big display text; loosen (+tracking, uppercase, muted) on small section labels ("eyebrow" labels).
- Kill the giant marketing headline on operational screens. Big type belongs only on the landing.

**Spacing & layout:**
- 4px base grid; generous section padding (24–40px). Consistent gutters.
- Max content width for readability; don't stretch text edge to edge.
- Radius: one or two values (e.g. 10px cards, 8px controls). Consistent.
- Shadows: soft and rare; prefer elevation-by-background over drop shadows.

**Buttons (enforce the hierarchy):**
- **Primary** — solid accent, exactly ONE per screen.
- **Secondary** — outline/ghost, neutral.
- **Tertiary** — text-only.
- Icon buttons for utilities (export, theme, language) — quiet, in the top bar, not competing.

---

## 3. SCREEN-BY-SCREEN REDESIGN

### 3.1 Global shell (sidebar + top bar)
- **Sidebar:** keep nav + module list, but calm it down. Active item = accent text + a thin accent left-bar; inactive = muted, no boxes. "coming soon" modules dimmed with a small tag, not full rows of noise. Remove the redundant "Учётка только на чтение" pill at the bottom (that info moves to a single place — see below).
- **Top bar:** keep domain + last-scan + source badge on the left. On the right, collapse the clutter: theme + language as quiet icon buttons, **Export as secondary**, and **"Запустить скан" as the single primary** — and if it lives in the top bar, remove it from the hero. Never show the same primary twice.
- **Read-only / Domain Users / no-secrets** appears **once**, as a subtle inline meta line near the domain in the top bar (or a small shield chip), not twice.

### 3.2 Platform landing ("Infrastructure Risk Radar")
This is the *vision* screen — allowed to be more expressive, but still disciplined.
- ONE hero statement, smaller than now, with clear sub-copy. ONE primary CTA ("Запустить скан"); "Открыть дашборд" becomes a secondary/ghost button — not a second bright block.
- The radar visual: keep it, but make it **purposeful** — it should animate a real sweep and the blips should map to actual risk counts, with a subtle legend. Remove the free-floating "4 критических объекта" and "AD Security Score 43" stickers; integrate the score into one deliberate stat block, not pasted labels.
- Module bento grid: Identity Radar = live/active (quiet accent, "работает" tag); others dimmed "скоро". Uniform card sizing, aligned baselines, equal padding. This grid sells the platform without shouting.
- Trim duplicated meta lines. Say each thing once.

### 3.3 Dashboard (the operator console — most important screen)
This is where restraint matters most. Suggested layout, top to bottom:
- **Row 1 — the headline metric:** the **AD Security Score** as the clear focal point (large mono number + animated radial gauge, color-graded by band, with a one-word verdict). To its side, four compact risk counters (Critical/High/Medium/Low) as quiet stat cells — mono numbers, risk-colored dots, not four loud cards.
- **Row 2 — distribution:** a clean donut (by level) and a horizontal bar (by category) side by side. Muted gridlines, labels in muted text, values in mono. Charts share the same palette as the risk system.
- **Row 3 — attention list:** "Most risky accounts" as a tight list/table (mono names, risk chips, score), each row a click target to the detail. This is more useful than more charts.
- **Trend** (score over scan history) as a small area sparkline, not a giant chart.
- Everything aligned to a grid; consistent card treatment; one primary action only (Run scan lives in the top bar). No floating stickers.

### 3.4 Findings (table)
- Make it a **serious data table**: dense rows, mono for identifiers, risk chips with consistent shape, sortable headers, a single clean filter bar (level / category / type / search) — not a wall of controls. Zebra or hairline row separation, not boxed rows. Row hover = subtle raise, click = detail sheet.
- Empty and loading states designed (skeleton shimmer), not blank.

### 3.5 Account detail (the demo money-shot)
- Clear header (object name in mono, type, risk chip). The **"why this score"** panel is the star: horizontal weight-breakdown bars that visually sum to the score, animated on open. Evidence as a clean key→value list (attribute in muted, value in mono). Privilege-path as an elegant animated node chain. Recommendation with a copy-command button (quiet). MITRE tags as small chips. Lots of whitespace; one column of clear reading order.

### 3.6 Settings
- Calm form: grouped sections, labeled sliders/inputs, mono for numeric values, one primary "Save/Re-score" button. No visual noise.

---

## 4. MOTION (Framer Motion / `motion`) — tasteful, not performative
- Page/route transitions: quick fade + 4–8px slide via `AnimatePresence`. ~200–300ms, ease-out.
- Numbers (score, counters): count-up with `useMotionValue` + `useSpring`, once on mount.
- Gauge: arc sweeps to value on load.
- Lists/cards: subtle `staggerChildren` entrance (small, ~40ms stagger).
- Hover: gentle elevation/tilt on interactive cards only; never on static text.
- Scan-in-progress: a stepped progress ("Сбор → Анализ → Оценка") with a calm shimmer, not a spinner circus.
- Global rules: consistent easing tokens, keep durations short, **honor `prefers-reduced-motion`** by disabling transforms. Motion should make the app feel *responsive*, not *busy*.

## 5. 21st.dev USAGE
Use 21st.dev components for the pieces that benefit (aurora/gradient background on landing, bento grid, spotlight cards, animated counters, radial gauge) via `npx shadcn@latest add "https://21st.dev/r/<component>"` **when the registry is reachable**. If it is not, reproduce the same look by hand with Tailwind + Framer Motion — do not block on it and do not leave a broken import. Whatever you pull in must be **restyled to the tokens in §2** so it doesn't look like a dropped-in third-party widget. Consistency beats novelty.

---

## 6. HARD RULES (the "does it still look AI-made" test)
- [ ] Exactly **one** primary (solid accent) button visible per screen.
- [ ] The accent color appears in only a **few** places per screen (primary action, active nav, focus). Count them — if more than ~3 accent uses, remove some.
- [ ] Every screen has **one obvious focal point** you can name in a sentence.
- [ ] **No duplicated information** anywhere (each fact stated once).
- [ ] **All numbers, DNs, and identifiers render in monospace.**
- [ ] Risk colors are used **only** for risk data, never decoration.
- [ ] Consistent spacing grid, radius, and border treatment across all screens.
- [ ] No free-floating "sticker" labels over visuals; every element sits in a deliberate slot.
- [ ] Loading, empty, and error states are designed, not blank.
- [ ] `prefers-reduced-motion` disables non-essential animation.
- [ ] One polished dark theme (light theme only if it meets the same contrast bar).

## 7. PROCESS (do this, in order)
1. Write your critique of the current screens (§0) and your chosen design direction + token values (§2).
2. Build the shared shell + tokens first (sidebar, top bar, theme, type, colors, buttons). Get the hierarchy right here before touching pages.
3. Redesign screen by screen: Dashboard → Findings → Account detail → Landing → Settings. Wire each to the **existing** API — no fake data.
4. After each screen, run the app, screenshot it (describe it), and check it against §6. Fix, then move on.
5. Final pass: view every screen at desktop and narrow widths; verify no duplicated info, one primary per screen, accent restraint, mono numbers. Report the §6 checklist with pass/fail and real notes.

**Deliverable:** the same working app, visually transformed into something that reads as a deliberate, professional security product — clear focal points, strict hierarchy, restrained color, and calm motion. Begin with the critique and the token system.
