# Nomos panel visual direction: brand v2 (since 2026-11-11)

This replaces the "paper and clay" direction of 2026-11-10, which the user rejected as too close to Claude's look. The brief,
in the user's words: as if OpenAI, Claude and Unreal had an e-sports kid. Something more gamer, with its own personality.
Synthesis and inspiration only: no knot, no starburst, no U, no shield, no team logos, and none of those names used as a brand.

Source of truth: `panel/src/styles/theme.css`. Mirrors: `design/tokens.json` (`colorDark` is the main theme, `color` the
light alternate) and the logo files in `docs/media/` (drawn with Codex; notes on minimum sizes below).

## What each parent brings

- **OpenAI:** restraint. Monochrome, precise, lots of empty space.
- **Claude:** one warm note, pushed hotter: ember orange.
- **Unreal:** black, sharp, industrial.
- **E-sports:** speed and attitude. Heavy condensed italic capitals, diagonal cuts, a scoreboard feel.

## Principles

1. **Dark by default, bone as the alternate.** Without a choice the panel is dark unless the system asks for light
   (`prefers-color-scheme: light`); the sun/moon button in the header saves a choice (`localStorage nomos.tema`,
   `panel/src/lib/theme.ts`) and toggles `.dark` on `<html>`.
2. **Exact colours.** Black `#0B0B0C`, surface `#141416`, raised surface `#1C1C1F`, bone `#F2EFEA`, steel `#8A8A8F`,
   ember `#FF5A1F`. On bone, text and buttons use a deeper ember, `#B83D0B` (4.9:1 both ways); the bright ember is never
   text on bone (2.7:1).
3. **Ember is rationed: one thing per screen.** Play when there is a build, the mobile "Talk to Nomos" call to action, the
   diagonal of the logo and the small slash that opens the status card. Everything else is bone, steel and black with alpha.
4. **Quiet states, told apart by shape too.** Success, warning, error and info are desaturated, and every one carries an
   icon, a word or a pattern besides its colour. AA is measured in `tests/tokens.test.ts` (≥ 4.5:1 on black and on bone).
5. **Shapes.** Radii of 2 px (controls) and 4 px (cards and panels); 45° cut corners (`.k-cut`) on the main call to action;
   a diagonal bar (`.k-slash`, skewed 18°) as the accent; hairlines instead of shadows. No gradients, no neon. The one
   glow left is Play's (milestone 14, asked for by the user).
6. **Type.**
   - Headings, the wordmark, Play and big numbers: **Barlow Condensed** 800 italic, uppercase (`h1`, `h2`, `.k-display`),
     close to the custom lettering of the logo.
   - Body: **Instrument Sans**.
   - Data, labels and commands: **Geist Mono** with tabular figures; small labels are mono, uppercase, tracked 0.12em
     (`.k-label`).
   - All self-hosted from `@fontsource` (SIL OFL 1.1).
7. **Scale.** The root is 115 % (about 18 px), so every rem-based size (text, controls, icons, spacing) is about 15 % larger
   than the browser default; the header is 64 px. Task image cards are laid out by columns, so they keep their width.
8. **The status card reads like a match scoreboard.** A header strip with the slash, "STATUS" and the update time; cells
   with a mono label, a 40 px condensed number, a unit, a 2 px square-ended bar and one mono line. Opening it shows what is
   left to set up, with copyable commands.
9. **Every task card has an image.** Its own latest capture; otherwise the latest capture of the game (`GET /capture`:
   `docs/empaquetado.png`, then the latest screenshot artifact, then `docs/capturas/`); only a project with no capture at
   all shows `NoCapture` (the mark and two diagonals), never a grey centred icon.
10. **Copy in English** in the panel. Skills, worker briefs, CLI messages and what Nomos writes in the chat stay in Spanish;
    so do texts the service sends already written (wait and block reasons, Play's reason, the to-set-up list).

## Measured contrast

| Pair (dark) | Ratio | Pair (light) | Ratio |
|---|---|---|---|
| bone / black | 17.2:1 | black / bone | 17.2:1 |
| steel / black | 5.7:1 | secondary `#5E5E63` / bone | 5.6:1 |
| steel / raised `#1C1C1F` | 4.9:1 | deep ember `#B83D0B` / bone | 4.9:1 |
| ember / black (and black on ember) | 6.3:1 | bone on deep ember | 4.9:1 |
| states / black | ≥ 6.9:1 | states / bone | ≥ 4.9:1 |

## Logo

`docs/media/nomos-mark.svg` (dark) and `nomos-mark-light.svg`, `nomos-logo-dark.svg` / `nomos-logo-light.svg`,
`nomos-banner.svg`. Three forward-leaning pieces form an open N; the diagonal is ember. Minimum sizes: symbol 32 px wide,
full lockup 320 px, banner 960 px. In the panel the symbol is inlined (`panel/src/shell/Mark.tsx`): uprights take the text
colour, the diagonal takes the theme accent. The favicon is `panel/public/nomos-mark.svg`.

## Screenshots

`docs/capturas-panel-v2/`: Home at 1440×900 and 390×844, dark and light, plus the status card opened, with real data from a
copy of a game's database (no workers, no Unreal). Script: `panel/scripts/capturas-v2.ts`.
