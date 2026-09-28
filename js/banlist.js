/**
 * Offizielle Bannliste, Standard Constructed (1v1).
 *
 * Stand: 18.09.2026 (drei Bannwellen: 31.03., 24.07., 18.09.2026).
 * Quelle: playriftbound.com – "September Ban List Updates (Effective
 * September 18, 2026)" und "July Ban List Updates"; gegengeprüft mit
 * riftbound.gg und riftbound.zone.
 *
 * Schlüssel ist fullName in Kleinbuchstaben, wie überall in der App.
 * Master Yi, Wuju Bladesman ist nur in 2v2 gebannt und fehlt hier bewusst.
 */
export const BANNED_AS_OF = '2026-09-18';

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
].map(s => s.toLowerCase()));

export const isBanned = c => BANNED.has((c.fullName ?? c.name ?? '').toLowerCase());
