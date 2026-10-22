import { caps } from '../slug.js';
import { publicUrl } from '../paths.js';

export const EMBED_COLOR = 0xff5a1f;

export function projectCard(row) {
  const project = row.project;
  const builders = row.builders.map((person) => person.display_name).filter(Boolean);
  const socials = row.builders.flatMap((person) => person.socials || []).filter(Boolean);
  const organizers = (row.organizers || []).map((org) => org.name).filter(Boolean);
  const lines = [
    project.one_liner || 'null',
    '',
    `Builders: ${builders.length ? builders.join(', ') : 'null'}`,
    `Socials: ${socials.length ? socials.join(' · ') : 'null'}`,
    `Hackathon: ${project.hackathon || 'null'}`,
    `Organizers: ${organizers.length ? organizers.join(', ') : 'null'}`,
  ];
  const thumb = project.thumbnail_url
    || `${publicUrl()}/thumbs/${(project.id || '').replace(/^prj_/, '')}.png`;
  const embed = {
    color: EMBED_COLOR,
    title: caps(project.title || 'untitled'),
    description: lines.join('\n').slice(0, 4000),
    url: `${publicUrl()}/p/${encodeURIComponent(project.id)}`,
    image: thumb ? { url: thumb } : undefined,
    fields: [
      { name: 'Bar', value: row.reason || 'null', inline: false },
      {
        name: 'Score',
        value: `${row.score ?? '—'} · likes ${row.likes ?? 0}${row.capped ? ' · capped' : ''}`,
        inline: true,
      },
    ],
    footer: { text: 'Via · #FF5A1F' },
  };
  const components = [
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: `Like · ${row.likes ?? 0}`, custom_id: `via:like:${project.id}` },
        { type: 2, style: 5, label: 'Leaderboard', url: `${publicUrl()}/` },
      ],
    },
  ];
  return { embeds: [embed], components };
}

export function boardBannerText() {
  return caps('Via · the bar');
}
