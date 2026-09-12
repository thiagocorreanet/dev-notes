# DevNotes brand assets

The DevNotes identity uses a folded document with a code mark, blue and navy colors, and the tagline "Capture knowledge. Build better."

## Assets

| File                                                              | Purpose                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| [devnotes-cover.png](assets/devnotes-cover.png)                   | Landscape cover for the repository README             |
| [devnotes-identity-board.png](assets/devnotes-identity-board.png) | Original identity board supplied by the project owner |
| [devnotes-icon.svg](../public/devnotes-icon.svg)                  | Application icon and favicon used in the interface    |
| [devnotes-dark.png](assets/devnotes-dark.png)                     | Screenshot of the running app in its dark theme       |
| [devnotes-light.png](assets/devnotes-light.png)                   | Screenshot of the running app in its light theme      |

The identity board includes interface concepts. Use the application screenshots to describe implemented behavior. The README cover is brand artwork, not a screenshot.

## Colors and typography

The reference palette pairs blue `#3882F6` with navy `#0F172A`, a deep background `#0B1220`, and white/slate surfaces. Application controls use accessible variations through semantic tokens in `src/styles/global.css`.

Inter is used for interface and document text. JetBrains Mono is used for source code and metadata. The application bundles its fonts locally.

## Image provenance

The project owner supplied the original identity board on September 11, 2026. The repository cover was generated with the built-in image generation tool on September 12, 2026, using that board as a brand reference. The original board is included unchanged. The SVG application mark is a simplified vector interpretation used by the editor.

The screenshots were captured from the production application in an isolated browser context with sample notes. The interface is in Brazilian Portuguese; sample document prose is in English.

### Cover generation prompt

```text
Use case: ads-marketing. Asset type: landscape GitHub README brand cover for DevNotes, approximately 2:1 aspect ratio. Input image is the approved DevNotes identity board, a style and brand reference. Create a refined single brand cover, not another identity board. Preserve the recognizable folded document/code brand mark, blue and deep navy palette, and DevNotes wordmark. White/slate background, generous whitespace, precise Inter-style typography. Large document/code mark and DevNotes wordmark as the focal point; a restrained deep navy panel with subtle blue glow can frame the mark. Include ONLY the following exact English copy, perfectly spelled: "DevNotes", "Capture knowledge. Build better.", "A Markdown workspace for developers". Keep all text high contrast and readable at GitHub README width. Use the original's polished dimensional folded-paper visual detail but a simple clean composition. No interface mockups, no invented features, no badges, no additional text, no watermark. Deliver a polished raster PNG image usable as the repository banner.
```
