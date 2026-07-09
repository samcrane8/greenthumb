# greenthumb — Design Language ("Instrument")

This document defines the visual system for the greenthumb UI. It is the single
reference for color, type, spacing, and component treatment. When in doubt,
optimize for **precision and density over decoration** — this is an instrument
for reasoning about numbers, not a marketing surface.

The tokens here are implemented in `apps/web/src/index.css`. Change tokens
there; this doc explains the intent.

---

## 1. Philosophy

Think **instrument panel**, not dashboard-template. The lineage is
defense/industrial software (Anduril, Palantir): calm, dense, and utilitarian,
where the data is the only thing that glows.

Five principles:

1. **Monochrome field, single signal.** The interface is a field of cool
   slate/gunmetal. Exactly one accent — a desaturated **technical green** — marks
   what is live, primary, or positive. Green is a signal, not a decoration; if
   everything is green, nothing is.
2. **Density is respect.** Tight spacing and small type let the operator see more
   at once. Prefer one more visible row over one more pixel of padding.
3. **Borders, not shadows.** Surfaces are flat and separated by hairlines. Drop
   shadows and glossy elevation are banned. Depth comes from subtle value steps
   between surface layers.
4. **Numbers are typeset.** Every number, key, path, and micro-label is
   monospace and tabular. Data should line up like a ledger.
5. **Sharp geometry.** Small radii (2–6px). Nothing is pill-shaped or rounded to
   softness except intentional status dots.

---

## 2. Color

Cool, low-chroma slate (hue ≈ 250–255) across the board, in OKLCH. Dark is the
hero; light is the same language turned up. Neither theme uses pure black or
pure white for large fields.

### Surface layers (dark, the reference)

| Token | OKLCH | Role |
| --- | --- | --- |
| `--background` | `0.17 0.010 255` | App field (deepest) |
| `--card` | `0.205 0.012 255` | Raised surfaces: panels, tiles, table body |
| `--muted` / `--secondary` | `0.245 0.012 255` | Inset chrome, quiet fills |
| `--accent` | `0.275 0.014 255` | Hover / active surface tint (neutral, *not* brand) |
| `--foreground` | `0.96 0.004 255` | Primary text |
| `--muted-foreground` | `0.66 0.012 255` | Labels, secondary text |
| `--border` | `white / 8%` | Hairlines |
| `--input` | `white / 14%` | Field outlines |

Light theme mirrors this: `--background 0.98 0.003 255`, `--card ~1`,
`--foreground 0.22 0.015 255`, borders `~0.90 0.006 255`.

### The signal — one accent

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--primary` (green) | `0.74 0.14 152` | `0.52 0.13 152` | Primary actions, active nav, focus ring, "live" |
| `--positive` | same green | same green | Gains, valid state, upside deltas |
| `--negative` | `0.64 0.19 25` | `0.53 0.20 25` | Costs (sign convention), errors, downside |

Notes:
- `--accent` (shadcn's hover-surface token) is **neutral slate**, not the brand
  green. The brand green lives only in `--primary`/`--positive`.
- Costs are negative by the engine's sign convention → they render in
  `--negative`. Never color a value green just because it's large.
- Destructive == `--negative`. There is no second red.

---

## 3. Typography

Two families, sharply divided by role:

- **Sans (UI):** a tuned system-grotesque stack (`--font-sans`). Used for prose,
  headings, buttons. Aspirational typeface if we ever self-host: a neutral
  grotesque (Söhne / Geist / Suisse). Never Inter-by-default aesthetics — the
  character comes from case and tracking, below.
- **Mono (DATA):** `--font-mono` (SF Mono / JetBrains Mono / Menlo). Used for
  **all** numbers, the wordmark, keys/paths, code, and every uppercase
  micro-label.

Type rules:

- **Eyebrow / micro-labels:** `font-mono`, `text-[11px]`, `uppercase`,
  `tracking-[0.14em]`, `text-muted-foreground`. This is the workhorse label of
  the whole UI (section headers, tile captions, table column groups).
- **Numbers:** always `font-mono tabular-nums`. Right-align in tables.
- **Headings:** sans, `font-semibold`, `tracking-tight`. Keep them small —
  a page title is `text-lg`/`text-xl`, not hero-sized.
- **Body:** `text-sm` is the default reading size; `text-xs` for metadata.

---

## 4. Space & density

- **Base unit 4px.** Component padding steps: 6 / 8 / 12 / 16px. A card is
  `p-4`, not `p-6`. Rows are `py-1.5`.
- **Table rows** target ~28–32px tall. Prefer `py-1.5 px-3`.
- **Gaps** between cards: `gap-3`/`gap-4`. Between dense controls: `gap-1.5`.
- Content max-widths stay modest so lines and tables don't sprawl
  (workspace `max-w-[1400px]`, settings `max-w-4xl`).

---

## 5. Geometry, borders, elevation

- **Radius:** `--radius: 0.25rem` (4px). `sm 2px · md 3px · lg 4px · xl 6px`.
  Buttons/inputs `rounded-md`, cards/tiles `rounded-lg`, badges `rounded-sm`.
- **Borders:** 1px hairlines using `--border`. Every panel, tile, table, and
  input is defined by its border, not a shadow.
- **Elevation:** none. No `shadow-*`. Layer value steps
  (`background` → `card` → `muted`) do the separating.
- **Atmosphere:** the app field carries a *very* faint 32px technical grid
  (border color at low alpha) that shows through gutters and empty states. It
  should be barely perceptible — texture, not pattern. Cards are opaque and sit
  cleanly on top.

---

## 6. Motion

Restrained and fast. This is instrumentation; it responds, it doesn't perform.

- Transitions: `transition-colors` at ~120ms for hover/active. That's most of it.
- One allowed flourish: a quiet staggered fade-in on first mount of a view.
- A single **live dot** (2px, `--primary`, gentle pulse) may indicate a running
  connection. No spinners-as-decoration, no bouncing, no parallax.

---

## 7. Iconography

- `lucide-react`, `size-4` default, `1.5` stroke. Icons are `muted-foreground`
  until active.
- Brand mark: a `Sprout` glyph in a small `rounded-sm` accent-green tile; the
  wordmark **`greenthumb`** is set in `font-mono`, lowercase, `tracking-tight`.

---

## 8. Component patterns

- **Sidebar:** `bg-card`, hairline right border. Mono uppercase section labels.
  Nav/list items: `rounded-md`, hover `bg-accent`; active adds a 2px inset
  `--primary` left marker + `text-foreground`. Account section pinned to the
  bottom with a mono status micro-label and a live dot when connected.
- **Stat tiles:** flat `card`, thin top rule that turns `--primary` on positive.
  Mono uppercase caption, large mono value, delta in `--positive`/`--negative`.
- **Statement grid:** hairline rows, mono tabular numerics, right-aligned.
  Column headers are mono uppercase micro-labels. Actuals periods carry a faint
  `--primary` tint to mark the forecast cutover; negatives use `--negative`.
- **Badges:** `rounded-sm`, mono, uppercase, `tracking-wide`, `text-[10px]`.
  "Valid" uses the green signal; issues use `--negative`.
- **Buttons:** `rounded-md`, `text-sm`. Primary = green signal (used sparingly);
  everything else is `ghost`/`outline`/`secondary` slate.
- **Inputs:** `rounded-md`, hairline `--input`, `--primary` focus ring. Numeric
  inputs are mono and right-aligned.

---

## 9. Do / Don't

**Do**
- Reach for a mono uppercase micro-label before a colored chip.
- Separate with a hairline; align numbers on the decimal.
- Keep green rare and meaningful.

**Don't**
- Add drop shadows, gradients-as-fills, or pill radii.
- Introduce a second accent hue or purple-on-white anything.
- Pad your way to "clean" — density is the aesthetic.
