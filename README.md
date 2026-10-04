# Riftbound – Sammlung & Deckbau

Eine App für die eigene Riftbound-Sammlung: importieren, das stärkste **heute
spielbare** Deck berechnen lassen, sehen welche Karten zu Meta-Decks fehlen und
Sammlungen mit Freunden abgleichen.

Läuft als statische Seite auf GitHub Pages, lässt sich auf dem Handy als App
installieren (PWA) und funktioniert offline. Kein Server, kein Login, keine
Datenbank – die Sammlung bleibt im Browser des jeweiligen Geräts.

## Was die App kann

| Bereich | Funktion |
| --- | --- |
| **Sammlung** | Import per Textdatei, Abgleich mit der offiziellen Kartendatenbank, Filter nach Set, Domain, Typ, Seltenheit und Kartentext |
| **Decks** | Für **jede** Legende im Bestand das stärkste legale Deck – **ausschließlich aus eigenen Karten**. Filter (komplett, mit/ohne Turnierliste, nah an Turnierliste, Schwierigkeit) und Sortierung (Bewertung, Nähe zur Turnierliste, Besitz, Stärke, Schwierigkeit, Name). Jedes Deck mit Schwierigkeit Einsteiger/Mittel/Fortgeschritten und Einsteiger-Modus. Dazu je Deck der „Weg zur Turnierliste“: was dir zur Profi-Liste dieser Legende fehlt |
| **Meine Decks** | Decks als „Spiele ich“ / „Baue ich“ anpinnen (Momentaufnahme, ändert sich nicht von selbst; neuere Version wird angezeigt). Überschneidungen: welche Karten mehrere Decks brauchen und wo die Kopien nicht reichen. Wechsel-Helfer: was aus Deck A in Deck B umgesteckt werden muss |
| **Meta-Decks** | Beliebige Deckliste einfügen → Vollständigkeit in Prozent, fehlende Karten und Deck-Check (unspielbare Karten, unerfüllte Bedingungen). Meta-Listen mit Legende fließen in den Deckbau ein |
| **Wunschliste** | Ausbauziele: was dir zu Turnierlisten deiner Legenden fehlt; Karten, die mehrere Listen brauchen, stehen oben |
| **TCG Arena** | „Für TCG Arena kopieren“ in jeder Deckansicht und bei „Meine Decks“: Abschnitte Legend / Champion / MainDeck / Battlefields / Runes, nur „Anzahl Kartenname“ – zum Einfügen unter Decks → Import auf tcg-arena.fr |
| **Kartenbild** | Jede Karte in Listen und Kacheln ist antippbar: großes Kartenbild, Kartentext, Domain, Kosten, Might und wie oft du sie besitzt |
| **Regeln** | Zugablauf (A-B-C-D), Runen/Energie/Power, Kartensymbole, Kampf, Timing (Action/Reaction/Chain), alle Schlüsselwörter mit offiziellem Kartentext, Erklärung und Tipp. Auch ohne Sammlung nutzbar; jede Deckansicht listet die Schlüsselwörter ihres Decks |
| **Teilen** | Sammlung exportieren, Sammlungen von Freunden einfügen und beidseitig abgleichen |

## Kartendaten

Quelle ist die **offizielle Riot-Kartengalerie** von `playriftbound.com` –
kein API-Key, keine Registrierung, keine Rate-Limits:

```
https://content.publishing.riotgames.com/publishing-content/v2.0/public/channel/riftbound_website/list/riftbound_gallery_cards?locale=en_US&from=0&limit=1000
```

`scripts/fetch-cards.mjs` holt sie und schreibt `data/cards.json`. Der
Workflow `update-cards.yml` läuft täglich und committet neue Sets automatisch –
die App ist damit immer auf dem aktuellen Stand, ohne dass du etwas tust.

Damit das greift, muss zweierlei stimmen:

* **Settings → Actions → General → Workflow permissions** auf *Read and write
  permissions*, sonst darf der Workflow den Commit nicht pushen.
* `deploy.yml` hat einen `workflow_run`-Trigger. Pushes, die ein Workflow mit
  `GITHUB_TOKEN` macht, lösen per GitHub-Design keinen `push`-Event aus – ohne
  diesen Trigger lägen neue Karten im Repo, aber nicht auf der Live-Seite.

## Importformat

Eine Karte pro Zeile, das übliche Decklisten-Format:

```
2 Onslaught (VEN) #081
1 Sett - Kingpin (alt) (OGN) #240a *F*
16 Calm Rune (VEN) #R02
1 Tryndamere - Barbarian (OGNX)
```

Der Parser verkraftet Kartennamen mit Klammern, fehlende Sammlernummern,
Varianten-Suffixe (`#240a`), Extended-Art-Sets (`OGNX`/`UNLX`/`VENX`),
Foil-Markierung `*F*` und doppelte Zeilen (werden addiert). Kommentarzeilen
beginnen mit `//`.

### Kartenidentität

Riot führt seit September 2026 den Beinamen in einem eigenen Feld: `name` ist
nur noch `"Kennen"`, der Beiname steht in `subtitle`. **Der Name allein ist
damit kein Identitätsschlüssel mehr** – unter `"Kennen"` liegen zwei völlig
verschiedene Spielkarten (VEN-135 Order/2 Might und VEN-113 Chaos/4 Might).
Über alle 1189 Drucke sind 48 Namen mehrdeutig.

Bestand, Deckbau, Meta-Abgleich und Wunschliste schlüsseln deshalb über
`fullName` (`name, subtitle`). Das ist nachweislich eindeutig: 936 Werte,
keiner mit abweichenden Spielwerten.

Jede Kartenzeile in der App zeigt **Domain, Set-Kennung und Energiekosten**
(`Order · VEN-135 · 3E`). Das ist wichtig: Derselbe Champion existiert in
mehreren Domains mit völlig unterschiedlichen Effekten – *Kennen, Keeper of
Balance* (VEN-135, Order) ist eine andere Karte als *Kennen, Storm of Shuriken*
(VEN-113, Chaos). Ein farbiger Punkt allein reicht zur Unterscheidung nicht.

Karten werden über Set + Sammlernummer zugeordnet, ersatzweise über den Namen.
Für den Deckbau zählt nur der Kartenname – Foils, Alt-Arts und Nachdrucke aus
mehreren Sets sind dieselbe Spielkarte.

## Einrichten

```bash
git remote add origin git@github.com:<dein-account>/riftbound-collection.git
git push -u origin main
```

Dann in den Repository-Einstellungen unter **Settings → Pages** als Quelle
**GitHub Actions** wählen. Nach dem ersten Deploy liegt die App unter
`https://<dein-account>.github.io/riftbound-collection/`.

Auf dem Handy im Browser öffnen und „Zum Home-Bildschirm hinzufügen" – danach
verhält sie sich wie eine native App und funktioniert auch ohne Netz.

## Lokal entwickeln

```bash
python3 -m http.server 8777
```

Kein Build-Schritt, keine Abhängigkeiten. Reine ES-Module.

## Aufbau

```
index.html            App-Gerüst
app.css               Styles
js/parser.js          Textformat einlesen und schreiben
js/db.js              Kartendatenbank laden, Sammlung zuordnen
js/banlist.js         offizielle Bannliste (Standard), Stand 18.09.2026
js/mechanics.js       Kartenmechanik aus dem Kartentext: was eine Karte braucht und liefert
js/deckbuilder.js     Deckgenerator, Bewertung im Deckzusammenhang, Deck-Check, Wunschliste
js/rules.js           Regeltexte und Schlüsselwörter zum Nachschlagen
js/difficulty.js      Schwierigkeit eines Decks (Einsteiger/Mittel/Fortgeschritten)
js/guide.js           Spielhilfe je Deck (aus der Deckzusammensetzung)
js/app.js             Oberfläche und Zustand
scripts/fetch-cards.mjs   Kartendaten von Riot holen
data/cards.json       generiert, wird täglich aktualisiert
data/meta.json        Turnierlisten der Regional Qualifiers (von Hand gepflegt)
sw.js                 Service Worker für Offline-Betrieb
```

## Wie der Deckbau funktioniert

Bewertet wird nicht die Einzelkarte, sondern die Karte **in diesem Deck**.

### Kartenmechanik (`js/mechanics.js`)

Aus dem offiziellen Kartentext wird für jede Karte abgeleitet:

* **liefert** – XP-Quelle (`[Hunt]`, „gain N XP"), spielt Karten nicht aus der
  Hand (`[Hidden]`, `[Flow]`, aus dem Ablagestapel, vom Deck, Token), schaut
  oben ins Deck, Stun, Buff, Mighty, Equipment, Einheit mit Stammes-Tag …
* **braucht** – XP zum Ausgeben (`Spend 3 XP`, `[Level 3]`), Pflicht-Zusatzkosten
  („As an additional cost to play me, kill a Bird, Cat, Dog, or Poro"),
  Stammesbezug („if you control a Poro"), Zauber, Equipment, betäubte Gegner …

Erinnerungstexte in Klammern werden dabei ignoriert – sonst gälte jede Karte mit
`[Stun]` als Karte, die betäubte Gegner braucht.

### Bewertung

1. **Regeln** – nur Karten der Domain-Identität, keine Spielmarken (Gold, Bird-
   Token …), keine Signature-Karten fremder Champions, höchstens 3
   Signature-Karten, mindestens eine Champion-Einheit des Legenden-Champions,
   keine gebannten Karten oder Schlachtfelder.
2. **Motor der Legende** – der Legendentext sagt, was sie will. *Heart of the
   Tempest* (Kennen) wird aufgeladen, wenn Karten **nicht aus der Hand**
   gespielt werden; Karten, die genau das tun, bekommen einen großen Bonus mit
   abnehmendem Ertrag. Ein geteilter Tag wie „Yordle" zählt dagegen nicht mehr
   pauschal – das hatte früher Decks voller Yordles erzeugt, die mit Kennens
   Legende nichts anfangen.
3. **Bedingungen** – was eine Karte braucht, muss das Deck liefern. Pflichtkosten
   ohne passendes Futter machen eine Karte unspielbar (Stalking Wolf ohne
   Bird/Cat/Dog/Poro). XP wird beim Ausgeben verbraucht: viele XP-Verbraucher
   teilen sich dieselben Quellen und werden entsprechend abgewertet.
4. **Enabler** – was eine Karte liefert, zählt so viel, wie andere Karten im
   Deck es brauchen.
5. **Meta** – Turnierlisten derselben Legende (mitgeliefert in `data/meta.json`
   oder im Tab „Meta-Decks“ eingefügt). **Eine** Liste ist das Vorbild: die
   aktuellste (`weight`, Listen nach der letzten Bannwelle zählen doppelt), von
   der du am meisten besitzt. Mehrere Strategien zu mitteln ergäbe ein Deck,
   das keine richtig spielt. Ihre Karten kommen zuerst ins Deck, in der
   Kopienzahl der Liste; andere Listen geben nur einen kleinen Bonus.
   **Ersatz:** Fehlt eine Karte der Vorbild-Liste, bekommt die eigene Karte mit
   der ähnlichsten Rolle (Typ, Kosten, Funktion) einen Teil des Gewichts.
   Bei vollständiger Sammlung bildet der Deckbau jede mitgelieferte Liste zu
   100 % nach.
6. **Grundwert** – Seltenheit, Might im Vergleich zu gleich teuren Einheiten,
   Schlüsselwörter, Abzug für sehr teure Karten. Kosten­senkungen wie bei Rhasa
   („kostet 1 weniger je Karte im Ablagestapel") werden berücksichtigt.

Deckbau und Bewertung laufen im Wechsel: Deck bauen → mit dem neuen Deck neu
bewerten → neu bauen. Enabler und Verbraucher kommen so gemeinsam ins Deck oder
fliegen gemeinsam raus; das beste Ergebnis gewinnt. Kurve (70 % feste
Ausgangskurve, 30 % Pool) und Typmischung (halb Druckverhältnis, halb Pool)
halten das Deck spielbar. Runen werden nach Domain-Bedarf verteilt.

**Rangfolge:** Bewertung = Stärke der Karten im Zusammenspiel (ohne
Meta-Bonus, damit Legenden vergleichbar sind) + Bonus für den Anteil einer
Turnierliste, den das Deck bereits umsetzt. Gebaut wird immer nur aus dem
Bestand; Turnierlisten zeigen, welche eigenen Karten zusammen funktionieren.

**Ausbauziele** (Deckansicht „Weg zur Turnierliste“, Wunschliste, Meta-Tab)
zeigen, was zur Profi-Liste fehlt – getrennt vom spielbaren Deck.

## Schwierigkeit

`js/difficulty.js` schätzt aus dem fertigen Deck, wie viel es vom Spieler
verlangt: Reaktionen und Hidden-Karten (Timing), Karten mit Bedingungen,
Spiel mit dem Ablagestapel, aktivierte Fähigkeiten, Zusatzbedingungen und
einen Legenden-Motor, der Planung braucht. Klare Einheiten ohne Effekttext
senken den Wert. Dazu Community-Einschätzungen je Legende (Master Yi leicht,
Kennen und Diana schwer; Quellen im Code). Skala 0–10: unter 4 Einsteiger,
unter 5,6 Mittel, darüber Fortgeschritten.

Die Schwierigkeit fließt nicht in die Bewertung ein. Nur der Schalter „Ich bin
Einsteiger“ zieht leichte Decks bei der Sortierung nach Bewertung etwas nach
vorn.

## Spielhilfe

Jedes Deck bekommt einen Abschnitt „So spielst du das Deck": Archetyp, der Motor
der Legende und wie viele Karten ihn antreiben, Schlüsselkarten mit Begründung,
**Bedingungen im Deck** (jede Karte, deren Text etwas voraussetzt, mit ✓/✗),
Mulligan, Stärken und Schwächen. Jede Aussage nennt die Zahl, auf der sie beruht.

## Turnierdaten und Bannliste pflegen

* **Bannliste:** `js/banlist.js`. Riot bannt in Wellen (zuletzt 31.03.,
  24.07. und 18.09.2026). Bei jeder neuen Welle Namen und `BANNED_AS_OF`
  anpassen; der Deckbau schließt gebannte Karten und Schlachtfelder aus, der
  Deck-Check markiert sie.
* **Turnierlisten:** `data/meta.json`, je Deck Legende (`fullName`), Event,
  Platzierung, Datum, Quelle und Karten `[fullName, Kopien]`. Beim Einpflegen
  jede Karte gegen `data/cards.json`, die Domain-Identität der Legende und die
  Bannliste prüfen. Stand der mitgelieferten Listen: Regional Qualifiers der
  Vendetta-Saison bis September 2026, 16 Legenden.

## Grenzen

* Turnierlisten werden nicht automatisch abgerufen – die Deck-Datenbanken
  bieten keine offene API. Die mitgelieferten Listen veralten mit jedem neuen
  Set und jeder Bannwelle.
* Es gibt keine offene API für Meta-Decks. Tier-Listen von riftdecks.com,
  riftbound.gg, riftools.app oder riftmana.com müssen als Deckliste eingefügt
  werden (mit Legende) – Auswertung und Einfluss auf den Deckbau passieren dann
  automatisch.
* Die Kartenmechanik wird per Textmuster erkannt, nicht per vollständigem
  Regelwerk. Sie deckt die Motoren ab, die über Spielbarkeit entscheiden (XP,
  Pflichtopfer, Stämme, Hidden/Flow, Zauber, Equipment, Stun, Buff, Mighty),
  kennt aber nicht jede Einzelinteraktion.
* Spielmarken (Token, `#T01`) sind in der offiziellen Galerie nicht vollständig
  enthalten und bleiben beim Import ohne Treffer. Für den Deckbau egal.
* Freunde-Abgleich läuft über Copy-Paste, nicht über Accounts. Für echte
  Live-Freundeslisten bräuchte es ein Backend (z. B. Supabase).
