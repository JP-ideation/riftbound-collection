/**
 * Spielhilfe zu einem generierten Deck.
 *
 * Alle Aussagen werden aus dem Deck selbst abgeleitet – Kurve, Kartentypen,
 * Domainverteilung, der Motor der Legende (was ihr Text belohnt) und die
 * Bedingungen der einzelnen Karten (was ihr Text voraussetzt). Jede Aussage
 * nennt die Zahl, auf der sie beruht.
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

const isEngine = m => (m.why ?? []).some(w => w.engine);

export function buildGuide(deck) {
  const main = deck.main;

  const total = deck.counts.main || 1;
  const cheap = countIf(main, c => (c.energy ?? 0) <= 2);
  const mid = countIf(main, c => (c.energy ?? 0) >= 3 && (c.energy ?? 0) <= 4);
  const big = countIf(main, c => (c.energy ?? 0) >= 5);
  const units = countIf(main, c => c.type === 'unit');
  const spells = countIf(main, c => c.type === 'spell');
  const gear = countIf(main, c => c.type === 'gear');
  const core = main.filter(isEngine).reduce((n, m) => n + m.count, 0);

  const removal = count(main, RX.removal);
  const draw = count(main, RX.draw);
  const buff = count(main, RX.buff);

  const stats = { total, cheap, mid, big, units, spells, gear, core, removal, draw, buff };

  return {
    archetype: archetype(deck, stats),
    plan: plan(deck, stats),
    keyCards: keyCards(deck),
    mulligan: mulligan(main),
    checks: checks(main),
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
  const ziel = deck.champion ?? deck.legend.fullName ?? deck.legend.name;

  out.push(`Punkte kommen über Schlachtfelder – erobern und halten. Alles hier zielt darauf, dort länger Einheiten stehen zu haben als der Gegner.`);

  for (const e of deck.engine ?? []) {
    out.push(`${ziel} ${e.text}. ${String(e.have).replace('.', ',')} Punkte davon liefert dein Deck (${e.label}). `
      + (e.sat >= 0.8 ? 'Der Motor läuft zuverlässig – nutze die Legende jede Runde.'
        : e.sat >= 0.4 ? 'Der Motor läuft, aber nicht jede Runde. Heb die passenden Karten für den Zug auf, in dem du die Legende brauchst.'
          : 'Zu wenig – die Legende wird selten aktiv. Genau diese Karten fehlen dem Deck am meisten.'));
  }
  if (!(deck.engine ?? []).length) out.push(`Die Legende hat keinen Motor, der bestimmte Karten verlangt – das Deck gewinnt über einzelne starke Karten.`);

  if (s.units >= 26) out.push(`Mit ${s.units} Einheiten spielst du über Masse: mehrere Schlachtfelder gleichzeitig besetzen und den Gegner zwingen, sich zu entscheiden.`);
  else if (s.units <= 20) out.push(`Nur ${s.units} Einheiten – jede einzelne zählt. Wirf sie nicht in ungünstige Kämpfe, sondern warte auf den Zug, in dem du den Kampf gewinnst.`);

  if (s.removal >= 8) out.push(`${s.removal} Karten können gegnerische Einheiten entfernen oder Schaden austeilen. Heb sie für die Karten auf, die dich wirklich stören.`);
  if (s.draw >= 5) out.push(`${s.draw} Karten ziehen nach – du kannst es dir leisten, früh Karten auszugeben.`);
  if (deck.identity.length > 1) out.push(`Zwei Domains (${deck.identity.join(' + ')}): achte beim Channeln darauf, dass du für beide Seiten bezahlen kannst.`);

  return out;
}

/* -------------------------------------------------------- Schlüsselkarten */
function keyCards(deck) {
  // Karten, die den Motor der Legende antreiben oder ihr Champion sind; ohne
  // solche Karten einfach die stärksten.
  const core = deck.main.filter(m => isEngine(m) || (m.why ?? []).some(w => w.ok && /^(Champion|Signature)/.test(w.text)));
  const base = core.length >= 3 ? core : deck.main;
  return [...base]
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(m => ({
      card: m.card,
      count: m.count,
      why: (m.why ?? []).find(w => w.ok)?.text ?? 'Stärkste Einzelkarte im Deck',
    }));
}

/* ---------------------------------------------------- Bedingungen der Karten */
/**
 * Jede Karte, deren Text etwas voraussetzt (XP, Stamm, Zauber …), mit dem
 * Stand im Deck. Nicht erfüllte zuerst.
 */
function checks(main) {
  const out = [];
  for (const m of main) {
    for (const w of m.why ?? []) if (w.need) out.push({ card: m.card, count: m.count, ok: w.ok, sat: w.sat, text: w.text });
  }
  return out.sort((a, b) => a.sat - b.sat);
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
  if (s.core >= 12) out.push(`${s.core} Karten treiben den Motor der Legende an`);
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
  if ((deck.engine ?? []).length && s.core <= 8) out.push(`Nur ${s.core} Karten treiben den Motor der Legende an: ${deck.champion ?? 'die Legende'} bleibt oft ungenutzt`);
  const open = checks(deck.main).filter(c => !c.ok);
  if (open.length) out.push(`${open.reduce((n, c) => n + c.count, 0)} Karten, deren Bedingung das Deck nur teilweise erfüllt (siehe „Bedingungen im Deck")`);
  if (deck.hasChampion === false) out.push(`Keine Champion-Einheit von ${deck.champion} im Bestand – das Deck ist so nicht turnierlegal`);
  if (s.big >= 14) out.push(`${s.big} Karten ab 5 Energie: in den ersten Zügen passiert wenig`);
  if (s.spells + s.gear <= 6) out.push(`Nur ${s.spells} Zauber und ${s.gear} Ausrüstung: fast reines Einheitendeck, wenig Flexibilität`);
  if (deck.identity.length > 1) out.push(`Zwei Domains: Runenverteilung kann klemmen`);
  return out;
}
