# Steuerung vereinheitlichen, Handy verbessern – Plan (Stand 2026-11-06)

Ausgangslage (Code auf Branch `davos`, Screenshots iPhone 13 und Desktop 1440×900, freies Spiel und die Missionen
Kran, Schneefräse, Dischma-Loipe, Golf, WEF-Eskorte, Gleitschirm):

**Vier Eingabewege, vier Quellen der Wahrheit.**

- Tastatur: die Fahrzeug-Extras stecken verstreut in `js/controllers.js` (L Fernlicht, K Rundumleuchte, F Fräse,
  Q/E/X Blinker), `js/gta.js` (F/G ein- und aussteigen, T fahren, K Blaulicht im gekaperten Streifenwagen),
  `js/main.js` (B Hupe, N Ton, H, V, 1–0) und `js/paraglide-free.js` (P). Jede Stelle prüft selbst `isTypingInField`,
  Modifier, `repeat`, Karte offen, Missionsliste offen.
- Hinweisleiste unten (`#hud-controls-hint`): eine statische Tabelle in `js/main.js`, die der Kran (`craneKeyBar`)
  und der freie Gleitschirmflug von Hand überschreiben bzw. ergänzen. Sie zeigt **Shift Boost / Sprint**, das es im
  Controller gar nicht gibt (`keys.boost` existiert nicht, `is-boosting` wird nie gesetzt).
- Touch: `js/touch-controls.js` kennt nur Stick, «Jump/Ascend» (= `up`) und «Descend» (= `down`) plus den
  Tipp-Button «Einsteigen» aus `js/gta.js`. **Fernlicht, Hupe, Blinker, Rundumleuchte, Fräse, Suchscheinwerfer gibt es
  auf dem Handy nicht.** Die Mission «Dischma-Loipe» (Fräse mit F absenken) ist auf dem Handy nicht spielbar.
- Gamepad: eigene Tabelle in `js/gamepad-controls.js` (X einsteigen, Y Kamera, D-Pad links Gleitschirm); keine Extras.

**Missionen bauen sich ihre Knöpfe selbst.** Fünf Kopien von `touchLabel()` (care, golf, ice, sport, paraglide über
ice) beschriften den Jump-Button um. Daneben ein eigener roter Button-Stil `.mission-fire` (Lawinenwerfer «Fire»,
Big Air «Grab», Schaufel/Pilze/Alpenrosen «Shovel/Pick», Schneefräse «Chute», Schneeladen «E», Kran «Lift/Lower/Hook/View»,
Quad «Reject»), ein blauer Stil `.wf-btn` (Eskorte «Blue light/Radio»), und beide sitzen **rechts unten über dem
Joystick** (Screenshots: Chute, Hook/Lower, Blue light/Radio liegen auf dem Stick). Zwölf Missionen schreiben ihre
Tastenlegende als Freitext in den eigenen HUD (`.golf-keys`, `.pg-keys`, `.ice-keys`, `.cr-keys`, `.sport-keys`),
jede in eigener Schrift, auf dem Handy ausgeblendet.

**Handy-Layout.** Der Kamera-Cluster oben rechts ist 230 px breit («3rd-Person…» abgeschnitten) und drückt den
Missionsstreifen auf +112 px unter die Toolbar; unter dem Streifen bleibt wenig Platz für Missions-HUDs (Golf,
Eskorte). Der Jump-Button links unten ist in Fahrzeugen leer: die linke Daumenzone ist ungenutzt.

## Prinzipien

1. **Ein Aktions-Register** (`js/actions.js`): jede Aktion ausser Bewegen/Lenken wird einmal beschrieben
   (Id, Label, Taste(n), Art: halten / tippen / umschalten, Icon, Gamepad-Slot, wann verfügbar, was sie tut).
   Tastatur, Hinweisleiste, Touch-Knöpfe und Gamepad lesen daraus. Eine Mission registriert ihre Aktionen gleich
   und bekommt alle vier Wege geschenkt.
2. **Links die Aktionen, rechts der Stick.** Auf dem Handy gibt es genau einen Ort für Knöpfe: die linke Daumenzone,
   zwei Reihen. Nichts liegt je über dem Stick.
3. **Ein Knopf-Stil.** Glas-Kreise wie heute «Jump»; gedrückt/aktiv in Taxi-Gelb. Rot und Blau verschwinden.
4. **Eine Legende.** Die Hinweisleiste unten ist die einzige Tastenlegende, auch in Missionen; sie zeigt immer das,
   was jetzt gilt (Fahrzeug + Mission, oder nur Mission, wenn die Mission die Steuerung übernimmt).
5. **Nichts Totes.** Keine Hinweise auf Tasten ohne Funktion.

## 1. Das Register (`js/actions.js`, neu)

```js
// eine Aktion
{ id: 'highBeam', label: 'High beam', keys: ['KeyL'], kbd: ['L'], kind: 'toggle', icon: 'i-beam',
  pad: 'b',                       // Gamepad-Slot (optional): a b x y | up down left right (D-Pad) | l3
  when: () => mode === 'car' || mode === 'snowcat' || mode === 'helicopter',
  state: () => cm.highBeam,       // nur toggle: an/aus für den Knopf und die Leiste
  run: () => cm.toggleHighBeam() } // tap/toggle; hold: run(true) beim Drücken, run(false) beim Loslassen
```

- `actions.layer(name, list, { replace })` legt eine Schicht an (Spiel, Fahrzeug, GTA, Gleitschirm, Mission);
  `replace: true` deckt die Fahrzeugschicht zu (Kran in der Kabine, Bar, Dartscheibe). Eine Schicht gibt eine
  Funktion zurück, die sie wieder entfernt; `run.cleanups` räumt Missionsschichten auf.
- Eine Tastatur-Abfrage für alle: `isTypingInField`, Modifier, `repeat`, Karte offen, Missionsliste offen,
  Intro-Dialog – einmal geprüft. Die `keydown`-Capture-Listener der Missionen (`key(run, e)`) bleiben; sie laufen
  vorher und schlucken, was sie brauchen.
- `actions.subscribe(fn)`: Hinweisleiste und Touch-Knöpfe bauen sich bei jeder Änderung neu (Modus, Schicht, Zustand).
- `hold`-Aktionen, die auf den Controller gehen (`up`, `down`), bleiben Controller-Tasten (Space/E, Q/C) und stehen
  nur **beschrieben** im Register; `relabel('up', 'Swing')` ersetzt die fünf `touchLabel`-Kopien.

Die Basis-Schichten:

| Schicht | Aktionen |
|---|---|
| Fahrzeug `car` | Hupe B (tap) · Blinker links Q / rechts E (toggle mit Zustand) · Warnblinker X (toggle) · Fernlicht L (toggle) |
| `snowcat` | Fernlicht L · Rundumleuchte K · Fräse F (toggle, Zustand «unten/oben») |
| `helicopter` | Suchscheinwerfer L · Steigen Space/E, Sinken Q/C (hold, beschrieben) |
| `person` | Springen Space (hold, beschrieben) · Gleitschirm P (tap, nur mit Lizenz und am Hang: `js/paraglide-free.js`) |
| GTA | Einsteigen/Aussteigen F bzw. G im Pistenfahrzeug (tap, Label vom `gta.js`-Prompt) · Fahren T (nur Bus) · Blaulicht K im gekaperten Streifenwagen (toggle) |

Die «Shift Boost/Sprint»-Hinweise fallen weg (tot). `body.is-boosting` in `main.js` ebenfalls.

## 2. Tastatur und Hinweisleiste

- `renderControlHints(mode)` in `js/main.js` wird `renderHints()`: die Bewegungs-Hinweise je Modus (W/S, A/D, Drag)
  bleiben eine kleine Tabelle; dahinter kommen die Aktionen des Registers in Schichtreihenfolge, Toggles mit Punkt
  («L Fernlicht ●»). Deckt eine Schicht zu (`replace`), zeigt die Leiste nur sie.
- `bindKeyboard()` in `js/controllers.js` behält W/S/A/D/Space/E/Q/C; L/K/F/Q/E/X ziehen ins Register
  (die Handler `toggleHighBeam/Beacon/Tiller/Indicator` bleiben, wo sie sind). `js/gta.js` und `js/main.js`
  (B) und `js/paraglide-free.js` (P) registrieren statt eigene `keydown` zu binden.
- Globale Tasten (1–0, V, H, N, M, Enter/U für Missionsstart) bleiben, wo sie sind: sie sind keine Aktionen des
  Spielers in der Welt.
- In Missionen mit eigener Steuerung (`body.mission-own-controls`) bleibt die Leiste sichtbar und zeigt die
  Missionsaktionen; nur der Moduswechsler verschwindet (heute verschwindet die ganze `.hud-bottom-center`).

## 3. Touch: zwei Reihen links

```
┌───────────────────────────── iPhone 13, 390 px ─────────────────────────────┐
│ [Toolbar]                                                                   │
│                                              [<] [📷] [>]   (3 × 44 px)      │
│ ┌ Missionsstreifen ┐                          Drag to look · Pinch to zoom  │
│                                                                             │
│                                                                             │
│  (🔦) (📯) (⇤) (⇥)        ← Extra-Reihe: 48 px, Icon + 10-px-Label,         │
│                              toggles mit Taxi-Ring, max. 4, dann Umbruch    │
│  [↗ Get in] [↑ Jump]                        ( Stick 136 px )                │
│                              ← Hauptreihe: 64 px wie heute                  │
│                                              Move & steer                   │
│ [Modusleiste, nur ?classic=1]                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

- `index.html`: `.touch-actions` bekommt `.touch-extra` (oben) und `.touch-primary` (unten); die beiden festen
  Buttons `up`/`down` bleiben als Markup (Tests zählen sie), alles andere baut `touch-controls.js` aus dem Register.
- Hauptreihe: Tipp-Button (Einsteigen/Fly/Pack up), `up`, `down`, dazu Missions-`hold`-Aktionen mit `primary: true`
  (Fire, Grab, Shovel/Pick, Lift/Lower, Reject). Extra-Reihe: Toggles und Tipp-Aktionen (Hupe, Blinker, Fernlicht,
  Rundumleuchte, Fräse, Chute, Hook, View, Blaulicht, Funk, Suchscheinwerfer).
- Halten vs. tippen vs. umschalten kommt aus `kind`; `aria-pressed` für Toggles, Taxi-Ring + Punkt als Zustand.
  Pointer-Handling (Capture, verlorene Finger, Blur) wie heute, einmal für alle.
- `addTapButton/setTapButton/touchLabel` bleiben als dünne Hüllen über dem Register, bis alle Missionen migriert sind.
- CSS: `.mission-fire`, `.wf-pad/.wf-btn` (nur die Eskorte; die Demo-Mission behält ihr Dialog-Pad), die
  `.golf-keys`-Familie fallen weg; `#touch-controls` bleibt bei `bottom + 72px` (klassisch) bzw. `+ 0` ohne Modusleiste.
- Breiten: Hauptreihe 3 × 64 + 2 × 10 = 212 px, Stick 136 px, Rand 2 × 12 → 384 px auf 390 px. Mit vier
  Hauptknöpfen (Kran: Lift, Lower + Jump versteckt) passt es, weil `up`/`down` in der Kabine versteckt sind.

## 4. Gamepad

`js/gamepad-controls.js` liest die Slots des Registers statt fester Indizes: `x` (2) einsteigen, `y` (3) Kamera,
D-Pad links (14) Gleitschirm bleiben; neu `b` (1) Fernlicht/Suchscheinwerfer (wenn die Karte zu ist),
`l3` (10) Hupe, D-Pad rechts (15) erste Extra-Aktion der Mission (Fräse, Chute, Hook, Blaulicht), `a` (0) die erste
Haupt-Aktion (Fire, Grab, Lift…), `b` in der Kabine Lower. Zoom bleibt auf D-Pad oben/unten.

## 5. Missionen

Jede Mission bekommt `run.actions(list, { replace })` (in `js/missions.js` `createRun`, räumt sich selbst auf) und
`run.hints(list)` für Bewegungs-Hinweise ohne Aktion («W walk · A/D steer»).

| Mission | heute | neu |
|---|---|---|
| Dischma-Loipe (`js/missions-data.js`) | F Fräse nur Tastatur | kommt gratis über die `snowcat`-Schicht: Fräse-Toggle auf Touch und Gamepad |
| Schneefräse, Schneeladen (`js/missions-work.js`) | roter «Chute»/«E» über dem Stick | Chute = tap Extra-Reihe; «E» laden = hold Hauptreihe «Load» |
| Kran (`js/missions-work.js`) | vier rote Knöpfe, `craneKeyBar` | Schicht `replace`: Lift/Lower hold Hauptreihe, Hook/View tap Extra; die Leiste zeigt die Kranschicht |
| Schaufel, Pilze, Alpenrosen, Quad (`missions-work.js`, `missions-rural.js`) | `holdButton` rot | hold Hauptreihe «Shovel/Pick/Reject» |
| Lawinenwerfer (`js/missions.js`) | roter «Fire» | tap Hauptreihe «Fire», primär |
| Big Air (`js/missions-snow.js`) | roter «Grab» | hold Hauptreihe «Grab» |
| WEF-Eskorte (`js/missions-wef.js`) | `.wf-pad` blau | Blaulicht toggle (Zustand), Funk tap: Extra-Reihe; Desktop-Leiste «K Blaulicht · J Funk» |
| Gleitschirm-Mission, Golf, Schneeschuh, Eis, Sport, Seilpark (`touchLabel`) | fünf Kopien | `relabel('up', …)` aus dem Register |
| Legenden `*-keys` (12 Stellen) | Freitext im HUD | `run.hints([...])` → Hinweisleiste; die HUDs werden schmaler |
| Polizei-Takeover (`js/gta.js`) | K nur Tastatur | Blaulicht-Toggle in der GTA-Schicht, wenn im Streifenwagen |

Nicht angefasst: die Spiele mit eigener Oberfläche (Bars, Gastro, Optiker, Zahnarzt, Demo-Dialog, Curling, Darts,
Minigolf): sie zeichnen eigene Knöpfe im Spielfeld und sind schon touchfähig. Ihre Tastenzeilen gehen aber ebenfalls
in die Leiste (`run.hints`).

## 6. Handy-Layout (ausserhalb der Knöpfe)

- Kamera-Cluster auf Touch: `[<] [📷] [>]` 3 × 44 px ohne Namen (der Name steht im Popover); die `.cluster`-Breite
  230 px fällt. Der Missionsstreifen rückt von +112 auf +64 px unter die Toolbar, «Drag to look» darunter.
- Missions-HUDs, die heute mit `bottom: … + 200px` über den Knöpfen schweben (Golf, Eskorte, Gleitschirm, Eis,
  Sport, Care), bekommen eine gemeinsame Variable `--touch-stack` (Höhe der zwei Knopfreihen) statt sechs Zahlen.
- Der Jump-Button verschwindet in Fahrzeugen (heute: leer links); die Extra-Reihe füllt die Zone sinnvoll.
- `?classic=1`: Modusleiste bleibt unten, Knöpfe darüber wie heute.

## 7. Umsetzung (Reihenfolge, Dateien)

1. `js/actions.js` (Register, Tastatur-Dispatcher, Schichten) + `tests/actions.test.mjs` (reine Logik, kein DOM).
2. `js/main.js` Hinweisleiste aus dem Register; tote Boost-Hinweise raus. `js/controllers.js` L/K/F/Q/E/X raus.
   `js/gta.js` F/G/T/K als Aktionen; `js/paraglide-free.js` P als Aktion.
3. `js/touch-controls.js` zwei Reihen aus dem Register; `index.html`, `css/style.css`; `js/i18n.js` neue Labels
   (Hazard lights, Indicator left/right, Chute, Load, Hook, View, Reject gibt es teils schon).
4. `js/gamepad-controls.js` Slots.
5. Missionen (Tabelle 5), eine Datei nach der anderen, jede mit `npm test`.
6. Handy-Layout (6).
7. Playwright-Screenshots: Desktop 1440, iPhone 13, iPhone SE; frei (Auto, Pistenfahrzeug, Heli), Kran,
   Schneefräse, Dischma-Loipe, Eskorte, Golf; DE und EN. `tests/ui.test.mjs` erweitern (kein `.mission-fire`,
   kein `.wf-pad`, keine `*-keys`, Reihenfolge der Touch-Reihen).

Konflikt: die parallele Session (Rennen/Geister, Rink, Splitboard, Lizenz) hat ungesicherte Änderungen in
`controllers.js`, `gamepad-controls.js`, `main.js`, `index.html`, `style.css`, `i18n.js`, `missions.js`,
`missions-work.js`, `missions-paraglide.js`. Diese Arbeit beginnt, wenn jene committet ist, sonst müssten die
Commits hunkweise getrennt werden.

## Offene Entscheide (mit Empfehlung)

1. **Extra-Reihe auf dem Handy**: (a) Reihe aus kleinen Icon-Knöpfen über der Hauptreihe (Empfehlung: alles mit einem
   Daumen erreichbar, kein Menü nötig) oder (b) ein «⋯»-Knopf, der ein Popover mit den Extras öffnet (weniger
   Knöpfe im Bild, aber zwei Tipps für die Hupe).
2. **Legenden der Missionen in die Leiste** (12 Dateien, je 1–3 Zeilen): ja (Empfehlung: dann gilt Prinzip 4
   wirklich) oder erst in einem zweiten Schritt.
3. **Gamepad-Erweiterung** (B Fernlicht, L3 Hupe, D-Pad rechts Missions-Extra): mitnehmen (Empfehlung: klein, das
   Register macht es fast gratis) oder weglassen.
4. **Kamera-Cluster auf Touch verkleinern** (3 × 44 px, ohne Namen): ja (Empfehlung) oder so lassen.

## Umgesetzt (2026-11-06)

Alles aus dem Plan mit den vier Empfehlungen (Extra-Reihe aus Icon-Knöpfen, Legenden in der Leiste, Gamepad-Slots,
kompakter Kamera-Cluster). Abweichungen und Details:

- `js/actions.js`: `ActionRegistry` mit `layer(name, list, { replace, rank })`, `list()`, `hints()`, `press()`,
  `hold()`, `relabel()`, `key(e, isDown)` und `bindKeyboard()`. Missionsschichten haben `rank: 10`, damit sie auch
  dann oben liegen, wenn die Mission per `?mission=` vor den Spielschichten startet. `run.hints()` ersetzt die
  Spielschichten (`replace: true`): eine Mission, die ihre Tasten beschreibt, beschreibt sie ganz. Während
  `ownControls` gilt, legt der Run eine leere ersetzende Schicht (`rank: 9`): die Leiste zeigt nur Missionstasten
  oder nichts (statt wie vorher die ganze `.hud-bottom-center` auszublenden; der Moduswechsler geht weiterhin weg).
- Die Missionstasten selbst bleiben in den `key(run, e)`-Capture-Listenern (`keyboard: false` im Register): sie
  schlucken Space/F/V, bevor Controller und GTA sie sehen. Das Register liefert Leiste, Touch und Gamepad.
- Touch (`js/touch-controls.js`): die zwei festen Knöpfe `up`/`down` bleiben Markup und speisen die Controller-Eingänge;
  alles andere baut `render()` aus dem Register (`.touch-primary` 64 px, `.touch-extra` 52 px, vier pro Reihe neben
  dem Stick auf 390 px). `addTapButton/setTapButton` sind Hüllen über dem Register (GTA «Einsteigen», freier Flug
  «Fly»); `touchLabel` (ice, golf, care, sport) ist `run.button(id, label)`.
- Gamepad: `a` Haupt-Hold einer Mission (Schaufel, Fire, Reject), wenn der Jump-Knopf versteckt ist; `b` Fernlicht
  bzw. Kran «View»; `x` Einsteigen; `l3` Hupe bzw. Funk; D-Pad links Gleitschirm; D-Pad rechts Fräse, Chute, Haken,
  Blaulicht. Zoom bleibt auf D-Pad oben/unten.
- Kran: Lift/Lower sind die relabelten `up`/`down`-Knöpfe (die Kabine liest `keys.up/down`), Hook/View Extra-Reihe;
  `w.touch.hoist` und `craneKeyBar` sind weg. Schneeladen: Chute nur im Schritt 1, «Climb across» ab Schritt 2
  (`when: () => run.index`; ein Schrittwechsel ruft `actions.notify()`).
- Handy: Kamera-Cluster `[<] [📷] [>]` 3 × 44 px, Missionsstreifen auf +120 px; `--touch-clear` (GTA 180 px, klassisch
  250 px) statt sechs fester Zahlen in den Missions-HUDs; ohne Modusleiste sitzen die Knöpfe ganz unten.
- Desktop: die Leiste ist bis 820 px breit (Auto mit Extras auf einer Zeile); Eskorte-HUD und Schneeschuh-HUD stehen
  über der Leiste statt darauf.
- Entfernt: Shift Boost/Sprint, `is-boosting`, `.mission-fire`, `.wf-pad` der Eskorte, die zwölf `*-keys`-Legenden
  und ihre i18n-Paare (die Bruchstücke haben eigene Paare), `.touch-tap-label`.
- Prüfung: `tests/actions.test.mjs` (Register), `tests/touch-controls.test.cjs` (Knöpfe aus dem Register),
  `tests/ui.test.mjs` (Verdrahtung, Markup, CSS, keine Altlasten), 768 Tests grün; Playwright Desktop 1440, iPhone 13,
  iPhone SE, DE und EN: frei (Fuss, Auto, Pistenfahrzeug, Heli), Kran in der Kabine, Schneefräse, Schneeladen beide
  Schritte, Dischma-Loipe (Fräse auf Touch), Eskorte, Golf, Lawinenwerfer, Big Air, Schaufel, Quad, Gleitschirm,
  Schneeschuh, Darts.

Nicht gemacht: das Chrome-Gamepad liess sich nicht automatisiert prüfen (nur die Zuordnung im Test); Big Air /
Rink / Splitboard / Seilpark laufen weiter über `touchLabel` (jetzt eine Hülle über `run.button`).

Nachtrag (2026-11-06, Beschriftungen): Die Extra-Buttons (52 px, 8 px Schrift) tragen höchstens neun Zeichen, deshalb
sind die Labels gekürzt: Leiste «Drive», «Turn», «Pedal», «Lean» statt «Drive / Reverse», «Turn on the spot»,
«Pedal / Brake», «Lean & Turn»; Touch «Warnlicht» (Hazard), «Drehlicht» (Beacon, auch in der Leiste), «Suchlicht»
(touchLabel «Spotlight» beim Heli, die Leiste sagt weiter «Suchscheinwerfer»), «Ablehnen» (Reject). `touchLabel` darf
eine Funktion sein. Dazu: der geschlossene Credits-Dialog nahm `.mission-dialog`s `display: flex` und ragte auf iOS
unter die Spielfläche (die Seite liess sich bis zu ihm scrollen); `dialog.mission-dialog:not([open])` ist jetzt versteckt.

Nachtrag (2026-11-06, nur noch der Spielmodus): Der Simulationsmodus (`?classic=1`, die Modusleiste mit den Tasten 1 bis 6,
die Schultertasten des Gamepads zum Durchschalten) ist entfernt. Fahrzeuge wechselt man nur noch durch Ein- und Aussteigen;
`#touch-controls` sitzt immer ganz unten, `--touch-clear` ist 180 px. Die Stellen oben, die `?classic=1` erwähnen, sind Geschichte.
