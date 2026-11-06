# UI-Vereinheitlichung – Plan (Stand 2026-11-06, umgesetzt am selben Tag)

Ausgangslage (Screenshots Desktop 1440×900 und iPhone 13, Branch `davos`):

- Oben links: Brand-Panel mit Logo, «Slop Davos», **GitHub ↗** und der Zeile «three.js · WebGPU · TSL · 60 fps».
  Auf dem Handy bleibt davon nur Logo + «GitHub ↗» übrig: ein Panel, das nichts tut als auf GitHub zu verlinken.
- Oben rechts: Toolbar `[Uhr] [Vorspulen ▾] [DE|EN] [Konto] | [Teleportieren ▾] [Karte M] | [Ton] [Clean View]`.
  Der weisse DE/EN-Pill ist das auffälligste Element der ganzen Seite. Auf Handys (≤620 px) scrollt die Toolbar
  horizontal, Ton und Clean View liegen unsichtbar ausserhalb.
- Unter der Toolbar schwebt «★ 0 Missionen» als eigenes Panel in anderem Stil (auf dem Handy links als Mini-Chip).
- Bestenlisten sind zweimal erreichbar (Konto-Menü, Missionsliste) und öffnen sich als zweiter Dialog *über* der
  Missionsliste (zwei gestapelte Panels).
- Drei Dialog-Stile: Missionsliste (Kicker + Titel, «Zurück zum Spiel» ganz unten), Bestenlisten (Kicker + Titel,
  «Schliessen»-Balken unten), Daten & Quellen (`<dialog>` mit eigenem Kopf und × oben rechts).

## Prinzipien

1. Eine Toolbar, drei Gruppen: **Zeit · Spiel · System**. Nichts anderes schwebt mehr oben.
2. Alles, was man selten umstellt (Sprache, Ton, Clean View, Quellen, Datenschutz), lebt in einem Menü-Popover.
3. Ein Dialog-Stil für alle Overlays (`.panel.mission-dialog` als Basis): Kicker, Titel, × oben rechts, Esc,
   Klick auf den Hintergrund. Nie zwei Dialoge gleichzeitig.
4. Handy = gleiche Toolbar, nur ohne Labels; sie muss auf 390 px ohne Scrollen passen.

## 1. Weg damit

| Element | Entscheid |
|---|---|
| `a.repo-link` «GitHub ↗» im Brand (index.html, css `.repo-link`, zwei i18n-Paare) | löschen. Die MIT-Herkunft (Slop Zürich / Slop New York) bleibt als Satz im Dialog «Daten & Quellen», das genügt der Lizenz. |
| Brand-Panel auf dem Handy (nur noch Logo) | ganz ausblenden (`@media (max-width: 820px)` und `body.touch-enabled`). Das Logo steht im Ladebildschirm. |
| Zeile «three.js · WebGPU · TSL · 60 fps» | standardmässig weg; nur mit `?stats=1` (bzw. zusammen mit `?qset=`) sichtbar, so wie `mem-hud`. `#hud-fps` und `#hud-backend` bleiben im DOM, main.js schreibt weiter hinein. |
| `button.panel.mission-score` (★-Chip) als eigenes Fixed-Panel | wird zum Toolbar-Button (siehe 2). Die Bump-Animation bei Punkten bleibt auf dem Button. |
| «Bestenlisten» im Konto-Menü | raus; Bestenlisten sind Teil des Missions-Dialogs (siehe 3). |

## 2. Die Toolbar

Desktop (≥1081 px, mit Labels):

```
[ 09:04 ▾ ]   |  [ ★ 1,250 Missionen ] [ ⌖ Teleportieren ▾ ] [ 🗺 Karte M ]  |  [ 👤 ] [ ⋯ Menü ] [ 👁 ]
  Tag 1 · Sommer
```

- **Uhr = Vorspulen.** Der separate Vorspulen-Button fällt weg, die Uhr selbst bekommt den Chevron und
  `popovertarget="ff-popover"`. Der Popover-Titel heisst «Vorspulen», darunter als `pop-sub` «Tag 1 · Sommer · 09:04».
- **Missionen** (`#btn-missions`, `tool-btn`): Stern in `--taxi`, Punkte tabular, Label «Missionen», öffnet
  `missions.showList()`. Ersetzt `.mission-score`. Auf dem Handy nur «★ 1,250».
- **Teleportieren**, **Karte** unverändert.
- **Konto** (`#btn-account`) unverändert, nur in die System-Gruppe verschoben.
- **Menü** (`#btn-menu`, icon-only, neues Symbol `#i-dots` oder `#i-gear`), öffnet `#menu-popover`.
- **Clean View** (`#btn-toggle-hud`) bleibt als letzter Button, weil er im minimierten Zustand der einzige sichtbare ist.

Handy (`body.touch-enabled`, 44-px-Ziele): `[09:04 ▾] | [★] [⌖] [🗺] | [👤] [⋯] [👁]` → ca. 70 + 6×44 + Gaps ≈ 350 px,
passt auf 390 px ohne Scrollen. Die Zeile «Tag 1 · Sommer» wird auf dem Handy ausgeblendet (steht im Vorspulen-Popover).
Die Overflow-Scroll-Regel bei 620 px wird entfernt; die Wrap-Regel bei 360 px bleibt als Sicherheitsnetz.

Reihenfolge der Divider: nach der Uhr und vor dem Konto. `.language-switch` verschwindet aus der Toolbar.

## 3. Menü-Popover (`#menu-popover`, Stil wie `#account-popover`)

```
MENÜ
Sprache            [ DE | EN ]      ← .language-switch zieht hierher um (i18n.js findet sie per Klasse, keine Codeänderung)
Ton                [ an ]  N        ← pop-item mit aria-pressed, derselbe Handler wie heute #btn-sound
Clean View         H                ← pop-item, ruft denselben Toggle wie #btn-toggle-hud
──────────
Daten & Quellen                     ← öffnet credits-dialog (heute nur unten im Attributions-Strich erreichbar; der bleibt)
Datenschutz ↗
```

- `#btn-sound` wird aus der Toolbar entfernt; main.js hängt seinen Handler an den Menü-Eintrag (`data-menu="sound"`).
  Tastatur `N` bleibt.
- Die Zeile «© swisstopo · © OpenStreetMap · Daten & Quellen» unten rechts bleibt (Nutzungsbedingungen).

## 4. Ein Dialog-Stil

Gemeinsame Hülle `.mission-overlay > .panel.mission-dialog` mit `.mission-dialog-head` (Kicker, Titel, ×-Button
`.dialog-close` oben rechts), Esc und Backdrop-Klick schliessen. Damit:

- **Missionsliste**: bekommt das × (heute nur «Zurück zum Spiel» am Listenende). Unter dem Titel zwei Tabs
  `[ Missionen ] [ Bestenlisten ]` (`role="tablist"`). Die Bestenlisten-Ansicht ist der heutige Inhalt von
  `leaderboard-overview.js` (Liste-Picker + Body), nur eingebettet statt als zweiter Overlay. `openLeaderboards()` bleibt
  als Funktion, rendert aber in den Tab-Container; der eigene Overlay-Code dort fällt weg.
- **Daten & Quellen**: vom `<dialog class="credits-dialog">` auf dieselbe Hülle umstellen (Kicker «Slop Davos»,
  Titel «Daten & Quellen»). `.credits-*`-CSS wird auf die Dialog-Klassen reduziert.
- **Missions-Intro / -Abschluss** (`this.dialog(...)` in missions.js) nutzen die Hülle schon; nur das × ergänzen,
  das «Zurück zum Spiel» auslöst.
- Popovers (Vorspulen, Teleport, Kamera, Konto, Menü) bleiben `.popover` mit `pop-title`/`pop-item`; sie sind schon einheitlich.

## 5. Handy-Layout nach dem Umbau

- Oben: nur die Toolbar. Darunter rechts der Kamera-Umschalter (wie heute, `body.touch-enabled .hud-bottom-right`),
  links nichts mehr (Brand und ★-Chip sind weg → `.hud-top-left`-Offset für den Missions-Waypoint anpassen,
  `.mission-waypoint.hud-top-center` und die Missions-Leiste rücken 44 px nach oben).
- `body:has(#mission-hud) .mission-score { display: none }` entfällt; stattdessen während einer Mission den
  Toolbar-Button «★» einfach stehen lassen (er öffnet die Liste, die die Mission beendet – wie heute das Menü «Missionen»
  im Missions-Panel).

## 6. Umsetzung (Reihenfolge, Dateien)

1. **index.html**: Brand ohne `repo-link`; Toolbar neu ordnen (Uhr als Button, `#btn-missions`, `#btn-menu`,
   `#menu-popover`, `.language-switch` ins Menü, `#btn-sound`/`#btn-fastforward` raus); Credits-Dialog auf die
   Dialog-Hülle; neue SVG-Symbole (`#i-dots`, `#i-star`). Modulepreload-Zahl in `tests/boot.test.cjs` nur ändern, falls
   ein neues Modul dazukommt (geplant: keins).
2. **css/style.css**: `.repo-link`, `.mission-score`-Fixed-Regeln, Toolbar-Overflow (620 px) löschen; `.brand-subtitle`
   nur mit `body.show-stats`; Brand auf Handys ausblenden; Menü-Popover-Zeilen (`.pop-row` mit Label links, Control rechts);
   `.mission-dialog-head`, `.dialog-close`, Tabs; Offsets in den 820-px-/`touch-enabled`-Blöcken nachziehen.
3. **js/main.js**: Handler von `#btn-sound` → `[data-menu="sound"]`, `#btn-toggle-hud` zusätzlich → `[data-menu="hud"]`,
   `?stats=1` → `body.show-stats`; Uhr-Button statt `#btn-fastforward` (fast-forward.js prüfen, ob es den Button per id sucht).
4. **js/missions-world.js**: `.mission-score` nicht mehr erzeugen, sondern `#btn-missions` füllen/bumpen.
5. **js/missions.js** + **js/missions-manager.js**: Dialog-Hülle mit ×, Tabs; `_showList` rendert den Bestenlisten-Tab via
   `leaderboard-overview.js`.
6. **js/leaderboard-overview.js**: `openLeaderboards({ into })` – rendert in einen Container, kein eigener Overlay mehr;
   `closeLeaderboards` bleibt für Aufrufer.
7. **js/account-ui.js**: `boardsItem` entfernen.
8. **js/i18n.js**: GitHub-Paare raus; neu: «Menu», «Language», «Sound», «Clean view», «Show the HUD», «Missions» (Tab),
   «Close». Jeden neuen englischen String eintragen (der Observer übersetzt nur bekannte Paare).
9. **Tests**: `tests/account.test.mjs` (i18n-Regex bleibt gültig), neue Asserts in einem `tests/ui.test.mjs`: kein
   `repo-link`/`github.com` ausserhalb des Credits-Dialogs in index.html, `#btn-missions` und `#menu-popover` vorhanden,
   `.language-switch` innerhalb von `#menu-popover`. `npm test` grün.
10. **Prüfen**: Playwright-Screenshots Desktop 1440/1080/820 und iPhone 13 (Toolbar passt ohne Scroll, Clean View
    rein/raus, Missionsliste mit Tabs, Credits-Dialog, Mission läuft → Toolbar-Stern sichtbar), DE und EN.

Geschätzt: ein Nachmittag, alles in einem Commit auf `davos`; keine Datenmigration, kein neues Modul.

## Entscheide (2026-11-06)

- fps-Anzeige nur mit `?stats=1` (kein Menü-Eintrag, kein localStorage).
- Clean-View-Button bleibt in der Toolbar, auch auf dem Handy.
- Konto-Button zeigt als Gast auf dem Desktop das Label «Anmelden»; angemeldet nur das Icon.

## Umgesetzt (2026-11-06)

Alles aus dem Plan, mit zwei Abweichungen: Die Overflow-Scroll-Regel der Toolbar bei 620 px bleibt als Sicherheitsnetz
(sie greift nicht mehr), und der Dialog-Kopf (`dialogHead`) lebt in js/missions.js statt in js/leaderboard-ui.js, weil
nur die Missionsdialoge ihn brauchen; der Credits-Dialog bleibt ein natives `<dialog>` im gleichen Gewand. Prüfung:
`tests/ui.test.mjs`, Playwright-Screenshots Desktop 1440/1000, iPhone 13 und iPhone SE, DE und EN.
