---
name: Palu Gada Console
description: A near-black single-operator instrument console where every figure sits inside a titled panel frame and colour only ever carries state.
colors:
  ground: "#111217"
  ground-deep: "#0b0c0e"
  panel: "#181b1f"
  panel-head: "#1c2025"
  line: "#2a2e35"
  line-soft: "#22252b"
  ink: "#d8dae0"
  ink-strong: "#f2f3f5"
  ink-dim: "#949aa5"
  ink-faint: "#8b919c"
  up: "#73bf69"
  up-deep: "#1f3a24"
  down: "#f2495c"
  down-deep: "#3a1f22"
  warn: "#ff9830"
  brand: "#5865f2"
  brand-hover: "#4a57e0"
  on-brand: "#ffffff"
typography:
  figure:
    fontFamily: "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  headline:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  title:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  body:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  control:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tabular-nums"
  panel-label:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.02em"
  label:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.02em"
  meta:
    fontFamily: "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  beat: "1px"
  chip: "2px"
  frame: "3px"
  pill: "999px"
spacing:
  hair: "2px"
  tight: "6px"
  row: "10px"
  cell: "12px"
  panel: "14px"
  page: "18px"
  shell: "26px"
  vault: "32px"
components:
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.frame}"
    padding: "14px 12px"
  panel-title:
    backgroundColor: "{colors.panel-head}"
    textColor: "{colors.ink-dim}"
    typography: "{typography.panel-label}"
    padding: "9px 12px"
  button:
    backgroundColor: "{colors.panel-head}"
    textColor: "{colors.ink-strong}"
    typography: "{typography.control}"
    rounded: "{rounded.frame}"
    padding: "8px 14px"
  button-hover:
    backgroundColor: "#262b32"
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    typography: "{typography.control}"
    rounded: "{rounded.frame}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-discord:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    typography: "{typography.control}"
    rounded: "{rounded.frame}"
    padding: "11px 14px"
    width: "100%"
  button-remove:
    backgroundColor: "transparent"
    textColor: "{colors.down}"
    rounded: "{rounded.frame}"
    padding: "5px 10px"
  input:
    backgroundColor: "{colors.ground-deep}"
    textColor: "{colors.ink-strong}"
    typography: "{typography.control}"
    rounded: "{rounded.frame}"
    padding: "7px 9px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-dim}"
    typography: "{typography.control}"
    rounded: "{rounded.frame}"
    padding: "8px 8px"
  nav-item-active:
    backgroundColor: "#15171b"
    textColor: "{colors.ink-strong}"
  tag-on:
    backgroundColor: "{colors.up-deep}"
    textColor: "{colors.up}"
    typography: "{typography.meta}"
    rounded: "{rounded.chip}"
    padding: "1px 7px"
  tag-off:
    backgroundColor: "#24272d"
    textColor: "{colors.ink-dim}"
    typography: "{typography.meta}"
    rounded: "{rounded.chip}"
    padding: "1px 7px"
  tag-down:
    backgroundColor: "{colors.down-deep}"
    textColor: "{colors.down}"
    typography: "{typography.meta}"
    rounded: "{rounded.chip}"
    padding: "1px 7px"
  row:
    backgroundColor: "transparent"
    textColor: "{colors.ink-strong}"
    padding: "10px 12px"
  toggle:
    backgroundColor: "#343941"
    rounded: "{rounded.pill}"
    width: "34px"
    height: "19px"
  toggle-checked:
    backgroundColor: "{colors.up-deep}"
---

# Design System: Palu Gada Console

## Overview

**Creative North Star: "The Instrument Rack"**

This is a rack of labelled instruments, not a dashboard of cards. The ground is
near-black (#111217), panels sit one step above it (#181b1f), and every panel
wears a titled head bar (#1c2025) that names what the number underneath means.
Remove all the content and the surface is still recognisable by its grid of
bordered, titled frames. Nothing floats: there is no card that does not carry a
title, and no figure that appears outside a frame.

The console is an expert tool for a single operator in a session measured in
seconds. Density is high and decoration is absent: 14px body text, 3px corners,
1px hairlines, no gradients, no imagery, no illustration. Colour is spent only
on state — green when the thing is up, red when it is not, amber for the thing
you are looking at now, and Discord blurple for the one primary action a view
offers. Everything else is grey ink on near-black.

Measurement is set in a monospace face with tabular figures so successive reads
line up in the same columns; prose is set in a plain system sans. The world is
the category standard, held to the Grafana / Uptime Kuma bar and honoured
literally — no irony, no novelty chrome.

**Key Characteristics:**
- Near-black instrument ground with one-step panel elevation, never shadows
- Every figure inside a titled 1px frame at 3px radius
- Colour reserved for state; grey ink for everything else
- Mono + tabular numerals for all data, sans for all prose
- Drawn SVG icons at a single 1.5px stroke weight on a 24px grid
- Hairline separation instead of whitespace separation

## Colors

A near-black instrument palette of five greys and four state colours, with a
single brand accent held in reserve.

### Primary
- **Discord Blurple** (#5865f2): The one primary action per view — Sign in with
  Discord, Load, Add. It also carries every focus ring (2px outline, 2px offset)
  and the input focus border. It appears nowhere decorative.

### Secondary
- **Instrument Green** (#73bf69): Up. Healthy heartbeat bars, live figures, the
  enabled tag, the "on" toggle, ok status lines, the connected brand dot.
- **Alarm Red** (#f2495c): Down. Missed heartbeat samples, failed rows, error
  status lines, the remove button's ink, disconnected brand dot.
- **Attention Amber** (#ff9830): Where you are and what leads. The active nav
  item's 2px marker edge and the top three leaderboard ranks. Nothing else.

### Tertiary
- **Green Vault** (#1f3a24) and **Red Vault** (#3a1f22): The 7%-weight
  backgrounds behind state chips, the checked toggle track, and the remove
  button's hover fill. They never carry text of their own colour family's
  opposite.

### Neutral
- **Instrument Ground** (#111217): The page field.
- **Deep Ground** (#0b0c0e): Recessed surfaces — the sidebar, input wells,
  scrollbar tracks. Recession, not elevation, is how this world separates.
- **Panel** (#181b1f): Every framed instrument body.
- **Panel Head** (#1c2025): Panel title bars, resting buttons, avatar wells.
- **Hairline** (#2a2e35) and **Soft Hairline** (#22252b): Structural strokes.
  The soft value draws internal divisions (row separators, panel borders, table
  rules); the stronger value draws things you can act on (input and button
  borders).
- **Ink** (#d8dae0) body, **Strong Ink** (#f2f3f5) names and values,
  **Dim Ink** (#949aa5) descriptions and panel titles, **Faint Ink** (#8b919c)
  labels, stamps and units.

### Named Rules
**The State-Only Colour Rule.** Green, red and amber are earned by the data, not
chosen by the designer. If a figure is not reporting health, position or
selection, it is grey (#f2f3f5 or #949aa5).

**The One Action Rule.** Blurple fills at most one control per view. A second
blurple button on a screen is a bug, not an emphasis.

**The White-Only-On-Blurple Rule.** Pure white (#ffffff) exists in this system
for exactly one job: text sitting on the brand fill. Anywhere else, the brightest
ink available is #f2f3f5.

**The Recession Rule.** Surfaces that receive input (sidebar, text fields) go
darker than the ground; surfaces that report go lighter. Depth reads as a step
down into the machine, never as a lift off the page.

## Typography

**Data Font:** system monospace stack (ui-monospace, SFMono-Regular, "SF Mono",
Menlo, Consolas, "Liberation Mono")
**Prose Font:** system sans stack (system-ui, -apple-system, "Segoe UI", Roboto,
"Helvetica Neue", Arial)

**Character:** Two neutral system faces doing one job each. The mono is not a
stylistic gesture; it is there so numbers hold their columns between refreshes.
No webfont ships, and none may — the panel is three static files with no CDN.

### Hierarchy
- **Figure** (mono, 600, 30px, 1.05, -0.02em, tabular): the one headline number
  inside a panel — uptime, and nothing that is not measured.
- **Headline** (sans, 600, 28px, -0.01em): the sign-in screen's single word.
- **Title** (sans, 600, 21px, -0.01em, balanced wrap): page heads.
- **Body** (sans, 400, 14px, 1.5): prose, capped at 70ch for page descriptions.
- **Control** (sans, 400, 13.5px): buttons, inputs, nav items, row names.
- **Data** (mono, 400, 13px, tabular): key-value readouts and table cells.
- **Panel label** (sans, 500, 12px, 0.02em, dim ink): panel titles — sentence
  case, never uppercase.
- **Label** (sans, 400, 11px, 0.02em, faint ink): field labels, table headers,
  key names.
- **Meta** (mono, 11px, faint ink): timestamps, tags, pills, figure notes, ids.

### Named Rules
**The Mono-Measures Rule.** Anything the machine measured or identified — a
count, a duration, a latency, a snowflake id, a command name, a timestamp — is
mono with tabular numerals. Anything a human wrote is sans.

**The Named Figure Rule.** A figure at instrument scale never appears without
the panel title that says what it counts and the note that says over what
window.

## Layout

A two-column shell: a 216px sticky full-height sidebar over the deep ground, and
a scrolling main column padded 26px/28px with a 64px tail. Content inside the
main column is a panel grid of `repeat(auto-fit, minmax(210px, 1fr))` at 14px
gutters, which snaps to a fixed four-track grid at 1040px and above; panels claim
tracks by span (heartbeat spans three of four, working panels span two, wide
panels span the row) so no row is left ragged.

Rhythm is tight and fixed, not fluid: 2px between heartbeat bars, 6px inside a
stacked label, 10px between row items, 12px horizontal cell padding, 14px panel
body padding and grid gutter, 18px under a page head, 26px shell padding, 32px
inside the sign-in vault. Panels stack at 14px.

Below 860px the sidebar becomes a wrapping top bar: header and user block share
the first row, the nav wraps below as a row of items whose active marker moves
from the left edge to a bottom edge, and the main column drops to 20px/16px
padding. Below 560px the panel grid collapses to one column and every span is
released, and key-value blocks go single-column with it.

## Elevation & Depth

No drop shadows exist in this system. Depth is tonal and hairlined: the deep
ground recedes (#0b0c0e), the ground sits at rest (#111217), panels step up one
value (#181b1f), and panel heads step up once more (#1c2025). Every boundary
between two of these is drawn with a 1px hairline rather than implied by a
shadow, so a panel is legible even where its fill and the ground differ by three
values.

The only `box-shadow` in the build is a 3px state ring around the connection dot
(`0 0 0 3px rgba(115,191,105,0.15)` / `rgba(242,73,92,0.15)`), which is a halo
of the state colour, not elevation.

### Named Rules
**The No-Shadow Rule.** Surfaces never lift. If a surface needs to read as
separate, give it a hairline and a one-step fill change — never a shadow, and
never a hard offset shadow.

**The Hairline-Before-Whitespace Rule.** Rows, table cells and panel sections are
divided by a 1px soft hairline (#22252b) with the last one removed, not by
growing the gap. Density is a feature of the instrument.

## Shapes

One radius does almost all the work: 3px on panels, buttons, inputs, nav items
and large avatars — square enough to read as an instrument, soft enough not to
look broken. State chips take 2px, the toggle track and small avatars take full
round, heartbeat bars take the hairline radius (1px). Nothing else is rounded.

Borders are always exactly 1px and always one of the two hairline values. State
markers are 2px edges: the active nav item's left border (bottom border on
mobile) in amber, and focus outlines in blurple at 2px with a 2px offset.
Heartbeat bars are 3px-minimum flex columns in a 42px band, bottom-aligned.
Icons are drawn SVG at 1.5px stroke on a 24px grid, rendered at 17px, with round
caps and joins, from a single inline sprite.

## Components

### Buttons
- **Shape:** barely-rounded rectangle (3px), 1px hairline border (#2a2e35).
- **Default:** panel-head fill (#1c2025) with strong ink, 8px/14px padding,
  13.5px sans, 7px gap to its icon.
- **Hover:** fill lifts one value to #262b32. No transform, no shadow.
- **Primary:** blurple fill and border with on-brand white (#ffffff) text — the
  one place white ink is used — hover to #4a57e0. One
  per view. The sign-in variant is the same button at full width, 11px/14px.
- **Small:** 6px/10px at 12.5px, full width in the sidebar footer, auto width
  once the sidebar becomes a top bar.
- **Back:** ghost-weight — dim ink, left-biased padding (6px 11px 6px 8px),
  carrying the chevron icon.
- **Destructive:** transparent fill, alarm-red ink, red-vault border, filling to
  red vault on hover.

### Chips
- **Style:** mono 11px, 1px/7px, 2px radius, a state-vault fill under state ink.
- **State:** green vault / green for on and up; red vault / red for down; the
  neutral #24272d / dim ink for off and unmeasured. Chips are labels, never
  buttons.

### Cards / Containers
Every container is a panel, and every panel has a title.
- **Corner Style:** 3px.
- **Background:** panel (#181b1f) body, panel-head (#1c2025) title bar.
- **Shadow Strategy:** none — see Elevation & Depth.
- **Border:** 1px soft hairline all round, plus a hairline under the title bar.
  `overflow: hidden` so row separators meet the frame cleanly.
- **Internal Padding:** 14px/12px body, 9px/12px title bar. Row lists sit flush
  with no body padding at all.

### Inputs / Fields
- **Style:** recessed deep-ground well (#0b0c0e) inside a 1px acting hairline
  (#2a2e35) at 3px radius, 7px/9px padding, strong ink, full width, with an
  11px faint-ink label stacked 5px above.
- **Focus:** the border turns blurple; the default outline is suppressed on
  inputs only because the border itself moves. Everything else keyboard-focusable
  keeps the 2px blurple outline at 2px offset.
- **Placeholder:** faint ink.

### Navigation
Vertical stack of 13.5px items at 1px spacing, dim ink with a drawn 17px icon,
resting transparent over the deep ground. Hover fills #15171b and raises ink to
body weight; active fills the same and raises ink to strong, adding a 2px amber
left edge. Below 860px the stack becomes a wrapping row and the amber edge moves
to the bottom of the item.

### Heartbeat Strip
The signature instrument. One flex column per health sample in a 42px band,
oldest at left, 2px gaps, 1px radius, green when the check passed, alarm red
when it missed, and #23262c for a slot with no sample yet. Hovering a bar draws
a 1px ink outline at 1px offset; the strip as a whole takes the blurple focus
ring. A mono pill in the panel title carries the current verdict and a mono note
beneath carries the window.

### Status Lines
Inline 12.5px lines pinned to the bottom of the panel that owns the failure,
separated by a hairline, dim ink by default, alarm red on a 7% red wash for
errors and green for success, and collapsed entirely when empty. They replace
browser dialogs; this system has no modal, no toast and no alert.

## Do's and Don'ts

### Do:
- **Do** put every figure inside a titled panel frame (1px #22252b, 3px radius)
  with a note naming its window.
- **Do** set every measured or machine-identified value in the mono stack with
  tabular numerals.
- **Do** spend green, red and amber only where the data earns them, and blurple
  only on the single primary action and focus rings.
- **Do** separate with a 1px hairline and a one-step fill change before reaching
  for space.
- **Do** use pure white ink only on a blurple fill; #f2f3f5 is the brightest ink
  everywhere else.
- **Do** draw icons as inline SVG at 1.5px stroke on a 24px grid, rendered 17px.
- **Do** report failure as an inline status line inside the owning panel.

### Don't:
- **Don't** add a drop shadow to any surface, hard-offset or diffuse; tonal steps
  and hairlines carry all depth here.
- **Don't** use emoji or icon-font glyphs as icons — the sprite is the icon set.
- **Don't** introduce a gradient, a decorative image, or a floating untitled
  stat card; that is the arrangement this console replaced.
- **Don't** colour a figure that is not reporting state.
- **Don't** ship a second blurple-filled button in one view.
- **Don't** load a webfont or any runtime CDN asset; the surface is three static
  files.
- **Don't** uppercase panel titles or set labels above 0.02em tracking; this
  world has no all-caps register.
