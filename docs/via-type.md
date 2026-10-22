# Via display type

## Juan’s look — Apestron (trial)

Juan supplies [Apestron](https://befonts.com/apestron-font.html) (Befonts: **Personal Use Only — Trial**).

- Place `Apestron.otf` (and optionally `.ttf`) under `fonts/` **locally**, or set `VIA_DISPLAY_FONT` to an absolute path.
- The app wires `@font-face { font-family: "Apestron"; … }` when that file exists.
- **Do not commit** the trial OTF/TTF into the public MIT tree. `.gitignore` already excludes `fonts/Apestron.*`.

## Clone default — Syne (OFL)

Without Apestron on disk, display falls back to bundled **Syne** (`fonts/Syne-*.woff2`, `fonts/OFL-Syne.txt`). Another community can clone and run fully OSS. Buy a commercial Apestron license before shipping that face publicly.

Body UI stays **Space Grotesk** (OFL). Never Inter.
