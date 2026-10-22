import path from 'node:path';
import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { hasOpenRouterKey } from '../decision.js';
import { loadEnv } from '../env.js';
import { rootDir, dbPath } from '../paths.js';
import { openOntology } from '../ontology.js';
import { seedOntology } from '../seed.js';
import { likeProject, rankBoard, ensurePerson } from '../service.js';
import { projectCard } from './card.js';
import { bannerHtml, cardHtml, renderHtmlToPng } from './render.js';

loadEnv(path.join(rootDir, '.env'));

const token = process.env.DISCORD_TOKEN;
const guildId =
  process.env.DISCORD_GUILD_ID ||
  String(process.env.VIA_GUILD_IDS || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)[0] ||
  null;

if (!token || !guildId) {
  console.error(`Via bot needs a Discord app and the Via guild.

1. discord.com/developers → New Application → Bot → Reset Token → DISCORD_TOKEN.
2. OAuth2 URL Generator: scopes bot and applications.commands. Permissions: Send Messages, Embed Links, Attach Files. Open that URL and invite the bot into the guild named Via.
3. Enable Developer Mode, right-click the Via server, Copy Server ID → DISCORD_GUILD_ID (or VIA_GUILD_IDS).
4. Copy .env.example to .env. Fill DISCORD_TOKEN, DISCORD_GUILD_ID, VIA_PUBLIC_URL. OPENROUTER_API_KEY is optional.
5. npm run bot — slash commands register on that guild only. Then /rank.`);
  process.exit(1);
}

const ontology = openOntology(dbPath());
if (!ontology.query({ type: 'Project' }).length) await seedOntology(ontology);

const commands = [
  { name: 'rank', description: 'Public bar — top hackathon projects', options: [
    { name: 'n', description: 'How many', type: 4, min_value: 1, max_value: 10 },
  ] },
  { name: 'projects', description: 'Same as /rank' },
  { name: 'project', description: 'Post one project card', options: [
    { name: 'id', description: 'Project id from the board', type: 3, required: true },
  ] },
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (ready) => {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(ready.user.id, guildId), { body: commands });
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  console.log(`Via online as ${ready.user.tag} in ${guild?.name || guildId}`);
  if (guild && guild.name !== 'Via') {
    console.warn(`Guild name is "${guild.name}". Juan’s guild is named Via. Commands are still scoped to DISCORD_GUILD_ID.`);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && (interaction.commandName === 'rank' || interaction.commandName === 'projects')) {
      const board = await ensureRanked();
      const n = interaction.options.getInteger('n') || Math.min(5, board.rows.length);
      const rows = board.rows.slice(0, n);
      if (!rows.length) {
        await interaction.reply({ content: 'The board is empty. Seed has no projects, or post one at /p/new.', ephemeral: true });
        return;
      }
      await interaction.deferReply();
      const banner = await safePng(bannerHtml(), 1200, 360);
      await interaction.editReply({
        embeds: [{ color: 0xff5a1f, description: `Top ${rows.length} · ${board.model || 'stub'}` }],
        files: banner ? [{ attachment: banner, name: 'bar.png' }] : [],
      });
      for (const row of rows) await sendCard(interaction, row);
      return;
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'project') {
      const id = interaction.options.getString('id', true);
      const board = await ensureRanked();
      const row = board.rows.find((item) => item.project.id === id);
      if (!row) {
        await interaction.reply({ content: `No project ${id}.`, ephemeral: true });
        return;
      }
      await interaction.deferReply();
      await sendCard(interaction, row, true);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('via:like:')) {
      const projectId = interaction.customId.slice('via:like:'.length);
      await interaction.deferUpdate();
      const person = ensurePerson(ontology, {
        displayName: interaction.user.globalName || interaction.user.username,
        discordId: interaction.user.id,
      });
      const board = await likeProject(ontology, {
        userId: person.id,
        projectId,
        signal: 'like',
      }, { forceStub: !hasOpenRouterKey() });
      const row = board.rows.find((item) => item.project.id === projectId);
      if (!row) return;
      const payload = projectCard(row);
      const png = await safePng(cardHtml(row));
      await interaction.editReply({
        ...payload,
        files: png ? [{ attachment: png, name: 'card.png' }] : [],
      });
    }
  } catch (error) {
    const message = error.message || 'Via failed';
    if (interaction.deferred || interaction.replied) await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    else await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
  }
});

async function ensureRanked() {
  return rankBoard(ontology, { forceStub: !hasOpenRouterKey() });
}

async function sendCard(interaction, row, edit) {
  const payload = projectCard(row);
  const png = await safePng(cardHtml(row));
  const message = {
    ...payload,
    files: png ? [{ attachment: png, name: 'card.png' }] : [],
  };
  if (png) message.embeds[0].image = { url: 'attachment://card.png' };
  if (edit) await interaction.editReply(message);
  else await interaction.followUp(message);
}

async function safePng(html, width, height) {
  try {
    return await renderHtmlToPng(html, { width, height });
  } catch (error) {
    console.warn(`Card image skipped: ${error.message}`);
    return null;
  }
}

client.login(token);
