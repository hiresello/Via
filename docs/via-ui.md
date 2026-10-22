# Via UI — visual system

**Bar:** Linear · Stripe · Luma for craft — sparse placement, few buttons, quiet motion, addictive clarity.  
**Aesthetic:** cyberpunk / Omarchy — not minimal. Field + glass + orange working chrome; acid green only for hero / #1.  
**Refs:** [`media/via-cyberpunk-inspo.png`](/cursor/stores/self/media/via-cyberpunk-inspo.png) · [`media/via-type-specimen.png`](/cursor/stores/self/media/via-type-specimen.png) · surface map [`discord-ui-surface-map.md`](/cursor/stores/self/docs/discord-ui-surface-map.md) · drop-in CSS [`via-ui.css`](/cursor/stores/self/docs/via-ui.css).

This file is the contract for thin web (Vercel) and for how Discord must *echo* that contract. Discord cannot paint glass or Apestron/Syne live — see § Discord rules.

---

## 1. Principles

1. **Addictive clarity.** One job per view. Rank, intro reason, or evidence — never all three competing.
2. **Sparse placement.** Negative space is structure. If a control can be an icon or a key, do not label it twice.
3. **Few buttons.** Default: one primary action per panel. Secondary actions hide until hover / focus / menu.
4. **Quiet motion.** 120–200ms ease; opacity + translate only. Glow is state, not decoration on every idle element.
5. **Craft bar ≠ flat UI.** Linear / Stripe / Luma density and restraint — on a full cyberpunk field (dot grid, glass, bloom). Do not “simplify” into Inter-on-grey.
6. **Two accents, one job each.**
   - Working UI → near-black + **`#FF5A1F`** (focus, edges, likes, active nav, Discord embed color).
   - Hero / rank #1 → **acid green `#7CFF77`** (specimen field). Never paint chrome acid green.
7. **Display face is display only.** Juan’s look: Apestron when the trial file is local (not shipped in MIT). Clone default: OFL Syne. All-caps for hero titles and rank marks. Body / UI / mono stay quieter.
8. **Discord owns verbs; thin web owns density.** Match, like, intro, shortlist live as Discord actions. `/me`, `/p/new`, leaderboard authoring echo tokens here — then jump back.
9. **Evidence over ornament.** Speaker rows show GitHub / Devpost / Luma links. Empty fields stay empty — never invent.

---

## 2. Tokens

Canonical CSS lives in [`via-ui.css`](/cursor/stores/self/docs/via-ui.css). Hex locks:

| Token | Value | Use |
|-------|-------|-----|
| `--via-bg` | `#080808` | Field (canvas / page) |
| `--via-bg-elevated` | `#121212` | Raised wells, inputs |
| `--via-bg-panel` | `rgba(10, 10, 10, 0.72)` | Glass fill |
| `--via-grid-dot` | `#1a1a1a` | Dot grid |
| `--via-ink` | `#f2f2f2` | Primary text on dark |
| `--via-muted` | `#8a8a8a` | Labels, meta |
| `--via-faint` | `#3a3a3a` | Hairlines, idle icons |
| `--via-accent` | `#FF5A1F` | Working accent / Discord `0xFF5A1F` |
| `--via-accent-dim` | `rgba(255, 90, 31, 0.35)` | Soft fill / selection |
| `--via-acid` | `#7CFF77` | Hero / #1 only (specimen) |
| `--via-acid-ink` | `#080808` | Text *on* acid |
| `--via-danger` | `#ff3b5c` | Destructive only |
| `--via-ok` | `#7CFF77` | Success = acid (rare; prefer copy) |

**Type**

| Token | Value | Use |
|-------|-------|-----|
| `--via-font-display` | `"Apestron", "Syne", …` | Hero, rank digits, section marks — **all caps** (Apestron if present, else Syne) |
| `--via-font-ui` | `Geist` / `IBM Plex Sans` fallback | Body, buttons, nav |
| `--via-font-mono` | `JetBrains Mono` / `IBM Plex Mono` | IDs, scores, URLs, Ontology keys |
| `--via-fs-hero` | clamp 40–72px | Acid / display titles |
| `--via-fs-title` | 18–22px | Panel titles |
| `--via-fs-body` | 14px | Default |
| `--via-fs-label` | 11–12px | Uppercase meta labels |
| `--via-tracking-display` | `0.02em` | Display only |
| `--via-tracking-label` | `0.08em` | Meta labels |

**Space / shape / motion**

| Token | Value |
|-------|-------|
| Space scale | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 |
| `--via-radius-sm` | 8px |
| `--via-radius` | 14px |
| `--via-radius-lg` | 20px |
| `--via-radius-pill` | 999px |
| `--via-blur` | 20px |
| `--via-border` | `1px solid rgba(255,255,255,0.08)` |
| `--via-glow-accent` | `0 0 24px rgba(255, 90, 31, 0.45)` |
| `--via-glow-acid` | `0 0 32px rgba(124, 255, 119, 0.35)` |
| `--via-ease` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--via-dur` | `160ms` |

**Embed parity:** Discord bot embeds always `color: 0xFF5A1F`. Thin web focus rings use the same hex.

---

## 3. Surfaces

| Surface | Look | Where |
|---------|------|-------|
| **Field** | `#080808` + 24px faint dot grid | Page / canvas behind everything |
| **Glass** | Translucent panel, `--via-blur`, soft border, radius 14–20 | Cards, nodes, floating chrome on thin web |
| **Well** | Solid `#121212`, no blur | Inputs, nested rows inside glass |
| **Hero band** | Full-bleed `--via-acid` + `--via-acid-ink` type | Leaderboard header, rank #1 card only |
| **Rail** | 3–4px `--via-accent` vertical bar | Quote blocks, active match reason |
| **Embed (Discord)** | Flat dark card + orange accent color — **no** glass/blur | Project / person / intro / shortlist messages |
| **Ghost** | Transparent + faint border | Secondary buttons |

**Layering:** Field → glass → well → accent glow on *active* only. Do not stack multiple glowing panels.

**Minimal chrome on thin pages:** brand mark, one active nav word in orange, “Via · back to Discord” — no marketing mega-nav.

---

## 4. Hierarchy

1. **Hero / #1** — Display face on acid green. One statement. No orange competing in the same band.
2. **Primary working action** — single solid `#FF5A1F` control (Like, Match, Submit).
3. **Title** — Display face or strong UI sans; short.
4. **Body** — 14px UI sans; one short supporting sentence.
5. **Meta labels** — 11–12px uppercase tracked muted (“BUILDERS”, “HACKATHON”, “SCORE”).
6. **Values / links** — mono or ink; external proof links tint accent.
7. **Idle chrome** — faint icons, no glow.

**Rank rule:** only position `01` (or sole hero) may use acid. `02+` stay glass on field with orange for actions.

**Typography stack in a card:** label → display title → one-liner → meta grid → optional quote rail → one action row.

---

## 5. Anti-patterns

Refuse these without a Juan unlock:

- Painting **working chrome** acid green (nav, buttons, borders, Discord embeds).
- Committing **Apestron trial** into the public MIT tree (keep it local / licensed).
- **Inter / Roboto / system-only** as the designed look (fallback chain is fine; default stack is not the brand).
- **Purple / indigo / glow-soup** defaults; multi-layer drop shadows; emoji as UI.
- **Card soup** — borders + shadows + radii that do no job. Glass is the card; do not card inside glass without a well reason.
- **Pill clusters** and stat strips in the first viewport.
- **Loud motion** — bounce, infinite pulse on idle, parallax noise.
- **Many primaries** — more than one solid orange button per panel.
- **Invented evidence** — fake builders, socials, or ranks to fill layout.
- **Node canvas / Discord Activity** in the 3h cut (sequel only).
- Restyling Discord’s own chrome; fighting Components with custom CSS that Discord ignores.
- Cream / terracotta / broadsheet “AI default” palettes.
- Using acid green as a “success toast” everywhere — reserve it for hero / #1 (and rare true success if copy needs it).

---

## 6. Discord rules

Discord is the **community home**. It cannot render Apestron/Syne, glass blur, or acid bands as live type. Obey the surface map; this section is the UI contract for bot output.

| Rule | Do | Don’t |
|------|----|-------|
| Embed color | Always `0xFF5A1F` | Random brand colors per message |
| Accent meaning | Orange = Via / active / match | Acid green hex in embeds (Discord washes it; keep acid on thin web + PNG) |
| Display face | Render **Apestron/Syne on acid** to PNG for hero moments (rank #1, event art) and attach | Expect custom fonts inside Discord text |
| Density | Short title; structured fields; footer for score / “liked by” | Walls of markdown; duplicate buttons |
| Actions | ≤3 buttons visible (`Like` · `Thread` · `Open`); overflow → select / link | Five Primary buttons |
| Match edge | DM / ephemeral + reason + `Intro thread` | Fake “graph” ASCII art |
| Luma | Link out or thin-page embed | iframe inside a message |
| Voice | Guild voice channel | Custom waveform dock |
| Roles / mentions | Real `@user` for people | Plaintext names that look like mentions |
| Custom emoji | Optional orange mark for secondary reactions | Reaction-as-sole-vote (buttons own likes) |

**Components V2 / classic embeds:** either is fine if the card still reads as a dense “node”: title, one-liner, builders as mentions, proof links, one Like.

**Thin-web handshake:** every authoring page ends with return-to-Discord. Tokens on `/me` and `/p/new` must match this file so the jump does not feel like a second product.

---

## 7. Motion & interaction (thin web)

- Hover: +4% brightness or 1px translate — not scale-bounce.
- Focus: `outline: 2px solid var(--via-accent); outline-offset: 2px`.
- Active primary: accent fill + soft `--via-glow-accent` while pressed / busy.
- Rank #1 enter: fade + 8px rise once; no loop.
- Prefer `prefers-reduced-motion: reduce` → instant state swaps.

---

## 8. Checklist before ship

- [ ] Field is near-black; working accent is `#FF5A1F` only.
- [ ] Acid `#7CFF77` appears only on hero / #1 (or intentional PNG).
- [ ] Display strings use Apestron when local, else Syne; trial font not committed.
- [ ] ≤1 primary button per panel; sparse nav.
- [ ] Discord embeds `0xFF5A1F`; no fake canvas.
- [ ] Proof links real or omitted.
- [ ] CSS imported from `via-ui.css` (or tokens copied verbatim).

---

## Cross-refs

- Project locks: [`project-context.md`](/cursor/stores/self/docs/project-context.md)  
- Build plan: [`via-3h-build-plan.md`](/cursor/stores/self/docs/via-3h-build-plan.md)  
- Discord placement: [`discord-ui-surface-map.md`](/cursor/stores/self/docs/discord-ui-surface-map.md)  
- Brand upload: [`via-brand.md`](/cursor/stores/self/docs/via-brand.md)  
- CSS: [`via-ui.css`](/cursor/stores/self/docs/via-ui.css)
