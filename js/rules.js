/**
 * Regeln zum Nachschlagen.
 *
 * Schlüsselwörter: Der englische Text ist der offizielle Erinnerungstext, wie
 * er in Klammern auf den Karten steht (aus data/cards.json, Beispielkarte
 * jeweils angegeben). Die deutsche Erklärung und der Tipp sind eigene Worte.
 * Ablauf, Kampf und Timing folgen den offiziellen Grundregeln
 * (playriftbound.com) und wurden mit riftbound.gg, riftbound.zone und
 * riftwatcher.com gegengeprüft. Stand: Oktober 2026.
 */

/** Allgemeine Abschnitte, als HTML (nur eigene, feste Texte – kein Fremdinhalt). */
export const SECTIONS = [
  {
    id: 'ziel', title: 'Ziel des Spiels',
    html: `
      <p>Wer zuerst <b>8 Punkte</b> hat, gewinnt. Punkte gibt es über Schlachtfelder:</p>
      <ul>
        <li><b>Erobern (Conquer):</b> Du übernimmst ein Schlachtfeld, indem deine Einheiten dort einen Kampf gewinnen
          oder auf ein freies Schlachtfeld ziehen → <b>+1 Punkt</b>.</li>
        <li><b>Halten (Hold):</b> Kontrollierst du zu Beginn deines Zuges ein Schlachtfeld → <b>+1 Punkt</b>, und das jeden Zug erneut.</li>
        <li><b>Karteneffekte</b> können zusätzlich Punkte geben.</li>
      </ul>
      <p><b>Regel für den letzten Punkt:</b> Der 8. Punkt muss durch <b>Halten</b> kommen – oder dadurch, dass du in
        diesem Zug <b>jedes</b> Schlachtfeld gewertet hast. Würdest du anders auf 8 kommen, ziehst du stattdessen 1 Karte.</p>
      <p class="tip">Tipp: Mit 7 Punkten reicht es, ein Schlachtfeld durch den gegnerischen Zug zu bringen. Mit 6 Punkten
        kannst du in einem Zug beide Schlachtfelder erobern und gewinnen.</p>`,
  },
  {
    id: 'aufbau', title: 'Spielaufbau',
    html: `
      <ul>
        <li><b>Legende</b> offen auslegen, die <b>Champion-Einheit</b> in die Champion-Zone.</li>
        <li>Jeder Spieler wählt eins seiner 3 <b>Schlachtfelder</b> – im 1-gegen-1 liegen also 2 Schlachtfelder aus.</li>
        <li><b>Runendeck</b> (12 Runen) und <b>Hauptdeck</b> (40 Karten) mischen.</li>
        <li><b>4 Karten</b> auf die Hand. <b>Mulligan:</b> bis zu 2 davon unter das Deck legen und genauso viele nachziehen.</li>
        <li>Wer als Zweiter beginnt, channelt in seinem ersten Zug <b>3 statt 2</b> Runen.</li>
      </ul>
      <p class="tip">Tipp Mulligan: Behalte Karten, die du in Zug 1–3 ausspielen kannst. Teure Karten zurücklegen, außer
        dein Deck braucht genau diese eine Karte.</p>`,
  },
  {
    id: 'ablauf', title: 'Zugablauf – A · B · C · D',
    html: `
      <p>Die ersten vier Phasen laufen immer in dieser Reihenfolge ab – merk dir <b>A-B-C-D</b>:</p>
      <ol class="phases">
        <li><b>A – Awaken (Aufwecken):</b> Alle deine erschöpften Karten wieder aufrichten (bereit machen) – Einheiten, Runen, Legende, Gear.</li>
        <li><b>B – Beginning (Beginn):</b> Erst <b>Halten werten</b>: +1 Punkt für jedes Schlachtfeld, das du kontrollierst.
          Dann „zu Beginn deines Zuges"-Effekte. (Einheiten mit [Temporary] sterben hier – <i>vor</i> dem Werten.)</li>
        <li><b>C – Channel (Runen holen):</b> 2 Runen vom Runendeck ins Spiel legen.</li>
        <li><b>D – Draw (Ziehen):</b> 1 Karte vom Hauptdeck ziehen.</li>
        <li><b>Aktionsphase:</b> Karten spielen, Einheiten bewegen, Kämpfe auslösen, Fähigkeiten nutzen – so viel du bezahlen kannst.</li>
        <li><b>Ende des Zuges:</b> „Am Ende des Zuges"-Effekte, dann heilen alle Einheiten vollständig.
          Nicht ausgegebene Energie und Power verfallen.</li>
      </ol>
      <p class="tip">Tipp: Weil Halten erst zu Beginn <i>deines</i> Zuges wertet, muss ein Schlachtfeld den gegnerischen
        Zug überstehen. Stell lieber eine Einheit mehr dorthin als zu wenig.</p>`,
  },
  {
    id: 'ressourcen', title: 'Runen, Energie und Power',
    html: `
      <p>Karten kosten zwei Dinge, beide kommen aus deinen Runen:</p>
      <ul>
        <li><b>Energie</b> – die <b>Zahl oben links</b> auf der Karte, in der App <code>{3}</code>.
          Bezahlt durch <b>Erschöpfen</b> einer Rune (seitlich drehen). Jede Rune gibt 1 Energie, egal welche Farbe.
          Erschöpfte Runen sind im nächsten Zug (Awaken) wieder bereit.</li>
        <li><b>Power</b> – die <b>Runensymbole in Domainfarbe</b> unter der Energiezahl, in der App <code>[Fury]</code>,
          <code>[Calm]</code> usw. Bezahlt durch <b>Recyceln</b> einer Rune dieser Domain: Sie geht verdeckt unter dein Runendeck.
          Das Symbol <code>[Power]</code> (Regenbogen-Rune) heißt: Power <b>beliebiger</b> Domain.</li>
      </ul>
      <p>Eine Rune kann im selben Zug <b>beides</b>: erst erschöpfen (Energie), dann recyceln (Power).</p>
      <p class="tip">Tipp: Power ist teuer, weil die Rune dein Spielfeld verlässt. Gib Power früh nur aus, wenn es den
        Zug wirklich entscheidet.</p>`,
  },
  {
    id: 'symbole', title: 'Symbole auf den Karten',
    html: `
      <table class="rules">
        <tr><th>Auf der Karte</th><th>In der App</th><th>Bedeutung</th></tr>
        <tr><td>Zahl im Kreis oben links</td><td><code>3E</code> / <code>{3}</code></td><td>Energiekosten</td></tr>
        <tr><td>Runensymbol in Domainfarbe</td><td><code>[Fury]</code> … <code>[Order]</code></td><td>Power dieser Domain</td></tr>
        <tr><td>Regenbogen-Rune</td><td><code>[Power]</code></td><td>Power beliebiger Domain</td></tr>
        <tr><td>Schwert-/Schildsymbol mit Zahl</td><td><code>Might</code></td><td>Stärke der Einheit: so viel Schaden teilt sie aus und so viel hält sie aus</td></tr>
        <tr><td>Gedrehter Pfeil</td><td><code>Exhaust</code></td><td>Kosten: Karte erschöpfen (seitlich drehen)</td></tr>
        <tr><td>Pfeil nach Schlüsselwort</td><td><code>[&gt;]</code></td><td>trennt Bedingung und Effekt, z. B. <code>[Level 6][&gt;]</code> = „ab 6 XP gilt:"</td></tr>
        <tr><td>Farbiger Punkt</td><td><span class="dom fury"></span> …</td><td>Domain der Karte: Fury, Calm, Mind, Body, Chaos, Order</td></tr>
      </table>
      <p>Die sechs Domains: <b>Fury</b> (rot), <b>Calm</b> (grün), <b>Mind</b> (blau), <b>Body</b> (orange),
        <b>Chaos</b> (lila), <b>Order</b> (gelb). Dein Deck darf nur Karten aus den zwei Domains deiner Legende enthalten.</p>`,
  },
  {
    id: 'kampf', title: 'Bewegen, Kampf und Showdown',
    html: `
      <ul>
        <li><b>Ausspielen:</b> Einheiten kommen <b>erschöpft</b> ins Spiel – in deine Basis oder an ein Schlachtfeld, das
          du kontrollierst. Ausnahmen: [Accelerate], „I enter ready".</li>
        <li><b>Bewegen:</b> Eine bereite Einheit kann sich in deiner Aktionsphase von der Basis zu einem Schlachtfeld oder
          zurück bewegen – dafür wird sie <b>erschöpft</b>. Von Schlachtfeld zu Schlachtfeld nur mit [Ganking].</li>
        <li><b>Showdown:</b> Kommen deine Einheiten an ein Schlachtfeld mit Gegnern, beginnt ein Showdown. Beide dürfen
          abwechselnd Aktionen und Reaktionen spielen (siehe Timing), der Angreifer zuerst.</li>
        <li><b>Kampfschaden:</b> Jede Seite zählt die Might ihrer Einheiten zusammen und verteilt so viel Schaden auf die
          gegnerischen Einheiten – der Angreifer verteilt zuerst, ausgeteilt wird gleichzeitig. Eine Einheit muss tödlichen
          Schaden voll abbekommen, bevor die nächste etwas bekommt. Einheiten mit [Tank] zuerst, mit [Backline] zuletzt.</li>
        <li>Eine Einheit stirbt, wenn ihr Schaden ihre Might erreicht. Bleiben nur deine Einheiten übrig, <b>eroberst</b> du das Schlachtfeld.</li>
        <li>Schaden bleibt bis zum Zugende, dann heilen alle Einheiten.</li>
      </ul>
      <p class="tip">Tipp: Kampftricks (+Might „this turn") wirken am stärksten, nachdem der Gegner seine Reaktionen schon
        verbraucht hat. Wer zuletzt reagiert, gewinnt meist den Kampf.</p>`,
  },
  {
    id: 'timing', title: 'Timing: Aktion, Reaktion, Chain',
    html: `
      <ul>
        <li><b>Normale Karten</b> (ohne Zusatz) spielst du nur in deinem eigenen Zug, wenn gerade nichts anderes passiert.</li>
        <li><b>[Action]</b> – in deinem Zug <b>oder in Showdowns</b>, aber nur, wenn gerade keine Chain läuft.</li>
        <li><b>[Reaction]</b> – <b>jederzeit</b>, auch als Antwort auf eine Karte des Gegners, bevor sie wirkt.</li>
        <li><b>Chain:</b> Spielt jemand eine Karte, entsteht eine Chain. Solange sie offen ist, darf nur mit Reaktionen
          geantwortet werden. Aufgelöst wird von oben nach unten – <b>die zuletzt gespielte Karte wirkt zuerst</b>.</li>
        <li><b>Focus im Showdown:</b> Wer Focus hat, darf eine neue Aktion starten. Nach jeder aufgelösten Chain wechselt der
          Focus. Der Showdown endet, wenn beide nacheinander passen.</li>
      </ul>
      <p class="tip">Tipp: Spielt der Gegner einen Entfernungszauber auf deine Einheit, kannst du mit einer Reaktion
        (z. B. +Might oder Konter wie Defy) antworten – deine Reaktion wirkt <i>vor</i> seinem Zauber.</p>`,
  },
  {
    id: 'begriffe', title: 'Begriffe von A bis Z',
    html: `
      <table class="rules">
        <tr><td><b>Banish</b></td><td>Karte aus dem Spiel entfernen – sie kommt nicht in den Ablagestapel und ist weg.</td></tr>
        <tr><td><b>Base</b></td><td>Deine Basis: hier kommen Einheiten an, hier ist man vor Kämpfen sicher.</td></tr>
        <tr><td><b>Buff</b></td><td>Dauerhafte +1-Might-Marke. Eine Einheit hat höchstens einen Buff; manche Karten „verbrauchen" ihn.</td></tr>
        <tr><td><b>Champion Zone</b></td><td>Hier liegt deine Champion-Einheit zu Spielbeginn bereit; du spielst sie von dort aus.</td></tr>
        <tr><td><b>Channel</b></td><td>Runen vom Runendeck ins Spiel legen.</td></tr>
        <tr><td><b>Control / kontrollieren</b></td><td>Du kontrollierst ein Schlachtfeld, wenn nur deine Einheiten dort stehen.</td></tr>
        <tr><td><b>Deal damage</b></td><td>Schaden zufügen. Erreicht der Schaden die Might, stirbt die Einheit. Heilt am Zugende.</td></tr>
        <tr><td><b>Exhaust / Ready</b></td><td>Erschöpfen (drehen) / bereit machen (aufrichten). Erschöpfte Einheiten können sich nicht bewegen.</td></tr>
        <tr><td><b>Kill</b></td><td>Sofort zerstören, unabhängig von der Might.</td></tr>
        <tr><td><b>Legend</b></td><td>Deine Legende: bestimmt die 2 Domains und hat eine eigene Fähigkeit, die das ganze Spiel über gilt.</td></tr>
        <tr><td><b>Recall</b></td><td>Einheit in die Basis zurückschicken – das gilt nicht als Bewegung.</td></tr>
        <tr><td><b>Recycle</b></td><td>Karte verdeckt unter ihr Deck legen.</td></tr>
        <tr><td><b>Signature</b></td><td>Karte mit dem Namen eines Champions (z. B. Lightning Rush → Kennen). Nur im Deck dieses Champions, höchstens 3 insgesamt.</td></tr>
        <tr><td><b>Token</b></td><td>Spielmarke, die durch einen Effekt entsteht (Recruit, Gold, Sprite …). Gehört nie ins Deck.</td></tr>
        <tr><td><b>Trash</b></td><td>Ablagestapel. Viele Karten spielen von hier oder werden mit vollem Trash stärker.</td></tr>
        <tr><td><b>XP</b></td><td>Erfahrungspunkte. Werden gesammelt ([Hunt], „gain XP") und von [Level]-Karten verlangt oder ausgegeben („Spend 3 XP").</td></tr>
      </table>`,
  },
  {
    id: 'tipps', title: 'Allgemeine Tipps',
    html: `
      <ul>
        <li><b>Kurve spielen:</b> Nutze jeden Zug deine Energie aus. Ein Zug ohne Karte ist fast immer verloren.</li>
        <li><b>Zwei Schlachtfelder, ein Plan:</b> Konzentriere dich auf eins, das du halten kannst, und zwinge den Gegner,
          sich zwischen Angriff und Verteidigung zu entscheiden.</li>
        <li><b>Legende nutzen:</b> Die Fähigkeit deiner Legende ist jede Runde verfügbar – plane deinen Zug um sie herum.</li>
        <li><b>Reaktionen aufheben:</b> Eine offene Rune und eine Reaktion auf der Hand machen jeden Angriff für den Gegner riskant.</li>
        <li><b>Hidden-Karten früh verstecken:</b> Sie kosten jetzt nur Power und sind ab dem nächsten Zug gratis spielbar – ideal für Überraschungen.</li>
        <li><b>Zählen vor dem Angriff:</b> Rechne die Might beider Seiten durch, inklusive möglicher Kampftricks des Gegners.</li>
      </ul>`,
  },
];

/**
 * Schlüsselwörter. `en` ist der offizielle Erinnerungstext (Beispielkarte in
 * `card`), `de` die Erklärung, `tip` ein Hinweis zum Spielen.
 */
export const KEYWORDS = [
  { k: 'Action', en: 'Play on your turn or in showdowns.', card: 'Grim Resolve',
    de: 'Spielbar in deinem Zug und zusätzlich in Showdowns – aber nicht als Antwort auf eine laufende Chain.',
    tip: 'Im Showdown kannst du damit eingreifen, sobald du Focus hast.' },
  { k: 'Reaction', en: 'Play any time, even before spells and abilities resolve.', card: 'Defy',
    de: 'Jederzeit spielbar, auch im Zug des Gegners und als Antwort auf seine Karte – deine Reaktion wirkt zuerst.',
    tip: 'Die flexibelsten Karten im Spiel. Halte Runen offen, um reagieren zu können.' },
  { k: 'Hidden', en: 'Hide now for [Power] to react with later for {0}.', card: 'Teemo, Scout',
    de: 'Du darfst die Karte für 1 Power verdeckt an ein Schlachtfeld legen, das du kontrollierst (eine pro Schlachtfeld). Ab dem nächsten Zug kannst du sie als Reaktion für 0 Energie spielen. Verlierst du das Schlachtfeld, ist die Karte weg.',
    tip: 'Zählt als „nicht aus der Hand gespielt" – wichtig z. B. für Kennens Legende.' },
  { k: 'Ambush', en: 'You may play me as a [Reaction] to a battlefield where you have units.', card: 'Inferna',
    de: 'Die Einheit darf als Reaktion direkt an ein Schlachtfeld gespielt werden, an dem du schon Einheiten hast.',
    tip: 'Perfekt, um mitten im Kampf Verstärkung zu bringen, wenn der Gegner schon festgelegt ist.' },
  { k: 'Ganking', en: 'I can move from battlefield to battlefield.', card: "Nocturne, Horrifying",
    de: 'Darf sich direkt von einem Schlachtfeld zum anderen bewegen, ohne Umweg über die Basis.',
    tip: 'Ideal, um nach einem gewonnenen Kampf sofort das zweite Schlachtfeld unter Druck zu setzen.' },
  { k: 'Accelerate', en: 'You may pay {1}[Domain] as an additional cost to have me enter ready.', card: 'Blazing Scorcher',
    de: 'Zahlst du zusätzlich 1 Energie und 1 Power der Domain, kommt die Einheit bereit ins Spiel und kann sofort ziehen.',
    tip: 'Lohnt sich, wenn du damit diesen Zug noch ein Schlachtfeld erobern kannst.' },
  { k: 'Assault', en: '+N Might while I\'m an attacker.', card: 'Inferna',
    de: 'Hat beim Angreifen N zusätzliche Might.', tip: 'Zählt nur beim Angriff, nicht beim Verteidigen.' },
  { k: 'Shield', en: '+1 Might while I\'m a defender.', card: 'Jeweled Colossus',
    de: 'Hat beim Verteidigen 1 zusätzliche Might.', tip: 'Gut zum Halten von Schlachtfeldern.' },
  { k: 'Tank', en: 'I must be assigned combat damage first.', card: 'Galio, Indefatigable',
    de: 'Im Kampf muss der Gegner zuerst dieser Einheit tödlichen Schaden zuteilen.',
    tip: 'Schützt deine wichtigen Einheiten dahinter.' },
  { k: 'Backline', en: 'I must be assigned combat damage last.', card: 'Pyke, Returned',
    de: 'Bekommt Kampfschaden erst, wenn alle anderen eigenen Einheiten tödlichen Schaden zugeteilt bekommen haben.',
    tip: 'Überlebt Kämpfe oft als Letzte.' },
  { k: 'Deflect', en: 'Opponents must pay [Power] to choose me with a spell or ability.', card: 'Vex, Apathetic',
    de: 'Der Gegner muss 1 zusätzliche Power zahlen, um diese Einheit mit einem Zauber oder einer Fähigkeit zu wählen.',
    tip: '[Deflect 2] kostet entsprechend 2 Power. Macht Entfernung teuer.' },
  { k: 'Temporary', en: 'Kill this at the start of its controller\'s Beginning Phase, before scoring.', card: 'Sprite Mother',
    de: 'Stirbt zu Beginn deines nächsten Zuges, noch bevor gewertet wird.', tip: 'Für einen Zug Druck – zum Halten taugt sie nicht.' },
  { k: 'Deathknell', en: 'When I die, get the effect.', card: 'Tasty Faefolk',
    de: 'Der Effekt tritt ein, wenn die Einheit stirbt.', tip: 'Solche Einheiten tauschst du gern in Kämpfen ein.' },
  { k: 'Legion', en: "Get the effect if you've played another card this turn.", card: 'Vanguard Captain',
    de: 'Der Effekt gilt nur, wenn du in diesem Zug schon eine andere Karte gespielt hast.',
    tip: 'Erst eine billige Karte spielen, dann die Legion-Karte.' },
  { k: 'Vision', en: 'When you play me, look at the top card of your Main Deck. You may recycle it.', card: 'Mystic Poro',
    de: 'Beim Ausspielen oberste Deckkarte ansehen und auf Wunsch unter das Deck legen.', tip: 'Verbessert deinen nächsten Zug.' },
  { k: 'Predict', en: 'Look at the top card(s) of your Main Deck. You may recycle them.', card: "Scryer's Bloom",
    de: 'Oberste N Deckkarten ansehen, beliebige davon unter das Deck legen, Rest in beliebiger Reihenfolge zurück.', tip: '' },
  { k: 'Burn', en: 'Put the top card(s) of your Main Deck into your trash.', card: 'Kennen, Storm of Shuriken',
    de: 'Oberste N Karten deines Decks in den Ablagestapel legen.', tip: 'Füllt den Trash – gut für Karten wie Rhasa oder Flow.' },
  { k: 'Flow', en: 'You may play this from your trash for its Flow cost. Then banish it.', card: 'Lightning Rush',
    de: 'Die Karte kann aus dem Ablagestapel noch einmal gespielt werden (zu den Flow-Kosten), danach wird sie gebannt.', tip: '' },
  { k: 'Repeat', en: "You may pay the additional cost to repeat this spell's effect.", card: 'Blood Rush',
    de: 'Zahlst du die angegebenen Zusatzkosten, wirkt der Zauber ein zweites Mal.', tip: 'Später im Spiel, mit mehr Runen, doppelt stark.' },
  { k: 'Stun', en: "A stunned unit doesn't deal combat damage this turn.", card: 'Existential Dread',
    de: 'Eine betäubte Einheit teilt in diesem Zug keinen Kampfschaden aus.', tip: 'Vor einem Kampf auf die stärkste gegnerische Einheit.' },
  { k: 'Buff', en: "Give me a +1 Might buff if I don't have one.", card: 'Enthralling Protector',
    de: 'Gibt eine dauerhafte +1-Might-Marke, falls die Einheit noch keine hat.', tip: 'Manche Karten verbrauchen Buffs für starke Effekte.' },
  { k: 'Mighty', en: 'A unit is Mighty while it has 5+ Might.', card: 'Fiora, Victorious',
    de: 'Eine Einheit gilt als „Mighty", solange sie 5 oder mehr Might hat.', tip: '' },
  { k: 'Empower', en: '[Cost]: Empower this. Use only if not Empowered.', card: 'Tail-Cloaked Matriarch',
    de: 'Zahle die Kosten, um die Karte zu stärken („Empowered"). Ihre Empowered-Effekte gelten dann.', tip: '' },
  { k: 'Equip', en: '[Cost]: Attach this to a unit you control.', card: 'Guardian Angel',
    de: 'Ausrüstung (Equipment) für die angegebenen Kosten an eine eigene Einheit anlegen.', tip: '' },
  { k: 'Weaponmaster', en: "When you play me, you may [Equip] one of your Equipment to me for [Power] less, even if it's already attached.", card: 'Lucian, Merciless',
    de: 'Beim Ausspielen darfst du eine deiner Ausrüstungen günstiger an diese Einheit anlegen.', tip: 'Braucht Equipment im Deck.' },
  { k: 'Quick-Draw', en: 'This has [Reaction]. When you play it, attach it to a unit you control.', card: 'Long Sword',
    de: 'Ausrüstung, die du als Reaktion spielst und sofort anlegst.', tip: 'Ein Kampftrick, der danach liegen bleibt.' },
  { k: 'Level', en: 'While you have N+ XP, get the effect.', card: 'Bandle Soldier',
    de: 'Der Effekt gilt, solange du mindestens N XP hast.', tip: 'Nur mit genug XP-Quellen im Deck sinnvoll.' },
  { k: 'Hunt', en: 'When I conquer or hold, gain N XP.', card: 'Enthralling Protector',
    de: 'Erobert oder hält die Einheit, bekommst du N XP.', tip: 'Die zuverlässigste XP-Quelle.' },
  { k: 'Disarm', en: 'When I attack, give an enemy unit here -1 Might this turn.', card: 'Ahri, Confident',
    de: 'Beim Angriff verliert eine gegnerische Einheit dort 1 Might für diesen Zug.', tip: '' },
  { k: 'Deploy', en: 'Play this only to a battlefield. When an opponent holds here, kill this.', card: 'Banner of Conquest',
    de: 'Darf nur an ein Schlachtfeld gespielt werden. Hält der Gegner dort, wird die Karte zerstört.', tip: '' },
  { k: 'Show Off', en: 'As you play this, you may reveal a unit from hand or pick a friendly unit.', card: 'Primordial Roar',
    de: 'Beim Ausspielen darfst du eine passende Karte aus der Hand vorzeigen oder eine eigene Einheit wählen – dann gilt der Zusatzeffekt.', tip: '' },
  { k: 'Unique', en: 'Your deck can have only 1 card with this name.', card: 'Forgefire Cape',
    de: 'Nur 1 Exemplar dieser Karte im Deck erlaubt.', tip: '' },
];

/** Welche Schlüsselwörter kommen in diesen Karten vor? (für die Deckansicht) */
export function keywordsIn(cards) {
  const found = new Map();
  for (const c of cards) {
    const t = c.text ?? '';
    for (const kw of KEYWORDS) {
      const re = new RegExp(`\\[${kw.k.replace(/[-]/g, '\\-')}(?: \\d+)?\\]`, 'i');
      if (re.test(t)) found.set(kw.k, kw);
    }
  }
  return [...found.values()];
}
