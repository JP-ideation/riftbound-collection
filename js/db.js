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
    prefer(byName, key(c), c);
  }

  DB = { ...raw, bySetNum, byName };
  return DB;
}

/**
 * Identitaetsschluessel einer Spielkarte.
 *
 * NICHT der blosse Name: Riot fuehrt den Beinamen seit 09/2026 getrennt, und
 * unter "Kennen" liegen zwei voellig verschiedene Karten (VEN-135 Order/2 Might
 * und VEN-113 Chaos/4 Might). Ueber alle 1189 Drucke ist name+subtitle
 * eindeutig: 936 Werte, keiner mit abweichenden Spielwerten.
 */
export const key = c => (c.fullName ?? c.name).toLowerCase();

/** Eingabenamen vereinheitlichen: "Kennen - Keeper of Balance" wie "Kennen, Keeper of Balance". */
const normName = n => String(n ?? '').toLowerCase().replace(/\s+-\s+/, ', ').replace(/\s+/g, ' ').trim();

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
/**
 * Passt der Name der gefundenen Karte zum Namen in der Eingabe?
 *
 * Plausibilitaetspruefung: Schreibt eine Scanner-App versehentlich die
 * collectorNumber statt des publicCode, zeigt die Nummer auf eine fremde
 * Karte ("Calm Rune (VEN) #002" -> Blade Twirler). Ohne diese Pruefung wuerde
 * die stillschweigend eingebucht.
 */
function nameFits(card, entry) {
  const a = normName(entry.name);
  const b = key(card);
  if (a === b) return true;
  const teile = a.split(', ');
  // Export stellt bei Legenden den Champion voran: "Kennen - Heart of the Tempest"
  if (teile.length === 2 && (teile[1] === b || teile[0] === b)) return true;
  // Export ohne Beinamen: "Kennen" fuer "Kennen, Keeper of Balance"
  if (b.split(', ')[0] === a) return true;
  return false;
}

export function resolve(db, entry) {
  if (entry.num) {
    const hit = db.bySetNum.get(`${entry.set}-${keepSuffix(entry.num)}`)
             ?? db.bySetNum.get(`${entry.set}-${normNum(entry.num)}`);
    if (hit && nameFits(hit, entry)) return hit;
    // Nummer und Name widersprechen sich: dem Namen glauben, er ist
    // eindeutig. Nur wenn der Name unbekannt ist, zaehlt die Nummer.
    if (hit) {
      const perName = db.byName.get(normName(entry.name));
      return perName ?? hit;
    }
  }
  // Exporte schreiben "Kennen - Keeper of Balance", die DB fuehrt
  // "Kennen, Keeper of Balance" - beides auf eine Form bringen.
  const direct = db.byName.get(normName(entry.name));
  if (direct) return direct;
  // Legenden heissen in der DB nur nach ihrem Beinamen ("Heart of the
  // Tempest"), Exporte stellen den Champion voran.
  const dash = entry.name.split(/\s+-\s+/);
  if (dash.length === 2) return db.byName.get(normName(dash[1])) ?? null;
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
    // Die regulaere Ausgabe derselben Karte als Referenz fuehren, nie den
    // Showcase-Druck. Nachschlagen ueber den Identitaetsschluessel - ueber den
    // blossen Namen wuerde hier eine fremde Karte eingesetzt.
    const card = db.byName.get(key(found)) ?? found;
    const k = key(card);
    const hit = owned.get(k);
    if (hit) { hit.qty += e.qty; hit.printings.push(e); }
    else owned.set(k, { card, qty: e.qty, printings: [e] });
  }

  return { owned, unmatched };
}
