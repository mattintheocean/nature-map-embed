# Nature map embed

The map without the control panel, for a Webflow section.

## Files

- `nature-grid-embed.js` is the only file to host. It holds the map code and the Auckland land cover data (about 420KB).
- `src/nature-grid-map.js` is the map code. After changing it, run `./build.sh` to rebuild `nature-grid-embed.js`.
- `test.html` is a sample page with content above and below the map.

## In Webflow

1. The file is hosted from the public repo github.com/mattintheocean/nature-map-embed through jsDelivr. The link is pinned to a version tag, so it never changes underneath the live site.
2. Give the section a height, for example 80vh.
3. Add a Code Embed inside the section:

```html
<div class="nature-map" data-zoom="1" style="width:100%;height:100%;min-height:480px"></div>
<script src="https://cdn.jsdelivr.net/gh/mattintheocean/nature-map-embed@v1.8.0/nature-grid-embed.js" defer></script>
```

If more than one page uses the map, the `<script>` line can go in the site's footer code instead. The map only draws on the published site or in Preview, not in the Designer canvas.

## Interaction

- Mouse: nature returns in a circle around the pointer as it moves across the map, and each spot fades back to normal shortly after the pointer moves on. Dragging pans, and the + and − buttons in the top left zoom.
- Touch: nature returns around the finger while it's on the map and fades when it lifts. One finger pans, and two fingers pinch to zoom.
- The scroll wheel is left to the page, so scrolling past the map works as usual. On touch screens a swipe that starts on the map pans the map instead of the page.

## Markers

Put one element with a `data-marker` attribute inside the map `div` for each marker. The marker appears at `data-lat` / `data-lng`, and whatever is inside the element shows in the card when the marker is clicked:

```html
<div class="nature-map" style="width:100%;height:100%;min-height:480px">
  <div data-marker data-lat="-36.848" data-lng="174.763" hidden>
    <div class="nature-map-number">520+</div>
    <div class="nature-map-label">Community groups active across Auckland’s conservation network</div>
  </div>
  <div data-marker data-lat="-36.786" data-lng="174.860" hidden>
    <div class="nature-map-number">40+</div>
    <div class="nature-map-label">Predator-free islands in the Hauraki Gulf</div>
  </div>
</div>
```

- Get the coordinates by right-clicking a spot in Google Maps; the first number is `data-lat` and the second is `data-lng`.
- `nature-map-number` and `nature-map-label` give the big figure and the uppercase caption. Other HTML, such as a paragraph or a link, also works inside the card.
- The card uses the page's font, so it picks up the Webflow site's typography.
- Keep `hidden` on each marker element so its text doesn't flash on the page before the map loads.
- Each marker is a dark grid cell with a tag showing its number. On hover the tag expands to show the caption.
- Long captions are cut off in the tag. `data-tag-label="Community groups"` gives the tag a shorter caption, and `data-tag="…"` overrides the number. The card still shows the full content.
- `data-title` on a marker sets its screen-reader label, which otherwise comes from its text.
- Clicking the map, the × or pressing Esc closes the card. Only one card is open at a time.

## Options

Set these as attributes on the `div`, for example `data-recovery="0.3"`:

| Attribute | Default | Meaning |
|---|---|---|
| `data-frame` | `city` | Starting view: `city` (the harbours), `region`, or `markers` to fit every marker in view. `data-zoom` still applies, and the map can't zoom out past the edge of the data, so on a very wide, short section the furthest markers may sit just outside the view |
| `data-zoom` | `1` | Starting zoom: `1` fits the frame, `2` is twice as close, `0.5` is further out (limited to the region's edge) |
| `data-recovery` | `0.5` | Nature return level, 0 to 1 |
| `data-cell` | `22` | Cell size in px |
| `data-density` | `0.5` | Share of dense crosses |
| `data-weight` | `0.14` | Line weight |
| `data-texture` | `0.35` | Colour variation |
| `data-scale` | `0.35` | Noise scale |
| `data-brush` | `5` | Radius of the effect around the pointer, in cells |
| `data-seed` | random | A fixed number gives the same pattern on every load |
| `data-hint` | `Drag to move the map` | Hint beside the zoom buttons, which fades once the map is dragged. Set your own text, or `off` to hide it |
| `data-zoom-buttons` | on | Set to `off` to hide + and − |
| `data-credit` | on | Set to `off` only if the data is credited elsewhere on the page |

The data credit is required by the CC BY 4.0 licence on the LCDB and Stats NZ data.

From page code, `document.querySelector('.nature-map').__natureMap` exposes `setRecovery(0..1)`, `resetView()`, `openMarker(index)` and `closeMarker()`. For example, `setRecovery` could be tied to page scroll.

## Releasing a change

1. Edit `src/nature-grid-map.js`, run `./build.sh`, and check `test.html`.
2. Commit, then tag a new version and push it: `git tag v1.8.1 && git push origin main v1.8.1`.
3. Change the version (for example `@v1.8.0`) to the new tag in the Webflow embed and republish.
