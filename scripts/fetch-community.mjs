#!/usr/bin/env node
/**
 * Community-Decks von Piltover Archive auswerten → data/community.json
 *
 * Piltover Archive (piltoverarchive.com) sammelt tausende öffentliche
 * Riftbound-Decklisten. Für jede Legende holen wir die beliebtesten Decks der
 * letzten Monate und zählen, welche Karten in wie vielen davon stecken. Das
 * ist eine breite, datengestützte Ergänzung zu den wenigen Turnierlisten in
 * data/meta.json – und Grundlage für Ersatzvorschläge in der App.
 *
 * Schnittstelle: https://piltoverarchive.com/api/external/v1 (öffentlich,
 * ohne Schlüssel, laut Betreiber NICHT stabil – kann sich jederzeit ändern;
 * dann bricht das Skript ab und die alte Datei bleibt unverändert).
 *   GET  /decks?q=&sort=likes&dir=desc&page=&limit=   Decksuche
 *   GET  /decks/{id}                                 Deckinhalt (nur Karten-IDs)
 *   POST /cards/batch {ids}                          IDs → Karten (variantNumber, name)
 *
 * Läuft in GitHub Actions (update-community.yml), nicht im Browser.
 */
import { readFile, writeFile } from 'node:fs/promises';

const API = 'https://piltoverarchive.com/api/external/v1';
const UA = { 'User-Agent': 'riftbound-collection/1.0 (+github pages app)', Accept: 'application/json', 'Content-Type': 'application/json' };
const PER_LEGEND = 40;          // Decks je Legende
const MAX_AGE_DAYS = 120;       // nur Decks, die in dieser Zeit bearbeitet wurden
const PAUSE_MS = 150;           // höflicher Abstand zwischen Anfragen

const sleep = ms => new Promise(r => setTimeout(r, ms));
let calls = 0;
async function api(path, body) {
  calls++;
  await sleep(PAUSE_MS);
  const res = await fetch(API + path, body
    ? { method: 'POST', headers: UA, body: JSON.stringify(body) }
    : { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
const unwrap = r => (r && typeof r === 'object' && 'data' in r ? r.data : r);

const db = JSON.parse(await readFile(new URL('../data/cards.json', import.meta.url), 'utf8')).cards;
const banlist = await readFile(new URL('../js/banlist.js', import.meta.url), 'utf8');
const BANNED = new Set([...banlist.matchAll(/^\s*['"](.+?)['"],/gm)].map(m => m[1].toLowerCase()));

// Unsere Karten: über Set-Kürzel+Nummer ("OGN-197") und über den Namen findbar
const byCode = new Map(), byName = new Map();
for (const c of db) {
  const m = /^([A-Z]+)-0*(\d+)([a-z]?)/.exec(c.code ?? '');
  if (m && !byCode.has(`${m[1]}-${m[2]}`)) byCode.set(`${m[1]}-${m[2]}`, c);
  const k = c.fullName.toLowerCase();
  if (!byName.has(k) || (c.rarity !== 'showcase' && !c.variant && byName.get(k).variant)) byName.set(k, c);
}
const norm = s => String(s ?? '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+-\s+/, ', ').trim();
function ours(variant) {
  const vn = /^([A-Z]+)-0*(\d+)/.exec(String(variant?.variantNumber ?? '').toUpperCase());
  const hit = vn && byCode.get(`${vn[1]}-${vn[2]}`);
  if (hit) return byName.get(hit.fullName.toLowerCase()) ?? hit;
  const n = norm(variant?.card?.name);
  return byName.get(n) ?? null;
}

const legends = [...new Map(db.filter(c => c.type === 'legend' && !c.variant).map(c => [c.fullName, c])).values()];
const champOf = l => (l.tags ?? []).find(t => db.some(c => c.type === 'unit' && c.subtitle && c.name === t));
const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;

const out = {};
const cardCache = new Map();   // Piltover-Karten-ID → unsere Karte (oder null)

for (const legend of legends) {
  const champ = champOf(legend);
  if (!champ) continue;
  // Deckliste je Legende: Suche nach dem Championnamen, beliebteste zuerst,
  // dann auf genau diese Legende filtern (Legenden-Variantennummer oder Name).
  const legendCode = /^([A-Z]+)-0*(\d+)/.exec(legend.code)?.slice(1, 3).join('-');
  const picked = [];
  for (let page = 1; page <= 4 && picked.length < PER_LEGEND; page++) {
    const res = await api(`/decks?q=${encodeURIComponent(champ)}&sort=likes&dir=desc&page=${page}&limit=100`);
    const list = unwrap(res) ?? [];
    for (const d of list) {
      const lv = /^([A-Z]+)-0*(\d+)/.exec(String(d.legend?.variantNumber ?? '').toUpperCase())?.slice(1, 3).join('-');
      const sameLegend = (lv && byCode.get(lv)?.fullName === legend.fullName)
        || norm(d.legend?.name).endsWith(norm(legend.name));
      const fresh = !d.editedAt || Date.parse(d.editedAt) >= cutoff;
      if (sameLegend && fresh && picked.length < PER_LEGEND) picked.push(d);
    }
    if (!list.length || res?.pagination?.hasNext === false) break;
  }
  if (!picked.length) { console.log(`${legend.fullName}: keine Decks`); continue; }

  const counts = new Map();   // unsere Karte → { decks, copies }
  let used = 0;
  for (const summary of picked) {
    let deck;
    try { deck = unwrap(await api(`/decks/${encodeURIComponent(summary.id)}`)); } catch (e) { console.log('  übersprungen:', e.message); continue; }
    const entries = [...(deck.champions ?? []), ...(deck.maindeck ?? [])];
    const ids = [...new Set(entries.map(e => e.variantId ?? e.cardId).filter(id => id && !cardCache.has(id)))];
    for (let i = 0; i < ids.length; i += 100) {
      const res = await api('/cards/batch', { ids: ids.slice(i, i + 100) });
      for (const v of unwrap(res) ?? []) { const c = ours(v); cardCache.set(v.id, c); if (v.card?.id) cardCache.set(v.card.id, c); }
    }
    const inDeck = new Map();
    for (const e of entries) {
      const c = cardCache.get(e.variantId ?? e.cardId) ?? cardCache.get(e.cardId);
      if (!c || !['unit', 'spell', 'gear'].includes(c.type) || BANNED.has(c.fullName.toLowerCase())) continue;
      inDeck.set(c.fullName, (inDeck.get(c.fullName) ?? 0) + (e.quantity ?? 1));
    }
    const total = [...inDeck.values()].reduce((a, b) => a + b, 0);
    if (total < 30) continue;   // unfertige Decks auslassen
    used++;
    for (const [name, n] of inDeck) {
      const h = counts.get(name) ?? { decks: 0, copies: 0 };
      h.decks++; h.copies += Math.min(n, 3); counts.set(name, h);
    }
  }
  if (used < 5) { console.log(`${legend.fullName}: nur ${used} brauchbare Decks – ausgelassen`); continue; }

  // Je Karte: Anteil der Decks, in denen sie steckt, und Ø Kopien darin
  const cards = [...counts].map(([name, h]) => [name, Math.round(h.decks / used * 100) / 100, Math.round(h.copies / h.decks * 10) / 10])
    .filter(([, share]) => share >= 0.1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80);
  out[legend.fullName] = { decks: used, cards };
  console.log(`${legend.fullName}: ${used} Decks, ${cards.length} Karten (Top: ${cards.slice(0, 3).map(c => c[0]).join(', ')})`);
}

const n = Object.keys(out).length;
if (n < 5) {
  // Schnittstelle geändert oder nicht erreichbar: alte Datei NICHT überschreiben
  console.error(`Nur ${n} Legenden ausgewertet – data/community.json bleibt unverändert.`);
  process.exit(1);
}
const file = new URL('../data/community.json', import.meta.url);
const next = { source: 'piltoverarchive.com (öffentliche Decklisten, beliebteste je Legende)', perLegend: PER_LEGEND, maxAgeDays: MAX_AGE_DAYS, legends: out };
try {
  const prev = JSON.parse(await readFile(file, 'utf8'));
  if (JSON.stringify(prev.legends) === JSON.stringify(out)) { console.log('Keine Änderung.'); process.exit(0); }
} catch { /* erste Datei */ }
await writeFile(file, JSON.stringify({ updated: new Date().toISOString(), ...next }));
console.log(`${n} Legenden geschrieben, ${calls} Anfragen.`);
