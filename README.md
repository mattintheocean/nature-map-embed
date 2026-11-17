# Nature map embed

The map without the control panel, for a Webflow section.

## Files

- `nature-grid-embed.js` is the only file to host. It holds the map code and the Auckland land cover data (about 420KB).
- `src/nature-grid-map.js` is the map code. After changing it, run `./build.sh` to rebuild `nature-grid-embed.js`.
- `test.html` is a sample page with content above and below the map.

## In Webflow

1. Host `nature-grid-embed.js` somewhere public, such as jsDelivr from a GitHub repo, Netlify or Cloudflare Pages. Webflow's asset uploads don't accept `.js` files.
2. Give the section a height, for example 80vh.
3. Add a Code Embed inside the section:

```html
<div class="nature-map" style="width:100%;height:100%;min-height:480px"></div>
<script src="https://YOUR-HOST/nature-grid-embed.js" defer></script>
```

If more than one page uses the map, the `<script>` line can go in the site's footer code instead. The map only draws on the published site or in Preview, not in the Designer canvas.

## Interaction

- Mouse: moving over the map restores nature (hold Shift to degrade), dragging pans, and the + and − buttons zoom.
- Touch: one finger pans and restores nature where it touches, and two fingers pinch to zoom.
- The scroll wheel is left to the page, so scrolling past the map works as usual. On touch screens a swipe that starts on the map pans the map instead of the page.

## Options

Set these as attributes on the `div`, for example `data-recovery="0.3"`:

| Attribute | Default | Meaning |
|---|---|---|
| `data-frame` | `city` | Starting view: `city` (the harbours) or `region` |
| `data-recovery` | `0.5` | Nature return level, 0 to 1 |
| `data-cell` | `22` | Cell size in px |
| `data-density` | `0.5` | Share of dense crosses |
| `data-weight` | `0.14` | Line weight |
| `data-texture` | `0.35` | Colour variation |
| `data-scale` | `0.35` | Noise scale |
| `data-brush` | `5` | Restore brush size in cells |
| `data-seed` | random | A fixed number gives the same pattern on every load |
| `data-zoom-buttons` | on | Set to `off` to hide + and − |
| `data-credit` | on | Set to `off` only if the data is credited elsewhere on the page |

The data credit is required by the CC BY 4.0 licence on the LCDB and Stats NZ data.

From page code, `document.querySelector('.nature-map').__natureMap` exposes `setRecovery(0..1)`, `clearBrush()` and `resetView()`. For example, `setRecovery` could be tied to page scroll.
