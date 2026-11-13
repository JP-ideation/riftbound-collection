/**
 * Offizielle Bannliste, Standard Constructed (1v1).
 *
 * Stand: 23.11.2026 (vier Bannwellen: 31.03., 24.07., 18.09., 23.11.2026).
 * Quelle: playriftbound.com – "Radiance Ban List Updates (Effective
 * November 23, 2026)" (angekündigt 13.11.), "September Ban List Updates"
 * und "July Ban List Updates"; gegengeprüft mit riftbound.gg und riftbound.zone.
 * Die Radiance-Bans gelten für Standard und 2v2. Die App behandelt sie schon
 * vor dem 23.11. als gebannt, damit neu gebaute Decks danach noch legal sind.
 *
 * Schlüssel ist fullName in Kleinbuchstaben, wie überall in der App.
 * Master Yi, Wuju Bladesman ist nur in 2v2 gebannt und fehlt hier bewusst.
 */
export const BANNED_AS_OF = '2026-11-23';

/** Radiance-Bannwelle (gültig ab 23.11.2026) – wird in der App eigens markiert. */
export const BANNED_NEW = new Set([
  'riven, broken blade',
  "zhonya's hourglass",
  'stellacorn herder',
  'nocturne, horrifying',
  'rhasa the sunderer',
  'brynhir thundersong',
  'dazzling aurora',
  'baited hook',
  // Schlachtfelder
  "emperor's dais",
  'star spring',
]);

export const BANNED = new Set([
  // Karten
  'called shot',
  'scrapheap',
  'draven, vanquisher',
  'fight or flight',
  'stealthy pursuer',
  'ekko, recurrent',
  'stacked deck',
  // Schlachtfelder
  "reaver's row",
  'the dreaming tree',
  'obelisk of power',
  "the arena's greatest",
  "aspirant's climb",
  ...BANNED_NEW,
].map(s => s.toLowerCase()));

export const isBanned = c => BANNED.has((c.fullName ?? c.name ?? '').toLowerCase());
