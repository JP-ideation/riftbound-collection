/**
 * Lädt data/cards.json und verknüpft Sammlungs-Einträge mit offiziellen Karten.
 */

let DB = null;

export async function loadCards() {
  if (DB) return DB;
  const res = await fetch('data/cards.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Kartendaten konnten nicht geladen werden');
  const raw = await res.json();

  const bySetNum = new Map();
  const byName = new Map();
  for (const c of raw.cards) {
    // Schlüssel aus publicCode, NICHT aus collectorNumber: sonst kollidieren
    // Runen (VEN-R04) und Tokens (SFD-T03) mit reg. Karten (VEN-004 / SFD-003).
    const token = codeToken(c);
    prefer(bySetNum, `${c.set}-${keepSuffix(token)}`, c);   // exakt, z. B. 197A
    prefer(bySetNum, `${c.set}-${normNum(token)}`, c);      // Basis,  z. B. 197
    prefer(byName, c.name.toLowerCase(), c);
  }

  DB = { ...raw, bySetNum, byName };
  return DB;
}

/** publicCode -> Nummern-Token: "UNL-131/219" ergibt 131, "VEN-R04" ergibt R04. */
function codeToken(card) {
  const m = /^[A-Z]+-([^/]+)/.exec(card.code ?? '');
  return m ? m[1].replace(/\*/g, '') : String(card.num ?? '');
}

/**
 * Showcase-Nachdrucke (OGN-197a) sind dieselbe Spielkarte wie das Original
 * (OGN-197), tragen aber die Seltenheit "showcase". Für Bewertung und Anzeige
 * muss immer die reguläre Ausgabe gewinnen.
 */
function prefer(map, key, card) {
  const cur = map.get(key);
  if (!cur || better(card, cur)) map.set(key, card);
}

/**
 * Riot fuehrt denselben Kartennamen teils mehrfach mit abweichenden Daten –
 * mal fehlt der Erinnerungstext in Klammern, mal ein Tag. Bei gleichem Rang
 * gewinnt deshalb die ausfuehrlichere Fassung.
 */
function better(a, b) {
  if (rank(a) !== rank(b)) return rank(a) > rank(b);
  return (a.text?.length ?? 0) > (b.text?.length ?? 0);
}
const altArt = c => /\d+[a-z]/.test(c.code ?? '');
const rank = c => (c.rarity === 'showcase' ? 0 : 4) + (altArt(c) ? 0 : 2) + (c.variant ? 0 : 1);

/** Wie normNum, behält aber das Varianten-Suffix: "197a" -> "197A" */
function keepSuffix(n) {
  const m = /^([A-Z]*)0*(\d+)([A-Z]*)$/.exec(String(n).toUpperCase());
  return m ? m[1] + m[2] + m[3] : String(n).toUpperCase();
}

/** "088A" -> "88", "R06a" -> "R6", "T05" -> "T5", "081" -> "81" */
function normNum(n) {
  if (!n) return '';
  let s = String(n).toUpperCase();
  if (/\d/.test(s)) s = s.replace(/[A-Z]+$/, '');   // Varianten-Suffix (240a, 088A)
  const m = /^([A-Z]*)0*(\d+)$/.exec(s);
  return m ? m[1] + m[2] : s;
}

/** Einen Sammlungseintrag der offiziellen Karte zuordnen. */
export function resolve(db, entry) {
  if (entry.num) {
    const hit = db.bySetNum.get(`${entry.set}-${keepSuffix(entry.num)}`)
             ?? db.bySetNum.get(`${entry.set}-${normNum(entry.num)}`);
    if (hit) return hit;
  }
  const direct = db.byName.get(entry.name.toLowerCase());
  if (direct) return direct;
  // Exporte schreiben Legenden/Champions als "Kha'Zix - Voidreaver",
  // die offizielle DB kennt nur "Voidreaver".
  const dash = entry.name.split(/\s+-\s+/);
  if (dash.length === 2) {
    return db.byName.get(dash[1].toLowerCase()) ?? db.byName.get(dash[0].toLowerCase()) ?? null;
  }
  return null;
}

/**
 * Sammlung -> spielbarer Bestand.
 * Für den Deckbau zählt nur der Kartenname: Foils, Alt-Arts und
 * Nachdrucke aus mehreren Sets sind dieselbe Karte.
 */
export function buildInventory(db, entries) {
  const owned = new Map();   // name -> { card, qty, printings[] }
  const unmatched = [];

  for (const e of entries) {
    const found = resolve(db, e);
    if (!found) { unmatched.push(e); continue; }
    // Immer die reguläre Ausgabe als Referenz führen, nie den Showcase-Druck.
    const card = db.byName.get(found.name.toLowerCase()) ?? found;
    const hit = owned.get(card.name);
    if (hit) { hit.qty += e.qty; hit.printings.push(e); }
    else owned.set(card.name, { card, qty: e.qty, printings: [e] });
  }

  return { owned, unmatched };
}
