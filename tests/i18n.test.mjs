import assert from 'node:assert/strict';
import test from 'node:test';

const saved = new Map();
const buttons = [
  { lang: 'de', setAttribute(_name, value) { this.pressed = value; } },
  { lang: 'en', setAttribute(_name, value) { this.pressed = value; } }
];

globalThis.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
globalThis.NodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
globalThis.document = {
  readyState: 'loading',
  addEventListener() {},
  documentElement: { lang: 'en' },
  body: { nodeType: 1, matches() { return false; }, closest() { return null; }, hasAttribute() { return false; } },
  querySelectorAll() { return buttons; },
  createTreeWalker() { return { nextNode() { return false; } }; }
};
Object.defineProperty(globalThis, 'navigator', { value: { language: 'de-CH' }, configurable: true });
globalThis.localStorage = {
  getItem(key) { return saved.get(key) ?? null; },
  setItem(key, value) { saved.set(key, value); }
};
globalThis.window = { dispatchEvent() {} };

const { getLanguage, setLanguage, t } = await import('../js/i18n.js');

test('browser language selects German and translates static and generated game text', () => {
  assert.equal(getLanguage(), 'de');
  assert.equal(t('Golden Hour'), 'Goldene Stunde');
  assert.equal(t('Start Golf at the Golf Club Davos'), 'Starten: Golf im Golf Club Davos');
  assert.equal(t('You are at Davos Platz'), 'Du bist bei Davos Platz');
  assert.match(t("The Natureisbahn Davos, Europe's largest natural ice rink: two laps"), /^Zwei Runden/);
});

test('language switch updates document language, controls and saved preference', () => {
  setLanguage('en');
  assert.equal(t('Golden Hour'), 'Golden Hour');
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(buttons[1].pressed, 'true');
  setLanguage('de');
  assert.equal(t('Golden Hour'), 'Goldene Stunde');
  assert.equal(saved.get('slopdavos-language'), 'de');
  assert.equal(buttons[0].pressed, 'true');
});

test('the Victoria shift translates its steps, rooms, pops and summaries', () => {
  setLanguage('de');
  assert.equal(t('A shift at the Turmhotel Victoria'), 'Eine Schicht im Turmhotel Victoria');
  assert.match(t('A busy day at the Turmhotel Victoria in Davos Dorf, and half the staff is down with the flu.'), /^Viel los im Turmhotel Victoria/);
  assert.equal(t('12 m to the Turmhotel Victoria'), '12 m bis zum Turmhotel Victoria');
  assert.equal(t('Get out (F) and walk into the Turmhotel Victoria'), 'Steig aus (F) und geh ins Turmhotel Victoria');
  assert.equal(t('Room 204 · 12 s · 180 pts'), 'Zimmer 204 · 12 s · 180 Pkt.');
  assert.equal(t('The Müllers from Basel are back soon. Pick a chore'), 'Die Müllers aus Basel kommen bald zurück. Wähl eine Arbeit');
  assert.equal(t('Fresh towels: done  +60'), 'Frische Tücher: erledigt  +60');
  assert.equal(t('Make the bed: scrub left, right, left …'), 'Bett machen: links, rechts, links wischen …');
  assert.equal(t('Spotless! 7 s to spare  +170'), 'Blitzblank! 7 s übrig  +170');
  assert.equal(t('The guest is back: 2 chores undone'), 'Der Gast ist zurück: 2 Arbeiten nicht erledigt');
  assert.equal(t('Lunch service · 2 of 8 dishes · 100 pts'), 'Mittagsservice · 2 von 8 Gerichten · 100 Pkt.');
  assert.equal(t('Capuns: perfect!  +118'), 'Capuns: perfekt!  +118');
  assert.equal(t('Rösti: burnt!  -40'), 'Rösti: angebrannt!  -40');
  assert.equal(t('Table 5: Capuns'), 'Tisch 5: Capuns');
  assert.equal(t('Burner 2'), 'Platte 2');
  assert.equal(t('Sorting · item 1 of 12 · 248 pts'), 'Sortieren · Stück 1 von 12 · 248 Pkt.');
  assert.equal(t('Red napkin in the whites: pink sheets!  -40'), 'Rote Serviette in der Weisswäsche: rosa Leintücher!  -40');
  assert.equal(t('Bed sheet: on the floor  -10'), 'Leintuch: auf dem Boden  -10');
  assert.equal(t('Caught in the rollers!  -40'), 'In die Walze geraten!  -40');
  assert.equal(t('Whites  +28'), 'Weisses  +28');
  assert.equal(t('The tower suite: 5 of 7 chores'), 'Die Turmsuite: 5 von 7 Arbeiten');
  assert.equal(t('7 of 8 dishes served · 5 perfect · 1 burnt'), '7 von 8 Gerichten serviert · 5 perfekt · 1 angebrannt');
  assert.equal(t('11 of 12 sorted right · 3 of 5 sheets crisp · pink sheets'), '11 von 12 richtig sortiert · 3 von 5 Leintüchern glatt · rosa Leintücher');
  setLanguage('en');
});

test('the bar missions translate names, intros and generated texts', () => {
  setLanguage('de');
  assert.equal(t('Nageln in the Tijuana Bar'), 'Nageln in der Tijuana Bar');
  assert.match(t('Rock’n’roll in the Tijuana Bar on the Talstrasse, and tonight the stump comes out.'), /^Rock’n’Roll in der Tijuana Bar/);
  assert.equal(t('Barista at the Kafi Klatsch'), 'Barista im Kafi Klatsch');
  assert.match(t('Morning rush at the Kafi Klatsch on the Promenade.'), /^Morgenansturm im Kafi Klatsch/);
  assert.equal(t('Game 2 of 3 · round 4 · 1 won · 350 pts'), 'Partie 2 von 3 · Runde 4 · 1 gewonnen · 350 Pkt.');
  assert.equal(t('Flurin swings …'), 'Flurin holt aus …');
  assert.equal(t('Order 3 of 12 · 120 pts · 0 walked out'), 'Bestellung 3 von 12 · 120 Pkt. · 0 gegangen');
  assert.equal(t('Schale, please!'), 'Schale, bitte!');
  assert.equal(t('12 m to the Tijuana Bar'), '12 m bis zur Tijuana Bar');
  assert.equal(t('Bent the nail: turn lost'), 'Nagel verbogen: Zug verloren');
  assert.equal(t('Someone has been nailing in the Tijuana again. The whole Talstrasse heard it.'), 'Im Tijuana wurde wieder genagelt. Die ganze Talstrasse hat es gehört.');
  setLanguage('en');
});

test('the expert missions translate names, intros, generated texts and every text of their canvases', async () => {
  setLanguage('de');
  assert.equal(t('Eye test at Meerkämper Optik'), 'Sehtest bei Meerkämper Optik');
  assert.match(t('A busy morning at Meerkämper Optik on the Promenade, and you are the optician.'), /^Ein strenger Morgen/);
  assert.equal(t('Snow profile for the SLF'), 'Schneeprofil fürs SLF');
  assert.match(t('At the SLF in Davos Dorf the avalanche forecasters want a fresh profile.'), /^Beim SLF/);
  assert.equal(t('12 m to the SLF'), '12 m bis zum SLF');
  assert.equal(t('12 m to Meerkämper Optik'), '12 m bis zu Meerkämper Optik');
  assert.equal(t('340 pts · 2 of 4 customers · 1:30'), '340 Pkt. · 2 von 4 Kunden · 1:30');
  assert.equal(t('Compression test · 2:05'), 'Kompressionstest · 2:05');
  assert.match(t('Hardness 200 · grain 100 · temperature 150 · break 100 · danger 80 · time 20'), /^Härte 200 · Korn 100/);
  assert.equal(t('4 of 4 customers · 3 exact · 100 · 90'), '4 von 4 Kunden · 3 exakt · 100 · 90');
  // every literal the canvas draws goes through t(), and every one of them has its German
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../js/missions-expert.js', import.meta.url), 'utf8');
  const literals = [...source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1]);
  assert.ok(literals.length > 40, `${literals.length} canvas texts found`);
  const data = await import('../js/missions-data-expert.js');
  const texts = [
    ...literals,
    ...data.HARDNESS.map((v) => v.name), ...data.GRAINS.map((v) => v.name), ...data.DANGER.map((v) => v.name),
    ...Object.values(data.EYE_LINES), ...data.EYE_REACTIONS, ...Object.values(data.SNOW_STAGE_TEXT),
    ...data.createEyeTest(1).customers.flatMap((c) => [c.job, c.hello])
  ];
  const same = new Set(['Thermometer']);
  for (const text of texts) if (!same.has(text)) assert.notEqual(t(text), text, `"${text}" has its German`);
});

test('the rural missions translate names, intros and generated texts', () => {
  setLanguage('de');
  assert.equal(t('Quad ride from Heldstab'), 'Quadfahrt ab Heldstab');
  assert.equal(t('Green waste to the biogas plant'), 'Bioabfall zur Biogasanlage');
  assert.match(t('Heldstab AG on the Bahnhofstrasse in Davos Dorf sells'), /^Die Heldstab AG/);
  assert.match(t("The hotels' kitchens fill a barrel of green waste a day, and it goes to the biogas plant."), /^Die Hotelküchen.*Dischmastrasse/);
  assert.equal(t('Gate 3/11 · 120 m · 2 clean jumps'), 'Tor 3/11 · 120 m · 2 saubere Sprünge');
  assert.equal(t('Barrels 4/10 · load 38 % · next 90 m'), 'Fässer 4/10 · Ladung 38 % · nächstes 90 m');
  assert.equal(t('Barrels 4/10 · load 38 % · next Hotel Seehof 90 m'), 'Fässer 4/10 · Ladung 38 % · nächstes Hotel Seehof 90 m');
  assert.equal(t('Collect the barrels at the hotels'), 'Fässer bei den Hotels einsammeln');
  assert.equal(t('Out along the Dischmastrasse: it is cleared in winter'), 'Hinaus über die Dischmastrasse: Sie wird im Winter geräumt');
  assert.equal(t('Loading … 40 % · Space: reject the barrel'), 'Laden … 40 % · Leertaste: Fass stehen lassen');
  assert.equal(t('2 clean jumps (-3 s) · 4 mud and snow patches crossed'), '2 saubere Sprünge (-3 s) · 4 Schlamm- und Schneefelder durchquert');
  assert.equal(t('Biogas plant'), 'Biogasanlage');
});

test('the care missions translate names, intros and generated texts', () => {
  setLanguage('de');
  assert.equal(t('Snowshoeing on the Junkerboden'), 'Schneeschuhlaufen am Junkerboden');
  assert.match(t('Fresh snow on the Junkerboden, the terrace above Frauenkirch.'), /^Neuschnee/);
  assert.equal(t('A plaster cast at the Spital'), 'Bein gipsen im Spital');
  assert.match(t('A busy day in the plaster room of the Spital Davos.'), /^Viel los im Gipszimmer/);
  assert.equal(t('120 m to the flag'), '120 m bis zum Fähnli');
  assert.equal(t('80 % on the packed line · 1 times in the Wildruhezone · 2 grouse startled · 3 stumbles'), '80 % auf der Spur · 1-mal in der Wildruhezone · 2 Birkhühner aufgeschreckt · 3 Stolperer');
  assert.equal(t('Patient 2 of 3 · 120 pts · 1:30'), 'Patient 2 von 3 · 120 Pkt. · 1:30');
  assert.equal(t('2 gaps · 1 lumps'), '2 Lücken · 1 Klumpen');
  assert.equal(t('Too soggy'), 'Zu nass');
});

test('gastro, resort and après-ski missions translate names, intros and generated texts', () => {
  setLanguage('de');
  assert.equal(t('Flämmli in the Rot Liechtli'), 'Flämmli im Rot Liechtli');
  assert.match(t('Evening in the Rot Liechtli, the little pub in Davos Platz. A Flämmli is a Swiss shot.'), /^Abend im Rot Liechtli/);
  assert.match(t('Friday night at Pizza Heaven, the Pizzakurier on the Promenade.'), /^Freitagabend im Pizza Heaven/);
  assert.equal(t('Lift attendant at the Hauptertäli'), 'Liftwart am Hauptertäli');
  assert.match(t('A sunny day on the Parsenn, and the lift hut’s radio plays a Ländler.'), /^Ein sonniger Tag/);
  assert.equal(t('Waxing skis at Hofmänner'), 'Skis wachsen bei Hofmänner');
  assert.match(t('Saturday morning at Sport Hofmänner on the Mattastrasse.'), /^Samstagmorgen/);
  assert.equal(t('Parking marshal at the Jakobshornbahn'), 'Parkplatzeinweiser bei der Jakobshornbahn');
  assert.equal(t('Sommerrodelbahn on the Schatzalp'), 'Sommerrodelbahn auf der Schatzalp');
  assert.match(t('Up on the Schatzalp, above the old sanatorium, a stainless steel trough'), /^Oben auf der Schatzalp/);
  assert.equal(t('120 m to the finish · 1 bump · 2 rams (+11 s)'), '120 m bis zum Ziel · 1 Rumms · 2-mal aufgefahren (+11 s)');
  assert.equal(t('2 bumps · 0 rams · top speed 44 km/h'), '2 Rummse · 0-mal aufgefahren · Höchsttempo 44 km/h');
  assert.match(t('A bluebird winter morning and half of Davos wants up the Jakobshorn.'), /^Ein Wintermorgen/);
  assert.equal(t('Après-ski at the Bolgenschanze'), 'Après-Ski in der Bolgenschanze');
  assert.match(t('Last run done, boots still on: the après-ski party at the Bolgenschanze.'), /SPRINGEN/);
  assert.match(t('Metal night at the BOX Davos on the Bahnhofstrasse in Davos Dorf.'), /×5/);
  assert.equal(t('JUMP'), 'SPRINGEN');
  assert.equal(t('Crane driver at the Hotel Derby'), 'Kranführer beim Hotel Derby');
  assert.match(t('A new wing for the Hotel Derby in Davos Dorf, and the crane driver is off sick.'), /Turmkran/);
  assert.equal(t('Set the hotel jacuzzi down: 3.2 m off · 1.0 m above · swing 0.4 m · 2 hits'), 'Hotel-Jacuzzi absetzen: 3.2 m daneben · 1.0 m darüber · Pendeln 0.4 m · 2 Treffer');
  assert.equal(t('45 m to the crane ladder'), '45 m bis zur Kranleiter');
  assert.equal(t('Carting the snow to the Davosersee'), 'Schnee abführen an den Davosersee');
  assert.match(t('The drifts on the Bündastrasse have to go.'), /Davosersee/);
  assert.equal(t('Truck 7.4 of 14 m³ · 96 % on the bed'), 'Lastwagen 7.4 von 14 m³ · 96 % auf der Brücke');
  assert.equal(t('1.2 km to the snow dump · 14.0 m³'), '1.2 km bis zur Schneedeponie · 14.0 m³');
  assert.equal(t('Alight  +45'), 'Es brennt  +45');
  assert.equal(t('Margherita: flawless!  +160'), 'Margherita: makellos!  +160');
  assert.equal(t('120 m to the Eisstadion, Talstrasse 41 · 80 % hot'), '120 m bis zum Eisstadion, Talstrasse 41 · 80 % heiss');
  assert.equal(t('5 skiers up · 1:30 · run of 4'), '5 Skifahrer oben · 1:30 · Serie von 4');
  assert.equal(t('12 skiers'), '12 Skifahrer');
  assert.equal(t('pts · 3 pairs · 90 s · read the board, pick the wax (1-5 or tap)'), 'Pkt. · 3 Paare · 90 s · Tafel lesen, Wachs wählen (1–5 oder antippen)');
});

test('the rope park and the Seehofseeli translate names, intros and generated texts', () => {
  setLanguage('de');
  assert.equal(t('Rope park in the Färich'), 'Seilpark im Färich');
  assert.match(t('The Adventure Park Färich, in the trees at the mouth of the Flüela valley.'), /^Der Adventure Park Färich/);
  assert.equal(t('Hockey on the Seehofseeli'), 'Hockey auf dem Seehofseeli');
  assert.match(t('Dusk on the Seehof Seeli, the little pond.'), /^Abenddämmerung/);
  assert.equal(t('Clip your carabiners: Space (1/2)'), 'Karabiner einhängen: Space (1/2)');
  assert.equal(t('12 m to the next deck'), '12 m bis zur nächsten Plattform');
  assert.equal(t('1 fall · 0 forgotten · soft landing'), '1 Sturz · 0 vergessen · weiche Landung');
  assert.equal(t('You 2 : 1 Locals · 2:05'), 'Du 2 : 1 Einheimische · 2:05');
  assert.equal(t('Won 5 : 2 · your goals: 3'), 'Gewonnen 5 : 2 · deine Tore: 3');
  assert.equal(t('Won 5 : 2 · your goals: 3 · assists: 1'), 'Gewonnen 5 : 2 · deine Tore: 3 · Assists: 1');
  assert.equal(t('Body check: the puck is loose!'), 'Bodycheck: Der Puck ist frei!');
  assert.equal(t('3 goals ahead'), '3 Tore Vorsprung');
});

test('the WEF missions translate names, intros, generated texts and slogans', () => {
  setLanguage('de');
  assert.equal(t('Escort at the WEF'), 'Eskorte am WEF');
  assert.equal(t('Lead the anti-WEF march'), 'Anti-WEF-Demo anführen');
  assert.match(t('January, the World Economic Forum, and Davos is a fortress.'), /^Januar/);
  assert.match(t('The Forum is in town, and so is the registered counter-march.'), /^Das Forum/);
  assert.equal(t('120 m to the Promenade gate · under 30 km/h'), '120 m bis zur Schleuse Promenade · unter 30 km/h');
  assert.equal(t('1.2 km to the Kongresszentrum'), '1.2 km bis zum Kongresszentrum');
  assert.equal(t('34 marchers · 90 m to the rally point'), '34 Leute · 90 m bis zum Kundgebungsplatz');
  assert.equal(t('34 marchers · 90 m on the Promenade'), '34 Leute · noch 90 m auf der Promenade');
  assert.equal(t('Davos for the Davosers!'), 'Davos den Davosern!');
  assert.equal(t('The delegation is boarding … 3 s'), 'Die Delegation steigt ein … 3 s');
  assert.equal(t('Cohesion 90 % · composure 88 · 1 crashes · 0 gates rushed'), 'Zusammenhalt 90 % · Fassung 88 · 1 Unfälle · 0 Schleusen zu schnell');
  assert.equal(t('DAVOS FOR THE DAVOSERS'), 'DAVOS DEN DAVOSERN');
});

test('the game\'s clock, the fast-forward and the missions\' windows speak German', () => {
  setLanguage('de');
  assert.equal(t('Day 5 · Winter'), 'Tag 5 · Winter');
  assert.equal(t('Day 1 · Summer'), 'Tag 1 · Sommer');
  assert.equal(t('Day 12 · Summer · 07:30'), 'Tag 12 · Sommer · 07:30');
  assert.equal(t('Fast-forward'), 'Vorspulen');
  assert.equal(t('To the next morning'), 'Zum nächsten Morgen');
  assert.equal(t('To the winter'), 'Zum Winter');
  assert.equal(t('In 3 days · 07:00'), 'In 3 Tagen · 07:00');
  assert.equal(t('Tomorrow · 07:00'), 'Morgen · 07:00');
  assert.equal(t('Opens at 18:00'), 'Öffnet um 18:00');
  assert.equal(t('In summer: in 3 days'), 'Im Sommer: in 3 Tagen');
  assert.equal(t('In winter: in 1 day'), 'Im Winter: in 1 Tag');
  assert.equal(t('Wait until then'), 'Bis dann warten');
  assert.equal(t('Ready: the clock starts with your first input'), 'Bereit: Die Stoppuhr läuft ab deiner ersten Eingabe');
  assert.equal(t('first completion +250'), 'erster Abschluss +250');
  assert.equal(t(' Silver 4:00'), ' Silber 4:00');
  assert.equal(t(' Gold 120 pts'), ' Gold 120 Pkt.');
  setLanguage('en');
  assert.equal(t('Opens at 18:00'), 'Opens at 18:00');
  setLanguage('de');
});

test('the end panels: failed and aborted, the awards, the score units and the summaries come in German', () => {
  setLanguage('de');
  assert.equal(t('Mission failed'), 'Mission gescheitert');
  assert.equal(t('Mode switch (car): the mission was aborted.'), 'Moduswechsel (car): Die Mission wurde abgebrochen.');
  assert.equal(t('first completion +250 · Silver +300'), 'erster Abschluss +250 · Silber +300');
  assert.equal(t('3 goals'), '3 Tore');
  assert.equal(t('Gold 3 goals ahead'), 'Gold 3 Tore Vorsprung');
  assert.equal(t('2 shots · 1 hit · 1 missed'), '2 Schüsse · 1 Treffer · 1 daneben');
  assert.equal(t('1 crash (+5 s)'), '1 Sturz (+5 s)');
  assert.equal(t('Over the limit 4 s (up to +7 km/h): −20 pts'), 'Über dem Limit 4 s (bis +7 km/h): −20 Pkt.');
  assert.equal(t('Down the Chüggelibahn'), 'Die Chüggelibahn hinunter');
});

test('the leaderboards\' comparison and the email sign-in read in German', () => {
  setLanguage('de');
  assert.equal(t('Place 7 of 23 · 4.1 s behind place 6 · 01:09.1 behind the leader'), 'Platz 7 von 23 · 4,1 s hinter Platz 6 · 01:09.1 hinter der Spitze');
  assert.equal(t('You lead by 750 points over place 2'), 'Du führst mit 750 Punkten vor Platz 2');
  assert.equal(t('Place 17 of 37 · 500 points behind place 16 · 15250 points behind the leader'), 'Platz 17 von 37 · 500 Punkte hinter Platz 16 · 15250 Punkte hinter der Spitze');
  assert.equal(t('Place 2 of 3'), 'Platz 2 von 3');
  assert.equal(t('We sent a code to '), 'Wir haben einen Code geschickt an ');
  assert.equal(t('Leaderboards'), 'Bestenlisten');
  assert.equal(t('Place 2 of 5 · 3 goals behind place 1'), 'Platz 2 von 5 · 3 Tore hinter Platz 1');
  assert.equal(t('You lead by 1 goals over place 2'), 'Du führst mit 1 Tor vor Platz 2');
  assert.equal(t('You lead by 2 goals ahead over place 2'), 'Du führst mit 2 Tore Vorsprung vor Platz 2');
  assert.equal(t('Place 4 of 9 · 40 pts behind place 3 · 120 pts behind the leader'), 'Platz 4 von 9 · 40 Pkt. hinter Platz 3 · 120 Pkt. hinter der Spitze');
});

test('the jetpack demo speaks German', async () => {
  const { JETPACK_MISSION, createJet } = await import('../js/missions-data-jetpack.js');
  setLanguage('de');
  try {
    assert.equal(t(JETPACK_MISSION.title), 'Jetpack-Demo: vom Kongress auf die Schatzalp');
    assert.match(t(JETPACK_MISSION.intro), /^Januar, das World Economic Forum\. Ein Start-up aus Zürich/);
    assert.match(t(JETPACK_MISSION.finish), /Zauberbergs/);
    for (const o of JETPACK_MISSION.objectives) assert.notEqual(t(o.title), o.title, o.title);
    assert.equal(t('Gate 2/9: Kirchner Museum · 162 m · 12 m up'), 'Tor 2/9: Kirchner Museum · 162 m · 12 m höher');
    assert.equal(t('Gate 6/9: the spire of St. Johann · 1.1 km · level'), 'Tor 6/9: Kirchturm St. Johann · 1.1 km · gleiche Höhe');
    assert.equal(t('Gate 4/9'), 'Tor 4/9');
    assert.equal(t('Refuelling … 45 %'), 'Tanken … 45 %');
    assert.equal(t('365 m to the pit crew on the Promenade · tank 41 %'), '365 m bis zur Boxencrew an der Promenade · Tank 41 %');
    assert.equal(t('212 m to the terrace · tank 70 %'), '212 m bis zur Terrasse · Tank 70 %');
    assert.equal(t('1:52 in the air · 107 % of a tank burned · a clean flight: no penalties'), '1:52 in der Luft · 107 % einer Tankfüllung verbrannt · sauber geflogen: keine Strafzeit');
    assert.equal(t('2:10 in the air · 120 % of a tank burned · 1 tumble · 2 walls (+16 s)'), '2:10 in der Luft · 120 % einer Tankfüllung verbrannt · 1 Purzelbaum · 2 Wände (+16 s)');
    for (const s of ['Space: lift off', 'The tank is nearly dry!', 'Too fast: a tumble! +10 s', 'A wall! +3 s', 'Tank full: go!', 'Slow down for the landing: S', 'Gates', 'Penalty', 'Sink']) assert.notEqual(t(s), s, s);
    for (const o of JETPACK_MISSION.objectives) for (const fl of [Object.assign(createJet(), { phase: 'crashed' }), Object.assign(createJet(), { dry: true })]) assert.notEqual(t(o.check({}, { flight: fl }).fail), o.check({}, { flight: fl }).fail);
  } finally { setLanguage('de'); }
});
