/**
 * Parser für Sammlungs-Exporte im Standard-Decklisten-Format:
 *   "2 Onslaught (VEN) #081"
 *   "1 Sett - Kingpin (alt) (OGN) #240a *F*"
 *   "4 Recruit (NX) (OGN) #272"
 *
 * Robust gegen: Kartennamen mit Klammern, fehlende Sammlernummern,
 * Buchstaben-Suffixe (#240a, #088A), Extended-Art-Sets (OGNX/UNLX/VENX),
 * Foil-Markierung und doppelte Zeilen (werden summiert).
 */

// Greedy .+ sorgt dafür, dass die LETZTE Klammergruppe als Set gilt –
// damit bleibt "Recruit (NX)" Teil des Namens.
const LINE = /^(\d+)\s+(.+)\s+\(([A-Za-z]{2,5})\)(?:\s+#(\S+))?(?:\s+\*F\*)?$/;
const NAME_SUFFIX = /\s*\((alt|Alternate Art|Metal|Overnumbered|Prerelease|Foil)\)\s*$/i;

export function parseCollection(text) {
  const entries = [];
  const errors = [];

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) return;

    const m = LINE.exec(line);
    if (!m) {
      errors.push({ line: i + 1, text: line });
      return;
    }

    const [, qty, rawName, rawSet, rawNum] = m;
    const foil = line.endsWith('*F*');
    const setUpper = rawSet.toUpperCase();
    // OGNX / UNLX / VENX sind Extended-Art-Ausgaben desselben Sets
    const extended = /^[A-Z]{3}X$/.test(setUpper);

    entries.push({
      qty: parseInt(qty, 10),
      name: rawName.replace(NAME_SUFFIX, '').trim(),
      rawName,
      set: extended ? setUpper.slice(0, -1) : setUpper,
      rawSet: setUpper,
      extended,
      num: rawNum ?? null,
      foil,
      raw: line,
    });
  });

  return { entries: mergeDuplicates(entries), errors };
}

/** Identische Einträge (Name+Set+Nr+Foil) zusammenzählen. */
function mergeDuplicates(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = `${e.rawName}|${e.rawSet}|${e.num}|${e.foil}`;
    const hit = map.get(key);
    if (hit) hit.qty += e.qty;
    else map.set(key, { ...e });
  }
  return [...map.values()];
}

/** Sammlung zurück ins Textformat schreiben (Export / Teilen). */
export function serializeCollection(entries) {
  return entries
    .map(e => `${e.qty} ${e.rawName} (${e.rawSet})${e.num ? ' #' + e.num : ''}${e.foil ? ' *F*' : ''}`)
    .join('\n');
}

/**
 * Decklisten von Deckseiten (riftbound.gg, riftdecks.com, mobalytics,
 * Piltover Archive, TCG Arena …). Erlaubt:
 *   "3 Defy" · "3x Defy" · "Defy x3" · "2 Onslaught (VEN) #081"
 *   Abschnittsköpfe wie "Legend:", "Champion:", "MainDeck:", "Main Deck",
 *   "Battlefields:", "Runes:", "Sideboard:" (auch mit Anzahl dahinter).
 * Das Sideboard wird markiert und zählt nicht zum Deck.
 */
const SECTION = /^(legend|champion|chosen champion|main ?deck|main|deck|battlefields?|runes?|rune deck|sideboard|side ?deck)\b[^0-9]*?(\(\d+\))?\s*:?\s*(\d+)?\s*$/i;
const SIMPLE = /^(\d+)\s*x?\s+(.+?)$/i;
const TRAILING = /^(.+?)\s+x\s*(\d+)$/i;

export function parseDeckList(text) {
  const entries = [];
  const errors = [];
  let section = '';
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim().replace(/^[-•*]\s+/, '');
    if (!line || line.startsWith('//') || line.startsWith('#')) return;
    const sec = SECTION.exec(line);
    if (sec && !/^\d/.test(line)) { section = sec[1].toLowerCase().replace(/\s+/g, ''); return; }

    const full = LINE.exec(line);
    if (full) {
      const [, qty, rawName, rawSet, rawNum] = full;
      const setUpper = rawSet.toUpperCase();
      const extended = /^[A-Z]{3}X$/.test(setUpper);
      entries.push({ qty: +qty, name: rawName.replace(NAME_SUFFIX, '').trim(), rawName,
        set: extended ? setUpper.slice(0, -1) : setUpper, num: rawNum ?? null, section, raw: line });
      return;
    }
    const m = SIMPLE.exec(line) ?? (() => { const t = TRAILING.exec(line); return t && [t[0], t[2], t[1]]; })();
    if (!m) {
      // Ohne Anzahl (z. B. "Kennen - Heart of the Tempest" unter "Legend"):
      // als 1 Exemplar werten. Unbekannte Namen zeigt die App später an.
      if (/[a-z]/i.test(line) && line.length <= 60) {
        const name = line.replace(NAME_SUFFIX, '').trim();
        entries.push({ qty: 1, name, rawName: name, set: null, num: null, section, raw: line });
      } else errors.push({ line: i + 1, text: line });
      return;
    }
    const name = m[2].replace(NAME_SUFFIX, '').trim();
    entries.push({ qty: +m[1], name, rawName: name, set: null, num: null, section, raw: line });
  });
  const sideboard = s => /^side/.test(s);
  return { entries: entries.filter(e => !sideboard(e.section)), sideboard: entries.filter(e => sideboard(e.section)), errors };
}
