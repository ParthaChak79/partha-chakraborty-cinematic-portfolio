---
name: run-partha-portfolio
description: Serve, screenshot, and verify the partha-portfolio cinematic scroll site (index.html) — run this to check the hero canvas orbit scrub, pinned pillar/work sections, video modal, and CTA/nav after any HTML or CSS edit, before pushing.
---

Static site, no build step: `index.html` + `assets/`. The whole thing
is scroll-driven (GSAP ScrollTrigger pins the hero, pillars, work, and
finale sections and scrubs a 120-frame canvas sequence for the hero
orbit), so a plain screenshot at scroll-position-0 proves nothing —
you have to scroll into each pinned section to see it render. All
paths below are relative to the repo root
(`/Users/partha/Downloads/claude design/partha-portfolio`).

## Run (agent path)

```bash
NODE_PATH=/Users/partha/.nvm/versions/node/v20.11.1/lib/node_modules/flowise/node_modules \
  node .claude/skills/run-partha-portfolio/driver.js [--mobile] [--port=4173] [--keep-server]
```

This one command does everything: kills anything already on the port,
serves the repo root with `python3 -m http.server`, launches headless
Chrome via Playwright, waits for the site's own preloader to finish,
reads GSAP's `ScrollTrigger.getAll()` pin offsets **in-page** to find
the exact scroll position of each pinned section (don't guess pixel
values — the pin ranges shift whenever content/copy changes length),
scrubs the hero canvas and asserts the frames actually differ, clicks
a flagship card's play button and asserts the video modal opens with
a `youtube-nocookie.com/embed/...` src and closes on Escape, checks
all six work cards render at the same height, checks only the
on-screen section's background `<video>` is playing, and collects
console errors / failed requests. `--mobile` adds a 390×844 pass that
checks for horizontal overflow. Screenshots land in
`.claude/skills/run-partha-portfolio/shots/`. Exits 1 and prints which
checks failed if anything's wrong; exits 0 and cleans up the server on
success.

Read `driver.js` before extending it — it's ~150 lines, not a black
box. Add a new `check(...)` call there for anything a future edit
might break (e.g. a new pinned section, a new modal).

## Run (human path)

```bash
cd "/Users/partha/Downloads/claude design/partha-portfolio"
python3 -m http.server 4173
# open http://localhost:4173 and scroll
```

Ctrl-C to stop. Fine for eyeballing, but you won't catch a broken pin
or an uneven card height just by looking — the driver's assertions
exist because those bugs are easy to miss visually and have shipped
twice in this repo already (uneven card heights, CTA flush against
the card edge).

## Gotchas

- **`chromium-cli` is not installed in this environment** (checked:
  `which chromium-cli` → not found). Don't reach for the generic
  `/run` skill's chromium-cli pattern here; use `driver.js`.
- **`playwright` is not a top-level dependency of this repo** — there's
  no `package.json` at all. It resolves through the globally-installed
  `flowise` package's nested `node_modules`. That's why the `NODE_PATH`
  prefix above is required verbatim — without it, `require('playwright')`
  in `driver.js` throws `MODULE_NOT_FOUND`. Find the current path with:
  `NODE_PATH=$(npm root -g)/flowise/node_modules node -e "console.log(require.resolve('playwright'))"`
  — if that npm-global path changes on a future machine, update the
  `NODE_PATH` value above.
- **`driver.js` must stay CommonJS (`.js`, using `require`), not
  `.mjs`.** Node's native ESM `import` resolver ignores `NODE_PATH`
  entirely (only `require()` honors it), so an ESM rewrite would break
  the only reason this works without a local `playwright` install.
- **Never scroll to a hardcoded pixel offset.** Section pin ranges
  (`ScrollTrigger.getAll()...start/end`) shift whenever hero copy,
  card count, or pillar text length changes. Always read the live pin
  offsets from the page (see `desktopPass()` in `driver.js`) and lerp
  within `[start, end]`.
- **Wait for `#loader` to detach**, not for `domcontentloaded` or a
  fixed sleep — the site holds a preloader until all 120 hero frame
  images finish loading (or a 9s safety timeout fires), and GSAP/
  ScrollTrigger/Lenis only initialize after that. Scrolling before the
  loader detaches means `ScrollTrigger.getAll()` returns nothing.
- **Kill the port before spawning the server, every time**
  (`lsof -ti:4173 -sTCP:LISTEN | xargs -r kill`) — `driver.js` does
  this automatically, but if you're poking the server manually outside
  the driver, a leftover `http.server` from a previous run causes
  `EADDRINUSE` on the next start.
- **This repo has two git remotes**: `origin` (the old resume-style
  site, `partha-chakraborty-portfolio`) and `cinematic` (this
  cinematic redesign, `partha-chakraborty-cinematic-portfolio`, what
  `main` actually tracks). A bare `git push` goes to `cinematic`,
  which is correct — but don't assume `origin` is stale/unused without
  checking; it's a different deployed site, not a mistake to clean up.

## Troubleshooting

- **`Cannot find module 'playwright'`** — you ran `node driver.js`
  without the `NODE_PATH` prefix. Copy the exact command from "Run
  (agent path)" above.
- **`ReferenceError: <name> is not defined` inside a `page.evaluate`
  callback** — a Node-side variable (like a computed scroll offset)
  was referenced directly inside a browser-context closure. Compute it
  in Node first and pass it as `page.evaluate(fn, value)`'s second
  argument (this exact bug shipped in an earlier version of
  `driver.js` for the pillars/work/finale scroll calls — fixed by
  passing `lerp(...)` as an argument instead of closing over it).
- **`FAIL  Only the active section's background video plays`** — check
  whether `initVideos()`'s `IntersectionObserver` threshold (`0.08`)
  still matches the section's visible height; a very short pinned
  section or a layout change can make a video count as "on screen"
  before its content is meaningfully visible.
- **Screenshots look identical across hero frame samples (hash
  collision)** — confirms the canvas frame-sequence scrub broke.
  Check `assets/hero-frames/` still has 120 numbered JPEGs and that
  `FRAME_COUNT` in `index.html`'s inline script still matches.
