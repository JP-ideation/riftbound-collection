/**
 * Deckbau aus dem eigenen Bestand.
 *
 * Regeln (Riftbound Konstruktion):
 *   1 Legende, Hauptdeck exakt 40 Karten, Runendeck exakt 12,
 *   3 Schlachtfelder mit unterschiedlichen Namen, max. 3 Kopien je Kartenname.
 *   Karten müssen in der Domain-Identität der Legende liegen (+ farblos).
 */

export const RULES = { MAIN: 40, RUNES: 12, BATTLEFIELDS: 3, MAX_COPIES: 3 };

const RARITY_SCORE = { common: 1, uncommon: 2.5, rare: 5, epic: 7, showcase: 5 };
const MAIN_TYPES = new Set(['unit', 'spell', 'gear']);

/** Zielkurve für 40 Karten – summiert exakt auf 40. */
const CURVE = { 1: 4, 2: 8, 3: 9, 4: 8, 5: 6, 6: 5 };
const bucket = e => Math.min(6, Math.max(1, e ?? 3));

/** Textschlüsselwörter, die in fast jedem Deck Wert haben. */
const KEYWORDS = [
  [/\bdraw\b/i, 3], [/conquer/i, 2.5], [/\bkill\b/i, 2.5], [/deals? \d/i, 2],
  [/\bshield/i, 1.5], [/\bready\b/i, 1.5], [/recycle/i, 1.5], [/\bbuff\b/i, 1.5],
  [/costs? .*less/i, 2], [/\bsearch\b/i, 2],
];

function inIdentity(card, identity) {
  const d = card.domains ?? [];
  if (!d.length) return true;
  return d.every(x => x === 'colorless' || identity.has(x));
}

/**
 * Wie gut passt eine Karte in dieses Deck?
 * Seltenheit als Grundwert, plus Synergie (Tags der Legende und im Pool
 * häufige Stämme), plus Statwert und Textschlüsselwörter.
 */
function scoreCard(card, legend, tagWeight) {
  let s = RARITY_SCORE[card.rarity] ?? 1;

  const legendTags = new Set(legend.tags ?? []);
  for (const t of card.tags ?? []) {
    if (legendTags.has(t)) s += 12;              // Champion-/Legenden-Synergie
    else s += (tagWeight.get(t) ?? 0) * 4;       // gut vertretener Stamm
  }

  if (card.type === 'unit' && card.might != null && card.energy != null) {
    s += Math.max(-2, Math.min(4, card.might * 1.2 - card.energy));
  }
  if (card.type === 'gear') s -= 0.5;            // Gear ist meist Support, nicht Kern

  for (const [re, w] of KEYWORDS) if (re.test(card.text ?? '')) s += w;

  const real = (card.domains ?? []).filter(d => d !== 'colorless');
  if (real.length === 1) s += 1.5;               // einfarbig = leichter zu bezahlen
  if (real.length === 0) s += 0.5;

  return s;
}

/** Häufigkeit von Tags im spielbaren Pool -> Stamm-Dichte 0..1 */
function tagWeights(pool) {
  const counts = new Map();
  for (const { card, qty } of pool) {
    for (const t of card.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + Math.min(qty, 3));
  }
  const w = new Map();
  for (const [t, n] of counts) w.set(t, Math.min(n, 12) / 12);
  return w;
}

/** Baut ein Deck für genau eine Legende. */
export function buildDeck(inventory, legendEntry, allCards) {
  const legend = legendEntry.card;
  const identity = new Set((legend.domains ?? []).filter(d => d !== 'colorless'));

  const owned = [...inventory.owned.values()];
  const pool = owned.filter(o => MAIN_TYPES.has(o.card.type) && inIdentity(o.card, identity));
  const weights = tagWeights(pool);

  const scored = pool
    .map(o => ({ ...o, score: scoreCard(o.card, legend, weights) }))
    .sort((a, b) => b.score - a.score || (a.card.energy ?? 0) - (b.card.energy ?? 0));

  // --- Hauptdeck: kurvenbewusst greedy, danach Restauffüllung ---
  const main = [];
  const used = new Map();
  const buckets = { ...CURVE };
  let total = 0;

  const take = (entry, respectCurve) => {
    const b = bucket(entry.card.energy);
    const room = respectCurve ? Math.max(0, buckets[b]) : Infinity;
    const n = Math.min(RULES.MAX_COPIES - (used.get(entry.card.name) ?? 0), entry.qty, RULES.MAIN - total, room);
    if (n <= 0) return;
    used.set(entry.card.name, (used.get(entry.card.name) ?? 0) + n);
    buckets[b] -= n;
    total += n;
    const hit = main.find(m => m.card.name === entry.card.name);
    if (hit) hit.count += n;
    else main.push({ card: entry.card, count: n, score: entry.score });
  };

  for (const e of scored) { if (total >= RULES.MAIN) break; take(e, true); }
  for (const e of scored) { if (total >= RULES.MAIN) break; take(e, false); }

  // --- Runen: nach tatsächlichem Domain-Bedarf des Hauptdecks verteilen ---
  const need = new Map([...identity].map(d => [d, 1]));
  for (const { card, count } of main) {
    for (const d of card.domains ?? []) if (identity.has(d)) need.set(d, (need.get(d) ?? 0) + count);
  }
  const needTotal = [...need.values()].reduce((a, b) => a + b, 0) || 1;
  const runePool = owned.filter(o => o.card.type === 'rune' && identity.has(o.card.domains?.[0]));

  const runes = [];
  let runeCount = 0;
  const wanted = [...need.entries()]
    .map(([d, n]) => ({ d, want: Math.round((n / needTotal) * RULES.RUNES) }))
    .sort((a, b) => b.want - a.want);

  for (const { d, want } of wanted) {
    const r = runePool.find(o => o.card.domains[0] === d);
    if (!r) continue;
    const n = Math.min(want, r.qty, RULES.RUNES - runeCount);
    if (n > 0) { runes.push({ card: r.card, count: n }); runeCount += n; }
  }
  for (const r of runePool) {                       // Rest auffüllen
    if (runeCount >= RULES.RUNES) break;
    const hit = runes.find(x => x.card.name === r.card.name);
    const n = Math.min(r.qty - (hit?.count ?? 0), RULES.RUNES - runeCount);
    if (n <= 0) continue;
    if (hit) hit.count += n; else runes.push({ card: r.card, count: n });
    runeCount += n;
  }

  // --- Schlachtfelder: 3 verschiedene Namen ---
  const battlefields = owned
    .filter(o => o.card.type === 'battlefield')
    .map(o => ({ card: o.card, count: 1, score: (RARITY_SCORE[o.card.rarity] ?? 1) + ((o.card.text?.length ?? 0) / 120) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, RULES.BATTLEFIELDS);

  const curve = {};
  for (const { card, count } of main) curve[bucket(card.energy)] = (curve[bucket(card.energy)] ?? 0) + count;

  const deckScore = main.reduce((s, m) => s + m.score * m.count, 0) / Math.max(total, 1);
  const complete = total === RULES.MAIN && runeCount === RULES.RUNES && battlefields.length === RULES.BATTLEFIELDS;

  return {
    legend, identity: [...identity], main, runes, battlefields, curve,
    counts: { main: total, runes: runeCount, battlefields: battlefields.length },
    missingSlots: {
      main: RULES.MAIN - total,
      runes: RULES.RUNES - runeCount,
      battlefields: RULES.BATTLEFIELDS - battlefields.length,
    },
    complete,
    score: Math.round(deckScore * 10) / 10,
    avgEnergy: Math.round((main.reduce((s, m) => s + (m.card.energy ?? 0) * m.count, 0) / Math.max(total, 1)) * 100) / 100,
    upgrades: findUpgrades(allCards, inventory, legend, identity, weights, main),
  };
}

/**
 * Welche Karten würden dieses Deck am stärksten verbessern?
 * Vergleicht den gesamten offiziellen Kartenpool der Identität mit dem,
 * was im Deck steckt – das ist die Wunschliste.
 */
function findUpgrades(allCards, inventory, legend, identity, weights, main) {
  const inDeck = new Map(main.map(m => [m.card.name, m.count]));
  const weakest = main.length ? Math.min(...main.map(m => m.score)) : 0;

  return canonical(allCards)
    .filter(c => MAIN_TYPES.has(c.type) && inIdentity(c, identity) && c.rarity !== 'showcase')
    .map(c => {
      const ownedQty = inventory.owned.get(c.name)?.qty ?? 0;
      const missing = RULES.MAX_COPIES - Math.max(ownedQty, inDeck.get(c.name) ?? 0);
      return { card: c, score: scoreCard(c, legend, weights), ownedQty, missing };
    })
    .filter(u => u.missing > 0 && u.score > weakest)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
}

/** "VEN-113a/166" ist ein Alt-Art-Druck von "VEN-113/166". */
const altArt = c => (/\d+[a-z]/.test(c.code ?? '') ? 1 : 0);

/**
 * Je Kartenname nur eine Ausgabe behalten – reguläre Ausgabe vor Alt-Art vor
 * Showcase. Riots Daten pflegen bei Alt-Arts teils abweichende Tags, deshalb
 * darf immer nur eine Fassung in die Bewertung.
 */
const printRank = c => (c.rarity === 'showcase' ? 0 : 4) + (altArt(c) ? 0 : 2) + (c.variant ? 0 : 1);
const canonCache = new WeakMap();
function canonical(allCards) {
  let hit = canonCache.get(allCards);
  if (hit) return hit;
  const best = new Map();
  for (const c of allCards) {
    const cur = best.get(c.name);
    if (!cur || printRank(c) > printRank(cur)) best.set(c.name, c);
  }
  hit = [...best.values()];
  canonCache.set(allCards, hit);
  return hit;
}

/** Baut Decks für alle besitzbaren Legenden und sortiert nach Stärke. */
export function suggestDecks(inventory, allCards) {
  return [...inventory.owned.values()]
    .filter(o => o.card.type === 'legend')
    .map(l => buildDeck(inventory, l, allCards))
    .sort((a, b) => (b.complete - a.complete) || b.score - a.score);
}

/**
 * Decklisten-Export im selben Textformat wie der Import.
 * Die Sammlernummer kommt aus publicCode, damit Runen als #R04 und nicht
 * als #004 herauskommen und der Export wieder einlesbar ist.
 */
export function deckToText(deck) {
  const num = c => {
    const m = /^[A-Z]+-([^/]+)/.exec(c.code ?? '');
    const tok = m ? m[1].replace(/\*/g, '') : String(c.num ?? '');
    return /^\d+$/.test(tok) ? tok.padStart(3, '0') : tok;
  };
  const line = (n, c) => `${n} ${c.name} (${c.set}) #${num(c)}`;
  const sec = (title, list) => list.length ? `\n// ${title}\n` + list.map(x => line(x.count, x.card)).join('\n') : '';
  return `// Legende\n${line(1, deck.legend)}`
    + sec('Hauptdeck', deck.main) + sec('Runen', deck.runes) + sec('Schlachtfelder', deck.battlefields) + '\n';
}
