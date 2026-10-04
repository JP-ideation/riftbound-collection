import { parseCollection, parseDeckList, serializeCollection } from './parser.js';
import { loadCards, buildInventory, resolve, key } from './db.js';
import { suggestDecks, deckToText, deckToArena, deckTitle, checkDeck, championOf, groupByDomain, RULES } from './deckbuilder.js';
import { buildGuide } from './guide.js';
import { isBanned, BANNED_AS_OF } from './banlist.js';
import { SECTIONS, KEYWORDS, keywordsIn } from './rules.js';

const KEY = { coll: 'rb.collection.v1', meta: 'rb.metadecks.v1', friends: 'rb.friends.v1', deckView: 'rb.deckview.v1', pins: 'rb.pins.v1' };
const DOMAINS = ['calm', 'mind', 'body', 'fury', 'order', 'chaos', 'colorless'];

const state = {
  db: null, entries: [], inv: null, decks: null, unmatched: [],
  view: 'sammlung', deckIdx: null, pinOpen: null, swap: { from: '', to: '' },
  filter: { q: '', set: '', domain: '', type: '', rarity: '' },
};

/* ------------------------------------------------------------------ Helfer */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const img = (c, w = 320) => c.img ? esc(c.img + '&w=' + w) : '';
// Antippbar: öffnet das Kartenbild (siehe showCard)
const cv = c => (c ? ` data-cardview="${esc((c.fullName ?? c.name).toLowerCase())}"` : '');
// Anzeigename ist IMMER Name + Beiname. "Kennen" allein bezeichnet zwei
// verschiedene Spielkarten und ist als Beschriftung unbrauchbar.
const cname = c => c.fullName ?? c.name;
const dots = ds => (ds ?? []).map(d => `<span class="dom ${d}" title="${d}"></span>`).join('');

// Domain als lesbares Wort, nicht nur als Farbpunkt: zwei Karten desselben
// Champions koennen in verschiedenen Domains liegen und voellig
// unterschiedliche Effekte haben. Ein winziger Punkt reicht dafuer nicht.
const DOM_LABEL = { calm: 'Calm', mind: 'Mind', body: 'Body', fury: 'Fury',
                    order: 'Order', chaos: 'Chaos', colorless: 'farblos' };
const domLabel = ds => (ds ?? []).map(d => DOM_LABEL[d] ?? d).join(' + ') || '–';
// "VEN-135/166" -> "VEN-135" : eindeutige Kennung zum Nachschlagen
const shortCode = c => (c.code ?? '').split('/')[0] || `${c.set}-${c.num}`;
// Domain + Kennung + Kosten, die vollstaendige Identitaet einer Karte
const ident = c => `${dots(c.domains)} ${esc(domLabel(c.domains))} · ${esc(shortCode(c))}`
  + (c.energy != null ? ` · ${c.energy}E` : '');
const pct = (a, b) => Math.round((a / Math.max(b, 1)) * 100);

function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function read(k, dflt) { try { return JSON.parse(localStorage.getItem(k)) ?? dflt; } catch { return dflt; } }

/* -------------------------------------------------------------- Sammlung */
function applyCollection(text, persist = true) {
  const { entries, errors } = parseCollection(text);
  state.entries = entries;
  const { owned, unmatched } = buildInventory(state.db, entries);
  state.inv = { owned };
  state.unmatched = unmatched;
  state.decks = null;                       // wird beim Öffnen des Deck-Tabs berechnet
  state.parseErrors = errors;
  if (persist) store(KEY.coll, text);
  renderHead();
}

function decks() {
  if (!state.decks) state.decks = suggestDecks(state.inv, state.db.cards, metaDecks());
  return state.decks;
}

/**
 * Gespeicherte Meta-Decklisten in eine Form bringen, die der Deckbau nutzen
 * kann: welche Legende, welche Karten. Listen ohne erkennbare Legende helfen
 * dem Deckbau nicht, werden im Meta-Tab aber trotzdem ausgewertet.
 */
function parseMetaList(text) {
  const { entries } = parseDeckList(text);
  const rows = entries.map(e => {
    const found = resolve(state.db, e);
    return { e, card: found ? (state.db.byName.get(key(found)) ?? found) : null };
  });
  const legend = rows.find(r => r.card?.type === 'legend')?.card ?? null;
  const main = rows.filter(r => r.card && ['unit', 'spell', 'gear'].includes(r.card.type))
    .map(r => ({ card: r.card, count: r.e.qty }));
  const battlefields = rows.filter(r => r.card?.type === 'battlefield').map(r => r.card);
  const unknown = rows.filter(r => !r.card).map(r => r.e.raw);
  return { legend, main, battlefields, unknown };
}

function metaDecks() {
  // "Nur prüfen" (eigenes Deck) fließt nicht ein – sonst würde ein schwaches
  // eigenes Deck den Deckbau in seine eigene Richtung ziehen.
  const own = read(KEY.meta, []).filter(d => !d.own).map(d => {
    const { legend, main } = parseMetaList(d.text);
    if (!legend) return null;
    // Selbst hochgeladene Listen sind meist die aktuellsten – sie werden Vorbild.
    return { name: d.name, weight: 3, legendKey: key(legend), champion: championOf(legend, state.db.cards), cards: countMap(main) };
  }).filter(Boolean);
  return [...builtinMeta(), ...own];
}

const countMap = main => {
  const m = new Map();
  for (const { card, count } of main) m.set(key(card), (m.get(key(card)) ?? 0) + count);
  return m;
};

/**
 * Mitgelieferte Turnierlisten (data/meta.json) in dieselbe Form bringen wie
 * eingefügte Meta-Decks. Karten, die es nicht (mehr) gibt, fallen still raus.
 */
function builtinMeta() {
  if (!state.meta) return [];
  return state.meta.decks.map(d => {
    const legend = state.db.byName.get(d.legend.toLowerCase());
    if (!legend) return null;
    const main = d.cards.map(([n, c]) => ({ card: state.db.byName.get(n.toLowerCase()), count: c })).filter(x => x.card);
    return { name: d.name, weight: d.weight ?? 1, legendKey: key(legend), champion: championOf(legend, state.db.cards), cards: countMap(main), builtin: d };
  }).filter(Boolean);
}

function renderHead() {
  const total = state.entries.reduce((s, e) => s + e.qty, 0);
  const uniq = state.inv?.owned.size ?? 0;
  const all = state.db.cards.filter(c => !c.variant).length;
  $('#headStat').innerHTML = total
    ? `<b>${total}</b> Karten · <b>${uniq}</b> verschiedene · <b>${pct(uniq, all)}%</b> der Datenbank`
    : 'Keine Sammlung geladen';
}

/* ----------------------------------------------------------------- Views */
function render() {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === state.view));
  const v = $('#view');
  // Regeln brauchen keine Sammlung – die sollen auch ohne Import nachschlagbar sein.
  if (!state.entries.length && !['import', 'regeln'].includes(state.view)) { v.innerHTML = viewImport(true); return; }
  v.innerHTML = ({
    sammlung: viewSammlung, decks: viewDecks, meine: viewMeine, meta: viewMeta,
    wunsch: viewWunsch, teilen: viewTeilen, import: viewImport, regeln: viewRegeln,
  }[state.view] ?? viewSammlung)();
  window.scrollTo({ top: 0 });
}

/* --- Import --- */
function viewImport(first = false) {
  const errs = state.parseErrors?.length
    ? `<div class="notice" style="margin-top:12px">${state.parseErrors.length} Zeile(n) nicht erkannt: ${state.parseErrors.slice(0, 3).map(e => esc(e.text)).join(' · ')}</div>` : '';
  const un = state.unmatched.length
    ? `<div class="notice" style="margin-top:12px"><b>${state.unmatched.length}</b> Einträge ohne Treffer in der offiziellen Datenbank (meist Spielmarken):<br>${state.unmatched.map(u => esc(u.raw)).join('<br>')}</div>` : '';
  return `
    <h2>Sammlung importieren</h2>
    <p class="sub">${first ? 'Leg los: exportiere deine Sammlung aus deiner Scanner-App und füge sie hier ein.' : 'Ersetzt die aktuelle Sammlung.'}
       Erwartetes Format – eine Karte pro Zeile:</p>
    <div class="card">
      <pre style="margin:0 0 14px;color:var(--dim);font-size:12.5px">2 Onslaught (VEN) #081
1 Sett - Kingpin (alt) (OGN) #240a *F*
16 Calm Rune (VEN) #R02</pre>
      <textarea id="importText" placeholder="Sammlung hier einfügen…"></textarea>
      <div class="row" style="margin-top:12px">
        <button class="btn primary" id="doImport">Sammlung laden</button>
        <label class="btn">Datei wählen<input type="file" id="importFile" accept=".txt,.csv,text/plain" hidden></label>
        ${state.entries.length ? '<button class="btn" id="clearColl">Sammlung löschen</button>' : ''}
      </div>
      ${errs}${un}
    </div>
    <h3>Datenstand</h3>
    <p class="sub">${state.db.count} Karten aus ${state.db.sets.join(', ')} · Quelle: ${esc(state.db.source)} ·
       aktualisiert ${new Date(state.db.updated).toLocaleDateString('de-DE')}</p>`;
}

/* --- Sammlung --- */
function viewSammlung() {
  const f = state.filter;
  const owned = [...state.inv.owned.values()];
  const hit = owned.filter(o => {
    const c = o.card;
    return (!f.q || cname(c).toLowerCase().includes(f.q.toLowerCase()) || (c.text ?? '').toLowerCase().includes(f.q.toLowerCase()))
      && (!f.set || c.set === f.set) && (!f.domain || (c.domains ?? []).includes(f.domain))
      && (!f.type || c.type === f.type) && (!f.rarity || c.rarity === f.rarity);
  }).sort((a, b) => a.card.set.localeCompare(b.card.set) || (a.card.num ?? 0) - (b.card.num ?? 0));

  const total = state.entries.reduce((s, e) => s + e.qty, 0);
  const foils = state.entries.filter(e => e.foil).reduce((s, e) => s + e.qty, 0);
  const byType = t => owned.filter(o => o.card.type === t).length;

  return `
    <h2>Meine Sammlung</h2>
    <p class="sub">Zusammengefasst nach Kartenname – Foils, Alt-Arts und Nachdrucke zählen als dieselbe Karte.</p>
    <div class="grid-stats">
      ${kpi(total, 'Karten gesamt')}${kpi(state.inv.owned.size, 'verschiedene')}
      ${kpi(foils, 'Foils')}${kpi(byType('legend'), 'Legenden')}
      ${kpi(byType('unit'), 'Einheiten')}${kpi(byType('battlefield'), 'Schlachtfelder')}
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="row">
        <input type="search" id="fq" placeholder="Name oder Kartentext suchen…" value="${esc(f.q)}" style="flex:2;min-width:180px">
        ${sel('fset', 'Alle Sets', state.db.sets, f.set)}
        ${sel('fdomain', 'Alle Domains', DOMAINS, f.domain)}
        ${sel('ftype', 'Alle Typen', ['legend', 'unit', 'spell', 'gear', 'battlefield', 'rune'], f.type)}
        ${sel('frarity', 'Alle Seltenheiten', ['common', 'uncommon', 'rare', 'epic', 'legendary'], f.rarity)}
      </div>
    </div>
    <p class="sub">${hit.length} Karten</p>
    <div class="cards">${hit.map(o => tile(o.card, o.qty)).join('')}</div>`;
}

const kpi = (n, l) => `<div class="kpi"><div class="n">${n}</div><div class="l">${l}</div></div>`;
const sel = (id, label, opts, val) =>
  `<select id="${id}" style="width:auto;min-width:130px"><option value="">${label}</option>` +
  opts.map(o => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('') + '</select>';

function tile(c, qty, missing = false) {
  return `<div class="tile ${missing ? 'miss' : ''}" data-card="${esc(c.id)}">
    <img loading="lazy" src="${img(c)}" alt="${esc(cname(c))}">
    <span class="qty">${missing ? '−' : ''}${qty}</span>
    <div class="nm">${dots(c.domains)} ${esc(cname(c))}</div></div>`;
}

/* --- Decks --- */
/** Filter und Sortierung der Deckliste – gemerkt pro Gerät. */
const DECK_FILTERS = [
  ['alle', 'Alle'],
  ['komplett', 'Komplett spielbar'],
  ['turnier', 'Mit Turnierliste'],
  ['turnier-nah', 'Nah an Turnierliste (≥ 75 % besessen)'],
  ['ohne', 'Ohne Turnierliste'],
  ['leicht', 'Schwierigkeit: Einsteiger'],
  ['mittel', 'Schwierigkeit: Mittel'],
  ['schwer', 'Schwierigkeit: Fortgeschritten'],
];
const DECK_SORTS = [
  ['bewertung', 'Bewertung'],
  ['turnier', 'Nähe zur Turnierliste'],
  ['besitz', 'Anteil Turnierkarten im Besitz'],
  ['staerke', 'Stärke der Karten'],
  ['schwierigkeit', 'Schwierigkeit (leicht zuerst)'],
  ['name', 'Name'],
];
const DECK_FILTER_FN = {
  alle: () => true,
  komplett: d => d.complete,
  turnier: d => !!d.metaRef,
  'turnier-nah': d => (d.metaRef?.owned ?? 0) >= 0.75,
  ohne: d => !d.metaRef,
  leicht: d => d.difficulty.level === 0,
  mittel: d => d.difficulty.level === 1,
  schwer: d => d.difficulty.level === 2,
};
// Einsteiger-Modus: leichte Decks rücken in der Bewertung etwas nach vorn,
// schwere etwas nach hinten – ausgeblendet wird nichts.
const beginnerBonus = d => (deckView().beginner ? (1 - d.difficulty.level) * 1.2 : 0);
const DECK_SORT_FN = {
  bewertung: (a, b) => (b.rating + beginnerBonus(b)) - (a.rating + beginnerBonus(a)),
  schwierigkeit: (a, b) => a.difficulty.score - b.difficulty.score || b.rating - a.rating,
  turnier: (a, b) => (b.metaRef?.coverage ?? -1) - (a.metaRef?.coverage ?? -1) || b.rating - a.rating,
  besitz: (a, b) => (b.metaRef?.owned ?? -1) - (a.metaRef?.owned ?? -1) || b.rating - a.rating,
  staerke: (a, b) => b.score - a.score,
  name: (a, b) => (a.champion ?? a.legend.name).localeCompare(b.champion ?? b.legend.name),
};
const deckView = () => ({ filter: 'alle', sort: 'bewertung', beginner: false, ...read(KEY.deckView, {}) });
const DIFF_CLS = ['ok', 'warn', 'bad'];
const diffBadge = d => `<span class="badge ${DIFF_CLS[d.difficulty.level]}" title="Schwierigkeit ${num(d.difficulty.score)}/10">${esc(d.difficulty.label)}</span>`;
const num = x => (Math.round(x * 10) / 10).toString().replace('.', ',');

function viewDecks() {
  const list = decks();
  if (state.deckIdx != null && list[state.deckIdx]) return viewDeckDetail(list[state.deckIdx]);
  if (!list.length) return `<h2>Decks</h2><div class="empty">Keine Legende in der Sammlung – ohne Legende lässt sich kein Deck bauen.</div>`;

  const v = deckView();
  // Indizes beziehen sich immer auf die ungefilterte Liste – die Detailansicht greift darüber zu.
  const best = list.findIndex(d => d.complete);
  const shown = list.map((d, i) => ({ d, i }))
    .filter(x => (DECK_FILTER_FN[v.filter] ?? DECK_FILTER_FN.alle)(x.d))
    .sort((x, y) => (y.d.complete - x.d.complete) || (DECK_SORT_FN[v.sort] ?? DECK_SORT_FN.bewertung)(x.d, y.d));
  const opts = (items, cur) => items.map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('');

  return `
    <h2>Deine besten Decks</h2>
    <p class="sub"><b>Ausschließlich aus Karten, die du besitzt</b> – nichts muss nachgekauft werden. Turnierlisten dienen als
       Vorbild; fehlt dir eine Turnierkarte, nimmt das Deck eine eigene Karte mit ähnlicher Rolle.</p>
    <div class="card" style="margin-bottom:14px">
      <div class="row">
        <label style="flex:1;min-width:160px;font-size:12px;color:var(--dim)">Filter
          <select id="deckFilter">${opts(DECK_FILTERS, v.filter)}</select></label>
        <label style="flex:1;min-width:160px;font-size:12px;color:var(--dim)">Sortieren nach
          <select id="deckSort">${opts(DECK_SORTS, v.sort)}</select></label>
      </div>
      <label style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:13px;color:var(--dim)">
        <input type="checkbox" id="deckBeginner" style="width:auto;flex:none;margin-top:2px" ${v.beginner ? 'checked' : ''}>
        Ich bin Einsteiger – leichte Decks bei „Bewertung" etwas weiter nach vorn
      </label>
      <p class="sub" style="margin:10px 0 0;font-size:12px"><b>Bewertung</b> = Stärke der Karten im Zusammenspiel (Motor der Legende,
        erfüllte Bedingungen, Kurve) + Bonus für den umgesetzten Teil der Turnierliste. <b>Schwierigkeit</b> = wie viel das
        Deck vom Spieler verlangt (Timing, Bedingungen, Legenden-Motor) – sie fließt nicht in die Bewertung ein. <b>Turnierliste %</b> = wie viel
        der Profi-Liste dein Deck enthält. <b>Besitz %</b> = wie viel der Profi-Liste du überhaupt hast.
        Regeln: 40 Karten, 12 Runen, 3 Schlachtfelder, max. 3 Kopien ([Unique] 1), Champion Pflicht, max. 3 Signature,
        Bannliste Stand ${new Date(BANNED_AS_OF).toLocaleDateString('de-DE')}.</p>
    </div>
    <p class="sub">${shown.length} von ${list.length} Decks</p>
    <div class="decklist">${shown.map(({ d, i }) => `
      <button class="deckcard" data-deck="${i}" ${i === best ? 'style="border-color:var(--accent)"' : ''}>
        ${i === best ? '<div class="m" style="color:var(--accent);font-weight:700;margin-bottom:6px">★ Dein stärkstes Deck</div>' : ''}
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div><div class="t">${esc(d.champion ?? d.legend.name)}</div>
            <div class="m">${d.champion ? esc(d.legend.name) + ' · ' : ''}${dots(d.identity)} ${d.identity.join(' + ')}</div></div>
          <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
            <span class="badge ${d.complete ? 'ok' : 'warn'}">${d.complete ? 'komplett' : 'unvollständig'}</span>
            ${diffBadge(d)}
            ${d.metaRef ? `<span class="badge ${d.metaRef.coverage >= 0.75 ? 'ok' : d.metaRef.coverage >= 0.5 ? 'warn' : 'bad'}">Turnierliste ${pct(d.metaRef.coverage, 1)}%</span>`
              : '<span class="badge bad">ohne Turnierliste</span>'}
          </div>
        </div>
        <div class="m" style="margin-top:10px">
          Bewertung <b style="color:var(--accent)">${num(d.rating)}</b> · Stärke ${num(d.score)}
          ${d.metaRef ? ` · Besitz ${pct(d.metaRef.owned, 1)}%` : ''} ·
          Ø ${d.avgEnergy} Energie · ${d.counts.main}/40
        </div>
        <div class="bar-track"><div class="bar-fill ${d.metaRef ? (d.metaRef.coverage >= 0.75 ? '' : 'warn') : 'bad'}" style="width:${d.metaRef ? pct(d.metaRef.coverage, 1) : 100}%"></div></div>
      </button>`).join('') || '<div class="empty">Kein Deck passt zu diesem Filter.</div>'}</div>`;
}

function viewDeckDetail(d) {
  const maxCurve = Math.max(...Object.values(d.curve), 1);
  const curve = [1, 2, 3, 4, 5, 6].map(b =>
    `<div style="height:${(d.curve[b] ?? 0) / maxCurve * 100}%"><span>${d.curve[b] ?? 0}</span><i>${b === 6 ? '6+' : b}</i></div>`).join('');

  return `
    <div class="row" style="margin-bottom:14px"><button class="btn sm" id="backDecks">← Alle Decks</button></div>
    <h2>${esc(deckTitle(d))} <span class="badge ${d.complete ? 'ok' : 'warn'}">${d.complete ? 'komplett spielbar' : 'unvollständig'}</span></h2>
    <p class="sub">${dots(d.identity)} ${d.identity.join(' + ')} · Bewertung ${(Math.round(d.rating * 10) / 10).toString().replace('.', ',')} (Stärke ${String(d.score).replace('.', ',')}) · Ø ${d.avgEnergy} Energie · nur Karten aus deinem Bestand
      ${d.complete ? '' : ` · es fehlen ${d.missingSlots.main} Hauptdeck-, ${d.missingSlots.runes} Runen- und ${d.missingSlots.battlefields} Schlachtfeldkarten`}
      ${d.hasChampion ? '' : ` · <b>keine Champion-Einheit von ${esc(d.champion)} im Bestand</b> (Pflicht)`}
      ${d.metaRef ? ` · setzt ${pct(d.metaRef.coverage, 1)}% der Turnierliste um` : ''}</p>

    ${pinButtons(d)}
    ${d.metaRef && d.metaRef.owned < 0.7 ? `<div class="notice" style="margin-bottom:16px"><b>Nur ${pct(d.metaRef.owned, 1)}% der
      Turnierliste im Besitz.</b> Das Deck folgt der Liste, so weit deine Karten reichen, und ersetzt den Rest durch Karten mit
      ähnlicher Rolle. Gegen echte Turnierdecks fehlt ihm aber die Kernausstattung – wichtigste fehlende Karten:
      ${d.metaRef.missing.slice(0, 5).map(x => `${x.missing}× ${esc(cname(x.card))}`).join(', ')}. Vollständig unter „Weg zur Turnierliste".</div>` : ''}
    ${d.metaRef ? '' : `<div class="notice" style="margin-bottom:16px"><b>Ohne Turnierliste gebaut.</b> Für diese Legende liegt keine
      Profi-Liste vor – das Deck folgt nur den Kartentexten (Regeln, Motor, Bedingungen). Spielbar, aber nicht turniererprobt.
      Mit einer eingefügten Turnierliste (Tab „Meta-Decks“) wählt die App aus deinen Karten gezielter aus.</div>`}
    ${difficultyBlock(d)}
    ${guideBlock(d)}
    ${deckKeywords(d)}

    <div class="cols">
      <div>
        <h3>Hauptdeck · ${d.counts.main}/40</h3>
        ${groupByDomain(d).map(g => `<h4 class="domhead">${g.domains.map(x => `<span class="dom ${x}"></span>`).join('')} ${esc(g.label)} · ${g.count}</h4>
        <div class="lines">${g.cards.map(m => lineRow(m.count, m.card, null, (m.why ?? []).filter(w => w.ok === false).map(w => w.text))).join('')}</div>`).join('')}
        <h3>Energiekurve</h3>
        <div class="curve">${curve}</div>
      </div>
      <div>
        <h3>Legende</h3><div class="lines">${lineRow(1, d.legend, deckTitle(d))}</div>
        <h3>Runen · ${d.counts.runes}/12</h3>
        <div class="lines">${d.runes.map(m => lineRow(m.count, m.card)).join('')}</div>
        <h3>Schlachtfelder · ${d.counts.battlefields}/3</h3>
        <div class="lines">${d.battlefields.map(m => lineRow(1, m.card)).join('')}</div>
        ${pathBlock(d)}
        <div class="row" style="margin-top:14px">
          <button class="btn primary" id="copyArena">Für TCG Arena kopieren</button>
          <button class="btn" id="copyDeck">Deckliste kopieren (mit Set-Nummern)</button>
        </div>
      </div>
    </div>`;
}

/** Schwierigkeit mit Begründung und Hinweis für Einsteiger. */
function difficultyBlock(d) {
  const x = d.difficulty;
  const hint = [
    'Gut zum Lernen: Die Karten tun, was draufsteht, und verlangen wenig Timing.',
    'Braucht etwas Übung: Einige Karten wollen im richtigen Moment gespielt werden.',
    'Anspruchsvoll: Viele Entscheidungen pro Zug. Spiel es ein paar Mal locker, bevor du damit ins Turnier gehst – und lies vorher die Schlüsselwörter unten.',
  ][x.level];
  return `<div class="card" style="margin-bottom:16px">
    <div class="row" style="gap:10px"><h3 style="margin:0">Schwierigkeit</h3>${diffBadge(d)}
      <span class="sub" style="margin:0">${num(x.score)} von 10</span></div>
    <p style="margin:10px 0 6px">${esc(hint)}</p>
    <p class="sub" style="margin:0">Grund: ${esc(x.reasons.join(' · '))}${x.community ? ` · ${esc(x.community)}` : ''}</p>
  </div>`;
}

/** Schlüsselwörter, die in diesem Deck vorkommen – zum schnellen Nachlesen am Tisch. */
function deckKeywords(d) {
  const kws = keywordsIn([d.legend, ...d.main.map(m => m.card)]);
  if (!kws.length) return '';
  return `<details class="card" style="margin-bottom:24px">
    <summary><h3 style="display:inline">Schlüsselwörter in diesem Deck (${kws.length})</h3></summary>
    <div class="lines" style="margin-top:12px">${kws.map(kwRow).join('')}</div>
    <p class="sub" style="margin:10px 0 0">Zugablauf, Symbole und Kampfregeln: Tab „Regeln".</p>
  </details>`;
}

/**
 * Ausbauziel: Was fehlt dir zur Turnierliste dieser Legende? Das Deck oben
 * ist davon unabhängig – es ist schon jetzt komplett aus deinem Bestand.
 */
function pathBlock(d) {
  const m = d.metaRef;
  if (!m) return '';
  return `<div class="wishbox">
    <h3 class="wishhead">Weg zur Turnierliste</h3>
    <p class="sub" style="margin:0 0 10px">Ausbauziel, kein Muss: Dein Deck oben ist schon spielbar. Vorbild ist
      <b>${esc(m.name)}</b> – davon besitzt du ${pct(m.owned, 1)}%${m.missing.length ? `, es fehlen ${m.missing.reduce((s, x) => s + x.missing, 0)} Karten` : ''}.</p>
    <div class="lines">${m.missing.map(x => `<div class="line missing"${cv(x.card)}><span class="c">fehlt ${x.missing}×</span>
      <span class="n">${esc(cname(x.card))}</span><span class="e">${ident(x.card)} · du hast ${x.have}</span></div>`).join('')
      || '<div class="line">Du besitzt alle Karten dieser Liste.</div>'}</div>
  </div>`;
}

/* --- Meine Decks (angepinnt) --- */
const PIN_LABEL = { spiele: 'Spiele ich', baue: 'Baue ich' };
const pins = () => read(KEY.pins, []);
const pinOf = legendKey => pins().find(p => p.legendKey === legendKey);
const pinCard = k => state.db.byName.get(k);

/**
 * Momentaufnahme eines Decks. Angepinnte Decks ändern sich NICHT mehr von
 * selbst – ein Deck, das du gebaut hast, soll nicht nach einem Sammlungs- oder
 * Meta-Update still anders aussehen. Neuere Versionen werden nur angezeigt.
 */
function snapshot(d, status) {
  return {
    id: key(d.legend), legendKey: key(d.legend), title: deckTitle(d), status, savedAt: Date.now(),
    identity: d.identity,
    main: d.main.map(m => [key(m.card), m.count]),
    runes: d.runes.map(r => [key(r.card), r.count]),
    battlefields: d.battlefields.map(b => key(b.card)),
  };
}
const sig = list => list.map(([k, n]) => k + n).sort().join();
const currentDeck = legendKey => decks().find(d => key(d.legend) === legendKey);
const isOutdated = p => { const d = currentDeck(p.legendKey); return d && sig(p.main) !== sig(d.main.map(m => [key(m.card), m.count])); };

function pinButtons(d) {
  const p = pinOf(key(d.legend));
  const btn = (status, label) => `<button class="btn sm ${p?.status === status ? 'primary' : ''}" data-pin="${status}">${label}</button>`;
  return `<div class="row" style="margin:0 0 16px;gap:8px">
    ${btn('spiele', '📌 Spiele ich')} ${btn('baue', '🔧 Baue ich')}
    ${p ? `<button class="btn sm" data-unpin="${esc(p.legendKey)}">Nicht mehr anpinnen</button>
      ${isOutdated(p) ? '<button class="btn sm" data-pinupdate="' + esc(p.legendKey) + '">Gespeicherte Version aktualisieren</button>' : ''}` : ''}
    ${p ? `<span class="sub" style="margin:0">Gespeichert in „Meine Decks“${isOutdated(p) ? ' – diese Ansicht ist neuer als deine gespeicherte Version' : ''}</span>` : ''}
  </div>`;
}

/** Wer braucht welche Karte wie oft? Über Hauptdeck, Runen und Schlachtfelder. */
function usage(list) {
  const use = new Map();
  const add = (p, k, n, kind) => {
    const u = use.get(k) ?? { k, kind, per: [], total: 0 };
    u.per.push({ p, n }); u.total += n; use.set(k, u);
  };
  for (const p of list) {
    p.main.forEach(([k, n]) => add(p, k, n, 'main'));
    p.runes.forEach(([k, n]) => add(p, k, n, 'rune'));
    p.battlefields.forEach(k => add(p, k, 1, 'bf'));
  }
  return [...use.values()];
}
const ownedQty = k => state.inv.owned.get(k)?.qty ?? 0;

function viewMeine() {
  const list = pins();
  if (!list.length) return `<h2>Meine Decks</h2>
    <div class="empty">Noch kein Deck angepinnt. Öffne im Tab „Decks“ ein Deck und tippe auf
      <b>📌 Spiele ich</b> oder <b>🔧 Baue ich</b>.</div>`;

  const shared = usage(list).filter(u => u.per.length > 1);
  const conflict = shared.filter(u => u.total > ownedQty(u.k)).sort((a, b) => (b.total - ownedQty(b.k)) - (a.total - ownedQty(a.k)));
  const fine = shared.filter(u => u.total <= ownedQty(u.k));
  const kindLabel = { main: '', rune: ' (Rune)', bf: ' (Schlachtfeld)' };
  const row = (u, bad) => {
    const c = pinCard(u.k);
    return `<div class="line ${bad ? 'missing' : ''}" style="display:block"${cv(c)}>
      <b>${esc(c ? cname(c) : u.k)}</b>${kindLabel[u.kind]}
      <span class="e">${c ? ident(c) : ''}</span><br>
      <span class="sub" style="margin:0">${u.per.map(x => `${esc(x.p.title.split(' – ')[0])} ${x.n}×`).join(' · ')}
        · du hast ${ownedQty(u.k)}${bad ? ` · <b style="color:var(--bad)">${u.total - ownedQty(u.k)} zu wenig – beim Wechsel umstecken</b>` : ''}</span>
    </div>`;
  };

  const opts = sel => list.map(p => `<option value="${esc(p.legendKey)}" ${p.legendKey === sel ? 'selected' : ''}>${esc(p.title)}</option>`).join('');
  const sw = state.swap;
  const from = list.find(p => p.legendKey === sw.from), to = list.find(p => p.legendKey === sw.to);

  return `
    <h2>Meine Decks</h2>
    <p class="sub">Decks, die du gerade spielst oder baust. Gespeichert ist jeweils die Liste vom Zeitpunkt des Anpinnens –
      sie ändert sich nicht von selbst.</p>
    <div class="decklist">${list.map(p => {
      const n = p.main.reduce((s, [, c]) => s + c, 0);
      const open = state.pinOpen === p.legendKey;
      return `<div class="deckcard" style="cursor:default">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div><div class="t">${esc(p.title)}</div>
            <div class="m">${dots(p.identity)} ${n} Karten · gespeichert ${new Date(p.savedAt).toLocaleDateString('de-DE')}</div></div>
          <span class="badge ${p.status === 'spiele' ? 'ok' : 'warn'}">${PIN_LABEL[p.status]}</span>
        </div>
        ${isOutdated(p) ? '<div class="m" style="margin-top:8px;color:var(--warn)">Es gibt eine neuere Version dieses Decks (Sammlung oder Turnierdaten haben sich geändert).</div>' : ''}
        <div class="row" style="margin-top:10px;gap:6px">
          <button class="btn sm" data-pinopen="${esc(p.legendKey)}">${open ? 'Liste ausblenden' : 'Liste ansehen'}</button>
          <button class="btn sm" data-pinstatus="${esc(p.legendKey)}">${p.status === 'spiele' ? '→ Baue ich' : '→ Spiele ich'}</button>
          ${isOutdated(p) ? `<button class="btn sm" data-pinupdate="${esc(p.legendKey)}">Aktualisieren</button>` : ''}
          <button class="btn sm" data-pinarena="${esc(p.legendKey)}">Für TCG Arena kopieren</button>
          <button class="btn sm" data-unpin="${esc(p.legendKey)}">Entfernen</button>
        </div>
        ${open ? pinList(p) : ''}
      </div>`;
    }).join('')}</div>

    ${list.length > 1 ? `
    <h3>Überschneidungen</h3>
    <p class="sub">Karten, die mehrere deiner Decks brauchen. Rot: Deine Kopien reichen nicht für alle gleichzeitig –
      diese Karten musst du beim Wechsel umstecken.</p>
    ${conflict.length ? `<h4 style="color:var(--bad)">Umstecken nötig · ${conflict.length} Karten</h4>
      <div class="lines">${conflict.map(u => row(u, true)).join('')}</div>` : '<div class="notice">Keine Engpässe – alle Decks lassen sich gleichzeitig gebaut halten.</div>'}
    ${fine.length ? `<h4>Geteilt, aber genug Kopien · ${fine.length} Karten</h4>
      <div class="lines">${fine.map(u => row(u, false)).join('')}</div>` : ''}

    <h3>Deck wechseln</h3>
    <p class="sub">Welche Karten musst du aus einem Deck nehmen, um ein anderes zu bauen? Angenommen wird, dass alle
      anderen angepinnten Decks gebaut bleiben.</p>
    <div class="card"><div class="row">
      <label style="flex:1;min-width:150px;font-size:12px;color:var(--dim)">Von<select id="swapFrom"><option value="">–</option>${opts(sw.from)}</select></label>
      <label style="flex:1;min-width:150px;font-size:12px;color:var(--dim)">Zu<select id="swapTo"><option value="">–</option>${opts(sw.to)}</select></label>
    </div>${from && to && from !== to ? swapPlan(from, to, list) : ''}</div>` : ''}`;
}

/** Angepinnte Momentaufnahme zurück in Deck-Form (für den Export). */
function pinAsDeck(p) {
  const legend = pinCard(p.legendKey);
  const rows = list => list.map(([k, count]) => ({ card: pinCard(k), count })).filter(m => m.card);
  return {
    legend, champion: championOf(legend, state.db.cards), identity: p.identity,
    main: rows(p.main), runes: rows(p.runes),
    battlefields: p.battlefields.map(k => ({ card: pinCard(k), count: 1 })).filter(m => m.card),
  };
}

/** Gespeicherte Liste eines angepinnten Decks, nach Farbe gruppiert. */
function pinList(p) {
  const main = p.main.map(([k, count]) => ({ card: pinCard(k), count })).filter(m => m.card);
  const groups = groupByDomain({ main, identity: p.identity });
  const rows = (arr) => arr.map(m => lineRow(m.count, m.card)).join('');
  return `<div style="margin-top:12px">
    ${groups.map(g => `<h4 class="domhead">${g.domains.map(x => `<span class="dom ${x}"></span>`).join('')} ${esc(g.label)} · ${g.count}</h4>
      <div class="lines">${rows(g.cards)}</div>`).join('')}
    <h4 class="domhead">Runen</h4><div class="lines">${rows(p.runes.map(([k, count]) => ({ card: pinCard(k), count })).filter(m => m.card))}</div>
    <h4 class="domhead">Schlachtfelder</h4><div class="lines">${rows(p.battlefields.map(k => ({ card: pinCard(k), count: 1 })).filter(m => m.card))}</div>
  </div>`;
}

/**
 * Wechsel von A nach B: B wird neu gebaut, alle übrigen angepinnten Decks
 * (außer A) bleiben stehen. Was B dann noch fehlt, kommt aus A.
 */
function swapPlan(from, to, list) {
  const others = list.filter(p => p !== from && p !== to);
  const held = k => others.reduce((s, p) => s + (p.main.find(([x]) => x === k)?.[1] ?? 0)
    + (p.runes.find(([x]) => x === k)?.[1] ?? 0) + (p.battlefields.includes(k) ? 1 : 0), 0);
  const inFrom = k => (from.main.find(([x]) => x === k)?.[1] ?? 0) + (from.runes.find(([x]) => x === k)?.[1] ?? 0)
    + (from.battlefields.includes(k) ? 1 : 0);
  const need = [...to.main, ...to.runes, ...to.battlefields.map(k => [k, 1])];
  const move = [], blocked = [];
  for (const [k, n] of need) {
    const free = Math.max(0, ownedQty(k) - held(k) - inFrom(k));
    const short = n - free;
    if (short <= 0) continue;
    const take = Math.min(short, inFrom(k));
    // Mehr Decks brauchen die Karte, als du Exemplare hast: Wo sie gerade
    // physisch steckt, weiß die App nicht – dann ehrlich darauf hinweisen.
    const unsure = held(k) > 0 && held(k) + inFrom(k) > ownedQty(k);
    if (take > 0) move.push({ k, n: take, unsure });
    if (short > take) blocked.push({ k, n: short - take });
  }
  const line = (x, txt) => { const c = pinCard(x.k); return `<div class="line"${cv(c)}><span class="c">${x.n}×</span>
    <span class="n">${esc(c ? cname(c) : x.k)}${txt ? ` <small class="warn">${txt}</small>` : ''}</span><span class="e">${c ? ident(c) : ''}</span></div>`; };
  return `<h4>Aus „${esc(from.title)}“ herausnehmen → in „${esc(to.title)}“</h4>
    <div class="lines">${move.map(x => line(x, x.unsure ? 'oder aus dem Deck, in dem sie gerade steckt' : '')).join('') || '<div class="line">Nichts – alle Karten sind frei verfügbar.</div>'}</div>
    ${blocked.length ? `<h4 style="color:var(--bad)">Steckt in anderen angepinnten Decks</h4>
      <div class="lines">${blocked.map(x => line(x, 'aus einem anderen Deck holen')).join('')}</div>` : ''}`;
}

/* --- Kartenansicht --- */
/** Großes Kartenbild mit Text – per Tipp auf eine Kartenzeile oder Kachel. */
function showCard(c) {
  closeCard();
  const own = state.inv?.owned.get((c.fullName ?? c.name).toLowerCase())?.qty ?? 0;
  const el = document.createElement('div');
  el.id = 'cardModal';
  el.innerHTML = `<div class="cm-box" role="dialog" aria-label="${esc(cname(c))}">
    <button class="cm-close" id="cardClose" aria-label="Schließen">×</button>
    ${c.img ? `<img src="${img(c, 640)}" alt="${esc(cname(c))}">` : ''}
    <div class="cm-info">
      <b>${esc(cname(c))}</b>
      <div class="e">${ident(c)}${c.might != null ? ` · ${c.might} Might` : ''} · ${esc(c.type)} · ${esc(c.rarity)}</div>
      <div class="e">Du besitzt ${own}×</div>
      ${c.text ? `<p class="cm-text">${esc(c.text)}</p>` : ''}
    </div></div>`;
  document.body.appendChild(el);
}
function closeCard() { document.getElementById('cardModal')?.remove(); }

/* --- Spielhilfe --- */
function guideBlock(d) {
  const g = buildGuide(d);
  const mini = (c, n) => `<div class="minicard"${cv(c)}><img loading="lazy" src="${img(c, 220)}" alt="${esc(cname(c))}">
    <span class="qty">${n}</span><div class="nm">${esc(cname(c))}</div></div>`;
  const list = (items, cls) => items.length
    ? `<ul class="${cls}">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';

  return `<div class="card guide">
    <div class="row" style="gap:10px;margin-bottom:10px">
      <h3 style="margin:0">So spielst du das Deck</h3>
      <span class="badge ok">${esc(g.archetype.name)}</span>
    </div>
    <p style="margin:0 0 14px">${esc(g.archetype.text)}</p>
    ${list(g.plan, 'plan')}

    <h4>Schlüsselkarten</h4>
    <p class="sub" style="margin:0 0 10px">Darauf läuft das Deck hinaus – diese Karten willst du ausspielen und schützen.</p>
    <div class="minicards">${g.keyCards.map(k => mini(k.card, k.count)).join('')}</div>
    <div class="lines" style="margin-top:10px">${g.keyCards.map(k => `<div class="line" style="display:block"${cv(k.card)}>
      <b>${esc(cname(k.card))}</b><br><span class="e">${esc(k.why)}</span></div>`).join('')}</div>

    <h4>Bedingungen im Deck</h4>
    <p class="sub" style="margin:0 0 10px">Karten, deren Text etwas voraussetzt – und ob dieses Deck es liefert.</p>
    <div class="lines">${g.checks.map(c => `<div class="line ${c.ok ? '' : 'missing'}" style="display:block"${cv(c.card)}>
      <b>${c.ok ? '✓' : '✗'} ${c.count}× ${esc(cname(c.card))}</b><br><span class="e">${esc(c.text)}</span></div>`).join('')
      || '<div class="line">Keine Karte im Deck stellt Bedingungen.</div>'}</div>

    <h4>Startblatt</h4>
    <p class="sub" style="margin:0 0 10px">Günstige starke Karten, auf die du beim Mulligan hoffst.</p>
    <div class="lines">${g.mulligan.map(m => lineRow(m.count, m.card)).join('')}</div>

    <div class="cols" style="margin-top:20px">
      <div><h4 style="margin-top:0">Stärken</h4>${list(g.strengths, 'good') || '<p class="sub">Nichts, was heraussticht.</p>'}</div>
      <div><h4 style="margin-top:0">Schwächen</h4>${list(g.weaknesses, 'bad') || '<p class="sub">Keine auffälligen Lücken.</p>'}</div>
    </div>

    <h4>Was deine Legende macht</h4>
    <div class="lines"><div class="line" style="display:block">
      <b>${esc(deckTitle(d))}</b><br><span class="e">${esc(d.legend.text || 'Kein Fähigkeitstext hinterlegt.')}</span>
    </div></div>

    <h4>Deine Schlachtfelder</h4>
    <div class="lines">${d.battlefields.map(b => `<div class="line" style="display:block"${cv(b.card)}>
      <b>${esc(cname(b.card))}</b><br><span class="e">${esc(b.card.text || '–')}</span></div>`).join('')}</div>

    <p class="sub" style="margin:16px 0 0;font-size:12px">Aus den Kartentexten abgeleitet: Motor der Legende, Bedingungen und
      Zusatzkosten jeder Karte, Kurve, Kartentypen und Domains.
      ${d.metaDecks ? `Dazu ${d.metaDecks} gespeicherte Meta-Deck${d.metaDecks === 1 ? '' : 's'} dieser Legende.` : 'Mit gespeicherten Meta-Decks dieser Legende (Tab „Meta-Decks") wird der Deckbau genauer.'}</p>
  </div>`;
}

const lineRow = (n, c, label, warn = []) => `<div class="line"${cv(c)}><span class="c">${n}×</span><span class="n">${esc(label ?? cname(c))}
  ${warn.map(w => `<br><small class="warn">⚠ ${esc(w)}</small>`).join('')}</span>
  <span class="e">${ident(c)}</span></div>`;

/* --- Meta-Decks --- */
function analyzeDeck(text) {
  // Nur Hauptdeck (inkl. Champion) zählen – Legende, Runen und Schlachtfelder
  // stehen in Deckseiten-Listen mit drin, gehören aber nicht zu den 40.
  const { entries: all } = parseDeckList(text);
  const entries = all.filter(e => {
    const c = resolve(state.db, e);
    return !c || ['unit', 'spell', 'gear'].includes(c.type);
  });
  const rows = entries.map(e => {
    const found = resolve(state.db, e);
    const card = found ? (state.db.byName.get(key(found)) ?? found) : null;
    const have = card ? (state.inv.owned.get(key(card))?.qty ?? 0) : 0;
    return { need: e.qty, have: Math.min(have, e.qty), card, raw: e, missing: Math.max(0, e.qty - have) };
  });
  const need = rows.reduce((s, r) => s + r.need, 0);
  const have = rows.reduce((s, r) => s + r.have, 0);
  return { rows, need, have, missing: need - have, pct: pct(have, need) };
}

function viewMeta() {
  const saved = read(KEY.meta, []);
  const analyses = saved.map(d => ({ ...d, a: analyzeDeck(d.text) })).sort((x, y) => y.a.pct - x.a.pct);

  return `
    <h2>Meta-Decks</h2>
    <p class="sub">Eigene Turnierlisten hochladen: Deckliste von riftdecks.com, riftbound.gg, mobalytics, Piltover Archive,
       TCG Arena oder aus einem Turnierbericht einfügen oder als Textdatei wählen. Die App zeigt, wie weit du davon
       entfernt bist und welche Karten dir fehlen.
       <b>Enthält die Liste eine Legende, fließt sie in den Deckbau ein</b> – und zwar bevorzugt: Deine hochgeladene
       Liste wird zum Vorbild für diese Legende, vor den mitgelieferten Listen.</p>
    <div class="card" style="margin-bottom:20px">
      <h3 style="margin-top:0">Turnierliste hinzufügen</h3>
      <p class="sub" style="margin:0 0 10px;font-size:12px">Erkannt werden u. a. „3 Defy“, „3x Defy“, „Defy x3“,
        „2 Onslaught (VEN) #081“ und Abschnitte wie „Legend:“, „Champion:“, „MainDeck:“, „Battlefields:“, „Runes:“.
        Das Sideboard wird ignoriert. Ohne Namen benennt die App die Liste nach der Legende.</p>
      <div class="row" style="margin-bottom:10px">
        <input type="text" id="metaName" placeholder="Deckname, z. B. Kennen Tempest (Tier 1)" style="flex:1;min-width:200px">
      </div>
      <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px;font-size:13px;color:var(--dim)">
        <input type="checkbox" id="metaOwn" style="width:auto;flex:none;margin-top:2px"> Mein eigenes Deck – nur prüfen, nicht in den Deckbau einbeziehen
      </label>
      <textarea id="metaText" placeholder="Deckliste hier einfügen …"></textarea>
      <div class="row" style="margin-top:12px">
        <button class="btn primary" id="addMeta">Liste speichern &amp; auswerten</button>
        <label class="btn">Textdatei wählen<input type="file" id="metaFile" accept=".txt,.csv,.dek,text/plain" hidden></label>
      </div>
      ${state.metaNotice ? `<div class="notice" style="margin-top:12px">${state.metaNotice}</div>` : ''}
    </div>
    ${builtinBlock()}
    <h3>Eigene Listen</h3>
    ${analyses.length ? analyses.map((d, i) => {
      const cls = d.a.pct >= 95 ? 'ok' : d.a.pct >= 75 ? 'warn' : 'bad';
      const miss = d.a.rows.filter(r => r.missing > 0);
      return `<div class="card" style="margin-bottom:14px">
        <div class="row" style="justify-content:space-between">
          <div><b>${esc(d.name)}</b>
            <div class="m" style="font-size:12px;color:var(--dim)">${d.a.have}/${d.a.need} Karten vorhanden</div></div>
          <div class="row"><span class="badge ${cls}">${d.a.pct}%</span>
            <button class="btn sm" data-delmeta="${esc(d.id)}">löschen</button></div>
        </div>
        <div class="bar-track"><div class="bar-fill ${cls === 'ok' ? '' : cls}" style="width:${d.a.pct}%"></div></div>
        ${metaCheck(d.text, d.own)}
        ${miss.length ? `<h3>Dir fehlen ${d.a.missing} Karten</h3>
          <div class="lines">${miss.map(r => `<div class="line missing"${cv(r.card)}><span class="c">fehlt ${r.missing}×</span>
            <span class="n">${esc(r.card ? cname(r.card) : r.raw.rawName)}</span>
            <span class="e">${r.card ? ident(r.card) : 'unbekannte Karte'}</span></div>`).join('')}</div>`
          : '<div class="notice" style="margin-top:12px">Dieses Deck kannst du komplett bauen.</div>'}
      </div>`;
    }).join('') : '<div class="empty">Noch keine Meta-Decks gespeichert.</div>'}`;
}

/**
 * Mitgelieferte Turnierlisten: wie viel davon besitzt du? Sortiert nach
 * Vollständigkeit – das Profi-Deck, das du am ehesten bauen kannst, steht oben.
 */
function builtinBlock() {
  const list = builtinMeta().map(m => {
    const rows = [...m.cards].map(([k, need]) => {
      const card = state.db.byName.get(k);
      const have = Math.min(need, state.inv.owned.get(k)?.qty ?? 0);
      return { card, need, have, missing: need - have };
    });
    const legendOwned = state.inv.owned.has(m.legendKey);
    const need = rows.reduce((s, r) => s + r.need, 0), have = rows.reduce((s, r) => s + r.have, 0);
    return { m, rows, legendOwned, need, have, pct: pct(have, need) };
  }).sort((a, b) => b.legendOwned - a.legendOwned || b.pct - a.pct);
  if (!list.length) return '';
  return `<h3>Turnierlisten · Regional Qualifiers ${esc(state.meta.updated?.slice(0, 7) ?? '')}</h3>
    <p class="sub">${esc(state.meta.note ?? '')} Diese Listen fließen automatisch in den Deckbau der jeweiligen Legende ein.</p>
    ${list.map(x => {
      const b = x.m.builtin, cls = x.pct >= 95 ? 'ok' : x.pct >= 75 ? 'warn' : 'bad';
      const miss = x.rows.filter(r => r.missing > 0);
      return `<details class="card" style="margin-bottom:10px">
        <summary class="row" style="justify-content:space-between;cursor:pointer">
          <div><b>${esc(b.name)}</b>
            <div class="m" style="font-size:12px;color:var(--dim)">${esc(b.placement)} · ${esc(b.date)} · ${esc(b.source)} ·
              ${x.have}/${x.need} Karten vorhanden${x.legendOwned ? '' : ' · <b>Legende fehlt dir</b>'}</div></div>
          <span class="badge ${cls}">${x.pct}%</span>
        </summary>
        <div class="lines" style="margin-top:10px">${x.rows.map(r => `<div class="line ${r.missing ? 'missing' : ''}"${cv(r.card)}>
          <span class="c">${r.need}×</span><span class="n">${esc(cname(r.card))}${r.missing ? ` <small class="warn">fehlt ${r.missing}×</small>` : ''}</span>
          <span class="e">${ident(r.card)}</span></div>`).join('')}</div>
        ${miss.length ? '' : '<div class="notice" style="margin-top:10px">Alle gelisteten Karten vorhanden.</div>'}
      </details>`;
    }).join('')}`;
}

/** Deck-Check einer eingefügten Liste: unspielbare Karten, Motor der Legende. */
function metaCheck(text, own) {
  const { legend, main, battlefields } = parseMetaList(text);
  if (!legend) return `<p class="sub" style="margin:10px 0 0">Keine Legende in der Liste erkannt – für Deck-Check und Deckbau
    muss die Legende mit in der Liste stehen.</p>`;
  const r = checkDeck(legend, main, state.db.cards);
  const engine = r.engine.map(e => `<div class="line" style="display:block"><b>Motor: ${esc(e.text)}</b><br>
    <span class="e">${String(e.have).replace('.', ',')} im Deck (${esc(e.label)}) – ${e.sat >= 0.8 ? 'läuft zuverlässig' : e.sat >= 0.4 ? 'läuft teilweise' : 'zu wenig'}</span></div>`).join('');
  for (const b of battlefields) if (isBanned(b)) r.problems.push({ card: b, count: 1, text: 'Gebanntes Schlachtfeld – im Turnier (Standard) nicht erlaubt' });
  const probs = r.problems.map(p => `<div class="line missing" style="display:block"${cv(p.card)}><b>${p.count}× ${esc(cname(p.card))}</b><br>
    <span class="e">${esc(p.text)}</span></div>`).join('');
  return `<h3>Deck-Check · ${esc(legend.fullName ?? legend.name)} <span class="tag">${own ? 'nur geprüft' : 'fließt in den Deckbau ein'}</span></h3>
    <div class="lines">${engine}${probs || '<div class="line">Keine Karte mit unerfüllter Bedingung.</div>'}</div>`;
}

/* --- Regeln --- */
const kwRow = kw => `<div class="line kw" style="display:block" data-kw="${esc(kw.k.toLowerCase())}">
  <b>[${esc(kw.k)}]</b> <span class="e">${esc(kw.de)}</span>
  <div class="en">„${esc(kw.en)}" – z. B. ${esc(kw.card)}</div>
  ${kw.tip ? `<div class="tip">Tipp: ${esc(kw.tip)}</div>` : ''}</div>`;

function viewRegeln() {
  return `
    <h2>Regeln zum Nachschlagen</h2>
    <p class="sub">Zugablauf, Symbole, Kampf, Timing und alle Schlüsselwörter. Die englischen Texte sind die offiziellen
      Erinnerungstexte von den Karten, die Erklärungen und Tipps eigene Worte. Stand: Oktober 2026 (inkl. Set Radiance).</p>
    ${SECTIONS.map((sec, i) => `<details class="card rules-sec" ${i < 3 ? 'open' : ''}>
      <summary><h3 style="display:inline">${esc(sec.title)}</h3></summary>
      <div class="rules-body">${sec.html}</div></details>`).join('')}
    <details class="card rules-sec" open id="kwsec">
      <summary><h3 style="display:inline">Schlüsselwörter (${KEYWORDS.length})</h3></summary>
      <input type="search" id="kwq" placeholder="Schlüsselwort suchen, z. B. Hidden" style="margin:12px 0">
      <div class="lines" id="kwlist">${KEYWORDS.map(kwRow).join('')}</div>
    </details>`;
}

/* --- Wunschliste --- */
function viewWunsch() {
  // Ausbauziele: nur, was dir zu Turnierlisten fehlt. Deine Decks selbst
  // brauchen nichts davon – sie bestehen komplett aus deinem Bestand.
  const want = new Map();
  const add = (card, n, why) => {
    if (!card) return;
    const h = want.get(key(card)) ?? { card, n: 0, why: new Set() };
    h.n = Math.max(h.n, n); h.why.add(why); want.set(key(card), h);
  };
  const owned = new Set([...state.inv.owned.values()].filter(o => o.card.type === 'legend').map(o => key(o.card)));
  for (const m of metaDecks()) {
    // Nur Listen zu Legenden, die du hast – eine fehlende Legende ist kein Ausbau, sondern ein neues Deck.
    if (!owned.has(m.legendKey)) continue;
    const label = m.champion ?? m.name;
    for (const [k, need] of m.cards) {
      const card = state.db.byName.get(k);
      if (!card || isBanned(card)) continue;
      const have = state.inv.owned.get(k)?.qty ?? 0;
      if (have < need) add(card, need - have, label);
    }
  }

  const list = [...want.values()].sort((a, b) => b.why.size - a.why.size || b.n - a.n);
  const totalCards = list.reduce((s, x) => s + x.n, 0);

  return `
    <h2>Wunschliste</h2>
    <p class="sub">Ausbauziele: Karten, die dir zu Turnierlisten deiner Legenden fehlen. Deine Decks im Tab „Decks“
       brauchen davon nichts – das hier ist nur der Weg Richtung Profi-Liste. Karten, die mehrere Listen brauchen, stehen oben.</p>
    <div class="grid-stats">${kpi(list.length, 'verschiedene Karten')}${kpi(totalCards, 'Exemplare')}
      ${kpi(list.filter(x => x.why.size > 1).length, 'mehrfach gebraucht')}</div>
    ${list.length ? `<div class="lines">${list.map(x => `<div class="line missing"${cv(x.card)}>
        <span class="c">fehlt ${x.n}×</span><span class="n">${esc(cname(x.card))}
        <span class="tag" style="margin-left:6px">${[...x.why].slice(0, 3).map(esc).join(', ')}${x.why.size > 3 ? ' +' + (x.why.size - 3) : ''}</span></span>
        <span class="e">${ident(x.card)}</span></div>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn" id="copyWish">Als Liste kopieren</button></div>`
    : '<div class="empty">Nichts offen – oder für deine Legenden liegen keine Turnierlisten vor.</div>'}`;
}

/* --- Teilen / Freunde --- */
function viewTeilen() {
  const friends = read(KEY.friends, []);
  return `
    <h2>Teilen &amp; Freunde</h2>
    <p class="sub">Deine Sammlung als Datei exportieren und Sammlungen von Freunden gegenprüfen –
       alles bleibt lokal auf deinem Gerät, es wird nichts hochgeladen.</p>
    <div class="cols">
      <div class="card">
        <h3 style="margin-top:0">Meine Sammlung exportieren</h3>
        <div class="row">
          <button class="btn primary" id="dlColl">Als .txt herunterladen</button>
          <button class="btn" id="copyColl">In Zwischenablage</button>
        </div>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Sammlung eines Freundes hinzufügen</h3>
        <input type="text" id="friendName" placeholder="Name" style="margin-bottom:10px">
        <textarea id="friendText" placeholder="Sammlung des Freundes einfügen…" style="min-height:120px"></textarea>
        <div class="row" style="margin-top:10px"><button class="btn primary" id="addFriend">Hinzufügen</button></div>
      </div>
    </div>
    ${friends.map(fr => {
      const { entries } = parseCollection(fr.text);
      const other = buildInventory(state.db, entries).owned;
      const theyHave = [...other.values()].filter(o => !state.inv.owned.has(key(o.card)));
      const youHave = [...state.inv.owned.values()].filter(o => !other.has(key(o.card)));
      return `<div class="card" style="margin-top:16px">
        <div class="row" style="justify-content:space-between">
          <b>${esc(fr.name)}</b>
          <div class="row"><span class="tag">${other.size} verschiedene Karten</span>
            <button class="btn sm" data-delfriend="${esc(fr.id)}">entfernen</button></div>
        </div>
        <div class="cols" style="margin-top:12px">
          <div><h3 style="margin-top:0">Hat ${theyHave.length} Karten, die dir fehlen</h3>
            <div class="lines">${theyHave.slice(0, 20).map(o => lineRow(o.qty, o.card)).join('') || '<div class="line">–</div>'}</div></div>
          <div><h3 style="margin-top:0">Du hast ${youHave.length} Karten, die ihm/ihr fehlen</h3>
            <div class="lines">${youHave.slice(0, 20).map(o => lineRow(o.qty, o.card)).join('') || '<div class="line">–</div>'}</div></div>
        </div></div>`;
    }).join('')}`;
}

/* ------------------------------------------------------------- Interaktion */
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); if (btn) { const t = btn.textContent; btn.textContent = 'Kopiert ✓'; setTimeout(() => btn.textContent = t, 1500); } }
  catch { download('riftbound.txt', text); }
}

document.addEventListener('click', async e => {
  // Kartenbild: schließen per ×, Tipp daneben; öffnen per Tipp auf eine Karte
  if (document.getElementById('cardModal')) {
    if (e.target.id === 'cardClose' || e.target.id === 'cardModal') closeCard();
    return;
  }
  const view = e.target.closest('[data-cardview]');
  if (view && !e.target.closest('button, a, input, select')) {
    const c = state.db.byName.get(view.dataset.cardview);
    if (c) return showCard(c);
  }
  const tileEl = e.target.closest('.tile[data-card]');
  if (tileEl) {
    const c = state.db.cards.find(x => x.id === tileEl.dataset.card);
    if (c) return showCard(c);
  }
  const t = e.target.closest('button, [data-card]');
  if (!t) return;

  if (t.dataset.view) { state.view = t.dataset.view; state.deckIdx = null; state.metaNotice = null; return render(); }
  if (t.dataset.deck) { state.deckIdx = +t.dataset.deck; return render(); }
  if (t.id === 'backDecks') { state.deckIdx = null; return render(); }
  if (t.dataset.pin) {
    const d = decks()[state.deckIdx];
    store(KEY.pins, [...pins().filter(p => p.legendKey !== key(d.legend)), snapshot(d, t.dataset.pin)]);
    return render();
  }
  if (t.dataset.unpin) { store(KEY.pins, pins().filter(p => p.legendKey !== t.dataset.unpin)); return render(); }
  if (t.dataset.pinupdate) {
    const d = currentDeck(t.dataset.pinupdate), old = pinOf(t.dataset.pinupdate);
    if (d && old) store(KEY.pins, pins().map(p => (p.legendKey === old.legendKey ? snapshot(d, old.status) : p)));
    return render();
  }
  if (t.dataset.pinstatus) {
    store(KEY.pins, pins().map(p => (p.legendKey === t.dataset.pinstatus ? { ...p, status: p.status === 'spiele' ? 'baue' : 'spiele' } : p)));
    return render();
  }
  if (t.dataset.pinopen) { state.pinOpen = state.pinOpen === t.dataset.pinopen ? null : t.dataset.pinopen; return render(); }

  if (t.id === 'doImport') {
    const txt = $('#importText').value.trim();
    if (!txt) return;
    applyCollection(txt); state.view = 'sammlung'; return render();
  }
  if (t.id === 'clearColl') {
    localStorage.removeItem(KEY.coll);
    state.entries = []; state.inv = { owned: new Map() }; state.decks = null; state.unmatched = [];
    renderHead(); return render();
  }
  if (t.id === 'copyDeck') return copy(deckToText(decks()[state.deckIdx]), t);
  if (t.id === 'copyArena') return copy(deckToArena(decks()[state.deckIdx]), t);
  if (t.dataset.pinarena) {
    const p = pinOf(t.dataset.pinarena);
    if (p) return copy(deckToArena(pinAsDeck(p)), t);
  }
  if (t.id === 'dlColl') return download('riftbound-sammlung.txt', serializeCollection(state.entries));
  if (t.id === 'copyColl') return copy(serializeCollection(state.entries), t);
  if (t.id === 'copyWish') {
    return copy([...$('#view').querySelectorAll('.line.missing')].map(l =>
      l.querySelector('.c').textContent.replace('×', '') + ' ' + l.querySelector('.n').childNodes[0].textContent.trim()).join('\n'), t);
  }
  if (t.id === 'addMeta') {
    const text = $('#metaText').value.trim();
    if (!text) return;
    // Rückmeldung: was wurde erkannt? Ohne Namen nach der Legende benennen.
    const parsed = parseMetaList(text);
    const cnt = parsed.main.reduce((s, m) => s + m.count, 0);
    const name = $('#metaName').value.trim()
      || (parsed.legend ? `${championOf(parsed.legend, state.db.cards) ?? ''} – ${parsed.legend.name}`.replace(/^ – /, '') : 'Unbenanntes Deck');
    state.metaNotice = `Gespeichert: <b>${esc(name)}</b> – ${parsed.legend ? `Legende ${esc(parsed.legend.name)} erkannt` : '<b>keine Legende erkannt</b> (fließt nicht in den Deckbau ein)'},
      ${cnt} Hauptdeck-Karten${parsed.unknown.length ? `, <b>${parsed.unknown.length} Zeile(n) nicht erkannt:</b> ${parsed.unknown.slice(0, 5).map(esc).join(' · ')}` : ''}.`;
    const own = $('#metaOwn').checked;
    store(KEY.meta, [...read(KEY.meta, []), { id: String(Date.now()), name, text, own }]);
    state.decks = null;
    return render();
  }
  if (t.dataset.delmeta) { store(KEY.meta, read(KEY.meta, []).filter(d => d.id !== t.dataset.delmeta)); state.decks = null; return render(); }
  if (t.id === 'addFriend') {
    const name = $('#friendName').value.trim() || 'Freund';
    const text = $('#friendText').value.trim();
    if (!text) return;
    store(KEY.friends, [...read(KEY.friends, []), { id: String(Date.now()), name, text }]);
    return render();
  }
  if (t.dataset.delfriend) { store(KEY.friends, read(KEY.friends, []).filter(f => f.id !== t.dataset.delfriend)); return render(); }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });

document.addEventListener('input', e => {
  if (e.target.id === 'kwq') {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#kwlist .kw').forEach(el => {
      el.style.display = !q || el.textContent.toLowerCase().includes(q) ? 'block' : 'none';
    });
    return;
  }
  const map = { fq: 'q', fset: 'set', fdomain: 'domain', ftype: 'type', frarity: 'rarity' };
  const k = map[e.target.id];
  if (!k) return;
  state.filter[k] = e.target.value;
  const box = $('.cards');
  if (!box) return render();
  const html = viewSammlung();
  $('#view').innerHTML = html;
  const el = $('#' + e.target.id);
  if (el) { el.focus(); if (el.setSelectionRange && el.type === 'search') el.setSelectionRange(el.value.length, el.value.length); }
});

document.addEventListener('change', e => {
  if (e.target.id === 'swapFrom' || e.target.id === 'swapTo') {
    state.swap[e.target.id === 'swapFrom' ? 'from' : 'to'] = e.target.value;
    return render();
  }
  if (e.target.id === 'deckBeginner') { store(KEY.deckView, { ...deckView(), beginner: e.target.checked }); return render(); }
  if (e.target.id === 'deckFilter' || e.target.id === 'deckSort') {
    store(KEY.deckView, { ...deckView(), [e.target.id === 'deckFilter' ? 'filter' : 'sort']: e.target.value });
    return render();
  }
  if (e.target.id === 'metaFile') {
    const f = e.target.files?.[0];
    if (f) f.text().then(txt => { $('#metaText').value = txt; if (!$('#metaName').value) $('#metaName').value = f.name.replace(/\.[^.]+$/, ''); });
    return;
  }
  if (e.target.id !== 'importFile') return;
  const f = e.target.files?.[0];
  if (!f) return;
  f.text().then(txt => { applyCollection(txt); state.view = 'sammlung'; render(); });
});

/* -------------------------------------------------------------------- Start */
(async () => {
  state.db = await loadCards();
  // Turnierlisten sind optional: fehlt die Datei, baut die App ohne Meta-Daten.
  state.meta = await fetch('data/meta.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  state.inv = { owned: new Map() };
  const saved = read(KEY.coll, null);
  if (saved) applyCollection(saved, false);
  renderHead();
  render();
  // Fehler nicht verschlucken: ohne Service Worker gibt es keinen Offline-
  // Betrieb und keine Installation auf dem Homebildschirm - das muss sichtbar
  // sein, statt still zu scheitern.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('Service Worker nicht registriert - App laeuft ohne Offline-Betrieb:', err.message);
    });
  }
})();
