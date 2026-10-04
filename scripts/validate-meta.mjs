#!/usr/bin/env node
/**
 * Prüft data/meta.json gegen die offizielle Kartendatenbank und die Bannliste.
 *
 * Läuft vor jedem Veröffentlichen neuer Turnierlisten (auch bei der
 * wöchentlichen Aktualisierung). Fehler: Exit-Code 1, nichts darf live gehen.
 *
 *   node scripts/validate-meta.mjs
 *
 * Geprüft wird je Deck: Legende existiert und ist eine Legende; jede Karte
 * existiert (fullName), ist Einheit/Zauber/Gear, liegt in der
 * Domain-Identität der Legende, ist nicht gebannt; Anzahl 1–3 ([Unique] 1);
 * Hauptdeck höchstens 40. Tier-Einträge müssen auf echte Legenden zeigen.
 */
import { readFile } from 'node:fs/promises';
import { BANNED } from '../js/banlist.js';

const cards = JSON.parse(await readFile(new URL('../data/cards.json', import.meta.url), 'utf8')).cards;
const meta = JSON.parse(await readFile(new URL('../data/meta.json', import.meta.url), 'utf8'));

const byName = new Map();
for (const c of cards) if (!byName.has(c.fullName.toLowerCase())) byName.set(c.fullName.toLowerCase(), c);

const errors = [];
const warn = [];
for (const [i, d] of meta.decks.entries()) {
  const where = `Deck ${i + 1} (${d.name ?? '?'})`;
  const legend = byName.get(String(d.legend ?? '').toLowerCase());
  if (!legend || legend.type !== 'legend') { errors.push(`${where}: Legende "${d.legend}" unbekannt`); continue; }
  for (const f of ['name', 'event', 'date', 'source']) if (!d[f]) errors.push(`${where}: Feld "${f}" fehlt`);
  const ident = new Set(legend.domains);
  let total = 0;
  for (const [name, n] of d.cards ?? []) {
    const c = byName.get(String(name).toLowerCase());
    if (!c) { errors.push(`${where}: Karte "${name}" nicht in der Datenbank`); continue; }
    if (!['unit', 'spell', 'gear'].includes(c.type)) errors.push(`${where}: "${name}" ist ${c.type}, gehört nicht ins Hauptdeck`);
    if (c.domains.some(x => x !== 'colorless' && !ident.has(x))) errors.push(`${where}: "${name}" (${c.domains}) passt nicht zur Legende (${legend.domains})`);
    if (BANNED.has(c.fullName.toLowerCase())) errors.push(`${where}: "${name}" ist gebannt`);
    const max = /\[Unique\]/.test(c.text ?? '') ? 1 : 3;
    if (!Number.isInteger(n) || n < 1 || n > max) errors.push(`${where}: "${name}" Anzahl ${n} (erlaubt 1–${max})`);
    total += n;
  }
  if (total > 40) errors.push(`${where}: ${total} Hauptdeck-Karten (max. 40)`);
  if (total < 20) warn.push(`${where}: nur ${total} Karten – Kernliste, kein volles Deck`);
}
for (const name of Object.keys(meta.tiers?.legends ?? {})) {
  const l = byName.get(name.toLowerCase());
  if (!l || l.type !== 'legend') errors.push(`Tier-Eintrag: "${name}" ist keine Legende`);
}

for (const w of warn) console.log('Hinweis:', w);
if (errors.length) {
  for (const e of errors) console.error('FEHLER:', e);
  console.error(`${errors.length} Fehler – data/meta.json NICHT veröffentlichen.`);
  process.exit(1);
}
console.log(`OK: ${meta.decks.length} Turnierlisten, ${Object.keys(meta.tiers?.legends ?? {}).length} Tier-Einträge, Stand ${meta.updated}.`);
