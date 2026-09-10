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
| **Decks** | Für **jede** Legende im Bestand das stärkste legale Deck: 40 Karten Hauptdeck, 12 Runen, 3 Schlachtfelder, max. 3 Kopien, Domain-Identität der Legende. Mit Energiekurve, Deckwert und Spielhilfe |
| **Meta-Decks** | Beliebige Deckliste einfügen → Vollständigkeit in Prozent und exakte Liste der fehlenden Karten |
| **Wunschliste** | Bündelt alles Fehlende; Karten, die in mehreren Decks gebraucht werden, stehen oben |
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
js/deckbuilder.js     Deckgenerator, Bewertung, Wunschliste
js/guide.js           Spielhilfe je Deck (aus der Deckzusammensetzung)
js/app.js             Oberfläche und Zustand
scripts/fetch-cards.mjs   Kartendaten von Riot holen
data/cards.json       generiert, wird täglich aktualisiert
sw.js                 Service Worker für Offline-Betrieb
```

## Wie der Deckbau funktioniert

Für jede Legende im Bestand:

1. **Pool bilden** – alle eigenen Einheiten, Zauber und Ausrüstung, deren
   Domains in der Identität der Legende liegen (farblos zählt immer).
2. **Bewerten** – Seltenheit als Grundwert, dicke Boni für Karten mit den Tags
   der Legende (Champion-Synergie), kleinere Boni für im Pool gut vertretene
   Stämme, dazu Statwert (Might pro Energie) und Textschlüsselwörter.
3. **Kurvenbewusst füllen** – die 40 Plätze werden entlang einer Zielkurve
   vergeben, damit nicht nur teure Karten im Deck landen. Was danach offen
   bleibt, wird nach reinem Score aufgefüllt.
4. **Runen verteilen** – 12 Runen im Verhältnis des tatsächlichen Domain-Bedarfs
   des gebauten Hauptdecks.
5. **Typmischung wahren** – ohne Gegengewicht entstünden Decks aus 38 Einheiten
   und einem Zauber: 99 % der Einheiten tragen Tags, aber nur 18 % der Zauber,
   der Synergiebonus bevorzugt Einheiten also strukturell. Als Bezugsgröße
   dient das Verhältnis, in dem das Spiel die Typen druckt (rund 63/26/11).
6. **Wunschliste ableiten** – der komplette offizielle Kartenpool der Identität
   wird gegen das gebaute Deck gehalten; was besser wäre als die schwächste
   Karte im Deck, landet als Empfehlung in der Liste.

Kurve und Typmischung werden dabei je zur Hälfte aus einer Ausgangsverteilung
und dem, was der eigene Pool von sich aus hergibt, gemischt – sonst sähe jedes
Deck gleich aus.

Die Bewertung ist eine Heuristik, kein Turniersieger-Orakel – sie ersetzt keine
echte Metaanalyse, findet aber zuverlässig die stärkste Richtung im eigenen Pool.

## Spielhilfe

Jedes Deck bekommt einen Abschnitt „So spielst du das Deck": Archetyp aus der
Kurve, Spielplan, Schlüsselkarten, Mulligan-Empfehlung, Stärken und Schwächen,
dazu der Fähigkeitstext der Legende und die eigenen Schlachtfelder.

Alle Aussagen sind aus der Deckzusammensetzung abgeleitet und nennen die Zahl,
auf der sie beruhen („Nur 4 Karten gegen gegnerische Einheiten"). Es steckt
bewusst kein Regel- oder Metawissen darin, das sich nicht aus den Kartendaten
belegen lässt.

## Grenzen

* Es gibt keine offene API für Meta-Decks. Tier-Listen von riftdecks.com,
  riftbound.gg, riftools.app oder riftmana.com müssen als Deckliste eingefügt
  werden – die Auswertung passiert dann automatisch.
* Spielmarken (Token, `#T01`) sind in der offiziellen Galerie nicht vollständig
  enthalten und bleiben beim Import ohne Treffer. Für den Deckbau egal.
* Freunde-Abgleich läuft über Copy-Paste, nicht über Accounts. Für echte
  Live-Freundeslisten bräuchte es ein Backend (z. B. Supabase).
