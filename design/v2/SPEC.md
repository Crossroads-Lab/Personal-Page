# william-brendel.com v2 — Implementation spec for Claude Code

Nov 11, 2026 · William Brendel · Live version of this spec: https://claude.ai/artifact/XvDAsYATncXP9sNcnS5wh5

## 1. Overview & scope

v2 keeps the chat-first first screen exactly as it works today and adds a second section below it: a diagonal cut into a dark grey area holding five content cards. It also swaps in an extended portrait, fixes the mobile suggestion chips, and adds a discreet "More" cue.

**Reference mocks:** `mocks/desktop.html` and `mocks/mobile.html` in this folder (also on the design canvas https://claude.ai/artifact/EAVAz7SkuWFx6h2JGsosYA, private to Will). Screenshots in `screenshots/`. When this spec and the mocks disagree, this spec wins.

**What stays unchanged**

- The chat: backend calls, answer rendering, the follow-up suggestion bubbles, the Copy button, the stop-thinking button.
- The link icons and their files: `assets/icons/linkedin.svg`, `call.svg`, `resume.svg`, `book.svg`, and the frosted-glass button style.
- The site's current font stack. The mocks approximate it with Poppins + Instrument Serif italic for "start?": keep whatever the CSS already uses.
- Link targets: LinkedIn, Calendly 30 min, the résumé PDF, the Amazon book page.

**What changes**

1. New portrait asset, extended at the bottom (section 2).
2. Page background matched to the portrait's backdrop (section 3).
3. Hero photo placement so its bottom hides under the cut (sections 4–5).
4. Mobile suggestion chips: one horizontal scroll row, no scrollbar (section 5).
5. "More" chip + bottom chevron (section 6).
6. Diagonal cut + dark second section (section 7).
7. Five cards (section 8) with "Ask about this" (section 9).
8. Fixes from the review: heading order, zoom, meta tags, chip copy (section 10).

**How to work**

- Work on a branch; no new framework. Plain HTML/CSS plus the existing JS (TypeScript is fine if the repo already builds it). No Python tooling.
- Do not touch chat logic beyond the two hooks in section 9.
- Check every change at widths 1440, 1280, 1024, 768, 390 and 375, and with `prefers-reduced-motion: reduce`.

## 2. Photo asset: extend the portrait

The new portrait (1491 × 2147 px, white armchair, navy suit, light grey backdrop) is cut off at the shoe. Extend it downward by generative fill before building, so its bottom can sit under the diagonal cut. This step is done by Will in an image tool; Claude Code only consumes the result.

**Source:** `assets/portrait-original.png` in this folder. Backdrop colour sampled at the corners: rgb(227, 229, 230) top-left, rgb(225, 228, 229) bottom-left.

**Tool, in order of preference**

1. Photoshop → Image → Canvas Size, then Generative Expand (best control of shadows).
2. Canva → Magic Expand.
3. Adobe Firefly "Generative expand", Clipdrop Uncrop, or the ChatGPT / Gemini image editor.

**Settings**

- Extend the canvas **downward only**, by **350 px**: 1491 × 2147 → 1491 × 2497. Anchor the top so face and framing don't move.
- Prompt: *Continue the photo downward: the crossed leg and black dress shoe, the white swivel armchair's chrome base and wheels, the light grey studio floor and the soft contact shadow under the chair. Same lighting, same grey backdrop, photorealistic.*
- Generate 3–4 versions. Reject any where the shoe changes shape, the chair base has the wrong number of legs, the shadow falls the wrong way (light comes from the front-left), or the trouser colour shifts.

**Export**

| File | Size | Format | Use |
| --- | --- | --- | --- |
| `assets/portrait@2x.webp` | 1491 × 2497 | WebP q80 | desktop hero, retina |
| `assets/portrait.webp` | 900 × 1507 | WebP q80 | desktop hero, mobile hero |
| `assets/portrait-og.jpg` | 1200 × 630, crop on face | JPEG q85 | social preview image |

Use `<img srcset="assets/portrait.webp 900w, assets/portrait@2x.webp 1491w" sizes="(max-width: 767px) 420px, 46vw">`. Keep the old `assets/profile.webp` on the server until the new one ships, so existing social previews don't break.

**Background match:** after export, sample the backdrop at the top corners. If it is not within ±2 of rgb(227, 229, 230), set the page background token `--bg-hero` (section 3) to the sampled value instead, so there is no visible edge around the photo.

**Until the extended photo exists**, ship with the unextended portrait (`assets/portrait.webp` in this folder, 900 × 1296) and use the fallback offsets in sections 4–5; nothing else changes.

## 3. Design tokens

Define these once as CSS custom properties on `:root` and use only them in the new CSS.

```css
:root {
  /* first screen (light) */
  --bg-hero: #E3E5E6;          /* = portrait backdrop, rgb(227,229,230) */
  --surface-light: #FFFFFF;    /* chips, input bar */
  --text: #26282B;
  --text-icon: #3A3D41;
  --input-btn: #E3E4E6;        /* send button fill */

  /* second section (dark, Claude-style grey) */
  --bg-more: #262624;
  --card: #30302E;
  --card-warm: #3A3733;        /* optional accent card */
  --card-inverse: #F5F4EF;     /* the closing CTA card */
  --text-on-dark: #F5F4EF;
  --text-on-dark-2: #C2C0B6;   /* body copy in cards */
  --text-on-dark-3: #B5B3AA;   /* labels, captions, footer */
  --line-on-dark: #45443F;     /* dividers */
  --outline-on-dark: #6B6A65;  /* secondary button border */
  --media-placeholder: #1B1B1A;

  /* category labels on dark */
  --label-blue: #8AB8E6;       /* In the press */
  --label-amber: #E0B36A;      /* Interview */
  --label-green: #7FC8B0;      /* Research */
  --badge-bg: #FFF1D6; --badge-text: #7A4B00;  /* bestseller badge */

  /* shape */
  --r-chip: 22px; --r-card: 24px; --r-card-m: 22px; --r-media: 14px; --r-pill: 999px;
  --shadow-chip: 0 2px 8px rgba(0,0,0,.08);
  --shadow-input: 0 4px 16px rgba(0,0,0,.10);

  /* the cut */
  --cut-desktop: 120px;
  --cut-mobile: 56px;
}
```

**Type scale** (keep the site's families; sizes are what the mocks use)

| Element | Desktop | Mobile | Weight |
| --- | --- | --- | --- |
| "Hi, I'm William Brendel" | 20px | 17px | 300, name 600 |
| "Where should we start?" (h1) | 40px; "start?" 48px serif italic | 31px; "start?" 37px | 400 |
| Chips | 13px | 13px | 400 |
| Card label (uppercase, +1.5px tracking) | 12px | 11px | 500 |
| Card title (h3) | 22px (book card 26px) | 20px | 500 |
| Card body | 14–15px, line-height 1.6 | 13px, 1.55 | 400 |
| Stat number | 32px | 26px | 500 |
| Buttons | 13–14px | 14px | 500 |

**Contrast:** every pair above passes WCAG AA (4.5:1 for text). Don't darken `--text-on-dark-3` or lighten `--bg-more` without re-checking.

**Icons:** reuse the live SVGs in `assets/icons/` at 16 × 16, opacity .72, inside the existing frosted-glass button (`background: rgba(255,255,255,.03); box-shadow: inset -6px -6px 16px rgba(255,255,255,.16), inset 0 0 0 1px rgba(255,255,255,.07), 0 1px 4px rgba(0,0,0,.035)`). Only change: the button's hit area goes from 40 to 44px (the visual circle can stay 40px with 2px transparent padding). New UI icons (arrow, chevron, play) are inline stroke SVGs, 2px stroke, round caps; markup is in section 6.

## 4. Page structure & desktop first screen

The page becomes two stacked sections: the existing hero (unchanged behaviour) and a new `#more` section. The hero is exactly one viewport tall, so the cut starts at the bottom edge of the first screen and is never visible before scrolling.

```html
<body>
  <main>
    <section class="hero" id="top">
      <img class="hero-photo" src="assets/portrait.webp" srcset="…" alt="William Brendel seated in a white armchair">
      <div class="hero-content">
        <h1 class="hero-title">
          <span class="hero-hello">Hi, I'm <strong>William</strong> Brendel</span>
          Where should we <em>start?</em>
        </h1>
        <nav class="links" aria-label="Links">… 4 existing icon links …</nav>
        <!-- existing chat: answer area, form, suggestion chips -->
      </div>
      <a class="more-chevron" href="#more" aria-label="More about me">…</a>
    </section>
    <section class="more" id="more" aria-labelledby="more-title">
      <div class="more-inner">… cards (section 8), then the footer …</div>
    </section>
  </main>
</body>
```

**Desktop hero (≥ 768px)**

- `.hero`: `position: relative; z-index: 0; height: 100svh; min-height: 720px; max-width: 1280px; margin: 0 auto; overflow: visible; background: var(--bg-hero);` The page `body` background is also `var(--bg-hero)`, so wide screens show no seam.
- `.hero-content`: left column, `position: absolute; left: 120px; top: 28%; width: 520px;` centred column (`display:flex; flex-direction:column; align-items:center; gap:20px`). At 768–1023px use `left: 48px; width: 46%`.
- Order inside the column (unchanged from today): greeting → h1 → icon row → 36px gap → input bar → suggestion chips (centred, wrapping, 8px gap).
- Input bar: `background: #F2F3F4; border-radius: 28px; padding: 8px 8px 8px 24px;` placeholder "Ask me anything…" italic 15px, 40px round send button `var(--input-btn)`.

**Desktop photo placement**

- `.hero-photo`: `position: absolute; right: 0; height: 100%; width: auto; aspect-ratio: 1491 / 2147;` (unextended) and `object-fit: cover; object-position: top center`.
- **With the extended portrait (section 2):** `height: 116.3%` (2497 / 2147) and `top: 0`. The head stays exactly where it is in the mocks; the extra 16% (legs, chair base, shadow) hangs below the hero and is hidden by the cut.
- **Fallback, unextended portrait:** `height: 100%; bottom: -40px` (at 820px hero height; use `bottom: -4.9svh` to scale). 40px is the minimum that hides the photo's bottom edge: at the photo's left edge the cut sits ~54px below the hero, but the photo's left 27.5% is plain backdrop, and where the chair starts the cut is 39px down.
- The photo must never overlap the chat column: if the photo's left edge comes within 24px of `.hero-content`'s right edge, shrink the photo with `max-width: 46vw`.

**Answer state (after a question):** unchanged from today. The answer replaces the hero greeting area and the photo blurs as it does now. The More chip and chevron (section 6) hide while an answer is shown or the model is thinking.

## 5. Mobile first screen (< 768px)

Keep today's mobile placement; change only the chips, the photo offset and the cue. Measurements are for a 390 × 844 viewport; express them as % of `100svh` where noted so they scale.

| Element | Position (390 × 844) | Notes |
| --- | --- | --- |
| Greeting + h1 + icon row | top 132px (15.6svh), centred | h1 31px, icon row 22px below h1, 12px gap, 44px buttons |
| Photo | `left: 40px; top: 283px; width: 420px; height: 605px` | Right edge cropped by the viewport (`.hero { overflow-x: clip }`). Head starts ≈ 380px. Bottom = 888px, i.e. 44px below the fold, under the cut |
| Suggestion row | `bottom: 92px`, full viewport width | horizontal scroll, see below |
| Input bar | `left: 16px; right: 16px; bottom: 28px` | white, `--shadow-input`, 44px send button |
| Chevron | `bottom: 2px`, centred | 44 × 24 hit area, section 6 |

**Photo with the extended portrait:** keep `top: 283px` and `width: 420px`; height becomes 703px (420 × 2497 / 1491). The extra height is below the fold and under the cut. The cut is 56px tall on mobile; at the chair's left edge (x ≈ 155px) it sits 34px below the fold, so any bottom offset ≥ 34px hides the edge. Both 44px (unextended) and the extended photo satisfy this.

**Suggestion chips: one horizontal scroll row, no scrollbar**

```css
.chips {
  position: absolute; left: 0; right: 0; bottom: 92px;
  display: flex; flex-direction: row; gap: 8px;
  padding: 4px 16px 8px;            /* first chip aligns with the input bar */
  overflow-x: auto; overscroll-behavior-x: contain;
  scroll-snap-type: x proximity; scroll-padding-inline: 16px;
  scrollbar-width: none; -ms-overflow-style: none;
}
.chips::-webkit-scrollbar { display: none; }
.chip {
  flex: none; white-space: nowrap; min-height: 44px;
  padding: 12px 20px; border: 0; border-radius: var(--r-chip);
  background: var(--surface-light); color: var(--text);
  font-size: 13px; box-shadow: var(--shadow-chip);
  scroll-snap-align: start;
}
```

- Chips are solid white. Today's chip is semi-transparent and washes out over the photo: that is the bug being fixed.
- Chip order: "A time I failed" → "My chapter in The AI Transformation" → "My biggest obstacle" → **More ↓** (section 6).
- The row runs edge to edge; the last chips start off-screen to signal swipe. No fade mask, no arrows.
- Desktop keeps the centred, wrapping chip row under the input (no scroll).

## 6. The "More" cue: chip + chevron

Two cues, both scroll to `#more`, neither moves the input bar: a dark **More ↓** chip as the last suggestion, and a faint chevron in the gap under the input bar.

**More chip** (last item in the suggestion row, desktop and mobile)

```html
<a class="chip chip--more" href="#more" aria-label="More about me">
  More
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
  </svg>
</a>
```

```css
.chip--more {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--bg-more); color: var(--text-on-dark);
  font-weight: 500; text-decoration: none;
  box-shadow: 0 2px 8px rgba(0,0,0,.12);
}
```

- It is a link, not a chat suggestion: clicking it must NOT send "More" to the chat.
- Label is exactly "More". The accessible name stays "More about me".

**Bottom chevron**

```html
<a class="more-chevron" href="#more" aria-label="More about me">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
</a>
```

```css
.more-chevron {
  position: absolute; left: 50%; transform: translateX(-50%);
  bottom: 2px;                 /* desktop: 14px */
  width: 44px; height: 24px;   /* desktop: 44 x 28, icon 22px */
  display: flex; align-items: center; justify-content: center;
  color: var(--bg-more); opacity: .55;
  animation: chevron-nudge 2.4s ease-in-out 3s infinite;
}
.more-chevron:hover, .more-chevron:focus-visible { opacity: .9; }
@keyframes chevron-nudge { 0%,100% { translate: 0 0 } 50% { translate: 0 3px } }
@media (prefers-reduced-motion: reduce) { .more-chevron { animation: none; } }
```

- The nudge starts after 3s, so it doesn't distract on load.
- Hide both cues (`.is-hidden { visibility: hidden }`) while the chat is thinking or showing an answer, and once `#more` is ≥ 30% in view (IntersectionObserver). Show them again when the visitor returns to the top with no answer open.

## 7. Diagonal cut + second section

The `#more` section sits on top of the hero (higher z-index), and its top edge is clipped into a slope that climbs from left to right. Its highest point is exactly at the bottom of the first screen; its lowest point is `--cut` below that.

```css
.more {
  position: relative; z-index: 1;
  background: var(--bg-more); color: var(--text-on-dark);
  clip-path: polygon(0 var(--cut-desktop), 100% 0, 100% 100%, 0 100%);
  padding-top: var(--cut-desktop);        /* content starts below the slope */
}
.more-inner { max-width: 880px; margin: 0 auto; padding: 72px 24px 96px;
              display: flex; flex-direction: column; gap: 20px; }

@media (max-width: 767px) {
  .more { clip-path: polygon(0 var(--cut-mobile), 100% 0, 100% 100%, 0 100%);
          padding: calc(var(--cut-mobile) + 40px) 16px 48px; }
  .more-inner { padding: 0; gap: 14px; }
}
```

**Rules that make it work**

- `.hero` has `overflow: visible` vertically (so the photo can extend below it) and `overflow-x: clip` (so the mobile photo's right side is cropped without creating a scroll container).
- `.more` must start immediately after `.hero` with no margin, so the slope's high point (right edge) is the fold.
- The photo's bottom must be below the slope everywhere the photo has content (sections 4–5 give the numbers). Check by temporarily setting `.more { opacity: .5 }`: no hard photo edge may be visible above the slope.
- The slope is the full page width, even past the 1280px hero container. On screens wider than 1280px the photo stays inside the container; the slope still spans edge to edge.
- `clip-path` with px values is supported in all evergreen browsers; no fallback needed. Do not use a rotated pseudo-element: it shifts on resize.
- The footer ("© 2026 William Brendel", 12px, `--text-on-dark-3`, centred) is the last item inside `.more-inner`, so the dark area reaches the bottom of the page.

## 8. Cards

Five cards, in this order. Desktop: book full width → press + interview side by side (`grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px`) → research full width → CTA full width. Mobile: one column, same order.

Above the cards, a section label: `<h2 id="more-title" class="more-label">More about me</h2>` (13px, 500, uppercase, 2px tracking, centred, `--text-on-dark-3`).

**Card shell** (all except the CTA)

```html
<article class="card">
  <div class="card-media">…</div>          <!-- optional -->
  <span class="card-label" style="--c: var(--label-blue)">In the press</span>
  <h3 class="card-title">…</h3>
  <p class="card-body">…</p>
  <div class="card-actions">
    <a class="btn btn--primary" href="…">…</a>
    <button class="btn btn--ghost" type="button" data-ask="…">Ask about this</button>
  </div>
</article>
```

```css
.card { background: var(--card); border-radius: var(--r-card); padding: 28px;
        display: flex; flex-direction: column; gap: 12px; }
.card-label { font-size: 12px; font-weight: 500; letter-spacing: 1.5px;
              text-transform: uppercase; color: var(--c); }
.card-title { margin: 0; font-size: 22px; font-weight: 500; line-height: 1.3; }
.card-body { margin: 0; font-size: 14px; line-height: 1.6; color: var(--text-on-dark-2); }
.card-media { border-radius: var(--r-media); overflow: hidden; aspect-ratio: 16/9;
              background: var(--media-placeholder); }
.card-media img { width: 100%; height: 100%; object-fit: cover; }
.card-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
.btn { min-height: 44px; padding: 10px 18px; border-radius: var(--r-pill);
       font-family: inherit; font-size: 13px; font-weight: 500;
       display: inline-flex; align-items: center; text-decoration: none; }
.btn--primary { background: var(--text-on-dark); color: var(--bg-more); border: 0; }
.btn--ghost { background: transparent; color: var(--text-on-dark); border: 1px solid var(--outline-on-dark); }
@media (max-width: 767px) {
  .card { padding: 20px; border-radius: var(--r-card-m); }
  .card-title { font-size: 20px; } .card-body { font-size: 13px; }
  .card-actions .btn { flex: 1; justify-content: center; font-size: 14px; }
}
```

**Card content**

| # | Card | Label (colour) | Title | Body | Primary button → link | `data-ask` question |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Book (horizontal: cover left 150 × 220, text right; mobile cover 84 × 124) | badge "#1 Amazon bestseller · Technology" (`--badge-bg` / `--badge-text`, 12px, 14px radius); mobile "#1 Amazon · Technology" | The AI Transformation | I wrote Chapter 5, *"AI: The Reality Beyond the Fantasy"*, in this multi-author book on thriving through AI's disruption. (Mobile: first sentence only.) | Get it on Amazon (mobile: "Get it") → https://www.amazon.com/dp/1968318747 | What is your chapter in The AI Transformation about? |
| 2 | Press | In the press (blue) | Serendipity and Oregon State led to William Brendel's career in AI | Oregon State University College of Engineering on how my path into AI started. | Read the story → Oregon State article URL (from LinkedIn Featured) | How did Oregon State lead you into AI? |
| 3 | Interview (media shows thumbnail + 56px light play button centred) | Interview · RE•WORK · Oct 2018 · 22 min (amber) | Inside Snap Research: learning how to learn | At the Deep Learning Summit in Toronto, I talked with RE•WORK about my work at Snap Research: computer vision, NLP, new optimization frameworks, and teaching machines to learn how to learn. | Watch on YouTube → https://www.youtube.com/watch?v=8_S0888ZWGw | What did you work on at Snap Research? |
| 4 | Research (no media) | Research · Google Scholar (green) | Research | Stats grid (3 columns desktop, 2 mobile): **2,200+** citations · **30+** patents & publications · **PhD** Computer Science & AI. Divider (`--line-on-dark`), then 3 top papers, one line each: *Title · venue · year · N citations*. Then "Previously at Google · Amazon · Snap" (13px, #E8E6DC). | View on Google Scholar → Scholar profile URL | What is your most cited research about? |
| 5 | CTA (inverse: `--card-inverse` bg, `--bg-more` text, 32px padding, row on desktop / stacked on mobile) | none | Let's talk it through (24px) | 30 minutes, straight to the point. (`#5E5D59`) | Book 30 min (dark pill: `--bg-more` bg, light text, 14px 24px padding; full width on mobile) → https://calendly.com/william-brendel/30min | none |

**Video card:** don't embed the YouTube iframe on load. Show the thumbnail (`https://i.ytimg.com/vi/8_S0888ZWGw/hqdefault.jpg`, or a saved copy in `assets/`) with the play button; on click, either open YouTube in a new tab (simplest) or swap in `<iframe src="https://www.youtube-nocookie.com/embed/8_S0888ZWGw?autoplay=1" allow="autoplay; encrypted-media" allowfullscreen>` in the same 16:9 box.

**Book cover:** use the cover from the Amazon listing / LinkedIn Featured, saved as `assets/book-cover.webp` (300 × 440, 2× of the desktop size), with `border-radius: 6px; box-shadow: 0 10px 24px rgba(0,0,0,.35)`.

**Nothing invented:** if the Scholar paper titles or the article URL aren't available at build time, leave those lines out rather than shipping placeholder text.

## 9. Interactions

**Smooth scroll:** `html { scroll-behavior: smooth; }` inside `@media (prefers-reduced-motion: no-preference)`. Every `href="#more"` link scrolls to the section top; add `scroll-margin-top: 0` on `#more`.

**"Ask about this"** (every card except the CTA)

```ts
document.querySelectorAll<HTMLButtonElement>('[data-ask]').forEach(btn => {
  btn.addEventListener('click', () => {
    const q = btn.dataset.ask!;
    const input = document.querySelector<HTMLInputElement>('#ask')!; // existing chat input
    input.value = q;
    document.getElementById('top')!.scrollIntoView({ behavior: 'smooth' });
    // wait for the scroll, then submit through the existing chat path
    setTimeout(() => sendQuestion(q), 450); // sendQuestion = the function the chips already call
  });
});
```

- Reuse the exact function the current suggestion chips call. Do not add a second chat code path.
- If the existing code can't be called directly, dispatch a `submit` on the existing form instead.
- With reduced motion, skip the 450ms delay.

**Cue visibility** (section 6): one `IntersectionObserver` on `#more` with `threshold: 0.3` toggles `.is-hidden` on `.chip--more` and `.more-chevron`; the chat code adds/removes the same class when it starts thinking, shows an answer, or is cleared.

**Focus order:** greeting/h1 → 4 icon links → input → send → chips (… → More) → chevron → cards in order. All interactive elements show a 2px focus ring (`outline: 2px solid currentColor; outline-offset: 2px`).

**Analytics** (only if the site already tracks events): `more_chip_click`, `more_chevron_click`, `card_ask_click {card}`, `card_link_click {card}`.

## 10. Fixes, accessibility, SEO & meta

These come from the review of the live site on Nov 11, 2026. Ship them with v2.

| # | Issue on the live site | Fix |
| --- | --- | --- |
| 1 | Pinch-zoom disabled (`maximum-scale=1, user-scalable=no`) | `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` |
| 2 | "Hi, I'm William Brendel" is an H2 placed before the H1 | One H1 holding both lines (section 4 markup); card titles are H3 under the "More about me" H2 |
| 3 | Suggestion chip reads "The book I wrote in" | "My chapter in The AI Transformation" |
| 4 | Up-arrow image has empty alt and no label | Send button keeps `aria-label="Send your question"`; decorative SVGs get `aria-hidden="true"` |
| 5 | Social meta tags may be malformed (`meta-og:title`, `meta-twitter:card` seen in parsed output) | Verify the source uses `<meta property="og:title" …>` and `<meta name="twitter:card" …>`; fix if not |
| 6 | `meta-image` uses a relative path `assets/profile.webp` | Absolute URLs everywhere: `https://william-brendel.com/assets/portrait-og.jpg` for `og:image` and `twitter:image`, plus `og:image:width` 1200 / `og:image:height` 630 |
| 7 | `twitter:creator` is "@iamnotanaibot" | Keep only if it is Will's handle; otherwise remove |
| 8 | Chat follow-ups can be near-duplicates ("How do I book a call with you?" / "How do I book time with you? Can we set up a call?") | Dedupe suggestions before rendering: drop any whose normalised text shares ≥ 70% of words with an earlier one |
| 9 | Chat read "write me a Python script to scrape LinkedIn" as scraping Will's contact details | Tweak the assistant's instructions: off-topic requests get one line ("That's outside what this chat is for") plus a pointer to booking a call |

**Head additions**

```html
<title>William Brendel, PhD in AI | Product Strategist & Machine Learning Expert</title>
<meta name="description" content="I'm a Product Strategist & Machine Learning Expert. Ask me anything, book a session, or download my resume.">
<link rel="canonical" href="https://william-brendel.com/">
<meta property="og:type" content="profile">
<meta property="og:url" content="https://william-brendel.com/">
<meta property="og:image" content="https://william-brendel.com/assets/portrait-og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#E3E5E6">
<link rel="preload" as="image" href="assets/portrait.webp" imagesrcset="assets/portrait.webp 900w, assets/portrait@2x.webp 1491w" imagesizes="(max-width: 767px) 420px, 46vw">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Person","name":"William Brendel","url":"https://william-brendel.com/",
 "jobTitle":"Product Strategist & Machine Learning Expert",
 "sameAs":["https://www.linkedin.com/in/william-brendel"]}
</script>
```

**Accessibility checklist**

- All tap targets ≥ 44 × 44px (icons, chips, chevron, card buttons).
- Text contrast ≥ 4.5:1 (tokens in section 3 already pass).
- Card images: real `alt` ("Cover of The AI Transformation", "RE•WORK interview video thumbnail"); the hero photo alt stays "William Brendel seated in a white armchair".
- `prefers-reduced-motion`: no chevron nudge, no smooth scroll, no delay on Ask about this.
- Below-the-fold card images use `loading="lazy" decoding="async"`; the hero photo uses `fetchpriority="high"`.

## 11. Assets, handoff package & open items

**This folder** (drop it at the repo root as `design/v2/`):

```
design/v2/
  SPEC.md                       this document
  mocks/desktop.html            standalone mock, open in a browser
  mocks/mobile.html             standalone mock (390px wide)
  mocks/assets/                 images used by the mocks
  screenshots/desktop-1280.png  full-page render of the desktop mock
  screenshots/mobile-390.png    full-page render of the mobile mock
  screenshots/mobile-390-first-screen.png  first screen only (390 x 844)
  screenshots/desktop-1280-first-screen.png first screen only (1280 x 820)
  assets/portrait-original.png  the new portrait, 1491 x 2147 (input to section 2)
  assets/portrait.webp          900px web copy of the unextended portrait
  assets/icons/*.svg            the live link icons, unchanged
```

The mocks are reference only: don't copy their inline styles into the site; build from sections 3–10. Grey blocks labelled "Cover image", "Article photo" and "Video thumbnail", and lines in [brackets], are placeholders.

**To collect before or during the build**

- [ ] Extended portrait exported as in section 2 (Will)
- [ ] Book cover image → `assets/book-cover.webp`
- [ ] Oregon State article URL and its header photo → `assets/press-osu.webp`
- [ ] YouTube thumbnail → `assets/interview-rework.jpg` (or hot-link `i.ytimg.com`)
- [ ] Google Scholar profile URL
- [ ] Top 3 papers: title, venue, year, citation count
- [ ] Confirm `twitter:creator` handle
- [ ] `portrait-og.jpg` 1200 × 630 for social previews

## 12. Acceptance criteria

The build is done when every box below is true at 1440, 1280, 1024, 768, 390 and 375px wide.

**First screen**

- [ ] No part of the diagonal cut or the dark section is visible before scrolling, at any of those widths.
- [ ] No hard bottom edge of the photo is visible anywhere above the cut (test with `.more { opacity: .5 }`).
- [ ] Desktop: the photo never overlaps the chat column.
- [ ] Mobile: greeting, h1, icons, photo and input bar sit where they do on today's site; the input bar is not pushed up.
- [ ] Mobile chips: one row, swipes sideways, no visible scrollbar, solid white chips, More chip last.
- [ ] Chevron is visible, faint, nudges after 3s, and doesn't nudge with reduced motion.
- [ ] More chip and chevron both scroll to `#more`; neither sends anything to the chat.
- [ ] Both cues hide while thinking / answering and once the cards are in view.
- [ ] Chat behaviour is unchanged: ask, answer, follow-ups, copy, stop.

**Second section**

- [ ] Slope climbs left → right: 120px tall on desktop, 56px on mobile, full page width.
- [ ] Background `#262624`; cards `#30302E`; CTA card light.
- [ ] Five cards in order: Book, Press, Interview, Research, Book 30 min.
- [ ] Every link opens the right destination (Amazon, Oregon State article, YouTube, Google Scholar, Calendly).
- [ ] "Ask about this" scrolls to the top and sends that card's question through the existing chat.
- [ ] No placeholder text ships (empty items are omitted).

**Quality**

- [ ] Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95.
- [ ] Pinch-zoom works on iOS Safari and Android Chrome.
- [ ] Link preview (LinkedIn Post Inspector, X card validator) shows the new title, description and 1200 × 630 image.
- [ ] Keyboard only: every control reachable in the order in section 9, with a visible focus ring.
- [ ] No console errors; no layout shift when the hero photo loads (width/height or aspect-ratio set).
