/**
 * Spielhilfe zu einem generierten Deck.
 *
 * Alle Aussagen werden aus dem Deck selbst abgeleitet – Kurve, Kartentypen,
 * Domainverteilung, Tag-Überschneidung mit der Legende und Schlüsselwörter im
 * Kartentext. Es steckt bewusst kein Regel- oder Metawissen darin, das sich
 * nicht aus den Kartendaten belegen lässt; jede Aussage nennt die Zahl,
 * auf der sie beruht.
 */

const RX = {
  removal: /\b(kill|destroy)\b|deals? \d/i,
  draw: /\bdraw\b/i,
  buff: /\bbuff\b|\+\d+ Might/i,
  recur: /\btrash\b|recycle/i,
  cheapen: /costs? .*less/i,
  shield: /shield|prevent/i,
};

const count = (main, re) => main.filter(m => re.test(m.card.text ?? '')).reduce((s, m) => s + m.count, 0);
const countIf = (main, fn) => main.filter(m => fn(m.card)).reduce((s, m) => s + m.count, 0);

export function buildGuide(deck) {
  const main = deck.main;
  const legendTags = new Set(deck.legend.tags ?? []);

  const total = deck.counts.main || 1;
  const cheap = countIf(main, c => (c.energy ?? 0) <= 2);
  const mid = countIf(main, c => (c.energy ?? 0) >= 3 && (c.energy ?? 0) <= 4);
  const big = countIf(main, c => (c.energy ?? 0) >= 5);
  const units = countIf(main, c => c.type === 'unit');
  const spells = countIf(main, c => c.type === 'spell');
  const gear = countIf(main, c => c.type === 'gear');
  const core = countIf(main, c => (c.tags ?? []).some(t => legendTags.has(t)));

  const removal = count(main, RX.removal);
  const draw = count(main, RX.draw);
  const buff = count(main, RX.buff);

  const stats = { total, cheap, mid, big, units, spells, gear, core, removal, draw, buff };

  return {
    archetype: archetype(deck, stats),
    plan: plan(deck, stats),
    keyCards: keyCards(deck, legendTags),
    mulligan: mulligan(main),
    strengths: strengths(deck, stats),
    weaknesses: weaknesses(deck, stats),
    stats,
  };
}

/* ------------------------------------------------------------- Archetyp */
function archetype(deck, s) {
  const e = deck.avgEnergy;
  if (e <= 3.3 && s.cheap >= 11) return {
    name: 'Tempo',
    text: `Ø ${e} Energie und ${s.cheap} Karten für 1–2 Energie: das Deck will früh Einheiten stellen und den Gegner unter Druck setzen, bevor er seine teuren Karten ausspielen kann.`,
  };
  if (e >= 4 || s.big >= 13) return {
    name: 'Spätspiel',
    text: `Ø ${e} Energie und ${s.big} Karten ab 5 Energie: das Deck gewinnt die langen Partien. Die frühen Züge übersteht es, danach sind deine Karten schlicht größer.`,
  };
  return {
    name: 'Midrange',
    text: `Ø ${e} Energie, ${s.cheap} günstige und ${s.big} teure Karten: ausgewogen. Du kannst früh mitspielen und hast trotzdem Karten, die eine Partie allein entscheiden.`,
  };
}

/* ------------------------------------------------------------ Spielplan */
function plan(deck, s) {
  const out = [];
  const ziel = deck.champion ?? deck.legend.name;

  out.push(`Punkte kommen über Schlachtfelder – erobern und halten. Alles hier zielt darauf, dort länger Einheiten stehen zu haben als der Gegner.`);

  if (s.core >= 12) out.push(`${s.core} deiner 40 Karten teilen einen Tag mit ${ziel}. Das ist der Kern: Diese Karten verstärken sich gegenseitig, spiel sie zusammen statt vereinzelt.`);
  else if (s.core > 0) out.push(`Nur ${s.core} Karten teilen einen Tag mit ${ziel} – die Legende ist hier eher Beiwerk als Motor. Das Deck gewinnt über einzelne starke Karten, nicht über Synergie.`);

  if (s.units >= 26) out.push(`Mit ${s.units} Einheiten spielst du über Masse: mehrere Schlachtfelder gleichzeitig besetzen und den Gegner zwingen, sich zu entscheiden.`);
  else if (s.units <= 20) out.push(`Nur ${s.units} Einheiten – jede einzelne zählt. Wirf sie nicht in ungünstige Kämpfe, sondern warte auf den Zug, in dem du den Kampf gewinnst.`);

  if (s.removal >= 8) out.push(`${s.removal} Karten können gegnerische Einheiten entfernen oder Schaden austeilen. Heb sie für die Karten auf, die dich wirklich stören.`);
  if (s.draw >= 5) out.push(`${s.draw} Karten ziehen nach – du kannst es dir leisten, früh Karten auszugeben.`);
  if (deck.identity.length > 1) out.push(`Zwei Domains (${deck.identity.join(' + ')}): achte beim Channeln darauf, dass du für beide Seiten bezahlen kannst.`);

  return out;
}

/* -------------------------------------------------------- Schlüsselkarten */
function keyCards(deck, legendTags) {
  const synergy = deck.main.filter(m => (m.card.tags ?? []).some(t => legendTags.has(t)));
  // Ohne Legenden-Synergie (kommt bei schwachen Legenden vor) einfach die
  // stärksten Karten zeigen, statt gar nichts.
  const base = synergy.length >= 3 ? synergy : deck.main;
  return [...base]
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(m => ({
      card: m.card,
      count: m.count,
      why: (m.card.tags ?? []).some(t => legendTags.has(t))
        ? `Teilt einen Tag mit deiner Legende`
        : `Stärkste Einzelkarte im Deck`,
    }));
}

/* -------------------------------------------------------------- Startblatt */
function mulligan(main) {
  return [...main]
    .filter(m => (m.card.energy ?? 9) <= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(m => ({ card: m.card, count: m.count }));
}

/* ---------------------------------------------------- Stärken / Schwächen */
function strengths(deck, s) {
  const out = [];
  if (s.core >= 12) out.push(`${s.core} Karten mit Legenden-Tag – geschlossenes Thema`);
  if (s.cheap >= 12) out.push(`${s.cheap} günstige Karten: kaum tote Starthände`);
  if (s.removal >= 8) out.push(`${s.removal} Karten mit Entfernung oder Schaden`);
  if (s.draw >= 5) out.push(`${s.draw} Karten ziehen nach`);
  if (s.units >= 26) out.push(`${s.units} Einheiten: viel Präsenz auf Schlachtfeldern`);
  if (deck.identity.length === 1) out.push(`Nur eine Domain – du kannst immer alles bezahlen`);
  return out;
}

function weaknesses(deck, s) {
  const out = [];
  if (s.cheap <= 8) out.push(`Nur ${s.cheap} Karten für 1–2 Energie: langsame Starts, gegen Tempo-Decks heikel`);
  if (s.removal <= 4) out.push(`Nur ${s.removal} Karten gegen gegnerische Einheiten: große Einheiten bleiben stehen`);
  if (s.draw <= 2) out.push(`Nur ${s.draw} Karten ziehen nach: leere Hand ist schwer aufzuholen`);
  if (s.units <= 20) out.push(`Nur ${s.units} Einheiten: wenig Präsenz, um Schlachtfelder zu halten`);
  if (s.core <= 8) out.push(`Nur ${s.core} Karten mit Legenden-Tag: wenig Synergie mit ${deck.champion ?? 'der Legende'}`);
  if (s.big >= 14) out.push(`${s.big} Karten ab 5 Energie: in den ersten Zügen passiert wenig`);
  if (s.spells + s.gear <= 6) out.push(`Nur ${s.spells} Zauber und ${s.gear} Ausrüstung: fast reines Einheitendeck, wenig Flexibilität`);
  if (deck.identity.length > 1) out.push(`Zwei Domains: Runenverteilung kann klemmen`);
  return out;
}
