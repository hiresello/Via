# Via

Track 2 — Know Your Members. Discord is the room; the web bar is the public order of what got built. One guild, one SQLite ontology. A like is conviction. It does not replace a missing path.

Display font is `fonts/Apestron.otf` (family name inside the file: Apestron Trial Version).

## Another community, next week

```bash
cp .env.example .env
# fill DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID, VIA_PUBLIC_URL
npm install
npm test
npm start          # web bar
npm run bot        # Discord slash commands in that guild
```

`npm start` serves the bar. `npm run demo` resets the seed database and serves it with no keys. OpenRouter and X keys are optional — see `.env.example`.

The seed is the verified list in `data/hackathon-seed.json` (synced from `/cursor/stores/self/docs/hackathon-seed.json` when that file is present). Via does not invent rows. A field the page did not state is null. After the seed grows, run `npm run thumbs` (Apestron from `VIA_DISPLAY_FONT` or `/cursor/stores/self/media/fonts/Apestron.otf` when present) to refresh every `public/thumbs/<slug>.png`.

## Demo, zero keys

Requires Node 22.13 or newer (`node:sqlite`).

```bash
npm install
npm test
npm run demo
```

`npm test` loads the real seed, ranks with the stub (same caps as the live model), shows a like cannot put a project with no runnable path at #1, shows a like can move a project that already has a path, asserts a 404 on `microsoft/microsoft-decision-1` stays on `model: stub`, then reopens SQLite.

`npm run demo` resets `data/via.sqlite`, seeds, ranks, and serves the leaderboard at http://127.0.0.1:8787/ . **No API keys required.** With no `OPENROUTER_API_KEY` the ranker is `model: stub` / `chosen_by: stub`.

With the demo running:

```bash
npm run smoke
```

`scripts/smoke.sh` seeds, then curls `/`, `/terms`, `/privacy`, and `/api/board`.

`docker compose up --build` runs that same demo.

## Discord

The bot does not create the server. The guild is named Via.

1. discord.com/developers → New Application → Bot → Reset Token → `DISCORD_TOKEN`.
2. OAuth2 → note `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`. URL Generator: scopes `bot` and `applications.commands`. Permissions: Send Messages, Embed Links, Attach Files. Invite that URL into the Via guild.
3. Developer Mode on, right-click the server, Copy Server ID → `DISCORD_GUILD_ID` (or list ids in `VIA_GUILD_IDS`).
4. `cp .env.example .env` and fill Discord + `VIA_PUBLIC_URL`. `OPENROUTER_API_KEY` is optional.
5. `npm run bot`. Slash commands register on that guild. `/rank` posts the bar. Like writes the ontology and re-ranks.

## Decision model

Pinned OpenRouter slug: `microsoft/microsoft-decision-1`. Via calls `POST https://openrouter.ai/api/v1/systemone` with `{ model, state, questions }` (`choice`, `noul`, or `score`). The response is calibrated probabilities, not generated text. If that route 404s, Via tries the alpha decisions route once. If OpenRouter still 404s or answers as a different model, Via stays on `model: stub` / `chosen_by: stub` and records that `microsoft/microsoft-decision-1` was rejected. No substitute model is invented.

The prompt is plan §10: in-window delta, one runnable path, hard part finished, the constraint, who pushed. Likes reorder only projects that already clear path, clock, and hard part. Missing path, clock, or a mocked core caps the score in code as well as in the prompt.

## Pages

`/` leaderboard, `/p/new` submit, `/p/:id` project (Open Graph + Twitter large image), `/me` profile, `/terms`, `/privacy`, `/thumbs/<slug>.png` share cards. Every project has `thumbnail_url` + `image_path`; seed thumbs live in `public/thumbs/` (`npm run thumbs` regenerates). Visual contract: `public/via-ui.css` (served at `/via-ui.css`). Field `#080808`. `#FF5A1F` is the wordmark only. Acid `#7CFF77` is a thin frame on rank #1.

**Type:** Display is **Apestron Trial Version** (`fonts/Apestron.otf`, the family name inside the file), weight 400, no synthetic bold. Body is OFL **Instrument Sans**. Name lives on `/me`. One Like control per card. Discord cannot load a webfont, so `/rank` attaches a PNG when Chrome is present.

### Discord Developer Portal URLs

Do not invent a domain. After you set `VIA_PUBLIC_URL` to whatever host you deploy (Vercel prints it; local demo uses `http://127.0.0.1:8787`), paste these into the Discord application’s Terms of Service and Privacy Policy fields:

- Terms of Service: `VIA_PUBLIC_URL/terms`
- Privacy Policy: `VIA_PUBLIC_URL/privacy`

Privacy states Discord user id, opt-in profile, likes, intro/speaker logs, and that Via does not secretly scrape.

## Deploy

```bash
npx vercel deploy
```

Production URL is whatever that command prints. This repo does not invent one. Put that origin in `VIA_PUBLIC_URL` (no trailing slash). On Vercel the SQLite file lives in `/tmp` and the seed is reloaded when that disk is empty.

## Publish

This tree is the Via repo. Agents on the Cursor GitHub app often cannot `gh repo create`. If push fails with `Resource not accessible by integration` / `createRepository`, Juan runs these from a machine logged into the GitHub account that should **own** the public repo:

```bash
cd /home/ubuntu/via   # or your clone of this tree
git checkout via/thumbs-refresh

# Create the empty public repo (once)
gh repo create via --public --source=. --remote=origin --push

# If the repo already exists under your user/org but has no remote here:
git remote add origin git@github.com:YOUR_USER/via.git
# or: git remote add origin https://github.com/YOUR_USER/via.git
git push -u origin via/thumbs-refresh
git push -u origin main   # after you merge, or push main when ready
```

Replace `YOUR_USER` with the real GitHub user or org. Do not invent a production domain here — after Vercel import, set `VIA_PUBLIC_URL` to the URL Vercel prints.

## License

Code: MIT (`LICENSE`). Display: Apestron Trial (`fonts/Apestron.otf`, Befonts personal/trial — buy a commercial license before a paid deploy). Body: Instrument Sans OFL. Syne and Space Grotesk files remain in `fonts/` for older Discord renders.
