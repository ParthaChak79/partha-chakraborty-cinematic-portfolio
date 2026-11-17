# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file, cinematic scroll-driven personal portfolio site for Partha Chakraborty. No build step, no package.json, no framework — `index.html` (~1880 lines: inline `<style>` and inline `<script>`) plus a static `assets/` folder. Styling and behavior all live inside that one file; don't go looking for separate CSS/JS files.

## Commands

**Serve locally** (no build step needed):
```bash
cd "/Users/partha/Downloads/claude design/partha-portfolio"
python3 -m http.server 4173
# open http://localhost:4173 and scroll
```

**Verify after any HTML/CSS/JS edit** — use the bundled skill rather than eyeballing it, since this is a scroll-scrubbed site where a screenshot at scroll-position-0 proves nothing:
```bash
NODE_PATH=/Users/partha/.nvm/versions/node/v20.11.1/lib/node_modules/flowise/node_modules \
  node .claude/skills/run-partha-portfolio/driver.js [--mobile] [--port=4173] [--keep-server]
```
This kills anything on the port, serves the repo root, drives headless Chrome via Playwright, waits for the site's preloader to finish, reads GSAP `ScrollTrigger.getAll()` pin offsets in-page (never hardcode scroll pixel positions — they shift whenever copy/card-count changes), scrubs the hero canvas and asserts frames differ, opens/closes the video modal, checks all work cards render the same height, checks only the on-screen section's background video plays, and collects console errors. Full details, gotchas, and troubleshooting are in `.claude/skills/run-partha-portfolio/SKILL.md` — read it before extending `driver.js` (~150 lines, not a black box).

Key environment facts for that command:
- `playwright` is not a repo dependency (no `package.json` at all); it resolves through the globally-installed `flowise` package's nested `node_modules`, hence the required `NODE_PATH` prefix. If it breaks on a new machine, re-resolve with: `NODE_PATH=$(npm root -g)/flowise/node_modules node -e "console.log(require.resolve('playwright'))"`.
- `driver.js` must stay CommonJS (`require`), not ESM — Node's native `import` resolver ignores `NODE_PATH`.
- There is no lint or test suite beyond the driver's in-page assertions.

**Deploy**: `git push` (plain, no flags) pushes to the `cinematic` remote, which is correct for this repo — see Git remotes below.

## Architecture

Everything is driven by **GSAP + ScrollTrigger + Lenis**, loaded via CDN `<script>` tags at the bottom of `index.html` (no module bundler). The inline script (`index.html:1536` onward) does, in order:

1. **Marquee fill** — duplicates a skills array into two marquee strips for a seamless CSS loop.
2. **Video modal** — a single shared modal (`#videoModal`) opened by any `.wcard-play` button; reads `data-yt-id`/`data-yt-title` off the closest ancestor and embeds `youtube-nocookie.com`. Handles focus trap and Escape-to-close.
3. **Hero canvas frame sequence** — the hero "orbit" is **not a video**; it's 120 numbered JPEGs (`assets/hero-frames/f_001.jpg`...`f_120.jpg`) drawn to a `<canvas>` (`#heroCanvas`) frame-by-frame as the user scrolls. All 120 preload before the site boots; a `#loader` overlay tracks progress and a 9s safety timeout force-boots if loading stalls. `FRAME_COUNT` (currently 120) must match the actual file count in `assets/hero-frames/`.
4. **`boot()`** — fires once preload completes (or times out): removes the loader, starts background `<video class="vsec-bg">` elements via an `IntersectionObserver` (only the on-screen section's video plays — this is intentional, not a bug, and matters because ScrollTrigger pin-spacers can make naive "is it visible" checks drift), and calls `initMotion()` unless `prefers-reduced-motion` is set or GSAP failed to load (falls back to a static `.no-motion` render).
5. **`initMotion()`** — sets up Lenis smooth scroll feeding `ScrollTrigger.update`, then builds one pinned GSAP timeline per section:
   - **`#hero`** — pins for `380%` of scroll; scrubs the 120-frame canvas across the whole pin (one full orbit) while the name (`#heroTitle`, split into `.ch` letter spans) tracks in letter-by-letter and the subtitle/stat strip fade in near the end.
   - **`#stats`** — count-up animation on `.stat-num` elements driven by scroll progress, not a fixed duration.
   - **`#pillars`** — pins for `pillars.length * 120%`; three `[data-pillar]` panels cross-fade in/out one at a time inside a single pinned timeline (not three separate pins).
   - **`#work`** — pins and translates `#workTrack` horizontally by its scrollable overflow (`track.scrollWidth - window.innerWidth`), i.e. vertical scroll drives a horizontal card rail. `trackDist()` is recomputed via `invalidateOnRefresh` since card count/width changes affect it.
   - **`#contact`** (the finale) — pins for `160%`; title letters animate in, then CTAs, then holds.
   - Finishes with an `ScrollTrigger.refresh()` once the page is fully loaded (fonts/images settled), since pinned distances depend on final layout.

**When adding/removing a work card, pillar, or stat**, the corresponding pin's `end` value (`380%`, `pillars.length * 120%`, `trackDist()`, `160%`) is computed from content, not hardcoded per-change — but always re-run the verification driver afterward, since it reads live pin offsets rather than assuming they haven't shifted.

### Section/ID map (for quick navigation inside the one file)
- `#loader` — preloader overlay (removed after boot)
- `#hero` — canvas orbit + kinetic name
- `#stats` — count-up strip
- `#pillars` — three pinned panels (`[data-pillar]`)
- `#work` — horizontal-scrub card rail (`#workTrack`, `.wcard` items)
- `#contact` — finale / CTAs (reused as the pin trigger id, despite being the finale section)

### Assets
- `assets/hero-frames/f_NNN.jpg` — the 120-frame hero orbit sequence (canvas-drawn, not a `<video>`)
- `assets/hero-orbit.mp4`, `assets/the-builder.mp4`, `assets/the-mentor.mp4`, `assets/the-scout.mp4` + matching `poster-*.jpg` — section background videos (`video.vsec-bg`)
- Root-level `Hero Orbit.mp4`, `The Builder.mp4`, `The Mentor.mp4`, `The Scout.mp4`, `partha_video.mp4`, `portrait.jpg` — source/reference media, not referenced directly by `index.html`'s current markup; check before assuming they're dead weight.

## Git remotes

This repo has **two** remotes pointing at two different deployed sites:
- `cinematic` — `partha-chakraborty-cinematic-portfolio`, what `main` actually tracks. A bare `git push`/`git pull` goes here. This is the cinematic scroll redesign described above.
- `origin` — `partha-chakraborty-portfolio`, an older resume-style site. Don't assume it's stale or clean it up without checking; it's a separate deployed site, not a leftover.
