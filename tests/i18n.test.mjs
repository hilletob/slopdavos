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
  // the snow profile's source line (js/missions-data-expert.js slfNote), with and without the SLF's live data
  assert.equal(t('SLF: only 14.8 cm on the Weissfluhjoch today: a training profile'), 'SLF: Heute nur 14.8 cm auf dem Weissfluhjoch: ein Übungsprofil');
  assert.equal(t('Weissfluhjoch 10.02. 12:00 · 182.4 cm of snow · bulletin level 3'), 'Weissfluhjoch 10.02. 12:00 · 182.4 cm Schnee · Bulletin Stufe 3');
  assert.equal(t('Weissfluhjoch 10.02. 12:00 · 182 cm of snow'), 'Weissfluhjoch 10.02. 12:00 · 182 cm Schnee');
  assert.equal(t('No SLF data today: a training profile'), 'Heute keine SLF-Daten: ein Übungsprofil');
  assert.equal(t('SLF: no fresh reading from the Weissfluhjoch: a training profile'), 'SLF: kein frischer Messwert vom Weissfluhjoch: ein Übungsprofil');
  assert.equal(t('Data: SLF'), 'Daten: SLF');
  assert.equal(t('No break: CTN'), 'Kein Bruch: CTN');
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
  assert.equal(t('Hold A: slew the jib round towards the yellow ring on the load'), 'A halten: Schwenk den Ausleger zum gelben Ring bei der Last');
  assert.equal(t('Next: the rebar bundle in the yard'), 'Als Nächstes: Armierungsbund auf dem Werkplatz');
  assert.equal(t('2× Fliegenpilz (fly agaric) -50 · 3× Steinpilz (porcini) +45'), '2× Fliegenpilz -50 · 3× Steinpilz +45');
  assert.match(t('Bright red cap with white flakes, white gills, a ring on the stem · Space: into the basket'), /^Leuchtend roter Hut .* · Space: in den Korb$/);
  assert.equal(t('1 parked car hit (+5 s) · cars buried for 3 s (+2 s)'), '1 parkiertes Auto angefahren (+5 s) · Autos 3 s lang zugeschüttet (+2 s)');
  assert.equal(t('300 m · 1 round left · 2 missed'), '300 m · noch 1 Schuss · 2 daneben');
  assert.equal(t('Rescue under way … 3 s'), 'Rettung läuft … 3 s');
  assert.equal(t('Set down: zero speed, steady'), 'Aufsetzen: stillstehen, ruhig halten');
  assert.equal(t('Get out of the car [F]'), 'Aus dem Auto steigen [F]');
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
  // (the march's controls: the call, the liaison's answers in the key bar and the hint while the dialog is open)
  assert.equal(t('Call'), 'Rufen');
  assert.equal(t('Answer'), 'Antworten');
  assert.equal(t('Answer the liaison: 1, 2 or 3'), 'Antworte der Verbindungsperson: 1, 2 oder 3');
  assert.equal(t('Space on the beat: call, and the crowd answers'), 'Leertaste im Takt: Du rufst, die Menge antwortet');
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
  assert.equal(t('Place 7 of 23 · 4.1 s behind place 6 · 01:09.1 behind the leader'), 'Platz 7 von 23 · 4.1 s hinter Platz 6 · 01:09.1 hinter der Spitze');
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
    // (its moving texts are made with msg(), js/messages.js: made by the mission, then translated)
    const { GATES, PAD, TERRACE, TOWN_GATES } = await import('../js/missions-data-jetpack.js');
    const [town, refuel, , land] = JETPACK_MISSION.objectives;
    const says = (made, en, de) => { assert.equal(made, en); assert.equal(t(made), de); };
    const toward = (g, d, dy, more = {}) => Object.assign(createJet({ x: g.x - d, z: g.z, heading: 0 }), { y: 100, gateY: 100 + dy, ...more });
    says(town.check({}, { flight: toward(GATES[1], 162, 12, { gate: 1 }) }).text, 'Gate 2/9: Kirchner Museum · 162 m · 12 m up', 'Tor 2/9: Kirchner Museum · 162 m · 12 m höher');
    says(town.check({}, { flight: toward(GATES[5], 1100, 2, { gate: 5 }) }).text, 'Gate 6/9: the spire of St. Johann · 1.1 km · level', 'Tor 6/9: Kirchturm St. Johann · 1.1 km · gleiche Höhe');
    says(town.check({}, { flight: toward(GATES[2], 90, -20, { gate: 2 }) }).text, 'Gate 3/9: Eisstadion · 90 m · 20 m down', 'Tor 3/9: Eisstadion · 90 m · 20 m tiefer');
    says(refuel.check({}, { flight: Object.assign(createJet({ ...PAD, heading: 0 }), { gate: TOWN_GATES, fuel: 45, refuelling: true }) }).text, 'Refuelling … 45 %', 'Tanken … 45 %');
    says(refuel.check({}, { flight: toward(PAD, 365, 0, { gate: TOWN_GATES, fuel: 41, phase: 'air' }) }).text, '365 m to the pit crew on the Promenade · tank 41 %', '365 m bis zur Boxencrew an der Promenade · Tank 41 %');
    says(land.check({}, { flight: toward(TERRACE, 212, 0, { gate: GATES.length, refuelled: true, fuel: 70, phase: 'air' }) }).text, '212 m to the terrace · tank 70 %', '212 m bis zur Terrasse · Tank 70 %');
    says(JETPACK_MISSION.summary({ flight: { airtime: 112, burned: 107, tumbles: 0, bumps: 0, penaltyMs: 0 } })[0], '1:52 in the air · 107 % of a tank burned · a clean flight: no penalties', '1:52 in der Luft · 107 % einer Tankfüllung verbrannt · sauber geflogen: keine Strafzeit');
    says(JETPACK_MISSION.summary({ flight: { airtime: 130, burned: 120, tumbles: 1, bumps: 2, penaltyMs: 16000 } })[0], '2:10 in the air · 120 % of a tank burned · 1 tumble · 2 walls (+16 s)', '2:10 in der Luft · 120 % einer Tankfüllung verbrannt · 1 Purzelbaum · 2 Wände (+16 s)');
    says(JETPACK_MISSION.summary({ flight: { airtime: 125, burned: 99, tumbles: 2, bumps: 1, penaltyMs: 23000 } })[0], '2:05 in the air · 99 % of a tank burned · 2 tumbles · 1 wall (+23 s)', '2:05 in der Luft · 99 % einer Tankfüllung verbrannt · 2 Purzelbäume · 1 Wand (+23 s)');
    // (back in English the same texts are English again)
    setLanguage('en');
    assert.equal(t('Gate 2/9: Kirchner Museum · 162 m · 12 m up'), 'Gate 2/9: Kirchner Museum · 162 m · 12 m up');
    setLanguage('de');
    for (const s of ['Space: lift off', 'The tank is nearly dry!', 'Too fast: a tumble! +10 s', 'A wall! +3 s', 'Tank full: go!', 'Slow down for the landing: S', 'Gates', 'Penalty', 'Sink']) assert.notEqual(t(s), s, s);
    for (const o of JETPACK_MISSION.objectives) for (const fl of [Object.assign(createJet(), { phase: 'crashed' }), Object.assign(createJet(), { dry: true })]) assert.notEqual(t(o.check({}, { flight: fl }).fail), o.check({}, { flight: fl }).fail);
  } finally { setLanguage('de'); }
});

test('the avalanche blasting from the helicopter speaks German', async () => {
  const { HELIBLAST_MISSION, ZONES, START, createBlastState } = await import('../js/missions-data-heliblast.js');
  setLanguage('de');
  const m = HELIBLAST_MISSION;
  assert.equal(t(m.title), 'Lawinensprengung aus dem Helikopter');
  assert.match(t(m.intro), /^Januar, sieben Uhr morgens/);
  assert.match(t(m.finish), /erste Gondel/);
  for (const o of m.objectives) assert.notEqual(t(o.title), o.title, o.title);
  // every text and hint a step can show, in each of its states
  const s = createBlastState(), z = ZONES[0];
  const seen = new Set();
  const look = (ctx, st) => { const v = m.objectives[0].check(ctx, st); seen.add(v.text); if (v.hint) seen.add(v.hint); };
  look({ x: START.x, z: START.z, y: 0, agl: 0 }, s);
  for (const agl of [5, 30, 70]) look({ x: z.x, z: z.z, y: 0, agl }, s);
  look({ x: z.x, z: z.z, y: 0, agl: 30 }, { ...s, aim: { inZone: true } });
  look({ x: z.x, z: z.z, y: 20, agl: 20 }, { ...s, charges: 1, charge: { x: z.x, y: 0, z: z.z, fuse: 3 } });
  look({ x: z.x + 500, z: z.z, y: 200, agl: 200 }, { ...s, charge: { x: z.x, y: 0, z: z.z, fuse: 3 } });
  const path = [z.x, z.z, z.x, z.z + 300];
  look({ x: z.x, z: z.z + 100, y: 0, agl: 20 }, { ...s, released: [1, null, null, null], paths: [path, null, null, null] });
  look({ x: z.x + 900, z: z.z, y: 0, agl: 20 }, { ...s, released: [1, null, null, null], paths: [path, null, null, null] });
  for (const note of ['Missed by 12 m: +10 s', 'Caught in the powder cloud: +20 s', 'One at a time: the charge is still burning', 'Too low to throw: climb above 15 m', 'Too high to aim: sink below 45 m', 'No charges left', 'Drop charge', 'Drop']) seen.add(note);
  seen.add(m.objectives[2].check({ x: START.x, z: START.z, y: 0, agl: 0 }, s).text);
  for (const text of seen) assert.notEqual(t(text), text, text);
  assert.equal(t('3.1 km SE · Jakobshorn, north flank'), '3.1 km SO · Jakobshorn, Nordflanke');
  assert.equal(t('Hover 15–45 m over the slope · now 30 m · 1 charge left'), 'Schwebe 15–45 m über dem Hang · jetzt 30 m · noch 1 Ladung');
  assert.equal(t(m.summary({ ...s, thrown: 5, hits: 4, misses: 1, cloudHits: 1, penaltyMs: 30000 })[0]), '5 Ladungen geworfen · 4 Zonen ausgelöst · 1 daneben · 1-mal in der Staubwolke (+30 s)');
  for (const fail of ['The charge went off right under the helicopter. The crew is shaken, the flight is over.', 'Out of charges: the slopes stay closed today.']) assert.notEqual(t(fail), fail);
});

test('the crane at the Hotel Derby: every step hint is translated', async () => {
  setLanguage('de');
  const { CRANE_MOVES } = await import('../js/missions-data-work.js');
  for (const hint of Object.values(CRANE_MOVES)) assert.notEqual(t(hint), hint, `the crane's step hint: ${hint}`);
});

test('the resort jobs, the Victoria, the Pfadi, the hikes and the jetpack say their controls and next steps in German', async () => {
  setLanguage('de');
  const { RESORT_MISSIONS } = await import('../js/missions-data-resort.js');
  const { VICTORIA_MISSIONS } = await import('../js/missions-data-victoria.js');
  const { HIKE_MISSIONS } = await import('../js/missions-data-hike.js');
  // the gamepad's actions of the resort jobs and the Victoria (js/missions-resort.js, js/missions-victoria.js)
  for (const s of ['Hand over the bar', 'pick the wax', 'Previous wax', 'Next wax', 'Take this wax', 'move the tool', 'Tool back', 'Tool on', 'Wave left', 'Wave straight on', 'Wave right', 'Stop the car', 'Next chore', 'Clear the waypoint']) assert.notEqual(t(s), s, s);
  assert.equal(t('Burner 3'), 'Platte 3');
  // the hints that say what to do now
  const marshal = RESORT_MISSIONS.find((m) => m.id === 'parking-marshal').objectives.find((o) => o.id === 'marshal');
  const g = { score: 0, good: 0, crooked: 0, t: 10, done: false, cars: [], cross: { state: 'warn' } };
  assert.equal(t(marshal.check({}, { game: g }).hint), 'Skifahrer queren: Auto anhalten (↓ / Space)');
  assert.equal(t('Wave the car to free bays: ← / ↑ / →'), 'Wink das Auto zu freien Plätzen: ← / ↑ / →');
  const laundry = VICTORIA_MISSIONS[0].objectives.find((o) => o.id === 'laundry');
  assert.equal(t(laundry.check({}, { laundry: { phase: 'sort', item: 0, sheet: 0, score: 0, finished: false } }).hint), 'A / ◀: Weisses · D / ▶: Buntes');
  assert.equal(t(laundry.check({}, { laundry: { phase: 'mangle', item: 0, sheet: 1, score: 0, finished: false } }).hint), 'A oder D (◀ ▶) halten: Leintuch gerade halten');
  for (const id of ['housekeeping', 'kitchen']) {
    const o = VICTORIA_MISSIONS[0].objectives.find((x) => x.id === id);
    const state = id === 'housekeeping' ? { hk: { room: 0, done: [], results: [], left: 10, score: 0, finished: false } } : { kitchen: { served: [], score: 0, finished: false } };
    const hint = o.check({}, state).hint;
    assert.notEqual(t(hint), hint, hint);
  }
  assert.equal(t('Room 204: 6 of 6 chores · The tower suite: 5 of 7 chores'), 'Zimmer 204: 6 von 6 Arbeiten · Die Turmsuite: 5 von 7 Arbeiten');
  const watch = HIKE_MISSIONS[0].objectives.at(-1).check({}, HIKE_MISSIONS[0].createState());
  assert.notEqual(t(watch.hint), watch.hint);
  assert.equal(t('To the next firewood: 14 m'), 'Zum nächsten Feuerholz: 14 m');
  assert.equal(t('Over the terrace: hold Q to sink and touch down'), 'Über der Terrasse: Q halten zum Sinken und Aufsetzen');
});

test('the fun, bar, sport and golf missions translate their HUDs, key bars and running texts', async () => {
  setLanguage('de');
  const cases = {
    'You (red) vs La Onda (blue) · Midfield (auto)': 'Du (rot) gegen La Onda (blau) · Mittelfeld (automatisch)',
    'You 2 : 1 La Onda · 1:23 · Goalie': 'Du 2 : 1 La Onda · 1:23 · Torhüter',
    '23 up · cabin 4: 7 aboard, 62 % · 37 s': '23 oben · Gondel 4: 7 an Bord, 62 % · 37 s',
    '120 pts · 23 up · cabin 4 62 % · 1:12': '120 Pkt. · 23 oben · Gondel 4: 62 % · 1:12',
    'Cabin 3: 9 passengers · 81 % full · 1 full row · 2 holes → +240': 'Gondel 3: 9 Fahrgäste · 81 % voll · 1 volle Reihe · 2 Löcher → +240',
    'Stop board Dorf: 412 m · 40 km/h in 230 m · Score 340': 'Haltetafel Dorf: 412 m · 40 km/h in 230 m · Punkte 340',
    'Doors open · 12 s · Score 90': 'Türen offen · 12 s · Punkte 90',
    'now 3:12': 'jetzt 3:12',
    '0 m of 4.3 km · Split 1 in 1.1 km · 12 km/h': '0 m von 4.3 km · Zwischenzeit 1 in 1.1 km · 12 km/h',
    '1.2 km of 4.3 km · Finish in 3.1 km · 22 km/h · last split 3rd +4.2 s': '1.2 km von 4.3 km · Ziel in 3.1 km · 22 km/h · letzte Zwischenzeit 3. +4.2 s',
    'Start in 3 …': 'Los in 3 …',
    'Split 1 at 1.1 km': 'Zwischenzeit 1 bei 1.1 km',
    '3rd of 8': '3. von 8',
    '2nd place': '2. Platz',
    'Hole 3/9 · The ramp · par 2': 'Loch 3/9 · Die Rampe · Par 2',
    '4 strokes': '4 Schläge',
    'Game shot! Double 16': 'Spiel gewonnen! Doppel 16',
    'Dart 4 of 30 · turn 2, dart 1': 'Pfeil 4 von 30 · Runde 2, Pfeil 1',
    '301 double out · 120 left': '301 Double Out · noch 120',
    'Combo ×2 · 340': 'Kombo ×2 · 340',
    'Bail: combo lost': 'Sturz: Kombo verloren',
    '3 Wood (2)': 'Holz 3 (2)'
  };
  for (const [en, de] of Object.entries(cases)) assert.equal(t(en), de, en);
  // the HUDs' fixed words, the key bars' labels (run.actions, run.hints) and the pieces, roles and holes they name
  const fun = await import('../js/missions-data-fun.js');
  const sport = await import('../js/missions-data-sport.js');
  const words = [
    'SHOOT', 'La Onda scores', 'slide the rod', 'pick a rod', 'Send cabin', 'Move', 'Turn', 'Drop', 'The cabin is leaving …', 'Doors closed: depart', 'missed',
    'aim, then strike in the green', 'a station · the usual: the drink', 'the station at work: stop in the green',
    'Classic', 'GO!', 'Power', 'Putt', 'Overview', 'In the ditch!', 'Throw', 'BUST', 'Miss', 'game on', 'Drop in: W', 'Bail!', 'Time!', 'Cart',
    ...Object.values(fun.GONDOLA_PIECES).map((p) => p.label).filter((l) => l !== 'Snowboarder'),
    ...fun.FOOSBALL_RODS.map((r) => r.role), ...sport.MINIGOLF_HOLES.map((h) => h.name)
  ];
  for (const w of words) assert.notEqual(t(w), w, `"${w}" has its German`);
  setLanguage('en');
});

test('the sledges, the snow, the ice, the Seehofseeli and the splitboard say their controls, warnings and next steps in German', async () => {
  setLanguage('de');
  const cases = {
    'A runner lifts: ease off, brake!': 'Eine Kufe hebt ab: nachlassen, bremsen!',
    'Tipping! Ease off A/D and brake (S)': 'Du kippst! A/D loslassen und bremsen (S)',
    'Tipped over! +5 s': 'Umgekippt! +5 s',
    'Checkpoint 3/13 · 84 m · 2 crashes (+10 s)': 'Checkpoint 3/13 · 84 m · 2 Stürze (+10 s)',
    'Checkpoint 4 missed: back up to it': 'Checkpoint 4 verpasst: zurück dorthin',
    'Gate 3/20 · 2 clean · 1 missed (+3 s)': 'Tor 3/20 · 2 sauber · 1 verpasst (+3 s)',
    'Gate 7 missed': 'Tor 7 verpasst',
    'Crash! +5 s': 'Sturz! +5 s',
    'Aim −1.5°': 'Richtung −1.5°',
    'In the house: 1 point': 'Im Haus: 1 Punkt',
    'Saved by the goalie · 2 goals': 'Vom Goalie gehalten · 2 Tore'
  };
  for (const [en, de] of Object.entries(cases)) assert.equal(t(en), de, en);
  // the sections' tips (the objectives' hints while nothing else needs saying) and the key bars' labels
  const { HORN_SLEDGE_MISSION, TOBOGGAN_MISSION } = await import('../js/missions-data-sledge.js');
  const tips = [HORN_SLEDGE_MISSION, TOBOGGAN_MISSION].flatMap((m) => {
    const st = m.createState(), s = m.start;
    return m.objectives.map((o) => o.check({ mode: 'person', x: s.x, y: 0, z: s.z, heading: 0, speed: 0, dt: 0.1, t: 0 }, st).hint);
  });
  const words = [
    ...tips, 'steer · lean', 'brake (with A/D: tight turn)', 'duck · push off', 'push off', 'hold: brake', 'lean into the bend',
    'tuck', 'carve · in the air: spin', 'tuck, brake · in the air: flip', 'in the air: grab', 'Down to the kicker: tuck (W) for speed',
    'Missed the kicker', 'Try again: this one does not count', 'Back up for the next jump …', 'Push', 'GLOVE SAVE', 'off target', 'Curl ↺ left',
    'Hogged: short of the hog line, removed', 'Wrong way: the race runs counter-clockwise', 'Sweep: hold Space',
    'hold: spray', 'walk backwards', 'hold: transceiver check', 'kick turn', 'hold: next step', 'hold: probe · dig'
  ];
  for (const w of words) assert.notEqual(t(w), w, `"${w}" has its German`);
  setLanguage('en');
});

test('the local missions, the Silberberg and the gastro rooms say their keys, games and next steps in German', () => {
  setLanguage('de');
  assert.equal(t('Take a crate from the back of the van'), 'Nimm hinten im Bus eine Kiste');
  assert.equal(t('Stow them in the back of the van (1/2)'), 'Verstau sie hinten im Bus (1/2)');
  assert.equal(t('The van is 1.2 km away: drive closer to BOX Davos'), 'Der Bus ist 1.2 km weg: fahr näher heran · BOX Davos');
  assert.equal(t('6:52 · 12 min to 7:00 · 1.3 km to the Hotel Montana'), '6:52 · noch 12 min bis 7:00 · 1.3 km zum Hotel Montana');
  assert.equal(t('12 m to the bakery'), '12 m bis zur Bäckerei');
  assert.equal(t('120 m to the stand · the herd is uneasy: too close'), '120 m bis zum Hochsitz · die Herde wird unruhig: zu nah');
  assert.equal(t('3 rounds · 120 pts · herd 140 m'), '3 Schuss · 120 Pkt. · Herde 140 m');
  assert.equal(t('Not allowed: a nanny (female)! Fine and penalty (-150)'), 'Nicht erlaubt: eine Geiss! Busse und Strafpunkte (-150)');
  assert.equal(t('Missed: the herd bolts up the slope (-20)'), 'Daneben: Die Herde flieht den Hang hinauf (-20)');
  assert.equal(t('4 fed · 120 pts · 2:10 · streak 3'), '4 gefüttert · 120 Pkt. · 2:10 · Serie 3');
  assert.equal(t('42 km/h · 120 m to the pool'), '42 km/h · noch 120 m bis zum Becken');
  assert.equal(t('2:10 left'), 'noch 2:10');
  assert.equal(t('12 m to go'), 'noch 12 m');
  // the key bar's lines (run.actions kind 'hint') and the games' canvas words
  const words = [
    'roll the dough down', 'or tap steadily', 'scrape a plate', 'or across the cheese', 'scope', 'hold: hold your breath', 'fire', 'lower the scope',
    'Hold out a nut', 'Nut', 'Hit the ball', 'Hit', 'run to the ball', 'held at the swing: aim left / right', 'lean into the bends', 'or the arrows',
    'paint on the canvas', 'colour, brush, Template, Done', 'answer Jöri', 'hold at a lit vein: strike', 'the red button',
    'the red button (held: keep the key down)', 'the toppings, in the order of the ticket', 'Swipe', 'Wheel', 'Right click',
    'Perfect Gipfeli!', 'Too fast: a bit loose', 'Orders', 'Extra crispy', 'Waiting for guests …', 'scorched', 'Wanted extra crispy',
    'The herd bolts!', 'may be taken', 'legal: old bucks', 'Scared it away!', "Coach's point", 'double fault', 'your serve: Space',
    'Splash!', 'too high: braking!', 'ideal line', "paint the view in Kirchner's colours", 'Vermilion', 'Back to the lakeside path'
  ];
  for (const w of words) assert.notEqual(t(w), w, `"${w}" has its German`);
  setLanguage('en');
});

test('the ice resurfacer in the Eisstadion speaks German: its steps, hints, HUD, keys and summary', async () => {
  const { ZAMBONI_MISSION, ZAMBONI, createMachine, machineWorld } = await import('../js/missions-data-zamboni.js');
  setLanguage('de');
  const m = ZAMBONI_MISSION;
  assert.equal(t(m.title), 'Die Eismaschine in der Drittelpause');
  assert.match(t(m.intro), /^Der HC Davos gegen die ZSC Lions/);
  assert.match(t(m.finish), /Eiscrew/);
  for (const o of m.objectives) assert.notEqual(t(o.title), o.title, o.title);
  // every text and hint a step can show, in each of its states
  const at = (x, y, tt = 0) => { const w = machineWorld({ ...createMachine(), x, y }); return { mode: 'person', x: w.x, y: 0, z: w.z, heading: 0, speed: 0, dt: 0.1, t: tt }; };
  const seen = new Set();
  const look = (o, ctx, st) => { const v = o.check(ctx, st); for (const s of [v.text, v.hint, v.fail]) if (s) seen.add(s); };
  const [boards, middle, gate] = m.objectives;
  for (const st of [m.createState(), { ...m.createState(), on: true }, { ...m.createState(), on: true, water: 0.1, ice: 0.6 }]) {
    look(boards, at(ZAMBONI.park.x, ZAMBONI.gate.y), st); look(boards, at(0, 0, 65000), st);
    look(middle, at(0, 0, 125000), st); look(gate, at(0, 0, 200000), st);
  }
  look(middle, at(0, 0, ZAMBONI.timeLimitMs + 1), m.createState());
  look(middle, at(0, 0), { ...m.createState(), dry: true });
  for (const s of ['Ice 63 %', 'Conditioner on', 'Conditioner off', 'Conditioner', 'Snow tank', 'Water', 'drive', 'brake · back up', 'steer', 'conditioner on/off', 'Overview',
    'The water tank is empty', 'Water on wet ice: a puddle!', 'Water tank almost empty', 'Hard knock on the boards! −40']) seen.add(s);
  for (const text of seen) assert.notEqual(t(text), text, text);
  assert.equal(t('Along the boards 52 % of 90 % · 7:46 left'), 'Der Bande entlang 52 % von 90 % · noch 7:46');
  assert.equal(t('Ice 63 % of 95 % · water 58 % · 2:05 left'), 'Eis 63 % von 95 % · Wasser 58 % · noch 2:05');
  assert.equal(t('12 m to the gate · 0:41 left'), '12 m bis zum Tor · noch 0:41');
  assert.equal(t(m.summary({ ...m.createState(), ice: 0.964, bumps: 2, puddleM2: 3.25, water: 0.31 })[0]), '96 % des Eises geglättet · 2 harte Schläge · 3 m² Pfützen · Wasser übrig 31 %');
  assert.equal(t(m.summary({ ...m.createState(), ice: 0.95, bumps: 1, puddleM2: 0, water: 0.2 })[0]), '95 % des Eises geglättet · 1 harter Schlag · 0 m² Pfützen · Wasser übrig 20 %');
  setLanguage('en');
});

test('the long break on the SAMD\'s roof speaks German, with a Swiss-German shout or two', async () => {
  const { SAMD_MISSION: m, ROLES, SIDEKICK, START, createBreak } = await import('../js/missions-data-samd.js');
  setLanguage('de');
  assert.equal(t(m.title), 'Vom Dach der SAMD');
  assert.match(t(m.intro), /^Ein Schulmorgen an der SAMD/);
  assert.match(t(m.finish), /Mathestunde/);
  for (const o of m.objectives) assert.notEqual(t(o.title), o.title, o.title);
  // every line a walker shouts, every line of Mätti's, the tags (but the names that stay the same)
  const same = new Set(['Rektor', 'Tourist', 'Hausmutter']);
  for (const r of Object.values(ROLES)) { for (const line of r.lines) assert.notEqual(t(line), line, line); if (!same.has(r.label)) assert.notEqual(t(r.label), r.label, r.label); }
  for (const lines of Object.values(SIDEKICK)) for (const line of lines) assert.notEqual(t(line), line, line);
  assert.equal(t('Hey, you clown!'), 'He, du Lappi!');
  assert.equal(t('Whoa, what was that?!'), 'Was isch au das?!');
  // the steps' texts and hints in their states, the HUD and the keys
  const b = createBreak(3);
  const seen = new Set();
  const look = (o, ctx, brk) => { const v = o.check(ctx, { brk }); seen.add(v.text); if (v.hint) seen.add(v.hint); };
  look(m.objectives[0], { x: START.x, z: START.z }, b);
  look(m.objectives[1], {}, null);
  look(m.objectives[1], {}, b);
  look(m.objectives[1], {}, { ...b, ducked: true });
  look(m.objectives[1], {}, { ...b, suspicion: 0.8 });
  look(m.objectives[1], {}, { ...b, mouth: 'hocking', combo: 3 });
  for (const s of ['Wind', 'Hock', 'Collecting', 'Suspicion', 'Hock, let go to drop', 'Duck', 'aim', 'The Hausmeister!', 'Caught at the parapet: detention', 'Ring!', 'The long break is over', 'The Rektor!', 'Crossing the yard to the Aula']) if (s !== 'Wind') seen.add(s);
  for (const text of seen) assert.notEqual(t(text), text, text);
  assert.equal(t('21 m to the side door of the SAMD'), '21 m bis zur Seitentür der SAMD');
  assert.equal(t('120 pts · 1:23 left · combo ×1.5'), '120 Pkt. · noch 1:23 · Kombo ×1.5');
  assert.equal(t('0 pts · 2:30 left'), '0 Pkt. · noch 2:30');
  assert.equal(t(m.summary({ brk: { ...b, spits: 31, hits: 17, maxCombo: 5, rektorHits: 2, forbidden: 1 } })[0]), '31 Rotzer · 17 Treffer · beste Serie ×5 · der Rektor 2× · 1-mal tabu');
  assert.equal(t(m.summary({ brk: { ...b, caught: true } })[1]), 'Vom Hausmeister erwischt: −150 fürs Nachsitzen');
  setLanguage('en');
});

test('the Parsennbahn machinist speaks German: the steps in every phase, the desk, the keys, the summary', async () => {
  setLanguage('de');
  const { PARSENN_MISSION: m, createDrive, PB, driveLine } = await import('../js/missions-data-parsenn.js');
  assert.equal(t(m.title), 'Maschinist auf der Parsennbahn');
  assert.match(t(m.intro), /^Der erste Zug des Tages auf der Parsennbahn/);
  assert.match(t(m.finish), /Weissfluhjoch, 2663 m\. Die Türen/);
  for (const o of m.objectives) assert.notEqual(t(o.title), o.title, o.title);
  const seen = new Set();
  const look = (k, d) => { const v = m.objectives[k].check({}, { drive: d }); seen.add(v.text); if (v.hint) seen.add(v.hint); };
  look(0, null); look(1, null);
  const d = createDrive();
  look(0, d); d.boardT = PB.boarding; look(0, d);
  Object.assign(d, { phase: 'ready', doors: 'closed' }); look(0, d); d.t = 30; look(0, d);
  Object.assign(d, { phase: 'run', s: 500, v: 9 }); look(0, d); d.v = 12; look(0, d); d.v = 9; d.timelapse = true; look(0, d); d.timelapse = false;
  d.s = driveLine(d).runLen - 100; d.v = 4; look(0, d); d.s = driveLine(d).runLen - 20; look(0, d);
  Object.assign(d, { phase: 'halt', s: driveLine(d).runLen - 0.4, v: 0 }); look(0, d); d.s = driveLine(d).runLen; look(0, d);
  Object.assign(d, { phase: 'alight' }); look(0, d); look(1, d);
  d.results.push({ from: 'Davos Dorf', to: 'Höhenweg', departLate: 2, delay: -8, error: -0.07, horn: 10, comfort: 50, total: 297 });
  look(0, d);
  Object.assign(d, { k: 1, phase: 'boarding', s: 0, boardT: 0 }); look(1, d);
  for (const s of ['Stop board', 'Next limit', 'Clock', 'Due', 'Doors', 'Score', 'Brake', 'Emergency brake', 'Time-lapse ×4', 'Lever', 'past', 'dep.', 'arr.', 'open', 'closed',
    'Lever up', 'Lever down', 'Faster', 'Slower', 'Horn', 'Emergency', 'Doors open: the drive is locked', 'Wait: the passengers are still boarding', 'Doors only at a standstill',
    'Not at the platform yet', 'Emergency brake!', 'Past the board: the limit switch trips', 'Into the buffer stop!', 'Time-lapse off: a limit ahead', 'No time-lapse here',
    'Left too early!', 'Departure, with the horn', 'Departure', 'Change to the upper car']) seen.add(s);
  for (const text of seen) assert.notEqual(t(text), text, text);
  assert.equal(t('Höhenweg in 1.2 km · due 4:55 (−12 s) · 30/36 km/h'), 'Höhenweg in 1.2 km · fällig 4:55 (−12 s) · 30/36 km/h');
  assert.equal(t('Davos Dorf · boarding 12/46 · departure 0:20'), 'Davos Dorf · Einsteigen 12/46 · Abfahrt 0:20');
  assert.equal(t('Höhenweg · −7 cm from the board'), 'Höhenweg · −7 cm von der Tafel');
  const summary = m.summary({ drive: { ...d, overspeed: 4, maxOver: 5, overspeedPenalty: 14 } });
  assert.equal(t(summary[0]), 'Davos Dorf – Höhenweg: Abfahrt +2 s (Hornsignal) · Ankunft −8 s · −7 cm · Fahrt 50/50 → 297 Pkt.');
  assert.equal(t(summary[1]), 'Über dem Limit 4 s (bis +5 km/h): −14 Pkt.');
});
