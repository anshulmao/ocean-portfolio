# Uploaded model intake

All nine user-supplied GLBs remain stored for review. Eight are active: the anchor, ship, chest and five coral arrangements. The fantasy whale shark is disabled in this refinement. They load after the first dive, with at most two concurrent requests; the initial surface does not request them.

Review: `http://127.0.0.1:4175/ocean-refined/asset-review.html`

## Prepared copies

Source files remain in `C:/Users/ANSHUL/Downloads`. Prepared copies are in `assets/models/`; `manifest.json` records file hashes, sizes, geometry counts, clips and embedded creator metadata. `CREDITS.md` retains creator names, source URLs, declared CC BY 4.0 licences and our changes.

Total source size: **89.04 MB**. Prepared size: **33.59 MB**, approximately **62% smaller**. Geometry, skeletal data and animation clips are retained. Textures use a 512px maximum for small coral clusters and 1024px for hero animals/props. PNG maps retain alpha and are encoded losslessly after resizing; JPEG maps are recompressed at quality 92. These are working copies, not final loading/performance budgets.

| Model | Triangles | Prepared MB | Intended use |
| --- | ---: | ---: | --- |
| Whale shark fantasy | 4,918 | 1.65 | Occasional large animal; six animation clips. Omit its bundled display ocean and particles. |
| Treasure chest | 4,588 | 3.98 | Projects; open/close clips. Recenter its large vertical export offset within a placement wrapper. |
| Anchor | 2,371 | 1.75 | About; freeze unused temporary rig, orient as fallen nautical anchor. |
| Coral waterverbruik gezond | 6,919 | 4.60 | Coral with Caranx, blue tang and yellow tang clips. |
| Coral landbouw gezond | 13,028 | 5.67 | Coral with bannerfish, double saddle and clownfish clips. |
| Coral anker kleur | 10,478 | 2.06 | Coral arrangement with clownfish clip. |
| Coral uitstoot gezond | 12,223 | 6.85 | Coral with clownfish, bannerfish and double saddle clips. |
| Coral visnet gezond fish | 8,469 | 4.97 | Coral with Caranx and bannerfish clips. |
| Sunken ship low poly | 15,040 | 2.06 | Experience landmark; static model. Resize original 4K maps to 1K. |

## In-world integration

- About: grounded fallen anchor; Experience: sunken ship on a reef terrace; Projects: two chests, with the second cloned from the same download. Static pieces use conservative collision proxies and open approaches.
- Fifteen static coral habitats reuse the five coral arrangements. Embedded animated fish are hidden; the new instanced fish system supplies consistent schooling instead.
- The supplied whale shark is restored at an eight-metre length with its Swimming clip slowed to 0.38 speed. Head/tail bones calibrate its forward axis; its route remains upright and follows seabed clearance. Bundled ocean/particle display content is hidden. Large procedural sharks and manta rays remain removed.
- Model scale and grounding use visible mesh bounds, excluding hidden display content. Skeletal and static resources are reused where possible.
- The credits panel links each creator and source, along with CC BY 4.0 and our preparation changes.
- No replacement diver, manta or reef shark was supplied. The existing diver remains procedural; large animal placeholders are removed. Further mesh batching, shared texture atlases and device-specific budgets are future optimization opportunities.

## Validation

All nine prepared files parsed, rendered and their supplied clips were enumerated in Chrome. Chest opening was visually inspected. The viewer was checked at desktop, tablet and mobile widths, in both background themes, with no page errors or failed requests after the favicon fix. The in-world browser check separately verifies nine unique requests, coral scale/proxies, anchor grounding, rigged fish counts, wreck/treasure approaches, paused chest opening, glow placement and whale clearance/orientation. Physical-device frame rate remains unmeasured.

Rebuild prepared copies from the ocean directory:

```powershell
python tools/prepare-models.py --source C:/Users/ANSHUL/Downloads
```
