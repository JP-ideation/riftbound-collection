#!/usr/bin/env node
/**
 * Holt die offizielle Riftbound-Kartendatenbank von Riot und schreibt sie
 * schlank normalisiert nach data/cards.json.
 * Keine Abhängigkeiten, kein API-Key. Läuft via GitHub Action taeglich.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';

const HOST = 'https://content.publishing.riotgames.com';
const START = '/publishing-content/v2.0/public/channel/riftbound_website/list/riftbound_gallery_cards?locale=en_US&from=0&limit=1000';
const UA = { 'User-Agent': 'riftbound-collection/1.0 (+github pages app)' };

/**
 * Riot liefert Ability-Texte als HTML mit :rb_xyz:-Symbolplatzhaltern.
 * Die vollstaendige Liste der vorkommenden Token (aus allen 1189 Karten
 * ausgezaehlt): :rb_might:, :rb_exhaust:, :rb_energy_0: bis :rb_energy_12:,
 * :rb_rune_rainbow: und :rb_rune_<domain>:, dazu &gt; und &quot;.
 *
 * Energiekosten werden {3} geschrieben, damit sie nicht mit Schluesselwoertern
 * wie [Assault 2] verwechselt werden. Der Kartentext bleibt englisch - die
 * Kartennamen sind es auch, gemischte Sprache liest sich schlechter.
 */
function plainText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/:rb_energy_(\d+):/g, '{$1}')
    .replace(/:rb_rune_rainbow:/g, '[Power]')
    .replace(/:rb_rune_([a-z]+):/g, (_, d) => `[${d[0].toUpperCase()}${d.slice(1)}]`)
    .replace(/:rb_might:/g, ' Might')
    .replace(/:rb_exhaust:/g, ' Exhaust')
    .replace(/:rb_([a-z0-9_]+):/g, ' $1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

async function getJson(path) {
  const res = await fetch(HOST + path, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${path}`);
  return res.json();
}

function normalize(c) {
  const types = (c.cardType?.type ?? []).map(t => t.id);
  return {
    id: c.id,
    name: c.name,
    set: c.set?.value?.id ?? '?',
    setName: c.set?.value?.label ?? '',
    num: c.collectorNumber ?? null,
    code: c.publicCode ?? '',
    // publicCode mit "*" markiert Alternate/Extended Art (Sets OGNX/UNLX/VENX im Export)
    variant: (c.publicCode ?? '').includes('*'),
    type: types[0] ?? 'unknown',
    types,
    rarity: c.rarity?.value?.id ?? '',
    domains: (c.domain?.values ?? []).map(d => d.id),
    energy: c.energy?.value?.id ?? null,
    might: c.might?.value?.id ?? null,
    tags: c.tags?.tags ?? [],
    text: plainText(c.text?.richText?.body),
    img: c.cardImage?.url ?? '',
  };
}

const cards = [];
let path = START;
while (path) {
  const page = await getJson(path);
  cards.push(...page.data);
  const meta = page.metadata ?? {};
  const done = (meta.from ?? 0) + (meta.limit ?? 0) >= (meta.totalItems ?? 0);
  path = done ? null : page.linkdata?.next ?? null;
}

const out = {
  updated: new Date().toISOString(),
  source: 'playriftbound.com (offizielle Riot-Kartengalerie)',
  count: cards.length,
  sets: [...new Set(cards.map(c => c.set?.value?.id))].filter(Boolean).sort(),
  // Eindeutige Gesamtordnung: Set und Sammlernummer allein reichen nicht,
  // weil Basisdruck und Alt-Art dieselbe Nummer tragen (OGN-007 / OGN-007a).
  // Ohne den Code als Stichentscheid wechselt die Reihenfolge je nach
  // Antwortreihenfolge der API - und die Datei aendert sich bei jedem Lauf.
  cards: cards.map(normalize).sort((a, b) =>
    a.set.localeCompare(b.set) || (a.num ?? 0) - (b.num ?? 0)
    || a.code.localeCompare(b.code) || a.id.localeCompare(b.id)),
};

await mkdir('data', { recursive: true });

// Nur schreiben, wenn sich die Karten wirklich geaendert haben. Der
// Zeitstempel allein aendert sich bei jedem Lauf - ohne diesen Vergleich
// entstuende taeglich ein leerer Commit samt ueberfluessigem Deploy.
const neu = JSON.stringify(out.cards);
try {
  const alt = JSON.parse(await readFile('data/cards.json', 'utf8'));
  if (JSON.stringify(alt.cards) === neu) {
    console.log(`Keine Aenderung: ${out.count} Karten, Datei bleibt unangetastet.`);
    process.exit(0);
  }
} catch { /* keine bisherige Datei - normal schreiben */ }

await writeFile('data/cards.json', JSON.stringify(out));
console.log(`${out.count} Karten geschrieben nach data/cards.json (Sets: ${out.sets.join(', ')})`);
