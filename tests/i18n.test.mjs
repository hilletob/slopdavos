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

test('the Victoria shift translates its steps, rooms, pops and summaries', async () => {
  const V = await import('../js/missions-data-victoria.js');
  setLanguage('de');
  assert.equal(t('A shift at the Turmhotel Victoria'), 'Eine Schicht im Turmhotel Victoria');
  assert.match(t('A busy day at the Turmhotel Victoria in Davos Dorf, and half the staff is down with the flu.'), /^Viel los im Turmhotel Victoria/);
  assert.equal(t('12 m to the Turmhotel Victoria'), '12 m bis zum Turmhotel Victoria');
  assert.equal(t('Get out (F) and walk into the Turmhotel Victoria'), 'Steig aus (F) und geh ins Turmhotel Victoria');
  // (its moving texts are made with msg(), js/messages.js: made by the games, then translated; a pop is the line said
  // with its points, as js/missions-victoria.js gives it to flashPop)
  const says = (made, en, de) => { assert.equal(made, en); assert.equal(t(made), de); };
  const pop = (g) => V.popOf(g.last).text;
  const [room204] = V.HOUSEKEEPING.rooms;
  says(V.roomLine(room204.name, 11.4, 180), 'Room 204 · 12 s · 180 pts', 'Zimmer 204 · 12 s · 180 Pkt.');
  says(V.backSoonLine(room204), 'The Müllers from Basel are back soon. Pick a chore', 'Die Müllers aus Basel kommen bald zurück. Wähl eine Arbeit');
  const hk = V.createHousekeeping();
  V.hkPick(hk, 'towels');
  for (let i = 0; i < V.CHORES.towels.strokes; i++) V.hkStroke(hk, i % 2 ? 1 : -1);
  says(pop(hk), 'Fresh towels: done  +60', 'Frische Tücher: erledigt  +60');
  says(V.scrubLine('bed'), 'Make the bed: scrub left, right, left …', 'Bett machen: links, rechts, links wischen …');
  const spotless = Object.assign(V.createHousekeeping(), { done: ['bed', 'towels', 'bath', 'mirror', 'bin'], left: 7 });
  V.hkPick(spotless, 'chocolate');
  V.hkStroke(spotless, -1); V.hkStroke(spotless, 1);
  says(pop(spotless), 'Spotless! 7 s to spare  +170', 'Blitzblank! 7 s übrig  +170');
  const late = Object.assign(V.createHousekeeping(), { done: ['bed', 'towels', 'bath', 'mirror'], left: 0.05 });
  V.hkStep(late, 0.1);
  says(pop(late), 'The guest is back: 2 chores undone', 'Der Gast ist zurück: 2 Arbeiten nicht erledigt');
  const lateOne = Object.assign(V.createHousekeeping(), { done: ['bed', 'towels', 'bath', 'mirror', 'bin'], left: 0.05 });
  V.hkStep(lateOne, 0.1);
  says(pop(lateOne), 'The guest is back: 1 chore undone', 'Der Gast ist zurück: 1 Arbeit nicht erledigt');
  says(V.kitchenLine({ served: [{}, {}] }, 100), 'Lunch service · 2 of 8 dishes · 100 pts', 'Mittagsservice · 2 von 8 Gerichten · 100 Pkt.');
  const kitchen = V.createKitchen();
  kitchen.pans[0] = { order: 3, d: 1.0137, cook: 11 };
  V.kitchenPress(kitchen, 0);
  says(pop(kitchen), 'Capuns: perfect!  +118', 'Capuns: perfekt!  +118');
  kitchen.pans[0] = { order: 0, d: 1.395, cook: 8.5 };
  V.kitchenStep(kitchen, 0.1);
  says(pop(kitchen), 'Rösti: burnt!  -40', 'Rösti: angebrannt!  -40');
  says(V.tableLine(3), 'Table 5: Capuns', 'Tisch 5: Capuns');
  says(V.burnerLabel(2), 'Burner 2', 'Platte 2');
  says(V.sortLine({ item: 0 }, 248), 'Sorting · item 1 of 12 · 248 pts', 'Sortieren · Stück 1 von 12 · 248 Pkt.');
  const laundry = Object.assign(V.createLaundry(), { item: 1 });
  V.laundrySort(laundry, -1);
  says(pop(laundry), 'Red napkin in the whites: pink sheets!  -40', 'Rote Serviette in der Weisswäsche: rosa Leintücher!  -40');
  const floor = V.createLaundry();
  V.laundryStep(floor, V.sortWindow(floor) + 0.01);
  says(pop(floor), 'Bed sheet: on the floor  -10', 'Leintuch: auf dem Boden  -10');
  const jam = Object.assign(V.createLaundry(), { phase: 'mangle', off: V.LAUNDRY.jam + 0.1 });
  V.laundryStep(jam, 0.001);
  says(pop(jam), 'Caught in the rollers!  -40', 'In die Walze geraten!  -40');
  const whites = Object.assign(V.createLaundry(), { itemT: 0.2 * V.LAUNDRY.sortTime[0] });
  V.laundrySort(whites, -1);
  says(pop(whites), 'Whites  +28', 'Weisses  +28');
  const M = V.VICTORIA_MISSION;
  says(M.summary({ hk: { results: [{ room: 'The tower suite', done: 5, of: 7 }] } })[0], 'The tower suite: 5 of 7 chores', 'Die Turmsuite: 5 von 7 Arbeiten');
  const served = [...Array(7).fill({ burnt: false }), { burnt: true }];
  says(M.summary({ kitchen: { served, perfect: 5, burnt: 1 } })[0], '7 of 8 dishes served · 5 perfect · 1 burnt', '7 von 8 Gerichten serviert · 5 perfekt · 1 angebrannt');
  const sorted = [...Array(11).fill({ ok: true }), { ok: false }], sheets = [0.95, 0.92, 0.97, 0.7, 0].map((quality) => ({ quality }));
  says(M.summary({ laundry: { sorted, sheets, pink: true } })[0], '11 of 12 sorted right · 3 of 5 sheets crisp · pink sheets', '11 von 12 richtig sortiert · 3 von 5 Leintüchern glatt · rosa Leintücher');
  // and back in English, English again
  setLanguage('en');
  assert.equal(t(pop(whites)), 'Whites  +28');
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

test('the rural missions translate names, intros and generated texts', async () => {
  const R = await import('../js/missions-data-rural.js');
  setLanguage('de');
  assert.equal(t('Quad ride from Heldstab'), 'Quadfahrt ab Heldstab');
  assert.equal(t('Green waste to the biogas plant'), 'Bioabfall zur Biogasanlage');
  assert.match(t('Heldstab AG on the Bahnhofstrasse in Davos Dorf sells'), /^Die Heldstab AG/);
  assert.match(t("The hotels' kitchens fill a barrel of green waste a day, and it goes to the biogas plant."), /^Die Hotelküchen.*Dischmastrasse/);
  assert.equal(t('Collect the barrels at the hotels'), 'Fässer bei den Hotels einsammeln');
  assert.equal(t('Out along the Dischmastrasse: it is cleared in winter'), 'Hinaus über die Dischmastrasse: Sie wird im Winter geräumt');
  // (the moving texts are made with msg(), js/messages.js: made by the mission, then translated)
  const says = (made, en, de) => { assert.equal(made, en); assert.equal(t(made), de); };
  const frame = (over = {}) => ({ mode: 'car', x: 0, y: 0, z: 0, heading: 0, speed: 0, dt: 0.05, t: 0, ...over });
  const Q = R.QUAD_MISSION, [town, , back] = Q.objectives, [gx, gz] = R.QUAD_GATES.town[2];
  const quad = (over) => ({ ...Q.createState(), gates: { town: 2, course: 0, back: 0 }, ...over });
  says(town.check(frame({ x: gx - 120, z: gz }), quad({ jumps: 2 })).text, 'Gate 3/19 · 120 m · 2 clean jumps', 'Tor 3/19 · 120 m · 2 saubere Sprünge');
  says(town.check(frame({ x: gx - 120, z: gz }), quad({ jumps: 1 })).text, 'Gate 3/19 · 120 m · 1 clean jump', 'Tor 3/19 · 120 m · 1 sauberer Sprung');
  says(town.check(frame({ x: gx, z: gz + 1200 }), quad({ jumps: 0 })).text, 'Gate 3/19 · 1.2 km', 'Tor 3/19 · 1.2 km');
  const home = R.QUAD.finish;
  says(back.check(frame({ x: home.x, z: home.z }), quad({ gates: { town: 5, course: 11, back: 2 } })).text, 'Gate 3/3', 'Tor 3/3');
  says(Q.summary(quad({ jumps: 2, patches: 4 }))[0], '2 clean jumps (-3 s) · 4 mud and snow patches crossed', '2 saubere Sprünge (-3 s) · 4 Schlamm- und Schneefelder durchquert');
  says(Q.summary(quad({ jumps: 1, patches: 1 }))[0], '1 clean jump (-1.5 s) · 1 mud and snow patch crossed', '1 sauberer Sprung (-1.5 s) · 1 Schlamm- oder Schneefeld durchquert');
  says(R.airTimeText(0.83), 'Air time 0.8 s: -1.5 s', 'Flugzeit 0.8 s: -1.5 s');
  const B = R.BIO_MISSION, [collect, unload] = B.objectives;
  // (ten barrels, four handled and three of them on the bed; the nearest left 90 m away)
  const stops = Array.from({ length: 10 }, (_, i) => ({ i, x: i < 4 ? 0 : i === 4 ? 90 : 5000, z: 0, done: i < 4, name: i === 4 ? 'Hotel Seehof' : 'Hotel Europe', plastic: false }));
  const bio = (over) => ({ ...B.createState(), stops, collected: 3, ...over });
  says(collect.check(frame(), bio()).text, 'Barrels 4/10 · load 38 % · next Hotel Seehof 90 m', 'Fässer 4/10 · Ladung 38 % · nächstes Hotel Seehof 90 m');
  says(collect.check(frame(), bio({ stops: stops.map((s) => ({ ...s, done: true })), collected: 8 })).text, 'Barrels 10/10 · load 100 %', 'Fässer 10/10 · Ladung 100 %');
  says(collect.check(frame(), bio({ loading: { t: 0.4 * R.BIO.loadS } })).hint, 'Loading … 40 % · Space: reject the barrel', 'Laden … 40 % · Leertaste: Fass stehen lassen');
  says(R.barrelUpText(4), 'Barrel up: 4 on the bed', 'Fass oben: 4 auf der Ladefläche');
  says(R.wrongRejectText(), 'That one was clean: -10 pts', 'Die war sauber: -10 Pkt.');
  says(unload.check(frame({ dt: 0 }), bio({ atPlant: true, unloadT: 0.25 * R.BIO.unloadS })).text, 'Unloading … 25 %', 'Abladen … 25 %');
  assert.match(unload.check(frame({ x: R.BIO_START.x, z: R.BIO_START.z }), bio()).text, /^To the hopper · [\d.]+ km$/);
  const hopper = unload.check(frame({ x: R.BIO_START.x, z: R.BIO_START.z }), bio()).text;
  says(hopper, hopper, hopper.replace('To the hopper', 'Zum Annahmebunker'));
  says(B.summary(bio({ collected: 8, spoiledBarrels: 0, rejected: 2 }))[0], '8 clean barrels · 2 of 2 plastic barrels rejected', '8 saubere Fässer · 2 von 2 Plastik-Fässern stehen gelassen');
  says(B.summary(bio({ collected: 7, spoiledBarrels: 1, rejected: 1, wrong: 1, missed: 2 }))[0], '6 clean barrels · 1 of 2 plastic barrels rejected · 1 clean left behind · 2 left out',
    '6 saubere Fässer · 1 von 2 Plastik-Fässern stehen gelassen · 1 saubere stehen gelassen · 2 ausgelassen');
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

test('gastro, resort and après-ski missions translate names, intros and generated texts', async () => {
  const W = await import('../js/missions-data-work.js');
  setLanguage('de');
  // (the work missions' moving texts are made with msg(), js/messages.js: made by the mission from a state set up for it, then translated)
  const says = (made, en, de) => { assert.equal(made, en); assert.equal(t(made), de); };
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
  const crane = W.CRANE_MISSION, jacuzzi = crane.objectives.find((o) => o.id === 'jacuzzi'), rebar = crane.objectives.find((o) => o.id === 'rebar');
  const view = { dist: 3.2, above: 1, swing: 0.4, move: null };
  says(jacuzzi.check({ t: 0 }, { ...W.createCraneState(), carried: true, hits: 2, view }).text, 'Set the hotel jacuzzi down: 3.2 m off · 1.0 m above · swing 0.4 m · 2 hits', 'Hotel-Jacuzzi absetzen: 3.2 m daneben · 1.0 m darüber · Pendeln 0.4 m · 2 Treffer');
  says(rebar.check({ t: 0 }, { ...W.createCraneState(), hits: 1, view }).text, 'Take the rebar bundle: 3.2 m off · 1.0 m above · swing 0.4 m · 1 hit', 'Armierungsbund anhängen: 3.2 m daneben · 1.0 m darüber · Pendeln 0.4 m · 1 Treffer');
  says(rebar.check({ t: 0 }, W.createCraneState()).text, 'Take the rebar bundle', 'Armierungsbund anhängen');
  const pad = W.CRANE_LOADS.find((l) => l.id === 'rebar').pad;
  says(rebar.check({ t: 0 }, { ...W.createCraneState(), carried: true, seated: true, lifted: true, lx: pad.x + 0.6, lz: pad.z, hits: 3 }).text, '0.6 m off the mark · 3 hits', '0.6 m neben der Markierung · 3 Treffer');
  says(crane.objectives[0].check({ x: W.CRANE.ladder.x + 45, z: W.CRANE.ladder.z }, W.createCraneState()).text, '45 m to the crane ladder', '45 m bis zur Kranleiter');
  says(crane.summary({ ...W.createCraneState(), results: [{ err: 0.42, v: 0.31 }, { err: 1.5, v: 0.8 }] })[0], 'Set down: 0.42 m, 0.31 m/s · 1.50 m, 0.80 m/s', 'Abgesetzt: 0.42 m, 0.31 m/s · 1.50 m, 0.80 m/s');
  assert.equal(t('Hold A: slew the jib round towards the yellow ring on the load'), 'A halten: Schwenk den Ausleger zum gelben Ring bei der Last');
  says(W.craneNextText('rebar bundle'), 'Next: the rebar bundle in the yard', 'Als Nächstes: Armierungsbund auf dem Werkplatz');
  const mush = W.MUSHROOM_MISSION;
  says(mush.summary({ ...mush.createState(), basket: ['flyAgaric', 'flyAgaric', 'porcini', 'porcini', 'porcini'] })[0], '2× Fliegenpilz (fly agaric) -50 · 3× Steinpilz (porcini) +45', '2× Fliegenpilz -50 · 3× Steinpilz +45');
  const fly = { kind: 'flyAgaric', x: 10, z: 10 };
  const near = mush.objectives[0].check({ x: 10.5, z: 10, t: 0 }, { ...mush.createState(), items: [fly] }).hint;
  assert.equal(near, `${W.MUSHROOM_KINDS.flyAgaric.desc} · Space: into the basket`);
  assert.match(t(near), /^Leuchtend roter Hut .* · Space: in den Korb$/);
  says(mush.objectives[0].check({ x: 10, z: 10, t: 0 }, { ...mush.createState(), picking: { t: W.MUSHROOMS.pickS / 4 } }).hint, 'Picking … 25 %', 'Pflücken … 25 %');
  says(W.SNOW_BLOWER_MISSION.summary({ hits: 1, buried: 3, penaltyMs: 0 })[0], `1 parked car hit (+${W.BLOWER.hitMs / 1000} s) · cars buried for 3 s (+${Math.round(3 * W.BLOWER.buryRate)} s)`, `1 parkiertes Auto angefahren (+${W.BLOWER.hitMs / 1000} s) · Autos 3 s lang zugeschüttet (+${Math.round(3 * W.BLOWER.buryRate)} s)`);
  says(W.SNOW_BLOWER_MISSION.summary({ hits: 2, buried: 0, penaltyMs: 0 })[0], `2 parked cars hit (+${(2 * W.BLOWER.hitMs) / 1000} s) · cars buried for 0 s (+0 s)`, `2 parkierte Autos angefahren (+${(2 * W.BLOWER.hitMs) / 1000} s) · Autos 0 s lang zugeschüttet (+0 s)`);
  says(W.LAWN_MISSION.objectives[0].check({ x: 0, z: 0, t: 0, mode: 'car' }, { ...W.LAWN_MISSION.createState(), mown: 0.4, trodden: 2 }).text, 'Lawn mown 40 % of 93 % · beds trodden 2 (+4 s)', 'Rasen gemäht: 40 % von 93 % · Beete zertrampelt 2 (+4 s)');
  const garbage = W.GARBAGE_MISSION, g = garbage.createState();
  says(garbage.objectives[0].check({ x: 0, z: 0, speed: 0, mode: 'car' }, { ...g, atKma: true, collected: 8, stops: g.stops.map((p, i) => ({ ...p, done: i > 0 })) }).text, `1 point left out (+${W.GARBAGE.missMs / 1000} s)`, `1 Sammelstelle ausgelassen (+${W.GARBAGE.missMs / 1000} s)`);
  says(garbage.objectives[0].check({ x: 0, z: 0, speed: 0, mode: 'car' }, { ...g, atKma: true, collected: 7, stops: g.stops.map((p, i) => ({ ...p, done: i > 1 })) }).text, `2 points left out (+${(2 * W.GARBAGE.missMs) / 1000} s)`, `2 Sammelstellen ausgelassen (+${(2 * W.GARBAGE.missMs) / 1000} s)`);
  says(garbage.objectives[0].check({ x: 0, z: 0, speed: 0, mode: 'car' }, { ...g, loading: { t: W.GARBAGE.loadS / 2 } }).hint, 'Loading … 50 %', 'Laden … 50 %');
  says(garbage.objectives[1].check({ x: W.GARBAGE.kma.x + 1200, z: W.GARBAGE.kma.z, speed: 0, dt: 0 }, g).text, 'To the KMA · 1.2 km', 'Zur KMA · 1.2 km');
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

test('the WEF missions translate names, intros, generated texts and slogans', async () => {
  const { WEF_ESCORT_MISSION: escort, ANTI_WEF_MISSION: march, WEF_GATES, PICKUP, DROPOFF, DETOUR_TURN, RALLY, LIAISON, MARCH_WP1, ESCORT, MARCH, createEscort, createMarch } = await import('../js/missions-data-wef.js');
  setLanguage('de');
  // (the moving texts are made with msg(), js/messages.js: made by the mission, then translated)
  const says = (made, en, de) => { assert.equal(made, en); assert.equal(t(made), de); };
  const ctx = (at, dx, o = {}) => ({ x: at.x + dx, z: at.z, speed: 0, blueLight: true, dt: 0, t: 0, ...o });
  const gate = escort.objectives.find((o) => o.id === WEF_GATES[0].id), drop = escort.objectives.find((o) => o.id === 'dropoff');
  assert.equal(t('Escort at the WEF'), 'Eskorte am WEF');
  assert.equal(t('Lead the anti-WEF march'), 'Anti-WEF-Demo anführen');
  assert.match(t('January, the World Economic Forum, and Davos is a fortress.'), /^Januar/);
  assert.match(t('The Forum is in town, and so is the registered counter-march.'), /^Das Forum/);
  says(gate.check(ctx(WEF_GATES[0], 120), { escort: createEscort() }).text, '120 m to the Promenade gate · under 30 km/h', '120 m bis zur Schleuse Promenade · unter 30 km/h');
  says(escort.objectives[0].check(ctx(PICKUP, 40), { escort: createEscort() }).text, '40 m to the Bahnhof Davos Dorf · stop ahead of the limousines', '40 m bis zum Bahnhof Davos Dorf · vor den Limousinen anhalten');
  says(escort.objectives.find((o) => o.id === 'radio').check(ctx(DETOUR_TURN, 300), { escort: { ...createEscort(), radioed: true } }).text, '300 m to the Scalettastrasse', '300 m bis zur Scalettastrasse');
  says(drop.check(ctx(DROPOFF, 1200), { escort: createEscort() }).text, '1.2 km to the Kongresszentrum', '1.2 km bis zum Kongresszentrum');
  says(drop.check(ctx(DROPOFF, 0, { dt: 0.5 }), { escort: createEscort() }).text, `The door opens … ${Math.ceil(ESCORT.dropS - 0.5)} s`, `Die Tür geht auf … ${Math.ceil(ESCORT.dropS - 0.5)} s`);
  says(march.objectives[2].check(ctx(RALLY, 90), { march: { ...createMarch(), count: 34 } }).text, '34 marchers · 90 m to the rally point', '34 Leute · 90 m bis zum Kundgebungsplatz');
  says(march.objectives[1].check(ctx(LIAISON, 50), { march: { ...createMarch(), count: 34 } }).text, '34 marchers · 50 m to the police liaison', '34 Leute · 50 m bis zur Polizei-Verbindungsperson');
  says(march.objectives[0].check(ctx(MARCH_WP1, 90), { march: { ...createMarch(), count: 34 } }).text, '34 marchers · 90 m on the Promenade', '34 Leute · noch 90 m auf der Promenade');
  says(march.objectives[0].check(ctx(MARCH_WP1, 90), { march: { ...createMarch(), action: { kind: 'stop', left: 2.2 } } }).text, 'Everybody stands still … 3 s', 'Alle stehen still … 3 s');
  says(march.objectives[0].check(ctx(MARCH_WP1, 90), { march: { ...createMarch(), action: { kind: 'sit', left: 4 } } }).text, 'Sit-in … 4 s', 'Sitzstreik … 4 s');
  says(march.objectives[3].check(ctx(RALLY, 0, { dt: 1 }), { march: createMarch() }).text, `The closing speech … ${Math.ceil(MARCH.speechS - 1)} s`, `Die Schlussrede … ${Math.ceil(MARCH.speechS - 1)} s`);
  says(march.summary({ march: { ...createMarch(), count: 41, perfect: 9, good: 0, miss: 1, onT: 3, totalT: 4, goodwill: 12 } })[0], '41 marchers · chant 90 % · on the route 75 % · goodwill 12', '41 Leute · Sprechchor 90 % · auf der Route 75 % · Wohlwollen 12');
  assert.equal(t('Davos for the Davosers!'), 'Davos den Davosern!');
  says(escort.objectives[0].check(ctx(PICKUP, 0, { dt: ESCORT.boardS - 2.5 }), { escort: createEscort() }).text, 'The delegation is boarding … 3 s', 'Die Delegation steigt ein … 3 s');
  says(escort.summary({ escort: { ...createEscort(), formT: 90, escortT: 100, composure: 88.2, crashes: 1, rushed: 0 } })[0], 'Cohesion 90 % · composure 88 · 1 crash · 0 gates rushed', 'Zusammenhalt 90 % · Fassung 88 · 1 Unfall · 0 Schleusen zu schnell');
  says(escort.summary({ escort: { ...createEscort(), formT: 90, escortT: 100, composure: 61, crashes: 2, rushed: 1 } })[0], 'Cohesion 90 % · composure 61 · 2 crashes · 1 gate rushed', 'Zusammenhalt 90 % · Fassung 61 · 2 Unfälle · 1 Schleuse zu schnell');
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
  const { HELIBLAST_MISSION, ZONES, START, createBlastState, stepBlast } = await import('../js/missions-data-heliblast.js');
  setLanguage('de');
  const m = HELIBLAST_MISSION;
  const says = (made, en, de) => { assert.equal(made, en); assert.equal(t(made), de); };
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
  // (a charge gone off 12 m outside the first ring: its note is made by the mission, js/messages.js)
  const missed = { ...createBlastState(), charge: { x: z.x + z.r + 12, y: 0, z: z.z, fuse: 0.01, landed: true, t: 0 } };
  stepBlast(missed, { x: z.x + 500, y: 300, z: z.z, agl: 300 }, 0.05, () => 0);
  says(missed.note, 'Missed by 12 m: +10 s', 'Daneben um 12 m: +10 s');
  for (const note of ['Caught in the powder cloud: +20 s', 'One at a time: the charge is still burning', 'Too low to throw: climb above 15 m', 'Too high to aim: sink below 45 m', 'No charges left', 'Drop charge', 'Drop']) seen.add(note);
  seen.add(m.objectives[2].check({ x: START.x, z: START.z, y: 0, agl: 0 }, s).text);
  for (const text of seen) assert.notEqual(t(text), text, text);
  says(m.objectives[0].check({ x: START.x, z: START.z, y: 0, agl: 0 }, s).text, '3.1 km SE · Jakobshorn, north flank', '3.1 km SO · Jakobshorn, Nordflanke');
  says(m.objectives[0].check({ x: z.x, z: z.z, y: 0, agl: 30 }, { ...s, charges: 1 }).text, 'Hover 15–45 m over the slope · now 30 m · 1 charge left', 'Schwebe 15–45 m über dem Hang · jetzt 30 m · noch 1 Ladung');
  says(m.objectives[0].check({ x: z.x, z: z.z, y: 0, agl: 30 }, s).text, 'Hover 15–45 m over the slope · now 30 m · 8 charges left', 'Schwebe 15–45 m über dem Hang · jetzt 30 m · noch 8 Ladungen');
  says(m.objectives[0].check({ x: z.x, z: z.z, y: 20, agl: 20 }, { ...s, charges: 2, charge: { x: z.x, y: 0, z: z.z, fuse: 2.4 } }).text, 'Charge away · fuse 3 s · 2 charges left', 'Ladung unterwegs · Zündschnur 3 s · noch 2 Ladungen');
  says(m.objectives[0].check({ x: z.x + 900, z: z.z, y: 0, agl: 20 }, { ...s, charges: 1, released: [1, null, null, null], paths: [path, null, null, null] }).text, 'The slope is going · 1 charge left', 'Der Hang geht ab · noch 1 Ladung');
  says(m.summary({ ...s, thrown: 5, hits: 4, misses: 1, cloudHits: 1, penaltyMs: 30000 })[0], '5 charges thrown · 4 zones released · 1 missed · 1 in the powder cloud (+30 s)', '5 Ladungen geworfen · 4 Zonen ausgelöst · 1 daneben · 1-mal in der Staubwolke (+30 s)');
  says(m.summary({ ...s, thrown: 1, hits: 1, misses: 0, cloudHits: 0, penaltyMs: 0 })[0], '1 charge thrown · 1 zone released · 0 missed · 0 in the powder cloud (no penalties)', '1 Ladung geworfen · 1 Zone ausgelöst · 0 daneben · 0-mal in der Staubwolke (keine Strafzeit)');
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
  const VICTORIA = await import('../js/missions-data-victoria.js');
  const { VICTORIA_MISSIONS } = VICTORIA;
  const { HIKE_MISSIONS } = await import('../js/missions-data-hike.js');
  // the gamepad's actions of the resort jobs and the Victoria (js/missions-resort.js, js/missions-victoria.js)
  for (const s of ['Hand over the bar', 'pick the wax', 'Previous wax', 'Next wax', 'Take this wax', 'move the tool', 'Tool back', 'Tool on', 'Wave left', 'Wave straight on', 'Wave right', 'Stop the car', 'Next chore', 'Clear the waypoint']) assert.notEqual(t(s), s, s);
  assert.equal(t(VICTORIA.burnerLabel(3)), 'Platte 3');
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
  const rooms = VICTORIA_MISSIONS[0].summary({ hk: { results: [{ room: 'Room 204', done: 6, of: 6 }, { room: 'The tower suite', done: 5, of: 7 }] } })[0];
  assert.equal(rooms, 'Room 204: 6 of 6 chores · The tower suite: 5 of 7 chores');
  assert.equal(t(rooms), 'Zimmer 204: 6 von 6 Arbeiten · Die Turmsuite: 5 von 7 Arbeiten');
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

test('the local missions, the Silberberg and the gastro rooms say their keys, games and next steps in German', async () => {
  setLanguage('de');
  assert.equal(t('Take a crate from the back of the van'), 'Nimm hinten im Bus eine Kiste');
  // (the moving texts are made with msg(), js/messages.js: made by the mission from a state set up for it, then translated)
  const L = await import('../js/missions-data-local.js');
  const { msg } = await import('../js/messages.js');
  const says = (made, en, de) => { assert.equal(made, en); assert.equal(t(made), de); };
  const beer = L.BEER_MISSION, box = L.BEER_STOPS.find((b) => b.id === 'box');
  says(beer.objectives[0].check({ mode: 'person' }, { beer: { ...L.createBeerState(), carrying: true, loaded: 1 } }).text, 'Stow them in the back of the van (1/2)', 'Verstau sie hinten im Bus (1/2)');
  says(beer.objectives[0].check({ mode: 'person' }, { beer: L.createBeerState() }).text, 'Fetch crates at the brewery door (0/2)', 'Hol Kisten an der Brauereitür (0/2)');
  const atBox = { mode: 'person', x: box.door.x + 30, z: box.door.z };
  says(beer.objectives[5].check(atBox, { beer: { ...L.createBeerState(), van: { x: box.door.x + 1200, z: box.door.z } } }).text, 'The van is 1.2 km away: drive closer to BOX Davos', 'Der Bus ist 1.2 km weg: fahr näher heran · BOX Davos');
  says(beer.objectives[5].check(atBox, { beer: { ...L.createBeerState(), carrying: true, van: { x: box.door.x + 10, z: box.door.z } } }).text, 'Carry the crate in · 30 m', 'Trag die Kiste hinein · 30 m');
  const montana = L.GIPFELI_HOTELS.find((h) => h.id === 'montana'), ride = L.GIPFELI_MISSION.objectives.find((o) => o.id === 'hotel-montana');
  const bike = (min) => ({ mode: 'cyclist', x: montana.road.x + 1300, z: montana.road.z, speed: 5, t: ((min - L.GIPFELI.clockStart) / L.GIPFELI.clockRate) * 1000 });
  says(ride.check(bike(6 * 60 + 52), { gipfeli: { ...L.createGipfeli(), rideStart: 0 } }).text, '6:52 · 8 min to 7:00 · 1.3 km to the Hotel Montana', '6:52 · noch 8 min bis 7:00 · 1.3 km zum Hotel Montana');
  says(ride.check(bike(7 * 60 + 3), { gipfeli: { ...L.createGipfeli(), rideStart: 0 } }).text, '7:03 · late! · 1.3 km to the Hotel Montana', '7:03 · zu spät! · 1.3 km zum Hotel Montana');
  says(L.GIPFELI_MISSION.objectives[0].check({ mode: 'person', x: L.WEBER.door.x + 12, z: L.WEBER.door.z }).text, '12 m to the bakery', '12 m bis zur Bäckerei');
  const spot = L.SQUIRREL_MISSION.objectives[0].check({ mode: 'person', x: 0, z: 0 }).target;
  says(L.SQUIRREL_MISSION.objectives[0].check({ mode: 'person', x: spot.x, z: spot.z + 40 }).text, '40 m to the Eichhörnliplatz', '40 m bis zum Eichhörnliplatz');
  const ibex = L.IBEX_MISSION, hunt = L.createHunt(3);
  says(ibex.objectives[0].check({ x: L.IBEX.stand.x + 120, z: L.IBEX.stand.z }, { hunt: { ...hunt, alarmWhy: 'too close' } }).text, '120 m to the stand · the herd is uneasy: too close', '120 m bis zum Hochsitz · die Herde wird unruhig: zu nah');
  says(ibex.objectives[0].check({ x: L.IBEX.stand.x + 120, z: L.IBEX.stand.z }, { hunt: { ...hunt, alarmWhy: 'the wind carries your scent' } }).text, '120 m to the stand · the herd is uneasy: the wind carries your scent', '120 m bis zum Hochsitz · die Herde wird unruhig: der Wind trägt deine Witterung hin');
  says(ibex.objectives[0].check({ x: L.IBEX.stand.x + 120, z: L.IBEX.stand.z }, { hunt }).text, '120 m to the stand', '120 m bis zum Hochsitz');
  const herd = L.herdCentre(hunt.herd);
  says(ibex.objectives[1].check({ x: herd.x + 140, z: herd.z }, { hunt: { ...hunt, ammo: 3, score: 120 } }).text, '3 rounds · 120 pts · herd 140 m', '3 Schuss · 120 Pkt. · Herde 140 m');
  says(ibex.objectives[1].check({ x: herd.x + 140, z: herd.z }, { hunt: { ...hunt, ammo: 1, score: -40 } }).text, '1 round · 0 pts · herd 140 m', '1 Schuss · 0 Pkt. · Herde 140 m');
  const nanny = L.ibexShotResult({ animal: { sex: 'f', age: 'adult', horn: 0.3 }, zone: 'vitals', t: 180 }, 180);
  const buck = L.ibexShotResult({ animal: { sex: 'm', age: 'old', horn: 0.92 }, zone: 'vitals', t: 180 }, 180);
  const miss = L.ibexShotResult(null, 200);
  const shots = ibex.summary({ hunt: { ...hunt, shots: [nanny, buck, miss].map((r) => ({ ...r, range: 180 })) } });
  says(nanny.text, 'Not allowed: a nanny (female)! Fine and penalty', 'Nicht erlaubt: eine Geiss! Busse und Strafpunkte');
  says(shots[0], 'Not allowed: a nanny (female)! Fine and penalty (-150)', 'Nicht erlaubt: eine Geiss! Busse und Strafpunkte (-150)');
  says(shots[1], `Clean shot on the buck (92 cm horns) at 180 m (+${buck.points})`, `Sauberer Schuss auf den Bock (92 cm Hörner) auf 180 m (+${buck.points})`);
  says(shots[2], 'Missed: the herd bolts up the slope (-20)', 'Daneben: Die Herde flieht den Hang hinauf (-20)');
  const squirrels = L.createSquirrelGame(L.squirrelSpots());
  const feed = (g) => L.SQUIRREL_MISSION.objectives[1].check({ x: L.SEEPROMENADE[0], z: L.SEEPROMENADE[1] }, { game: { ...squirrels, ...g } }).text;
  says(feed({ fed: 4, score: 120, t: L.SQUIRREL.length - 130, streak: 3 }), '4 fed · 120 pts · 2:10 · streak 3', '4 gefüttert · 120 Pkt. · 2:10 · Serie 3');
  says(feed({ fed: 4, score: 120, t: L.SQUIRREL.length - 130, streak: 1 }), '4 fed · 120 pts · 2:10', '4 gefüttert · 120 Pkt. · 2:10');
  says(L.WATERSLIDE_MISSION.objectives[1].check({}, { rider: { ...L.createRider(), v: 42 / 3.6, s: L.slideLength() - 120 } }).text, '42 km/h · 120 m to the pool', '42 km/h · noch 120 m bis zum Becken');
  says(L.KIRCHNER_MISSION.objectives[1].check({}, { paint: { t: L.KIRCHNER.length - 130, result: null } }).text, '2:10 left', 'noch 2:10');
  // (the slide's HUD in js/missions-local.js, which needs three.js, makes its metres to go the same way)
  says(msg('{n} m to go', 'noch {n} m', { n: 12 }), '12 m to go', 'noch 12 m');
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

test('the Silberberg\'s ore shift speaks German: its HUD, toasts and summary', async () => {
  const D = await import('../js/missions-data-mine.js');
  setLanguage('de');
  // (its moving texts are made with msg(), js/messages.js: made by the mission, then translated)
  const says = (made, en, de) => { assert.equal(made, en); assert.equal(t(made), de); };
  const M = D.MINE_MISSION, mine = M.objectives.find((o) => o.id === 'mine');
  const shift = (over) => ({ basket: { galena: 0, sphalerite: 0, barren: 0, kg: 0, pts: 0 }, lamp: 130, delivered: 0, bonus: 0, ore: { galena: 0, sphalerite: 0, barren: 0 }, over: null, target: null, ...over });
  says(mine.check({}, { shift: shift({ delivered: 120, basket: { kg: 7.25 } }) }).text, '120 pts · basket 7.3/20 kg · lamp 2:10', '120 Pkt. · Korb 7.3/20 kg · Lampe 2:10');
  says(D.basketText(shift({ delivered: 120, basket: { kg: 7.25 } }), 14.4), 'Basket 7.3/20 kg · ore bin 14 m · 120 pts', 'Korb 7.3/20 kg · Erzkasten 14 m · 120 Pkt.');
  says(D.oreText('galena', 0.5), '+0.5 kg galena', '+0.5 kg Bleiglanz');
  says(D.oreText('barren', 1.25), '+1.3 kg barren rock', '+1.3 kg taubes Gestein');
  says(D.dumpText(12.5, 96.4), '12.5 kg into the ore bin: +96 pts', '12.5 kg in den Erzkasten: +96 Pkt.');
  says(D.veinText({ kind: 'sphalerite', kg: 6, mined: 1.5 }), 'Sphalerite · 4.5 kg · hold Strike', 'Zinkblende · 4.5 kg · Zuschlagen halten');
  says(D.veinText({ kind: 'barren', kg: 3, mined: 0 }), 'Barren rock · 3 kg · hold Strike', 'Taubes Gestein · 3 kg · Zuschlagen halten');
  const ore = { galena: 12.5, sphalerite: 4, barren: 0.25 };
  const [mined, out] = M.summary({ shift: shift({ ore, bonus: 40 }) });
  says(mined, 'Mined: 12.5 kg galena · 4 kg sphalerite · 0.3 kg barren rock', 'Abgebaut: 12.5 kg Bleiglanz · 4 kg Zinkblende · 0.3 kg taubes Gestein');
  says(out, 'Out with 2:10 of oil left: +40 pts', 'Draussen mit 2:10 Öl übrig: +40 Pkt.');
  says(M.summary({ shift: shift({ ore, bonus: 0 }) })[1], 'Out with 2:10 of oil left.', 'Draussen mit 2:10 Öl übrig.');
  says(M.summary({ shift: shift({ ore, over: 'dark', basket: { kg: 3.5 } }) })[1], 'The lamp went out inside: 3.5 kg in the basket stayed with you.', 'Die Lampe erlosch drinnen: 3.5 kg im Korb blieben bei dir.');
  says(M.summary({ shift: shift({ ore, over: 'dark' }) })[1], 'The lamp went out inside.', 'Die Lampe erlosch drinnen.');
  setLanguage('en');
  assert.equal(t(mined), mined);
});

test('the ice resurfacer in the Eisstadion speaks German: its steps, hints, HUD, keys and summary', async () => {
  const { ZAMBONI_MISSION, ZAMBONI, createMachine, machineWorld, iceText, knockText } = await import('../js/missions-data-zamboni.js');
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
  for (const s of [iceText(0.63), knockText(), 'Conditioner on', 'Conditioner off', 'Conditioner', 'Snow tank', 'Water', 'drive', 'brake · back up', 'steer', 'conditioner on/off', 'Overview',
    'The water tank is empty', 'Water on wet ice: a puddle!', 'Water tank almost empty']) seen.add(s);
  for (const text of seen) assert.notEqual(t(text), text, text);
  // (its moving texts are made with msg(), js/messages.js: made by the mission, then translated)
  const says = (made, en, de) => { assert.equal(made, en); assert.equal(t(made), de); };
  const left = (ms) => ZAMBONI.timeLimitMs - ms; // (the clock: ms into the run for the time left)
  says(boards.check(at(0, 0, left(466000)), { ...m.createState(), band: 0.525 }).text, 'Along the boards 52 % of 90 % · 7:46 left', 'Der Bande entlang 52 % von 90 % · noch 7:46');
  says(middle.check(at(0, 0, left(125000)), { ...m.createState(), ice: 0.635, water: 0.585 }).text, 'Ice 63 % of 95 % · water 58 % · 2:05 left', 'Eis 63 % von 95 % · Wasser 58 % · noch 2:05');
  says(gate.check(at(ZAMBONI.home + 12, ZAMBONI.gate.y, left(41000)), { ...m.createState(), ice: 0.96 }).text, '12 m to the gate · 0:41 left', '12 m bis zum Tor · noch 0:41');
  says(iceText(0.63), 'Ice 63 %', 'Eis 63 %');
  says(knockText(), 'Hard knock on the boards! −40', 'Harter Schlag an die Bande! −40');
  says(m.summary({ ...m.createState(), ice: 0.964, bumps: 2, puddleM2: 3.25, water: 0.31 })[0], '96 % of the ice resurfaced · 2 hard knocks · 3 m² of puddles · water left 31 %', '96 % des Eises geglättet · 2 harte Schläge · 3 m² Pfützen · Wasser übrig 31 %');
  says(m.summary({ ...m.createState(), ice: 0.95, bumps: 1, puddleM2: 0, water: 0.2 })[0], '95 % of the ice resurfaced · 1 hard knock · 0 m² of puddles · water left 20 %', '95 % des Eises geglättet · 1 harter Schlag · 0 m² Pfützen · Wasser übrig 20 %');
  setLanguage('en');
});

test('the long break on the SAMD\'s roof speaks German, with a Swiss-German shout or two', async () => {
  const { SAMD_MISSION: m, ROLES, SIDEKICK, START, DOOR, SPIT, createBreak } = await import('../js/missions-data-samd.js');
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
  // (the moving texts are made with msg(), js/messages.js: made by the mission, then translated)
  const says = (made, en, de) => { assert.equal(made, en); assert.equal(t(made), de); };
  says(m.objectives[0].check({ x: DOOR.x - 21, z: DOOR.z }).text, '21 m to the side door of the SAMD', '21 m bis zur Seitentür der SAMD');
  says(m.objectives[1].check({}, { brk: { ...b, points: 120, t: SPIT.breakS - 83, combo: 3 } }).text, '120 pts · 1:23 left · combo ×1.5', '120 Pkt. · noch 1:23 · Kombo ×1.5');
  says(m.objectives[1].check({}, { brk: { ...b, points: 0, t: 0 } }).text, '0 pts · 2:30 left', '0 Pkt. · noch 2:30');
  says(m.summary({ brk: { ...b, spits: 31, hits: 17, maxCombo: 5, rektorHits: 2, forbidden: 1 } })[0], '31 gobs · 17 hits · best run ×5 · the Rektor 2× · 1 off limits', '31 Rotzer · 17 Treffer · beste Serie ×5 · der Rektor 2× · 1-mal tabu');
  says(m.summary({ brk: { ...b, spits: 1, hits: 1, maxCombo: 1, rektorHits: 0, forbidden: 0 } })[0], '1 gob · 1 hit · best run ×1 · the Rektor 0× · 0 off limits', '1 Rotzer · 1 Treffer · beste Serie ×1 · der Rektor 0× · 0-mal tabu');
  says(m.summary({ brk: { ...b, caught: true } })[1], 'Caught by the Hausmeister: −150 for the detention', 'Vom Hausmeister erwischt: −150 fürs Nachsitzen');
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
  // (the moving texts are made with msg(), js/messages.js: made by the mission, then translated)
  const says = (made, en, de) => { assert.equal(made, en); assert.equal(t(made), de); };
  const at = (more) => m.objectives[0].check({}, { drive: Object.assign(createDrive(), more) }).text;
  says(at({ aboard: 12 }), 'Davos Dorf · boarding 12/46 · departure 0:20', 'Davos Dorf · Einsteigen 12/46 · Abfahrt 0:20');
  says(at({ phase: 'ready', doors: 'closed', t: 12.5 }), 'Doors closed · departure 0:20 (in 8 s)', 'Türen zu · Abfahrt 0:20 (in 8 s)');
  says(at({ phase: 'ready', doors: 'closed', t: 30 }), 'Doors closed · departure 0:20', 'Türen zu · Abfahrt 0:20');
  const end = driveLine(createDrive()).runLen;
  says(at({ phase: 'halt', s: end - 0.07, v: 0 }), 'Höhenweg · −7 cm from the board', 'Höhenweg · −7 cm von der Tafel');
  says(at({ phase: 'halt', s: end + 1.2, v: 0 }), 'Höhenweg · +1.2 m from the board', 'Höhenweg · +1.2 m von der Tafel');
  says(at({ phase: 'alight' }), 'Höhenweg · the passengers get off', 'Höhenweg · Die Fahrgäste steigen aus');
  says(m.objectives[0].check({}, { drive: d }).text, 'Höhenweg: 297 pts', 'Höhenweg: 297 Pkt.');
  const summary = m.summary({ drive: { ...d, overspeed: 4, maxOver: 5, overspeedPenalty: 14 } });
  says(summary[0], 'Davos Dorf – Höhenweg: departure +2 s (horn) · arrival −8 s · −7 cm · ride 50/50 → 297 pts', 'Davos Dorf – Höhenweg: Abfahrt +2 s (Hornsignal) · Ankunft −8 s · −7 cm · Fahrt 50/50 → 297 Pkt.');
  says(m.summary({ drive: { ...d, results: [{ from: 'Höhenweg', to: 'Weissfluhjoch', departLate: -1, delay: 3, error: 1.24, horn: 0, comfort: 40, total: 180 }] } })[0],
    'Höhenweg – Weissfluhjoch: departure −1 s · arrival +3 s · +1.2 m · ride 40/50 → 180 pts', 'Höhenweg – Weissfluhjoch: Abfahrt −1 s · Ankunft +3 s · +1.2 m · Fahrt 40/50 → 180 Pkt.');
  assert.equal(t(summary[1]), 'Über dem Limit 4 s (bis +5 km/h): −14 Pkt.');
});
