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
  assert.match(t('Davos collects green waste now, in round barrels'), /runden Fässern/);
  assert.equal(t('Gate 3/11 · 120 m · 2 clean jumps'), 'Tor 3/11 · 120 m · 2 saubere Sprünge');
  assert.equal(t('Barrels 4/10 · load 38 % · next 90 m'), 'Fässer 4/10 · Ladung 38 % · nächstes 90 m');
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
