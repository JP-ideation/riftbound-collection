/**
 * Korrekturen für Fehler in Riots Kartendaten (vor allem Radiance): falscher
 * Kartentyp (Einheit/Zauber/Ausrüstung vertauscht) und einzelne belegte
 * Fehleinträge. Wird von fetch-cards.mjs nach jedem Abruf angewendet.
 *
 * Typ aus dem Text, nur bei Widersprüchen (Einheit ohne Might, Zauber mit Might –
 * Zauber haben in Riftbound nie Might):
 *   Einheiten sprechen von sich ("I", "me", "my"), Ausrüstung von "this"
 *   ([Deploy], [Equip]), Zauber sind Anweisungen.
 */
// Belegte Einzelkorrekturen (Quelle im Kommentar)
export const MANUAL = {
  // Body-Ausrüstung mit Shield 2 (theouterhaven.net Radiance-Preview, riftbound.gg/cards/rad-071-nazuman-ntofo)
  'RAD-071': { domains: ['body'], text: 'Equipped unit has [Shield 2]. (+2 Might while it\'s a defender.)\n[Equip] {1} ({1}: Attach this to a unit you control.)' },
};

const own = t => String(t ?? '').replace(/\([^)]*\)/g, ' ');       // ohne Erinnerungstext
function guessType(c) {
  const t = own(c.text);
  // Zauber haben nie Might: mit Might ist es eine Einheit (oder anlegbare Ausrüstung)
  if (c.type === 'spell' && c.might > 0) return /\[Equip\]|\bEquip\b/.test(t) ? 'gear' : 'unit';
  if (/\b(I|me|my|I'm)\b/.test(t) && c.might != null) return 'unit';
  if (/\[(Deploy|Equip)\]|\bEquip\b|\bthis\b(?! turn)/i.test(t)) return 'gear';
  if (/\b(I|me|my)\b/.test(t)) return 'unit';
  return 'spell';
}

export function fixCard(c) {
  const code = /^([A-Z]+-\d+)/.exec(c.code ?? '')?.[1];
  const m = code && MANUAL[code];
  if (m) Object.assign(c, m);
  const suspicious = (c.type === 'unit' && c.might == null) || (c.type === 'spell' && c.might > 0);
  if (suspicious && ['unit', 'spell', 'gear'].includes(c.type)) {
    const t = guessType(c);
    if (t !== c.type) { c.typeFixed = c.type; c.type = t; c.types = [t, ...(c.types ?? []).filter(x => x !== t && !['unit', 'spell', 'gear'].includes(x))]; }
  }
  return c;
}
