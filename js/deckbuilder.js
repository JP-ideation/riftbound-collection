/**
 * Deckbau aus dem eigenen Bestand.
 *
 * Regeln (Riftbound Konstruktion):
 *   1 Legende, Hauptdeck exakt 40 Karten, Runendeck exakt 12,
 *   3 Schlachtfelder mit unterschiedlichen Namen, max. 3 Kopien je Kartenname.
 *   Karten müssen in der Domain-Identität der Legende liegen (+ farblos).
 *   Mindestens eine Champion-Einheit des Legenden-Champions (Chosen Champion).
 *   Signature-Karten nur vom eigenen Champion, höchstens 3 insgesamt.
 *   Keine gebannten Karten und Schlachtfelder (banlist.js).
 *
 * Bewertet wird nicht die Einzelkarte, sondern die Karte IN DIESEM DECK:
 * Was sie braucht (XP, Stammesfutter, Zauber …) muss das Deck liefern, sonst
 * sinkt ihr Wert – bei Pflichtkosten bis zur Unspielbarkeit. Was sie liefert,
 * wird wertvoller, je mehr Karten im Deck darauf angewiesen sind. Dazu kommt
 * der Motor der Legende und, falls vorhanden, die Häufigkeit in Meta-Decks.
 */
import { initMechanics, analyze, satisfaction, needFeatures, MANDATORY_MIN, featureLabel, effectiveEnergy } from './mechanics.js';
import { isBanned } from './banlist.js';

/** Identitaetsschluessel: Name + Beiname, siehe db.js. */
export const key = c => (c.fullName ?? c.name).toLowerCase();

export const RULES = { MAIN: 40, RUNES: 12, BATTLEFIELDS: 3, MAX_COPIES: 3, SIGNATURES: 3 };

// Seltenheit nur als schwaches Signal: Turnierdecks bestehen zu großen Teilen
// aus Commons (Defy, Charm, Punch First) – Seltenheit ist kein Stärkemaß.
const RARITY_SCORE = { common: 1, uncommon: 1.5, rare: 2.2, epic: 3, showcase: 2.2 };
const MAIN_TYPES = new Set(['unit', 'spell', 'gear']);

/** Ausgangskurve für 40 Karten – summiert exakt auf 40. Gewichtet 70 %. */
const CURVE = { 1: 4, 2: 8, 3: 9, 4: 8, 5: 6, 6: 5 };
const bucket = e => Math.min(6, Math.max(1, e ?? 3));
/** Kurven-Eimer nach realistischen Kosten (Rhasa zählt nicht als 10er). */
const slot = c => bucket(effectiveEnergy(c));

/** Rundungsdifferenz ausgleichen, damit die Eimer exakt auf 40 summieren. */
function balance(out, keys) {
  let diff = RULES.MAIN - keys.reduce((a, k) => a + out[k], 0);
  while (diff !== 0) {
    const k = keys.slice().sort((x, y) => out[y] - out[x])[0];
    out[k] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }
  return out;
}

/** Was die bestbewerteten 40 Karten von sich aus hergeben würden. */
function wishOf(scored, fn, init) {
  const wish = { ...init };
  let n = 0;
  for (const e of scored) {
    if (n >= RULES.MAIN) break;
    if (e.score <= UNPLAYABLE) continue;
    const take = Math.min(RULES.MAX_COPIES, e.qty, RULES.MAIN - n);
    const k = fn(e.card);
    if (wish[k] !== undefined) wish[k] += take;
    n += take;
  }
  return wish;
}

/**
 * Zielkurve: überwiegend Ausgangskurve, zu 30 % Wunschkurve des Pools – so
 * bleibt die Kurve gesund, unterscheidet sich aber je nach Pool.
 */
function targetCurve(scored, trustPool = false) {
  const wish = wishOf(scored, slot, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 });
  // Mit Turnierdaten stammt die Wunschkurve aus echten Profi-Listen – dann
  // gilt sie weitgehend, statt von der Ausgangskurve verwässert zu werden.
  const w = trustPool ? 0.8 : 0.3;
  const out = {};
  for (const b of [1, 2, 3, 4, 5, 6]) out[b] = Math.round(wish[b] * w + CURVE[b] * (1 - w));
  return balance(out, ['1', '2', '3', '4', '5', '6']);
}

/**
 * Zielverteilung der Kartentypen: halb das Verhältnis, in dem das Spiel die
 * Typen druckt (rund 63/26/11), halb das, was der Pool hergeben würde.
 * Ohne Gegengewicht entstünden Decks aus 38 Einheiten und einem Zauber.
 */
function targetTypes(scored, allCards, trustPool = false) {
  const printed = { unit: 0, spell: 0, gear: 0 };
  for (const c of canonical(allCards)) {
    if (c.rarity !== 'showcase' && printed[c.type] !== undefined) printed[c.type]++;
  }
  const printedTotal = printed.unit + printed.spell + printed.gear || 1;
  const wish = wishOf(scored, c => c.type, { unit: 0, spell: 0, gear: 0 });
  const wishTotal = wish.unit + wish.spell + wish.gear || 1;
  const out = {};
  const w = trustPool ? 0.8 : 0.5;
  for (const t of ['unit', 'spell', 'gear']) {
    out[t] = Math.round(((printed[t] / printedTotal) * (1 - w) + (wish[t] / wishTotal) * w) * RULES.MAIN);
  }
  return balance(out, ['unit', 'spell', 'gear']);
}

/** Textschlüsselwörter, die in fast jedem Deck Wert haben. */
const KEYWORDS = [
  [/\bdraw\b/i, 2.5], [/\bkill\b/i, 2], [/deals? \d/i, 2], [/\[Stun\]|\bstun\b/i, 1.5],
  [/\bready\b/i, 1], [/\bbuff\b/i, 1], [/costs? .*less/i, 1.5], [/\[Deflect/i, 1],
  [/\[Ganking\]/i, 1], [/\[Ambush\]|\[Hidden\]/i, 1],
  // Kartenauswahl ist fast so gut wie Nachziehen
  [/into your hand|draw (?:it|one)\b/i, 2],
  // Interaktion – das Rückgrat von Turnierdecks
  [/\[Reaction\]/, 1.5],                                  // zu jeder Zeit spielbar
  [/\bcounter a spell/i, 3],                               // Defy
  [/move an enemy unit|move [^.]*enemy unit/i, 2.5],        // Charm: Schlachtfeld freiräumen
  [/\+\d+ Might this turn|\[Assault \d\] this turn/i, 1.5], // Kampftrick
  [/reveal their hand|reveals their hand/i, 1.5],          // Handstörung
  [/can't be chosen by enemy/i, 1.5],
];

/**
 * Spielmarken (SFD-T03 Gold, UNL-T02 Bird …) entstehen im Spiel und gehören
 * nie ins Deck – auch wenn der Scanner sie mit in die Sammlung schreibt.
 */
export const isToken = c => /^[A-Z]+-T\d/.test(c.code ?? '');

function inIdentity(card, identity) {
  const d = card.domains ?? [];
  if (!d.length) return true;
  return d.every(x => x === 'colorless' || identity.has(x));
}

/**
 * Durchschnittliche Might je Energiekosten – Bezugsgröße für den Statwert.
 * Ohne sie bekämen Einheiten allein dafür Punkte, dass sie Might haben.
 */
const mightCache = new WeakMap();
function mightBaseline(allCards) {
  let hit = mightCache.get(allCards);
  if (hit) return hit;
  const sum = new Map(), n = new Map();
  for (const c of allCards) {
    if (c.type !== 'unit' || c.might == null || c.energy == null) continue;
    sum.set(c.energy, (sum.get(c.energy) ?? 0) + c.might);
    n.set(c.energy, (n.get(c.energy) ?? 0) + 1);
  }
  hit = new Map([...sum].map(([e, v]) => [e, v / n.get(e)]));
  mightCache.set(allCards, hit);
  return hit;
}

/** Grundwert einer Karte, unabhängig vom Deck. */
function baseScore(card, baseline) {
  let s = RARITY_SCORE[card.rarity] ?? 1;
  if (card.type === 'unit' && card.might != null && card.energy != null) {
    const avg = baseline?.get(effectiveEnergy(card));
    if (avg != null) s += Math.max(-3, Math.min(3, (card.might - avg) * 1.5));
  }
  for (const [re, w] of KEYWORDS) if (re.test(card.text ?? '')) s += w;
  // Teure Karten sind schwerer auf den Tisch zu bringen und oft tot auf der
  // Hand – ohne diesen Abzug gewinnen 8–12er allein über ihre Might.
  const eff = effectiveEnergy(card) ?? 0;
  if (eff > 5) s -= (eff - 5) * 0.9;
  // Effizienz: Günstige Karten halten das Tempo und passen in jeden Zug.
  // Profi-Listen spielen 12–18 Karten für 1–2 Energie.
  if (card.energy != null && eff <= 2) s += eff <= 1 ? 2 : 1.5;
  const real = (card.domains ?? []).filter(d => d !== 'colorless');
  if (real.length === 1) s += 1;                 // einfarbig = leichter zu bezahlen
  return s;
}

/* ------------------------------------------------------ Champion & Signature */

const champCache = new WeakMap();
function championNames(allCards) {
  let hit = champCache.get(allCards);
  if (hit) return hit;
  hit = new Set();
  for (const c of allCards) if (c.type === 'unit' && c.subtitle) hit.add(c.name);
  champCache.set(allCards, hit);
  return hit;
}

/**
 * Zu welchem Champion gehört eine Legende?
 * Legenden heißen nur nach ihrem Beinamen ("Heart of the Tempest"), tragen den
 * Championnamen aber als Tag.
 */
export function championOf(legend, allCards) {
  const names = championNames(allCards);
  return (legend.tags ?? []).find(t => names.has(t)) ?? null;
}

/** Champion-Einheit ("Kennen, Keeper of Balance") – kein Signature. */
const isChampionUnit = (c, names) => c.type === 'unit' && !!c.subtitle && names.has(c.name);

/**
 * Signature-Karte: trägt einen Championnamen als Tag, ist aber selbst keine
 * Champion-Einheit (Lightning Rush → Kennen, Shadow → Vex).
 */
function signatureOf(c, names) {
  if (isChampionUnit(c, names)) return null;
  return (c.tags ?? []).find(t => names.has(t)) ?? null;
}

/** "Kennen – Heart of the Tempest", oder nur der Beiname wenn kein Champion bekannt. */
export const deckTitle = deck => (deck.champion ? `${deck.champion} – ${deck.legend.name}` : deck.legend.name);

/* --------------------------------------------------------------- Kontext */

const UNPLAYABLE = -1000;

/**
 * Was liefert ein Deck, und was verlangt es? Grundlage für die Bewertung
 * jeder Karte im Deckzusammenhang.
 */
function contextOf(entries, legend) {
  const provides = new Map();
  const demand = new Map();
  let xpSpenders = 0;
  const lp = analyze(legend);
  for (const [f, w] of lp.provides) provides.set(f, (provides.get(f) ?? 0) + w);
  for (const { card, count } of entries) {
    const a = analyze(card);
    for (const [f, w] of a.provides) provides.set(f, (provides.get(f) ?? 0) + w * count);
    for (const n of a.needs) {
      for (const f of needFeatures(n)) demand.set(f, (demand.get(f) ?? 0) + n.weight * count);
      if (n.consumes) xpSpenders += count;
    }
  }
  return { provides, demand, xpSpenders };
}

/** Pool-Kontext, auf 40 Karten skaliert – Startpunkt vor dem ersten Deck. */
function poolContext(pool, legend) {
  const entries = pool.map(o => ({ card: o.card, count: Math.min(o.qty, RULES.MAX_COPIES) }));
  const total = entries.reduce((s, e) => s + e.count, 0) || 1;
  const f = Math.min(1, RULES.MAIN / total);
  return contextOf(entries.map(e => ({ card: e.card, count: e.count * f })), legend);
}

/** Wie viel von Merkmal f liefert das Deck OHNE diese Karte? */
function othersProvide(ctx, card, count, f) {
  const own = (analyze(card).provides.get(f) ?? 0) * count;
  return Math.max(0, (ctx.provides.get(f) ?? 0) - own);
}

/**
 * Bewertung einer Karte im Deckzusammenhang.
 * Liefert score und die Begründung (für die Spielhilfe).
 */
function contextScore(card, env, ctx, count = 1) {
  const a = analyze(card);
  const why = [];
  let s = env.base.get(key(card)) ?? baseScore(card, env.baseline);

  // 1) Motor der Legende: Karte liefert, was die Legende will. Abnehmender
  // Ertrag – ist der Motor schon mit anderen Karten gesättigt, zählt die
  // nächste Motor-Karte weniger als eine, die das Deck sonst besser macht.
  for (const n of env.legendNeeds) {
    const hits = needFeatures(n).map(f => a.provides.get(f) ?? 0).reduce((x, y) => x + y, 0);
    if (hits > 0) {
      const others = needFeatures(n).reduce((x, f) => x + othersProvide(ctx, card, count, f), 0);
      const fill = satisfaction(n, others);
      s += Math.min(1.2, hits) * n.weight * 0.8 * (1 - 0.6 * fill);
      const detail = needFeatures(n).includes('offhand') && a.how.length ? ` (${a.how.join(', ')})` : '';
      why.push({ ok: true, engine: true, text: `Treibt die Legende an: ${n.text}${detail}` });
    }
  }

  // 2) Chosen Champion und eigene Signature-Karten
  if (env.champion && card.type === 'unit' && card.name === env.champion && card.subtitle) {
    s += 6; why.push({ ok: true, text: `Champion-Einheit von ${env.champion}` });
  }
  if (env.champion && signatureOf(card, env.names) === env.champion) {
    s += 5; why.push({ ok: true, text: `Signature-Karte von ${env.champion}` });
  }

  // 3) Meta: wie oft steckt die Karte in echten Decks dieser Legende?
  const meta = env.meta.get(key(card));
  if (meta) {
    s += 16 * meta.freq;
    why.push({ ok: true, text: `In ${meta.hits} von ${meta.of} Meta-Decks dieser Legende` });
  }

  // 4) Eigene Bedarfe: Was die Karte braucht, muss das Deck liefern.
  for (const n of a.needs) {
    let have = needFeatures(n).reduce((x, f) => x + othersProvide(ctx, card, count, f), 0);
    // Liefert die Karte das Merkmal selbst (Kennen stunnt selbst), trägt sie
    // eine Kopie zur eigenen Bedingung bei – Pflichtkosten ausgenommen.
    if (!n.mandatory) have += Math.min(1, needFeatures(n).reduce((x, f) => x + (a.provides.get(f) ?? 0), 0));
    // XP wird beim Ausgeben verbraucht: Viele Verbraucher teilen sich
    // dieselben Quellen. Ab vier Verbrauchern schrumpft der Anteil je Karte.
    let detail = `im Deck ${fmt(have)} ${needFeatures(n).map(featureLabel).join(' / ')}`;
    if (n.f === 'xp') {
      const spenders = Math.round(ctx.xpSpenders ?? 0);
      const others = Math.max(0, spenders - (n.consumes ? count : 0));
      if (spenders > 1) detail += `, die sich ${spenders} XP-Verbraucher teilen`;
      have /= Math.max(1, (others + (n.consumes ? 1 : 0)) / 3);
    }
    const sat = satisfaction(n, have);
    if (n.mandatory && sat < MANDATORY_MIN) {
      return { score: UNPLAYABLE, why: [{ ok: false, sat, text: `Nicht spielbar: ${n.text} – ${detail}` }] };
    }
    s -= n.weight * (1 - sat) * (n.mandatory ? 1.5 : 1) + (n.cost ?? 0);
    why.push({ ok: sat >= 0.6, need: true, sat, text: `${cap(n.text)} – ${detail}` });
  }

  // 5) Enabler: Was die Karte liefert, zählt so viel, wie andere es brauchen.
  for (const [f, w] of a.provides) {
    const dem = Math.max(0, (ctx.demand.get(f) ?? 0) - ownDemand(a, f, count));
    if (dem > 0) s += Math.min(6, dem * 0.12) * Math.min(1.5, w);
  }

  return { score: s, why };
}

const ownDemand = (a, f, count) => a.needs.filter(n => needFeatures(n).includes(f)).reduce((x, n) => x + n.weight * count, 0);
const fmt = x => (Math.round(x * 10) / 10).toString().replace('.', ',');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Meta-Gewicht je Karte für eine Legende.
 * metaDecks: [{ legendKey, champion, cards: Map<key, Kopien> }]
 * Gezählt werden nur Decks derselben Legende.
 * freq berücksichtigt die Kopienzahl: ein 3er-Kernstück wiegt voll, eine
 * einzelne Tech-Karte ein Drittel.
 */
function metaIndex(metaDecks, legend) {
  // Nur Listen derselben Legende: Zwei Legenden desselben Champions haben
  // verschiedene Motoren (Wuju Bladesman ≠ Wuju Master).
  const pool = metaDecks.filter(d => d.legendKey === key(legend));
  const out = new Map();
  if (!pool.length) return out;
  const hits = new Map(), copies = new Map();
  for (const d of pool) {
    for (const [k, n] of d.cards) {
      hits.set(k, (hits.get(k) ?? 0) + 1);
      copies.set(k, (copies.get(k) ?? 0) + Math.min(n, RULES.MAX_COPIES));
    }
  }
  for (const [k, h] of hits) {
    out.set(k, { hits: h, of: pool.length, freq: Math.min(1, (0.4 + 0.6 * copies.get(k) / (RULES.MAX_COPIES * pool.length))) * h / pool.length });
  }
  return out;
}

/* ---------------------------------------------------------------- Deckbau */

/** Baut ein Deck für genau eine Legende. */
export function buildDeck(inventory, legendEntry, allCards, metaDecks = []) {
  initOnce(allCards);
  const legend = legendEntry.card;
  const identity = new Set((legend.domains ?? []).filter(d => d !== 'colorless'));
  const names = championNames(allCards);
  const champion = championOf(legend, allCards);

  const owned = [...inventory.owned.values()];
  // Fremde Signature-Karten sind in diesem Deck schlicht nicht erlaubt.
  const legal = c => MAIN_TYPES.has(c.type) && !isToken(c) && !isBanned(c) && inIdentity(c, identity)
    && (() => { const sig = signatureOf(c, names); return !sig || sig === champion; })();
  const pool = owned.filter(o => legal(o.card));

  const baseline = mightBaseline(allCards);
  const env = {
    baseline, names, champion,
    base: new Map(pool.map(o => [key(o.card), baseScore(o.card, baseline)])),
    legendNeeds: analyze(legend).needs,
    meta: metaIndex(metaDecks, legend),
  };

  // Iterativ: bewerten → Deck bauen → mit dem neuen Deck neu bewerten.
  // Enabler und Verbraucher ziehen sich so gegenseitig ins Deck oder fliegen
  // gemeinsam raus. Das beste der Durchläufe gewinnt.
  let ctx = poolContext(pool, legend);
  let best = null, lastSig = '';
  for (let iter = 0; iter < 8; iter++) {
    const scored = pool
      .map(o => ({ ...o, score: contextScore(o.card, env, ctx, Math.min(o.qty, 2)).score }))
      .sort((a, b) => b.score - a.score || (a.card.energy ?? 0) - (b.card.energy ?? 0));
    const main = assemble(scored, allCards, names, champion, env.meta.size > 0);
    const deckCtx = contextOf(main, legend);
    const value = evaluate(main, env, deckCtx);
    if (!best || value > best.value) best = { main, value, ctx: deckCtx };
    const sig = main.map(m => key(m.card) + m.count).sort().join();
    if (sig === lastSig) break;
    lastSig = sig;
    // Gedämpft: halb altes, halb neues Deck, damit nichts hin- und herspringt.
    ctx = blend(ctx, deckCtx);
  }

  const { main, ctx: finalCtx } = best;
  for (const m of main) {
    const r = contextScore(m.card, env, finalCtx, m.count);
    m.score = Math.round(r.score * 10) / 10;
    m.why = r.why;
  }
  main.sort((a, b) => b.score - a.score);
  const total = main.reduce((s, m) => s + m.count, 0);

  const runes = buildRunes(owned, identity, main);
  const runeCount = runes.reduce((s, r) => s + r.count, 0);

  // --- Schlachtfelder: 3 verschiedene Namen ---
  const battlefields = pickBattlefields(owned, finalCtx);

  const curve = {};
  for (const { card, count } of main) curve[bucket(card.energy)] = (curve[bucket(card.energy)] ?? 0) + count;

  const hasChampion = !champion || main.some(m => m.card.type === 'unit' && m.card.name === champion && m.card.subtitle);
  const complete = total === RULES.MAIN && runeCount === RULES.RUNES
    && battlefields.length === RULES.BATTLEFIELDS && hasChampion;

  return {
    legend, champion, hasChampion,
    identity: [...identity], main, runes, battlefields, curve,
    counts: { main: total, runes: runeCount, battlefields: battlefields.length },
    missingSlots: {
      main: RULES.MAIN - total,
      runes: RULES.RUNES - runeCount,
      battlefields: RULES.BATTLEFIELDS - battlefields.length,
    },
    complete,
    score: Math.round(best.value * 10) / 10,
    avgEnergy: Math.round((main.reduce((s, m) => s + (m.card.energy ?? 0) * m.count, 0) / Math.max(total, 1)) * 100) / 100,
    engine: engineReport(legend, finalCtx),
    metaDecks: metaIndexSize(env.meta),
    upgrades: findUpgrades(allCards, inventory, env, identity, legal, main, finalCtx),
  };
}

const metaIndexSize = m => (m.size ? [...m.values()][0].of : 0);

function blend(a, b) {
  const mix = (x, y) => {
    const out = new Map();
    for (const k of new Set([...x.keys(), ...y.keys()])) out.set(k, ((x.get(k) ?? 0) + (y.get(k) ?? 0)) / 2);
    return out;
  };
  return { provides: mix(a.provides, b.provides), demand: mix(a.demand, b.demand),
    xpSpenders: ((a.xpSpenders ?? 0) + (b.xpSpenders ?? 0)) / 2 };
}

/** Durchschnittlicher Kontextwert eines fertigen Decks. */
function evaluate(main, env, ctx) {
  let s = 0, n = 0;
  for (const m of main) {
    const r = contextScore(m.card, env, ctx, m.count);
    s += Math.max(r.score, -20) * m.count;
    n += m.count;
  }
  // Fehlende Karten wiegen schwer – ein unvollständiges Deck ist kein Deck.
  return (s - (RULES.MAIN - n) * 5) / RULES.MAIN;
}

/**
 * Hauptdeck füllen: Champion zuerst, dann kurvenbewusst nach Score, danach
 * Restauffüllung. Unspielbare Karten kommen nie hinein.
 */
function assemble(scored, allCards, names, champion, trustPool = false) {
  const main = [];
  const used = new Map();
  const buckets = targetCurve(scored, trustPool);
  const typeSlots = targetTypes(scored, allCards, trustPool);
  let total = 0, signatures = 0;

  const take = (entry, respectQuota, limit = RULES.MAX_COPIES) => {
    if (entry.score <= UNPLAYABLE) return;
    const b = slot(entry.card);
    const t = entry.card.type;
    const sig = signatureOf(entry.card, names);
    const room = respectQuota
      ? Math.min(Math.max(0, buckets[b]), Math.max(0, typeSlots[t] ?? 0))
      : Infinity;
    const k = key(entry.card);
    let n = Math.min(limit - (used.get(k) ?? 0), entry.qty - (used.get(k) ?? 0), RULES.MAIN - total, room);
    if (sig) n = Math.min(n, RULES.SIGNATURES - signatures);
    if (n <= 0) return;
    used.set(k, (used.get(k) ?? 0) + n);
    buckets[b] -= n;
    if (typeSlots[t] !== undefined) typeSlots[t] -= n;
    total += n;
    if (sig) signatures += n;
    const hit = main.find(m => key(m.card) === k);
    if (hit) hit.count += n;
    else main.push({ card: entry.card, count: n, score: entry.score });
  };

  // Chosen Champion: mindestens eine Kopie ist Pflicht.
  if (champion) {
    const champ = scored.find(e => e.card.type === 'unit' && e.card.name === champion && e.card.subtitle);
    if (champ) take({ ...champ, score: Math.max(champ.score, 0) }, false, 1);
  }
  for (const e of scored) { if (total >= RULES.MAIN) break; take(e, true); }
  for (const e of scored) { if (total >= RULES.MAIN) break; take(e, false); }
  return main;
}

/**
 * Schlachtfelder: legal (nicht gebannt, keine Spielmarke), 3 verschiedene
 * Namen, und passend zum Deck – ein Schlachtfeld, das Zauber belohnt, gehört
 * in ein Zauberdeck, nicht in eines mit sechs Zaubern.
 */
function pickBattlefields(owned, ctx) {
  const seen = new Set();
  return owned
    .filter(o => o.card.type === 'battlefield' && !isToken(o.card) && !isBanned(o.card))
    .map(o => {
      const a = analyze(o.card);
      let score = (RARITY_SCORE[o.card.rarity] ?? 1) * 0.5;
      for (const [re, w] of KEYWORDS) if (re.test(o.card.text ?? '')) score += w * 0.5;
      for (const n of a.needs) {
        const have = needFeatures(n).reduce((x, f) => x + (ctx.provides.get(f) ?? 0), 0);
        const sat = satisfaction(n, have);
        score += n.weight * (sat - 0.5);
      }
      for (const [f, w] of a.provides) score += Math.min(3, (ctx.demand.get(f) ?? 0) * 0.08) * Math.min(1, w);
      return { card: o.card, count: 1, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter(b => !seen.has(key(b.card)) && seen.add(key(b.card)))
    .slice(0, RULES.BATTLEFIELDS);
}

/** Runen im Verhältnis des tatsächlichen Domain-Bedarfs des Hauptdecks. */
function buildRunes(owned, identity, main) {
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
    const hit = runes.find(x => key(x.card) === key(r.card));
    const n = Math.min(r.qty - (hit?.count ?? 0), RULES.RUNES - runeCount);
    if (n <= 0) continue;
    if (hit) hit.count += n; else runes.push({ card: r.card, count: n });
    runeCount += n;
  }
  return runes;
}

/** Wie gut bedient das Deck den Motor der Legende? */
function engineReport(legend, ctx) {
  return analyze(legend).needs.map(n => {
    const have = needFeatures(n).reduce((x, f) => x + (ctx.provides.get(f) ?? 0), 0);
    return { text: n.text, have: Math.round(have * 10) / 10, label: needFeatures(n).map(featureLabel).join(' / '), sat: satisfaction(n, have) };
  });
}

/**
 * Welche Karten würden dieses Deck am stärksten verbessern?
 * Bewertet den gesamten offiziellen Kartenpool der Identität im Kontext des
 * fertigen Decks – das ist die Wunschliste.
 */
function findUpgrades(allCards, inventory, env, identity, legal, main, ctx) {
  const inDeck = new Map(main.map(m => [key(m.card), m.count]));
  const weakest = main.length ? Math.min(...main.map(m => m.score)) : 0;

  return canonical(allCards)
    .filter(c => legal(c) && c.rarity !== 'showcase')
    .map(c => {
      const ownedQty = inventory.owned.get(key(c))?.qty ?? 0;
      const missing = RULES.MAX_COPIES - Math.max(ownedQty, inDeck.get(key(c)) ?? 0);
      const r = contextScore(c, env, ctx, 2);
      return { card: c, score: r.score, ownedQty, missing };
    })
    .filter(u => u.missing > 0 && u.score > weakest && u.score > UNPLAYABLE)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
}

/**
 * Deck-Check für eine beliebige Liste (z. B. ein eingefügtes eigenes Deck):
 * welche Karten funktionieren in dieser Zusammenstellung nicht?
 */
export function checkDeck(legend, main, allCards) {
  initOnce(allCards);
  const names = championNames(allCards);
  const champion = legend ? championOf(legend, allCards) : null;
  const env = {
    baseline: mightBaseline(allCards), names, champion, base: new Map(),
    legendNeeds: legend ? analyze(legend).needs : [], meta: new Map(),
  };
  const ctx = legend ? contextOf(main, legend) : contextOf(main, { text: '' });
  const problems = [];
  for (const m of main) {
    const sig = signatureOf(m.card, names);
    if (sig && champion && sig !== champion) problems.push({ card: m.card, count: m.count, text: `Signature-Karte von ${sig} – in einem ${champion}-Deck nicht erlaubt` });
    if (isToken(m.card)) { problems.push({ card: m.card, count: m.count, text: 'Spielmarke – entsteht im Spiel und gehört nicht ins Deck' }); continue; }
    if (isBanned(m.card)) { problems.push({ card: m.card, count: m.count, text: 'Gebannt – im Turnier (Standard) nicht erlaubt' }); continue; }
    const r = contextScore(m.card, env, ctx, m.count);
    for (const w of r.why) if (w.ok === false && (w.sat ?? 0) < 0.5) problems.push({ card: m.card, count: m.count, text: w.text });
  }
  return { problems, engine: legend ? engineReport(legend, ctx) : [] };
}

let initFor = null;
function initOnce(allCards) {
  if (initFor === allCards) return;
  initMechanics(allCards);
  initFor = allCards;
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
    const cur = best.get(key(c));
    const nimm = !cur || printRank(c) > printRank(cur)
      || (printRank(c) === printRank(cur) && (c.text?.length ?? 0) > (cur.text?.length ?? 0));
    if (nimm) best.set(key(c), c);
  }
  hit = [...best.values()];
  canonCache.set(allCards, hit);
  return hit;
}

/** Baut Decks für alle besitzbaren Legenden und sortiert nach Stärke. */
export function suggestDecks(inventory, allCards, metaDecks = []) {
  return [...inventory.owned.values()]
    .filter(o => o.card.type === 'legend')
    .map(l => buildDeck(inventory, l, allCards, metaDecks))
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
  const line = (n, c) => `${n} ${c.fullName ?? c.name} (${c.set}) #${num(c)}`;
  const sec = (title, list) => list.length ? `\n// ${title}\n` + list.map(x => line(x.count, x.card)).join('\n') : '';
  return `// ${deckTitle(deck)}\n// Legende\n${line(1, deck.legend)}`
    + sec('Hauptdeck', deck.main) + sec('Runen', deck.runes) + sec('Schlachtfelder', deck.battlefields) + '\n';
}
