/**
 * Kartenmechanik aus dem Kartentext.
 *
 * Jede Karte bekommt zwei Listen:
 *   provides – was sie ins Deck einbringt (XP-Quelle, spielt Karten nicht aus
 *              der Hand, Stun, Buff, Einheit mit Tag X, Token …)
 *   needs    – was sie braucht, damit ihr Text überhaupt etwas tut
 *              (XP zum Ausgeben, ein Hund zum Opfern, Zauber im Deck …)
 *
 * Der Deckbau prüft damit, ob eine Karte in diesem konkreten Deck funktioniert.
 * Ohne diese Prüfung landen Karten im Deck, deren Kosten sich nie bezahlen
 * lassen – Stalking Wolf ohne einen einzigen Bird/Cat/Dog/Poro, fünf
 * XP-Verbraucher bei zwei XP-Quellen.
 *
 * Grundlage ist ausschließlich der offizielle Kartentext. Erinnerungstexte in
 * Klammern werden vor der Bedarfsanalyse entfernt – sonst gilt jede Karte mit
 * [Stun] als Karte, die "stunned" Einheiten braucht.
 */

/** Deutsche Bezeichnungen für die Spielhilfe. */
export const FEATURE_LABEL = {
  xp: 'XP-Quellen',
  offhand: 'Karten, die nicht aus der Hand gespielt werden (Hidden, Flow, aus dem Ablagestapel, vom Deck, Token)',
  lookTop: 'Karten, die oben ins Deck schauen',
  spell: 'Zauber',
  stun: 'Stun-Karten',
  buff: 'Buff-Karten',
  mighty: 'Mighty-Einheiten (5+ Might)',
  equipment: 'Ausrüstung (Equipment)',
  gear: 'Gear',
  token: 'Token-Erzeuger',
  banish: 'Banish-Effekte',
  empower: 'Empower-Effekte',
  temporary: 'Temporary-Einheiten',
  trash: 'Karten, die den Ablagestapel füllen',
  hidden: 'Hidden-Karten',
  unit: 'eigene Einheiten',
};

export const featureLabel = f => (f.startsWith('tag:') ? `${f.slice(4)}-Einheiten` : FEATURE_LABEL[f] ?? f);

/** Erinnerungstexte "(…)" entfernen – sie beschreiben, sie fordern nichts. */
const strip = t => String(t ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ');

/**
 * Tags, die als Stamm taugen. Regionen ("Ionia", "Noxus") stehen zwar auch
 * als Tag auf Karten, werden aber so gut wie nie als Bedingung abgefragt –
 * sie würden bei Wörtern wie "Demacia" im Kartentext falsche Bedarfe erzeugen.
 */
const REGIONS = new Set(['Ionia', 'Noxus', 'Bilgewater', 'Demacia', 'Shurima', 'Bandle City', 'Shadow Isles',
  'Mount Targon', 'Freljord', 'Piltover', 'Zaun', 'The Void', 'Ixtal', 'Icathia']);

const cache = new WeakMap();
let TRIBES = null;

/** Einmal je Datenbestand: welche Stammes-Tags gibt es überhaupt? */
export function initMechanics(allCards) {
  const n = new Map();
  const champions = new Set();
  for (const c of allCards) {
    if (c.type !== 'unit') continue;
    if (c.subtitle) champions.add(c.name);
    for (const t of c.tags ?? []) n.set(t, (n.get(t) ?? 0) + 1);
  }
  // Championnamen ("Teemo", "Vex") sind kein Stamm, sondern Identität.
  TRIBES = [...n].filter(([t, k]) => k >= 3 && !REGIONS.has(t) && !champions.has(t)).map(([t]) => t)
    .sort((a, b) => b.length - a.length);           // "Sand Soldier" vor "Soldier"
}

const add = (m, f, w = 1) => m.set(f, (m.get(f) ?? 0) + w);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

/**
 * Analyse einer Karte. Ergebnis wird je Kartenobjekt zwischengespeichert.
 *
 * need = { f, amount, mandatory, weight, text }
 *   f         – benötigtes Merkmal (xp, tag:Dog, spell …)
 *   amount    – bei XP: wie viel auf einmal gebraucht wird
 *   mandatory – true: ohne das Merkmal ist die Karte NICHT spielbar
 *   weight    – wie viel vom Kartenwert an der Bedingung hängt
 *   text      – kurze Erklärung für die Spielhilfe
 */
export function analyze(card) {
  let hit = cache.get(card);
  if (hit) return hit;

  const raw = String(card.text ?? '');
  const t = strip(raw);
  const provides = new Map();
  const needs = [];
  const how = new Set();          // wie die Karte Karten nicht aus der Hand spielt
  const need = (f, weight, opts = {}) => needs.push({ f, weight, amount: 0, mandatory: false, ...opts });

  // ------------------------------------------------------------ liefert
  if (card.type === 'spell') add(provides, 'spell');
  if (card.type === 'gear') add(provides, 'gear');
  if (card.type === 'unit') add(provides, 'unit');
  if ((card.tags ?? []).includes('Equipment')) add(provides, 'equipment');
  if (card.type === 'unit' && (card.might ?? 0) >= 5) add(provides, 'mighty');
  if (card.type === 'unit') for (const tag of card.tags ?? []) if (TRIBES?.includes(tag)) add(provides, `tag:${tag}`);

  // XP: [Hunt N] erzeugt wiederholt XP, "gain N XP" einmalig
  const hunt = /\[Hunt(?: (\d+))?\]/i.exec(raw);
  if (hunt) add(provides, 'xp', 1 + 0.5 * ((+hunt[1] || 1) - 1));
  const gain = /gain (\d+) XP/i.exec(t);
  if (gain) add(provides, 'xp', Math.min(2, 0.6 + 0.4 * +gain[1]));
  else if (/gain \d+ XP for each|gain 1 XP/i.test(t) && !hunt) add(provides, 'xp', 0.8);

  // Nicht aus der Hand gespielt: Hidden (verdeckt), Flow (aus dem Trash),
  // aus Trash/Deck spielen, Token. Genau das lädt z. B. Kennens Legende auf.
  const hidden = /\[Hidden\]/.test(raw);
  if (hidden) { add(provides, 'offhand', 1); add(provides, 'hidden'); how.add('Hidden'); }
  if (/\[Flow\]/.test(raw)) { add(provides, 'offhand', 1); how.add('Flow'); }
  if (/play (?:a|an|up to \w+)? ?(?:unit|spell|card)[^.]*? from (?:your|a|any) trash/i.test(t)
    || /play (?:me|it|this) from (?:your|a) trash/i.test(t)
    || /(?:banish|reveal)[^.]*?\. (?:you may )?(?:banish \w+, then )?play (?:it|one|them)/i.test(t)
    || /then play it|play it, ignoring|you may play one\b|you may banish one, then play it/i.test(t)
    || /see me, you may play me/i.test(t)
    || /unit in your trash[^.]*\. play it/i.test(t)
    || /when you discard me, you may pay [^.]*? to play me/i.test(t)) {
    add(provides, 'offhand', 1);
    how.add(/trash/i.test(t) ? 'aus dem Ablagestapel' : 'vom Deck');
  }
  const token = /play (a|an|one|two|three|four|five)? ?(?:ready )?(?:\{?\d+\}? Might )?([A-Z][\w' ]*?) (?:unit|gear) tokens?/i.exec(t);
  if (token && !/choose an opponent\. they play/i.test(t)) {
    add(provides, 'token', 1);
    add(provides, 'offhand', 0.8);
    how.add('Token');
    const tokTag = TRIBES?.find(x => new RegExp(`\\b${esc(x)}\\b`, 'i').test(token[2]));
    if (tokTag) add(provides, `tag:${tokTag}`, Math.min(2, NUM[(token[1] ?? 'a').toLowerCase()] ?? 1));
    if (/Temporary/.test(t)) add(provides, 'temporary');
    if (/gear token/i.test(t)) add(provides, 'gear', 0.5);
  }

  // Blick aufs Hauptdeck – nicht aufs Runendeck (Twisted Fate)
  if (/look at (?:the )?top(?! rune)|reveal (?:the )?top (?:\d+ )?cards?|reveal cards from the top|\[Vision\]|\[Predict|\[Burn/i.test(raw)) add(provides, 'lookTop');
  if (/\[Stun\]|\bstun (?:a|an|it|up|all|each|target)/i.test(t)) add(provides, 'stun');
  if (/\[Buff\]|\bbuff (?:a|an|me|it|up|all|another|each|two)/i.test(t)) add(provides, 'buff');
  if (/\[Empower\]|\bempower (?:a|an|another|something|it|up)/i.test(t)) add(provides, 'empower');
  if (/\bbanish\b/i.test(t) && !/when you banish/i.test(t)) add(provides, 'banish');
  if (/\bdiscard \d|\[Burn|put [^.]*? into your trash/i.test(t) || card.type === 'spell') add(provides, 'trash', card.type === 'spell' ? 0.5 : 1);

  // ------------------------------------------------------------ braucht
  // XP ausgeben: als optionale Zusatzkosten, als Fähigkeit oder als Level.
  const onlyText = t.replace(/\[[^\]]*\]/g, '').trim();
  for (const m of t.matchAll(/(?:spend|pay) (\d+) XP/gi)) {
    const optionalCost = /you may (?:spend|pay) \d+ XP as an additional cost/i.test(t);
    const mandatoryCost = /as an additional cost to play (?:me|this), (?:spend|pay) \d+ XP/i.test(t);
    need('xp', optionalCost ? 5 : 3.5, { amount: +m[1], mandatory: mandatoryCost, consumes: true,
      text: `braucht ${m[1]} XP` });
  }
  for (const m of raw.matchAll(/\[Level (\d+)\]/gi)) {
    // Ist das Level der einzige Text, hängt die ganze Karte daran.
    const lone = onlyText.replace(/I (?:have|enter|cost)[^.]*\./g, '').length < 20;
    need('xp', lone ? 5 : 3, { amount: +m[1], text: `wirkt erst ab Level ${m[1]}` });
  }

  // Pflicht-Zusatzkosten: "As an additional cost to play me, kill a …"
  const sac = /as an additional cost to play (?:me|this), kill an? ([^.]*?) you control/i.exec(t)
           ?? /as an additional cost to play (?:me|this), kill an? (friendly [^.]*?)(?:\.|$)/i.exec(t);
  if (sac) {
    const what = sac[1];
    const tribes = TRIBES?.filter(x => new RegExp(`\\b${esc(x)}s?\\b`).test(what)) ?? [];
    // cost: Jedes Ausspielen kostet eine eigene Karte – das ist ein fester
    // Nachteil, auch wenn genug Futter im Deck liegt.
    if (tribes.length) {
      need(tribes.map(x => `tag:${x}`), 8, { mandatory: true, cost: 2, text: `muss beim Ausspielen eine eigene ${tribes.join('/')}-Einheit töten` });
    } else if (/Mighty/.test(what)) {
      need('mighty', 8, { mandatory: true, cost: 2, text: 'muss beim Ausspielen eine eigene Mighty-Einheit töten' });
    } else {
      need('unit', 2, { mandatory: true, cost: 3, text: 'muss beim Ausspielen eine eigene Einheit töten' });
    }
  }
  if (/as an additional cost to play (?:me|this), return a friendly gear/i.test(t)) {
    need('gear', 8, { mandatory: true, text: 'muss beim Ausspielen eigenes Gear zurücknehmen' });
  }

  // Stammes-Belohnungen: "if you control a Poro", "Your Mechs", "other Yordles".
  // Nur echte Bezüge – der eigene Kartenname und Token, die die Karte selbst
  // erzeugt, zählen nicht.
  const tt = t
    .replace(new RegExp(`\\b${esc(card.name ?? '§')}\\b`, 'g'), ' ')
    .replace(/play[^.]*?tokens?[^.]*\./gi, ' ')
    .replace(/as an additional cost to play (?:me|this)[^.]*\./gi, ' ');
  for (const tribe of TRIBES ?? []) {
    if (tribe === card.name) continue;
    const re = new RegExp(`\\b(?:your|other|friendly|control an?|each|for each|another)\\s+(?:\\w+\\s+)?${esc(tribe)}s?\\b`, 'i');
    if (re.test(tt)) need(`tag:${tribe}`, 3.5, { text: `belohnt ${tribe}-Einheiten` });
  }

  if (card.type !== 'legend' && /from anywhere other than (?:your|a player's) hand/i.test(t)) need('offhand', 3, { text: 'belohnt Karten, die nicht aus der Hand kommen' });
  if (/when you look at cards from the top/i.test(t)) need('lookTop', 4, { text: 'will gesehen werden, wenn du oben ins Deck schaust' });
  if (/when you play a spell|if you've played a spell|friendly spells|next spell you play|when you kill a unit with a spell/i.test(t)) {
    need('spell', card.type === 'legend' ? 6 : 3, { text: 'belohnt das Spielen von Zaubern' });
  }
  if (/\bstunned\b|when you stun/i.test(t)) need('stun', 3.5, { text: 'belohnt betäubte (stunned) Gegner' });
  if (/\bbuffed\b|spend (?:a|its|any number of) buffs?/i.test(t)) need('buff', 3, { text: 'belohnt gebuffte Einheiten' });
  if (/\[Mighty\]|Mighty unit|becomes \[?Mighty/i.test(t) && !sac) need('mighty', 3, { text: 'belohnt Mighty-Einheiten' });
  if ((/\[Weaponmaster\]|\bEquipment\b/i.test(t)) && !(card.tags ?? []).includes('Equipment')) {
    need('equipment', /\[Weaponmaster\]/i.test(t) && onlyText.length < 20 ? 4 : 3, { text: 'braucht Ausrüstung (Equipment)' });
  }
  if (/when you banish/i.test(t)) need('banish', 5, { text: 'belohnt Banish-Effekte' });
  if (/when you empower something else/i.test(t)) need('empower', 5, { text: 'belohnt Empower-Effekte' });
  if (/unit with \[Temporary\]/i.test(t)) need('temporary', 3, { text: 'belohnt Temporary-Einheiten' });
  if (/cards? in your trash|card with my name in your trash/i.test(t)) need('trash', 2.5, { text: 'wird mit vollem Ablagestapel stark' });
  if (/cards? with \[Hidden\]|play a card from face down|played from face down|from \[Hidden\]/i.test(t) && !hidden) need('hidden', 3, { text: 'belohnt Hidden-Karten' });

  // Legenden: Motor erkennen
  // Green Father nennt seine Stämme nur im Erinnerungstext: "(Bird, Cat, Dog,
  // Poro, and Ivern units have +1 Might in Brush.)" – dafür den Rohtext lesen.
  if (card.type === 'legend') {
    const named = (TRIBES ?? []).filter(x => new RegExp(`\\b${esc(x)}\\b`).test(raw));
    if (named.length && !needs.some(n => named.some(x => needFeatures(n).includes(`tag:${x}`)))) {
      need(named.map(x => `tag:${x}`), 6, { text: `belohnt ${named.join('/')}-Einheiten` });
    }
  }
  if (card.type === 'legend' && /play a card from anywhere other than your hand|played from anywhere other than/i.test(t)) {
    need('offhand', 8, { text: 'wird aufgeladen, wenn du Karten NICHT aus der Hand spielst' });
  }
  if (card.type === 'legend' && /\bhide a card\b/i.test(t)) need('hidden', 8, { text: 'lebt von Hidden-Karten' });
  if (card.type === 'legend' && /your sand soldiers/i.test(t)) need('equipment', 6, { text: 'braucht Ausrüstung für Sand Soldiers' });
  if (card.type === 'legend' && /\bMechs\b/.test(t)) need('tag:Mech', 6, { text: 'lebt von Mech-Einheiten' });
  if (card.type === 'legend' && /your equipment/i.test(t)) need('equipment', 6, { text: 'lebt von Ausrüstung' });
  if (card.type === 'legend' && /play gear or use gear/i.test(t)) need('gear', 6, { text: 'lebt von Gear' });

  // Mehrere Bedarfe desselben Merkmals (Level 3/6/11, Level + Spend XP,
  // Weaponmaster + Equipment-Text) sind EIN Bedarf. Maßgeblich ist die
  // niedrigste XP-Schwelle; das Gewicht steigt leicht, weil mehr Text daran hängt.
  const merged = new Map();
  for (const n of needs) {
    const k = needFeatures(n).join('|');
    const cur = merged.get(k);
    if (!cur) { merged.set(k, { ...n }); continue; }
    cur.weight = Math.min(7, Math.max(cur.weight, n.weight) + 1);
    cur.mandatory ||= n.mandatory;
    cur.consumes ||= n.consumes;
    if (n.amount && (!cur.amount || n.amount < cur.amount)) { cur.amount = n.amount; cur.text = n.text; }
  }
  needs.splice(0, needs.length, ...merged.values());

  if (card.type === 'legend') {
    // Die Legende liegt immer im Spiel – ihr Motor zählt stärker als der
    // einer einzelnen Karte, und was sie selbst liefert, liefert sie dauernd.
    for (const n of needs) n.weight *= 1.6;
    if (/gain \d+ XP/i.test(t)) provides.set('xp', 4);
    if (/play a [^.]*?token/i.test(t)) provides.set('token', 4);
  }

  hit = { provides, needs, how: [...how] };
  cache.set(card, hit);
  return hit;
}

/**
 * Wie gut ist ein Bedarf erfüllt? 0 = gar nicht, 1 = zuverlässig.
 * `have` ist die gewichtete Zahl passender Karten im Deck (ohne die Karte selbst).
 */
export function satisfaction(n, have) {
  switch (n.f) {
    case 'xp': {
      // Für N XP auf einmal braucht es deutlich mehr als N Quellen:
      // Hunt feuert nur beim Erobern/Halten, einmalige XP verpuffen.
      const lvl = n.amount || 2;
      return clamp((have - 1) / (2 + lvl));
    }
    case 'spell': return clamp((have - 3) / 8);
    case 'lookTop': return clamp(have / 7);
    case 'offhand': return clamp((have - 2) / 12);
    case 'unit': return clamp(have / 14);
    case 'trash': return clamp(have / 14);
    default:
      if (n.mandatory) return clamp((have - 2) / 6);   // Futter muss sicher liegen
      return clamp((have - 1) / 7);
  }
}
const clamp = x => Math.max(0, Math.min(1, x));

/** Bedarf, der mehrere Merkmale akzeptiert (Bird ODER Cat ODER Dog ODER Poro). */
export const needFeatures = n => (Array.isArray(n.f) ? n.f : [n.f]);

/** Unter dieser Erfüllung gilt eine Pflichtbedingung als nicht bezahlbar. */
export const MANDATORY_MIN = 0.34;

/**
 * Realistische Energiekosten. Rhasa kostet gedruckt 10, mit gefülltem
 * Ablagestapel aber 3–4 – nach dem gedruckten Wert bewertet, fiele sie aus
 * jedem Deck.
 */
export function effectiveEnergy(card) {
  const e = card.energy;
  if (e == null) return e;
  const t = strip(card.text);
  const per = /I cost \{(\d+)\} less for each card in your trash/i.exec(t);
  if (per) return Math.max(3, e - 6 * +per[1]);
  const each = /I cost \{(\d+)\} less for each/i.exec(t);
  if (each) return Math.max(2, e - 2 * +each[1]);
  const lvl = /\[Level \d+\]\s*(?:\[>\])?\s*I cost \{(\d+)\}/i.exec(t);
  if (lvl) return Math.max(2, e - +lvl[1]);
  return e;
}
