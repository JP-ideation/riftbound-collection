#!/usr/bin/env python3
"""
Erzeugt data/meta.json aus den Turnierlisten unten.

Jede Karte wird gegen data/cards.json, die Domain-Identität der Legende und
die Bannliste geprüft; was nicht passt, fällt mit Hinweis heraus. Danach
immer `node scripts/validate-meta.mjs` laufen lassen.

Neue Liste: Eintrag in `decks` ergänzen (legend = fullName der Legende,
cards = "Anzahl Name; Anzahl Name; …"), weight=2 für Listen nach der
letzten Bannwelle. Tierliste: TIERS anpassen.
"""
import json, re, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DB = json.load(open(os.path.join(ROOT, 'data/cards.json')))['cards']
by = {}
for c in DB:
    by.setdefault(c['fullName'].lower(), c)
BANNED = set(m.lower() for m in re.findall(r"^\s*['\"](.+?)['\"],", open(os.path.join(ROOT, 'js/banlist.js')).read(), re.M))
MOBA = 'mobalytics.gg'
decks = [
 dict(legend='Pridestalker', champion='Rengar', event='Regional Qualifier Los Angeles (DSG Prismaticism, 14-0-2) – nach dem Bann', placement='1.', date='2026-09-27', source='riftbound.zone / riftmana.com', weight=2,
   cards='1 Rengar, Trophy Hunter; 3 Punch First; 3 Sabotage; 3 Inferna; 3 Irresistible Faefolk; 3 Pit Rookie; 2 Thrill of the Hunt; 2 First Mate; 3 Grim Apothecary; 3 Kinkou Initiate; 2 Nidalee, Cat Form; 1 Pakaa Cub; 1 Pyke, Dockside Butcher; 2 Rampage; 3 Kai\'Sa, Survivor; 3 Noxus Hopeful; 1 Darius, Trifarian; 1 Ferrous Forerunner'),
 dict(legend='Blade Dancer', champion='Irelia', event='Regional Qualifier Los Angeles (Xeno) – nach dem Bann', placement='2.', date='2026-09-27', source='riftbound.gg / riftwatch.gg', weight=2,
   cards='1 Irelia, Fervent; 1 Abandon; 1 Akali, Silent; 2 Boots of Swiftness; 2 Charm; 3 Defiant Dance; 3 Defy; 3 Discipline; 2 En Garde; 1 Flash; 1 Guardian Angel; 1 Gust; 1 Not So Fast; 1 Pyke, Returned; 2 Ride the Wind; 3 Scuttle Crab; 2 Star-Crossed; 3 Stellacorn Herder; 3 Tideturner; 1 Twilight Shroud; 1 Vex, Apathetic; 2 Zhonya\'s Hourglass'),
 dict(legend='Wuju Bladesman, Starter', champion='Master Yi', event='Regional Qualifier Utrecht (Bakura)', placement='Top 8', date='2026', source=MOBA,
   cards='3 Lonely Poro; 3 Pit Rookie; 3 Scuttle Crab; 3 First Mate; 2 Akshan, Mischievous; 3 Rengar, Trophy Hunter; 2 Ruin Runner; 2 Zhonya\'s Hourglass; 3 Charm; 3 Defy; 2 En Garde; 3 Punch First; 1 Sabotage'),
 dict(legend='Blade Dancer', champion='Irelia', event='Regional Qualifier Singapur (Big Willy Dfoe)', placement='Best-Of', date='2026-09-05', source=MOBA,
   cards='1 Irelia, Fervent; 1 Lonely Poro; 3 Scuttle Crab; 3 Tideturner; 1 Pyke, Returned; 2 Akali, Silent; 3 Stellacorn Herder; 2 Guardian Angel; 3 Boots of Swiftness; 1 Edge of Night; 2 Charm; 3 Defiant Dance; 3 Defy; 2 En Garde; 2 Stacked Deck; 3 Discipline; 2 Flash; 1 Rebuke; 2 Ride the Wind'),
 dict(legend='Rogue Assassin', champion='Akali', event='Regional Qualifier Barcelona (ASC HaruKaze)', placement='Best-Of', date='2026-08', source=MOBA,
   cards='1 Akali, Deadly Weapon; 3 Lonely Poro; 3 Scuttle Crab; 3 Stellacorn Herder; 1 Irelia, Fervent; 1 Astral Heron; 2 Long Sword; 2 Zhonya\'s Hourglass; 3 Defy; 2 En Garde; 3 Shuriken Flip; 3 Discipline; 2 Falling Star'),
 dict(legend='Heart of the Tempest', champion='Kennen', event='Regional Qualifier Barcelona (ECL Mosik) – vor dem Bann', placement='Top 8', date='2026-08-23', source=MOBA,
   cards='1 Kennen, Storm of Shuriken; 1 Gust Monk; 2 Tideturner; 3 Traveling Merchant; 2 Fizz, Trickster; 3 Nocturne, Horrifying; 1 Tail-Cloaked Matriarch; 1 Baron Nashor; 3 Rhasa the Sunderer; 3 Seal of Discord; 2 Last Rites; 2 Gust; 3 Lightning Rush; 3 Stacked Deck; 1 Hard Bargain; 1 Rebuke; 3 Ride the Wind; 1 Switcheroo; 2 Star-Crossed; 1 Up from the Deep; 1 The Harrowing'),
 dict(legend='Defender of Tomorrow', champion='Jayce', event='Regional Qualifier Singapur (justmilkey)', placement='Best-Of', date='2026-09', source=MOBA,
   cards='1 Jayce, Brilliant Inventor; 3 Elder Dragon; 2 Garbage Grabber; 3 Platewyrm Egg; 1 Gutter Palace; 3 Dazzling Aurora; 3 Bellows Breath; 2 Flurry of Blades; 2 Sabotage; 1 Downstage Dramatics; 3 Dredge Up; 3 Mobilize; 3 Catalyst of Aeons; 1 Deadly Flourish; 1 Rocket Barrage; 3 Promising Future; 2 Sprite Burst; 3 Clairvoyance'),
 dict(legend='Void Burrower', champion="Rek'Sai", event='Regional Qualifier Barcelona (Kevplayer)', placement='Best-Of', date='2026-08', source=MOBA,
   cards="1 Rek'Sai, Breacher; 3 Carrion Dredger; 3 Honest Broker; 2 Inferna; 3 Noxian Emissary; 3 Faithful Manufactor; 2 Vanguard Captain; 1 Vi, Peacekeeper; 3 Noxus Hopeful; 3 Undertitan; 1 Rage Amplifier; 3 Blood Rush; 2 Cleave; 3 Cull the Weak; 3 Falling Star; 1 Hidden Blade; 3 Void Rush"),
 dict(legend='Prodigal Explorer', champion='Ezreal', event='Regional Qualifier Barcelona (PoW SpaghetiCode)', placement='Best-Of', date='2026-08', source=MOBA,
   cards='1 Ezreal, Prodigy; 3 Bewitching Spirit; 2 Fizz, Trickster; 2 Vex, Apathetic; 2 Thousand-Tailed Watcher; 2 Pack of Wonders; 3 Bellows Breath; 3 Stupefy; 3 Stacked Deck; 1 Deadly Flourish'),
 dict(legend='Emperor of the Sands', champion='Azir', event='Regional Qualifier Utrecht (Squirtle)', placement='1.', date='2026', source=MOBA,
   cards="1 Azir, Sovereign; 1 Scuttle Crab; 1 Vi, Peacekeeper; 3 Doran's Shield; 3 Eye of the Herald; 3 Soul Sword; 3 Brutalizer; 3 B.F. Sword; 3 Defy; 3 En Garde; 3 Deathgrip; 3 Discipline; 3 Hidden Blade; 2 Back Off; 2 Guards!; 3 Arise!"),
 dict(legend='Dark Child, Starter', champion='Annie', event='Regional Qualifier Hartford (Prismaticism)', placement='Top 8', date='2026', source=MOBA,
   cards="1 Annie, Stubborn; 3 Inferna; 2 Overzealous Fan; 3 Traveling Merchant; 2 Grim Apothecary; 3 Rengar, Pouncing; 3 Kai'Sa, Survivor; 3 Noxus Hopeful; 2 Vex, Apathetic; 3 Ferrous Forerunner; 3 Long Sword; 2 Cleave; 3 Stacked Deck; 1 Abandon; 3 Flash; 1 Hard Bargain; 2 Star-Crossed"),
 dict(legend='Scorn of the Moon', champion='Diana', event='Regional Qualifier Sydney (CTG Alanzq)', placement='Top 8', date='2026', source=MOBA,
   cards="1 Diana, Lunari; 1 Plundering Poro; 3 Ravenbloom Student; 3 Tideturner; 3 Kha'Zix, Mutating Horror; 3 Vex, Apathetic; 3 Hwei, Brooding Painter; 2 Vex, Cheerless; 1 Thousand-Tailed Watcher; 1 Existential Dread; 3 Stacked Deck; 3 Stupefy; 2 Abandon; 3 Flash; 2 Ride the Wind; 1 Eclipse; 3 Moonfall; 2 Star-Crossed"),
 dict(legend='Scorn of the Moon', champion='Diana', event='Regional Qualifier Hartford (ASC Evansrhim)', placement='Top 8', date='2026', source=MOBA,
   cards="1 Diana, Lunari; 3 Ravenbloom Student; 3 Tideturner; 2 Traveling Merchant; 2 Fizz, Trickster; 3 Vex, Apathetic; 3 Hwei, Brooding Painter; 1 Sprite Fountain; 1 Acceptable Losses; 2 Gust; 3 Stacked Deck; 3 Stupefy; 2 Flash; 2 Hard Bargain; 2 Ride the Wind; 1 Smoke Screen; 1 Eclipse; 3 Moonfall; 2 Star-Crossed"),
 dict(legend='The Boss', champion='Sett', event='Regional Qualifier Utrecht (CTCG Collin K)', placement='3.', date='2026', source=MOBA,
   cards='1 Sett, Kingpin; 1 Punch First; 1 Repulse; 1 Sabotage; 1 Showstopper; 1 Challenge; 1 Cithria of Cloudfield; 1 Hidden Blade; 1 Irresistible Faefolk; 1 Pit Rookie; 1 Arena Bar; 1 Call to Glory; 1 First Mate; 1 Fiora, Victorious; 1 Kinkou Monk; 1 Rengar, Trophy Hunter; 1 Vi, Peacekeeper'),
 dict(legend='Herald of the Arcane', champion='Viktor', event='Regional Qualifier Utrecht (Rednaxell)', placement='2.', date='2026', source=MOBA,
   cards="3 Carrion Dredger; 3 Honest Broker; 2 Card Sharp; 1 Chakram Dancer; 3 Xin Zhao, Vigilant; 2 Vi, Peacekeeper; 2 Thousand-Tailed Watcher; 2 Sprite Fountain; 2 Bellows Breath; 3 Stupefy; 3 Cull the Weak; 1 Facebreaker; 3 Hidden Blade; 1 Salvage; 2 Shadow's Call; 1 Eclipse; 2 Wages of Pain; 3 Imperial Decree"),
 dict(legend='Hand of Noxus', champion='Darius', event='Regional Qualifier Utrecht (MICE DiamondHat)', placement='Top 8', date='2026', source=MOBA,
   cards="3 Carrion Dredger; 3 Honest Broker; 2 Inferna; 3 Vanguard Captain; 3 Xin Zhao, Vigilant; 3 Noxus Hopeful; 3 Spectral Matron; 3 Safety Inspector; 2 Vi, Peacekeeper; 2 Seal of Unity; 3 Baited Hook; 1 Falling Star; 3 Hidden Blade; 3 Rally the Troops; 1 Shadow's Call; 1 Grand Strategem"),
 dict(legend='Fire Below the Mountain', champion='Ornn', event='Regional Qualifier Barcelona (MICE TheManland)', placement='1.', date='2026-08-23', source=MOBA,
   cards="1 Ornn, Blacksmith; 3 Seal of Focus; 2 Charm; 1 Cloth Armor; 3 Defy; 3 Poro Snax; 3 Brutalizer; 3 Clockwork Keeper; 1 Guardian Angel; 1 Mask of Foresight; 3 Patched Porobot; 3 Scuttle Crab; 3 Sprite Fountain; 2 Aspiring Engineer; 1 Lecturing Yordle; 3 Pit Crew; 3 Sterak's Gage; 1 Helm of Suppression"),
 dict(legend='Purifier', champion='Lucian', event='Regional Qualifier Hartford (Kaillou)', placement='Best-Of', date='2026', source=MOBA,
   cards="1 Lucian, Merciless; 3 Gem Jammer; 3 Irresistible Faefolk; 1 Legion Rearguard; 2 First Mate; 2 Kinkou Initiate; 3 Kai'Sa, Survivor; 2 Noxus Hopeful; 1 Poppy, Paragon; 2 Ruin Runner; 3 Doran's Blade; 3 Long Sword; 3 Blighted Battleaxe; 1 Trinity Force; 3 Punch First; 2 Sabotage; 2 Challenge; 3 Relentless Pursuit"),
 dict(legend='Purifier', champion='Lucian', event='Regional Qualifier Sydney (LockOn)', placement='Best-Of', date='2026', source=MOBA,
   cards="1 Lucian, Merciless; 2 Gem Jammer; 3 Irresistible Faefolk; 3 First Mate; 3 Kinkou Initiate; 3 Kai'Sa, Survivor; 3 Ruin Runner; 3 Doran's Blade; 3 Skyfall of Areion; 2 Blighted Battleaxe; 3 Trinity Force; 2 Punch First; 2 Sabotage; 2 Challenge; 2 Confront; 3 Relentless Pursuit"),
 dict(legend='Heart of the Tempest', champion='Kennen', event='CCS $25.000 Showdown Invitational Qualifier (Koko Lopez) – nach dem Bann', placement='7.', date='2026-10', source='tcgplayer.com', weight=2,
   cards='1 Kennen, Storm of Shuriken; 1 Baron Nashor; 2 Ezreal, Prodigy; 2 Fizz, Trickster; 1 Flash; 1 Gust; 2 Last Rites; 3 Lightning Rush; 3 Rhasa the Sunderer; 1 Ride the Wind; 1 Salvage; 3 Seal of Discord; 3 Shadow Order Disciple; 1 Shadows of the Past; 2 Star-Crossed; 2 Switcheroo; 3 Tail-Cloaked Matriarch; 1 The Harrowing; 1 Tideturner; 2 Tornado Warrior; 3 Traveling Merchant; 1 Treasure Hunter'),
 dict(legend='Heart of the Tempest', champion='Kennen', event='Convergence #3 (Subops Gastaidon) – nach dem Bann', placement='5.', date='2026-10', source='tcgplayer.com', weight=2,
   cards='3 Seal of Discord; 1 Sivir, Mercenary; 2 Star-Crossed; 1 Switcheroo; 1 Tactical Retreat; 2 Tail-Cloaked Matriarch; 1 Tideturner; 3 Tornado Warrior; 3 Traveling Merchant; 3 Trifarian Gloryseeker; 1 Unsung Hero; 2 Fizz, Trickster; 1 Cemetery Attendant; 1 Edge of Night; 1 Existential Dread; 3 Call to Glory'),
 dict(legend='Bounty Hunter', champion='Miss Fortune', event='Regional Qualifier Utrecht (Vendilion)', placement='Best-Of', date='2026', source=MOBA,
   cards='1 Miss Fortune, Captain; 3 Mindsplitter; 3 Elder Dragon; 3 Scryer\'s Bloom; 2 Last Rites; 3 Dazzling Aurora; 3 Bullet Time; 1 Flurry of Blades; 3 Gust; 2 Repulse; 3 Sabotage; 3 Stacked Deck; 3 Mobilize; 3 Lunar Boon; 3 Catalyst of Aeons; 1 The Harrowing'),
 dict(legend='Chem-Baroness', champion='Renata Glasc', event='Regional Qualifier Singapur (Purp)', placement='Best-Of', date='2026-09', source=MOBA,
   cards="1 Renata Glasc, Mastermind; 2 Enthralling Protector; 3 Patched Porobot; 3 Plundering Poro; 2 Kennen, Keeper of Balance; 3 Pit Crew; 1 Bard, Mercurial; 1 Vi, Peacekeeper; 2 Thousand-Tailed Watcher; 3 Shepherd's Heirloom; 3 Sprite Fountain; 2 Stupefy; 2 Deathgrip; 3 Hidden Blade"),
 dict(legend='Deceiver', champion='LeBlanc', event='Kernkarten aus Top-Listen (Xi\'an Top 8, Sydney 7., RQ Los Angeles 12.)', placement='Top 8', date='2026-09', source=MOBA,
   cards='1 LeBlanc, Fragmented; 3 Soaring Scout; 3 Watchful Sentry; 3 Mirror Image; 2 Karthus, Eternal; 2 Glasc Mixologist; 2 Ruined Rex; 2 Black Rose Dignitary; 2 Honest Broker; 2 Cull the Weak; 2 Deathgrip; 2 Hidden Blade; 2 Harnessed Dragon; 2 Rift Herald; 2 Baited Hook'),
 dict(legend='Loose Cannon', champion='Jinx', event='Regional Qualifier Vancouver (Spiritless)', placement='Best-Of', date='2026', source=MOBA,
   cards="1 Jinx, Demolitionist; 3 Inferna; 2 Overzealous Fan; 1 Tideturner; 3 Traveling Merchant; 3 Vi, Destructive; 3 Pyke, Dockside Butcher; 3 Sharkling; 2 Kha'Zix, Mutating Horror; 3 Noxus Hopeful; 2 Vex, Apathetic; 1 Blood Rush; 2 Cleave; 1 Gust; 2 Stacked Deck; 1 Falling Star; 1 Flash; 1 Hard Bargain; 2 Ride the Wind; 2 Switcheroo; 1 Star-Crossed"),
 dict(legend='Gloomist', champion='Vex', event='Regional Qualifier Sydney (EEP Bonk Repeat)', placement='Top 4', date='2026', source=MOBA,
   cards="1 Vex, Apathetic; 3 Evelynn, Entrancing; 3 Mutated Mouser; 3 Teemo, Scout; 2 Treasure Hunter; 2 Pyke, Returned; 2 Ember Monk; 2 Kha'Zix, Mutating Horror; 2 Sona, Harmonious; 2 Boots of Swiftness; 2 Edge of Night; 2 Defy; 2 Existential Dread; 2 Gust; 3 Discipline; 3 Emperor's Divide; 1 Switcheroo; 2 Back Off; 1 Star-Crossed"),
 dict(legend='Grand Duelist', champion='Fiora', event='Regional Qualifier Singapur (Fr0zen)', placement='Top 8', date='2026-09', source=MOBA,
   cards="1 Fiora, Worthy; 2 Poppy, Paragon; 3 Rengar, Trophy Hunter; 1 Sett, Brawler; 2 Harnessed Dragon; 3 Rift Herald; 3 Elder Dragon; 2 Divining Shells; 3 Shepherd's Heirloom; 3 Dazzling Aurora; 2 Flurry of Blades; 2 Repulse; 3 Sacrifice; 2 Challenge; 3 Mobilize; 2 Riposte; 3 Rampage"),
 dict(legend='Grand Duelist', champion='Fiora', event='Regional Qualifier Atlanta (VVES) – Quelle nennt 41 Karten, 1× Call to Glory gestrichen', placement='Best-Of', date='2026', source=MOBA,
   cards="1 Fiora, Victorious; 3 Pit Rookie; 3 Unsung Hero; 3 First Mate; 2 Spectral Matron; 3 Sett, Brawler; 3 Karma, Channeler; 2 Doran's Blade; 3 B.F. Sword; 3 Punch First; 2 Sabotage; 3 Challenge; 3 Deathgrip; 2 Hidden Blade; 3 Riposte; 1 Call to Glory"),
 dict(legend='Grand Duelist', champion='Fiora', event='Regional Qualifier Vancouver (Ricemaster)', placement='Best-Of', date='2026', source=MOBA,
   cards="1 Fiora, Worthy; 3 Akshan, Mischievous; 3 Fiora, Victorious; 3 Sett, Brawler; 1 Harnessed Dragon; 3 Rift Herald; 3 Elder Dragon; 2 Doran's Blade; 3 Shepherd's Heirloom; 3 Dazzling Aurora; 1 Punch First; 3 Sacrifice; 3 Challenge; 3 Divining Shells; 2 Grim Resolve; 3 Riposte"),
 dict(legend='Voidreaver', champion="Kha'Zix", event='Vendetta-Turnierliste (riftdecks.com)', placement='Top 8', date='2026-09', source='riftdecks.com',
   cards="1 Kha'Zix, Mutating Horror; 2 Baron Nashor; 2 Dragonsoul Sage; 2 Fizz, Trickster; 1 Here to Help; 3 Illaoi, Prophet of the Great Kraken; 3 Irresistible Faefolk; 3 Mister Root; 1 Overt Operation; 2 Punch First; 2 Rampage; 3 Rengar, Trophy Hunter; 1 Ride the Wind; 3 Stacked Deck; 2 Star-Crossed; 1 Switcheroo; 3 Up from the Deep; 3 Void Assault; 2 Zed, Without a Sound"),
 dict(legend='Daughter of the Void', champion="Kai'Sa", event='Kernkarten aus Top-8-Listen (SCG Vegas 10K, RQ Houston) – Anzahl teils geschätzt', placement='Top 8', date='2026', source=MOBA,
   cards="1 Kai'Sa, Survivor; 3 Ravenbloom Student; 3 Hextech Ray; 2 Watchful Sentry; 2 Cleave; 2 Retreat; 2 Stupefy; 2 Falling Star; 2 Pouty Poro; 1 Darius, Trifarian; 2 Thousand-Tailed Watcher; 2 Smoke Screen; 2 Void Seeker"),
]
legends = {c['fullName'].lower(): c for c in DB if c['type']=='legend'}
out, report = [], []
for d in decks:
    L = legends.get(d['legend'].lower())
    assert L, d['legend']
    ident = set(L['domains'])
    cards, dropped = [], []
    for part in d['cards'].split(';'):
        m = re.match(r'\s*(\d+)\s+(.+?)\s*$', part)
        n, name = int(m[1]), m[2]
        c = by.get(name.lower())
        if not c: dropped.append(f'{name} (nicht in DB)'); continue
        if c['type'] not in ('unit','spell','gear'): dropped.append(f'{name} (Typ {c["type"]})'); continue
        if any(x!='colorless' and x not in ident for x in c['domains']): dropped.append(f'{name} (Domain {c["domains"]})'); continue
        if name.lower() in BANNED: dropped.append(f'{name} (gebannt)'); continue
        cards.append([c['fullName'], min(n,3)])
    out.append(dict(weight=d.get('weight', 1), name=f"{d['champion']} – {L['name']} · {d['event']}", legend=L['fullName'], event=d['event'], placement=d['placement'], date=d['date'], source=d['source'], cards=cards))
    report.append(f"{d['champion']:10} {len(cards):2} Karten ({sum(x[1] for x in cards):2} Ex.) | entfernt: {', '.join(dropped) or '-'}")
print('\n'.join(report))
TIERS = {
  'Blade Dancer': 1, 'Wuju Bladesman, Starter': 1,
  'Pridestalker': 2, 'Deceiver': 2, 'Emperor of the Sands': 2, 'Rogue Assassin': 2, 'Heart of the Tempest': 2,
  'Gloomist': 3, 'Defender of Tomorrow': 3, 'Void Burrower': 3, 'Grand Duelist': 3, 'Daughter of the Void': 3,
  'Voidreaver': 3, 'Fire Below the Mountain': 3, 'Scorn of the Moon': 3, 'Purifier': 3, 'Prodigal Explorer': 3,
}
for k in TIERS: assert k.lower() in legends, k
json.dump(dict(
  updated='2026-10-05',
  tiers=dict(source='riftbound.gg/tier-list', date='2026-10-03',
             legends={legends[k.lower()]['fullName']: t for k, t in TIERS.items()}),
  note='Kernlisten aus Top-8- und Best-Of-Decks der Regional Qualifiers der Vendetta-Saison (Utrecht, Barcelona, Singapur, Sydney, Hartford, Vancouver, Atlanta, Los Angeles) und Turniere nach dem Bann vom 18.09. (RQ Los Angeles; Kennen: CCS Invitational Qualifier, Convergence #3). Aus öffentlich einsehbaren Turnierberichten übernommen und gegen die offizielle Kartendatenbank, die Domain-Identität der Legende und die Bannliste vom 18.09.2026 geprüft. Listen nach dem Bann zählen doppelt. Teils unvollständig; Sideboards nicht enthalten.',
  decks=out), open(os.path.join(ROOT, 'data/meta.json'),'w'), ensure_ascii=False, indent=1)
