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
