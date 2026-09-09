import { parseCollection, serializeCollection } from './parser.js';
import { loadCards, buildInventory, resolve } from './db.js';
import { suggestDecks, deckToText, RULES } from './deckbuilder.js';

const KEY = { coll: 'rb.collection.v1', meta: 'rb.metadecks.v1', friends: 'rb.friends.v1' };
const DOMAINS = ['calm', 'mind', 'body', 'fury', 'order', 'chaos', 'colorless'];

const state = {
  db: null, entries: [], inv: null, decks: null, unmatched: [],
  view: 'sammlung', deckIdx: null,
  filter: { q: '', set: '', domain: '', type: '', rarity: '' },
};

/* ------------------------------------------------------------------ Helfer */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const img = (c, w = 320) => c.img ? esc(c.img + '&w=' + w) : '';
const dots = ds => (ds ?? []).map(d => `<span class="dom ${d}" title="${d}"></span>`).join('');
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
  if (!state.decks) state.decks = suggestDecks(state.inv, state.db.cards);
  return state.decks;
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
  if (!state.entries.length && state.view !== 'import') { v.innerHTML = viewImport(true); return; }
  v.innerHTML = ({
    sammlung: viewSammlung, decks: viewDecks, meta: viewMeta,
    wunsch: viewWunsch, teilen: viewTeilen, import: viewImport,
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
    return (!f.q || c.name.toLowerCase().includes(f.q.toLowerCase()) || (c.text ?? '').toLowerCase().includes(f.q.toLowerCase()))
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
    <img loading="lazy" src="${img(c)}" alt="${esc(c.name)}">
    <span class="qty">${missing ? '−' : ''}${qty}</span>
    <div class="nm">${dots(c.domains)} ${esc(c.name)}</div></div>`;
}

/* --- Decks --- */
function viewDecks() {
  const list = decks();
  if (state.deckIdx != null && list[state.deckIdx]) return viewDeckDetail(list[state.deckIdx]);
  if (!list.length) return `<h2>Decks</h2><div class="empty">Keine Legende in der Sammlung – ohne Legende lässt sich kein Deck bauen.</div>`;

  return `
    <h2>Spielbare Decks</h2>
    <p class="sub">Für jede Legende in deiner Sammlung das stärkste Deck, das du <b>heute</b> legen kannst –
       40 Karten Hauptdeck, 12 Runen, 3 Schlachtfelder, max. 3 Kopien je Karte, nur Karten in der Domain-Identität der Legende.</p>
    <div class="decklist">${list.map((d, i) => `
      <button class="deckcard" data-deck="${i}">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div><div class="t">${esc(d.legend.name)}</div>
            <div class="m">${dots(d.identity)} ${d.identity.join(' + ')}</div></div>
          <span class="badge ${d.complete ? 'ok' : 'warn'}">${d.complete ? 'komplett' : 'unvollständig'}</span>
        </div>
        <div class="m" style="margin-top:10px">
          Deckwert <b style="color:var(--accent)">${d.score}</b> ·
          Ø ${d.avgEnergy} Energie · ${d.counts.main}/40 · ${d.counts.runes}/12 Runen · ${d.counts.battlefields}/3 BF
        </div>
        <div class="bar-track"><div class="bar-fill ${d.complete ? '' : 'warn'}" style="width:${pct(d.counts.main, 40)}%"></div></div>
      </button>`).join('')}</div>`;
}

function viewDeckDetail(d) {
  const maxCurve = Math.max(...Object.values(d.curve), 1);
  const curve = [1, 2, 3, 4, 5, 6].map(b =>
    `<div style="height:${(d.curve[b] ?? 0) / maxCurve * 100}%"><span>${d.curve[b] ?? 0}</span><i>${b === 6 ? '6+' : b}</i></div>`).join('');

  return `
    <div class="row" style="margin-bottom:14px"><button class="btn sm" id="backDecks">← Alle Decks</button></div>
    <h2>${esc(d.legend.name)} <span class="badge ${d.complete ? 'ok' : 'warn'}">${d.complete ? 'komplett spielbar' : 'unvollständig'}</span></h2>
    <p class="sub">${dots(d.identity)} ${d.identity.join(' + ')} · Deckwert ${d.score} · Ø ${d.avgEnergy} Energie
      ${d.complete ? '' : ` · es fehlen ${d.missingSlots.main} Hauptdeck-, ${d.missingSlots.runes} Runen- und ${d.missingSlots.battlefields} Schlachtfeldkarten`}</p>

    <div class="cols">
      <div>
        <h3>Hauptdeck · ${d.counts.main}/40</h3>
        <div class="lines">${d.main.map(m => lineRow(m.count, m.card)).join('')}</div>
        <h3>Energiekurve</h3>
        <div class="curve">${curve}</div>
      </div>
      <div>
        <h3>Legende</h3><div class="lines">${lineRow(1, d.legend)}</div>
        <h3>Runen · ${d.counts.runes}/12</h3>
        <div class="lines">${d.runes.map(m => lineRow(m.count, m.card)).join('')}</div>
        <h3>Schlachtfelder · ${d.counts.battlefields}/3</h3>
        <div class="lines">${d.battlefields.map(m => lineRow(1, m.card)).join('')}</div>
        <h3>Diese Karten würden das Deck am meisten verbessern</h3>
        <div class="lines">${d.upgrades.slice(0, 12).map(u =>
          `<div class="line missing"><span class="c">+${u.missing}</span><span class="n">${esc(u.card.name)}</span>
           <span class="e">${dots(u.card.domains)} ${u.card.code} · ${u.card.rarity}${u.ownedQty ? ` · hast ${u.ownedQty}` : ''}</span></div>`).join('')
          || '<div class="line">Nichts Offensichtliches – dein Pool ist für diese Legende ausgereizt.</div>'}</div>
        <div class="row" style="margin-top:14px">
          <button class="btn" id="copyDeck">Deckliste kopieren</button>
        </div>
      </div>
    </div>`;
}

const lineRow = (n, c) => `<div class="line"><span class="c">${n}×</span><span class="n">${esc(c.name)}</span>
  <span class="e">${dots(c.domains)}${c.energy != null ? ' ' + c.energy + 'E' : ''} · ${c.rarity}</span></div>`;

/* --- Meta-Decks --- */
function analyzeDeck(text) {
  const { entries } = parseCollection(text);
  const rows = entries.map(e => {
    const found = resolve(state.db, e);
    const card = found ? (state.db.byName.get(found.name.toLowerCase()) ?? found) : null;
    const have = card ? (state.inv.owned.get(card.name)?.qty ?? 0) : 0;
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
    <p class="sub">Deckliste von riftdecks.com, riftbound.gg, riftools.app oder aus einem Turnierbericht einfügen –
       die App rechnet sofort aus, wie weit du davon entfernt bist und welche Karten dir fehlen.</p>
    <div class="card" style="margin-bottom:20px">
      <div class="row" style="margin-bottom:10px">
        <input type="text" id="metaName" placeholder="Deckname, z. B. Kennen Tempest (Tier 1)" style="flex:1;min-width:200px">
      </div>
      <textarea id="metaText" placeholder="Deckliste einfügen – gleiches Format wie der Sammlungs-Export"></textarea>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="addMeta">Deck speichern &amp; auswerten</button></div>
    </div>
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
        ${miss.length ? `<h3>Dir fehlen ${d.a.missing} Karten</h3>
          <div class="lines">${miss.map(r => `<div class="line missing"><span class="c">${r.missing}×</span>
            <span class="n">${esc(r.card?.name ?? r.raw.rawName)}</span>
            <span class="e">${r.card ? dots(r.card.domains) + ' ' + r.card.code + ' · ' + r.card.rarity : 'unbekannte Karte'}</span></div>`).join('')}</div>`
          : '<div class="notice" style="margin-top:12px">Dieses Deck kannst du komplett bauen.</div>'}
      </div>`;
    }).join('') : '<div class="empty">Noch keine Meta-Decks gespeichert.</div>'}`;
}

/* --- Wunschliste --- */
function viewWunsch() {
  const want = new Map();
  const add = (card, n, why) => {
    if (!card) return;
    const h = want.get(card.name) ?? { card, n: 0, why: new Set() };
    h.n = Math.max(h.n, n); h.why.add(why); want.set(card.name, h);
  };

  for (const d of read(KEY.meta, [])) {
    const a = analyzeDeck(d.text);
    a.rows.filter(r => r.missing > 0).forEach(r => add(r.card, r.missing, d.name));
  }
  const top = decks().slice(0, 3);
  top.forEach(d => d.upgrades.slice(0, 12).forEach(u => add(u.card, u.missing, d.legend.name)));

  const list = [...want.values()].sort((a, b) => b.why.size - a.why.size || b.n - a.n);
  const totalCards = list.reduce((s, x) => s + x.n, 0);

  return `
    <h2>Wunschliste</h2>
    <p class="sub">Alles, was dir zu deinen gespeicherten Meta-Decks und zu deinen drei stärksten eigenen Decks fehlt –
       Karten, die in mehreren Decks gebraucht werden, stehen oben.</p>
    <div class="grid-stats">${kpi(list.length, 'verschiedene Karten')}${kpi(totalCards, 'Exemplare')}
      ${kpi(list.filter(x => x.why.size > 1).length, 'mehrfach gebraucht')}</div>
    ${list.length ? `<div class="lines">${list.map(x => `<div class="line missing">
        <span class="c">${x.n}×</span><span class="n">${esc(x.card.name)}
        <span class="tag" style="margin-left:6px">${[...x.why].slice(0, 3).map(esc).join(', ')}${x.why.size > 3 ? ' +' + (x.why.size - 3) : ''}</span></span>
        <span class="e">${dots(x.card.domains)} ${x.card.code} · ${x.card.rarity}</span></div>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn" id="copyWish">Als Liste kopieren</button></div>`
    : '<div class="empty">Nichts offen. Speicher ein Meta-Deck, um eine Wunschliste zu bekommen.</div>'}`;
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
      const theyHave = [...other.values()].filter(o => !state.inv.owned.has(o.card.name));
      const youHave = [...state.inv.owned.values()].filter(o => !other.has(o.card.name));
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
  const t = e.target.closest('button, [data-card]');
  if (!t) return;

  if (t.dataset.view) { state.view = t.dataset.view; state.deckIdx = null; return render(); }
  if (t.dataset.deck) { state.deckIdx = +t.dataset.deck; return render(); }
  if (t.id === 'backDecks') { state.deckIdx = null; return render(); }

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
  if (t.id === 'dlColl') return download('riftbound-sammlung.txt', serializeCollection(state.entries));
  if (t.id === 'copyColl') return copy(serializeCollection(state.entries), t);
  if (t.id === 'copyWish') {
    return copy([...$('#view').querySelectorAll('.line.missing')].map(l =>
      l.querySelector('.c').textContent.replace('×', '') + ' ' + l.querySelector('.n').childNodes[0].textContent.trim()).join('\n'), t);
  }
  if (t.id === 'addMeta') {
    const name = $('#metaName').value.trim() || 'Unbenanntes Deck';
    const text = $('#metaText').value.trim();
    if (!text) return;
    store(KEY.meta, [...read(KEY.meta, []), { id: String(Date.now()), name, text }]);
    return render();
  }
  if (t.dataset.delmeta) { store(KEY.meta, read(KEY.meta, []).filter(d => d.id !== t.dataset.delmeta)); return render(); }
  if (t.id === 'addFriend') {
    const name = $('#friendName').value.trim() || 'Freund';
    const text = $('#friendText').value.trim();
    if (!text) return;
    store(KEY.friends, [...read(KEY.friends, []), { id: String(Date.now()), name, text }]);
    return render();
  }
  if (t.dataset.delfriend) { store(KEY.friends, read(KEY.friends, []).filter(f => f.id !== t.dataset.delfriend)); return render(); }
});

document.addEventListener('input', e => {
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
  if (e.target.id !== 'importFile') return;
  const f = e.target.files?.[0];
  if (!f) return;
  f.text().then(txt => { applyCollection(txt); state.view = 'sammlung'; render(); });
});

/* -------------------------------------------------------------------- Start */
(async () => {
  state.db = await loadCards();
  state.inv = { owned: new Map() };
  const saved = read(KEY.coll, null);
  if (saved) applyCollection(saved, false);
  renderHead();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
