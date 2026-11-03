# innovation-report

Landing page for San Antonio & The State of Innovation (Nov 4, 2026). Plain static HTML/CSS/JS, no build step.

- `/` — `index.html`: the State of Innovation report. Before launch it hands over to `/countdown/`.
- `/countdown/` — the countdown page (counts to launch, then goes to `/`)
- `/report/` — shortcut that opens the report even before launch (`/?view=report`)
- `/old` — the original landing page, preserved as-is (`noindex`)

## Launch (Nov 4, 2026, 9:00 AM Central)

Everything is controlled by **`launch.js`** in the repo root:

- `SOI_LAUNCH_AT = "2026-11-04T15:00:00Z"` — the single launch timestamp (9:00 AM America/Chicago).
- `SOI_OVERRIDE` — emergency switch. `null` = automatic; `"countdown"` = always countdown;
  `"report"` = always report. Change it and push; Vercel redeploys in about a minute.

Before launch, `/` redirects to `/countdown/`. At launch the countdown reaches zero and goes to
`/`, which now shows the report. Tabs left open (or asleep) switch when they come back.

### Testing the launch without changing the clock

Add `?now=` to any URL. It only affects that page load (and is carried along when the
countdown hands over to `/`); normal visitors never have it.

| URL | Simulates |
|---|---|
| `/?now=launch-1h` | an hour before launch → countdown |
| `/countdown/?now=launch-10s` | watch the countdown hit zero and switch to the report |
| `/?now=launch` | the exact launch moment → report |
| `/?now=launch%2B1h` | an hour after launch → report (`%2B` = `+`) |
| `/?now=2026-11-04T14:59:50Z` | any absolute instant |

## Structure

- `assets/ribbon.js` — background video: picks AV1 / HEVC / H.264, respects reduced motion and Data Saver, drives the Play/Pause control
- `assets/glass.js` — WebGL Liquid Glass behind the RSVP button; falls back to a translucent black pill
- `assets/media/` — ribbon video and poster derivatives (desktop 16:9, mobile 9:16 crop)
- `assets/fonts/` — licensed ABC Diatype Light and Medium (WOFF2)
- `assets/logos/` — partner logos exported from Figma as SVG
- `robots.txt`, `sitemap.xml`, favicons, `assets/social/` — SEO and sharing

## Regenerating the ribbon media

Masters: the 2560×1440 16 fps ribbon video and the static ribbon artwork. The mobile
derivatives are a 9:16 crop centred on Figma's mobile slice: `crop=810:1440:137:0` on a
2560×1440 frame. Near-black is mapped to true black so the video matches the page's `#000`.

```bash
CRUSH="curves=all='0/0 0.031/0 0.08/0.06 1/1'"
COL="-color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv"
# desktop (use -vf "crop=810:1440:137:0,$CRUSH" for mobile)
ffmpeg -i master.mp4 -an -vf "$CRUSH" -c:v libsvtav1 -preset 4 -crf 28 -pix_fmt yuv420p10le -g 32 $COL -movflags +faststart ribbon-desktop-av1.mp4
ffmpeg -i master.mp4 -an -vf "$CRUSH" -c:v libx265 -preset slow -crf 24 -pix_fmt yuv420p10le -tag:v hvc1 $COL -movflags +faststart ribbon-desktop-hevc.mp4
ffmpeg -i master.mp4 -an -vf "$CRUSH" -c:v libx264 -preset slow -crf 21 -profile:v high -pix_fmt yuv420p -g 32 $COL -movflags +faststart ribbon-desktop-h264.mp4
```

Posters come from the bottom 16:9 band of the static artwork (which registers 1:1 with
the video frame), resized to 2560/1920/1280 wide (desktop) and the same 810×1440 crop
(mobile, plus 540×960), encoded as AVIF (`avifenc -q 62 -d 10`) and WebP (`cwebp -q 82`).

## Production domain

Canonical, Open Graph, JSON-LD, `robots.txt` and `sitemap.xml` use
`https://innovation-report-pmc6.vercel.app`. If the site moves to a custom domain,
replace that origin in `index.html`, `robots.txt` and `sitemap.xml`.
