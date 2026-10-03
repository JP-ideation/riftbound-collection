/**
 * Schwierigkeit eines Decks: Einsteiger / Mittel / Fortgeschritten.
 *
 * Geschätzt aus dem, was das Deck vom Spieler verlangt: Timing (Reaktionen,
 * Hidden, Ambush), Bedingungen (XP, Level, Stammesfutter), Spielen aus
 * Ablagestapel oder Deck, aktivierte Fähigkeiten und ein Legenden-Motor, der
 * Planung verlangt. Klare Einheiten mit festen Werten machen ein Deck leicht.
 *
 * Dazu Einschätzungen aus der Community (Quelle jeweils angegeben). Die
 * Schwierigkeit fließt NICHT in die Bewertung ein – ein schweres Deck ist
 * nicht schlechter, nur anspruchsvoller.
 */
import { analyze } from './mechanics.js';

export const LEVELS = ['Einsteiger', 'Mittel', 'Fortgeschritten'];

/** Community-Einschätzungen je Legende (fullName, klein), in Punkten auf der 0–10-Skala. */
const COMMUNITY = {
  'wuju bladesman, starter': { adj: -2, text: 'Laut riftbound.gg die am leichtesten zu spielende Top-Legende' },
  'heart of the tempest': { adj: 1.5, text: 'Laut riftbound.gg ein Deck mit sehr vielen Entscheidungen' },
  'scorn of the moon': { adj: 1.5, text: 'Laut riftbound.gg nur stark, wenn man Zeit investiert' },
  'defender of tomorrow': { adj: -1, text: 'Empower-Midrange gilt laut riftcompare.com als einsteigerfreundlich' },
  "soul's reflection": { adj: -1, text: 'Empower-Midrange gilt laut riftcompare.com als einsteigerfreundlich' },
};

const t = c => c.text ?? '';
const RULES = [
  // [Erkennung, Punkte je Kopie, Bezeichnung für die Begründung]
  [c => /\[Reaction\]/.test(t(c)), 0.14, 'Reaktionen (Timing)'],
  [c => /\[Hidden\]/.test(t(c)), 0.22, 'Hidden-Karten'],
  [c => /\[Ambush\]/.test(t(c)), 0.1, 'Ambush'],
  [c => analyze(c).needs.length > 0, 0.14, 'Karten mit Bedingungen'],
  [c => /from (?:your|a|any) trash|\[Flow\]|\[Burn/i.test(t(c)), 0.15, 'Spiel mit dem Ablagestapel'],
  [c => /look at (?:the )?top|reveal (?:the )?top|\[Predict|\[Vision\]/i.test(t(c)), 0.06, 'Blick aufs Deck'],
  [c => /Exhaust:|Spend \d+ XP:|\[Empower\]|\[Equip\]/i.test(t(c)), 0.08, 'aktivierte Fähigkeiten'],
  [c => /\[Repeat\]|\[Legion\]|\[Level \d+\]|\[Show Off\]/.test(t(c)), 0.06, 'Zusatzbedingungen (Legion, Level, Repeat)'],
];

/**
 * Bewertet ein fertiges Deck. Ergebnis:
 *   level 0..2, label, score 0..10, reasons[] (die drei größten Treiber),
 *   community (Text der Einschätzung, falls vorhanden)
 */
export function difficulty(deck) {
  const tally = RULES.map(() => 0);
  let raw = 0, simple = 0;
  for (const { card, count } of deck.main) {
    let hit = false;
    RULES.forEach(([test, w], i) => { if (test(card)) { tally[i] += count; raw += w * count; hit = true; } });
    // Klare Einheit: nur Werte und Schlüsselwörter, kein Effekttext
    if (!hit && card.type === 'unit' && t(card).replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim().length < 25) simple += count;
  }

  const legend = analyze(deck.legend);
  let legendPts = 0;
  if (legend.needs.length) legendPts += 1;                 // Motor muss bedient werden
  if (/Exhaust:/.test(t(deck.legend))) legendPts += 0.5;   // aktiv einzusetzende Fähigkeit
  if (/\[Empower\]|empower me/i.test(t(deck.legend))) legendPts += 0.3;

  const com = COMMUNITY[(deck.legend.fullName ?? deck.legend.name).toLowerCase()];
  let score = raw * 1.1 + legendPts - simple * 0.05 + (com?.adj ?? 0);
  score = Math.max(0, Math.min(10, score));
  const level = score < 4 ? 0 : score < 5.6 ? 1 : 2;

  const reasons = RULES.map(([, w, label], i) => ({ n: tally[i], pts: tally[i] * w, label }))
    .filter(r => r.n > 0).sort((a, b) => b.pts - a.pts).slice(0, 3)
    .map(r => `${r.n} ${r.label}`);
  if (legend.needs.length) reasons.push(`Legende ${legend.needs[0].text}`);
  if (simple >= 8) reasons.push(`${simple} klare Einheiten ohne Effekttext`);

  return { level, label: LEVELS[level], score: Math.round(score * 10) / 10, reasons, community: com?.text ?? null };
}
