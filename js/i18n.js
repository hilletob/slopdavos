// UI language. English is the source language for the existing interface.
// The observer also covers HUD and mission panels created after startup.
const STORAGE_KEY = 'slopdavos-language';
const pairs = [
  ['Initializing WebGPURenderer & TSL Shaders...', 'WebGPU-Renderer und TSL-Shader werden initialisiert …'],
  ['Getting the city ready…', 'Die Stadt wird vorbereitet …'],
  ['Opening the streets…', 'Die Strassen werden geöffnet …'],
  ['Moving the town…', 'Die Stadt wird verschoben …'],
  ['Bringing Davos to life…', 'Davos wird zum Leben erweckt …'],
  ['Your ride is almost ready…', 'Deine Fahrt kann gleich beginnen …'],
  ['Davos couldn’t open this time. Please try again.', 'Davos konnte nicht geöffnet werden. Bitte versuche es erneut.'],
  ['Davos emblem', 'Davos-Wappen'],
  ['3D Interactive Slop Davos Viewport', 'Interaktive 3D-Ansicht von Slop Davos'],
  ['Game time: fast-forward', 'Spielzeit: vorspulen'],
  ['Menu', 'Menü'], ['Language', 'Sprache'], ['Sound', 'Ton'], ['On', 'An'], ['Off', 'Aus'], ['Unavailable', 'Nicht verfügbar'],
  ['Clean view', 'Freie Sicht'], ['About', 'Über'], ['Live map', 'Live-Karte'], ['Heat map', 'Heatmap'],
  ['Show me as a dot on the public live map', 'Mich als Punkt auf der öffentlichen Live-Karte zeigen'],
  ['Missions: points and medals', 'Missionen: Punkte und Medaillen'],
  ['Golden Hour', 'Goldene Stunde'], ['Sunny Midday', 'Sonniger Mittag'], ['Midday', 'Mittag'],
  ['Blue Hour', 'Blaue Stunde'], ['Night', 'Nacht'],
  ['Game time', 'Spielzeit'], ['Summer', 'Sommer'],
  ['Account', 'Konto'], ['Sign in with Google', 'Mit Google anmelden'], ['Sign out', 'Abmelden'],
  ['Finish the mission first.', 'Beende zuerst die Mission.'], ['Opening the sign-in…', 'Die Anmeldung wird geöffnet …'],
  ['The sign-in is not reachable right now. You can keep playing.', 'Die Anmeldung ist gerade nicht erreichbar. Du kannst weiterspielen.'],
  ['Signing out failed. Please try again.', 'Abmelden hat nicht geklappt. Bitte versuche es erneut.'],
  ['Saved to your account.', 'In deinem Konto gespeichert.'],
  ['Not saved online right now. Your game stays on this device.', 'Gerade nicht online gespeichert. Dein Spiel bleibt auf diesem Gerät.'],
  ['Delete account', 'Konto löschen'], ['Delete the account and its cloud save for good', 'Konto und Online-Spielstand endgültig löschen'],
  ['The account is deleted. Your game stays on this device.', 'Das Konto ist gelöscht. Dein Spiel bleibt auf diesem Gerät.'],
  ['Deleting failed. Please try again.', 'Löschen hat nicht geklappt. Bitte versuche es erneut.'],
  ['Privacy', 'Datenschutz'],
  ['Sign in to keep your game on all your devices and join the leaderboards.', 'Melde dich an, damit dein Spiel auf all deinen Geräten weiterläuft und du in die Bestenlisten kommst.'],
  ['Try it for 5 minutes as a guest', '5 Minuten als Gast ausprobieren'], ['Sign in with Apple', 'Mit Apple anmelden'],
  ['Please sign in', 'Bitte melde dich an'],
  ['To keep playing, sign in. Your game goes on where you are, on all your devices.', 'Um weiterzuspielen, melde dich an. Dein Spiel geht dort weiter, wo du bist, auf all deinen Geräten.'],
  ['The sign-in is not reachable right now. Please try again.', 'Die Anmeldung ist gerade nicht erreichbar. Bitte versuche es erneut.'],
  ['Leaderboard', 'Bestenliste'], ['Show leaderboard', 'Bestenliste anzeigen'], ['Loading the leaderboard…', 'Die Bestenliste wird geladen …'],
  ['The leaderboard is not reachable right now.', 'Die Bestenliste ist gerade nicht erreichbar.'], ['No times yet. Be the first.', 'Noch keine Zeiten. Sei die erste Person.'],
  ['This run was not counted. Your result stays on this device.', 'Dieser Lauf wurde nicht gewertet. Dein Ergebnis bleibt auf diesem Gerät.'],
  ['Sign in from the account menu to join the leaderboard.', 'Melde dich im Konto-Menü an, um in die Bestenliste zu kommen.'],
  ['Leaderboards', 'Bestenlisten'], ['List', 'Liste'], ['By time', 'Nach Zeit'], ['By points', 'Nach Punkten'],
  ['Free play', 'Freies Spiel'], ['Longest free flight', 'Längster freier Flug'], ['No flights yet. Be the first.', 'Noch keine Flüge. Sei die erste Person.'],
  ['The furthest a paraglider got from where it took off, with the time in the air. Only a soft landing counts. With the licence: P on a slope.', 'Die grösste Distanz eines Gleitschirms vom Startpunkt, dazu die Zeit in der Luft. Es zählt nur eine weiche Landung. Mit dem Flugschein: P an einem Hang.'],
  ['No scores yet. Be the first.', 'Noch keine Punkte. Sei die erste Person.'],
  ['The best score of every player, by day. The faster run wins a tie.', 'Der beste Punktestand jeder Person, bei Tag. Bei Gleichstand gewinnt der schnellere Lauf.'], ['Overall', 'Gesamt'], ['Mission points', 'Missionspunkte'],
  ['The points of your missions, from your cloud save. Every medal counts.', 'Die Punkte deiner Missionen aus deinem Online-Spielstand. Jede Medaille zählt.'],
  ['The best time of every player, by day.', 'Die beste Zeit jeder Person, bei Tag gefahren.'],
  ['No points on the list yet.', 'Noch keine Punkte auf der Liste.'], ['You are not on this list yet.', 'Du bist noch nicht auf dieser Liste.'],
  ['Sign in from the account menu to appear here and compare yourself.', 'Melde dich im Konto-Menü an, um hier aufzutauchen und dich zu vergleichen.'],
  ['You lead', 'Du führst'],
  ['Sign in with email', 'Mit E-Mail anmelden'], ['Send code', 'Code senden'], ['Sending the code…', 'Der Code wird gesendet …'],
  ['Please enter a valid email address.', 'Bitte gib eine gültige E-Mail-Adresse ein.'],
  ['Too many codes asked for. Please wait a few minutes and try again.', 'Zu viele Codes angefordert. Bitte warte ein paar Minuten und versuche es dann erneut.'],
  ['The code could not be sent. Please try again.', 'Der Code konnte nicht gesendet werden. Bitte versuche es erneut.'],
  ['We sent a code to', 'Wir haben einen Code geschickt an'], ['. It can take a minute.', '. Das kann eine Minute dauern.'],
  ['Code from the email', 'Code aus der E-Mail'], ['Sign in', 'Anmelden'], ['Use another email', 'Andere E-Mail verwenden'],
  ['The code has 6 digits or more.', 'Der Code hat mindestens 6 Ziffern.'], ['Signing in…', 'Anmeldung läuft …'],
  ['That code is wrong or has expired.', 'Dieser Code ist falsch oder abgelaufen.'],
  ['This device holds the save of another account.', 'Auf diesem Gerät liegt der Spielstand eines anderen Kontos.'],
  ['Continue with this account (the other save leaves this device)', 'Mit diesem Konto weiterspielen (der andere Spielstand verlässt das Gerät)'],
  ['Cancel and sign out', 'Abbrechen und abmelden'], ['or', 'oder'],
  ['Personal texts: on', 'Persönliche Texte: an'], ['Personal texts: off', 'Persönliche Texte: aus'],
  ['The missions\' texts written for you by an AI. For it your leaderboard name, your progress, how you play and the character you describe go to Anthropic.', 'Die Texte der Missionen, von einer KI für dich geschrieben. Dafür gehen dein Name in den Bestenlisten, dein Spielstand, deine Spielweise und der Charakter, den du beschreibst, an Anthropic.'],
  ['Writing your briefing…', 'Dein Briefing wird geschrieben…'], ['Writing a few words on your run…', 'Ein paar Worte zu deinem Lauf werden geschrieben…'],
  ['Your character, in your own words', 'Dein Charakter, in deinen Worten'], ['Saved.', 'Gespeichert.'],
  ['Signed in, the missions\' texts are written for this character by an AI (Anthropic).', 'Bist du angemeldet, schreibt eine KI (Anthropic) die Texte der Missionen für diesen Charakter.'],
  ['Name on the leaderboards', 'Name in den Bestenlisten'], ['Save name', 'Name speichern'], ['Name saved.', 'Name gespeichert.'], ['That name is taken.', 'Dieser Name ist vergeben.'],
  ['Use 3 to 20 letters, digits, spaces, - or _. Some words are not allowed.', 'Erlaubt sind 3 bis 20 Buchstaben, Ziffern, Leerzeichen, - oder _. Manche Wörter sind gesperrt.'],
  ['The name could not be saved. Please try again.', 'Der Name konnte nicht gespeichert werden. Bitte versuche es erneut.'],
  ['Fast-forward the time', 'Zeit vorspulen'], ['Fast-forward', 'Vorspulen'],
  ['To the next morning', 'Zum nächsten Morgen'], ['To the next evening', 'Zum nächsten Abend'],
  ['To the next season', 'Zur nächsten Jahreszeit'], ['To the winter', 'Zum Winter'], ['To the summer', 'Zum Sommer'],
  ['Tomorrow', 'Morgen'], ['Wait until then', 'Bis dann warten'], ['Snow is falling …', 'Es schneit …'],
  ['Ready: the clock starts with your first input', 'Bereit: Die Stoppuhr läuft ab deiner ersten Eingabe'],
  ['Teleport the active player', 'Aktive Spielfigur teleportieren'], ['Teleport to', 'Teleportieren nach'],
  ['Teleport', 'Teleportieren'], ['Full Davos street map [M]', 'Davos-Strassenkarte öffnen [M]'],
  ['Map', 'Karte'], ['Mute sound [N]', 'Ton ausschalten [N]'], ['Mute sound', 'Ton ausschalten'],
  ['Enable sound', 'Ton einschalten'], ['Clean view: hide the HUD [H]', 'Freie Sicht: HUD ausblenden [H]'],
  ['Enable sound [N]', 'Ton einschalten [N]'], ['Show the HUD [H]', 'HUD einblenden [H]'],
  ['Web Audio is unavailable', 'Web Audio ist nicht verfügbar'],
  ['Turn on the searchlight [L]', 'Suchscheinwerfer einschalten [L]'], ['Turn on the blue lights [K]', 'Blaulicht einschalten [K]'],
  ['Shoot: Space', 'Schiessen: Space'], ['Hold Space, let go to throw', 'Space halten, loslassen zum Werfen'],
  ['Space / Swing: start the swing (W/S club, A/D aim)', 'Space / Schwung: Schwung beginnen (W/S Schläger, A/D zielen)'],
  ['Get out (F) and load the crates', 'Steig aus (F) und lade die Kisten ein'], ['Get off (F) and walk in', 'Steig ab (F) und geh hinein'], ['F: get off', 'F: absteigen'],
  ['Hold Space and walk along the path', 'Space halten und dem Weg entlang gehen'],
  // The end panels and the steps the audit under the game clock found still in English (tools/mission-smoke.mjs --lang de)
  ['Mission failed', 'Mission gescheitert'], ['Mission aborted', 'Mission abgebrochen'],
  ['Teleport: the mission was aborted.', 'Teleport: Die Mission wurde abgebrochen.'],
  ['Go into the Bar La Onda', 'Geh in die Bar La Onda'], ['Go to the Jakobshornbahn', 'Geh zur Jakobshornbahn'],
  ['Down the Chüggelibahn', 'Die Chüggelibahn hinunter'], ['Bolgen Trail to the finish', 'Bolgen Trail bis ins Ziel'],
  ['Down from the Jatzmeder', 'Vom Jatzmeder hinunter'], ['The hairpins in the forest', 'Die Haarnadelkurven im Wald'], ['Down to the finish', 'Hinunter ins Ziel'],
  ['Go into the Bäckerei Weber', 'Geh in die Bäckerei Weber'], ['Go into Gourmet Käch', 'Geh zu Gourmet Käch'],
  ['Walk to the Eichhörnliplatz', 'Geh zum Eichhörnliplatz'], ['Go into the Sporthalle Färbi', 'Geh in die Sporthalle Färbi'],
  ['Up the slide tower', 'Auf den Rutschbahnturm'], ['Go to the easel at the Kirchner Museum', 'Geh zur Staffelei beim Kirchner Museum'],
  ['Go into The Green Wildman', 'Geh in The Green Wildman'],
  ['No shot fired', 'Kein Schuss abgegeben'], ['An empty basket', 'Ein leerer Korb'], ['no cast finished', 'kein Gips fertig'],
  ['Hide HUD', 'HUD ausblenden'], ['Show HUD', 'HUD einblenden'],
  ['Data & credits', 'Daten & Quellen'], ['Close', 'Schliessen'],
  ['Figure', 'Figur'], ['Your figure', 'Deine Figur'], ['On foot, on the bicycle and on the cargo bike.', 'Zu Fuss, auf dem Velo und auf dem Cargovelo.'],
  ['Jacket & boots', 'Jacke & Stiefel'], ['Jumper', 'Pullover'], ['Blouse & jeans', 'Bluse & Jeans'], ['Hoodie', 'Kapuzenjacke'],
  ['Jumper & skirt', 'Pulli & Rock'], ['Police officer', 'Polizist'],
  ['Slop Davos is built from open government data and OpenStreetMap. It is an unofficial project, not affiliated with swisstopo or the Gemeinde Davos.', 'Slop Davos basiert auf offenen Behördendaten und OpenStreetMap. Es ist ein inoffizielles Projekt ohne Verbindung zu swisstopo oder der Gemeinde Davos.'],
  ['buildings and roofs.', 'Gebäude und Dächer.'], ['the terrain.', 'das Gelände.'],
  [': buildings and roofs.', ': Gebäude und Dächer.'], [': the terrain.', ': das Gelände.'],
  ['the orthophotos on the ground and the roofs.', 'die Orthofotos auf dem Boden und den Dächern.'],
  [': the orthophotos on the ground and the roofs.', ': die Orthofotos auf dem Boden und den Dächern.'],
  ['single trees and woodland.', 'Einzelbäume und Waldflächen.'], ['the bridge decks.', 'die Brückenfahrbahnen.'],
  ['(vector tiles): single trees and woodland.', '(Vektorkacheln): Einzelbäume und Waldflächen.'],
  [': the bridge decks.', ': die Brückenfahrbahnen.'],
  ['the surroundings, out to the Alps.', 'die Umgebung bis zu den Alpen.'],
  [': the surroundings, out to the Alps.', ': die Umgebung bis zu den Alpen.'],
  ['terms of use', 'Nutzungsbedingungen'], ['OpenStreetMap contributors', 'OpenStreetMap-Mitwirkende'],
  ['streets, rail lines, building footprints, trees, parks and water; the downhill ski runs (piste:type=downhill, with their difficulty) for the winter pistes, skiers and snowboarders.', 'Strassen, Bahnlinien, Gebäudegrundrisse, Bäume, Parks und Gewässer; Abfahrtspisten samt Schwierigkeitsgrad für die Winterlandschaft, Skifahrer und Snowboarder.'],
  [': streets, rail lines, building footprints, trees, parks and water; the downhill ski runs (piste:type=downhill, with their difficulty) for the winter pistes, skiers and snowboarders.', ': Strassen, Bahnlinien, Gebäudegrundrisse, Bäume, Parks und Gewässer; Abfahrtspisten samt Schwierigkeitsgrad für die Winterlandschaft, Skifahrer und Snowboarder.'],
  ['the signposted winter hiking trails, their pink markers and the winter hikers.', 'die markierten Winterwanderwege, ihre pinkfarbenen Wegweiser und die Winterwanderer.'],
  ['(ch.astra.winterwanderwege): the signposted winter hiking trails, their pink markers and the winter hikers.', '(ch.astra.winterwanderwege): markierte Winterwanderwege, pinkfarbene Wegweiser und Winterwanderer.'],
  ['© swisstopo, Federal Office of Topography swisstopo (', '© swisstopo, Bundesamt für Landestopografie ('],
  ['VBD bus model: “Low Poly Mercedes-Benz Citaro 530” by', 'VBD-Busmodell: „Low Poly Mercedes-Benz Citaro 530“ von'],
  ['VW T3 model: “VW T3 Van scale1-100 lowpoly for 3D-printing” by', 'VW-T3-Modell: „VW T3 Van scale1-100 lowpoly for 3D-printing“ von'],
  [', recoloured, tyres simplified.', ', neu eingefärbt, Reifen vereinfacht.'],
  [', rescaled, wheels removed, recoloured.', ', neu skaliert, Räder entfernt, neu eingefärbt.'],
  [", itself after mrdoob's", ', das wiederum auf mrdoobs'],
  ['. Built with', '. Erstellt mit'],
  [', Open Government Data.', ', Open Government Data.'],
  ['opendata.swiss terms of use (open use, must provide the source)', 'Nutzungsbedingungen von opendata.swiss (freie Nutzung mit Quellenangabe)'],
  ['recoloured, tyres simplified.', 'neu eingefärbt, Reifen vereinfacht.'],
  ['rescaled, wheels removed, recoloured.', 'neu skaliert, Räder entfernt, neu eingefärbt.'],
  ['Code under the MIT License, based on colorfield\'s', 'Code unter MIT-Lizenz, basierend auf'],
  ['Close-up trees grown with', 'Bäume im Nahbereich erstellt mit'], ['licence', 'Lizenz'],
  ['Live Davos Street Radar Minimap', 'Davos-Radar-Minimap'],
  ['Open the full Davos street map [M]', 'Davos-Strassenkarte öffnen [M]'],
  ['Walk', 'Gehen'], ['Drive', 'Fahren'], ['Fly', 'Fliegen'],
  ['Vehicle telemetry and camera', 'Fahrdaten und Kamera'], ['Davos Cyclist', 'Davos-Radfahrer'],
  ['m a.s.l.', 'm ü. M.'],
  ['Pedestrian', 'Fussgänger'], ['Cargo bike', 'Lastenrad'], ['Snow groomer', 'Pistenfahrzeug'], ['patrol car', 'Streifenwagen'],
  // (a mission's own vehicle in the cluster: js/missions.js run.vehiclePanel)
  ['Horn sledge', 'Hornschlitten'], ['Toboggan', 'Rodel'], ['Funicular', 'Standseilbahn'], ['Mountain bike', 'Mountainbike'],
  // the player's statistics (js/play-stats.js, js/play-stats-ui.js)
  // (a race with other players: js/race-ui.js, js/race-session.js)
  ['Race together', 'Gemeinsam fahren'], ['Multiplayer', 'Mehrspieler'], ['Race code', 'Rennen-Code'], ['Copy link', 'Link kopieren'], ['Copied', 'Kopiert'],
  ['Connecting…', 'Verbinden …'], ['Your name in the race', 'Dein Name im Rennen'], ['Players', 'Spieler'], ['Host', 'Gastgeber'],
  ['Start the race', 'Rennen starten'], ['Start alone', 'Allein starten'], ['Leave', 'Verlassen'], ['Leave the race', 'Rennen verlassen'], ['Race again', 'Noch ein Rennen'],
  ['Waiting for the host to start the race.', 'Warten, bis der Gastgeber das Rennen startet.'],
  ['You are joining this race.', 'Du trittst diesem Rennen bei.'], ['Share the code or the link. Up to four riders.', 'Teile den Code oder den Link. Bis zu vier Fahrer.'],
  ['Everyone drives the same course at the same time. The others ride along as ghosts: no collisions. The clock starts for all with the countdown; the best time wins.', 'Alle fahren dieselbe Strecke zur gleichen Zeit. Die anderen fahren als Geister mit: keine Kollisionen. Die Uhr startet für alle mit dem Countdown; die beste Zeit gewinnt.'],
  ['That race code is not valid. Ask for the link again.', 'Dieser Rennen-Code ist ungültig. Frag noch einmal nach dem Link.'],
  ['The race server is not reachable right now. Try again in a moment.', 'Der Rennen-Server ist gerade nicht erreichbar. Versuche es gleich noch einmal.'],
  ['The connection dropped. Trying again…', 'Die Verbindung ist abgebrochen. Neuer Versuch …'], ['The race could not be started here.', 'Das Rennen konnte hier nicht gestartet werden.'],
  ['Race standings', 'Rangliste des Rennens'], ['Standings', 'Rangliste'], ['Still racing', 'Noch unterwegs'], ['Out', 'Ausgestiegen'], ['Get ready', 'Bereit machen'], ['Go!', 'Los!'],
  ['Everyone is in. Race again?', 'Alle sind im Ziel. Noch ein Rennen?'], ['The host starts the next race.', 'Der Gastgeber startet das nächste Rennen.'],
  ['Ready: the countdown starts the clock', 'Bereit: der Countdown startet die Uhr'],
  ['Your statistics', 'Deine Statistik'], ['Statistics', 'Statistik'], ['How you play', 'Wie du spielst'], ['Play time', 'Spielzeit'],
  ['Sessions', 'Sitzungen'], ['Devices', 'Geräte'], ['How you get about', 'Wie du unterwegs bist'], ['Nothing yet: get going.', 'Noch nichts: los gehts.'],
  ['All your devices together. Only time with you at the game counts.', 'Alle deine Geräte zusammen. Es zählt nur die Zeit, in der du wirklich spielst.'],
  ['This device only. Sign in to keep it with your account. Only time with you at the game counts.', 'Nur dieses Gerät. Melde dich an, damit sie mit deinem Konto mitkommt. Es zählt nur die Zeit, in der du wirklich spielst.'],
  ['Car', 'Auto'], ['Bike', 'Velo'], ['Helicopter', 'Helikopter'], ['Snowcat', 'Pistenfahrzeug'], ['Train, driving', 'Zug, als Lokführer'],
  ['Train, riding along', 'Zug, als Passagier'], ['Skis', 'Ski'], ['Cross-country skis', 'Langlaufski'], ['Sledge', 'Schlitten'],
  ['Summer toboggan', 'Sommerrodelbahn'], ['Skates', 'Schlittschuhe'], ['Snowshoes', 'Schneeschuhe'], ['Water slide', 'Wasserrutsche'],
  ['Rope park', 'Seilpark'], ['Crane', 'Kran'], ['Snow blower', 'Schneefräse'], ['Ride-on mower', 'Aufsitzmäher'], ['Garbage truck', 'Kehrichtwagen'],
  ['Truck', 'Lastwagen'],
  ['Previous camera', 'Vorherige Kamera'], ['Next camera', 'Nächste Kamera'],
  ['Next camera [V]', 'Nächste Kamera [V]'], ['All cameras [V cycles]', 'Alle Kameras [V wechselt]'],
  ['Multiple Camera Angles', 'Kameraperspektiven'], ['Follow', 'Folgen'], ['Scenic', 'Aussicht'],
  ['3rd-Person Chase', 'Verfolgerkamera'], ['Low-Angle Action', 'Tiefe Actionkamera'],
  ['First-Person / Cockpit', 'Ich-Perspektive / Cockpit'], ["Bird's-Eye (top-down)", 'Vogelperspektive'], ['Schatzalp over the valley', 'Schatzalp über dem Tal'],
  ['Dischma valley', 'Dischmatal'], ['Auto-Director Aerial', 'Automatische Luftkamera'],
  ['Touch controls', 'Touch-Steuerung'], ['Movement joystick: drag up or down to move, left or right to turn', 'Joystick: nach oben oder unten zum Bewegen, nach links oder rechts zum Lenken ziehen'],
  ['Move & steer', 'Bewegen & lenken'], ['Drag to look · Pinch to zoom', 'Ziehen zum Umschauen · Zwei Finger zum Zoomen'],
  ['Jump', 'Springen'], ['Descend', 'Sinken'],
  ['Full Davos Interactive Street Map', 'Interaktive Davos-Strassenkarte'],
  ['Davos Map', 'Davos-Karte'], ['You are on the Promenade', 'Du bist auf der Promenade'],
  ['Search streets & landmarks — Promenade, Talstrasse, Kongresszentrum…', 'Strassen und Orte suchen — Promenade, Talstrasse, Kongresszentrum …'],
  ['Search street or landmark', 'Strasse oder Ort suchen'], ['Close map [M / Esc]', 'Karte schliessen [M / Esc]'],
  ['True north', 'Geografischer Norden'], ['Zoom in', 'Vergrössern'], ['Zoom out', 'Verkleinern'],
  ['Street view around you', 'Strassenansicht um dich herum'], ['Center on player', 'Auf Spielfigur zentrieren'],
  ['All of Davos (Wolfgang to Frauenkirch and Dürrboden)', 'Ganz Davos (Wolfgang bis Frauenkirch und Dürrboden)'],
  ['Fit the whole map', 'Gesamte Karte anzeigen'],
  ['Click anywhere to teleport & set your GPS route · Drag to pan · Scroll to zoom', 'Klicken zum Teleportieren und Setzen der GPS-Route · Ziehen zum Verschieben · Scrollen zum Zoomen'],
  ['Tap to teleport · Drag to pan · Pinch to zoom', 'Tippen zum Teleportieren · Ziehen zum Verschieben · Mit zwei Fingern zoomen'],
  ['You', 'Du'], ['Landmark', 'Sehenswürdigkeit'], ['GPS route', 'GPS-Route'], ['Bridge / Hwy', 'Brücke / Hauptstrasse'],
  ['Rega helicopter', 'Rega-Helikopter'], ['Your vehicles', 'Deine Fahrzeuge'],
  // the helicopters' places on the full map (js/vehicle-depots.js DEPOTS labels; js/gta.js overlay)
  ['Spital Davos helipad', 'Landeplatz Spital Davos'], ['Schatzalp meadow', 'Schatzalp-Wiese'], ['Stilli heliport', 'Heliport Stilli'],
  ['Glaris, Rinerhorn valley station', 'Glaris, Talstation Rinerhorn'], ['Rega set down here', 'Rega hier abgestellt'],
  ['near', 'bei'], ['Click to teleport here', 'Klicken, um hierher zu teleportieren'],
  ['Mission', 'Mission'], ['Mission complete', 'Mission abgeschlossen'],
  ['Loading the surroundings …', 'Umgebung wird geladen …'],
  ['The stopwatch will be ready in a moment', 'Die Stoppuhr ist gleich bereit'],
  ['Press Enter or the button to start', 'Zum Starten Enter oder die Schaltfläche drücken'],
  ['Get in', 'Einsteigen'], ['Get out', 'Aussteigen'],
  ['Get off', 'Aussteigen'], ['Leave the cab', 'Führerstand verlassen'],
  ['Board the RhB', 'In die RhB einsteigen'], ['Take the bike', 'Fahrrad nehmen'], ['estate car', 'Kombi'], ['box lorry', 'Lastwagen'], ['hatchback', 'Kleinwagen'],
  ['Drive the bus', 'Bus fahren'], ['End of the line: you got off', 'Endstation: Du bist ausgestiegen'],
  ['On foot', 'Zu Fuss'], ['Wait for the next station', 'Bis zum nächsten Bahnhof warten'],
  ['Only at a station', 'Nur an einem Bahnhof'], ['Land first', 'Erst landen'],
  ['Stop first', 'Erst anhalten'], ['Brake to a stop first (S)', 'Erst mit S zum Stillstand bremsen'],
  ['bike', 'Fahrrad'], ['snow groomer', 'Pistenfahrzeug'],
  ['Grab', 'Greifen'], ['Pick', 'Pflücken'], ['Strike', 'Schlagen'], ['Kick', 'Abstossen'],
  ['Shovel', 'Schaufeln'], ['Double pole', 'Doppelstockschub'],
  ['Chase', 'Verfolgen'], ['Action', 'Action'], ['POV / Dash', 'Ich / Cockpit'], ['Director', 'Regie'],
  ['Turn', 'Drehen'], ['Orbit', 'Umschauen'],
  ['Steer', 'Lenken'], ['Boost', 'Beschleunigen'],
  ['Horn', 'Hupe'], ['Indicators', 'Blinker'], ['High beam', 'Fernlicht'],
  ['Pedal', 'Treten'], ['Lean', 'Neigen'],
  ['Throttle', 'Gas geben'], ['Brake', 'Bremsen'], ['Pitch', 'Nicken'], ['Yaw', 'Gieren'],
  ['Ascend', 'Steigen'], ['Searchlight', 'Suchscheinwerfer'],
  ['Spotlight', 'Suchlicht'],
  ['Beacon', 'Drehlicht'], ['Tiller', 'Fräse'], ['Drag', 'Ziehen'],
  // the register of actions and the missions' key hints (js/actions.js, js/main.js renderHints, run.hints)
  ['Hazard lights', 'Warnblinker'], ['Hazard', 'Warnlicht'],
  ['Left', 'Links'],
  ['Right', 'Rechts'],
  ['Chute', 'Auswurf'],
  ['Climb across', 'Umsteigen'],
  ['Actions', 'Aktionen'],
  ['Mouse', 'Maus'],
  ['Click', 'Klick'],
  ['walk', 'gehen'],
  ['steer', 'lenken'],
  ['on the beat: stride', 'im Takt: langer Schritt'],
  ['hold: stroke', 'halten: laufen'],
  ['in the green: power stroke', 'im grünen Bereich: Kraftschub'],
  ['lean', 'lehnen'],
  ['brake', 'bremsen'],
  ['skate', 'laufen'],
  ['stop', 'stoppen'],
  ['shoot', 'schiessen'], ['shoot (hold: harder)', 'schiessen (halten: härter)'], ['Wind-up', 'Ausholen'],
  ['aim', 'zielen'],
  ['curl', 'drehen'],
  ['hold: power, let go: throw · hold: sweep', 'halten: Kraft, loslassen: Wurf · halten: wischen'],
  ['club', 'Schläger'],
  ['swing', 'Schwung'],
  ['cart', 'Golfwagen'],
  ['balance', 'balancieren'],
  ['clip', 'einhängen'],
  ['speed bar', 'Beschleuniger'],
  ['brakes', 'bremsen'],
  ['flare', 'ausflaren'],
  ['hold: stride · let go downhill: tuck', 'halten: laufen · bergab loslassen: Hocke'],
  ['hold: double pole (flat)', 'halten: Doppelstockschub (flach)'],
  ['hold, let go to putt', 'halten, loslassen: putten'],
  ['back from the ball and let go', 'vom Ball weg und loslassen'],
  ['overview', 'Übersicht'],
  ['hold, let go to shoot', 'halten, loslassen: schiessen'],
  ['back from the puck and let go', 'vom Puck weg und loslassen'],
  ['hold, let go in the green', 'halten, im grünen Bereich loslassen'],
  ['pump', 'Tempo holen'],
  ['carve / spin · grind: balance', 'carven / drehen · Grind: balancieren'],
  ['hold: grab · grind: drop in', 'halten: Grab · Grind: einfahren'],
  ['Missions', 'Missionen'], ['All missions', 'Alle Missionen'], ['Choose a mission', 'Mission auswählen'],
  ['Back to the game', 'Zurück zum Spiel'], ['Day', 'Tag'], ['Fire', 'Abfeuern'],
  ['No best score yet', 'Noch kein Bestwert'], ['No best time yet', 'Noch keine Bestzeit'],
  ['No medal this time', 'Diesmal keine Medaille'],
  ['Completed, no medal', 'Abgeschlossen, keine Medaille'], ['Not completed yet', 'Noch nicht abgeschlossen'],
  ['no new points', 'keine neuen Punkte'],
  ['First best time', 'Erste Bestzeit'], ['First best score', 'Erster Bestwert'],
  ['The stopwatch starts with your first input after Start.', 'Die Stoppuhr startet mit deiner ersten Eingabe nach dem Start.'],
  ['Start', 'Starten'], ['Restart', 'Neustarten'],
  ['Continue', 'Weiter'], ['Cancel', 'Abbrechen'],
  ['Pause', 'Pause'],
  ['Gold', 'Gold'], ['Silver', 'Silber'], ['Bronze', 'Bronze'],
  ['Loading', 'Laden'], ['Ready', 'Bereit'], ['Complete', 'Abgeschlossen'],
  ['Speed skating: 2 × 400 m', 'Eisschnelllauf: 2 × 400 m'],
  ['Penalty shoot-out in the Eisstadion', 'Penaltyschiessen im Eisstadion'],
  ['Curling on the Eisbahn', 'Curling auf der Eisbahn'],
  ['Headbang contest at the BOX', 'Headbang-Wettbewerb in der BOX'],
  ['The small table at La Onda', 'Der kleine Kasten im La Onda'], ['W/S or mouse: slide · Space/click: shoot · 1-2: rod, Q: auto', 'W/S oder Maus: schieben · Space/Klick: schiessen · 1–2: Stange, Q: Automatik'],
  ['Fast hands on the small table: the regulars want a rematch on the big one.', 'Flinke Hände am kleinen Kasten: Die Stammgäste wollen Revanche am grossen.'],
  ['Table football at La Onda', 'Tischfussball im La Onda'],
  ['Pack the Jakobshorn cabin', 'Jakobshorn-Gondel füllen'],
  ['RhB driver: Wolfgang – Davos Platz', 'RhB-Lokführer: Wolfgang – Davos Platz'],
  ['Through the Silberberg mine', 'Durch das Silberbergwerk'], ['Go to the Hilfsstollen of the Silberberg', 'Geh zum Hilfsstollen am Silberberg'],
  ['Go to the Dalvazzerstollen', 'Geh zum Dalvazzerstollen'], ['Back out into the daylight', 'Zurück ans Tageslicht'], ['Climb up to the Hilfsstollen', 'Steig hinauf zum Hilfsstollen'],
  ['Find St Barbara', 'Finde die heilige Barbara'], ['Find the stope', 'Finde den Abbau'], ['Find the year 1813', 'Finde die Jahreszahl 1813'], ['Find the crossing', 'Finde die Kreuzung'],
  ['Find the year 1818', 'Finde die Jahreszahl 1818'], ['Find the far end', 'Finde das Stollenende'],
  ['St Barbara', 'Heilige Barbara'], ['The stope', 'Der Abbau'], ['The crossing', 'Die Kreuzung'], ['The far end', 'Das Stollenende'],
  ['Glück auf! I am Jöri, miner here on the Silberberg. Today I show you our mine.', 'Glück auf! Ich bin der Jöri, Knappe hier am Silberberg. Heute zeige ich dir unser Bergwerk.'],
  ['Stay close to my lantern. Down there the mountain decides, not us.', 'Bleib nah bei meiner Lampe. Da unten entscheidet der Berg, nicht wir.'],
  ['In we go. Mind your head: the Dalvazzer was cut for smaller men than you.', 'Hinein mit uns. Pass auf den Kopf auf: Der Dalvazzer wurde für kleinere Leute als dich geschlagen.'],
  ['St Barbara keeps watch over us. A miner who forgets her greeting forgets his luck.', 'Die heilige Barbara wacht über uns. Wer ihren Gruss vergisst, vergisst sein Glück.'],
  ['Out by the portal stood the Pochhaus: there we crushed and washed the ore before it went down to Schmelzboden.', 'Draussen beim Portal stand das Pochhaus: Dort haben wir das Erz zerkleinert und gewaschen, bevor es hinunter zum Schmelzboden ging.'],
  ['Now over the footbridge. Do not look down. Or do, if you dare.', 'Jetzt über den Steg. Nicht hinunterschauen. Oder doch, wenn du dich traust.'],
  ['Here the vein ran, a few fingers thick, straight up and down through the dolomite. We followed it with hammer and chisel.', 'Hier lief der Erzgang, ein paar Finger dick, steil hinauf und hinunter durch den Dolomit. Wir sind ihm mit Schlägel und Eisen gefolgt.'],
  ['Hear that?', 'Hörst du das?'],
  ['… Only the mountain settling. It never sleeps. Below this bridge the shaft drops a hundred metres.', '… Nur der Berg, der sich setzt. Er schläft nie. Unter diesem Steg fällt der Schacht hundert Meter ab.'],
  ['Back to the daylight now. Then up the hill to the Hilfsstollen. I know a shorter way: I will wait for you up there.', 'Jetzt zurück ans Tageslicht. Dann den Hang hinauf zum Hilfsstollen. Ich kenne einen kürzeren Weg: Ich warte oben auf dich.'],
  ['There you are! The Hilfsstollen, the “Langer Michael”: 356 metres into the mountain.', 'Da bist du ja! Der Hilfsstollen, der «Lange Michael»: 356 Meter in den Berg hinein.'],
  ['We cut it from 1810 to 1828, mostly through barren rock, to reach the vein from below.', 'Wir haben ihn von 1810 bis 1828 geschlagen, meist durch taubes Gestein, um den Erzgang von unten zu erreichen.'],
  ['1813, chiselled by the surveyor. Each year he marked how far we had come.', '1813, eingemeisselt vom Markscheider. Jedes Jahr hielt er fest, wie weit wir gekommen waren.'],
  ['A few centimetres a day. Hammer, chisel and black powder, and the smoke to breathe afterwards.', 'Ein paar Zentimeter am Tag. Schlägel, Eisen und Schwarzpulver, und danach den Rauch zum Atmen.'],
  ['Keep up. And keep your lamp out of the draught.', 'Bleib dran. Und halt deine Lampe aus dem Luftzug.'],
  ['Here the drifts branch off. Feel the air moving? That is the Wetterzug, the mountain breathing …', 'Hier zweigen die Strecken ab. Spürst du die Luft? Das ist der Wetterzug, der Berg atmet …'],
  ['Your flame!', 'Deine Flamme!'],
  ['Stand still. Do not take a step in the dark.', 'Bleib stehen. Kein Schritt im Dunkeln.'],
  ['There. Lit again.', 'So. Brennt wieder.'],
  ['A miner without a light is the worst that can happen down here. In 2023 the surveyors of the FHNW set up their laser scanner at this very crossing: every stone you see, they measured.', 'Ein Knappe ohne Licht, Schlimmeres gibt es hier unten nicht. 2023 haben die Vermesser der FHNW genau an dieser Kreuzung ihren Laserscanner aufgestellt: Jeden Stein, den du siehst, haben sie vermessen.'],
  ['On, deeper into the mountain.', 'Weiter, tiefer in den Berg.'],
  ['1818. That year Johannes Hitz leased the mine. Eleven years later he was bankrupt and left for America.', '1818. In dem Jahr pachtete Johannes Hitz das Bergwerk. Elf Jahre später war er bankrott und zog nach Amerika.'],
  ['The last stretch. Not far now.', 'Das letzte Stück. Nicht mehr weit.'],
  ['Tell me: how much silver is there in our galena?', 'Sag mal: Wie viel Silber steckt in unserem Bleiglanz?'],
  ['A tenth of it', 'Ein Zehntel'],
  ['A few percent', 'Ein paar Prozent'],
  ['Hardly any', 'Kaum welches'],
  ['Right! Less than two hundredths of a percent. The name promised more than the mountain gave.', 'Richtig! Weniger als zwei Hundertstel Prozent. Der Name hat mehr versprochen, als der Berg hergab.'],
  ['No. Hardly any: less than two hundredths of a percent. The name promised more than the mountain gave.', 'Nein. Kaum welches: weniger als zwei Hundertstel Prozent. Der Name hat mehr versprochen, als der Berg hergab.'],
  ['How many people worked for the mine around 1810, do you think?', 'Was meinst du, wie viele Leute haben um 1810 für das Bergwerk gearbeitet?'],
  ['About 20', 'Etwa 20'],
  ['About 200', 'Etwa 200'],
  ['About 2000', 'Etwa 2000'],
  ['Right, about two hundred, most of them from Davos and Klosters.', 'Richtig, etwa zweihundert, die meisten aus Davos und Klosters.'],
  ['About two hundred, most of them from Davos and Klosters. A lot of mouths for a mountain this stingy.', 'Etwa zweihundert, die meisten aus Davos und Klosters. Viele Mäuler für einen so geizigen Berg.'],
  ['Over here! Follow my lantern.', 'Hierher! Folg meiner Lampe.'],
  ['Do not wander off: the old drifts are not safe.', 'Lauf nicht weg: Die alten Strecken sind nicht sicher.'],
  ['This way!', 'Hier entlang!'],
  ['Jöri is waiting for your answer', 'Jöri wartet auf deine Antwort'],
  ['Answer Jöri: press 1, 2 or 3', 'Antworte Jöri: 1, 2 oder 3 drücken'],
  ['Glück auf! Jöri sends you back into the daylight. The Bergbaumuseum at Schmelzboden tells the rest of the story.', 'Glück auf! Jöri schickt dich zurück ans Tageslicht. Den Rest der Geschichte erzählt das Bergbaumuseum am Schmelzboden.'],
  ['Ore in the Silberberg mine', 'Erz im Silberbergwerk'],
  ['Snow shovelling at Dischmastrasse', 'Schneeschaufeln an der Dischmastrasse'],
  ['Snow blower on the Bündastrasse', 'Schneefräsen auf der Bündastrasse'],
  ['Crane driver at the Hotel Derby', 'Kranführer beim Hotel Derby'],
  ['Climb the crane', 'Auf den Kran steigen'],
  ['Concrete for the first deck', 'Beton aufs erste Deck'],
  ['Rebar for the second deck', 'Armierung aufs zweite Deck'],
  ['The jacuzzi for the roof terrace', 'Der Jacuzzi für die Dachterrasse'],
  ['The site closes for the day: too slow.', 'Feierabend auf der Baustelle: zu langsam.'],
  ['Over the load: F takes it', 'Über der Last: F hängt sie an'],
  ['Swinging: meet the swing with a small move the same way', 'Die Last pendelt: Fahr dem Pendeln mit einer kleinen Bewegung nach'],
  ['The hook swings: meet the swing with a small move the same way', 'Der Haken pendelt: Fahr dem Pendeln mit einer kleinen Bewegung nach'],
  ['Gusts: the load drifts', 'Böen: Die Last treibt ab'],
  ['A D slew · W S trolley · E lift · Q lower · F hook · V view', 'A D schwenken · W S Laufkatze · E heben · Q senken · F Haken · V Ansicht'],
  ['Not on the marked spot', 'Nicht auf der Markierung'],
  ['Lower it onto the spot first', 'Setz sie zuerst auf der Markierung ab'],
  ['The hook is not over the load', 'Der Haken ist nicht über der Last'],
  ['Too hard!', 'Zu hart!'],
  // the crane's step hints (js/missions-data-work.js CRANE_MOVES) and toasts
  ['Hooked: hold E to lift it off the ground', 'Angehängt: E halten und sie vom Boden heben'],
  ['Hold E: lift it clear above the terraces first', 'E halten: Heb sie zuerst über die Terrassen'],
  ['Hold A: slew the jib round towards the yellow ring on the load', 'A halten: Schwenk den Ausleger zum gelben Ring bei der Last'],
  ['Hold D: slew the jib round towards the yellow ring on the load', 'D halten: Schwenk den Ausleger zum gelben Ring bei der Last'],
  ['Hold W: run the trolley out over the load', 'W halten: Fahr die Laufkatze hinaus über die Last'],
  ['Hold S: run the trolley in over the load', 'S halten: Fahr die Laufkatze herein über die Last'],
  ['Over the load: hold Q to lower the hook onto it', 'Über der Last: Q halten und den Haken auf sie absenken'],
  ['The hook is too low: hold E to lift it a little', 'Der Haken ist zu tief: E halten und ihn etwas anheben'],
  ['Let the hook settle over the load, then F takes it', 'Lass den Haken über der Last zur Ruhe kommen, dann hängt F sie an'],
  ['Hold A: slew the jib round towards the yellow mark on the deck', 'A halten: Schwenk den Ausleger zur gelben Markierung auf dem Deck'],
  ['Hold D: slew the jib round towards the yellow mark on the deck', 'D halten: Schwenk den Ausleger zur gelben Markierung auf dem Deck'],
  ['Hold W: run the trolley out over the mark', 'W halten: Fahr die Laufkatze hinaus über die Markierung'],
  ['Hold S: run the trolley in over the mark', 'S halten: Fahr die Laufkatze herein über die Markierung'],
  ['Over the mark: hold Q to lower it gently', 'Über der Markierung: Q halten und sie sanft absenken'],
  ['Down on the mark: F lets it go', 'Sie steht auf der Markierung: F hängt sie aus'],
  ['Off the mark: hold E to lift it, then set it down inside the ring', 'Neben der Markierung: Mit E anheben, dann im Ring absetzen'],
  ['Walk (W) to the ladder at the foot of the mast: you climb up into the cab by yourself', 'Geh (W) zur Leiter am Fuss des Turms: In die Kabine steigst du von selbst'],
  ['Gusts: the load drifts. Hold it over the mark and lower it with Q in a lull', 'Böen: Die Last treibt ab. Halt sie über der Markierung und senk sie in einer Windpause mit Q ab'],
  ['Up in the cab: the yellow ring in the yard marks the load to take', 'Oben in der Kabine: Der gelbe Ring auf dem Werkplatz zeigt die Last, die du anhängst'],
  ['Hooked: E lifts it', 'Angehängt: E hebt sie an'],
  ['Not on the marked spot: E lifts it again', 'Nicht auf der Markierung: E hebt sie wieder an'],
  ['Lower it onto the spot first (Q)', 'Setz sie zuerst auf der Markierung ab (Q)'],
  // the other work missions (js/missions-data-work.js, js/missions-work.js)
  ['Refuse truck', 'Kehrichtwagen'],
  ['On foot!', 'Zu Fuss!'],
  ['You are burying a parked car: V turns the chute!', 'Du schüttest ein parkiertes Auto zu: V dreht den Auswurf!'],
  ['Too fast: the auger chokes and leaves snow', 'Zu schnell: Die Fräse würgt ab und lässt Schnee liegen'],
  ['Back onto the mower', 'Zurück auf den Mäher'],
  ['Off the flower bed!', 'Runter vom Blumenbeet!'],
  ['Stop with the tail at the bins', 'Mit dem Heck bei den Containern anhalten'],
  ['Stand still while the press empties', 'Stillstehen, während die Presse leert'],
  ['In flower: hold Space to pick', 'In Blüte: Space halten zum Pflücken'],
  ['No flowers on this one: leave it', 'Keine Blüten an diesem Strauch: Lass ihn stehen'],
  ['Picked in the reserve! +10 s', 'Im Schutzgebiet gepflückt! +10 s'],
  ['Steinpilz (porcini)', 'Steinpilz'], ['Gallenröhrling (bitter bolete)', 'Gallenröhrling'], ['Eierschwamm (chanterelle)', 'Eierschwamm'],
  ['Falscher Eierschwamm (false chanterelle)', 'Falscher Eierschwamm'], ['Fliegenpilz (fly agaric)', 'Fliegenpilz'],
  ['Fat brown cap, white to yellowish pores underneath, a stout pale stem with a fine white net', 'Dicker brauner Hut, darunter weisse bis gelbliche Röhren, ein kräftiger heller Stiel mit feinem weissem Netz'],
  ['Brown cap, pinkish pores underneath, a stem with a coarse dark net', 'Brauner Hut, darunter rosa Röhren, ein Stiel mit grobem dunklem Netz'],
  ['Egg-yellow funnel, blunt forking ridges running down the stem, firm, smells of apricot', 'Eigelber Trichter, stumpfe gegabelte Leisten bis hinunter an den Stiel, fest, riecht nach Aprikose'],
  ['Orange funnel with thin, crowded true gills, soft, hardly any smell', 'Oranger Trichter mit dünnen, dichten echten Lamellen, weich, kaum Geruch'],
  ['Bright red cap with white flakes, white gills, a ring on the stem', 'Leuchtend roter Hut mit weissen Flocken, weisse Lamellen, ein Ring am Stiel'],
  // the first missions (js/missions-data.js: Rega, avalanche blasting, the motorbike crash)
  ['Set down on the pad (H), hold steady', 'Auf dem Landeplatz (H) aufsetzen, ruhig halten'],
  ['Lower: under 3 m above the snow, hold steady', 'Tiefer: unter 3 m über dem Schnee, ruhig halten'],
  ['Out of ammo', 'Keine Munition mehr'],
  ['Touched down …', 'Aufgesetzt …'],
  ['Set down: zero speed, steady', 'Aufsetzen: stillstehen, ruhig halten'],
  ['Stay on the ground: the crew is with the patient', 'Bleib am Boden: Die Crew ist beim Patienten'],
  ['Park across the marked zone, blue lights on, zero speed', 'Quer in der markierten Zone parken, Blaulicht an, stillstehen'],
  ['Get out: F (on foot)', 'Aussteigen: F (zu Fuss)'],
  ['Get out of the car [F]', 'Aus dem Auto steigen [F]'],
  ['The Rega is inbound: keep the landing zone clear', 'Die Rega ist im Anflug: Halt den Landeplatz frei'],
  ['The Rega is taking over the patient …', 'Die Rega übernimmt den Patienten …'],
  ['The Rega is lifting off', 'Die Rega hebt ab'],
  ['The Rega has left', 'Die Rega ist weggeflogen'],
  ['Lift', 'Heben'],
  ['Slew', 'Schwenken'], ['Trolley', 'Laufkatze'], ['Hook on / let go', 'Anhängen / Loslassen'],
  ['Lower', 'Senken'],
  ['Hook', 'Haken'],
  ['View', 'Ansicht'],
  ['The concrete is in, the rebar lies straight and the jacuzzi has its view of the Parsenn. The foreman buys you a coffee.', 'Der Beton ist drin, die Armierung liegt gerade, und der Jacuzzi hat seinen Blick auf die Parsenn. Der Polier spendiert dir einen Kaffee.'],
  ['Carting the snow to the Davosersee', 'Schnee abführen an den Davosersee'],
  ['Fill the truck', 'Lastwagen füllen'],
  ['Climb into the truck', 'In den Lastwagen steigen'],
  ['To the Davosersee', 'An den Davosersee'],
  ['Back up and tip', 'Rückwärts ansetzen und kippen'],
  ['Tipper', 'Kipper'],
  ['The road is still white at nightfall: too slow.', 'Bei Einbruch der Nacht ist die Strasse noch weiss: zu langsam.'],
  ['The road is finished and the truck is nearly empty: the snow lies beside it.', 'Die Strasse ist fertig und der Lastwagen fast leer: Der Schnee liegt daneben.'],
  ['The dump has closed for the night: too slow.', 'Die Deponie ist für heute zu: zu langsam.'],
  ['The truck is in the Davosersee. The Werkhof is not amused.', 'Der Lastwagen steht im Davosersee. Der Werkhof ist nicht begeistert.'],
  ['Back into the blower', 'Zurück in die Schneefräse'],
  ['The stream misses the bed: close up beside the truck', 'Der Strahl verfehlt die Brücke: Fahr näher neben den Lastwagen'],
  ['Drive closer to the truck', 'Fahr näher an den Lastwagen'],
  ['E: climb across', 'E: hinübersteigen'],
  ['Too fast in the bend: snow over the side', 'Zu schnell in der Kurve: Schnee fällt über die Seite'],
  ['Hold on: it is sliding', 'Halten: Er rutscht'],
  ['Stop the truck', 'Lastwagen anhalten'],
  ['Hold E to tip', 'E halten zum Kippen'],
  ['Into the tipper: to the Davosersee', 'In den Kipper: an den Davosersee'],
  ['The load slides off into the Davosersee. The road is black again and the Werkhof sends the next truck.', 'Die Ladung rutscht in den Davosersee. Die Strasse ist wieder schwarz, und der Werkhof schickt den nächsten Lastwagen.'],
  ['Mowing the Kurpark lawn', 'Rasenmähen im Kurpark'],
  ['Refuse round in Davos Platz', 'Kehrichtrunde in Davos Platz'],
  // the postman's round (js/missions-data-post.js, js/missions-post.js)
  ['Emptying the post boxes', 'Briefkästen leeren'],
  ['The late-morning collection: take the Post\'s yellow van from the Dischmastrasse through Davos Dorf and along the Promenade to Davos Platz and empty the eight public post boxes on the way. Stop by each box and hold Space (or Empty) while the postman unlocks it and tips its letters into the sack; a full box takes longer. Each plate shows its collection time. Then hand the sacks in at the post office Davos Platz on the Talstrasse before the noon dispatch leaves. A box left out costs 45 s.', 'Die Leerung am späten Vormittag: Fahr mit dem gelben Lieferwagen der Post von der Dischmastrasse durch Davos Dorf und über die Promenade nach Davos Platz und leere unterwegs die acht öffentlichen Briefkästen. Halte bei jedem Briefkasten an und halte die Leertaste (oder «Leeren») gedrückt, während der Pöstler ihn aufschliesst und die Briefe in den Sack kippt; ein voller Kasten dauert länger. Auf jedem Schild steht die Leerungszeit. Dann gibst du die Säcke bei der Poststelle Davos Platz an der Talstrasse ab, bevor der Mittagsversand abfährt. Ein ausgelassener Briefkasten kostet 45 s.'],
  ['The sacks are in, the dispatch to the letter centre leaves at noon. Tomorrow the letters of Davos are in Zürich, Basel and Bern.', 'Die Säcke sind abgegeben, der Versand ins Briefzentrum fährt am Mittag. Morgen sind die Briefe aus Davos in Zürich, Basel und Bern.'],
  ['Empty the post boxes', 'Die Briefkästen leeren'], ['Hand the mail in at the post office', 'Die Post bei der Poststelle abgeben'],
  ['The noon dispatch has left: the letters stay in Davos until tomorrow.', 'Der Mittagsversand ist weg: Die Briefe bleiben bis morgen in Davos.'],
  ['Back into the van', 'Zurück in den Lieferwagen'], ['Hold Space to empty the box', 'Leertaste halten: Briefkasten leeren'], ['Stop by the post box', 'Beim Briefkasten anhalten'],
  ['Stand still while the sacks go in', 'Stehen bleiben, während die Säcke abgegeben werden'], ['Empty', 'Leeren'], ['Post van', 'Lieferwagen der Post'],
  ['Alpine roses below the Strelaberg', 'Alpenrosen unter dem Strelaberg'],
  ['Mushroom hunt in the Dischma forest', 'Pilzsuche im Dischmawald'],
  ['Horn sledge race at the Rinerhorn', 'Hornschlittenrennen am Rinerhorn'],
  ['Sommerrodelbahn on the Schatzalp', 'Sommerrodelbahn auf der Schatzalp'],
  ['The first hairpins', 'Die ersten Spitzkehren'], ['Through the tunnel', 'Durch den Tunnel'], ['Down to the foot of the lift', 'Hinunter zum Lift'],
  ['Wall', 'Wand'], ['Up the wall: brake, lean in!', 'Die Wand hoch: bremsen, in die Kurve lehnen!'],['Boing! Over the wall', 'Boing! Über die Wand'], ['You rammed the family!', 'Du hast die Familie gerammt!'],
  // the horn sledge and the Sommerrodelbahn: toasts, hints, the key bar (js/missions-sledge.js, js/missions-data-sledge.js)
  ['Into the net!', 'Ins Netz!'], ['Off the run!', 'Von der Bahn abgekommen!'], ['Tipped over!', 'Umgekippt!'], ['Caught by the net', 'Vom Netz aufgefangen'],
  ['A runner lifts: ease off, brake!', 'Eine Kufe hebt ab: nachlassen, bremsen!'], ['Tipping! Ease off A/D and brake (S)', 'Du kippst! A/D loslassen und bremsen (S)'],
  ['Deep snow: steer back onto the run', 'Tiefschnee: zurück auf die Bahn lenken'],
  ['Brake (S) before a bend, then steer through it with A/D', 'Vor der Kurve bremsen (S), dann mit A/D hindurchlenken'],
  ['Hairpins: brake early; S with A/D drags a heel round the tight ones', 'Haarnadelkurven: früh bremsen; S mit A/D zieht dich mit der Ferse um die engen'],
  ['Duck low (W) on the straights, brake for the last bends', 'Auf den Geraden ducken (W), vor den letzten Kurven bremsen'],
  ['steer · lean', 'lenken · lehnen'], ['brake (with A/D: tight turn)', 'bremsen (mit A/D: enge Kurve)'], ['duck · push off', 'ducken · anstossen'],
  ['Hold S before a hairpin, let go out of it; lean in with A/D', 'Vor der Kehre S halten, aus ihr heraus loslassen; mit A/D hineinlehnen'],
  ['Let it run on the straight, brake before the next bend', 'Auf der Geraden laufen lassen, vor der nächsten Kurve bremsen'],
  ['Keep your distance to the family: brake (S) when you close in', 'Abstand zur Familie halten: bremsen (S), wenn du aufschliesst'],
  ['push off', 'anstossen'], ['hold: brake', 'halten: bremsen'], ['lean into the bend', 'in die Kurve lehnen'],
  // ski slalom, big air, the bike race (js/missions-snow.js, js/missions-data-snow.js)
  ['Crash!', 'Sturz!'], ['Back up for the next jump …', 'Zurück nach oben zum nächsten Sprung …'], ['Missed the kicker: back to the top', 'Kicker verpasst: zurück nach oben'],
  ['Stopped: back to the top', 'Stehen geblieben: zurück nach oben'], ['Missed the kicker', 'Kicker verpasst'], ['Back to the top', 'Zurück nach oben'],
  ['Try again: this one does not count', 'Nochmals: Dieser zählt nicht'], ['Spin A/D · flip W/S · grab Space', 'Drehen A/D · Salto W/S · Grab Space'],
  ['Down to the kicker: tuck (W) for speed', 'Hinunter zum Kicker: ducken (W) für Tempo'],
  ['Shortcut: a checkpoint was missed', 'Abkürzung: Ein Checkpoint wurde ausgelassen'], ['Skidding! Ease off A/D and brake (S)', 'Du rutschst! A/D loslassen und bremsen (S)'],
  ['Skidding: ease off, brake!', 'Du rutschst: nachlassen, bremsen!'],
  ['Back on the bike', 'Zurück aufs Bike'], ['tuck', 'ducken'], ['carve · in the air: spin', 'carven · in der Luft: drehen'],
  ['tuck, brake · in the air: flip', 'ducken, bremsen · in der Luft: Salto'], ['in the air: grab', 'in der Luft: Grab'],
  // speed skating, the penalty shot, curling (js/missions-ice.js, js/missions-data-ice.js)
  ['Push', 'Abstossen'], ['SAVE', 'GEHALTEN'], ['GLOVE SAVE', 'MIT DER FANGHAND'], ['POST!', 'PFOSTEN!'], ['POKE CHECK', 'POKE-CHECK'],
  ['on target', 'aufs Tor'], ['off target', 'neben das Tor'], ['Curl ↻ right', 'Drall ↻ rechts'], ['Curl ↺ left', 'Drall ↺ links'],
  ['Hogged: short of the hog line, removed', 'Vor der Hogline liegen geblieben: entfernt'], ['Out of play', 'Aus dem Spiel'], ['Short of the house', 'Vor dem Haus liegen geblieben'],
  ['Wrong way: the race runs counter-clockwise', 'Falsche Richtung: Das Rennen läuft im Gegenuhrzeigersinn'], ['Off the ice: back onto the track', 'Neben dem Eis: zurück auf die Bahn'],
  ['Saved by the goalie', 'Vom Goalie gehalten'], ['Poke check: the goalie took the puck', 'Poke-Check: Der Goalie hat dir den Puck abgenommen'],
  ['The puck went backwards: no goal', 'Der Puck ging nach hinten: kein Tor'], ['Too slow: time is up', 'Zu langsam: Die Zeit ist um'],
  ['Wide of the goal', 'Am Tor vorbei'], ['Off the post!', 'An den Pfosten!'], ['Shot!', 'Schuss!'], ['Sweep: hold Space', 'Wischen: Space halten'],
  // fresh ice on the Seehofseeli, the splitboard tour: the key bar (js/missions-rink.js, js/missions-splitboard.js)
  ['hold: spray', 'halten: spritzen'], ['walk backwards', 'rückwärts gehen'], ['Drive slowly over the grey ice, lane beside lane', 'Langsam über das graue Eis fahren, Bahn neben Bahn'],
  ['hold: transceiver check', 'halten: LVS-Check'], ['kick turn', 'Spitzkehre'], ['back', 'zurück'], ['hold: next step', 'halten: nächster Schritt'], ['hold: probe · dig', 'halten: sondieren · schaufeln'],
  ['Too fast for this bend: brake (S) and lean!', 'Zu schnell für diese Kurve: bremse (S) und lehne dich hinein!'],
  ['A family ahead: do not ram them, brake (S)!', 'Vor dir fährt eine Familie: nicht auffahren, bremse (S)!'],
  ['Back on the sledge', 'Zurück auf den Schlitten'],
  ['The trough levels out at the foot of the lift, the tow hook clicks on. Hands still shaking, time for an ice cream on the Schatzalp terrace.', 'Die Rinne läuft unten beim Lift aus, der Schlepphaken klickt ein. Die Hände zittern noch: Zeit für eine Glace auf der Schatzalp-Terrasse.'],
  ['Slalom on the Davos Vertical', 'Slalom auf der Davos Vertical'],
  ['Snowboard Big Air in the JatzPark', 'Snowboard-Big-Air im JatzPark'],
  ['Downhill race: Ischalp to Bolgen', 'Abfahrtsrennen: Ischalp bis Bolgen'],
  ['Golf at the Golf Club Davos', 'Golf im Golf Club Davos'],
  ['Groom the Dischma trail', 'Dischma-Loipe präparieren'],
  ['Return to the Spital and land', 'Zum Spital zurückfliegen und landen'],
  ['Fly the casualty to the Spital', 'Verletzte Person zum Spital fliegen'],
  ['Avalanche blasting', 'Lawinensprengung'],
  ['Motorbike crash on the pass road', 'Motorradunfall auf der Passstrasse'],
  ['Police: motorbike crash on the Flüela road', 'Polizei: Motorradunfall an der Flüelastrasse'],
  ['Davos Nordic: 4.3 km race', 'Davos Nordic: 4,3-km-Rennen'],
  ['Minigolf at the Hotel Waldhuus', 'Minigolf beim Hotel Waldhuus'],
  ['Sunrise on the Flüela Schwarzhorn', 'Sonnenaufgang auf dem Flüela Schwarzhorn'], ['The hike to the Jöriseen', 'Wanderung zu den Jöriseen'],
  ['Up from the Flüelastrasse', 'Hinauf von der Flüelastrasse'], ['Into the scree', 'Ins Geröll'], ['On up the valley', 'Weiter talaufwärts'], ['Up towards the ridge', 'Hinauf zum Grat'], ['Along the ridge', 'Dem Grat entlang'], ['Over the last rocks', 'Über die letzten Felsen'], ['To the summit of the Schwarzhorn', 'Auf den Gipfel des Schwarzhorns'], ['Watch the sun come up', 'Den Sonnenaufgang geniessen'], ['Turn to the east', 'Schau nach Osten'],
  ['Up from the Wägerhus', 'Hinauf vom Wägerhus'], ['Into the Winterlücke', 'In die Winterlücke'], ['On up the slope', 'Weiter den Hang hinauf'], ['Over the Jöriflüelafurgga', 'Über die Jöriflüelafurgga'], ['Down to the Jöriseen', 'Hinunter zu den Jöriseen'],
  ['Off the path: back to the waymarks', 'Abseits vom Weg: zurück zu den Markierungen'],
  ['The sun over the ridges, the valleys still in shadow, and a very cold thermos.', 'Die Sonne über den Graten, die Täler noch im Schatten und eine sehr kalte Thermosflasche.'],
  ['Boots off at the Jöriseen: the water is as cold as it looks.', 'Schuhe aus an den Jöriseen: Das Wasser ist so kalt, wie es aussieht.'],
  // the paraglider flight from the Rinerhorn (js/missions-data-paraglide.js, js/missions-paraglide.js)
  ['Paragliding licence: the flight from the Rinerhorn', 'Flugschein: Gleitschirmflug vom Rinerhorn'],
  // the paragliding licence and the free flight (js/missions.js, js/paraglide-free.js)
  ['Paragliding licence', 'Flugschein'], ['Paragliding licence earned!', 'Flugschein erhalten!'], ['You hold the paragliding licence', 'Du hast den Flugschein'],
  ['P on any slope that falls away: the wing off your back, and fly.', 'P an jedem Hang, der abfällt: Schirm vom Rücken nehmen und fliegen.'],
  ['On a phone: the Fly button on a slope.', 'Auf dem Handy: der Knopf «Fliegen» an einem Hang.'],
  ['No licence yet: land softly on the field at Glaris.', 'Noch kein Flugschein: Lande sanft auf dem Landeplatz in Glaris.'],
  ['The licence exam: land softly on the field at Glaris.', 'Die Flugschein-Prüfung: Lande sanft auf dem Landeplatz in Glaris.'],
  ['Licence', 'Flugschein'],
  ['Pack up', 'Einpacken'],
  ['W or Space: pull up the wing and run', 'W oder Leertaste: Schirm aufziehen und loslaufen'], ['P: pack it up again', 'P: wieder einpacken'],
  ['Too flat to take off: find a slope that falls away', 'Zu flach zum Starten: Such einen Hang, der abfällt'],
  ['Too steep to run here: find an open slope', 'Zu steil zum Anlaufen: Such einen freien Hang'],
  ['Stand on the open ground to lay out the wing', 'Stell dich auf offenen Boden, um den Schirm auszulegen'],
  ['The slope ran out: the wing comes down', 'Der Hang ist zu Ende: Der Schirm fällt zusammen'],
  ['Landed', 'Gelandet'], ['Free flight', 'Freier Flug'], ['Wing packed', 'Schirm eingepackt'],
  ['Take off: run down the slope', 'Start: den Hang hinunterlaufen'], ['Fly: thermals, distance, the landing at Glaris', 'Fliegen: Thermik, Distanz, Landung in Glaris'],
  ['W or Space: pull up the wing', 'W oder Leertaste: Schirm aufziehen'], ['The wing comes up …', 'Der Schirm steigt …'], ['Run! Keep going downhill', 'Lauf! Weiter bergab'],
  ['The edge of the map: turning back', 'Kartenrand: Der Schirm dreht um'], ['Flare now!', 'Jetzt ausflaren!'], ['Lift! Circle in it', 'Steigen! Kreise darin'],
  ['Above ground', 'Über Grund'], ['Paraglider', 'Gleitschirm'], ['Altitude', 'Höhe'], ['Climb', 'Steigen'], ['Ground speed', 'Grundtempo'], ['Vario', 'Vario'], ['Airtime', 'Flugzeit'], ['Distance', 'Distanz'], ['Points', 'Punkte'], ['a.s.l.', 'ü. M.'],
  ['Airborne!', 'In der Luft!'], ['Landed on the field!', 'Auf dem Landeplatz gelandet!'], ['Crash landing', 'Bruchlandung'], ['Launch', 'Starten'], ['Flare', 'Ausflaren'],
  ['The wing folded on the meadow at Glaris, a Rivella at the valley station, and already looking up for the next cloud.', 'Der Schirm liegt gefaltet auf der Wiese in Glaris, an der Talstation gibt es ein Rivella, und der Blick sucht schon die nächste Wolke.'],
  // fresh ice on the Seehofseeli (js/missions-data-rink.js, js/missions-rink.js)
  ['Fresh ice for the Seehofseeli', 'Frisches Eis fürs Seehofseeli'],
  ['Take the hose at the hydrant', 'Den Schlauch am Hydranten nehmen'], ['Flood the ice', 'Das Eis fluten'], ['Get on the ice resurfacer', 'Auf die Eismaschine steigen'], ['Resurface the ice', 'Das Eis glätten'],
  ['Hold Space: spray', 'Space halten: spritzen'], ['Off the wet ice! Walk backwards (S) and spray ahead', 'Runter vom nassen Eis! Rückwärts gehen (S) und nach vorne spritzen'],
  ['F: get on', 'F: aufsteigen'], ['Back onto the machine', 'Zurück auf die Maschine'], ['Ice resurfacer', 'Eismaschine'], ['Spray', 'Spritzen'],
  ['Footprints in the fresh ice!', 'Fussabdrücke im frischen Eis!'],
  ['Too late: the skaters are here and the ice is still rough.', 'Zu spät: Die Eisläufer sind da, und das Eis ist noch rau.'],
  ['The ice shines like glass under the lanterns, and the first skaters are already lacing up on the bank.', 'Das Eis glänzt unter den Laternen wie Glas, und am Ufer schnüren die ersten schon die Schlittschuhe.'],
  // the snowfarming Loipe in the Färich (js/missions-data-snowfarm.js, js/missions-snowfarm.js)
  ['The snowfarming Loipe', 'Die Snowfarming-Loipe'],
  ['End of October in the Färich: the meadows are still green, but under the wood chips and the white fleece of the depot lies last winter\'s snow, kept over the summer. Today it becomes the first Loipe of the season. Drive the tipper to the loading spot at the depot and let the wheel loader fill it. Then spread the snow along the marked round: hold Space to raise the bed, and the snow runs out behind the truck. Your pace sets the layer: too fast leaves gaps, too slow piles the snow up and the load runs short. When the round is white, walk over to the snowcat and groom it with the tiller lowered (F): it spreads the windrow over its whole width, and where there is no snow there is nothing to groom.', 'Ende Oktober im Färich: Die Wiesen sind noch grün, aber unter den Holzschnitzeln und dem weissen Vlies des Depots liegt der Schnee des letzten Winters, über den Sommer aufbewahrt. Heute wird daraus die erste Loipe der Saison. Fahr den Kipper zum Ladeplatz beim Depot und lass ihn vom Pneulader beladen. Dann verteilst du den Schnee entlang der markierten Runde: Space halten hebt die Brücke, und der Schnee rinnt hinter dem Lastwagen hinaus. Dein Tempo bestimmt die Schicht: zu schnell gibt Lücken, zu langsam türmt den Schnee auf, und die Ladung reicht nicht. Ist die Runde weiss, geh hinüber zum Pistenfahrzeug und präpariere sie mit abgesenkter Fräse (F): Sie verteilt den Schneewall über ihre ganze Breite, und wo kein Schnee liegt, gibt es nichts zu präparieren.'],
  ['Load the snow at the depot', 'Am Depot Schnee laden'], ['Spread the snow along the Loipe', 'Den Schnee entlang der Loipe verteilen'],
  ['Walk over to the snowcat', 'Hinüber zum Pistenfahrzeug'], ['Groom the Loipe', 'Die Loipe präparieren'],
  ['Back into the tipper', 'Zurück in den Kipper'], ['Back into the snowcat', 'Zurück ins Pistenfahrzeug'], ['F: get out of the tipper', 'F: aus dem Kipper aussteigen'],
  ['The loader is filling the bed: stay put', 'Der Pneulader belädt die Brücke: stehen bleiben'], ['Stop with the bed beside the heap', 'Mit der Brücke neben dem Haufen anhalten'],
  ['The bed is empty: back to the depot for another load', 'Die Brücke ist leer: zurück zum Depot und nachladen'], ['Standing still: the snow piles up behind you', 'Du stehst: Der Schnee türmt sich hinter dir auf'],
  ['Hold Space: spread', 'Space halten: verteilen'], ['Spread', 'Verteilen'], ['Lower the tiller [F]', 'Fräse absenken [F]'],
  ['Full: off to the Loipe', 'Voll: ab auf die Loipe'], ['Empty: back to the depot', 'Leer: zurück zum Depot'],
  ['The first cross-country skiers are waiting at the Loipe, and it is still green: too slow.', 'Die ersten Langläufer warten an der Loipe, und sie ist noch grün: zu langsam.'],
  ['The round lies white and groomed in the green meadow of the Färich, the corduroy shining in the low sun. Tomorrow the first skiers of the season are on it.', 'Die Runde liegt weiss und präpariert in der grünen Wiese des Färich, die Rillen glänzen in der tiefen Sonne. Morgen ziehen die ersten Langläufer der Saison darauf ihre Spur.'],
  // the splitboard tour on the Chörbschhorn (js/missions-data-splitboard.js, js/missions-splitboard.js)
  ['Splitboard tour on the Chörbschhorn', 'Splitboardtour aufs Chörbschhorn'],
  ['Group check: transceivers', 'Gruppencheck: LVS'], ['Send check: Reto searches, you send', 'Sendecheck: Reto sucht, du sendest'], ['Receive check: you search, Reto sends', 'Empfangscheck: du suchst, Reto sendet'],
  ['Reto hears you: sending ✓', 'Reto empfängt dich: Senden ✓'], ['You hear Reto: receiving ✓', 'Du empfängst Reto: Empfang ✓'],
  ['RETO · SEARCH', 'RETO · SUCHEN'], ['YOU · SEARCH', 'DU · SUCHEN'], ['SEARCH', 'SUCHEN'], ['PROBE', 'SONDIEREN'], ['DIG', 'SCHAUFELN'], ['Probe/Dig', 'Sondieren/Schaufeln'],
  ['Over 30°: Reto keeps 10 m spacing behind you', 'Über 30°: Reto hält 10 m Entlastungsabstand hinter dir'], ['Wait for Reto', 'Auf Reto warten'],
  ['Steep slope above 35°: avalanche danger – back to the track', 'Steilhang über 35°: Lawinengefahr – zurück in die Spur'], ['Avalanche danger!', 'Lawinengefahr!'],
  ['Avalanche! Reto is buried', 'Lawine! Reto ist verschüttet'], ['Reto is buried! Search: no signal yet, go down the avalanche', 'Reto ist verschüttet! Suche: noch kein Signal, den Lawinenkegel hinunter'],
  ['Transceiver on search: down the fall line in strips', 'LVS auf Suchen: in Streifen die Falllinie hinunter'], ['Coarse search: follow the arrow', 'Grobsuche: dem Pfeil folgen'], ['Close: slow down, fine search', 'Nah: langsam, Feinsuche'],
  ['Fine search: probe (hold Space)', 'Feinsuche: sondieren (Space halten)'], ['Probe hit: dig him out (hold Space)', 'Sonde trifft: ausschaufeln (Space halten)'],
  ['Fine search: probe here', 'Feinsuche: hier sondieren'], ['Probe hit! Dig', 'Sonde trifft! Schaufeln'], ['Reto is out, unhurt. Back to the marked line!', 'Reto ist draussen, unverletzt. Zurück auf die markierte Linie!'],
  ['A second avalanche: you and Reto get out of it, but the tour ends here. Keep to the marked line in steep ground.', 'Eine zweite Lawine: Du und Reto kommt heraus, aber die Tour endet hier. Im steilen Gelände auf der markierten Linie bleiben.'],
  ['Along the ridge to the Hauptertälli', 'Dem Grat entlang zum Hauptertälli'], ['Up the ridge to the summit', 'Über den Grat zum Gipfel'],
  ['Transition: skins off, board together', 'Umbauen: Felle ab, Board zusammen'], ['Down the south ridge past the hut', 'Über den Südgrat an der Hütte vorbei'], ['Down to the Stafelalp', 'Hinunter zur Stafelalp'],
  ['Too steep: the skins slip! Zig-zag across the slope', 'Zu steil: Die Felle rutschen! Im Zickzack quer zum Hang'], ['Steep: zig-zag, Space for a kick turn', 'Steil: im Zickzack, Space für eine Spitzkehre'],
  ['Hold Space', 'Space halten'], ['Ready to ride', 'Bereit zur Abfahrt'], ['Kick turn', 'Spitzkehre'], ['Hold', 'Halten'],
  ['Skin off the first half', 'Fell von der ersten Hälfte'], ['Skin off the second half', 'Fell von der zweiten Hälfte'], ['Halves together, hooks in', 'Hälften zusammen, Haken einhängen'],
  ['Close the clips', 'Clips schliessen'], ['Bindings across, pins in', 'Bindungen quer, Pins rein'], ['Step in, straps tight', 'Einsteigen, Riemen zu'],
  ['Board together: drop in!', 'Board zusammen: rein in den Hang!'], ['Wipe-out!', 'Sturz!'],
  ['The sun has turned the snow to mush: too late for the descent today.', 'Die Sonne hat den Schnee aufgeweicht: zu spät für die Abfahrt heute.'],
  ['At the Stafelalp, a long line down from the Chörbschhorn behind you, and the Berghaus has a table in the sun.', 'Auf der Stafelalp, hinter dir eine lange Spur vom Chörbschhorn herunter, und im Berghaus ist ein Tisch an der Sonne frei.'],
  // Pfadi Davos: a Spatz and a campfire in the Mattawald (js/missions-data-pfadi.js, js/missions-pfadi.js)
  ['Pfadi Davos: Spatz and campfire', 'Pfadi Davos: Spatz und Lagerfeuer'],
  ['Follow the trail signs to the Mattawald', 'Den Wegzeichen nach in den Mattawald'], ['Pitch the Spatz', 'Den Spatz aufstellen'], ['Gather firewood', 'Feuerholz sammeln'],
  ['Build the fireplace', 'Die Feuerstelle bauen'], ['Strike a spark with flint and steel', 'Mit Feuerstein und Feuerstahl Funken schlagen'], ['Blow the ember into a flame', 'Die Glut zur Flamme anblasen'],
  ['Follow the trail signs: sticks laid as arrows', 'Folge den Wegzeichen: Äste als Pfeile gelegt'], ['The Spatz stands', 'Der Spatz steht'], ['Ready to light', 'Bereit zum Anzünden'],
  ['Picking up …', 'Aufheben …'], ['Space when the needle is in the green', 'Space, wenn die Nadel im Grünen ist'], ['Out of breath: let go and breathe in', 'Keine Luft mehr: loslassen und einatmen'],
  ['Hold Space: blow gently', 'Space halten: sanft blasen'], ['It catches! The fire grows', 'Es brennt! Das Feuer wächst'], ['Blow', 'Blasen'], ['Pick up', 'Aufheben'],
  ['Lay out the six tarps', 'Die sechs Blachen auslegen'], ['Button the tarps together', 'Die Blachen zusammenknöpfen'], ['Set up the poles and the ridge', 'Stangen und First aufstellen'],
  ['Peg the edges', 'Ränder verhäringen'], ['Tension the guy lines', 'Abspannschnüre spannen'],
  ['Lay the stones in a ring', 'Steine im Kreis legen'], ['Tinder nest in the middle', 'Zundernest in die Mitte'], ['Kindling as a tipi', 'Anfeuerholz als Tipi'], ['Logs round it', 'Scheiter darum herum'],
  ['Dry twigs ✓', 'Dürre Zweige ✓'], ['Kindling ✓', 'Anfeuerholz ✓'], ['A log ✓', 'Ein Scheit ✓'], ['The Spatz stands!', 'Der Spatz steht!'], ['The fireplace is ready', 'Die Feuerstelle ist bereit'],
  ['Sparks in the tinder!', 'Funken im Zunder!'], ['Missed the steel', 'Am Stahl vorbei'], ['An ember in the tinder!', 'Eine Glut im Zunder!'], ['It catches!', 'Es brennt!'], ['Out of breath', 'Keine Luft mehr'],
  ['FLINT AND STEEL', 'FEUERSTEIN UND STAHL'], ['BREATH', 'ATEM'], ['EMBER', 'GLUT'], ['Pfadi Davos logo', 'Logo der Pfadi Davos'],
  ['It is dark in the Mattawald, and the others have pitched their tents without you.', 'Im Mattawald ist es dunkel, und die anderen haben ihre Zelte ohne dich aufgestellt.'],
  ['The Spatz stands taut between the spruces of the Mattawald, the fire crackles, and the first cervelats are on their sticks. Allzeit bereit!', 'Der Spatz steht straff zwischen den Fichten des Mattawalds, das Feuer knistert, und die ersten Cervelats stecken an den Stecken. Allzeit bereit!'],
  // the police speed check on the Talstrasse (js/missions-data-radar.js, js/missions-radar.js; its texts with numbers come in German from there)
  ['Police: speed check on the Talstrasse', 'Polizei: Geschwindigkeitskontrolle an der Talstrasse'],
  ['The Kantonspolizei Graubünden is checking speeds on the Talstrasse between Davos Platz and Davos Dorf: 50 km/h. Drive the patrol car to the verge, get out (F) and set up the laser on its tripod. Looking through it (Q), aim at an oncoming car (drag or A/D) and measure with Space: 30 to 300 m away, the laser needs a moment on the car. Over 53 km/h (the tolerance is 3 km/h) is an offence: raise the stop sign (E) while the car is still coming, walk to it and hand out the right fine (1-4): 1-5 km/h over CHF 40, 6-10 CHF 120, 11-15 CHF 250, 16 and more a report. Let a driver within the tolerance go (0). Four minutes.', 'Die Kantonspolizei Graubünden kontrolliert die Geschwindigkeit an der Talstrasse zwischen Davos Platz und Davos Dorf: 50 km/h. Fahr den Streifenwagen an den Strassenrand, steig aus (F) und stell den Laser auf das Stativ. Schau hindurch (Q), ziel auf ein entgegenkommendes Auto (ziehen oder A/D) und miss mit der Leertaste: 30 bis 300 m entfernt, der Laser braucht einen Moment auf dem Auto. Über 53 km/h (die Toleranz beträgt 3 km/h) ist eine Übertretung: Heb die Kelle (E), solange das Auto noch kommt, geh hin und verteil die richtige Busse (1-4): 1-5 km/h zu schnell CHF 40, 6-10 CHF 120, 11-15 CHF 250, ab 16 eine Anzeige. Wer innerhalb der Toleranz fährt, darf weiter (0). Vier Minuten.'],
  ['End of the check: the laser is packed, the readings go to the Kantonspolizei in Chur.', 'Ende der Kontrolle: Der Laser ist eingepackt, die Messungen gehen an die Kantonspolizei in Chur.'],
  ['Drive to the speed check on the Talstrasse', 'Zur Geschwindigkeitskontrolle an der Talstrasse fahren'], ['Set up the laser on its tripod', 'Den Laser auf dem Stativ aufstellen'],
  ['Measure the oncoming cars, stop the speeders', 'Entgegenkommende Autos messen, Raser anhalten'],
  ['Parked on the verge …', 'Am Strassenrand geparkt …'], ['Park on the verge beside the Talstrasse', 'Am Rand der Talstrasse parkieren'],
  ['Get out: F', 'Aussteigen: F'], ['Setting up the laser …', 'Der Laser wird aufgestellt …'], ['Walk to the marked spot beside the road', 'Geh zur markierten Stelle neben der Strasse'],
  ['At the car: choose the fine (1-4) or let the driver go (0)', 'Beim Auto: Busse wählen (1-4) oder weiterfahren lassen (0)'], ['Walk to the stopped car', 'Geh zum angehaltenen Auto'],
  ['The car is pulling over …', 'Das Auto hält am Rand an …'], ['Time is up', 'Die Zeit ist um'],
  ['Measure with the laser (Q), stop speeders with the stop sign (E)', 'Mit dem Laser messen (Q), Raser mit der Kelle anhalten (E)'],
  ['Measure', 'Messen'], ['Stop sign', 'Kelle'], ['Laser', 'Laser'], ['Stopped', 'Angehalten'], ['Traffic stop', 'Verkehrskontrolle'], ['Reading', 'Messung'],
  ['limit', 'Limite'], ['tolerance', 'Toleranz'], ['No reading for this car', 'Für dieses Auto gibt es keine Messung'], ['Let go', 'Weiterfahren lassen'], ['no offence', 'keine Übertretung'], ['Report', 'Anzeige'],
  ['Gamepad: ◀ ▶ choose · A confirm', 'Gamepad: ◀ ▶ wählen · A bestätigen'], ['Previous fine', 'Vorherige Busse'], ['Next fine', 'Nächste Busse'], ['Give the fine', 'Busse erteilen'],
  ['Ice minigolf on the Arkadenplatz', 'Eis-Minigolf auf dem Arkadenplatz'],
  ['Stick and puck back to the hut: a Punsch on the Arkadenplatz warms the fingers again.', 'Stock und Puck zurück in die Hütte: Ein Punsch auf dem Arkadenplatz wärmt die Finger wieder.'],
  ['Shoot', 'Schiessen'],
  ['Face-off', 'Bully'], ['The blue line', 'Die blaue Linie'], ['The snow bank', 'Der Schneewall'], ['The penalty box', 'Die Strafbank'], ['The players\u2019 tunnel', 'Der Spielertunnel'], ['The boards', 'Die Bande'], ['The goal crease', 'Der Torraum'], ['The grandstand', 'Die Tribüne'], ['The icing line', 'Die Icing-Linie'], ['The hat-trick', 'Der Hattrick'], ['The Zamboni', 'Die Eismaschine'], ['The short side', 'Die kurze Ecke'], ['The slapshot', 'Der Slapshot'], ['The power play', 'Das Powerplay'], ['The one-timer', 'Der Direktschuss'], ['The spin-o-rama', 'Die Pirouette'], ['Overtime', 'Die Verlängerung'], ['The Spengler Cup', 'Der Spengler Cup'],
  ['Darts at The Green Wildman', 'Darts im The Green Wildman'],
  ['Skating the Schüssla', 'Skaten in der Schüssla'],
  ['Beer run for the Davoser Craft Beer', 'Bierlieferung für Davoser Craft Beer'],
  ['The Weber Gipfeli challenge', 'Die Weber-Gipfeli-Challenge'],
  ['Raclette at Käch', 'Raclette bei Käch'],
  ['Ibex hunt: the Bündner Hochjagd', 'Steinbockjagd: Bündner Hochjagd'],
  ['Feeding the squirrels at the Davosersee', 'Eichhörnchen am Davosersee füttern'],
  ['Tiebreak in the Färbi tennis hall', 'Tiebreak in der Tennishalle Färbi'],
  ['Slide race at the eau-là-là', 'Rutschrennen im eau-là-là'],
  ['Paint a Kirchner', 'Einen Kirchner malen'],
  ['In the finish area of the Davos Vertical: the crowd cheers, the skis come off.', 'Im Ziel der Davos Vertical jubelt die Menge. Die Ski können abgeschnallt werden.'],
  ['Three jumps in the JatzPark: the judges have their scores.', 'Drei Sprünge im JatzPark. Die Jury hat ihre Wertung.'],
  ['Bolgen Plaza: dusty, muddy, done. The bike gets a wash.', 'Bolgen Plaza: staubig, schlammig, geschafft. Das Velo wird gewaschen.'],
  ["Through the finish: two laps on Europe's largest natural ice rink.", 'Im Ziel: zwei Runden auf Europas grösster Natureisbahn geschafft.'],
  ["Shoot-out over: the Eisstadion's ice is yours.", 'Das Penaltyschiessen ist vorbei. Das Eisstadion gehört dir.'],
  ['End complete: the stones are counted.', 'Das End ist gespielt. Die Steine werden gezählt.'],
  ['Glaris in sight: the sledge glides out, the partner behind lets go of the brake chain. A hot Bündner Nusstorte at the Rinerhorn hut is earned.', 'Glaris ist in Sicht. Der Schlitten gleitet aus. Ein Stück Bündner Nusstorte ist verdient.'],
  ['The band throws you a pick: what a neck!', 'Die Band wirft dir ein Plektrum zu. Das ging in den Nacken!'],
  ['The regulars buy you a drink. Next round is on them.', 'Die Stammgäste spendieren dir ein Getränk. Die nächste Runde geht auf sie.'],
  ['Rush hour over: the queue is gone, the cabins went up packed.', 'Der Andrang ist vorbei. Die Schlange ist weg, die Gondeln fuhren vollbesetzt hinauf.'],
  ['Davos Platz, end of the run. Nicely driven!', 'Davos Platz, Endstation. Gut gefahren!'],
  ['Back in daylight, black with dust: the ore goes down to the smelter at Schmelzboden.', 'Zurück im Tageslicht, schwarz vor Staub: Das Erz geht zur Schmelze in Schmelzboden.'],
  ['The round is in: the card is signed at the clubhouse.', 'Die Runde ist beendet. Die Scorekarte wird im Clubhaus unterschrieben.'],
  ['Trail groomed: the corduroy is down, the cross-country skiers can come.', 'Die Loipe ist präpariert. Die Langläufer können kommen.'],
  ['Patient handed over: the Spital team takes it from here.', 'Patient übergeben. Das Spitalteam übernimmt.'],
  ['Slope released: all four zones have slid, the road can reopen.', 'Alle vier Zonen sind abgegangen. Die Strasse kann wieder öffnen.'],
  ['Patient at the Spital: the rider is in good hands.', 'Der Patient ist im Spital und in guten Händen.'],
  ['Call complete: the Rega has taken over the patient, the road is secured.', 'Einsatz beendet: Die Rega hat den Patienten übernommen, die Strasse ist gesichert.'],
  ['The path is clear down to the gravel, the heaps stand in the garden. A coffee in the Stube is earned.', 'Der Weg ist bis auf den Kies frei, der Schnee liegt im Garten. Ein Kaffee in der Stube ist verdient.'],
  ['The Bündastrasse is black again, the snow lies in the gardens and not on the cars. The first post bus can come.', 'Die Bündastrasse ist wieder frei, der Schnee liegt in den Gärten. Der erste Postbus kann kommen.'],
  ['The lawn lies in neat stripes, the beds are whole. The band can come.', 'Der Rasen ist sauber gemäht, die Beete sind heil. Die Band kann kommen.'],
  ["The press has swallowed the quarter's rubbish, the truck tips its load in the KMA. The Hof quarter is tidy for another week.", 'Der Kehrichtwagen hat den Abfall eingesammelt und bei der KMA entladen. Das Hofquartier ist wieder sauber.'],
  ['A bouquet of Alpenrosen, deep pink against the grey of the Strela. It goes into a jar on the table of the Schatzalp hut.', 'Ein Strauss Alpenrosen für die Schatzalphütte.'],
  ['The control sorts your basket on its table. What is left goes into the pan with butter and parsley.', 'Die Pilzkontrolle sortiert deinen Korb. Der Rest kommt mit Butter und Petersilie in die Pfanne.'],
  ['The last crate is in the BOX: the brewers raise a glass to you.', 'Die letzte Kiste ist in der BOX. Die Brauer stossen mit dir an.'],
  ['Breakfast is served: three hotels with Weber Gipfeli on the table.', 'Das Frühstück ist serviert: In drei Hotels liegen frische Weber-Gipfeli auf dem Tisch.'],
  ['The last plate is out: the guests ask for the potatoes.', 'Der letzte Teller ist serviert. Die Gäste fragen nach Kartoffeln.'],
  ['Weidmannsheil! The game warden notes the trophies in your permit.', 'Weidmannsheil! Der Wildhüter trägt die Trophäe in deine Jagdbewilligung ein.'],
  ['Out of nuts: the squirrels will remember you.', 'Die Nüsse sind aufgebraucht. Die Eichhörnchen werden sich an dich erinnern.'],
  ['Game, set … well, tiebreak. The coach shakes your hand at the net.', 'Spiel, Satz … zumindest Tiebreak. Der Trainer gibt dir am Netz die Hand.'],
  ['Splash! Into the pool at full speed.', 'Platsch! Mit vollem Tempo ins Becken.'],
  ['The paint is still wet: an expressionist view of Davos.', 'Die Farbe ist noch nass: eine expressionistische Ansicht von Davos.'],
  ['Across the line in the Bünda stadium: the crowd rings its cowbells.', 'Über die Ziellinie im Bünda-Stadion. Das Publikum läutet die Kuhglocken.'],
  ['Putter and ball back to the reception: an ice cream from the kiosk is on the house.', 'Schläger und Ball zurück an die Rezeption. Ein Glacé vom Kiosk geht aufs Haus.'],
  ['Game shot! The regulars slide a pint of stout along the bar.', 'Spiel gewonnen! Die Stammgäste schieben dir ein Glas Stout über die Theke.'],
  ['Session over: the locals on the deck bang their boards on the coping.', 'Die Session ist vorbei. Die Skater klopfen mit ihren Boards auf die Kante.'],
  ['Mine the ore and get out before the lamp dies', 'Erz abbauen und hinaus, bevor die Lampe erlischt'],
  ['Hold Strike (E / Space) to break the ore', 'Zuschlagen (E / Space) halten, um das Erz herauszuschlagen'],
  ['The lamp is running low: get out!', 'Das Öl geht zur Neige: hinaus!'],
  ['The basket is full: to an ore bin (under a lantern)', 'Der Korb ist voll: zu einem Erzkasten (unter einer Laterne)'],
  ['The basket is full: to an ore bin', 'Der Korb ist voll: zu einem Erzkasten'],
  ['The lamp gutters: get out!', 'Die Lampe flackert: hinaus!'], ['The lamp has gone out', 'Die Lampe ist erloschen'],
  ['Lamp', 'Lampe'],
  ['Headbang on the beat', 'Im Takt headbangen'], ['Win the match (first to 5)', 'Spiel gewinnen (zuerst 5 Tore)'],
  ['Pack the cabins (100 s)', 'Gondeln füllen (100 s)'],
  ['Choose your technique', 'Technik wählen'], ['On the start line', 'An die Startlinie'],
  ['To the finish in the Bünda', 'Zum Ziel in der Bünda'],
  ['Check out 301 (double out)', '301 ausmachen (Double Out)'],
  ['Drop in', 'Einfahren'], ['60 s run', '60 Sekunden fahren'],
  ['Stones 5 to 8', 'Steine 5 bis 8'], ['Stones 1 to 4', 'Steine 1 bis 4'],
  ['Clear the whole path', 'Ganzen Weg räumen'], ['Clear half of the path', 'Halben Weg räumen'],
  ['Clear the whole road', 'Ganze Strasse räumen'], ['Clear the first half', 'Erste Hälfte räumen'],
  ['Mow the whole lawn', 'Ganzen Rasen mähen'], ['Mow half of the lawn', 'Halben Rasen mähen'],
  ['Empty the collection points', 'Sammelstellen leeren'], ['Unload at the KMA', 'Bei der KMA entladen'],
  ['Pick 12 flowering sprigs', '12 blühende Zweige pflücken'], ['Back down to the start', 'Zurück zum Start'],
  ['Fill the basket', 'Korb füllen'], ['To the mushroom control', 'Zur Pilzkontrolle'],
  ['Load the crates at the brewery', 'Kisten bei der Brauerei einladen'],
  ['Stalk to the stand', 'Zum Hochsitz schleichen'], ['Take an old buck', 'Einen alten Bock erlegen'],
  ['Feed the squirrels (3 min)', 'Eichhörnchen füttern (3 min)'],
  ['Play the tiebreak (first to 7)', 'Tiebreak spielen (zuerst 7 Punkte)'],
  ['Slide down!', 'Hinunterrutschen!'], ['Paint the view (3 min)', 'Aussicht malen (3 min)'],
  ['Over the finish line', 'Über die Ziellinie'],
  ['Lower the tiller and get on the trail', 'Fräse absenken und auf die Loipe fahren'],
  ['Fly to the casualty', 'Zur verletzten Person fliegen'], ['Pick up the patient', 'Patienten aufnehmen'],
  ['Fly to the accident site', 'Zur Unfallstelle fliegen'], ['Land beside the road', 'Neben der Strasse landen'],
  ['Treat the patient', 'Patienten versorgen'], ['Drive to the accident site', 'Zur Unfallstelle fahren'],
  ['Secure the accident site', 'Unfallstelle sichern'],
  ['Place a cone downhill (50 m before the site)', 'Kegel talwärts aufstellen (50 m vor der Stelle)'],
  ['Place a cone uphill (50 m past the site)', 'Kegel bergwärts aufstellen (50 m nach der Stelle)'],
  ['Guide the Rega in and wait', 'Rega einweisen und warten'],
  ['Lighting the lamp …', 'Öllampe wird angezündet …'],
  ['Drag down over the dough · or tap S / ↓ steadily', 'Gleichmässig über den Teig nach unten ziehen · oder S / ↓ im Takt tippen'],
  ['The grill is heating up …', 'Der Grill heizt auf …'],
  ['Swipe across the cheese / Space: scrape', 'Über den Käse wischen / Space: abschaben'],
  ['Missed: the herd bolts up the slope', 'Daneben: Die Herde flieht den Hang hinauf'],
  ['Hit, but not clean: aim behind the shoulder', 'Getroffen, aber nicht sauber: hinter die Schulter zielen'],
  ['Walk, do not run', 'Gehen, nicht rennen'],
  ['Turn to the herd, put the crosshair on an old buck, then Z for the scope · Q / E: zoom · Shift: hold breath · Space / click: fire', 'Dreh dich zur Herde, setz das Fadenkreuz auf einen alten Bock, dann Z fürs Zielfernrohr · Q / E: zoomen · Shift: Atem anhalten · Space / Klick: schiessen'],
  ['Warming up …', 'Aufwärmen …'],
  ['WASD: run · Space / click: swing · A/D at the swing: aim', 'WASD: laufen · Space / Klick: schlagen · A/D beim Schlag: zielen'],
  ['Space / click as the ball comes: swing · A/D at the swing: aim', 'Space / Klick, wenn der Ball kommt: schlagen · A/D beim Schlag: zielen'],
  ['Sit down at the top …', 'Oben Platz nehmen …'],
  ['A / D or ← / →: lean into the bends', 'A / D oder ← / →: in die Kurven lehnen'],
  ['Setting up the easel …', 'Staffelei wird aufgestellt …'], ['Finished', 'Fertig'],
  ['Paint with the mouse / a finger · Done when you are happy', 'Mit Maus oder Finger malen · Fertig drücken, wenn du zufrieden bist'],
  ['Disqualified: you cut across the infield', 'Disqualifiziert: Du hast das Innenfeld geschnitten'],
  ['Disqualified: you cut across the infield inside the cones.', 'Disqualifiziert: Du bist innerhalb der Kegel über das Innenfeld gelaufen.'],
  ['Roll (tap steadily)', 'Rollen (gleichmässig tippen)'], ['Scrape!', 'Abschaben!'],
  ['Contour', 'Kontur'], ['Template', 'Vorlage'], ['Clear', 'Löschen'], ['Done', 'Fertig'],
  ['Download PNG', 'PNG herunterladen'], ['Your earlier pictures', 'Deine früheren Bilder'],
  ['Cart to the ball (C)', 'Golfwagen zum Ball (C)'],
  // the golf mission's HUD (js/missions-golf.js; the generated texts: golfDe below)
  ['Space / Swing: putt (A/D aim)', 'Space / Schwung: putten (A/D zielen)'],
  ['Stop the power at the red mark: press again (or let go)', 'Kraft bei der roten Marke stoppen: nochmals drücken (oder loslassen)'],
  ['Strike on the green line: early hooks left, late slices right', 'Auf der grünen Linie schlagen: zu früh gibt einen Hook nach links, zu spät einen Slice nach rechts'],
  ['Start the swing', 'Schwung beginnen'], ['Stop the power at the red mark', 'Kraft bei der roten Marke stoppen'],
  ['Strike on the green line (early: hook left · late: slice right)', 'Auf der grünen Linie schlagen (zu früh: Hook links · zu spät: Slice rechts)'],
  ['Swing', 'Schwung'], ['Pin', 'Fahne'], ['The power the pin needs', 'Die Kraft, die es bis zur Fahne braucht'], ['the pin is out of reach', 'die Fahne ist ausser Reichweite'],
  ['calm', 'windstill'], ['headwind', 'Gegenwind'], ['tailwind', 'Rückenwind'], ['from the left', 'von links'], ['from the right', 'von rechts'],
  ['headwind from the left', 'Gegenwind von links'], ['headwind from the right', 'Gegenwind von rechts'], ['tailwind from the left', 'Rückenwind von links'], ['tailwind from the right', 'Rückenwind von rechts'],
  ['Tee', 'Abschlag'], ['Fairway', 'Fairway'], ['Rough', 'Rough'], ['Bunker', 'Bunker'], ['Water', 'Wasser'], ['Out of bounds', 'Aus'],
  ['Clean strike: straight', 'Sauber getroffen: gerade'], ['A touch early: nearly straight', 'Etwas zu früh: fast gerade'], ['A touch late: nearly straight', 'Etwas zu spät: fast gerade'],
  ['Early: pulled left', 'Zu früh: nach links gezogen'], ['Late: pushed right', 'Zu spät: nach rechts geschoben'], ['Wind: hardly any effect', 'Wind: kaum Wirkung'],
  ['Tip: wait until the needle is on the green line', 'Tipp: Warte, bis die Nadel auf der grünen Linie ist'], ['Tip: press a little sooner, on the green line', 'Tipp: Drück etwas früher, auf der grünen Linie'],
  ['Out of reach with this club: a longer one, or lay up', 'Mit diesem Schläger ausser Reichweite: einen längeren nehmen oder vorlegen'],
  ['Splash! In the water', 'Platsch! Im Wasser'], ['In the hole!', 'Im Loch!'], ['Cart to the ball', 'Mit dem Golfwagen zum Ball'],
  ['In the water: a penalty stroke, drop', 'Im Wasser: ein Strafschlag, Ball droppen'], ['Out of bounds: stroke and distance', 'Aus: Schlag und Distanz'],
  ['Hole in one!', 'Hole-in-one!'], ['Double bogey', 'Doppel-Bogey'], ['Triple bogey', 'Triple-Bogey'],
  ['Power stroke!', 'Kräftiger Abstoss!'], ['Too early: stumble', 'Zu früh: gestolpert'],
  ['The band is tuning up …', 'Die Band stimmt ihre Instrumente …'],
  ['Space / tap BANG on the beat', 'Space / BANG im Takt tippen'],
  ['Space / J / K or BANG on the beat', 'Space / J / K oder BANG im Takt'],
  ['Chalking the handles …', 'Die Griffe werden eingekreidet …'],
  ['W/S or mouse: slide · Space/click: shoot · 1-4: rod, Q: auto', 'W/S oder Maus: schieben · Space/Klick: schiessen · 1–4: Stange, Q: Automatik'],
  ['The cabin comes in …', 'Die Gondel kommt …'],
  ['←/→ move · ↑ turn · Space drop · E send the cabin', '←/→ bewegen · ↑ drehen · Space abwerfen · E Gondel losschicken'],
  ['W: throttle · S: brake', 'W: Gas · S: Bremse'],
  ['The tiller has to be down for the track to count.', 'Die Fräse muss abgesenkt sein, damit die Spur zählt.'],
  ['Shell in flight …', 'Geschoss im Flug …'],
  ['Too slow: the postman has already slipped on the path.', 'Zu langsam: Der Postbote ist auf dem Weg schon ausgerutscht.'],
  ['The morning traffic is stuck in the snow: too slow.', 'Der Morgenverkehr steckt im Schnee fest: zu langsam.'],
  ['The concert starts and the grass is still high.', 'Das Konzert beginnt und das Gras ist noch hoch.'],
  ['The sun is down behind the Strela: too slow.', 'Die Sonne ist hinter der Strela verschwunden: zu langsam.'],
  ['Nature reserve: out of here!', 'Naturschutzgebiet: Geh hier raus!'],
  ['1: Classic (diagonal stride in the tracks) · 2: Skating (V2 skate)', '1: Klassisch (Diagonalschritt in der Spur) · 2: Skating (V2)'],
  ['Press 1 or 2, or tap a button', '1 oder 2 drücken oder eine Schaltfläche antippen'],
  ['Chalking the scoreboard …', 'Die Anzeigetafel wird vorbereitet …'],
  ['Press W (or Space) to drop into the bowl', 'W oder Space drücken, um in die Bowl einzufahren'],
  ['Skating', 'Skating'],
  ['F: get out', 'F: aussteigen'],
  ['F: get in', 'F: einsteigen'],
  // winter driving: summer tyres on the Flüela, snow chains over Clavadel (js/missions-data-winterroad.js, js/missions-winterroad.js)
  ['Summer tyres on the Flüela', 'Sommerpneus am Flüela'],
  ['An early winter has come overnight: 20 cm of fresh snow on the Flüelapassstrasse, the plough has been through once, and your van still wears its summer tyres. Drive the last 2.5 km from the Wägerhütta up through the hairpins to the Flüela Hospiz on the pass, 2383 m. The tyres hardly grip: brake early and gently, take the bends slowly, and ease into the throttle; too much and the rear wheels spin, worst of all from a standstill on the slope. Into the snowbank costs 5 s; off the road, or stuck for good, and the climb is over.', 'Der Winter ist über Nacht früh gekommen: 20 cm Neuschnee auf der Flüelapassstrasse, der Pflug ist einmal durch, und dein Bus hat noch die Sommerpneus drauf. Fahr die letzten 2,5 km von der Wägerhütta durch die Kehren hinauf zum Flüela Hospiz auf der Passhöhe, 2383 m. Die Pneus greifen kaum: früh und sanft bremsen, langsam in die Kurven und gefühlvoll Gas geben; zu viel, und die Hinterräder drehen durch, am schlimmsten beim Anfahren am Hang. Im Schneewall kostet es 5 s; neben der Strasse oder endgültig stecken geblieben, und die Fahrt ist vorbei.'],
  ['At the Hospiz the engine ticks as it cools. Winter tyres before the drive down, though.', 'Beim Hospiz tickt der Motor beim Abkühlen. Vor der Talfahrt aber bitte Winterpneus.'],
  ['Up to the Flüela Hospiz', 'Hinauf zum Flüela Hospiz'], ['Up through the hairpins', 'Hinauf durch die Kehren'],
  ['Snow chains over Clavadel', 'Schneeketten über Clavadel'],
  ['Snow down to the valley floor, and your van on summer tyres has to get to Frauenkirch, the long way round over Clavadel. In Islen, past the KMA on the Clavadelerstrasse, pull over on the right and stop. Get out (F) and put the chains on the two rear wheels, the ones that drive: hold Space to lay the chain out, press Space when the needle is in the green to pull it over the tyre, then tap Space to tension it. Back behind the wheel, up to Clavadel and down the Sertigerstrasse to Frauenkirch. The chains grip, and they rattle, but they are good for 50 km/h at most: any faster and they strain until one snaps.', 'Schnee bis in den Talboden, und dein Bus auf Sommerpneus muss nach Frauenkirch, auf dem langen Weg über Clavadel. In Islen, nach der KMA an der Clavadelerstrasse, rechts ranfahren und anhalten. Steig aus (F) und montiere die Ketten an den zwei Hinterrädern, den angetriebenen: Space halten, um die Kette auszulegen, Space drücken, wenn die Nadel im Grünen ist, um sie über den Pneu zu ziehen, dann Space schnell antippen, um sie zu spannen. Zurück hinters Steuer, hinauf nach Clavadel und die Sertigerstrasse hinunter nach Frauenkirch. Die Ketten greifen, und sie rasseln, aber mehr als 50 km/h vertragen sie nicht: schneller, und sie werden überlastet, bis eine reisst.'],
  ['Frauenkirch: the chains come off again by the church, cold, wet and rattling.', 'Frauenkirch: Bei der Kirche kommen die Ketten wieder runter, kalt, nass und rasselnd.'],
  ['Pull over in Islen', 'In Islen rechts ranfahren'], ['Put the chains on the rear wheels', 'Ketten an die Hinterräder'], ['Back behind the wheel', 'Zurück hinters Steuer'],
  ['Up to Clavadel', 'Hinauf nach Clavadel'], ['Down to Frauenkirch', 'Hinunter nach Frauenkirch'],
  ['Off the road: the van slid off the Flüelapassstrasse and down the slope.', 'Von der Strasse abgekommen: Der Bus ist von der Flüelapassstrasse den Hang hinunter gerutscht.'],
  ['Off the road: the van slid off the Clavadelerstrasse into the snow-covered meadow.', 'Von der Strasse abgekommen: Der Bus ist von der Clavadelerstrasse in die verschneite Wiese gerutscht.'],
  ['Stuck: the van has not got any further up the road for 40 s.', 'Stecken geblieben: Der Bus ist seit 40 s nicht mehr weitergekommen.'],
  ['A chain snapped: snow chains are good for 50 km/h at most.', 'Eine Kette ist gerissen: Schneeketten vertragen höchstens 50 km/h.'],
  ['Wheels spinning: ease off the throttle (tap W)', 'Die Räder drehen durch: weniger Gas (W antippen)'], ['In the snowbank: back onto the road', 'Im Schneewall: zurück auf die Strasse'],
  ['Stop here, on the right', 'Hier rechts anhalten'], ['Brake (S) to a stop', 'Bremsen (S) bis zum Stillstand'], ['Back to the pull-in', 'Zurück zum Halteplatz'],
  ['Space when the needle is in the green', 'Space, wenn die Nadel im Grünen ist'], ['Tap Space quickly', 'Space schnell antippen'], ['Get back into the van', 'Steig wieder in den Bus'], ['Chains on', 'Ketten montiert'],
  ['Into the snowbank  +5 s', 'In den Schneewall  +5 s'], ['Crash  +8 s', 'Unfall  +8 s'], ['The chain slipped off  +2.5 s', 'Die Kette ist abgerutscht  +2,5 s'],
  ['One chain on: now the other wheel', 'Eine Kette ist dran: jetzt das andere Rad'], ['Both chains on', 'Beide Ketten sind dran'], ['Wheelspin!', 'Die Räder drehen durch!'],
  ['The chains are straining: under 50 km/h!', 'Die Ketten werden überlastet: unter 50 km/h!'],
  ['Left rear wheel', 'Hinterrad links'], ['Right rear wheel', 'Hinterrad rechts'], ['Lay the chain out: hold Space', 'Kette auslegen: Space halten'],
  ['Pull it over: Space in the green', 'Überziehen: Space im Grünen'], ['Tension it: tap Space', 'Spannen: Space antippen'], ['Chains', 'Ketten'],
  ['At the bar', 'An der Bar'],
  ['Order a Flämmli', 'Flämmli bestellen'],
  // Nageln in the Tijuana Bar, Barista at the Kafi Klatsch (js/missions-data-bars.js)
  // A shift at the Turmhotel Victoria (js/missions-data-victoria.js, js/missions-victoria.js)
  ['A shift at the Turmhotel Victoria', 'Eine Schicht im Turmhotel Victoria'], ['Go into the Turmhotel Victoria', 'Ins Turmhotel Victoria gehen'],
  ['Turn round two rooms', 'Zwei Zimmer herrichten'], ['Cook the lunch service', 'Den Mittagsservice kochen'], ['Wash and mangle the linen', 'Die Wäsche waschen und mangeln'],
  ['Taking the trolley …', 'Du holst den Putzwagen …'], ['Down to the kitchen …', 'Ab in die Küche …'], ['Down to the Lingerie …', 'Ab in die Lingerie …'],
  ['Make the bed', 'Bett machen'], ['Fresh towels', 'Frische Tücher'], ['Scrub the bath', 'Wanne schrubben'], ['Polish the mirror', 'Spiegel polieren'],
  ['Empty the bin', 'Abfall leeren'], ['Fill the minibar', 'Minibar auffüllen'], ['Chocolate on the pillow', 'Schöggeli aufs Kissen'],
  ['Make the bed first', 'Zuerst das Bett machen'], ['The Gouvernante has a look …', 'Die Gouvernante schaut sich um …'],
  ['Room 204', 'Zimmer 204'], ['The tower suite', 'Die Turmsuite'], ['The Müllers from Basel', 'Die Müllers aus Basel'], ['A Dutch family of five', 'Eine holländische Familie zu fünft'],
  ['New ticket: put it on a free burner', 'Neuer Bon: Setz ihn auf eine freie Platte'], ['Plate each dish in the green', 'Richte jedes Gericht im grünen Bereich an'],
  ['Waiting for the next ticket …', 'Warten auf den nächsten Bon …'], ['Put it on', 'Aufsetzen'],
  ['Bed sheet', 'Leintuch'], ['Red napkin', 'Rote Serviette'], ['Pillowcase', 'Kissenanzug'], ['Bath towel', 'Badetuch'], ['Blue tablecloth', 'Blaues Tischtuch'],
  ['Duvet cover', 'Duvetanzug'], ['A guest\'s red sock', 'Die rote Socke eines Gasts'], ['Chef\'s jacket', 'Kochjacke'], ['Green apron', 'Grüne Schürze'],
  ['Bath robe', 'Bademantel'], ['Checked napkin', 'Karierte Serviette'],
  ['◀ Whites', '◀ Weisses'], ['Colours ▶', 'Buntes ▶'],
  ['The drum turns …', 'Die Trommel dreht …'], ['Keep the sheet straight: hold ◀ or ▶', 'Halte das Leintuch gerade: ◀ oder ▶ gedrückt halten'],
  ['All through', 'Alles durch'], ['Next sheet …', 'Nächstes Leintuch …'],
  ['Caught in the rollers!', 'In die Walze geraten!'], ['A crease or two', 'Ein, zwei Falten'], ['Creased all over', 'Voller Falten'],
  ['Nageln in the Tijuana Bar', 'Nageln in der Tijuana Bar'], ['Go into the Tijuana Bar', 'In die Tijuana Bar gehen'],
  ['Finding a place at the stump …', 'Du suchst dir einen Platz am Stock …'],
  ['Space or the buttons', 'Leertaste oder die Knöpfe'], ['Aim', 'Zielen'], ['Strike', 'Zuschlagen'], ['Big Hans', 'Der grosse Hans'],
  ['Aim: stop the hammer over the nail', 'Zielen: Halte den Hammer über dem Nagel an'], ['Power: strike in the green', 'Kraft: Schlag im grünen Bereich zu'],
  ['Your stroke', 'Dein Schlag'], ['You drove it flush!', 'Du hast ihn ganz versenkt!'], ['Right on the head!', 'Genau auf den Kopf!'],
  ['A glancing blow', 'Nur gestreift'], ['Straightened it again', 'Wieder gerade geklopft'], ['Bent the nail: turn lost', 'Nagel verbogen: Zug verloren'],
  ['Into the wood: turn lost', 'Ins Holz: Zug verloren'], ['King of the stump!', 'König des Baumstamms!'],
  ['Hopp!', 'Hopp!'], ['That one went in.', 'Der sitzt.'], ['Right on the head.', 'Genau auf den Kopf.'], ['Clean!', 'Sauber!'],
  ['Ouch. Next round is on you.', 'Autsch. Die nächste Runde zahlst du.'], ['Who taught you that?', 'Wer hat dir das beigebracht?'], ['The stump is winning.', 'Der Stock gewinnt.'], ['That nail looks sad.', 'Der Nagel sieht traurig aus.'],
  ['Flush! Your round, everyone else.', 'Drin! Ihr anderen zahlt die Runde.'], ['Down it goes. Prost!', 'Und weg ist er. Prost!'], ['And that is how it is done!', 'Und so macht man das!'],
  ['Not bad for a tourist!', 'Nicht schlecht für einen Touristen!'], ['Hoi! Look at that one!', 'Hoi! Schau dir den an!'], ['Beginner’s luck!', 'Anfängerglück!'], ['Now you are scaring us.', 'Jetzt machst du uns Angst.'],
  ['Ha! The wrong end of the evening.', 'Ha! Das falsche Ende des Abends.'], ['Try the nail next time.', 'Versuch es nächstes Mal mit dem Nagel.'], ['Another beer, that will help.', 'Noch ein Bier, das hilft.'], ['That stump has seen better.', 'Der Stock hat schon Besseres gesehen.'],
  ['Flush! Give that one a beer!', 'Drin! Gebt dem ein Bier!'], ['Lucky swing! One more game!', 'Glückstreffer! Noch eine Partie!'], ['Prost, champion!', 'Prost, Champion!'],
  ['Turn the music up!', 'Mach die Musik lauter!'], ['Who is buying?', 'Wer zahlt?'], ['Rock’n’roll, not Ländler!', 'Rock’n’Roll, nicht Ländler!'], ['Nachos for table two!', 'Nachos für Tisch zwei!'],
  ['This stump is older than the Parsenn.', 'Der Stock ist älter als die Parsenn.'], ['One more, then home. Really.', 'Noch eins, dann heim. Wirklich.'], ['Did you see the snow up on the Jakobshorn?', 'Hast du den Schnee oben am Jakobshorn gesehen?'],
  ['Barista at the Kafi Klatsch', 'Barista im Kafi Klatsch'], ['Go into the Kafi Klatsch', 'Ins Kafi Klatsch gehen'], ['Get through the morning rush', 'Den Morgenansturm überstehen'],
  ['Tying on the apron …', 'Du bindest die Schürze um …'], ['Wiping the counter …', 'Du wischst die Theke …'], ['The usual: which was it?', 'Wie immer: Was war es schon wieder?'],
  ['Grind', 'Mahlen'], ['Tamp', 'Tampen'], ['Pull', 'Beziehen'], ['Steam', 'Schäumen'], ['Pour', 'Giessen'], ['Serve', 'Servieren'], ['Ask again', 'Nochmals fragen'],
  ['Grind: stop at the right dose', 'Mahlen: Stopp bei der richtigen Menge'], ['Tamp: press in the green', 'Tampen: Drück im grünen Bereich'], ['Pull the shot: stop in the green', 'Kaffee beziehen: Stopp im grünen Bereich'],
  ['Steam the milk: stop in the green', 'Milch schäumen: Stopp im grünen Bereich'], ['Pour: tip the jug in the green', 'Giessen: Kipp das Kännchen im grünen Bereich'], ['Serve it!', 'Servieren!'],
  ['Spot on', 'Punktgenau'], ['Nearly', 'Beinahe'], ['Too early', 'Zu früh'], ['Too late', 'Zu spät'], ['The cup overflows!', 'Die Tasse läuft über!'], ['Burnt milk!', 'Milch verbrannt!'], ['Far too much coffee!', 'Viel zu viel Kaffee!'],
  ['The usual, remembered!', 'Wie immer, und du weisst es noch!'], ['Wrong: that is not the usual', 'Falsch: Das ist nicht das Übliche'], ['Gone: they got tired of waiting', 'Weg: Das Warten wurde zu lang'],
  ['the usual', 'wie immer'], ['The usual, please!', 'Wie immer, bitte!'], ['Rüeblitorte today', 'Heute Rüeblitorte'],
  ['A Schale, dear, like every morning. Remember that!', 'Eine Schale, wie jeden Morgen. Merk dir das!'], ['Café crème, young one. Always the same, you will see.', 'Café crème, junger Mensch. Immer dasselbe, du wirst sehen.'], ['Cappuccino! You’ll know it next time, right?', 'Cappuccino! Das weisst du nächstes Mal, oder?'],
  ['I’ll get a coffee at the Bahnhof then!', 'Dann hole ich mir halt einen Kaffee am Bahnhof!'], ['You remembered! Merci vilmal.', 'Du hast es dir gemerkt! Merci vilmal.'], ['Merci vilmal!', 'Merci vilmal!'], ['Now that is coffee.', 'Das nenne ich Kaffee.'], ['Exactly how it should be.', 'Genau so muss er sein.'],
  ['Hm. Is the machine new?', 'Hm. Ist die Maschine neu?'], ['I have had worse. In Chur.', 'Ich hatte schon schlechteren. In Chur.'], ['Well. It is warm.', 'Nun ja. Er ist warm.'], ['No no no. Not that one.', 'Nein, nein, nein. Den nicht.'],
  ['Have you heard? The Hoffmanns’ dog got the Landammann’s sausage again.', 'Hast du gehört? Der Hund von Hoffmanns hat dem Landammann wieder die Wurst geklaut.'], ['And she wore skis to the church bazaar. In June!', 'Und sie kam mit den Skis an den Kirchenbasar. Im Juni!'],
  ['They say the new Landwasser bridge has been painted twice. Twice!', 'Die neue Landwasserbrücke soll zweimal gestrichen worden sein. Zweimal!'], ['My cousin says the WEF left a whole crate of pens behind.', 'Mein Cousin sagt, das WEF habe eine ganze Kiste Kugelschreiber zurückgelassen.'],
  ['The baker has a new girlfriend from Klosters. From Klosters!', 'Der Bäcker hat eine neue Freundin aus Klosters. Aus Klosters!'], ['The Rüeblitorte was smaller last week. I measured it.', 'Die Rüeblitorte war letzte Woche kleiner. Ich habe nachgemessen.'],
  ['I knew that ski instructor when he was afraid of the T-bar.', 'Den Skilehrer kannte ich, als er noch Angst vor dem Bügellift hatte.'], ['Someone has been nailing in the Tijuana again. The whole Talstrasse heard it.', 'Im Tijuana wurde wieder genagelt. Die ganze Talstrasse hat es gehört.'],
  ['The postman reads the postcards. Everyone knows.', 'Der Pöstler liest die Postkarten. Das weiss jeder.'], ['Don’t tell anyone, but the Föhn is coming on Thursday.', 'Sag es niemandem, aber am Donnerstag kommt der Föhn.'],
  ['Pouring …', 'Es wird eingeschenkt …'],
  ['Light it: bring the lighter over the glass', 'Anzünden: das Feuerzeug über das Glas bringen'],
  ['Light it', 'Anzünden'],
  ['The flame: blow it out in the green', 'Die Flamme: im grünen Bereich ausblasen'],
  ['Blow it out', 'Ausblasen'],
  ['The glass: down it when the rim is warm, not hot', 'Das Glas: kippen, wenn der Rand warm ist, nicht heiss'],
  ['Down it', 'Runterkippen'],
  ['Next round …', 'Nächste Runde …'],
  ['Too long: the glass cracks!', 'Zu lange: das Glas springt!'],
  ['Stone cold: a sad sip', 'Eiskalt: ein trauriger Schluck'],
  ['All 6 down!', 'Alle 6 getrunken!'],
  ['Ouch: singed fingers!', 'Autsch: angesengte Finger!'],
  ['Missed the glass', 'Glas verfehlt'],
  ['It catches at once!', 'Es zündet sofort!'],
  ['Alight', 'Es brennt'],
  ['Perfect flame!', 'Perfekte Flamme!'],
  ['Nice flame', 'Schöne Flamme'],
  ['Too early: it never got warm', 'Zu früh: es wurde nie warm'],
  ['Late: that rim is hot', 'Zu spät: der Rand ist heiss'],
  ['Down in one. Hopp!', 'Auf ex. Hopp!'],
  ['Down it goes', 'Runter damit'],
  ['Hot! The lip remembers that', 'Heiss! Die Lippe merkt sich das'],
  ['Lukewarm by now', 'Schon lauwarm'],
  // flaming shots in the Ex Bar, the Flämmli in the Rot Liechtli (js/missions-data-gastro.js)
  ['Order a shot', 'Shot bestellen'], ['Flaming shots in the Ex Bar', 'Flaming Shots in der Ex Bar'], ['Go into the Ex Bar', 'In die Ex Bar gehen'],
  ['The barkeeper called time', 'Der Barkeeper hat Feierabend gerufen'],
  ['Last orders at the Ex Bar. Take the Rufbus home: nobody is driving tonight.', 'Letzte Runde in der Ex Bar. Nimm den Rufbus nach Hause: Heute Abend fährt niemand.'],
  ['The red lamp turns gently and the caramel is still on your lips. Take the Rufbus home: nobody is driving tonight.', 'Die rote Lampe dreht sich sanft, und das Caramel klebt noch an den Lippen. Nimm den Rufbus nach Hause: Heute Abend fährt niemand.'],
  ['Espresso, sugar and Williams are coming …', 'Espresso, Zucker und Williams kommen …'],
  ['Sugar into the espresso: hold, let go in the green', 'Zucker in den Espresso: halten, im grünen Bereich loslassen'], ['Hold: sugar', 'Halten: Zucker'],
  ['Drink the espresso, leave the sugar: hold, let go in the green', 'Espresso trinken, den Zucker drin lassen: halten, im grünen Bereich loslassen'], ['Hold: sip', 'Halten: trinken'],
  ['Williams onto the sugar: hold, let go in the green', 'Williams auf den Zucker: halten, im grünen Bereich loslassen'], ['Hold: pour', 'Halten: einschenken'],
  ['Light it: bring the lighter over the cup', 'Anzünden: das Feuerzeug über das Tassli bringen'],
  ['Keep it burning: swirl when the flame sinks, not too wild', 'Am Brennen halten: schwenken, wenn die Flamme sinkt, aber nicht zu wild'], ['Swirl', 'Schwenken'],
  ['Golden caramel: pour it into the shot glass, still burning!', 'Goldenes Caramel: brennend ins Shotglas leeren!'], ['Pour it over', 'Ins Shotglas leeren'],
  ['Smother it with your palm: when the glass is warm, not hot', 'Mit der Hand ersticken: wenn das Glas warm ist, nicht heiss'], ['Hand on the glass', 'Hand aufs Glas'],
  ['Hopp: down it!', 'Hopp: ex!'],
  ['A proper heap', 'Ein rechter Haufen'], ['Perfect heap of sugar!', 'Perfekter Zuckerberg!'], ['A bit stingy with the sugar', 'Etwas geizig mit dem Zucker'], ['A sugar mountain', 'Ein Zuckergebirge'], ['A sugar mountain: it spills!', 'Ein Zuckergebirge: es läuft über!'],
  ['Espresso down, sugar stays', 'Espresso weg, Zucker bleibt'], ['Just the sugar left!', 'Nur noch der Zucker drin!'], ['Coffee left in the cup: the flame will struggle', 'Kaffee im Tassli: die Flamme wird kämpfen'], ['Swallowed half the sugar', 'Den halben Zucker mitgetrunken'], ['Swallowed half the sugar: it spills!', 'Den Zucker mitgetrunken: alles weg!'],
  ['A good splash', 'Ein guter Schluck'], ['Exactly two centilitres!', 'Genau zwei Zentiliter!'], ['Not much Williams: it burns off fast', 'Wenig Williams: der brennt schnell ab'], ['Generous: it will burn wild', 'Grosszügig: das brennt wild'], ['Generous: it will burn wild: it spills!', 'Zu grosszügig: es läuft über!'],
  ['Missed the cup', 'Tassli verfehlt'], ['Burning again', 'Es brennt wieder'],
  ['A draught from the door!', 'Es zieht von der Tür!'], ['Too wild: it sloshes over your fingers!', 'Zu wild: es schwappt über die Finger!'],
  ['Golden caramel: pour it over!', 'Goldenes Caramel: ins Shotglas!'],
  ['Out: light it again!', 'Aus! Nochmals anzünden!'], ['The Williams has burnt off: light it again!', 'Der Williams ist abgebrannt: nochmals anzünden!'],
  ['Out: it won\'t burn again', 'Aus: der brennt nicht mehr'], ['The Williams has burnt off: it won\'t burn again', 'Der Williams ist abgebrannt: der brennt nicht mehr'],
  ['Out: a cold Flämmli', 'Aus: ein kaltes Flämmli'], ['The Williams has burnt off: a cold Flämmli', 'Der Williams ist abgebrannt: ein kaltes Flämmli'],
  ['It dies in the pour: a cold Flämmli', 'Beim Umleeren erloschen: ein kaltes Flämmli'],
  ['Lovely caramel, still burning!', 'Wunderbares Caramel, brennt noch!'], ['Into the shot glass, still burning', 'Brennend ins Shotglas'],
  ['Plop! The glass sticks to your palm', 'Plopp! Das Glas klebt an der Hand'], ['Out, and the glass sticks', 'Aus, und das Glas klebt'], ['Too soon: the glass won\'t stick', 'Zu früh: das Glas saugt sich nicht an'], ['Ouch, hot glass!', 'Autsch, heisses Glas!'],
  ['Too long: the shot glass cracks!', 'Zu lange: das Shotglas springt!'], ['Hopp! Down it goes', 'Hopp! Ex!'], ['All 3 down!', 'Alle 3 getrunken!'],
  ['Flämmli in the Rot Liechtli', 'Flämmli im Rot Liechtli'],
  ['The landlord called time', 'Der Wirt hat Feierabend gerufen'],
  ['Go into the Rot Liechtli', 'Ins Rot Liechtli gehen'],
  ['Finding a place at the bar …', 'Platz an der Bar suchen …'],
  ['Space or the button', 'Space oder die Taste'],
  ['Tomato', 'Tomate'],
  ['Basil', 'Basilikum'],
  ['Ham', 'Schinken'],
  ['Mushrooms', 'Pilze'],
  ['Pineapple', 'Ananas'],
  // the WEF week: the escort and the march (js/missions-data-wef.js)
  ['Escort at the WEF', 'Eskorte am WEF'],
  ['The delegation steps out at the Kongresszentrum and asks whether Davos always has this much snow. Well driven.', 'Die Delegation steigt am Kongresszentrum aus und fragt, ob Davos immer so viel Schnee hat. Gut gefahren.'],
  ['Pick up the delegation at the Bahnhof Davos Dorf', 'Die Delegation am Bahnhof Davos Dorf abholen'],
  ['Security gate on the Promenade', 'Sicherheitsschleuse an der Promenade'],
  ['Security gate on the Scalettastrasse', 'Sicherheitsschleuse an der Scalettastrasse'],
  ['Security gate on the Kurgartenstrasse', 'Sicherheitsschleuse an der Kurgartenstrasse'],
  ['Security gate on the Talstrasse', 'Sicherheitsschleuse an der Talstrasse'],
  ['Radio the detour', 'Umleitung per Funk melden'],
  ['Set the delegation down at the Kongresszentrum', 'Die Delegation am Kongresszentrum absetzen'],
  ['Blue light and siren: K (the traffic gives way)', 'Blaulicht und Sirene: K (der Verkehr macht Platz)'],
  ['Blue light on (K) for the delegation', 'Blaulicht ein (K) für die Delegation'],
  ['Stop here', 'Hier anhalten'],
  ['Wait for the limousines', 'Warte auf die Limousinen'],
  ['Stop at the door', 'Vor der Tür anhalten'],
  ['Radio: J', 'Funk: J'],
  ['Control: a snow blower has broken down at the Kongress. Radio the detour: J', 'Zentrale: Vor dem Kongress steht eine Schneefräse still. Melde die Umleitung per Funk: J'],
  ['Control: detour via the Scalettastrasse, the gates are told', 'Zentrale: Umleitung über die Scalettastrasse, die Schleusen sind informiert'],
  ['Crash! The delegation spills its coffee', 'Unfall! Die Delegation verschüttet ihren Kaffee'],
  ['Into your own convoy!', 'In die eigene Kolonne!'],
  ['Too fast at the gate: 30 km/h at the barrier', 'Zu schnell an der Schleuse: 30 km/h an der Schranke'],
  ['Gate open, the soldiers salute', 'Schleuse offen, die Soldaten grüssen'],
  ['Unannounced at the turn: the gates scramble', 'Unangemeldet abgebogen: Hektik an den Schleusen'],
  ['The road is shut: the Scalettastrasse is the way round', 'Die Strasse ist gesperrt: Der Weg führt über die Scalettastrasse'],
  ['The motorcade has lost you: the delegation arrives by bus.', 'Die Kolonne hat dich verloren: Die Delegation kommt mit dem Bus.'],
  ['Composure gone: the delegation asks for another driver.', 'Die Fassung ist dahin: Die Delegation verlangt einen anderen Fahrer.'],
  ['Gap', 'Abstand'],
  ['Composure', 'Fassung'],
  ['Schedule', 'Zeitplan'],
  ['Blue light', 'Blaulicht'],
  ['Radio', 'Funk'],
  ['Lead the anti-WEF march', 'Anti-WEF-Demo anführen'],
  ['The speeches are short, the tea is hot, and the liaison asks for a placard for the station wall. Nobody was hurt, nothing was broken, and the snow stayed white.', 'Die Reden sind kurz, der Tee ist heiss, und die Verbindungsperson bittet um ein Plakat für die Wand im Posten. Niemand wurde verletzt, nichts ging kaputt, und der Schnee blieb weiss.'],
  ['March down the Promenade', 'Die Promenade hinunter marschieren'],
  ['Talk to the police liaison', 'Mit der Polizei-Verbindungsperson reden'],
  ['On to the rally point', 'Weiter zum Kundgebungsplatz'],
  ['Hold the rally', 'Die Kundgebung halten'],
  ['The police liaison', 'Die Polizei-Verbindungsperson'],
  ['The police liaison wants a word', 'Die Polizei-Verbindungsperson möchte mit dir reden'],
  ['Back to the agreed route', 'Zurück auf die vereinbarte Route'],
  ['Stand on the rally point', 'Stell dich auf den Kundgebungsplatz'],
  ['Wait for the crowd', 'Warte auf die Menge'],
  ['Too fast: wait for the crowd', 'Zu schnell: Warte auf die Menge'],
  ['Space on the beat: call, and the crowd answers', 'Leertaste im Takt: Du rufst, die Menge antwortet'],
  ['Answer the liaison: 1, 2 or 3', 'Antworte der Verbindungsperson: 1, 2 oder 3'], ['Answer', 'Antworten'],
  ['Get ready …', 'Bereit machen …'],
  ['Perfect!', 'Perfekt!'],
  ['Good', 'Gut'],
  ['Off the beat', 'Aus dem Takt'],
  ['Marchers', 'Leute'],
  ['Morale', 'Stimmung'],
  ['Chant', 'Sprechchor'],
  ['Call', 'Rufen'],
  ['Stop and talk', 'Anhalten und reden'],
  ['Sit-in, in the snow', 'Sitzstreik im Schnee'],
  ['Turn back to the agreed route', 'Zurück auf die vereinbarte Route'],
  ['You have left the registered route, and the fence is that way. What now?', 'Du hast die bewilligte Route verlassen, und dort drüben ist der Zaun. Was nun?'],
  ['The crowd behind you wants to go on to the fence. The permit ends at the rally point. How do you answer?', 'Die Menge hinter dir will weiter bis zum Zaun. Die Bewilligung endet am Kundgebungsplatz. Was antwortest du?'],
  ['Liaison: off the registered route, please', 'Verbindungsperson: Bitte zurück auf die bewilligte Route'],
  ['Liaison: a word, please, the crowd wants to go on to the fence', 'Verbindungsperson: Kurz auf ein Wort, die Menge will weiter bis zum Zaun'],
  ['Liaison: thank you, carry on to the rally point', 'Verbindungsperson: Danke, weiter zum Kundgebungsplatz'],
  ['Everybody stops. Liaison: much obliged', 'Alle halten an. Verbindungsperson: Besten Dank'],
  ['A sit-in, in the snow. Somebody hands round tea', 'Ein Sitzstreik im Schnee. Jemand verteilt Tee'],
  ['Back to the agreed route. Liaison: very civil of you', 'Zurück auf die vereinbarte Route. Verbindungsperson: Sehr anständig von dir'],
  ['The sit-in made the evening news: more people come', 'Der Sitzstreik kam in die Abendnachrichten: Es kommen mehr Leute'],
  ['A bystander joins the march', 'Jemand vom Strassenrand schliesst sich an'],
  ['The chant falters: somebody goes for a hot chocolate', 'Der Sprechchor stockt: Jemand geht eine heisse Schokolade trinken'],
  ['Too fast: the crowd cannot keep up, and somebody stays behind', 'Zu schnell: Die Menge kommt nicht nach, jemand bleibt zurück'],
  ['Morale is low: people drift off', 'Die Stimmung ist schlecht: Leute gehen nach Hause'],
  ['The liaison politely folds up your permit: the march ends here, and everybody goes for a coffee.', 'Die Verbindungsperson faltet höflich deine Bewilligung zusammen: Der Umzug endet hier, und alle gehen einen Kaffee trinken.'],
  ['The march has melted away into the Konditorei. The cake is said to be excellent.', 'Der Umzug hat sich in die Konditorei verflüchtigt. Der Kuchen soll ausgezeichnet sein.'],
  ['What do we want?', 'Was wollen wir?'],
  ['Clean air!', 'Saubere Luft!'],
  ['When do we want it?', 'Wann wollen wir sie?'],
  ['Before the next ski season!', 'Vor der nächsten Skisaison!'],
  ['Whose town is this?', 'Wem gehört die Stadt?'],
  ['Davos for the Davosers!', 'Davos den Davosern!'],
  ['Fair taxes!', 'Gerechte Steuern!'],
  ['For everyone, even the fondue!', 'Für alle, sogar fürs Fondue!'],
  ['Snow for all!', 'Schnee für alle!'],
  ['Not just for helicopters!', 'Nicht nur für Helikopter!'],
  ['DAVOS FOR THE DAVOSERS', 'DAVOS DEN DAVOSERN'],
  ['FAIR TAXES', 'GERECHTE STEUERN'],
  ['CLIMATE NOW', 'KLIMA JETZT'],
  ['MORE FONDUE, FEWER HELICOPTERS', 'MEHR FONDUE, WENIGER HELIKOPTER'],
  ['The Pizza Heaven rush', 'Der Ansturm im Pizza Heaven'],
  ['The last box is at the door, and somebody tips in Rappen.', 'Die letzte Schachtel steht vor der Tür, und jemand gibt Trinkgeld in Rappen.'],
  ['Go into Pizza Heaven', 'Ins Pizza Heaven gehen'],
  ['Aprons on …', 'Schürzen an …'],
  ['Keys 1-8 or tap the toppings, in the ticket\'s order', 'Tasten 1–8 oder Zutaten antippen, in der Reihenfolge auf dem Bon'],
  ['Deliver to Eisstadion', 'Lieferung ans Eisstadion'],
  ['Deliver to Kongresszentrum', 'Lieferung ans Kongresszentrum'],
  ['Deliver to Hotel Seehof', 'Lieferung ans Hotel Seehof'],
  ['Deliver to Museumstrasse 2', 'Lieferung an die Museumstrasse 2'],
  ['Lift attendant at the Hauptertäli', 'Liftwart am Hauptertäli'],
  ['The lunch break: the lane is empty, the Ländler plays on.', 'Mittagspause: Die Spur ist leer, der Ländler spielt weiter.'],
  ['Go to the loading point', 'Zur Einstiegsstelle gehen'],
  ['Send them up (2 min)', 'Sie nach oben schicken (2 Min.)'],
  ['The lift is starting …', 'Der Lift läuft an …'],
  ['Space / tap: hand over the bar', 'Space / Tippen: Bügel übergeben'],
  ['Hand over!', 'Übergeben!'],
  ['Perfect! +2', 'Perfekt! +2'],
  ['Up they go +2', 'Und hinauf geht es +2'],
  ['Too early: whoops, down he goes!', 'Zu früh: huch, da fällt er!'],
  ['Too late: the bar got him!', 'Zu spät: der Bügel hat ihn erwischt!'],
  ['Empty bar!', 'Leerer Bügel!'],
  ['Nobody in place yet', 'Noch niemand an der Stelle'],
  ['Yellow', 'Gelb'],
  ['Red', 'Rot'],
  ['Violet', 'Violett'],
  ['Blue', 'Blau'],
  ['Green', 'Grün'],
  ['Waxing skis at Hofmänner', 'Skis wachsen bei Hofmänner'],
  ['Closing time at the bench: the whole shop smells of wax.', 'Feierabend an der Werkbank: Der ganze Laden riecht nach Wachs.'],
  ['Go into Sport Hofmänner', 'In Sport Hofmänner gehen'],
  ['Wax Langlaufski (2:30)', 'Langlaufski wachsen (2:30)'],
  ['The iron is heating up …', 'Das Bügeleisen heizt auf …'],
  ['read the board, pick the wax (1-5 or tap)', 'Tafel lesen, Wachs wählen (1–5 oder antippen)'],
  ['drag the iron, or hold → and keep it in the band', 'Bügeleisen ziehen oder → halten und im Band bleiben'],
  ['scrape, tip to tail: drag, or hold →', 'abziehen, von der Spitze bis zum Ende: ziehen oder → halten'],
  ['brush, tip to tail: drag, or hold →', 'bürsten, von der Spitze bis zum Ende: ziehen oder → halten'],
  ['Parking marshal at the Jakobshornbahn', 'Parkplatzeinweiser bei der Jakobshornbahn'],
  ['The lot is full, the first cabin is long gone: the marshal gets a coffee.', 'Der Parkplatz ist voll, die erste Gondel längst weg: Der Einweiser bekommt einen Kaffee.'],
  ['Take your place in the aisle', 'Position in der Gasse einnehmen'],
  ['Direct the cars (2 min)', 'Die Autos einweisen (2 Min.)'],
  ['The first cars are turning in …', 'Die ersten Autos biegen ein …'],
  ['← Left', '← Links'],
  ['↑ Straight', '↑ Geradeaus'],
  ['Right →', 'Rechts →'],
  ['Stop', 'Stopp'],
  ['Parked +100', 'Geparkt +100'],
  ['Crooked +40', 'Schräg +40'],
  ['Blocking the aisle! −80', 'Gasse blockiert! −80'],
  ['Mind the skiers! −40', 'Achtung, Skifahrer! −40'],
  ['Too late: he\'ll park crooked', 'Zu spät: Er parkt schräg'],
  ['Nothing free there!', 'Dort ist nichts frei!'],
  ['No sign from you: he does as he likes', 'Kein Zeichen von dir: Er macht, was er will'],
  ['Skiers about to cross!', 'Skifahrer wollen gleich queren!'],
  ['Skiers coming: hold the car!', 'Skifahrer kommen: Auto anhalten!'],
  ['Skiers crossing!', 'Skifahrer queren!'],
  ['Go into the BOX', 'In die BOX gehen'],
  ['Après-ski at the Bolgenschanze', 'Après-Ski in der Bolgenschanze'],
  ['The DJ hands you the mic and the whole hut sings: legend of the Schanze!', 'Der DJ gibt dir das Mikro und die ganze Hütte singt: Legende der Schanze!'],
  ['Go into the Bolgenschanze', 'In die Bolgenschanze gehen'],
  ['Jump on the beat', 'Im Takt springen'],
  ['The DJ is lining up the track …', 'Der DJ bereitet den Track vor …'],
  ['JUMP', 'SPRINGEN'],
  ['Space / tap JUMP on the beat', 'Space / SPRINGEN im Takt tippen'],
  ['Space / J / K or JUMP on the beat', 'Space / J / K oder SPRINGEN im Takt'],
  ['Get ready … the DJ counts in', 'Mach dich bereit … der DJ zählt ein'],
  ['Get ready … the drummer counts in', 'Mach dich bereit … der Drummer zählt ein'],
  ['PERFECT', 'PERFEKT'],
  ['GOOD', 'GUT'],
  ['MISS', 'DANEBEN'],
  ['OFF BEAT', 'NEBEN DEM TAKT'],
  ['Tilt', 'Neigung'], ['Auto rod', 'Automatische Stange'], ['GOAL!', 'TOR!'], ['Next', 'Nächste'],
  // the fun, bar, sport and golf missions' HUDs and key bars (js/missions-fun.js, js/missions-bars.js, js/missions-sport.js, js/missions-golf.js)
  ['SHOOT', 'SCHIESSEN'], ['La Onda scores', 'Tor für La Onda'],
  ['Goalie', 'Torhüter'], ['Defence', 'Verteidigung'], ['Midfield', 'Mittelfeld'], ['Attack', 'Sturm'],
  ['Rod up', 'Stange hoch'], ['Rod down', 'Stange runter'], ['slide the rod', 'Stange schieben'], ['pick a rod', 'Stange wählen'],
  ['Send cabin', 'Gondel losschicken'], ['Move', 'Verschieben'], ['Move right', 'Nach rechts'], ['Drop', 'Abwerfen'],
  ['Skier', 'Skifahrer'], ['Dog', 'Hund'], ['Couple', 'Paar'], ['Skier with skis', 'Skifahrer mit Ski'], ['Family with pram', 'Familie mit Kinderwagen'],
  ['Group', 'Gruppe'], ['Tourists with luggage', 'Touristen mit Gepäck'], ['The cabin is leaving …', 'Die Gondel fährt ab …'],
  ['Doors closed: depart', 'Türen zu: abfahren'], ['missed', 'verpasst'],
  ['aim, then strike in the green', 'zielen, dann im Grünen zuschlagen'], ['a station · the usual: the drink', 'eine Station · «wie immer»: das Getränk'],
  ['the station at work: stop in the green', 'die aktive Station: im Grünen stoppen'],
  ['Classic', 'Klassisch'], ['START · FINISH', 'START · ZIEL'], ['GO!', 'LOS!'],
  ['Power', 'Kraft'], ['Putt', 'Putten'], ['Overview', 'Übersicht'], ['In the ditch!', 'Im Graben!'],
  ['+1 stroke, back to where it was hit', '+1 Schlag, zurück an die Stelle des Schlags'], ['1 stroke', '1 Schlag'],
  ['The hill', 'Der Hügel'], ['The tube', 'Die Röhre'], ['The ramp', 'Die Rampe'], ['The loop', 'Der Looping'], ['The centre island', 'Die Mittelinsel'],
  ['The round island', 'Die runde Insel'], ['Two posts', 'Zwei Pfosten'], ['The angle', 'Der Winkel'], ['The bridge', 'Die Brücke'],
  ['Throw', 'Wurf'], ['BUST', 'ÜBERWORFEN'], ['Miss', 'Daneben'], ['game on', 'Spiel läuft'],
  ['Drop in: W', 'Einfahren: W'], ['Bail', 'Sturz'], ['Bail!', 'Sturz!'], ['Time!', 'Zeit!'],
  ['Cart', 'Golfwagen'],
  ['snow temperature', 'Schneetemperatur'],
  ['above', 'über'],
  ['below', 'unter'],
  ['to', 'bis'],
  ['pair no.', 'Paar Nr.'],
  ['too slow: burns', 'zu langsam: verbrennt'],
  ['even', 'gleichmässig'],
  ['too fast: no melt', 'zu schnell: schmilzt nicht'],
  ['iron', 'Bügeleisen'],
  ['ski', 'Ski'],
  ['Scrape', 'Abziehen'],
  ['Brush', 'Bürsten'],
  ['tip → tail', 'Spitze → Ende'],
  ['Which wax for this snow?', 'Welches Wachs für diesen Schnee?'],
  ['Wax', 'Wachs'],
  ['Iron', 'Bügeln'],
  // the resort jobs' controls in the register (js/missions-resort.js) and their hints
  ['tip', 'Spitze'], ['Hand over the bar', 'Bügel übergeben'], ['pick the wax', 'Wachs wählen'], ['Previous wax', 'Voriges Wachs'], ['Next wax', 'Nächstes Wachs'],
  ['Take this wax', 'Dieses Wachs nehmen'], ['move the tool', 'Werkzeug bewegen'], ['Tool back', 'Werkzeug zurück'], ['Tool on', 'Werkzeug vor'],
  ['of the wax off', 'des Wachses abgezogen'], ['brushed', 'gebürstet'],
  ['Wave left', 'Nach links winken'], ['Wave straight on', 'Geradeaus winken'], ['Wave right', 'Nach rechts winken'], ['Stop the car', 'Auto anhalten'],
  ['Skiers crossing: stop the car (↓ / Space)', 'Skifahrer queren: Auto anhalten (↓ / Space)'], ['Wave the car to free bays: ← / ↑ / →', 'Wink das Auto zu freien Plätzen: ← / ↑ / →'],
  // the Victoria's stations (js/missions-victoria.js, js/missions-data-victoria.js), the sunrise, the jetpack's landings, the waypoint
  ['Next chore', 'Nächste Arbeit'], ['pick a chore', 'Arbeit wählen'], ['scrub, in turns', 'abwechselnd putzen'],
  ['a burner: the ticket on, in the green the plate out', 'eine Platte: Bon drauf, im Grünen anrichten'], ['whites', 'Weisses'], ['colours', 'Buntes'],
  ['held: keep the sheet straight', 'gehalten: Leintuch gerade halten'],
  ['1-7 or tap: pick a chore · then A, D, A …: scrub', '1–7 oder antippen: Arbeit wählen · dann A, D, A …: putzen'],
  ['1-3 or tap: the ticket onto a burner · again in the green: plate it', '1–3 oder antippen: Bon auf eine Platte · nochmals im Grünen: anrichten'],
  ['A / ◀: whites · D / ▶: colours', 'A / ◀: Weisses · D / ▶: Buntes'], ['Hold A or D (◀ ▶): keep the sheet straight', 'A oder D (◀ ▶) halten: Leintuch gerade halten'],
  ['Stay on the summit and wait: the sun comes up over the ridges', 'Bleib auf dem Gipfel und warte: Die Sonne geht über den Gräten auf'],
  ['Over the pad: hold Q to sink and touch down', 'Über dem Landeplatz: Q halten zum Sinken und Aufsetzen'], ['Over the terrace: hold Q to sink and touch down', 'Über der Terrasse: Q halten zum Sinken und Aufsetzen'],
  ['Clear the waypoint', 'Wegpunkt löschen'],
  // the rope park in the Färich, hockey on the Seehofseeli (js/missions-data-outdoor.js)
  ['Rope park in the Färich', 'Seilpark im Färich'], ['Walk to the first tree', 'Zum ersten Baum gehen'], ['Up the ladder', 'Die Leiter hinauf'],
  ['Wobbly bridge', 'Wackelbrücke'], ['Balance beam', 'Balancierbalken'], ['Tyre traverse', 'Pneu-Traverse'], ['The wild bridge', 'Die wilde Brücke'], ['Zipline finale', 'Zipline zum Schluss'],
  ['Hold W to climb', 'W gedrückt halten zum Klettern'], ['Clip both carabiners first!', 'Zuerst beide Karabiner einhängen!'],
  ['Clipped: W, step off the deck', 'Eingehängt: W, von der Plattform abstossen'], ['Clipped: W, out onto the crossing', 'Eingehängt: W, hinaus auf die Querung'],
  ['Dangling in your harness: the guide winches you back', 'Du baumelst im Klettergurt: der Guide zieht dich zurück'],
  ['A/D: lean against the sway · W: walk on', 'A/D: gegen das Schwanken lehnen · W: weitergehen'], ['Space: clip · W: walk', 'Space: einhängen · W: gehen'],
  ['S: brake now!', 'S: jetzt bremsen!'], ['S: brake before the mattress', 'S: vor der Matte bremsen'],
  ['Harness off, helmet off, the knees still a little soft.', 'Gurt ab, Helm ab, die Knie noch ein wenig weich.'],
  ['A clean run: no fall, no carabiner forgotten', 'Ein sauberer Lauf: kein Sturz, kein Karabiner vergessen'],
  ['The guide: Carabiners! BOTH of them!  +8 s', 'Der Guide: Karabiner! BEIDE!  +8 s'],
  ['The guide: Do you want to explain that to your mother? Clip in!  +8 s', 'Der Guide: Willst du das deiner Mutter erklären? Einhängen!  +8 s'],
  ['The guide: Two carabiners. It is not a suggestion.  +8 s', 'Der Guide: Zwei Karabiner. Das ist kein Vorschlag.  +8 s'],
  ['Click: one carabiner', 'Klick: ein Karabiner'], ['Click: both clipped', 'Klick: beide eingehängt'], ['WHISTLE!', 'PFIFF!'],
  ['Whoops: hanging in your harness  +5 s', 'Hoppla: du hängst im Gurt  +5 s'], ['WHOOPS!', 'HOPPLA!'], ['The guide winches you back', 'Der Guide zieht dich zurück'],
  ['New deck: clip in again', 'Neue Plattform: wieder einhängen'], ['Off you go!', 'Und los!'], ['A soft landing', 'Eine weiche Landung'],
  ['Into the mattress at full speed  +3 s', 'Mit vollem Tempo in die Matte  +3 s'], ['OOF!', 'UFF!'], ['Balance', 'Gleichgewicht'], ['Clip', 'Einhängen'],
  ['Hockey on the Seehofseeli', 'Hockey auf dem Seehofseeli'], ['Skate to the centre spot', 'Zum Mittelpunkt laufen'], ['First to 5', 'Wer zuerst 5 hat'],
  ['Space: shoot or pass (hold: harder)', 'Space: schiessen oder passen (halten: härter)'], ['Space: call for the puck', 'Space: Puck verlangen'], ['Space: poke check', 'Space: Stockcheck'], ['Get to the puck', 'Hol dir den Puck'],
  ['pass / shoot (hold: harder) / poke', 'passen / schiessen (halten: härter) / stochern'], ['Shot', 'Schuss'], ['Poked off your stick', 'Dir vom Stock gestochert'],
  ['Body check: the puck is loose!', 'Bodycheck: Der Puck ist frei!'], ['Body check!', 'Bodycheck!'], ['He stood his ground', 'Er hält dagegen'], ['Intercepted', 'Abgefangen'],
  ['Saved by your keeper', 'Dein Goalie hält'], ['Saved!', 'Gehalten!'], ['Your goal, off the pass!', 'Dein Tor, nach dem Pass!'], ['Your assist!', 'Dein Assist!'], ['Your mate scores', 'Tor deines Mitspielers'],
  ['FACE-OFF', 'BULLY'], ['Puck stolen!', 'Puck erobert!'], ['Poked at nothing', 'Ins Leere gestochert'], ['Blocked by your team', 'Von deinem Team geblockt'], ['Blocked!', 'Geblockt!'],
  ['Next goal wins', 'Das nächste Tor entscheidet'], ['next goal wins', 'das nächste Tor entscheidet'], ['Locals score', 'Tor für die Einheimischen'], ['Your goal!', 'Dein Tor!'],
  ['Boots back on, jackets back on, and somebody knows a Glühwein at the Seehof.', 'Schuhe an, Jacken an, und jemand weiss von einem Glühwein im Seehof.'],
  // the eye test and the snow profile (js/missions-data-expert.js)
  ["Eye test at Meerkämper Optik", "Sehtest bei Meerkämper Optik"],
  ["Go into Meerkämper Optik", "Geh zu Meerkämper Optik hinein"],
  ["Test four customers (3:00)", "Vier Kunden testen (3:00)"],
  ["The first customer sits down …", "Die erste Kundin setzt sich …"],
  ["Closing time: everybody on the Promenade sees sharp, for now.", "Feierabend: Die ganze Promenade sieht scharf, vorerst."],
  ["Flip, listen, take the better lens. The same at ±0.25: that dial is done.", "Umklappen, zuhören, das bessere Glas nehmen. Bei ±0.25 gleich: Dieser Wert stimmt."],
  ["Hotelier", "Hotelière"],
  ["Farmer", "Bauer"],
  ["Ski instructor", "Skilehrer"],
  ["Teacher", "Lehrerin"],
  ["My old glasses are from the Spengler Cup of 1998.", "Meine alte Brille ist vom Spengler Cup 1998."],
  ["I only came because of the cow. She looked blurry.", "Ich komme nur wegen der Kuh. Sie sah verschwommen aus."],
  ["I see perfectly. Your chart is blurry.", "Ich sehe perfekt. Deine Tafel ist unscharf."],
  ["Everything has a shadow. Even the Seehorn.", "Alles hat einen Schatten. Sogar das Seehorn."],
  ["Number one.", "Nummer eins."],
  ["Number two.", "Nummer zwei."],
  ["About the same.", "Ungefähr gleich."],
  ["Both razor-sharp!", "Beide gestochen scharf!"],
  ["Hmm … one? Yes, one.", "Hmm … eins? Ja, eins."],
  ["Hmm … two? Yes, two.", "Hmm … zwei? Ja, zwei."],
  ["Me? Squinting? Never.", "Ich? Blinzeln? Niemals."],
  ["He is squinting again!", "Er kneift schon wieder die Augen zusammen!"],
  ["Caught him squinting!", "Beim Blinzeln erwischt!"],
  ["These eyes are open.", "Diese Augen sind offen."],
  ["Oh! The Seehorn has trees!", "Oh! Das Seehorn hat ja Bäume!"],
  ["Much better, thank you.", "Viel besser, danke."],
  ["Is the floor meant to slope?", "Soll der Boden so schief sein?"],
  ["Who moved the Promenade?", "Wer hat die Promenade verschoben?"],
  ["Flip to lens two", "Klapp auf Glas zwei"],
  ["Ask away.", "Frag nur."],
  ["Lens", "Glas"],
  ["pts", "Pkt."],
  ["Customer", "Kunde"],
  ["Sphere", "Sphäre"],
  ["Cylinder", "Zylinder"],
  ["Written", "Verschrieben"],
  ["Actual", "Tatsächlich"],
  ["Accuracy", "Genauigkeit"],
  ["Questions", "Fragen"],
  ["Speed", "Tempo"],
  ["Squint", "Blinzeln"],
  ["Flip", "Umklappen"],
  ["One or two?", "Eins oder zwei?"],
  ["Take lens 1", "Glas 1 nehmen"],
  ["Take lens 2", "Glas 2 nehmen"],
  ["Keep", "Behalten"],
  ["Eyes open, please!", "Augen auf, bitte!"],
  ["Write the prescription", "Rezept ausstellen"],
  // (the phoropter's keys in the key bar)
  ['sphere or cylinder', 'Sphäre oder Zylinder'], ['lens 1 or 2', 'Glas 1 oder 2'],
  ["Snow profile for the SLF", "Schneeprofil fürs SLF"],
  ["Fetch the kit at the SLF", "Hol die Ausrüstung beim SLF"],
  ["Up with the Parsennbahn", "Mit der Parsennbahn hinauf"],
  ["Up to the Weissfluhjoch …", "Hinauf aufs Weissfluhjoch …"],
  ["Go to the measuring field", "Geh zum Versuchsfeld"],
  ["Take the profile", "Nimm das Profil auf"],
  ["Unpacking the kit …", "Die Ausrüstung wird ausgepackt …"],
  ["The profile is on its way to the forecasters in Davos Dorf.", "Das Profil ist unterwegs zu den Lawinenwarnern in Davos Dorf."],
  ["Up with the Parsennbahn to the Weissfluhjoch, then on skis to the measuring field …", "Mit der Parsennbahn aufs Weissfluhjoch, dann auf Ski zum Versuchsfeld …"],
  ["Dig down to the ground", "Bis zum Boden graben"],
  ["Test the layers", "Die Schichten prüfen"],
  ["Take the temperatures", "Die Temperaturen messen"],
  ["Compression test", "Kompressionstest"],
  ["Where did it break?", "Wo ist es gebrochen?"],
  ["where did it break?", "wo ist es gebrochen?"],
  ["Set the danger level", "Die Gefahrenstufe festlegen"],
  ["The sheet against the truth", "Das Blatt gegen die Wahrheit"],
  ["Fist", "Faust"],
  ["Four fingers", "Vier Finger"],
  ["One finger", "Ein Finger"],
  ["Pencil", "Bleistift"],
  ["Knife", "Messer"],
  ["Fresh snow", "Neuschnee"],
  ["Decomposing", "Filz"],
  ["Rounded", "Rundkörner"],
  ["Faceted", "Kantige Körner"],
  ["Depth hoar", "Becherkristalle"],
  ["Melt-freeze", "Schmelzformen"],
  ["Low", "Gering"],
  ["Moderate", "Mässig"],
  ["Considerable", "Erheblich"],
  ["High", "Gross"],
  ["Very high", "Sehr gross"],
  ["Hold to dig: right down to the ground.", "Halten zum Graben: bis ganz auf den Boden."],
  ["Push into the wall, softest first. Write down the largest that still goes in.", "In die Wand drücken, das Grösste zuerst. Schreib das Grösste auf, das noch hineingeht."],
  ["What does the loupe show? Pick the grain.", "Was zeigt die Lupe? Wähl die Kornform."],
  ["Hold the thermometer in the wall until the reading stops moving, then let go.", "Halt das Thermometer in die Wand, bis der Wert stillsteht, dann loslassen."],
  ["Tap the shovel on the column: ten from the wrist, ten from the elbow, ten from the shoulder.", "Klopf auf die Schaufel über der Säule: zehnmal aus dem Handgelenk, zehnmal aus dem Ellbogen, zehnmal aus der Schulter."],
  ["It broke! In which layer?", "Gebrochen! In welcher Schicht?"],
  ["Which danger level does the profile speak for?", "Für welche Gefahrenstufe spricht das Profil?"],
  ["Your sheet against the truth: dashed is what was really there.", "Dein Blatt gegen die Wahrheit: Gestrichelt ist, was wirklich da war."],
  ["Snow profile", "Schneeprofil"],
  ["Grain", "Korn"],
  ["Hard", "Härte"],
  ["The pit", "Die Grube"],
  ["Hold to dig", "Halten zum Graben"],
  ["Layer", "Schicht"],
  ["hand test", "Handtest"],
  ["goes in", "geht hinein"],
  ["stopped", "gestoppt"],
  ["Write down", "Aufschreiben"],
  ["Try a tool first", "Zuerst etwas ausprobieren"],
  ["grain under the loupe", "Korn unter der Lupe"],
  ["Thermometer", "Thermometer"],
  ["Reading … let go when it settles", "Messung … loslassen, wenn der Wert steht"],
  ["Hold it in the wall", "In die Wand halten"],
  ["from the wrist", "aus dem Handgelenk"],
  ["from the elbow", "aus dem Ellbogen"],
  ["from the shoulder", "aus der Schulter"],
  ["Tap!", "Klopfen!"],
  ["Crack!", "Knack!"],
  ["Breaks from the wrist: high. From the elbow: considerable. From the shoulder: moderate. No break: low. 30 cm of fresh snow: one level more.", "Bruch aus dem Handgelenk: gross. Aus dem Ellbogen: erheblich. Aus der Schulter: mässig. Kein Bruch: gering. 30 cm Neuschnee: eine Stufe mehr."],
  ["No break: CTN", "Kein Bruch: CTN"],
  ["SLF bulletin", "SLF-Bulletin"],
  // (where the pit comes from: js/missions-data-expert.js slfNote; the numbered lines are in translate() below)
  ["Data: SLF", "Daten: SLF"],
  ["No SLF data today: a training profile", "Heute keine SLF-Daten: ein Übungsprofil"],
  ["SLF: no fresh reading from the Weissfluhjoch: a training profile", "SLF: kein frischer Messwert vom Weissfluhjoch: ein Übungsprofil"],
  ["Hardness", "Härte"],
  ["Temperature", "Temperatur"],
  ["Weak layer", "Schwachschicht"],
  ["Danger level", "Gefahrenstufe"],
  ["Time", "Zeit"],
  ["yours", "deine"],
  ["profile", "Profil"],
  ["fresh snow", "Neuschnee"],
  ["One pit is only one clue: the real bulletin weighs many profiles, the weather and the observers.", "Eine Grube ist nur ein Hinweis: Das echte Bulletin wägt viele Profile, das Wetter und die Beobachter ab."],
  ["Send it to the forecasters", "An die Lawinenwarner schicken"],
  // (the profile's keys in the key bar)
  ['a hand test', 'ein Handtest'], ['the grain shape', 'die Kornform'], ['the weak layer', 'die Schwachschicht'], ['the danger level', 'die Gefahrenstufe'],
  // the rural missions (js/missions-data-rural.js)
  ['Quad ride from Heldstab', 'Quadfahrt ab Heldstab'],
  ['Through Davos Dorf to the Bedraweg', 'Durch Davos Dorf zum Bedraweg'],
  ['Round the off-road course', 'Rund um den Geländeparcours'],
  ['Back to the Heldstab yard', 'Zurück auf den Heldstab-Platz'],
  ['Too slow: Heldstab wants the quad back before closing time.', 'Zu langsam: Heldstab will das Quad vor Feierabend zurück.'],
  ['Back onto the quad', 'Zurück aufs Quad'],
  ['Finish', 'Ziel'],
  ['In the air!', 'In der Luft!'],
  ['Mud: ease off, the quad slides', 'Schlamm: Gas weg, das Quad rutscht'],
  ['Old snow: hardly any grip', 'Altschnee: kaum Grip'],
  ['Back in the Heldstab yard, mud up to the ears. They hose the quad down without a word and ask if you would like to see the invoice for a new one.', 'Zurück auf dem Heldstab-Platz, Dreck bis über die Ohren. Sie spritzen das Quad wortlos ab und fragen, ob du die Rechnung für ein neues sehen möchtest.'],
  ['Green waste to the biogas plant', 'Bioabfall zur Biogasanlage'],
  ['Collect the barrels at the hotels', 'Fässer bei den Hotels einsammeln'],
  ['Green waste round', 'Bioabfall-Sammlung'],
  ['Back to the way: the Dischmastrasse to the Duchli Ranch', 'Zurück auf den Weg: über die Dischmastrasse zur Duchli Ranch'],
  ['Out along the Dischmastrasse: it is cleared in winter', 'Hinaus über die Dischmastrasse: Sie wird im Winter geräumt'],
  ["Through the ranch's yard and back along the track to the hopper", 'Durch den Hof der Ranch und auf dem Feldweg zurück zum Annahmebunker'],
  ['Unload at the biogas plant', 'Bei der Biogasanlage abladen'],
  ['Open transporter', 'Offener Transporter'],
  ['Biogas plant', 'Biogasanlage'],
  ['Load', 'Ladung'],
  ['Smell', 'Gestank'],
  ['Reject', 'Ablehnen'],
  ['Plastic in the batch: it is spoiled', 'Plastik in der Ladung: Sie ist verdorben'],
  ['Stop with the load bed beside the barrel. Plastic in it? Reject!', 'Mit der Ladefläche neben dem Fass anhalten. Plastik drin? Stehen lassen!'],
  ['Stop with the load bed beside the hopper', 'Mit der Ladefläche neben dem Annahmebunker anhalten'],
  ['Stand still while the barrels are tipped', 'Stehen bleiben, während die Fässer gekippt werden'],
  ['Back into the truck', 'Zurück in den Wagen'],
  ['Stop with the load bed beside a barrel first', 'Zuerst mit der Ladefläche neben einem Fass anhalten'],
  ['Plastic! The barrel stays behind', 'Plastik! Das Fass bleibt stehen'],
  ['Plastic in the load! The batch is spoiled', 'Plastik in der Ladung! Die ganze Fuhre ist verdorben'],
  ['The flies have found you', 'Die Fliegen haben dich gefunden'],
  ['Cyclists overtake you holding their noses', 'Velofahrer überholen dich mit zugehaltener Nase'],
  ['Even the cows look the other way', 'Sogar die Kühe schauen weg'],
  ['The barrels are overflowing and the wasps have taken over the village: too slow.', 'Die Fässer quellen über und die Wespen haben das Dorf übernommen: zu langsam.'],
  ['The load has started to ferment on its own: too slow.', 'Die Ladung gärt schon von selbst: zu langsam.'],
  ["The hopper swallows the hotels' kitchen waste, the digester burps contentedly. Electricity and district heat by Thursday, and the flies stay at the plant.", 'Der Bunker schluckt die Küchenabfälle der Hotels, der Fermenter rülpst zufrieden. Bis Donnerstag gibt das Strom und Fernwärme, und die Fliegen bleiben bei der Anlage.'],
  ["Batch spoiled: the plastic went into the digester's hopper", 'Fuhre verdorben: Das Plastik ist im Annahmebunker gelandet'],
  ["A clean load from the hotels' kitchens: the plant manager nods", 'Eine saubere Ladung aus den Hotelküchen: Der Anlagenleiter nickt'],
  // the local missions' games and their key bar (js/missions-local.js, js/missions-data-local.js), the Silberberg's and
  // the gastro rooms' key bar (js/missions-mine.js, js/missions-gastro.js)
  ['bars', 'Bars'], ['crates on the roof', 'Kisten auf dem Dach'], ['carrying a crate', 'du trägst eine Kiste'],
  ['Take a crate from the back of the van', 'Nimm hinten im Bus eine Kiste'], ['Get on the bike (F) in front of the bakery', 'Steig vor der Bäckerei aufs Velo (F)'], ['F: get on the bike', 'F: aufs Velo'],
  ['roll the dough down', 'den Teig nach unten rollen'], ['or tap steadily', 'oder gleichmässig tippen'], ['roll down', 'nach unten rollen'], ['fast', 'schnell'], ['slow', 'langsam'],
  ['drag down over the dough at an even pace', 'zieh gleichmässig über den Teig nach unten'],
  ['Perfect Gipfeli!', 'Perfektes Gipfeli!'], ['Nice and even', 'Schön gleichmässig'], ['Torn: too fast', 'Gerissen: zu schnell'], ['Too slow: it got sticky', 'Zu langsam: Es klebt'], ['Too fast: a bit loose', 'Zu schnell: etwas locker'],
  ['scrape a plate', 'einen Teller abschaben'], ['or across the cheese', 'oder über den Käse wischen'], ['Swipe', 'Wischen'], ['plates', 'Teller'],
  ['scrape when the cheese matches the order: swipe across it, or Space', 'schaben, wenn der Käse zur Bestellung passt: darüber wischen oder Leertaste'],
  ['raw', 'roh'], ['soft', 'weich'], ['normal', 'normal'], ['between', 'dazwischen'], ['crispy', 'knusprig'], ['scorched', 'angebrannt'], ['burnt', 'verbrannt'], ['melt', 'Schmelze'],
  ['Nobody waiting', 'Niemand wartet'], ['Burnt!', 'Verbrannt!'], ['Just right!', 'Genau richtig!'], ['Too runny', 'Zu flüssig'], ['Wanted extra crispy', 'Extra knusprig bestellt'], ['Wanted normal', 'Normal bestellt'],
  ['Orders', 'Bestellungen'], ['Extra crispy', 'Extra knusprig'], ['Normal', 'Normal'], ['Waiting for guests …', 'Warten auf Gäste …'],
  ['scope', 'Zielfernrohr'], ['Scope', 'Zielfernrohr'], ['Breath', 'Atem'], ['zoom', 'zoomen'], ['Wheel', 'Mausrad'], ['Right click', 'Rechtsklick'], ['hold: hold your breath', 'halten: Atem anhalten'],
  ['fire', 'schiessen'], ['lower the scope', 'Zielfernrohr absetzen'], ['The herd bolts!', 'Die Herde flieht!'], ['horns', 'Hörner'], ['may be taken', 'darf erlegt werden'], ['protected', 'geschützt'],
  ['vitals', 'Kammer'], ['wind', 'Wind'], ['Wind', 'Wind'], ['round', 'Schuss'], ['rounds', 'Schuss'], ['holding breath', 'Atem angehalten'], ['out of breath', 'ausser Atem'], ['herd', 'Herde'],
  ['unease', 'Unruhe'], ['legal: old bucks', 'erlaubt: alte Böcke'], ['kid', 'Kitz'], ['nanny (female)', 'Geiss (weiblich)'], ['young buck', 'junger Bock'], ['old buck', 'alter Bock'],
  ['Hold out a nut', 'Nuss hinhalten'], ['Nut', 'Nuss'], ['streak', 'Serie'], ['Scared it away!', 'Verscheucht!'], ['fed', 'gefüttert'],
  ['holding out a nut: stand still', 'du hältst eine Nuss hin: still stehen'], ['hold E to hold out a nut', 'E halten: eine Nuss hinhalten'], ['Stand still, hold E (Nut)', 'Still stehen, E halten (Nuss)'],
  ['Back to the lakeside path', 'Zurück auf den Seeweg'],
  ['Hit the ball', 'Ball schlagen'], ['Hit', 'Schlagen'], ['run to the ball', 'zum Ball laufen'], ['held at the swing: aim left / right', 'beim Schlag gehalten: links / rechts zielen'],
  ['Your point', 'Dein Punkt'], ["Coach's point", 'Punkt für den Trainer'], ['net', 'Netz'], ['out', 'Aus'], ['ace', 'Ass'], ['winner', 'Winner'], ['double fault', 'Doppelfehler'], ['Fault', 'Fehler'],
  ['Space at the top!', 'Leertaste am höchsten Punkt!'], ['your serve: Space', 'dein Aufschlag: Leertaste'], ['coach serves', 'Trainer schlägt auf'], ['Coach', 'Trainer'], ['second serve', 'zweiter Aufschlag'],
  ['lean into the bends', 'in die Kurven lehnen'], ['or the arrows', 'oder die Pfeiltasten'], ['get ready: A / D lean into the bends', 'mach dich bereit: A / D in die Kurven lehnen'],
  ['Splash!', 'Platsch!'], ['on the slide', 'auf der Rutsche'], ['straight', 'gerade'], ['too high: braking!', 'zu hoch: bremst!'], ['too low: bumpy', 'zu tief: holprig'], ['ideal line', 'Ideallinie'],
  ['paint on the canvas', 'auf die Leinwand malen'], ['colour, brush, Template, Done', 'Farbe, Pinsel, Vorlage, Fertig'], ["paint the view in Kirchner's colours", 'mal die Aussicht in Kirchners Farben'],
  ['"Template" shows the posterised view', '«Vorlage» zeigt die vereinfachte Aussicht'], ['(a sketch: the view could not be read)', '(eine Skizze: Die Aussicht liess sich nicht lesen)'],
  ['The view', 'Die Aussicht'], ['The view (your motif)', 'Die Aussicht (dein Motiv)'], ['Your painting', 'Dein Bild'],
  ['Ultramarine', 'Ultramarin'], ['Cobalt', 'Kobaltblau'], ['Emerald', 'Smaragdgrün'], ['Vermilion', 'Zinnoberrot'], ['Pink', 'Rosa'], ['Black', 'Schwarz'],
  ['answer Jöri', 'Jöri antworten'], ['hold at a lit vein: strike', 'an einer leuchtenden Ader halten: zuschlagen'],
  ['the red button', 'der rote Knopf'], ['the red button (held: keep the key down)', 'der rote Knopf (Halten: Taste gedrückt halten)'], ['the toppings, in the order of the ticket', 'die Beläge, in der Reihenfolge des Bons'],
  // snowshoes on the Junkerboden, the plaster room of the Spital (js/missions-data-care.js)
  ['Snowshoeing on the Junkerboden','Schneeschuhlaufen am Junkerboden'],
  ['Back on the Junkerbodenstrasse: your track up the slope is the only one in the snow.', 'Zurück auf der Junkerbodenstrasse: Deine Spur am Hang ist die einzige im Schnee.'],
  ['Over the Junkerboden', 'Über den Junkerboden'],
  ['To the foot of the slope', 'Zum Fuss des Hangs'],
  ['Up the slope', 'Den Hang hinauf'],
  ['Round the Wildruhezone to the bench', 'Um die Wildruhezone zum Bänkli'],
  ['To the Junkerbodenstrasse', 'Zur Junkerbodenstrasse'],
  ['Catching your breath: Frauenkirch on the left, Davos Platz up the valley', 'Verschnaufen: links Frauenkirch, talaufwärts Davos Platz'],
  ['You are in the Wildruhezone: get out!', 'Du bist in der Wildruhezone: Raus da!'],
  ['Out of breath: stop for a moment', 'Ausser Atem: Bleib kurz stehen'],
  ['Stamina', 'Kraft'],
  ['Rhythm', 'Rhythmus'],
  ['Step', 'Schritt'],
  ['Off the beat: stumble', 'Aus dem Takt: Stolperer'],
  ['Flag!', 'Fähnli!'],
  ['Wildruhezone! The grouse need their peace', 'Wildruhezone! Die Birkhühner brauchen ihre Ruhe'],
  ['A grouse flies up!', 'Ein Birkhuhn fliegt auf!'],
  ['The view: Frauenkirch on the left, Davos Platz up the valley, the Strela above it', 'Die Aussicht: links Frauenkirch, talaufwärts Davos Platz, darüber die Strela'],
  ['on the line', 'auf der Spur'],
  ['out of breath', 'ausser Atem'],
  ['Winter home of the grouse', 'Wintereinstand der Birkhühner'],
  ['pts', 'Pkt.'],
  ['A plaster cast at the Spital', 'Bein gipsen im Spital'],
  ['Three skiers in neat white casts, three signatures, and the Rega is already on its way back with the next one.', 'Drei Skifahrer in sauberen weissen Gipsen, drei Unterschriften, und die Rega ist schon mit dem nächsten unterwegs.'],
  ['Go into the Spital Davos', 'Geh ins Spital Davos'],
  ['Plaster three legs', 'Drei Beine gipsen'],
  ['Mixing the plaster …', 'Der Gips wird angerührt …'],
  ['Patient', 'Patient'],
  ['read the X-ray: which leg, how long a cast (1, 2 or tap)', 'Röntgenbild lesen: welches Bein, wie langer Gips (1, 2 oder antippen)'],
  ['set the angle: A/D or drag, then Space', 'Winkel einstellen: A/D oder ziehen, dann Space'],
  ['pad with cotton wool: drag, or hold D', 'mit Watte polstern: ziehen oder D halten'],
  ['hold the bandage in the bucket: hold Space, let go in the green', 'Binde in den Kessel: Space halten, im Grünen loslassen'],
  ['wrap in even turns: up with D, back with A, or drag', 'gleichmässig wickeln: hinauf mit D, zurück mit A, oder ziehen'],
  ['smooth it before it sets: rub up and down, or hold D', 'glätten, bevor er abbindet: auf und ab streichen oder D halten'],
  ['sign the cast: draw, or Space', 'Gips unterschreiben: zeichnen oder Space'],
  ['X-ray', 'Röntgen'],
  ['Angle', 'Winkel'],
  ['Padding', 'Polstern'],
  ['Bucket', 'Kessel'],
  ['Wrap', 'Wickeln'],
  ['Smooth', 'Glätten'],
  ['Sign', 'Unterschreiben'],
  ['That is the healthy leg!', 'Das ist das gesunde Bein!'],
  ['Wrong length: look where the break is', 'Falsche Länge: Schau, wo der Bruch ist'],
  ['Just right', 'Genau richtig'],
  ['Too soggy', 'Zu nass'],
  ['Still dry', 'Noch trocken'],
  ['The plaster has set', 'Der Gips ist hart'],
  ['Smooth as a groomed piste', 'Glatt wie eine frisch präparierte Piste'],
  ['By the ankle: short cast. Up by the knee: long cast.', 'Beim Knöchel: kurzer Gips. Oben beim Knie: langer Gips.'],
  ['Short cast', 'Kurzer Gips'],
  ['Long cast', 'Langer Gips'],
  ['Left leg', 'Linkes Bein'],
  ['Right leg', 'Rechtes Bein'],
  ['Knee', 'Knie'],
  ['Ankle', 'Knöchel'],
  ['green is right', 'Grün stimmt'],
  ['Hold it here', 'So halten'],
  ['dry', 'trocken'],
  ['just right', 'genau richtig'],
  ['soggy', 'zu nass'],
  ['cotton wool', 'Watte'],
  ['too slow: lumps', 'zu langsam: Klumpen'],
  ['too fast: gaps', 'zu schnell: Lücken'],
  ['Up the leg', 'Das Bein hinauf'],
  ['Back down', 'Wieder hinunter'],
  ['the plaster sets', 'der Gips bindet ab'],
  ['Signed', 'Unterschrieben'],
  // (the plaster table's keys in the key bar)
  ['the leg, then the length', 'erst das Bein, dann die Länge'], ['held: the bandage in the water', 'gehalten: die Binde im Wasser'],
  ['the hand along the leg', 'die Hand dem Bein entlang'], ["the foot's angle", 'der Winkel des Fusses'], ['done', 'fertig'],
  ['gaps', 'Lücken'],
  ['lumps', 'Klumpen'],
  ['by Rega from', 'mit der Rega von'],
  ['in the room', 'im Raum'],
  ['the Parsenn, red run', 'der Parsenn, rote Piste'],
  ['the Jakobshorn, a mogul', 'dem Jakobshorn, Buckelpiste'],
  ['the Pischa, the beginners’ slope', 'der Pischa, Anfängerhang'],
  ['The Rega pilot says hello. Lovely view from up there, by the way.', 'Der Rega-Pilot lässt grüssen. Schöne Aussicht von da oben, übrigens.'],
  ['Will it match my ski suit? No? Then sign it nicely.', 'Passt das zu meinem Skianzug? Nein? Dann unterschreib wenigstens schön.'],
  ['It was the snow’s fault. Write that on the cast.', 'Der Schnee war schuld. Schreib das auf den Gips.'],
  // the snow plough over the Wolfgang (js/missions-data-plough.js, js/missions-plough.js)
  ['Snow plough over the Wolfgang', 'Schneepflug über den Wolfgang'],
  ['Five in the morning, and it has snowed twenty centimetres since midnight. The Kanton\'s plough lorry comes out of the Seegalerie by the Davosersee: clear the Prättigauerstrasse up to the Wolfgang Passhöhe (1631 m) on the right lane, turn at the pass and clear the other lane back down to the gallery, before the first post bus. The blade sweeps 3.6 m and throws the snow off its trailing end into a wall: V swings it to the other side, F lifts and lowers it. Mind the snow poles on the verges, the oncoming traffic, the houses by the road (below 30 km/h there, or the snow lands on the pavement), the joints of the Totalpbach bridge and the side roads, whose mouths the wall must not bury.', 'Fünf Uhr früh, und seit Mitternacht hat es zwanzig Zentimeter geschneit. Der Pfluglastwagen des Kantons kommt aus der Seegalerie am Davosersee: Räume die Prättigauerstrasse auf der rechten Spur hinauf bis zur Wolfgang-Passhöhe (1631 m), wende auf dem Pass und räume die Gegenspur zurück hinunter bis zur Galerie, bevor das erste Postauto kommt. Die Pflugschar räumt 3,6 m breit und wirft den Schnee an ihrem hinteren Ende zu einem Wall auf: V schwenkt sie auf die andere Seite, F hebt und senkt sie. Achte auf die Schneestangen am Strassenrand, den Gegenverkehr, die Häuser an der Strasse (dort unter 30 km/h, sonst landet der Schnee auf dem Trottoir), die Fugen der Totalpbachbrücke und die Seitenstrassen, deren Einmündungen der Wall nicht zuschütten darf.'],
  ['Clear the lane up to the Wolfgang Passhöhe', 'Räume die Spur hinauf zur Wolfgang-Passhöhe'],
  ['Turn at the pass, clear the other lane back down', 'Wende auf dem Pass, räume die Gegenspur hinunter'],
  ['The Prättigauerstrasse is black from the Davosersee to the Wolfgang, the walls stand along the verges, and the first post bus to Klosters comes over the pass on time.', 'Die Prättigauerstrasse ist vom Davosersee bis zum Wolfgang schwarz, die Wälle stehen am Strassenrand, und das erste Postauto nach Klosters kommt pünktlich über den Pass.'],
  ['The morning traffic is stuck in the snow on the Wolfgang: too slow.', 'Der Morgenverkehr steckt am Wolfgang im Schnee fest: zu langsam.'],
  ['Back into the plough', 'Zurück in den Schneepflug'],
  ['You are throwing the snow onto the road: V swings the blade', 'Du wirfst den Schnee auf die Fahrbahn: V schwenkt die Pflugschar'],
  ['Houses by the road: below 30 km/h, or the snow flies onto the pavement', 'Häuser an der Strasse: unter 30 km/h, sonst fliegt der Schnee aufs Trottoir'],
  ['Bridge joints ahead: F lifts the blade (or crawl over them)', 'Brückenfugen voraus: F hebt die Pflugschar (oder im Schritttempo darüber)'],
  ['The blade is up: F lowers it', 'Die Pflugschar ist oben: F senkt sie'],
  ['Keep to the right lane: the blade clears 3.6 m', 'Bleib auf der rechten Spur: Die Pflugschar räumt 3,6 m'],
  ['Keep to the right lane on the way down', 'Bleib auch hinunter auf der rechten Spur'],
  ['Too much snow left on the lane: go back and clear it', 'Zu viel Schnee auf der Spur geblieben: zurück und nachräumen'],
  ['Snow thrown back onto the lane you cleared: it needs clearing again', 'Schnee auf die geräumte Spur zurückgeworfen: Sie muss nochmals geräumt werden'],
  ['Turn round: the lane down is on the other side', 'Wenden: Die Spur hinunter ist auf der anderen Seite'],
  ['The blade hit the bridge joint!', 'Die Pflugschar ist an der Brückenfuge angeschlagen!'],
  ['Snow pole knocked down! +3 s', 'Schneestange umgefahren! +3 s'],
  ['You hit a car! +10 s', 'Auto angefahren! +10 s'],
  ['Swing the blade', 'Pflugschar schwenken'], ['Blade side', 'Pflugseite'], ['Lift the blade', 'Pflugschar heben'],
  ['Snow plough', 'Schneepflug'],
  ['A clean run: no penalties', 'Sauber gefahren: keine Strafzeit'],
  // the medicine round by cargo bike (js/missions-data-pharmacy.js, js/missions-pharmacy.js)
  ['Medicine round by cargo bike', 'Medikamente mit dem Cargovelo'],
  ['The morning round of the Amavita Apotheke Flüela at the Bahnhofstrasse in Davos Dorf: six parcels in the crate of the yellow cargo bike, for six addresses round the village. The insulin in the cool box goes first, it stays cold for 1:30 (+45 s if it gets warm). Two parcels hold glass: take the kerbs slowly and do not crash, or they break (+30 s each). Stop at each door to hand a parcel over, then ride back to the pharmacy.', 'Die Morgenrunde der Amavita Apotheke Flüela an der Bahnhofstrasse in Davos Dorf: sechs Pakete in der Kiste des gelben Cargovelos, für sechs Adressen im Dorf. Das Insulin in der Kühlbox kommt zuerst, es bleibt 1:30 kalt (+45 s, wenn es warm wird). Zwei Pakete enthalten Glas: Nimm die Randsteine langsam und bau keinen Unfall, sonst gehen sie kaputt (+30 s pro Paket). Halte an jeder Tür an, um ein Paket zu übergeben, und fahr dann zurück zur Apotheke.'],
  ['The crate is empty and the cargo bike back at the Bahnhofstrasse. Six homes in Davos Dorf have their medicine.', 'Die Kiste ist leer und das Cargovelo zurück an der Bahnhofstrasse. Sechs Haushalte in Davos Dorf haben ihre Medikamente.'],
  ['The insulin to Mühlestrasse 10', 'Das Insulin an die Mühlestrasse 10'], ['Deliver the other parcels', 'Die übrigen Pakete ausliefern'], ['Back to the pharmacy', 'Zurück zur Apotheke'],
  ['Back onto the cargo bike', 'Zurück aufs Cargovelo'], ['Stop at the door to hand the parcel over', 'An der Tür anhalten: Paket übergeben'],
  ['Glass aboard: slow down over kerbs', 'Glas an Bord: über Randsteine langsam'], ['Stop in front of the pharmacy', 'Vor der Apotheke anhalten'],
  ['The insulin is warm: +45 s', 'Das Insulin ist warm: +45 s'],
  ['Insulin (cool box)', 'Insulin (Kühlbox)'], ['Blood pressure tablets', 'Blutdrucktabletten'], ['Asthma inhaler', 'Asthmaspray'],
  ['Eye drops (glass)', 'Augentropfen (Glas)'], ['Wound dressings', 'Wundverbände'], ['Cough syrup (glass)', 'Hustensirup (Glas)'],
  // the jetpack demo of the WEF week (js/missions-data-jetpack.js, js/missions-jetpack.js)
  ['Jetpack demo: from the Kongress to the Schatzalp', 'Jetpack-Demo: vom Kongress auf die Schatzalp'], ['You touch down between the deck chairs of the Magic Mountain. The investors spill their champagne, the start-up has its funding round before the steam has cleared, and the test pilot, still at the Wolfgang, is out of a job. It is yours now.', 'Du setzt zwischen den Liegestühlen des Zauberbergs auf. Die Investoren verschütten ihren Champagner, das Start-up hat seine Finanzierungsrunde, bevor sich der Dampf verzogen hat, und der Testpilot, immer noch am Wolfgang, ist seinen Job los. Er gehört jetzt dir.'],
  ['Fly the gates over the town', 'Die Tore über dem Ort durchfliegen'], ['Land at the pit crew for a full tank', 'Bei der Boxencrew landen und volltanken'], ['Climb along the Schatzalpbahn', 'Der Schatzalpbahn entlang hinaufsteigen'],
  ['Land on the terrace of the Berghotel Schatzalp', 'Auf der Terrasse des Berghotels Schatzalp landen'], ['Space: lift off', 'Leertaste: abheben'], ['The tank is nearly dry!', 'Der Tank ist fast leer!'],
  ['Not on the pad: Space, and hop over', 'Nicht auf dem Platz: Leertaste, und hinüberhüpfen'], ['Not on the terrace: Space, and hop over', 'Nicht auf der Terrasse: Leertaste, und hinüberhüpfen'],
  ['The tank is dry: walk over to the pit crew', 'Der Tank ist leer: zu Fuss zur Boxencrew'], ['The tank is dry: walk onto the terrace', 'Der Tank ist leer: zu Fuss auf die Terrasse'],
  ['Slow down for the landing: S', 'Für die Landung abbremsen: S'], ['The tank ran dry in the air and the jetpack came down like a stone. The investors look away.', 'Der Tank war in der Luft leer, und das Jetpack fiel wie ein Stein. Die Investoren schauen weg.'],
  ['The tank is dry, and the pit crew is somewhere else. The demo ends on foot.', 'Der Tank ist leer, und die Boxencrew steht woanders. Die Demo endet zu Fuss.'], ['Too fast: a tumble! +10 s', 'Zu schnell: Purzelbaum! +10 s'],
  ['A wall! +3 s', 'Eine Wand! +3 s'], ['Tank full: go!', 'Tank voll: los!'], ['The tank is dry!', 'Der Tank ist leer!'], ['Jetpack', 'Jetpack'], ['Tank', 'Tank'], ['Gates', 'Tore'], ['Penalty', 'Strafzeit'],
  ['Refuelling', 'Tanken'], ['Pit crew', 'Boxencrew'], ['Stay on the pad: the crew fills the tank', 'Bleib auf dem Landeplatz: Die Crew füllt den Tank'],
  ['Follow the green column of light to the pit crew', 'Folge der grünen Lichtsäule zur Boxencrew'],
  ['Sink', 'Sinken'], ['sink', 'sinken'], ['climb', 'steigen'], ['forward', 'vorwärts'], ['turn', 'drehen'], ['the spire of St. Johann', 'Kirchturm St. Johann'], ['Schatzalpbahn, the lower section', 'Schatzalpbahn, unterer Abschnitt'],
  ['Schatzalpbahn, the passing loop', 'Schatzalpbahn, Ausweiche'], ['Schatzalpbahn, below the hotel', 'Schatzalpbahn, unter dem Hotel'],
  // avalanche blasting from the helicopter (js/missions-data-heliblast.js, js/missions-heliblast.js)
  ['Avalanche blasting from the helicopter', 'Lawinensprengung aus dem Helikopter'],
  ['January, seven in the morning, 60 cm of fresh snow overnight. The pistes stay closed until the slopes above them have been released. The blaster of the avalanche service sits at the open door, the charges in a box at his feet. Fly him to the four zones: two on the Jakobshorn, two on the Parsenn below the Weissfluhjoch. Over each yellow ring hover 15 to 45 m above the snow, as still as you can: a charge falls with the helicopter\'s speed, the white mark shows where it will land. G (or the button) throws it, then pull away: the fuse burns for six seconds. Do not hang low in the path when the slab goes. Eight charges for four zones; a miss costs 10 s.', 'Januar, sieben Uhr morgens, über Nacht 60 cm Neuschnee. Die Pisten bleiben zu, bis die Hänge darüber ausgelöst sind. Der Sprengmeister des Lawinendienstes sitzt an der offenen Tür, die Ladungen in einer Kiste zu seinen Füssen. Flieg ihn zu den vier Zonen: zwei am Jakobshorn, zwei auf der Parsenn unter dem Weissfluhjoch. Über jedem gelben Ring schwebst du 15 bis 45 m über dem Schnee, so ruhig wie möglich: Eine Ladung fällt mit dem Tempo des Helikopters, die weisse Markierung zeigt, wo sie landet. G (oder der Knopf) wirft sie, dann zieh weg: Die Zündschnur brennt sechs Sekunden. Häng nicht tief in der Sturzbahn, wenn das Schneebrett losgeht. Acht Ladungen für vier Zonen; ein Fehlwurf kostet 10 s.'],
  ['All four zones have run. The patrol skis the debris, the ropes come down, and at half past eight the first gondola of the day leaves for the Jakobshorn.', 'Alle vier Zonen sind abgegangen. Der Pistendienst fährt die Lawinenkegel ab, die Absperrungen fallen, und um halb neun fährt die erste Gondel des Tages aufs Jakobshorn.'],
  ['Zone 1: Jakobshorn, north flank', 'Zone 1: Jakobshorn, Nordflanke'], ['Zone 2: Jakobshorn, east flank above the Teufi', 'Zone 2: Jakobshorn, Ostflanke über dem Teufi'],
  ['Zone 3: Dorftälli below the Weissfluhjoch', 'Zone 3: Dorftälli unter dem Weissfluhjoch'], ['Zone 4: Weissfluh, east flank', 'Zone 4: Weissfluh, Ostflanke'],
  ['Jakobshorn, north flank', 'Jakobshorn, Nordflanke'], ['Jakobshorn, east flank above the Teufi', 'Jakobshorn, Ostflanke über dem Teufi'],
  ['Dorftälli below the Weissfluhjoch', 'Dorftälli unter dem Weissfluhjoch'], ['Weissfluh, east flank', 'Weissfluh, Ostflanke'],
  ['Drop charge', 'Ladung werfen'], ['Drop', 'Werfen'], ['G: drop the charge', 'G: Ladung werfen'], ['Away from the avalanche path!', 'Weg aus der Lawinenbahn!'], ['Watch it run', 'Schau, wie sie abgeht'],
  ['Pull up and away from the charge!', 'Hoch und weg von der Ladung!'], ['Hold off: it goes any second', 'Abstand halten: Gleich knallt es'],
  ['Fly to the yellow ring on the Jakobshorn', 'Flieg zum gelben Ring am Jakobshorn'], ['Across the valley to the Parsenn, below the Weissfluhjoch', 'Über das Tal zur Parsenn, unter das Weissfluhjoch'],
  ['Too low: climb above 15 m', 'Zu tief: steig über 15 m'], ['Sink to 45 m over the snow', 'Sink auf 45 m über dem Schnee'], ['Over the ring: the white mark shows where it lands', 'Über den Ring: Die weisse Markierung zeigt, wo sie landet'],
  ['One at a time: the charge is still burning', 'Eine nach der anderen: Die Ladung brennt noch'], ['No charges left', 'Keine Ladungen mehr'],
  ['Too low to throw: climb above 15 m', 'Zu tief zum Werfen: steig über 15 m'], ['Too high to aim: sink below 45 m', 'Zu hoch zum Zielen: sink unter 45 m'],
  ['Caught in the powder cloud: +20 s', 'In der Staubwolke erwischt: +20 s'],
  ['The charge went off right under the helicopter. The crew is shaken, the flight is over.', 'Die Ladung ist direkt unter dem Helikopter explodiert. Die Crew ist durchgeschüttelt, der Flug ist vorbei.'],
  ['Out of charges: the slopes stay closed today.', 'Keine Ladungen mehr: Die Hänge bleiben heute zu.'],
  // the long break on the SAMD's roof (js/missions-data-samd.js, js/missions-samd.js)
  ['From the roof of the SAMD', 'Vom Dach der SAMD'],
  ['Down the stairs before anyone asks questions. Five minutes later Gian and Mätti sit in the maths lesson as if nothing had happened, a little out of breath.', 'Die Treppe runter, bevor jemand Fragen stellt. Fünf Minuten später sitzen Gian und Mätti in der Mathestunde, als wäre nichts gewesen, ein bisschen ausser Atem.'],
  ['Sneak to the side door', 'Schleich zur Seitentür'], ['The long break', 'Die grosse Pause'],
  ['Up the stairs and through the roof hatch', 'Die Treppe hoch und durch die Dachluke'], ['Up on the roof …', 'Rauf aufs Dach …'],
  ['Ducked: let the yard calm down', 'Abgetaucht: Lass den Pausenhof sich beruhigen'], ['They are looking up: duck (C)!', 'Sie schauen hoch: abtauchen (C)!'],
  ['Let go to drop it', 'Loslassen, und er fällt'], ['Hold to hock, let go to drop: lead them', 'Halten zum Aufziehen, loslassen zum Spucken: vorhalten!'],
  ['Pupil', 'Schüler'], ['Teacher', 'Lehrerin'], ['Rektor', 'Rektor'], ['Tourist', 'Tourist'], ['Cyclist', 'Velofahrer'],
  ['Bläss, the caretaker\'s dog', 'Bläss, der Hund vom Hausmeister'], ['Chindsgi kid', 'Chindsgi-Kind'], ['Hausmutter', 'Hausmutter'],
  ['Hey! Who was that?!', 'He! Wer isch das gsi?!'], ['Gross, it\'s in my hair!', 'Gruusig, das isch i mine Hoor!'], ['Not funny, guys!', 'Gar nöd luschtig, Giele!'],
  ['My coffee! Who did that?', 'Min Kafi! Wer isch das gsi?'], ['I\'ll find out who you are!', 'Ich finds use, wer ihr sind!'],
  ['Unheard of! To my office, at once!', 'Unerhört! Sofort is Rektorat!'], ['Hey, you clown!', 'He, du Lappi!'],
  ['Is it raining? The sun is out!', 'Regnet es? Die Sonne scheint doch!'], ['Disgusting! And on holiday!', 'Igitt! Und das in den Ferien!'],
  ['Whoa, what was that?!', 'Was isch au das?!'], ['Woof! Woof!', 'Wuff! Wuff!'], ['Waaah! Mummy!', 'Wääh! Mami!'],
  ['Just you wait! No cake on Sunday!', 'Wart nur! Am Sunntig gits kei Chueche!'],
  ['Bull\'s eye!', 'Volltreffer!'], ['Right on the head!', 'Grad uf de Grind!'], ['Ha, look at him!', 'Ha, lueg dä a!'],
  ['Unstoppable!', 'Nöd z bremse!'], ['Gian, you\'re a legend!', 'Gian, du bisch e Legände!'], ['THE REKTOR! Legendary!', 'DE REKTOR! Legendär!'],
  ['Not the dog, man!', 'Nöd de Hund, Mann!'], ['Not the little ones!', 'Nöd d Chliine!'], ['Are you crazy? No cake now!', 'Spinnsch? Jetzt gits kei Chueche!'],
  ['Missed.', 'Danebe.'], ['Lead them, Gian!', 'Vorhalte, Gian!'], ['Mind the wind!', 'Pass uf de Wind uf!'],
  ['Footsteps on the stairs! Duck!', 'Schritt uf de Stäge! Abtauche!'], ['Swallowed it? Gross!', 'Abegschluckt? Gruusig!'],
  ['Hock', 'Aufziehen'], ['Collecting', 'Sammeln'], ['Suspicion', 'Verdacht'],
  ['Hock, let go to drop', 'Aufziehen, loslassen zum Spucken'], ['Duck', 'Abtauchen'],
  ['The Hausmeister!', 'Der Hausmeister!'], ['Caught at the parapet: detention', 'An der Brüstung erwischt: Nachsitzen'],
  ['Ring!', 'Rrring!'], ['The long break is over', 'Die grosse Pause ist vorbei'],
  ['The Rektor!', 'Der Rektor!'], ['Crossing the yard to the Aula', 'Er geht über den Pausenhof zur Aula'],
  // the ice resurfacer in the Eisstadion's second intermission (js/missions-data-zamboni.js, js/missions-zamboni.js)
  ['The ice resurfacer in the intermission', 'Die Eismaschine in der Drittelpause'],
  ['HC Davos against the ZSC Lions, 2 : 1 after two periods, and the Eisstadion is sold out. The siren has gone, the players are in the dressing rooms, and the ice they left behind is grey and cut up. You drive the ice resurfacer: out through its gate in the west end boards and over the whole rink before the teams come back. The conditioner behind the machine shaves the ice and lays a film of warm water, 2.3 m wide, that freezes as smooth as glass. Do it the way the ice masters do: first two laps along the boards, then ovals towards the middle, each pass overlapping the last by a hand\'s width. W drives, S brakes and backs up, A/D steer: it is a heavy machine with a wide turning circle, so turn early. Space switches the conditioner on and off, V shows the ice from above. Water laid on water that has not frozen yet pools into puddles, a hard knock against the boards costs points, and the water tank does not last for ever. At least 95 % of the ice, then back through the gate before the intermission clock runs out. Points for the ice, the time left and a clean run.', 'Der HC Davos gegen die ZSC Lions, 2 : 1 nach zwei Dritteln, und das Eisstadion ist ausverkauft. Die Sirene ist ertönt, die Spieler sind in der Garderobe, und das Eis, das sie zurückgelassen haben, ist grau und zerfurcht. Du fährst die Eismaschine: durch ihr Tor in der Bande am Westende hinaus und übers ganze Feld, bevor die Teams zurückkommen. Der Hobel hinten an der Maschine schabt das Eis ab und legt einen Film aus warmem Wasser, 2.3 m breit, der spiegelglatt gefriert. Mach es wie die Eismeister: zuerst zwei Runden der Bande entlang, dann Ovale zur Mitte hin, jede Bahn eine Handbreite über der letzten. W fährt, S bremst und fährt rückwärts, A/D lenken: Die Maschine ist schwer und hat einen grossen Wendekreis, also früh einlenken. Die Leertaste senkt und hebt den Hobel, V zeigt das Eis von oben. Wasser auf Wasser, das noch nicht gefroren ist, gibt Pfützen, ein harter Schlag an die Bande kostet Punkte, und der Wassertank reicht nicht ewig. Mindestens 95 % des Eises, dann zurück durchs Tor, bevor die Pausenuhr abgelaufen ist. Punkte gibt es fürs Eis, die übrige Zeit und eine saubere Fahrt.'],
  ['The ice shines under the floodlights, the gate closes behind the machine, and the teams step back onto a sheet like glass. The Eisstadion applauds the ice crew.', 'Das Eis glänzt im Flutlicht, das Tor schliesst sich hinter der Maschine, und die Teams betreten ein Eis wie Glas. Das Eisstadion applaudiert der Eiscrew.'],
  ['Two laps along the boards', 'Zwei Runden der Bande entlang'], ['Ovals towards the middle', 'Ovale zur Mitte hin'], ['Back through the gate', 'Zurück durchs Tor'],
  ['The intermission is over: the teams are back at the boards and the ice is not ready. The referee waves the machine off.', 'Die Pause ist vorbei: Die Teams stehen an der Bande, und das Eis ist nicht fertig. Der Schiedsrichter winkt die Maschine vom Feld.'],
  ['The water tank is empty and the ice is only half done: the crew has to finish it with the hose, and the game starts late.', 'Der Wassertank ist leer, und das Eis ist erst halb fertig: Die Crew muss es mit dem Schlauch fertig machen, und das Spiel beginnt zu spät.'],
  ['Space: conditioner on', 'Leertaste: Hobel ein'], ['W: out through the gate onto the ice', 'W: durchs Tor aufs Eis'], ['First two laps along the boards, close to them', 'Zuerst zwei Runden nah der Bande entlang'],
  ['The water is running low: no passes twice', 'Das Wasser wird knapp: keine Bahn doppelt'], ['Now the middle: overlap your last pass by a hand\'s width', 'Jetzt die Mitte: Überlapp die letzte Bahn um eine Handbreite'],
  ['Space: conditioner off, then into the gate', 'Leertaste: Hobel aus, dann ins Tor'], ['Into the gate: the teams are waiting', 'Ins Tor: Die Teams warten'],
  ['Conditioner on', 'Hobel ein'], ['Conditioner off', 'Hobel aus'], ['Conditioner', 'Hobel'], ['Snow tank', 'Schneetank'], ['conditioner on/off', 'Hobel ein/aus'],
  ['drive', 'fahren'], ['brake · back up', 'bremsen · rückwärts'],
  ['The water tank is empty', 'Der Wassertank ist leer'], ['Water on wet ice: a puddle!', 'Wasser auf nassem Eis: eine Pfütze!'], ['Water tank almost empty', 'Wassertank fast leer'],
  // the machinist on the Parsennbahn (js/missions-data-parsenn.js, js/missions-parsenn.js)
  ['Machinist on the Parsennbahn', 'Maschinist auf der Parsennbahn'],
  ['Weissfluhjoch, 2663 m. The doors open onto the snow, the first skiers clatter out, and the car waits for the next run down.', 'Weissfluhjoch, 2663 m. Die Türen gehen auf in den Schnee, die ersten Skifahrer klappern hinaus, und der Wagen wartet auf die nächste Fahrt ins Tal.'],
  ['Up to Höhenweg', 'Hinauf zum Höhenweg'], ['Up to the Weissfluhjoch', 'Hinauf aufs Weissfluhjoch'],
  ['Drive to Höhenweg', 'Fahr zum Höhenweg'], ['Drive to Weissfluhjoch', 'Fahr aufs Weissfluhjoch'],
  ['Change to the upper car at Höhenweg', 'Am Höhenweg in den oberen Wagen umsteigen'], ['Change to the upper car', 'Umsteigen in den oberen Wagen'],
  ['The passengers are boarding', 'Die Fahrgäste steigen ein'], ['F: close the doors', 'F: Türen schliessen'], ['F: open the doors', 'F: Türen öffnen'],
  ['B: the horn before you leave', 'B: Hornsignal vor der Abfahrt'], ['W: lever up, off you go', 'W: Fahrhebel hoch, los gehts'],
  ['Creep on (W) or open the doors (F)', 'Langsam vorrücken (W) oder Türen öffnen (F)'], ['Stop with the front at the yellow line', 'Mit der Wagenspitze an der gelben Linie halten'],
  ['Slow down for the station', 'Abbremsen vor der Station'], ['Time-lapse ×4 · T: back to normal', 'Zeitraffer ×4 · T: zurück zu normal'],
  ['Stop board', 'Haltetafel'], ['Next limit', 'Nächstes Limit'], ['Clock', 'Uhr'], ['Due', 'Fahrplan'], ['Doors', 'Türen'], ['Score', 'Punkte'],
  ['Emergency brake', 'Notbremse'], ['Emergency', 'Not-Halt'], ['Time-lapse ×4', 'Zeitraffer ×4'], ['Lever', 'Fahrhebel'], ['past', 'vorbei'],
  ['dep.', 'Abf.'], ['arr.', 'Ank.'], ['open', 'offen'], ['closed', 'zu'],
  ['Lever up', 'Hebel hoch'], ['Lever down', 'Hebel runter'], ['Faster', 'Schneller'], ['Slower', 'Langsamer'],
  ['Doors open: the drive is locked', 'Türen offen: Der Antrieb ist gesperrt'], ['Wait: the passengers are still boarding', 'Warte: Die Fahrgäste steigen noch ein'],
  ['Doors only at a standstill', 'Türen nur im Stillstand'], ['Not at the platform yet', 'Noch nicht am Perron'], ['Emergency brake!', 'Notbremse!'],
  ['Past the board: the limit switch trips', 'Über die Tafel hinaus: Der Endschalter löst aus'], ['Into the buffer stop!', 'In den Prellbock!'],
  ['Time-lapse off: a limit ahead', 'Zeitraffer aus: Limit voraus'], ['No time-lapse here', 'Hier kein Zeitraffer'],
  ['Left too early!', 'Zu früh abgefahren!'], ['Departure, with the horn', 'Abfahrt, mit Hornsignal'], ['Departure', 'Abfahrt'],
];

const enToDe = new Map(pairs);
// Long mission introductions are keyed by their unique opening phrase. The live values
// contain numbers calculated by the mission definitions, so exact string keys are brittle.
const tobogganDe = (text) => text.replace(/(\d+) bumps?/, (_, n) => `${n} ${n === '1' ? 'Rumms' : 'Rummse'}`).replace(/(\d+) rams?/, (_, n) => `${n}-mal aufgefahren`);

// the splitboard transition's steps, shown with their count: "Close the clips (4/6)"
const SPLIT_STEPS_DE = {
  'Skin off the first half': 'Fell von der ersten Hälfte', 'Skin off the second half': 'Fell von der zweiten Hälfte', 'Halves together, hooks in': 'Hälften zusammen, Haken einhängen',
  'Close the clips': 'Clips schliessen', 'Bindings across, pins in': 'Bindungen quer, Pins rein', 'Step in, straps tight': 'Einsteigen, Riemen zu'
};
// the Pfadi Davos mission's held steps, shown with their count: "Peg the edges (4/5)" (js/missions-data-pfadi.js)
const PFADI_STEPS_DE = {
  'Lay out the six tarps': 'Die sechs Blachen auslegen', 'Button the tarps together': 'Die Blachen zusammenknöpfen', 'Set up the poles and the ridge': 'Stangen und First aufstellen',
  'Peg the edges': 'Ränder verhäringen', 'Tension the guy lines': 'Abspannschnüre spannen',
  'Lay the stones in a ring': 'Steine im Kreis legen', 'Tinder nest in the middle': 'Zundernest in die Mitte', 'Kindling as a tipi': 'Anfeuerholz als Tipi', 'Logs round it': 'Scheiter darum herum'
};
const PFADI_WOOD_DE = { 'dry twigs': 'dürre Zweige', kindling: 'Anfeuerholz', 'a log': 'ein Scheit' };
const missionIntros = [
  ['The first train of the day up the Parsennbahn', 'Der erste Zug des Tages auf der Parsennbahn, und du bist der Maschinist im Führerstand vorne im Wagen. In Davos Dorf steigen die Fahrgäste ein: Schliess die Türen (F), gib ein Hornsignal (B) und fahr pünktlich ab. Der Fahrhebel (W/S) stellt das Tempo ein, das die Winde hält, die Leertaste ist die Betriebsbremse, X die Notbremse. Halte die Tempolimits ein, aus der Station, durch den Tunnel und durch die Ausweiche, wo dir der andere Wagen entgegenkommt, und halte am Höhenweg mit der Wagenspitze auf den Zentimeter genau an der gelben Linie. Öffne die Türen, steig in den oberen Wagen um und mach dasselbe nochmals bis aufs Weissfluhjoch. Die Leute stehen: Brems sanft. T fährt die langen Strecken im Zeitraffer.'],
  ['January, the World Economic Forum. A start-up', 'Januar, das World Economic Forum. Ein Start-up aus Zürich will sein Jetpack den Investoren vorführen, die auf der Terrasse des Berghotels Schatzalp warten, des alten Sanatoriums aus dem «Zauberberg». Doch der Testpilot steckt im Stau am Wolfgang, und die Schatzalpbahn ist von Delegationen ausgebucht. Du wurdest angestellt, um die Benzinkanister zu tragen. Jetzt trägst du das Ding selbst. Flieg die Demo: vom Kurpark beim Kongresszentrum durch die Lichttore über dem Ort, tief über die Natureisbahn und um den Kirchturm von St. Johann. Lande dann bei der Boxencrew an der Promenade zum Volltanken, steig der Schatzalpbahn entlang hinauf und lande auf der Hotelterrasse. Leertaste steigt, Q sinkt, ohne beides schwebt das Jetpack von selbst; W neigt nach vorn, S bremst, A/D drehen. Auf dem Handy lenkt der Stick, die Knöpfe steigen und sinken. Behalte den Tank im Auge: Jede Sekunde in der Luft kostet Treibstoff, Steigen am meisten. Setz langsamer als 30 km/h auf, sonst gibt es einen Purzelbaum (+10 s); eine Wand kostet 3 s.'],
  ['Evening at the Pfadiheim Davos', 'Abend beim Pfadiheim Davos an der Eisbahnstrasse, und heute Nacht schlafen die Pfadi Davos draussen. Geh zu Fuss in den Mattawald, den Wald jenseits des Landwassers: Folge den Wegzeichen, als Pfeile gelegten Ästen. Stell auf dem Lagerplatz den Spatz auf, das Gruppenzelt der Pfadi aus sechs Baumwollblachen: Halte Space beim Zeltplatz, um die Blachen auszulegen, zusammenzuknöpfen, die zwei Holzstangen aufzustellen, die Ränder zu verhäringen und die Abspannschnüre zu spannen. Lässt du los, rutscht der Schritt zurück. Dann sammle Feuerholz rund um den Lagerplatz (dürre Zweige, Anfeuerholz und Scheiter: Space halten, um jedes aufzuheben), bau die Feuerstelle (Space halten: der Steinkreis, das Zundernest, das Anfeuerholz als Tipi, die Scheiter) und zünde sie auf die alte Art an, mit Feuerstein und Feuerstahl: Drück Space, wenn die Nadel im Grünen ist, und drei gute Schläge geben eine Glut im Zunder. Dann halte Space, um sie zur Flamme anzublasen, und lass ab und zu los, um einzuatmen. Wenn das Zelt steht und das Feuer brennt, bist du fertig.'],
  ['A clear winter day on the Strelapass', 'Ein klarer Wintertag auf dem Strelapass, unter dir die Schatzalp und am Ende des Grats im Südwesten das Chörbschhorn (2650 m). Du gehst nicht allein: Reto kommt mit, in deiner Spur. Zuerst der Gruppencheck der LVS: Space halten, während Retos Gerät deines sucht, dann während deines seines findet. Dann mit Fellen, das Board in zwei Hälften geteilt, am Hauptertälli vorbei und über den Grat hinauf: von Markierstange zu Markierstange, welche Linie du willst. W geht, A/D dreht. Wo die Spur abfällt, gleiten die Felle: Du fährst bergab und wirst schneller. Die Felle halten an mässig steilen Hängen; gerade einen steilen hinauf rutschen sie, und du gleitest zurück. Also im Zickzack quer zum Hang, und mit Space eine Spitzkehre auf die andere Diagonale. Wo es steiler als 30° wird, hält Reto 10 m Abstand. Bleib nahe der markierten Linie: Abseits davon, in Hängen ab 35°, kann die Schneedecke brechen, und dann gräbst du Reto mit LVS, Sonde und Schaufel aus. Auf dem Gipfel auf ihn warten und Space halten: Felle abziehen, das Board zusammenfügen. Dann über den Südgrat an der Chörbschhornhütte vorbei durch die roten Fahnen hinunter zur Stafelalp ob Frauenkirch: A/D kurven, W in die Hocke, S bremsen. Ein verpasstes Tor kostet 8 s.'],
  ['A cold evening at the Seehof Seeli', 'Ein kalter Abend am Seehof Seeli, dem kleinen Teich beim Hotel Seehof in Davos Dorf: Das Eis ist vom Tag grau und zerkratzt, und heute Abend wollen die Einheimischen Schlittschuh laufen. Nimm den Schlauch am Hydranten am Nordufer und flute das Eis, Space halten zum Spritzen. Das Wasser gefriert in ein paar Sekunden; läufst du vorher hinein, hinterlassen deine Schuhe Abdrücke, die nochmals geflutet werden müssen. Mach es also wie die Eismeister: rückwärts gehen und nach vorne spritzen. Dann steig auf die Eismaschine und fahr sie in Bahnen über den ganzen Teich: Der Aufbereiter hinten hobelt das Eis und hinterlässt einen Film aus warmem Wasser, der spiegelglatt gefriert.'],
  ['A summer afternoon on the Rinerhorn', 'Ein Sommernachmittag auf dem Rinerhorn, 2520 m. Der Schirm liegt hinter dir ausgelegt auf der Wiese, über den Graten wachsen Quellwolken. Mit W oder Leertaste ziehst du ihn auf und läufst den Hang hinunter. In der Luft steuern A/D, W ist der Beschleuniger, S sind die Bremsen (und kurz vor dem Boden das Ausflaren); auf dem Handy steuert der Stick, nach oben ist der Beschleuniger, nach unten sind die Bremsen, und der Knopf ist fürs Ausflaren. Such die Thermik: Das Vario rechts piepst im Steigen und knistert leise am Rand eines Bartes, Alpendohlen kreisen darin, und oben sitzt ein Wölkchen. Der Talwind bläst aus Südwesten und versetzt dich und die Thermik; lande gegen den Wind. Bleib so lange wie möglich oben, flieg so weit wie möglich und lande auf dem Landeplatz in Glaris bei der Talstation. Der Flug läuft doppelt so schnell wie die Uhr. Er ist deine Flugschein-Prüfung: Lande sanft auf dem Landeplatz in Glaris, und der Flugschein gehört dir. Damit kannst du an jedem Hang im Tal den Schirm vom Rücken nehmen (P, oder der Knopf auf dem Handy) und fliegen.'],
  ['The Adventure Park Färich, in the trees', 'Der Adventure Park Färich, in den Bäumen am Eingang des Flüelatals. Die Leiter hinauf, dann von Plattform zu Plattform: Wackelbrücke, Balancierbalken, Pneu-Traverse, eine wildere Brücke und die Zipline. Auf jeder Plattform hängst du mit Space (Knopf „Einhängen“) BEIDE Karabiner ein, bevor du losgehst: Vergisst du es, pfeift dich der Guide zurück, +8 s. Auf einer Querung gehst du mit W und lehnst dich mit A/D gegen das Schwanken. Fällst du, baumelst du nur komisch und unverletzt im Gurt, +5 s. Auf der Zipline bremst du mit S vor der Matte. Ein sauberer Lauf holt Gold.'],
  ['Dusk on the Seehof Seeli', 'Abenddämmerung auf dem Seehof Seeli, dem kleinen Teich beim Hotel Seehof in Davos Dorf. Den Einheimischen fehlt ein Spieler: drei gegen drei, Schuhe und Jacken als Torpfosten, keine Torhüter, wer zuerst 5 hat oder 3 Minuten. Laufen mit W, A/D und S. Space mit dem Puck schiesst dorthin, wohin du schaust, oder passt, wenn du einen Mitspieler anschaust; gedrückt halten holt zu einem härteren Schuss aus. Space ohne Puck stochert nach dem Puckführenden oder verlangt den Pass von einem Mitspieler, und wer schnell in den Puckführenden hineinfährt, kann ihn vom Puck trennen. Du greifst das Osttor an. Je grösser der Vorsprung am Schluss, desto besser die Medaille.'],
  ['A busy morning at Meerkämper Optik', 'Ein strenger Morgen bei Meerkämper Optik an der Promenade, und du bist die Optikerin am Phoropter. Alle Kundinnen und Kunden haben eine versteckte Sphäre und einen versteckten Zylinder. Wähl einen Wert und die Schrittweite, klapp die Gläser um und frag: besser mit eins oder zwei? Dann nimm das Glas, das sie bevorzugen. Die Tafel verschwimmt so, wie sie sie sehen, du kannst also selbst urteilen. Sehen beide Gläser bei ±0.25 gleich aus, stimmt der Wert. Stell das Rezept aus: Am meisten zählt die Genauigkeit, dann wenige Fragen und das Tempo. Und einer kneift die Augen zusammen. Drei Minuten für vier Kunden.'],
  ['At the SLF in Davos Dorf', 'Beim SLF in Davos Dorf wollen die Lawinenwarner ein frisches Profil vom Versuchsfeld auf dem Weissfluhjoch, 2536 m. Hol die Ausrüstung beim Institut, fahr hinauf und mach es so, wie es wirklich gemacht wird. Halten zum Graben, bis auf den Boden. Schicht für Schicht: Probier Faust, vier Finger, einen Finger, Bleistift, Messer und schreib das Grösste auf, das noch hineingeht; schau das Korn unter der Lupe an. Halt das Thermometer alle 10 cm in die Wand, bis der Wert steht. Klopf den Kompressionstest: Wo bricht es? Dann leg die Gefahrenstufe fürs Bulletin fest. Dein Blatt wird mit der Wahrheit verglichen, und je schneller, desto besser. Liegt genug Schnee, ist die Grube die von heute, aus den Live-Daten des SLF. Etwa drei Minuten.'],
  ['January, the World Economic Forum', 'Januar, das World Economic Forum, und Davos ist eine Festung. Du fährst den Polizei-Führungswagen einer erfundenen Delegation. Hol am Bahnhof Davos Dorf die drei schwarzen Limousinen und den Begleitwagen ab und führe sie über die Promenade und die Talstrasse zum Kongresszentrum. Blaulicht und Sirene (K) halten den Verkehr zurück. Die Kolonne fährt deine Spur nach: Zu schnell, und sie reisst ab; zu langsam, und der Zeitplan rutscht; Anhalten oder ein Unfall kosten Fassung. An den Sicherheitsschleusen unter 30 km/h. Hör auf den Funk: Mit J meldest du eine Umleitung. Punkte für Zeit, Zusammenhalt und Fassung.'],
  ['The Forum is in town, and so is the registered', 'Das Forum ist in der Stadt, der bewilligte Gegenumzug auch. Mit dem Megafon gehst du an seiner Spitze die Promenade hinunter: dreissig Leute, drei Plakate und eine Thermoskanne. Ruf im Takt (Space oder die Taste), die Menge antwortet: Gute Sprechchöre locken Leute vom Strassenrand an; wer den Takt verliert oder davonläuft (W gedrückt ist zu schnell), schickt sie zur heissen Schokolade. Bleib auf der bewilligten Route und rede ruhig mit der Polizei-Verbindungsperson. Der Kundgebungsplatz liegt vor dem Zaun. Punkte für die Menge, den Sprechchor, die Route und die Kundgebung.'],
  ['Heldstab AG on the Bahnhofstrasse', 'Die Heldstab AG an der Bahnhofstrasse in Davos Dorf verkauft Landmaschinen und auch Quads. Heute gehört dir eines für eine Probefahrt: durchs Dorf zum Bedraweg, rund um die Wege und Wiesen oberhalb von Dorf und über die Mühlestrasse zurück. Das Quad ist leicht und nervös. Nimm die Buckel schnell: Ein sauberer Sprung schenkt dir 1,5 s. Schlamm und der letzte Altschnee nehmen dir den Grip, und in der Luft lenkt nichts mehr.'],
  ["The hotels' kitchens fill a barrel of green waste a day", 'Die Hotelküchen füllen jeden Tag ein Fass mit Bioabfall, und der kommt in die Biogasanlage bei der Duchli Ranch. Fahr mit dem offenen Transporter die Hotels ab: die Bahnhofstrasse hinunter, der Promenade entlang, die Talstrasse wieder hinauf. Halte mit der Ladefläche neben dem Fass jedes Hotels, die Crew hebt es hinauf, solange du stehst, und stellt ein leeres an seinen Platz. Schau in die Fässer: In zweien steckt Plastik. Lass sie mit Leertaste oder E (oder der Taste «Stehen lassen») stehen, bevor sie oben sind, sonst ist die ganze Fuhre verdorben. Dann hinaus über die Dischmastrasse, die im Winter geräumt wird, und durch den Hof der Ranch zum Annahmebunker des Fermenters, wo die Fässer gekippt werden. Punkte gibt es für Fässer, eine saubere Ladung und die Zeit.'],
  ['Fresh snow on the Junkerboden', 'Neuschnee auf dem Junkerboden, der Terrasse über Frauenkirch, und noch niemand war unterwegs. Schnall die Schneeschuhe an und folge den Fähnli den Hang hinauf, dann hinunter zum Bänkli und weiter zur Junkerbodenstrasse. W zum Gehen, A/D zum Lenken. Tippe im Takt Space (Nadel im Grünen, Touch: Schritt) für einen langen Schritt. Neben der festgetretenen Spur sinkst du ein und wirst langsamer; steile Anstiege fressen deine Kraft. Setz dich aufs Bänkli: Der Atem kommt zurück und die Aussicht ist gratis. Die abgesteckte Wildruhezone am Hang ist das Winterzuhause der Birkhühner: Geh auf der Spur darum herum. Wer sie durchquert, verliert Punkte. Zeit, saubere Spur und ruhige Vögel geben die Punkte.'],
  ['A busy day in the plaster room', 'Viel los im Gipszimmer des Spitals Davos: Die Rega fliegt laufend Skifahrer von den Pisten ein, und du bist der Gipser. Geh zur Tür auf der Hofseite. Dann, für drei Patienten, jeder schneller als der letzte: Röntgenbild lesen und Bein und Gipslänge wählen (Tasten 1 und 2 oder antippen). Winkel einstellen (A/D oder ziehen, Space zum Festhalten). Mit Watte polstern, dann die Binde die richtige Zeit in den Kessel halten (Space oder den Kessel halten). Das Bein hinauf und wieder hinunter gleichmässig wickeln (D halten oder ziehen, im grünen Tempo): Zu schnell gibt Lücken, zu langsam Klumpen. Glätten, bevor der Gips abbindet, dann unterschreiben. Ein gleichmässiger Gips und flotte Arbeit geben die Punkte.'],
  ['Up on the Schatzalp, above the old sanatorium', 'Oben auf der Schatzalp, über dem alten Sanatorium, windet sich eine Rinne aus Chromstahl den Hang hinunter: acht Spitzkehren und ein Tunnel auf gut 450 m. Du fährst wie auf Schienen: W stösst an und startet die Uhr. Du hast nur den Bremshebel: S halten bremst, loslassen fliegt. Mit A/D (oder durch Kippen des Handys) lehnst du dich in die Kurven. Zu schnell aus der Kurve, und der Schlitten klettert schüttelnd die Wand hoch; viel zu schnell, und er bleibt mit einem Rumms stehen, das kostet Zeit. Vor dir fährt eine Familie im Sonntagstempo. Überholen geht nicht, also fahr nicht auf.'],
  ['The Natureisbahn Davos, Europe', 'Zwei Runden à 400 m auf der Natureisbahn, gegen den Uhrzeigersinn. W gedrückt halten zum Laufen, Space im Rhythmus für einen kräftigen Abstoss drücken. Mit A/D in die Kurven lehnen, mit S bremsen. Wer die Innenkegel schneidet, wird disqualifiziert.'],
  ["The HCD's home ice", 'Fünf Penaltys gegen den Torhüter im Eisstadion. Mit W auf das Tor zufahren, mit A/D lenken und mit S bremsen. Die rote Markierung zeigt die Schussrichtung; mit Space schiessen. Komm nahe heran, aber halte mindestens zwei Meter Abstand zum Torhüter.'],
  ['A sheet on the hard court', 'Acht Curlingsteine ins Haus spielen. Mit A/D zielen, mit W/S den Drall wählen und mit gedrückter Leertaste die Wurfkraft bestimmen. Während der Stein gleitet, mit Space wischen: Er läuft weiter und gerader. Je näher am Zentrum, desto mehr Punkte.'],
  ['Three holes on the course', 'Drei Löcher im Golf Club Davos zwischen Davos Dorf und dem Landwasser: das 14. (Par 3 über einen Bunker), das 15. (Par 4, ein Dogleg links entlang dem Aus) und das 18. (Par 4, der Teich vor dem letzten Grün): Par 11. Die rote Fahne mit ihrem Lichtstrahl und dem roten Schild zeigt das Loch. Schläger mit W/S oder 1–5 wählen (jeder zeigt, wie weit er bei voller Kraft fliegt), mit A/D oder durch Ziehen zielen. Der Schwung braucht dreimal Space (auf Touch: die Schwung-Taste): Schwung beginnen; die steigende Nadel für die Kraft stoppen (die rote Marke zeigt, was es bis zur Fahne braucht; Loslassen stoppt sie auch); schlagen, wenn die fallende Nadel durch die grüne Linie geht (zu früh: Hook nach links, zu spät: Slice nach rechts). Der gelbe Bogen und der Ring zeigen, wo der Ball landet, Wind und Lage schon eingerechnet: So zielen, dass der Ring auf der Fahne liegt. Gegenwind trägt kürzer, Rückenwind weiter, Seitenwind versetzt den Ball; Rough und Bunker kosten Weite. Nach jedem Schlag sagt der Bericht, was Kraft, Treffer und Wind bewirkt haben. Zum Ball gehen oder mit C den Golfwagen nehmen. Auf dem Grün zeigen die Pfeile das Gefälle.'],
  ['The Davoser Craft Beer on', 'Bier für fünf Davoser Bars ausliefern. Mit F aus dem VW T3 steigen, zwei Stapel Kisten in den Wagen tragen und zu Rot Liechtli, Ex Bar, La Onda, Dorfkeller und BOX fahren. Jeweils nahe parken, aussteigen und eine Kiste zur Tür tragen.'],
  ['Early shift at the Bäckerei', 'Frühschicht in der Bäckerei Weber: fünf Gipfeli gleichmässig rollen, indem du über den Teig nach unten ziehst oder S / ↓ im Takt drückst. Dann per Velo die Gipfeli vor sieben Uhr zu Seehof, Montana und Turmhotel Victoria bringen und bei jedem Hotel anhalten.'],
  ['Rush hour at Gourmet Käch', '90 Sekunden lang Raclette servieren. Käse im richtigen Moment mit einer Wischbewegung oder Space abschaben: goldgelb für normale Bestellungen, leicht braun für „extra knusprig“. Zu früh ist er roh, zu spät verbrannt.'],
  ['September, the Bündner Hochjagd', 'Bei der Bündner Hochjagd nur einen alten Bock mit mindestens 75 cm langen Hörnern erlegen. Langsam zum Stand gehen. Zum Zielen ziehen, mit Rechtsklick oder Z das Zielfernrohr nutzen und mit Shift den Atem beruhigen. Hinter die Schulter zielen und den Wind beachten. Geissen, Kitze und junge Böcke sind geschützt. Vier Schuss.'],
  ['The squirrels of the Seepromenade', 'Eichhörnchen am Davosersee füttern. Ruhig am Ufer entlanggehen, stehen bleiben und mit E oder „Nuss“ eine Haselnuss hinhalten. Nicht bewegen, während das Tier herankommt; Rennen verscheucht es. In drei Minuten so viele wie möglich füttern.'],
  ['The coach of the tennis club', 'Tiebreak in der Sporthalle Färbi: zuerst sieben Punkte mit zwei Punkten Vorsprung gewinnen. Deine Beine finden den Ball von selbst (der gelbe Ring: dort springt er auf); drück Space, klick oder tippe Schlagen, wenn er kommt – der Schlag wartet auf den Ball und geht los, wenn er neben dir ist. Mit W/A/S/D (Joystick) selbst laufen, A/D beim Schlag gehalten lenkt den Ball. Aufschlag: Space wirft hoch, nochmals Space nahe dem höchsten Punkt schlägt.'],
  ["The eau-là-là's slide", 'Die Rutsche im eau-là-là möglichst schnell hinunterfahren. In den Kurven mit A/D oder dem Joystick auf der idealen Linie bleiben. Zu hoch an der Wand bremst, zu tief rüttelt. Schnell ins Becken eintauchen.'],
  ['Ernst Ludwig Kirchner painted', 'Vor dem Kirchner Museum ein Bild in Kirchners kräftigen Farben malen: Farbe und Pinsel wählen, mit Maus oder Finger malen und schwarze Konturen ergänzen. „Vorlage“ legt eine vereinfachte Ansicht über die Leinwand. Drei Minuten Zeit; Ähnlichkeit, Farben und Konturen zählen. Das Bild lässt sich speichern.'],
  ['Race day on the Jakobshorn', 'Slalomrennen auf dem Jakobshorn: durch jedes rot-blaue Tor und ins Ziel fahren. Mit A/D lenken, W für die Hocke, S zum Bremsen. Ein ausgelassenes Tor gibt Zeitstrafe; zu viele führen zur Disqualifikation.'],
  ['The JatzPark has built', 'Drei Big-Air-Sprünge im JatzPark. Auf dem Anlauf Tempo holen; in der Luft mit A/D drehen, mit W/S einen Flip machen und mit Space einen Grab halten. Aufrecht und in Fahrtrichtung landen. Die Punkte aller drei Sprünge zählen.'],
  ['The bike race of the summer', 'Mountainbike-Abfahrt von der Ischalp nach Bolgen Plaza: 2,7 km und fast 400 Höhenmeter. Alle Checkpoints der Reihe nach durchfahren; bei einer Abkürzung zum ausgelassenen Punkt zurückkehren. Zu enge Kurven bei hohem Tempo führen zum Sturz und kosten fünf Sekunden.'],
  ['Metal night at the BOX', 'Metal-Nacht in der BOX Davos an der Bahnhofstrasse in Davos Dorf. Geh hinein und headbange zur Band: Drücke Space (oder tippe BANG) genau im Takt. Perfekte Treffer zählen mehr, eine Serie vervielfacht deine Punkte bis ×5, die Menge dreht durch. Ein Song, 60 Sekunden.'],
  ['The regulars at the Bar La Onda', 'Tischfussball im La Onda: Du spielst Rot von links. Mit W/S oder der Maus die Stange beim Ball bewegen, mit 1–4 eine Stange wählen und mit Q zur Automatik zurück; Space oder Klick schiesst. Wird der Balken unter deiner Stange grün, liegt der Ball am Fuss: jetzt schiessen. Ein langsamer Ball bleibt am Fuss deines Männchens liegen: zielen, dann abziehen. Auf dem Handy über den Tisch ziehen und SCHIESSEN tippen. Wer zuerst fünf Tore schiesst, gewinnt.'],
  ['Beside the big table at the Bar La Onda', 'Neben dem grossen Kasten im La Onda steht ein kleiner: zwei Stangen pro Seite, eine Abwehr mit zwei und ein Sturm mit drei Männchen, ein kurzes Feld und ein schnelles Spiel. Du spielst Rot von links: W/S oder die Maus schieben deine Stange (1–2 wählt eine, Q zurück zur Automatik), Space oder Klick schiesst, wenn der Balken unter deiner Stange grün wird. Wer zuerst fünf Tore schiesst, gewinnt.'],
  ['Rush hour at the valley station', 'Die Jakobshorn-Gondel wie bei Tetris füllen. Mit ←/→ oder A/D verschieben, mit ↑/W drehen, mit S oder Space abwerfen und mit E oder Enter die Gondel losschicken. Volle Reihen bringen Bonuspunkte, Lücken kosten Punkte. Auf dem Handy wischen und tippen. 100 Sekunden.'],
  ['Take the Capricorn from Davos Wolfgang', 'Den RhB-Capricorn von Davos Wolfgang nach Davos Platz fahren. In Davos Dorf und Kongress/Eisstadion fahrplanmässig anhalten, mit der Zugspitze an der Markierung stoppen, die Türen 20 Sekunden offen lassen und Tempolimits beachten. W gibt Gas, S bremst.'],
  ['The Silberberg above Schmelzboden', 'Im Hilfsstollen des Silberbergwerks, so wie ihn die FHNW gescannt hat, Erz abbauen. Wo deine Lampe hinfällt, glitzert es in den Wänden: Bleiglanz (silbrig-blaue Würfel) und Zinkblende (honigbraun); weisser Quarz ist taubes Gestein und fast nichts wert. Mit W/S gehen und A/D drehen. Vor einer Erzader E oder Space halten, um sie in den Korb (20 kg) zu schlagen. Einen vollen Korb in einen der Erzkästen an den Schienen leeren, jeder unter einer Laterne. Das Öl reicht sechs Minuten: Wer vorher hinausgeht, dem zählt auch der Korb, und alles gibt ein Fünftel mehr.'],
  ['A guided walk through the Silberberg mine', 'Führung durch das Silberbergwerk mit Jöri, einem Knappen aus alter Zeit, durch die Stollen, wie sie die FHNW per Laserscan erfasst hat: in den Dalvazzerstollen zur heiligen Barbara und über den Steg im Abbau, hinaus und den Hang hinauf zum Hilfsstollen, an den eingemeisselten Jahreszahlen vorbei bis an sein Ende. Folge seiner Lampe und hör ihm zu: Er stellt dir zwei Fragen (Tasten 1–3), eine falsche Antwort kostet 15 Sekunden. Mit W/S gehen und A/D drehen.'],
  ['The horn sledge race of the winter', 'Mit dem Hornschlitten vom Jatzmeder Richtung Glaris fahren: 2 km und 350 Höhenmeter. A/D lenken und lehnen, S bremst mit Fersen und Kette, W duckt dich oder stösst an. Brems vor der Kurve, nicht in ihr: Bist du zu schnell, hebt eine Kufe ab und die Neigungsanzeige wird rot. Dann A/D loslassen und bremsen, sonst kippt der Schlitten. Die Netze aussen in den Kurven fangen dich auf; jeder Sturz kostet fünf Sekunden.'],
  ['The night shift is calling', 'Die Dischma-Loipe in der Nachtschicht präparieren. Mit dem Pistenfahrzeug auf der Spur fahren und die Fräse mit F absenken, bis 90 % der Loipe bearbeitet sind.'],
  ['A skier lies injured', 'Ein Skifahrer auf der Jakobshorn-Standardpiste ist verletzt. Mit dem Rega-Helikopter hinfliegen, tief über ihm schweben oder neben ihm landen, bis er an Bord ist. Dann zum Landeplatz beim Spital zurückfliegen.'],
  ['After the fresh snow', 'Den Hang unter dem Salezer Horn mit dem Lawinenwerfer sichern. Ziehen dreht und hebt das Rohr; nach oben ziehen macht den Winkel steiler. Der weisse Ring zeigt den Auftreffpunkt. Mit Space oder Klick feuern. Zwölf Schuss für vier Zonen.'],
  ['Alert: motorbike crash', 'Motorradunfall an der Flüelapassstrasse. Mit der Rega hinfliegen, auf der markierten Wiese neben der Strasse landen, den Patienten versorgen und zum Spital bringen.'],
  ['Dispatch to patrol Davos', 'Als Polizeipatrouille zum Motorradunfall an der Flüelapassstrasse fahren. Mit K Blaulicht einschalten und vor der Unfallstelle quer parken. Dann zu Fuss (mit F aussteigen) je 50 m vor und hinter dem Unfall Kegel aufstellen und die Rega einweisen.'],
  ['Thirty centimetres of fresh snow', 'Den Zugangsweg an der Dischmastrasse 19 freischaufeln. Space oder „Schaufeln“ halten und den Weg entlanggehen. Wenn der Schieber voll ist oder du loslässt, landet der Schnee auf einem Haufen im Garten. Mindestens 95 % des Weges räumen.'],
  ['A new wing for the Hotel Derby', 'Das Hotel Derby in Davos Dorf bekommt einen neuen Flügel, und der Kranführer ist krank. Geh durchs Baustellentor und steig auf den Turmkran. A und D schwenken, W und S fahren die Laufkatze, E oder Leertaste heben, Q senkt, F hängt die Last an oder aus, V wechselt die Ansicht. Die Last pendelt unter dem Haken: Bremst du zu hart, schwingt sie weiter. Fahr dem Pendeln deshalb mit einer kleinen Bewegung nach. Setz Beton, Armierung und den Jacuzzi fürs Dach sanft auf die markierten Stellen. Später kommt Wind auf.'],
  ['The drifts on the Bündastrasse', 'Die Schneewälle an der Bündastrasse müssen weg. Fahr die Schneefräse neben dem Kipper her, W und S halten das Tempo. Halte den Strahl auf der Ladebrücke: Was daneben landet, ist verloren. V dreht den Auswurf. Ist der Lastwagen voll, steig mit E hinüber, fahr durch Davos Dorf zur Schneedeponie am Davosersee, setz rückwärts mit dem Heck an die Markierung am Ufer und halte E zum Kippen. Schnelle Kurven werfen Schnee von der Ladung. Pass auf den See auf.'],
  ['Forty centimetres overnight', 'Die Bündastrasse mit der Schneefräse auf 300 m von Rand zu Rand räumen. Eine Seite hinauf, wenden, die andere zurück. Unter 13 km/h bleiben, damit die 2,8 m breite Fräse nicht verstopft. Geparkte Autos weder rammen noch zuschütten; V dreht den Auswurf.'],
  ['The Kurpark in Davos Platz', 'Den Rasen im Kurpark beim Carl-Dorno-Weg in Bahnen mähen, bis 93 % geschnitten sind. Die beiden Blumenbeete aussparen: Jeder beschädigte Bereich kostet zwei Sekunden.'],
  ['Tuesday is refuse day', 'Mit dem Kehrichtwagen im Hofquartier zehn Sammelstellen anfahren. Mit dem Heck anhalten, damit die Crew laden kann, und danach bei der KMA entladen. Jede ausgelassene Stelle kostet 45 Sekunden.'],
  ['July, and the Alpenrosen', 'Zwölf blühende Alpenrosenzweige unter dem Strelaberg pflücken. Zu einem blühenden Busch gehen und Space oder „Pflücken“ halten. Unblühende Büsche und das eingezäunte Schutzgebiet meiden; beides gibt Zeitstrafe. Danach zum Start zurückkehren.'],
  ['Late summer rain', 'Zehn Pilze im Dischmawald sammeln oder fünf Minuten lang suchen. Steinpilze und Eierschwämme sind gut; Gallenröhrling, falscher Pfifferling und Fliegenpilz meiden. Das HUD beschreibt den Pilz vor dir. Mit Space oder „Pflücken“ aufnehmen und den Korb zur Pilzkontrolle bringen.'],
  ['Davos Nordic, the World Cup', '4,3-km-Langlaufrennen auf den Flüela-Loipen. Mit 1 klassisch oder mit 2 Skating wählen. W halten, Space im Rhythmus für einen kräftigen Abstoss drücken. Mit Q auf flachen Strecken Doppelstockschub, bergab W loslassen für die Hocke; A/D lenkt, S bremst. Gegen sieben Läufer antreten.'],
  ['Before five in the morning on the road', 'Vor fünf Uhr morgens auf der Strasse unter dem Flüelapass, 2333 m, und 800 Höhenmeter bis zum Gipfel des Schwarzhorns auf 3146 m. Für den Anfang hast du eine Stirnlampe. Der Himmel wird immer heller, während du steigst, und er wartet nicht auf dich. Folge den weiss-rot-weissen Markierungen. Vor der Sonne oben: Gold.'],
  ['A clear day at the Wägerhus', 'Ein klarer Tag beim Wägerhus an der Flüelastrasse, und hinter dem Grat wartet das ganze Jöri-Becken: rund zwanzig kleine Seen unter dem Jörigletscher. Folge den weiss-rot-weissen Markierungen hinauf und hinüber. Bleib auf dem Weg: Je schneller du bist, desto mehr Punkte gibt es.'],
  ['Eighteen lanes of ice on the Arkadenplatz', 'Achtzehn Eisbahnen auf dem Arkadenplatz zwischen Promenade und Kulturplatz, gespielt mit Hockeystock und Puck: Schneewall, Spielertunnel, Bully-Punkt, Bande und die Rampe zur Tribüne. Mit A/D oder der Maus zielen, Space zum Aufladen halten und zum Schiessen loslassen. Auf dem Handy den Puck wie bei einer Schleuder zurückziehen und loslassen. Der Puck gleitet viel weiter, als ein Ball rollt, ein leichter Schlag gewinnt also. Höchstens sieben Schläge pro Loch. Punkte: 7 pro Loch minus deine Schläge (126 minus das Total): 45 Schläge oder weniger sind Gold (Par 42).'],
  ['The nine red Eternit lanes', 'Neun Minigolfbahnen beim Hotel Waldhuus. Mit A/D oder der Maus zielen, Space zum Aufladen halten und zum Schlagen loslassen. Auf dem Handy den Ball wie bei einer Schleuder zurückziehen. Maximal sieben Schläge pro Bahn; ein Ball im Graben kostet einen Schlag. 20 Schläge oder weniger ergeben Gold.'],
  ['The Green Wildman, the Irish pub', 'Darts im Green Wildman: 301 Double Out mit möglichst wenigen Pfeilen. Mit Maus oder W/A/S/D zielen, Space oder Maustaste zum Ausholen halten und im grünen Bereich loslassen. Auf dem Handy auf die Scheibe tippen und nach oben wischen. Der letzte Wurf muss ein Doppel oder Bullseye sein. Höchstens 45 Pfeile.'],
  ["The Schüssla in the Färich", '60 Sekunden in der Schüssla skaten. W gibt Tempo, A/D lenkt. Über die Kante springen: A/D dreht, Space hält einen Grab. Langsam am Rand entlang für einen Grind; mit A/D balancieren, mit Space zurück in die Bowl. Tricks in kurzer Folge bilden Combos; ein Sturz löscht die Combo.'],
  ['A busy day at the Turmhotel Victoria', 'Viel los im Turmhotel Victoria in Davos Dorf, und das halbe Personal liegt mit Grippe im Bett. Geh durch den Personaleingang hinein und hilf aus, wo es dich braucht. Zuerst die Zimmer: Zwei Zimmer müssen bereit sein, bevor die Gäste zurückkommen. Wähl eine Arbeit (Tasten 1–7 oder antippen) und erledige sie mit abwechselnden Wischbewegungen (A und D, die Pfeiltasten oder die zwei Knöpfe); das Schöggeli kommt aufs Kissen, sobald das Bett gemacht ist. Dann die Küche am Mittag: Eine Herdtaste (1–3) setzt die nächste Bestellung auf, dieselbe Taste richtet sie an, im grünen Bereich und bevor sie anbrennt. Zuletzt die Lingerie im Keller: Sortier die Wäsche in Weisses (links) und Buntes (rechts), dann steuer fünf Leintücher gerade durch die grosse Mangel.'],
  ['The shift is over. The Gouvernante nods once', 'Die Schicht ist vorbei. Die Gouvernante nickt einmal, und das zählt im Victoria wie eine Medaille.'],
  ['Rock’n’roll in the Tijuana Bar', 'Rock’n’Roll in der Tijuana Bar an der Talstrasse, und heute Abend kommt der Baumstamm hervor. Nageln ist das Beizenspiel aus den Alpen: Jeder hat seinen Nagel im Stock angeschlagen, pro Zug ein Schlag mit der schmalen Keilseite des Hammers, und wer ihn zuerst ganz versenkt, gewinnt. Geh hinein, dann drei Partien gegen die Leute an der Bar. Eine Taste (Leertaste, Enter oder Antippen): Halte den Hammer über deinem Nagel an und schlag zu, wenn die Kraft im grünen Bereich ist. Zu hart oder neben den Kopf, und der Nagel verbiegt sich, ein Fehlschlag geht ins Holz; beides kostet dich den Zug. Siege und wenige Schläge zahlen sich aus.'],
  ['Morning rush at the Kafi Klatsch', 'Morgenansturm im Kafi Klatsch an der Promenade (auf dem Schild steht Kaffeeklatsch). Geh hinein und stell dich hinter die Theke: Café crème, Schale, Espresso, Latte Macchiato, Cappuccino, Gast um Gast. Für jede Station eine Taste, und nur die aktuelle zählt (Knöpfe, Tasten 1–6 oder einfach die Leertaste): mahlen, tampen, Kaffee beziehen, Milch auf die richtige Temperatur schäumen, giessen, servieren, jedes Mal im grünen Bereich anhalten. Serviere, bevor der Gast aufgibt. Und hör zu: Die Stammgäste sagen dir ihre Bestellung einmal. Beim nächsten Mal heisst es nur noch «wie immer», und wer es sich gemerkt hat, verdient mehr.'],
  ['The stump goes back in the corner', 'Der Baumstamm kommt zurück in die Ecke, der Hammer hinter die Bar. Dein Nagel bleibt im Holz.'],
  ['The rush is over', 'Der Ansturm ist vorbei, das Milchkännchen im Spülbecken. Bis Mittag weiss ganz Davos, wie es lief.'],
  ['Evening in the Rot Liechtli', 'Abend im Rot Liechtli, dem kleinen Pub in Davos Platz, und Zeit für ein richtiges Flämmli. Geh hinein und setz dich an die Bar. Dann folgen drei Runden, alles mit einer Taste (Space, Enter oder Tippen; halten, wo «halten» steht): einen Haufen Zucker in den Espresso, den Espresso trinken, aber den Zucker im Tassli lassen, einen Williams auf den Zucker leeren und anzünden. Jetzt das Tassli schwenken, damit es weiterbrennt, während der Zucker caramelisiert: Die Flamme sinkt von selbst, und jeder Luftzug von der Tür drückt sie herunter; schwenkst du zu wild, schwappt es über die Finger. Ist das Caramel golden, leerst du es brennend ins Shotglas, erstickst die Flamme mit der Hand, bevor das Glas heiss wird, und kippst es. Jedes Flämmli macht die Fenster enger und bringt den Raum zum Schwanken. Nach drei Pannen ruft der Wirt Feierabend.'],
  ['Late night in the Ex Bar', 'Spätnacht in der Ex Bar in Davos Platz, und die Bar hält, was ihr Name verspricht: ex. Ein Flaming Shot wird angezündet, ausgeblasen und in einem Zug getrunken. Geh hinein und setz dich an die Bar. Dann folgen sechs Runden mit einer einzigen Taste (Space, Enter oder Tippen): bestellen, anzünden, wenn das Feuerzeug über dem Glas ist, ausblasen, solange die Flamme im grünen Bereich ist, und kippen, wenn der Rand abgekühlt ist. Jeder Shot macht die Fenster enger und bringt den Raum zum Schwanken. Nach drei Pannen ruft der Barkeeper Feierabend. Du gehst heute Abend übrigens zu Fuss nach Hause.'],
  ['Friday night at Pizza Heaven', 'Freitagabend im Pizza Heaven, dem Pizzakurier an der Promenade, und der Kurier hat sich krankgemeldet. Steig aus dem Lieferwagen (F) und geh in den Laden: Belege vier Pizzas mit den Zutaten auf dem Bon, in der angegebenen Reihenfolge (Tasten 1–8 oder Antippen), schnell und ohne falsche Zutat. Dann bring sie zu vier Adressen vom Eisstadion bis Davos Dorf: parken, die Schachtel hinten aus dem Lieferwagen nehmen und zur Tür tragen. Der Wärmebalken sinkt ab dem Moment, in dem die Pizzas den Laden verlassen, und heisse Pizzas zahlen sich aus.'],
  ['A sunny day on the Parsenn', 'Ein sonniger Tag auf dem Parsenn, und im Radio der Liftbude läuft ein Ländler. Du bist der Liftwart am Hauptertäli-Bügellift: Die Skifahrer kommen paarweise die Spur herauf, und du reichst ihnen den Bügel genau dann, wenn er ankommt. Drücke Space (oder tippe), wenn der Bügel die grüne Markierung erreicht. Zu früh oder zu spät wirft er einen Skifahrer um (sie lachen es weg); tust du nichts, schwingt er leer nach oben. Der Andrang wächst: Der Chef dreht den Lift hoch. Zwei Minuten: Wie viele Skifahrer bringst du hinauf?'],
  ['Saturday morning at Sport Hofmänner', 'Samstagmorgen bei Sport Hofmänner an der Mattastrasse: Die Langläufer wollen ihre Langlaufski gewachst haben. Lies die Schneetemperatur auf der Tafel ab und wähle das Wachs nach seiner Farbe (Tasten 1–5 oder Antippen). Bügle es in einem gleichmässigen Zug pro Ski auf, von der Spitze bis zum Ende: Zieh das Bügeleisen oder halte → / D und halte das Tempo im grünen Band. Zu langsam oder ein heisses Bügeleisen, das stillsteht, verbrennt den Belag. Dann abziehen und bürsten, von der Spitze bis zum Ende (ziehen oder → halten). Zweieinhalb Minuten: Es zählt die Qualität, aber auch die Anzahl Paare.'],
  ['A bluebird winter morning', 'Ein Wintermorgen mit Kaiserwetter, und halb Davos will aufs Jakobshorn. In deiner Warnweste dirigierst du den Parkplatz Jakobshornbahn: Jedes Auto rollt die Gasse auf dich zu, und du winkst es nach links, rechts oder geradeaus (← → ↑ oder die Tasten) dorthin, wo grüne Pfeile freie Plätze zeigen. Winkst du rechtzeitig, parkt es gerade ein; zu spät, und es parkt schräg; ohne Zeichen macht der Fahrer, was er will, vielleicht quer über die Gasse. Wenn Skifahrer direkt vor deinen Füssen queren, halte das Auto an (↓ / Space) und winke es hinter ihnen durch. Zwei Minuten.'],
  ['Last run done, boots still on', 'Letzte Abfahrt geschafft, die Skischuhe noch an: Après-Ski-Party in der Bolgenschanze an der Skistrasse in Davos Platz. Geh hinein und spring mit der Menge: Drücke Space (oder tippe SPRINGEN) genau im Takt, und wenn der DJ zu den Off-Beats wechselt, zwischen den Kicks. Perfekte Treffer zählen mehr, eine Serie vervielfacht deine Punkte bis ×5. Ein Track, 60 Sekunden.'],
  ['A school morning at the SAMD', 'Ein Schulmorgen an der SAMD, der Schweizerischen Alpinen Mittelschule an der Guggerbachstrasse. Gian und Mätti, zwei Internatsschüler mit nichts Besserem zu tun, schleichen sich in der grossen Pause aufs Flachdach. Geh zur Seitentür bei der Einfahrt, dann leg dich an die Brüstung: Unten ist der Pausenhof voll. Das Fadenkreuz bewegst du mit der Maus, durch Ziehen oder mit W/A/S/D; halt die Taste oder die Leertaste zum Aufziehen (grösser: mehr Punkte, langsamer aus dem Mund), lass los, und er fällt. Er fällt zwei Sekunden lang: Halte bei den Leuten vor und achte auf den Wind (der Pfeil). Der Rektor gibt am meisten, der Velofahrer ist schnell. Finger weg vom Hund, vom Chindsgi-Kind und von der Hausmutter. Jeder Treffer lässt den Hof hochschauen: Halte C zum Abtauchen, bis es sich beruhigt, sonst kommt der Hausmeister durch die Dachluke. Nach 2:30 läutet die Glocke.'],
];
// Mission places in running text: [after "bis" (distance), after "geh" (walk in)]
const placeDe = new Map([
  ['the Turmhotel Victoria', ['zum Turmhotel Victoria', 'ins Turmhotel Victoria']],
  ['the Tijuana Bar', ['zur Tijuana Bar', 'in die Tijuana Bar']], ['the Kafi Klatsch', ['zum Kafi Klatsch', 'ins Kafi Klatsch']],
  ['the Bahnhof Davos Dorf', ['zum Bahnhof Davos Dorf', '']], ['the Promenade gate', ['zur Schleuse Promenade', '']], ['the Scalettastrasse gate', ['zur Schleuse Scalettastrasse', '']], ['the Kurgartenstrasse gate', ['zur Schleuse Kurgartenstrasse', '']], ['the Talstrasse gate', ['zur Schleuse Talstrasse', '']], ['the Scalettastrasse', ['zur Scalettastrasse', '']], ['the Kongresszentrum', ['zum Kongresszentrum', '']], ['the rally point', ['zum Kundgebungsplatz', '']], ['the police liaison', ['zur Polizei-Verbindungsperson', '']],
  ['the flag', ['zum Fähnli', '']], ['the bench', ['zum Bänkli', '']], ['the Spital Davos', ['zum Spital Davos', '']],
  ['the Rot Liechtli', ['zum Rot Liechtli', 'ins Rot Liechtli']], ['the Ex Bar', ['zur Ex Bar', 'in die Ex Bar']], ['Pizza Heaven', ['zu Pizza Heaven', 'ins Pizza Heaven']],
  ['the Bolgenschanze', ['zur Bolgenschanze', 'in die Bolgenschanze']], ['the BOX', ['zur BOX', 'in die BOX']],
  ['the loading point', ['zur Einstiegsstelle', '']], ['your place', ['zu deinem Platz', '']],
  ['Meerkämper Optik', ['zu Meerkämper Optik', '']], ['the SLF', ['zum SLF', '']], ['the measuring field', ['zum Versuchsfeld', '']],
  ['the Eisstadion, Talstrasse 41', ['zum Eisstadion, Talstrasse 41', '']],
  ['the Kongresszentrum, Talstrasse 49a', ['zum Kongresszentrum, Talstrasse 49a', '']],
  ['the Hotel Seehof, Promenade 159', ['zum Hotel Seehof, Promenade 159', '']],
  ['Museumstrasse 2, Davos Dorf', ['zur Museumstrasse 2, Davos Dorf', '']]
]);
const POP = '((?:  [+\\-−]?\\d+)?)'; // a feedback popup's points, after two spaces

/** The golf mission's generated texts (js/missions-golf.js, js/missions-data-golf.js): the card, the plan, the report */
const GOLF_CLUB_DE = { Driver: 'Driver', '3 Wood': 'Holz 3', '7 Iron': 'Eisen 7', Wedge: 'Wedge', Putter: 'Putter' };
const GOLF_LIE_DE = { Tee: 'Abschlag', Fairway: 'Fairway', Green: 'Grün', Rough: 'Rough', Bunker: 'Bunker', Water: 'Wasser', 'Out of bounds': 'Aus' };
const GOLF_STRIKE_DE = { 'Perfect strike': 'Perfekt getroffen', 'Slight draw': 'Leichter Draw', 'Slight fade': 'Leichter Fade', Hook: 'Hook', Slice: 'Slice' };
const GOLF_SCORE_DE = { 'Hole in one!': 'Hole-in-one!', 'Double bogey': 'Doppel-Bogey', 'Triple bogey': 'Triple-Bogey' };
const golfPartDe = (p) => p.replace(/^(\d+) m (further|shorter|long|short|right|left)$/, (_, n, w) => `${n} m ${{ further: 'weiter', shorter: 'kürzer', long: 'zu lang', short: 'zu kurz', right: 'rechts', left: 'links' }[w]}`);
const GOLF_CLUBS = '(Driver|3 Wood|7 Iron|Wedge|Putter)', GOLF_LIES = '(Tee|Fairway|Green|Rough|Bunker|Water|Out of bounds)';
function golfDe(t) {
  if (!/(?:Hole|Stroke|Pin|full (?:swing|stroke)|the pin needs|wind|Carry|Putt|Early|Late|Wind|Tip|Tapped|Picked|on a par| m · | m to the pin|%| −\d+ %| \(\d\)$)/.test(t)) return t;
  return t
    .replace(/^Hole (\d+) · Par (\d) · (\d+) m · Stroke (\d+) · Total (.+)$/, 'Loch $1 · Par $2 · $3 m · Schlag $4 · Total $5')
    .replace(/^Hole (\d+) · Par (\d)( · \d+ m)?$/, 'Loch $1 · Par $2$3')
    .replace(/^Stroke (\d+) · (\d+) m to the pin · (.+)$/, (_, n, d, lie) => `Schlag ${n} · ${d} m zur Fahne · ${GOLF_LIE_DE[lie] || lie}`)
    .replace(/^Pin (\d+) m$/, 'Fahne $1 m')
    .replace(new RegExp(`^${GOLF_CLUBS}: full (swing|stroke) (\\d+) m$`), (_, c, k, d) => `${GOLF_CLUB_DE[c]}: ${k === 'swing' ? 'voller Schwung' : 'voller Putt'} ${d} m`)
    .replace(new RegExp(`^${GOLF_CLUBS} \\((\\d)\\)$`), (_, c, n) => `${GOLF_CLUB_DE[c]} (${n})`)
    .replace(/^the pin needs (\d+) %$/, 'zur Fahne braucht es $1 %')
    .replace(/^wind ([+−]\d+ m)$/, 'Wind $1')
    .replace(new RegExp(`^${GOLF_LIES} −(\\d+) %$`), (_, l, n) => `${GOLF_LIE_DE[l]} −${n} %`)
    .replace(/^Carry (\d+) m, rolled (\d+) m$/, 'Flug $1 m, gerollt $2 m').replace(/^Carry (\d+) m$/, 'Flug $1 m')
    .replace(/^Early: hook, (\d+) m left$/, 'Zu früh: Hook, $1 m nach links').replace(/^Late: slice, (\d+) m right$/, 'Zu spät: Slice, $1 m nach rechts')
    .replace(/^(Wind|Pin): (.+)$/, (whole, k, parts) => (/^\d+ m \w+(, \d+ m \w+)?$/.test(parts) ? `${k === 'Pin' ? 'Fahne' : 'Wind'}: ${parts.split(', ').map(golfPartDe).join(', ')}` : whole))
    .replace(/^Tip: (\d+) % power, the pin needed (\d+) % \(the red mark\)$/, 'Tipp: $1 % Kraft, zur Fahne hätte es $2 % gebraucht (die rote Marke)')
    .replace(new RegExp(`^${GOLF_CLUBS} (\\d+)% · (Perfect strike|Slight draw|Slight fade|Hook|Slice)$`), (_, c, p, a) => `${GOLF_CLUB_DE[c]} ${p} % · ${GOLF_STRIKE_DE[a]}`)
    .replace(/^(\d+)% · (Perfect strike|Slight draw|Slight fade|Hook|Slice)$/, (_, p, a) => `${p} % · ${GOLF_STRIKE_DE[a]}`)
    .replace(new RegExp(`^(\\d+) m · ${GOLF_LIES}$`), (_, d, l) => `${d} m · ${GOLF_LIE_DE[l]}`)
    .replace(new RegExp(`^${GOLF_LIES} · (\\d+) m to the pin$`), (_, l, d) => `${GOLF_LIE_DE[l]} · ${d} m zur Fahne`)
    .replace(/^(Tapped in|Picked up): (.+)$/, (_, k, n) => `${k === 'Tapped in' ? 'Eingelocht' : 'Aufgehoben'}: ${GOLF_SCORE_DE[n] || n}`)
    .replace(/^(.+): (\d+) on a par (\d)( · bonus \+(\d+))?$/, (_, n, s, p, b, bonus) => `${GOLF_SCORE_DE[n] || n}: ${s} auf Par ${p}${b ? ` · Bonus +${bonus}` : ''}`);
}
const sourceText = new WeakMap();
const sourceAttributes = new WeakMap();
const translatedText = new WeakMap();
const translatedAttributes = new WeakMap();
const attributes = ['title', 'aria-label', 'placeholder', 'alt'];

let language = (() => {
  try { const saved = localStorage.getItem(STORAGE_KEY); if (saved === 'de' || saved === 'en') return saved; } catch {}
  return /^de(?:-|$)/i.test(navigator.language || '') ? 'de' : 'en';
})();

function translate(value) {
  if (typeof value !== 'string') return value ?? '';
  if (language === 'en') return value;
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(value);
  const translated = enToDe.get(match[2]);
  if (translated) return match[1] + translated + match[3];
  const intro = missionIntros.find(([start]) => match[2].startsWith(start));
  if (intro) return match[1] + intro[1] + match[3];
  let dynamic = golfDe(match[2]).replace(/^(\d+) streets · ([\d,.]+) blocks$/, '$1 Strassen · $2 Blöcke');
  // a helicopter flown back to its pad while the player was away (js/gta.js returnStrays)
  dynamic = dynamic.replace(/^The crew flew the (.+) back to (.+)$/, (_, what, where) => `Die Crew hat den ${what} zurück nach ${translate(where)} geflogen`);
  // the jetpack demo (js/missions-data-jetpack.js, js/missions-jetpack.js)
  dynamic = dynamic.replace(/^Gate (\d+\/\d+): (.+) · ([\d,.]+ (?:m|km)) · (?:(level)|(\d+) m (up|down))$/, (_, n, where, d, level, dy, dir) => `Tor ${n}: ${translate(where)} · ${d} · ${level ? 'gleiche Höhe' : `${dy} m ${dir === 'up' ? 'höher' : 'tiefer'}`}`);
  dynamic = dynamic.replace(/^Gate (\d+\/\d+)$/, 'Tor $1').replace(/^Refuelling … (\d+) %$/, 'Tanken … $1 %');
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) to the pit crew on the Promenade · tank (\d+) %$/, '$1 bis zur Boxencrew an der Promenade · Tank $2 %').replace(/^([\d,.]+ (?:m|km)) to the terrace · tank (\d+) %$/, '$1 bis zur Terrasse · Tank $2 %');
  dynamic = dynamic.replace(/^(\d+:\d\d) in the air · (\d+) % of a tank burned · (?:(\d+) tumbles? · (\d+) walls? \(\+(\d+) s\)|a clean flight: no penalties)$/, (_, time, pct, tu, w, s) => `${time} in der Luft · ${pct} % einer Tankfüllung verbrannt · ${tu === undefined ? 'sauber geflogen: keine Strafzeit' : `${tu} ${tu === '1' ? 'Purzelbaum' : 'Purzelbäume'} · ${w} ${w === '1' ? 'Wand' : 'Wände'} (+${s} s)`}`);
  // avalanche blasting from the helicopter (js/missions-data-heliblast.js)
  {
    const left = (n) => `${n === '1' ? 'noch 1 Ladung' : `noch ${n} Ladungen`}`;
    const dirDe = { N: 'N', NE: 'NO', E: 'O', SE: 'SO', S: 'S', SW: 'SW', W: 'W', NW: 'NW' };
    dynamic = dynamic
      .replace(/^The slope is going · (\d+) charges? left$/, (_, n) => `Der Hang geht ab · ${left(n)}`)
      .replace(/^Charge away · fuse (\d+) s · (\d+) charges? left$/, (_, f, n) => `Ladung unterwegs · Zündschnur ${f} s · ${left(n)}`)
      .replace(/^Hover (\d+)–(\d+) m over the slope · now (\d+) m · (\d+) charges? left$/, (_, a, b, h, n) => `Schwebe ${a}–${b} m über dem Hang · jetzt ${h} m · ${left(n)}`)
      .replace(/^([\d.]+ (?:m|km)) (N|NE|E|SE|S|SW|W|NW) · (Jakobshorn, north flank|Jakobshorn, east flank above the Teufi|Dorftälli below the Weissfluhjoch|Weissfluh, east flank)$/, (_, d, dir, where) => `${d} ${dirDe[dir]} · ${translate(where)}`)
      .replace(/^Missed by (\d+) m: \+10 s$/, 'Daneben um $1 m: +10 s')
      .replace(/^(\d+) charges? thrown · (\d+) zones? released · (\d+) missed · (\d+) in the powder cloud \((?:\+(\d+) s|no penalties)\)$/, (_, t, z, m, c, s) => `${t} ${t === '1' ? 'Ladung' : 'Ladungen'} geworfen · ${z} ${z === '1' ? 'Zone' : 'Zonen'} ausgelöst · ${m} daneben · ${c}-mal in der Staubwolke (${s ? `+${s} s` : 'keine Strafzeit'})`);
  }
  // the long break on the SAMD's roof (js/missions-data-samd.js)
  dynamic = dynamic
    .replace(/^([\d.]+ (?:m|km)) to the side door of the SAMD$/, '$1 bis zur Seitentür der SAMD')
    .replace(/^(-?\d+) pts · (\d+:\d\d) left(?: · combo ×([\d.]+))?$/, (_, p, left, c) => `${p} Pkt. · noch ${left}${c ? ` · Kombo ×${c}` : ''}`)
    .replace(/^(\d+) gobs? · (\d+) hits? · best run ×(\d+) · the Rektor (\d+)× · (\d+) off limits$/, (_, g, h, r, k, f) => `${g} Rotzer · ${h} Treffer · beste Serie ×${r} · der Rektor ${k}× · ${f}-mal tabu`)
    .replace(/^Caught by the Hausmeister: −(\d+) for the detention$/, 'Vom Hausmeister erwischt: −$1 fürs Nachsitzen');
  // the machinist on the Parsennbahn (js/missions-data-parsenn.js)
  dynamic = dynamic
    .replace(/^(Davos Dorf|Höhenweg) · boarding (\d+)\/(\d+) · departure (\d+:\d\d)$/, '$1 · Einsteigen $2/$3 · Abfahrt $4')
    .replace(/^Doors closed · departure (\d+:\d\d)(?: \(in (\d+) s\))?$/, (_, c, n) => `Türen zu · Abfahrt ${c}${n ? ` (in ${n} s)` : ''}`)
    .replace(/^(Höhenweg|Weissfluhjoch) · ([+−][\d.]+ c?m) from the board$/, '$1 · $2 von der Tafel')
    .replace(/^(Höhenweg|Weissfluhjoch) · the passengers get off$/, '$1 · Die Fahrgäste steigen aus')
    .replace(/^(Höhenweg|Weissfluhjoch): (\d+) pts$/, '$1: $2 Pkt.')
    .replace(/^Too fast: limit (\d+) km\/h$/, 'Zu schnell: Limit $1 km/h')
    .replace(/^(.+) – (.+): departure ([+−]\d+ s)( \(horn\))? · arrival ([+−]\d+ s) · ([+−][\d.]+ c?m) · ride (\d+)\/50 → (\d+) pts$/, (_, a, b, dep, horn, arr, e, ride, p) => `${a} – ${b}: Abfahrt ${dep}${horn ? ' (Hornsignal)' : ''} · Ankunft ${arr} · ${e} · Fahrt ${ride}/50 → ${p} Pkt.`);
  // the paraglider flight (js/missions-data-paraglide.js)
  dynamic = dynamic.replace(/^(\d+) pts · ([\d,.]+ (?:m|km)) from the launch · field ([\d,.]+ (?:m|km))$/, '$1 Pkt. · $2 vom Startplatz · Landeplatz $3');
  dynamic = dynamic.replace(/^(\d+:\d\d) in the air · ([\d,.]+ (?:m|km)) from the launch · (\d+) m highest · (.+)$/, (_, time, d, h, how) => `${time} in der Luft · ${d} vom Startplatz · höchstens ${h} m · ${how === 'still in the air' ? 'noch in der Luft' : how === 'crash landing' ? 'Bruchlandung' : how === 'landed out' ? 'ausserhalb gelandet' : how.replace(/^on the field, (\d+) m from the cross$/, 'auf dem Landeplatz, $1 m vom Kreuz')}`);
  // the free flight's landing (js/paraglide-free.js) and its list (js/leaderboard-overview.js)
  dynamic = dynamic.replace(/^([\d.]+ (?:m|km)) from the launch( · personal best!)?( · rank (\d+) of (\d+))?$/, (_, d, best, _r, rank, of) => `${d} vom Startpunkt${best ? ' · persönlicher Rekord!' : ''}${rank ? ` · Rang ${rank} von ${of}` : ''}`);
  // the medicine round by cargo bike (js/missions-data-pharmacy.js, js/missions-pharmacy.js)
  dynamic = dynamic.replace(/^Insulin cold for (\d+:\d\d) · (.+) to (.+)$/, (_, c, d, w) => `Insulin noch ${c} kalt · ${d} bis ${w}`).replace(/^The insulin is warm \(\+45 s\) · (.+) to (.+)$/, (_, d, w) => `Das Insulin ist warm (+45 s) · ${d} bis ${w}`);
  dynamic = dynamic.replace(/^Delivered (\d+\/\d+) · next (.+), ([\d,.]+ (?:m|km))(?: · fragile (\d+) %)?$/, (_, n, where, d, f) => `Abgegeben ${n} · nächste: ${where}, ${d}${f ? ` · zerbrechlich ${f} %` : ''}`);
  dynamic = dynamic.replace(/^Delivered (\d+\/\d+)$/, 'Abgegeben $1').replace(/^Crate empty · (.+) to the pharmacy$/, (_, d) => `Kiste leer · ${d} bis zur Apotheke`).replace(/^Handing over … (\d+) %$/, 'Übergabe … $1 %');
  dynamic = dynamic.replace(/^Delivered: (.+)$/, (_, what) => `Abgegeben: ${translate(what)}`).replace(/^(.+) broken: \+30 s$/, (_, what) => `${translate(what)} kaputt: +30 s`);
  dynamic = dynamic.replace(/^(Bump|Crash)! The glass at (\d+) %$/, (_, what, n) => `${what === 'Bump' ? 'Rumms' : 'Unfall'}! Das Glas noch bei ${n} %`);
  dynamic = dynamic.replace(/^(\d+) of (\d+) parcels delivered · insulin (?:after (\d+:\d\d)|not delivered)( \(warm, \+45 s\))?$/, (_, a, b, at, warm) => `${a} von ${b} Paketen abgegeben · Insulin ${at ? `nach ${at}` : 'nicht abgegeben'}${warm ? ' (warm, +45 s)' : ''}`);
  dynamic = dynamic.replace(/^(\d+) bumps? · (\d+) crash(?:es)? · (?:(\d+) broken \(\+(\d+) s\)|the glass arrived whole)$/, (_, b, c, k, s) => `${b} ${b === '1' ? 'Rumms' : 'Rummse'} · ${c} ${c === '1' ? 'Unfall' : 'Unfälle'} · ${k ? `${k} kaputt (+${s} s)` : 'das Glas kam ganz an'}`);
  // the WEF week (js/missions-data-wef.js)
  dynamic = dynamic.replace(/^(.+) to go · stage (\d+) of (\d+)$/, 'noch $1 · Etappe $2 von $3');
  dynamic = dynamic.replace(/ · under 30 km\/h$/, ' · unter 30 km/h').replace(/ · stop ahead of the limousines$/, ' · vor den Limousinen anhalten');
  dynamic = dynamic.replace(/^The delegation is boarding … (\d+) s$/, 'Die Delegation steigt ein … $1 s').replace(/^The door opens … (\d+) s$/, 'Die Tür geht auf … $1 s');
  dynamic = dynamic.replace(/^Cohesion (\d+) % · composure (\d+) · (\d+) crashes · (\d+) gates rushed$/, 'Zusammenhalt $1 % · Fassung $2 · $3 Unfälle · $4 Schleusen zu schnell');
  dynamic = dynamic.replace(/^(\d+) marchers · chant (\d+) % · on the route (\d+) % · goodwill (\d+)$/, '$1 Leute · Sprechchor $2 % · auf der Route $3 % · Wohlwollen $4');
  dynamic = dynamic.replace(/^(\d+) marchers · ([\d,.]+ (?:m|km)) on the Promenade$/, '$1 Leute · noch $2 auf der Promenade');
  dynamic = dynamic.replace(/^(\d+) marchers · ([\d,.]+ (?:m|km)) to (.+)$/, (whole, n, d, label) => (placeDe.has(label) ? `${n} Leute · ${d} bis ${placeDe.get(label)[0]}` : whole));
  dynamic = dynamic.replace(/^Everybody stands still … (\d+) s$/, 'Alle stehen still … $1 s').replace(/^Sit-in … (\d+) s$/, 'Sitzstreik … $1 s').replace(/^The closing speech … (\d+) s$/, 'Die Schlussrede … $1 s');
  // winter driving: summer tyres on the Flüela, snow chains over Clavadel (js/missions-data-winterroad.js)
  {
    const placeW = { 'the Wägerhus': 'zum Wägerhus', 'the Wägerhütta': 'zur Wägerhütta', 'the Flüela Hospiz': 'zum Flüela Hospiz', Islen: 'Islen', Clavadel: 'Clavadel', Frauenkirch: 'Frauenkirch' };
    const times = (n) => (n ? ` · ${n}-mal im Schneewall` : '');
    dynamic = dynamic
      .replace(/^([\d.]+ (?:m|km)) to (the Wägerhus|the Wägerhütta|the Flüela Hospiz|Islen|Clavadel|Frauenkirch) · (\d+) km\/h(?: · (\d+) times? in the snowbank)?$/, (_, d, p, v, n) => `${d} bis ${placeW[p]} · ${v} km/h${times(n)}`)
      .replace(/^Chains on (\d) of 2 wheels(?: · go to the (left|right) rear wheel)?$/, (_, n, s) => `Ketten an ${n} von 2 Rädern${s ? ` · geh zum ${s === 'left' ? 'linken' : 'rechten'} Hinterrad` : ''}`)
      .replace(/^(Left|Right) rear wheel: (lay the chain out|pull it over the tyre|tension the chain)$/, (_, s, w) => `Hinterrad ${s === 'Left' ? 'links' : 'rechts'}: ${{ 'lay the chain out': 'Kette auslegen', 'pull it over the tyre': 'über den Pneu ziehen', 'tension the chain': 'Kette spannen' }[w]}`)
      .replace(/^Chains rattling at (\d+) km\/h: slow down below 50!$/, 'Die Ketten rasseln bei $1 km/h: unter 50 bremsen!')
      .replace(/^Wheelspin (\d+) s · (\d+) times? in the snowbank · (\d+) (crash|crashes)$/, (_, s, n, c, w) => `Durchdrehen ${s} s · ${n}-mal im Schneewall · ${c} ${w === 'crash' ? 'Unfall' : 'Unfälle'}`)
      .replace(/^(\d+) chains? slipped · top speed (\d+) km\/h · (\d+) times? in the snowbank$/, '$1-mal Kette abgerutscht · Höchsttempo $2 km/h · $3-mal im Schneewall');
  }
  // the local missions (js/missions-data-local.js, js/missions-local.js; before the generic rules below)
  {
    const whyDe = { 'too close': 'zu nah', 'you are running': 'du rennst', 'the wind carries your scent': 'der Wind trägt deine Witterung hin' };
    const ibexDe = { kid: 'ein Kitz', 'nanny (female)': 'eine Geiss', 'young buck': 'ein junger Bock', 'old buck': 'ein alter Bock' };
    dynamic = dynamic
      .replace(/^The van is ([\d.]+ k?m) away: drive closer to (.+)$/, (_, d, where) => `Der Bus ist ${d} weg: fahr näher heran · ${where}`)
      .replace(/^Fetch crates at the brewery door \((\d+\/\d+)\)$/, 'Hol Kisten an der Brauereitür ($1)')
      .replace(/^Stow them in the back of the van \((\d+\/\d+)\)$/, 'Verstau sie hinten im Bus ($1)')
      .replace(/^Carry the crate in · (.+)$/, (_, d) => `Trag die Kiste hinein · ${d}`)
      .replace(/^(\d+:\d\d) · (?:(late!)|(\d+) min to 7:00) · ([\d.]+ k?m) to the (.+)$/, (_, clock, late, n, d, hotel) => `${clock} · ${late ? 'zu spät!' : `noch ${n} min bis 7:00`} · ${d} zum ${hotel}`)
      .replace(/^([\d.]+ k?m) to (the bakery|the Eichhörnliplatz)$/, (_, d, w) => `${d} bis ${w === 'the bakery' ? 'zur Bäckerei' : 'zum Eichhörnliplatz'}`)
      .replace(/^([\d.]+ k?m) to the stand · the herd is uneasy: (too close|you are running|the wind carries your scent)$/, (_, d, why) => `${d} bis zum Hochsitz · die Herde wird unruhig: ${whyDe[why]}`)
      .replace(/^(\d+) rounds? · (-?\d+) pts · herd ([\d.]+ k?m)$/, (_, n, p, d) => `${n} Schuss · ${p} Pkt. · Herde ${d}`)
      .replace(/^Not allowed: a (kid|nanny \(female\)|young buck|old buck)! Fine and penalty( \([+\-−]?\d+\))?$/, (_, a, pts) => `Nicht erlaubt: ${ibexDe[a]}! Busse und Strafpunkte${pts || ''}`)
      .replace(/^Clean shot on the buck \((\d+) cm horns\) at (\d+) m( \([+\-−]?\d+\))?$/, 'Sauberer Schuss auf den Bock ($1 cm Hörner) auf $2 m$3')
      .replace(/^(\d+) fed · (-?\d+) pts · (\d+:\d\d)(?: · streak (\d+))?$/, (_, n, p, c, s) => `${n} gefüttert · ${p} Pkt. · ${c}${s ? ` · Serie ${s}` : ''}`)
      .replace(/^(\d+) km\/h · ([\d.]+ k?m) to the pool$/, (_, v, d) => `${v} km/h · noch ${d} bis zum Becken`)
      .replace(/^(\d+:\d\d) left$/, 'noch $1')
      .replace(/^(\d+) m to go$/, 'noch $1 m');
    // (a shot of the ibex hunt in the end panel: its line and its points in brackets)
    dynamic = dynamic.replace(/^(.+?) (\([+\-−]?\d+\))$/, (whole, head, pts) => (enToDe.has(head) ? `${enToDe.get(head)} ${pts}` : whole));
  }
  // gastro / resort / après-ski missions (before the generic rules below, which would mangle these)
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) to (.+?)( · .+)?$/, (whole, d, label, rest) => (placeDe.has(label) ? `${d} bis ${placeDe.get(label)[0]}${rest || ''}` : whole));
  dynamic = dynamic.replace(/^Get out \(F\) and walk into (.+)$/, (whole, label) => (placeDe.get(label)?.[1] ? `Steig aus (F) und geh ${placeDe.get(label)[1]}` : whole));
  // the crane at the Hotel Derby, the snow haul (js/missions-data-work.js)
  const craneLoadDe = { 'concrete bucket': 'Betonkübel', 'rebar bundle': 'Armierungsbund', 'hotel jacuzzi': 'Hotel-Jacuzzi' };
  const craneHits = (rest) => (rest || '').replace(/ · (\d+) hits?$/, (_, n) => ` · ${n} Treffer`);
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) to the crane ladder$/, '$1 bis zur Kranleiter');
  dynamic = dynamic.replace(/^Take the (concrete bucket|rebar bundle|hotel jacuzzi): ([\d.]+) m off · ([\d.]+) m above · swing ([\d.]+) m( · \d+ hits?)?$/, (_, l, d, h, s, rest) => `${craneLoadDe[l]} anhängen: ${d} m daneben · ${h} m darüber · Pendeln ${s} m${craneHits(rest)}`);
  dynamic = dynamic.replace(/^Set the (concrete bucket|rebar bundle|hotel jacuzzi) down: ([\d.]+) m off · ([\d.]+) m above · swing ([\d.]+) m( · \d+ hits?)?$/, (_, l, d, h, s, rest) => `${craneLoadDe[l]} absetzen: ${d} m daneben · ${h} m darüber · Pendeln ${s} m${craneHits(rest)}`);
  dynamic = dynamic.replace(/^Take the (concrete bucket|rebar bundle|hotel jacuzzi)( · \d+ hits?)?$/, (_, l, rest) => `${craneLoadDe[l]} anhängen${craneHits(rest)}`);
  dynamic = dynamic.replace(/^([\d.]+) m off the mark( · \d+ hits?)?$/, (_, d, rest) => `${d} m neben der Markierung${craneHits(rest)}`);
  dynamic = dynamic.replace(/^Set down: (.+)$/, 'Abgesetzt: $1');
  dynamic = dynamic.replace(/^Set down  \+(\d+)$/, 'Abgesetzt  +$1');
  dynamic = dynamic.replace(/^Hard landing  -(\d+)$/, 'Harte Landung  -$1');
  dynamic = dynamic.replace(/^Hit!  -(\d+)$/, 'Getroffen!  -$1');
  dynamic = dynamic.replace(/^Next: the (concrete bucket|rebar bundle|hotel jacuzzi) in the yard$/, (_, l) => `Als Nächstes: ${craneLoadDe[l]} auf dem Werkplatz`);
  // the other work missions' generated lines (js/missions-data-work.js, js/missions-work.js)
  dynamic = dynamic.replace(/^Parked car hit! \+([\d.]+) s$/, 'Parkiertes Auto angefahren! +$1 s').replace(/^Flower bed! \+([\d.]+) s$/, 'Blumenbeet! +$1 s');
  dynamic = dynamic.replace(/^Not in flower: bush damaged \+([\d.]+) s$/, 'Nicht in Blüte: Strauch beschädigt +$1 s').replace(/^Into the basket \((\d+\/\d+)\)$/, 'In den Korb ($1)');
  dynamic = dynamic.replace(/^Picking … (\d+) %$/, 'Pflücken … $1 %').replace(/^Loading … (\d+) %$/, 'Laden … $1 %').replace(/^To the KMA · ([\d,.]+ (?:m|km))$/, 'Zur KMA · $1');
  dynamic = dynamic.replace(/^(.+) · Space: into the basket$/, (whole, desc) => (enToDe.has(desc) ? `${enToDe.get(desc)} · Space: in den Korb` : whole));
  if (/^\d+× /.test(dynamic)) dynamic = dynamic.split(' · ').map((p) => p.replace(/^(\d+)× (.+) ([+-]?\d+)$/, (whole, n, kind, pts) => (enToDe.has(kind) ? `${n}× ${enToDe.get(kind)} ${pts}` : whole))).join(' · ');
  dynamic = dynamic.replace(/^(\d+) parked cars? hit \(\+([\d.]+) s\) · cars buried for (\d+) s \(\+(\d+) s\)$/, (_, n, a, b, c) => `${n} ${n === '1' ? 'parkiertes Auto' : 'parkierte Autos'} angefahren (+${a} s) · Autos ${b} s lang zugeschüttet (+${c} s)`);
  dynamic = dynamic.replace(/^Lawn mown (.+) of (.+) · beds trodden (\d+) \(\+([\d.]+) s\)$/, 'Rasen gemäht: $1 von $2 · Beete zertrampelt $3 (+$4 s)');
  dynamic = dynamic.replace(/^(\d+) points? left out \(\+([\d.]+) s\)$/, (_, n, s) => `${n} ${n === '1' ? 'Sammelstelle' : 'Sammelstellen'} ausgelassen (+${s} s)`);
  // the first missions (js/missions-data.js: the Dischma trail, Rega, avalanche blasting, the motorbike crash)
  dynamic = dynamic.replace(/^Trail (\d+) % groomed · ([\d,.]+ (?:m|km)) of ([\d,.]+ (?:m|km))$/, 'Loipe $1 % präpariert · $2 von $3');
  dynamic = dynamic.replace(/^(Landed|Rescue under way|Treating the patient|Vehicle in position|Placing the cone) … (\d+) s$/, (_, what, n) => `${{ Landed: 'Gelandet', 'Rescue under way': 'Rettung läuft', 'Treating the patient': 'Patient wird versorgt', 'Vehicle in position': 'Fahrzeug in Position', 'Placing the cone': 'Kegel wird aufgestellt' }[what]} … ${n} s`);
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) · hover low over the casualty \(< 3 m\) or land$/, '$1 · tief über dem Verletzten schweben (< 3 m) oder landen');
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) to the Spital Rega pad$/, '$1 bis zum Rega-Landeplatz beim Spital').replace(/^([\d,.]+ (?:m|km)) to the Flüelapassstrasse$/, '$1 bis zur Flüelapassstrasse');
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) to the landing zone \(meadow south of the road\)$/, '$1 bis zum Landeplatz (Wiese südlich der Strasse)');
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) to the marker, stand there for 2 s$/, '$1 bis zur Markierung, dort 2 s stehen bleiben');
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) · (\d+) rounds? left( · (\d+) missed)?$/, (_, d, n, m, k) => `${d} · noch ${n} Schuss${m ? ` · ${k} daneben` : ''}`);
  dynamic = dynamic.replace(/^(\d+) (?:hit|hits) · (\d+) hard (?:landing|landings)$/, (_, a, b) => `${a} Treffer · ${b} harte ${b === '1' ? 'Landung' : 'Landungen'}`);
  dynamic = dynamic.replace(/^Truck ([\d.]+) of (\d+) m³ · (\d+) % on the bed$/, 'Lastwagen $1 von $2 m³ · $3 % auf der Brücke');
  dynamic = dynamic.replace(/^([\d.]+) m³ on board$/, '$1 m³ geladen');
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) to the snow dump · ([\d.]+) m³$/, '$1 bis zur Schneedeponie · $2 m³');
  dynamic = dynamic.replace(/^([\d.]+) m³ left on the bed$/, 'Noch $1 m³ auf der Brücke');
  dynamic = dynamic.replace(/^Tail to the mark, nose away from the water: ([\d.]+) m$/, 'Heck zur Markierung, Front weg vom Wasser: $1 m');
  dynamic = dynamic.replace(/^Knocked the truck  -(\d+)$/, 'Lastwagen gerammt  -$1');
  dynamic = dynamic.replace(/^([\d.]+) of (\d+) m³ in the lake · ([\d.]+) m³ beside the truck · ([\d.]+) m³ lost in bends$/, '$1 von $2 m³ im See · $3 m³ neben dem Lastwagen · $4 m³ in Kurven verloren');
  dynamic = dynamic.replace(/^(\d+) (?:knock|knocks) against the truck$/, (_, n) => `${n} Rempler am Lastwagen`);
  dynamic = dynamic.replace(/(\d+) % hot\b/g, '$1 % heiss');
  // (the Sommerrodelbahn: js/missions-data-sledge.js)
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) to the finish(?: · (.+))?$/, (_, d, rest) => `${d} bis zum Ziel${rest ? ` · ${tobogganDe(rest)}` : ''}`);
  dynamic = dynamic.replace(/^(\d+ (?:bump|bumps) · \d+ (?:ram|rams)) · top speed (\d+) km\/h$/, (_, c, v) => `${tobogganDe(c)} · Höchsttempo ${v} km/h`);
  dynamic = dynamic.replace(/^Over the wall! \+(\d+) s$/, 'Über die Wand! +$1 s');
  // (the horn sledge, the bike race, the slalom: js/missions-data-sledge.js, js/missions-data-snow.js, js/missions-snow.js)
  dynamic = dynamic.replace(/^(Into the net|Off the run|Tipped over)! \+(\d+) s$/, (_, w, n) => `${{ 'Into the net': 'Ins Netz', 'Off the run': 'Von der Bahn abgekommen', 'Tipped over': 'Umgekippt' }[w]}! +${n} s`);
  dynamic = dynamic.replace(/^Checkpoint (\d+) missed: (?:back up to it|ride back to it)$/, 'Checkpoint $1 verpasst: zurück dorthin');
  dynamic = dynamic.replace(/^Checkpoint (\d+\/\d+) · ([\d,.]+ (?:m|km)) · (\d+) (?:crash|crashes) \((\+[\d.]+ s)\)$/, (_, n, d, c, s) => `Checkpoint ${n} · ${d} · ${c} ${c === '1' ? 'Sturz' : 'Stürze'} (${s})`);
  dynamic = dynamic.replace(/^Gate (\d+) missed$/, 'Tor $1 verpasst');
  dynamic = dynamic.replace(/^Crash! \+(\d+) s$/, 'Sturz! +$1 s').replace(/^Too fast for that turn: \+(\d+) s$/, 'Zu schnell für diese Kurve: +$1 s');
  dynamic = dynamic.replace(/^Disqualified: (\d+) gates missed\.$/, 'Disqualifiziert: $1 Tore verpasst.');
  dynamic = dynamic.replace(/^Gate (\d+\/\d+) · (\d+) clean(?: · (\d+) missed \((\+[\d.]+ s)\))?$/, (_, g, c, m, s) => `Tor ${g} · ${c} sauber${m ? ` · ${m} verpasst (${s})` : ''}`);
  // (curling, the penalty shot: js/missions-ice.js, js/missions-data-ice.js)
  dynamic = dynamic.replace(/^Aim ([+−][\d.]+°)$/, 'Richtung $1');
  dynamic = dynamic.replace(/^In the house: (\d+) points?$/, (_, n) => `Im Haus: ${n} ${n === '1' ? 'Punkt' : 'Punkte'}`);
  dynamic = dynamic.replace(/^(GOAL!|Saved by the goalie|Poke check: the goalie took the puck|The puck went backwards: no goal|Too slow: time is up|Wide of the goal|Off the post!) · (\d+) goals?$/, (_, r, n) => `${translate(r)} · ${n} ${n === '1' ? 'Tor' : 'Tore'}`);
  const popped = /^(\S.*?)(  [+\-−]?\d+)$/.exec(dynamic);
  if (popped && enToDe.has(popped[1])) dynamic = enToDe.get(popped[1]) + popped[2];
  dynamic = dynamic.replace(new RegExp(`^Not yet: (.+) next${POP}$`), (_, top, tail) => `Noch nicht: zuerst ${enToDe.get(top) || top}${tail}`);
  dynamic = dynamic.replace(new RegExp(`^(.+): in the oven${POP}$`), '$1: ab in den Ofen$2');
  dynamic = dynamic.replace(new RegExp(`^(.+): flawless!${POP}$`), '$1: makellos!$2');
  dynamic = dynamic.replace(/^(\d+) of (\d+) Flämmli down · (\d+) perfect moments · (\d+) (?:mishap|mishaps)$/, (_, a, b, c, n) => `${a} von ${b} Flämmli getrunken · ${c} perfekte Momente · ${n} ${n === '1' ? 'Panne' : 'Pannen'}`);
  dynamic = dynamic.replace(/^(\d+) rounds of Flämmli$/, '$1 Runden Flämmli');
  dynamic = dynamic.replace(/^(\d+) of (\d+) shots down · (\d+) perfect moments · (\d+) (?:mishap|mishaps)$/, (_, a, b, c, n) => `${a} von ${b} Shots getrunken · ${c} perfekte Momente · ${n} ${n === '1' ? 'Panne' : 'Pannen'}`);
  dynamic = dynamic.replace(/^(\d+) rounds of flaming shots$/, '$1 Runden Flaming Shots');
  // A shift at the Turmhotel Victoria (js/missions-data-victoria.js, js/missions-victoria.js)
  {
    const de = (x) => enToDe.get(x) || x;
    dynamic = dynamic.replace(/^(Room 204|The tower suite) · (\d+) s · (-?\d+) pts$/, (_, room, sec, pts) => `${de(room)} · ${sec} s · ${pts} Pkt.`);
    dynamic = dynamic.replace(/^(.+) are back soon\. Pick a chore$/, (_, who) => `${de(who)} kommen bald zurück. Wähl eine Arbeit`);
    dynamic = dynamic.replace(/^(.+): scrub left, right, left …$/, (_, c) => `${de(c)}: links, rechts, links wischen …`);
    dynamic = dynamic.replace(new RegExp(`^(.+): done${POP}$`), (_, c, tail) => `${de(c)}: erledigt${tail}`);
    dynamic = dynamic.replace(/^The guest is back: (\d+) (?:chore|chores) undone$/, (_, n) => `Der Gast ist zurück: ${n} ${n === '1' ? 'Arbeit' : 'Arbeiten'} nicht erledigt`);
    dynamic = dynamic.replace(new RegExp(`^Spotless! (\\d+) s to spare${POP}$`), 'Blitzblank! $1 s übrig$2');
    dynamic = dynamic.replace(/^(Room 204|The tower suite): (\d+) of (\d+) chores$/, (_, room, a, b) => `${de(room)}: ${a} von ${b} Arbeiten`);
    dynamic = dynamic.replace(/^(Room 204|The tower suite): (\d+) of (\d+) chores · (Room 204|The tower suite): (\d+) of (\d+) chores$/, (_, r1, a1, b1, r2, a2, b2) => `${de(r1)}: ${a1} von ${b1} Arbeiten · ${de(r2)}: ${a2} von ${b2} Arbeiten`); // (the summary: both rooms)
    dynamic = dynamic.replace(/^Lunch service · (\d+) of (\d+) dishes · (-?\d+) pts$/, 'Mittagsservice · $1 von $2 Gerichten · $3 Pkt.');
    dynamic = dynamic.replace(/^(\d+) of (\d+) dishes · (-?\d+) pts$/, '$1 von $2 Gerichten · $3 Pkt.');
    dynamic = dynamic.replace(/^Burner (\d)$/, 'Platte $1').replace(/^Table (\d+): (.+)$/, 'Tisch $1: $2');
    dynamic = dynamic.replace(new RegExp(`^(.+): perfect!${POP}$`), '$1: perfekt!$2').replace(new RegExp(`^(.+): nicely done${POP}$`), '$1: schön gelungen$2');
    dynamic = dynamic.replace(new RegExp(`^(.+): still raw!${POP}$`), '$1: noch roh!$2').replace(new RegExp(`^(.+): a touch underdone${POP}$`), '$1: etwas zu wenig gar$2');
    dynamic = dynamic.replace(new RegExp(`^(.+): rather dark${POP}$`), '$1: ziemlich dunkel$2').replace(new RegExp(`^(.+): burnt!${POP}$`), '$1: angebrannt!$2');
    dynamic = dynamic.replace(new RegExp(`^Service! A quick lunch${POP}$`), 'Service! Ein schneller Mittag$1');
    dynamic = dynamic.replace(/^(\d+) of (\d+) dishes served · (\d+) perfect · (\d+) burnt$/, '$1 von $2 Gerichten serviert · $3 perfekt · $4 angebrannt');
    dynamic = dynamic.replace(/^Sorting · item (\d+) of (\d+) · (-?\d+) pts$/, 'Sortieren · Stück $1 von $2 · $3 Pkt.').replace(/^Item (\d+) of (\d+) · (-?\d+) pts$/, 'Stück $1 von $2 · $3 Pkt.');
    dynamic = dynamic.replace(/^The mangle · sheet (\d+) of (\d+) · (-?\d+) pts$/, 'Die Mangel · Leintuch $1 von $2 · $3 Pkt.').replace(/^Sheet (\d+) of (\d+) · (-?\d+) pts$/, 'Leintuch $1 von $2 · $3 Pkt.');
    dynamic = dynamic.replace(new RegExp(`^Whites${POP}$`), 'Weisses$1').replace(new RegExp(`^Colours${POP}$`), 'Buntes$1');
    dynamic = dynamic.replace(new RegExp(`^(.+) in the colours: it comes out grey${POP}$`), (_, it, tail) => `${de(it)} in der Buntwäsche: kommt grau heraus${tail}`);
    dynamic = dynamic.replace(new RegExp(`^(.+) in the whites: pink sheets!${POP}$`), (_, it, tail) => `${de(it)} in der Weisswäsche: rosa Leintücher!${tail}`);
    dynamic = dynamic.replace(new RegExp(`^(.+): on the floor${POP}$`), (_, it, tail) => `${de(it)}: auf dem Boden${tail}`);
    dynamic = dynamic.replace(new RegExp(`^Crisp and smooth!${POP}$`), 'Glatt und frisch!$1').replace(new RegExp(`^Crisp, if pink${POP}$`), 'Glatt, wenn auch rosa$1');
    dynamic = dynamic.replace(new RegExp(`^(A crease or two|Creased all over|Caught in the rollers!)${POP}$`), (_, w, tail) => `${de(w)}${tail}`);
    dynamic = dynamic.replace(/^(\d+) of (\d+) sorted right · (\d+) of (\d+) sheets crisp( · pink sheets)?$/, (_, a, b, c, d, pink) => `${a} von ${b} richtig sortiert · ${c} von ${d} Leintüchern glatt${pink ? ' · rosa Leintücher' : ''}`);
  }
  // the fun and sport missions' HUDs (js/missions-fun.js, js/missions-sport.js, their data): the table football, the
  // cabin, the RhB's cab, Davos Nordic, the minigolf, the darts, the bowl
  {
    const role = '(Goalie|Defence|Midfield|Attack)', nth = '(\\d+)(?:st|nd|rd|th)';
    const dartDe = (l) => l.replace(/^Double (\d+)$/, 'Doppel $1').replace(/^Treble (\d+)$/, 'Triple $1').replace(/^Miss$/, 'Daneben');
    dynamic = dynamic
      .replace(new RegExp(`^You \\(red\\) vs La Onda \\(blue\\) · ${role}( \\(auto\\))?$`), (_, r, auto) => `Du (rot) gegen La Onda (blau) · ${enToDe.get(r)}${auto ? ' (automatisch)' : ''}`)
      .replace(new RegExp(`^You (\\d+) : (\\d+) La Onda · (\\d+:\\d\\d) · ${role}$`), (_, a, b, c, r) => `Du ${a} : ${b} La Onda · ${c} · ${enToDe.get(r)}`)
      .replace(/^(\d+) up · cabin (\d+): (\d+) aboard, (\d+) % · (\d+) s$/, '$1 oben · Gondel $2: $3 an Bord, $4 % · $5 s')
      .replace(/^(\d+) pts · (\d+) up · cabin (\d+) (\d+) % · (\d+:\d\d)$/, '$1 Pkt. · $2 oben · Gondel $3: $4 % · $5')
      .replace(/^Cabin (\d+): (\d+) passengers · (\d+) % full(?: · (\d+) full rows?)?(?: · (\d+) holes)? → ([+-]?\d+)$/, (_, c, n, f, rows, holes, p) => `Gondel ${c}: ${n} Fahrgäste · ${f} % voll${rows ? ` · ${rows} ${rows === '1' ? 'volle Reihe' : 'volle Reihen'}` : ''}${holes ? ` · ${holes} ${holes === '1' ? 'Loch' : 'Löcher'}` : ''} → ${p}`)
      .replace(/^now (\d+:\d\d)$/, 'jetzt $1');
    if (/^(?:Stop board|Doors|Score -?\d|\d+ km\/h in)/.test(dynamic)) {
      dynamic = dynamic.replace(/Stop board (.+?): (-?\d+) m/, 'Haltetafel $1: $2 m').replace(/Doors open · (\d+) s/, 'Türen offen · $1 s')
        .replace('Doors closed: depart', 'Türen zu: abfahren').replace(/(^| · )Score (-?\d+)$/, '$1Punkte $2');
    }
    dynamic = dynamic
      .replace(new RegExp(`^([\\d.]+ k?m) of ([\\d.]+ km) · (?:Split (\\d+)|(Finish)) in ([\\d.]+ k?m) · (\\d+) km/h(?: · last split ${nth} (.+))?$`), (_, a, b, n, fin, c, v, p, gap) => `${a} von ${b} · ${fin ? 'Ziel' : `Zwischenzeit ${n}`} in ${c} · ${v} km/h${p ? ` · letzte Zwischenzeit ${p}. ${gap}` : ''}`)
      .replace(/^Start in (\d+)( …)?$/, 'Los in $1$2')
      .replace(/^Split (\d+) at (\d+\.\d) km$/, 'Zwischenzeit $1 bei $2 km')
      .replace(/^Split (\d+) · (.+)$/, 'Zwischenzeit $1 · $2').replace(/^SPLIT (\d+)$/, 'ZWISCHENZEIT $1').replace(/^Bib (\d+)$/, 'Startnummer $1')
      .replace(new RegExp(`^${nth} of (\\d+)$`), '$1. von $2').replace(new RegExp(`^${nth} place$`), '$1. Platz').replace(new RegExp(`^${nth}$`), '$1.');
    if (/^[\d.]+ k?m: /.test(dynamic)) dynamic = dynamic.replace(/\((\d+)(?:st|nd|rd|th), /g, '($1., ');
    dynamic = dynamic
      .replace(/^(\d+) strokes$/, '$1 Schläge')
      .replace(/^Game shot! (.+)$/, (_, l) => `Spiel gewonnen! ${dartDe(l)}`)
      .replace(/^(Double \d+|Treble \d+|Bullseye|Bull 25) · (\d+)$/, (_, l, n) => `${dartDe(l)} · ${n}`)
      .replace(/^back to (\d+)$/, 'zurück auf $1')
      .replace(/^301 double out · (\d+) left$/, '301 Double Out · noch $1')
      .replace(/^Dart (\d+) of (\d+) · turn (\d+), dart (\d+)$/, 'Pfeil $1 von $2 · Runde $3, Pfeil $4')
      .replace(/^darts: (\d+)$/, 'Pfeile: $1')
      .replace(/^Combo ×(\d+) · (\d+)$/, 'Kombo ×$1 · $2')
      .replace(/^(.+): combo lost$/, (_, n) => `${enToDe.get(n) || n}: Kombo verloren`);
  }
  // Nageln, Barista (js/missions-data-bars.js)
  dynamic = dynamic.replace(/^(\d+) games of Nageln$/, '$1 Partien Nageln');
  dynamic = dynamic.replace(/^Game (\d+) of (\d+) · round (\d+) · (\d+) won · (\d+) pts$/, 'Partie $1 von $2 · Runde $3 · $4 gewonnen · $5 Pkt.');
  dynamic = dynamic.replace(/^Game (\d+) of (\d+) · (\d+) won · (\d+) strokes · (\d+) pts$/, 'Partie $1 von $2 · $3 gewonnen · $4 Schläge · $5 Pkt.');
  dynamic = dynamic.replace(/^Game (\d+) of (\d+): nails ready$/, 'Partie $1 von $2: Nägel bereit');
  dynamic = dynamic.replace(/^You win game (\d+)$/, 'Du gewinnst Partie $1');
  dynamic = dynamic.replace(/^(.+) wins game (\d+)$/, (_, who, n) => `${enToDe.get(who) || who} gewinnt Partie ${n}`);
  dynamic = dynamic.replace(/^(.+) swings …$/, (_, who) => `${enToDe.get(who) || who} holt aus …`);
  dynamic = dynamic.replace(new RegExp(`^(.+) wins this one${POP}$`), (_, who, tail) => `${enToDe.get(who) || who} gewinnt diese Partie${tail}`);
  dynamic = dynamic.replace(new RegExp(`^In by ([\\d.]+) cm${POP}$`), '$1 cm tiefer$2');
  dynamic = dynamic.replace(/^(\d+) of (\d+) games won · (\d+) strokes · (\d+) perfect · (\d+) bent · (\d+) missed$/, '$1 von $2 Partien gewonnen · $3 Schläge · $4 perfekt · $5 verbogen · $6 daneben');
  dynamic = dynamic.replace(/^Order (\d+) of (\d+) · (\d+) pts · (\d+) walked out$/, 'Bestellung $1 von $2 · $3 Pkt. · $4 gegangen');
  dynamic = dynamic.replace(/^(\d+) of (\d+) orders served · quality (\d+) % · (\d+) flawless · (\d+) walked out$/, '$1 von $2 Bestellungen serviert · Qualität $3 % · $4 makellos · $5 gegangen');
  dynamic = dynamic.replace(/^Usuals remembered: (\d+) of (\d+)$/, '«Wie immer» gemerkt: $1 von $2');
  dynamic = dynamic.replace(new RegExp(`^A fine (.+?)${POP}$`), 'Ein feiner $1$2');
  dynamic = dynamic.replace(new RegExp(`^(.+): it will do${POP}$`), '$1: Es geht so$2');
  dynamic = dynamic.replace(new RegExp(`^(.+): nobody says a word${POP}$`), '$1: Niemand sagt ein Wort$2');
  dynamic = dynamic.replace(/^(.+), please!$/, '$1, bitte!');
  dynamic = dynamic.replace(/^(.+)! After all these years\.$/, '$1! Nach all den Jahren.');
  dynamic = dynamic.replace(/^Round (\d+) of (\d+) · (\d+) pts · (\d+)\/(\d+) mishaps$/, 'Runde $1 von $2 · $3 Pkt. · $4/$5 Pannen');
  dynamic = dynamic.replace(/^Top (\d+) pizzas$/, 'Belege $1 Pizzas');
  dynamic = dynamic.replace(/^Pizza (\d+) of (\d+) · (\d+) pts$/, 'Pizza $1 von $2 · $3 Pkt.');
  dynamic = dynamic.replace(/^Pizza (\d+) of (\d+): (.+) for (.+)$/, 'Pizza $1 von $2: $3 für $4');
  dynamic = dynamic.replace(/^Park here and get out \(F\) · (.+)$/, 'Hier parken und aussteigen (F) · $1');
  dynamic = dynamic.replace(/^The van is (.+?) away: drive closer( · .+)?$/, (_, d, rest) => `Der Lieferwagen ist ${d} entfernt: näher fahren${rest || ''}`);
  dynamic = dynamic.replace(/^Take the box from the back of the van( · .+)?$/, (_, rest) => `Schachtel hinten aus dem Lieferwagen nehmen${rest || ''}`);
  dynamic = dynamic.replace(/^Handing over … (.+)$/, 'Übergabe … $1');
  dynamic = dynamic.replace(/^Carry the box to the door · (.+)$/, 'Schachtel zur Tür tragen · $1');
  dynamic = dynamic.replace(/^Hot pizzas (\d+) % · (\d+)\/(\d+) delivered · (\d+) pts( · carrying a box)?$/, (_, h, a, b, p, box) => `Heisse Pizzas ${h} % · ${a}/${b} geliefert · ${p} Pkt.${box ? ' · Schachtel in den Armen' : ''}`);
  dynamic = dynamic.replace(/^(\d+) pairs up · (\d+) perfect hand-overs · best run (\d+) · (\d+) knocked over · (\d+) empty bars$/, '$1 Paare hinauf · $2 perfekte Übergaben · beste Serie $3 · $4 umgeworfen · $5 leere Bügel');
  dynamic = dynamic.replace(/^(\d+) skiers up · (\d+:\d{2})(?: · run of (\d+))?$/, (_, n, clock, run) => `${n} Skifahrer oben · ${clock}${run ? ` · Serie von ${run}` : ''}`);
  dynamic = dynamic.replace(/^(?:skier|skiers) up · (\d+) s · rope ([\d.]+) m\/s( · next pair ready| · moving up …)?( · kids: careful!)?$/, (_, s, rope, state, kids) => `Skifahrer oben · ${s} s · Seil ${rope} m/s${state ? (state.includes('ready') ? ' · nächstes Paar bereit' : ' · fährt hoch …') : ''}${kids ? ' · Kinder: Vorsicht!' : ''}`);
  dynamic = dynamic.replace(/^(\d+) pairs waxed · (.+)$/, (_, n, rest) => `${n} Paare gewachst · ${rest === 'no pair finished' ? 'kein Paar fertig' : rest}`);
  dynamic = dynamic.replace(/^(\d+) pts · (\d+) pairs · (\d+:\d{2})$/, '$1 Pkt. · $2 Paare · $3');
  dynamic = dynamic.replace(/^pts · (\d+) pairs · (\d+) s · (.+)$/, (_, n, s, stage) => `Pkt. · ${n} Paare · ${s} s · ${enToDe.get(stage) || stage}`);
  dynamic = dynamic.replace(/^(Close, but|Wrong:) (.+) was the wax$/, (_, kind, wax) => `${kind === 'Wrong:' ? 'Falsch:' : 'Knapp daneben:'} ${enToDe.get(wax) || wax} wäre das richtige Wachs gewesen`);
  dynamic = dynamic.replace(/^(\d+) pts · (\d+) of (\d+) customers · (\d+:\d{2})$/, '$1 Pkt. · $2 von $3 Kunden · $4');
  dynamic = dynamic.replace(/^(\d+) of (\d+) customers · (\d+) exact · (.+)$/, (_, a, b, n, rest) => `${a} von ${b} Kunden · ${n} exakt · ${rest === 'none finished' ? 'keiner fertig' : rest}`);
  dynamic = dynamic.replace(/^Hardness (\d+) · grain (\d+) · temperature (\d+) · break (\d+) · danger (\d+) · time (\d+)$/, 'Härte $1 · Korn $2 · Temperatur $3 · Bruch $4 · Gefahr $5 · Zeit $6');
  // the snow profile's source line (js/missions-data-expert.js slfNote)
  dynamic = dynamic.replace(/^SLF: only ([\d.]+ cm) on the Weissfluhjoch today: a training profile$/, 'SLF: Heute nur $1 auf dem Weissfluhjoch: ein Übungsprofil')
    .replace(/^Weissfluhjoch (\d\d\.\d\d\. \d\d:\d\d) · ([\d.]+ cm) of snow(?: · bulletin level (\d))?$/, (_, when, cm, level) => `Weissfluhjoch ${when} · ${cm} Schnee${level ? ` · Bulletin Stufe ${level}` : ''}`);
  dynamic = dynamic.replace(/^(Dig down to the ground|Test the layers|Take the temperatures|Compression test|Where did it break\?|Set the danger level|The sheet against the truth) · (\d+:\d{2})$/, (_, stage, clock) => `${enToDe.get(stage)} · ${clock}`);
  dynamic = dynamic.replace(/^(\d+) % on the packed line · (\d+) times in the Wildruhezone · (\d+) grouse startled · (\d+) stumbles$/, '$1 % auf der Spur · $2-mal in der Wildruhezone · $3 Birkhühner aufgeschreckt · $4 Stolperer');
  dynamic = dynamic.replace(/^(\d+) casts · (.+) · (\d+) gaps · (\d+) lumps$/, (_, n, rest, g, l) => `${n} Gipse · ${rest === 'no cast finished' ? 'kein Gips fertig' : rest} · ${g} Lücken · ${l} Klumpen`);
  dynamic = dynamic.replace(/^Patient (\d+) of (\d+) · (\d+) pts · (\d+:\d{2})$/, 'Patient $1 von $2 · $3 Pkt. · $4');
  dynamic = dynamic.replace(/^(\d+) gaps · (\d+) lumps$/, '$1 Lücken · $2 Klumpen');
  dynamic = dynamic.replace(/^(.+): (\d+) pts$/, '$1: $2 Pkt.');
  dynamic = dynamic.replace(/^(\d+) cars parked well · (\d+) crooked · (\d+) blockers · (\d+) close calls$/, '$1 Autos gut geparkt · $2 schräg · $3 blockiert · $4 Beinahe-Unfälle');
  dynamic = dynamic.replace(/^(\d+) pts · (\d+) parked · (\d+:\d{2})$/, '$1 Pkt. · $2 geparkt · $3');
  dynamic = dynamic.replace(/^pts · (\d+) good · (\d+) crooked · (\d+) blocking · (\d+) s · (.+)$/, (_, good, crooked, blocking, s, hand) => {
    const place = hand.replace(/^held \((\d+) s\)$/, 'angehalten ($1 s)').replace(/^(\d+) m to the line$/, '$1 m bis zur Linie').replace(/^no car in sight$/, 'kein Auto in Sicht');
    return `Pkt. · ${good} gut · ${crooked} schräg · ${blocking} blockiert · ${s} s · ${place}`;
  });
  dynamic = dynamic.replace(/^(\d+) perfect · (\d+) good · (\d+) missed · best streak (\d+)$/, '$1 perfekt · $2 gut · $3 verpasst · beste Serie $4');
  dynamic = dynamic.replace(/(\d+) skiers$/, '$1 Skifahrer');
  // the rope park, the Seehofseeli
  dynamic = dynamic.replace(/^(\d+) m to the ladder$/, '$1 m bis zur Leiter');
  dynamic = dynamic.replace(/^(\d+) m to the next deck$/, '$1 m bis zur nächsten Plattform');
  dynamic = dynamic.replace(/^(\d+) m to the face-off$/, '$1 m bis zum Bully');
  // Pfadi Davos (js/missions-data-pfadi.js)
  dynamic = dynamic.replace(/^([\d.]+) (m|km) to the camp in the Mattawald$/, (_, d, u) => `${d} ${u} bis zum Lagerplatz im Mattawald`);
  dynamic = dynamic.replace(/^Firewood (\d+\/\d+) · twigs (\d+\/\d+) · kindling (\d+\/\d+) · logs (\d+\/\d+)$/, 'Feuerholz $1 · Reisig $2 · Anfeuerholz $3 · Scheiter $4');
  dynamic = dynamic.replace(/^Hold Space: pick up (dry twigs|kindling|a log)$/, (_, w) => `Space halten: ${PFADI_WOOD_DE[w]} aufheben`);
  dynamic = dynamic.replace(/^Sparks in the tinder (\d\/\d)$/, 'Funken im Zunder $1').replace(/^Ember (\d+) %$/, 'Glut $1 %');
  dynamic = dynamic.replace(/^To the fireplace: (.+)$/, 'Zur Feuerstelle: $1').replace(/^To the tent spot: (.+)$/, 'Zum Zeltplatz: $1');
  dynamic = dynamic.replace(/^To the next firewood: (.+)$/, 'Zum nächsten Feuerholz: $1');
  dynamic = dynamic.replace(/^(\d+) good strikes? · (\d+) missed the steel$/, (_, n, m) => `${n} ${n === '1' ? 'guter Schlag' : 'gute Schläge'} · ${m} am Stahl vorbei`);
  dynamic = dynamic.replace(/^(.+) \((\d\/\d)\)$/, (all, l, n) => (PFADI_STEPS_DE[l] ? `${PFADI_STEPS_DE[l]} (${n})` : all));
  // the splitboard tour on the Chörbschhorn (js/missions-data-splitboard.js)
  dynamic = dynamic.replace(/^Marker pole (\d+\/\d+) · ([\d,.]+ (?:m|km))$/, 'Markierstange $1 · $2').replace(/^Marker pole (\d+) missed: back to it$/, 'Markierstange $1 verpasst: zurück zu ihr');
  dynamic = dynamic.replace(/^Gate (\d+\/\d+) · (\d+) missed \(\+(\d+) s\)$/, 'Tor $1 · $2 verpasst (+$3 s)').replace(/^Gate (\d+) missed: \+(\d+) s$/, 'Tor $1 verpasst: +$2 s').replace(/^Gate missed: \+(\d+) s$/, 'Tor verpasst: +$1 s');
  dynamic = dynamic.replace(/^(.+) \((\d\/\d)\)$/, (all, l, n) => (SPLIT_STEPS_DE[l] ? `${SPLIT_STEPS_DE[l]} (${n})` : all));
  dynamic = dynamic.replace(/^(\d+) kick turns? · (\d+) s slipping( · Reto dug out of an avalanche \(\+(\d+) s\))?$/, (_, n, t, r, p) => `${n} ${n === '1' ? 'Spitzkehre' : 'Spitzkehren'} · ${t} s gerutscht${r ? ` · Reto aus einer Lawine ausgegraben (+${p} s)` : ''}`);
  dynamic = dynamic.replace(/^(Send check: Reto searches, you send|Receive check: you search, Reto sends) \((\d\/\d)\)$/, (_, l, n) => `${l.startsWith('Send') ? 'Sendecheck: Reto sucht, du sendest' : 'Empfangscheck: du suchst, Reto sendet'} (${n})`);
  dynamic = dynamic.replace(/^Reto is buried! Signal: ([\d.]+) m$/, (_, d) => `Reto ist verschüttet! Signal: ${d} m`);
  dynamic = dynamic.replace(/^Wait for Reto: (\d+) m behind$/, 'Auf Reto warten: $1 m zurück').replace(/^Reto: (\d+) m behind$/, 'Reto: $1 m zurück');
  dynamic = dynamic.replace(/^(\d+) of (\d+) gates · (\d+) missed( \(\+[\d.]+ s\))? · top speed (\d+) km\/h$/, '$1 von $2 Toren · $3 verpasst$4 · Höchsttempo $5 km/h');
  // the snow plough over the Wolfgang (js/missions-data-plough.js)
  dynamic = dynamic.replace(/^To the (Passhöhe|Seegalerie): (.+) · lane cleared (.+) of (.+)$/, (_, w, d, a, b) => `Bis zur ${w}: ${d} · Spur geräumt: ${a} von ${b}`);
  const ploughPlace = (n) => ({ 'the old Prättigauerstrasse': 'alte Prättigauerstrasse', 'the filling station': 'Tankstelle' }[n] || n);
  dynamic = dynamic.replace(/^(.+) ahead on your throw side: F lifts the blade past it$/, (_, n) => `Einmündung ${ploughPlace(n)} voraus auf der Wurfseite: F hebt die Pflugschar`);
  dynamic = dynamic.replace(/^You buried the mouth of (.+)!$/, (_, n) => `Einmündung ${ploughPlace(n)} zugeschüttet!`);
  dynamic = dynamic.replace(/^Up (.+) · down (.+) cleared$/, 'Hinauf $1 · hinunter $2 geräumt');
  if (/snow poles? \(|cars? hit \(|bridge joints? \(|side roads? buried|snow on the road \d|too fast by the houses/.test(dynamic)) {
    dynamic = dynamic
      .replace(/(^| · )(\d+) snow poles? \(\+(\d+) s\)/, (_, a, n, s) => `${a}${n} ${n === '1' ? 'Schneestange' : 'Schneestangen'} (+${s} s)`)
      .replace(/(^| · )(\d+) cars? hit \(\+(\d+) s\)/, (_, a, n, s) => `${a}${n} ${n === '1' ? 'Auto' : 'Autos'} angefahren (+${s} s)`)
      .replace(/(^| · )(\d+) bridge joints? \(\+(\d+) s\)/, (_, a, n, s) => `${a}${n} ${n === '1' ? 'Brückenfuge' : 'Brückenfugen'} (+${s} s)`)
      .replace(/(^| · )(\d+) side roads? buried \(\+(\d+) s\)/, (_, a, n, s) => `${a}${n} ${n === '1' ? 'Einmündung' : 'Einmündungen'} zugeschüttet (+${s} s)`)
      .replace(/(^| · )snow on the road (\d+) s \(\+(\d+) s\)/, '$1Schnee auf der Fahrbahn $2 s (+$3 s)')
      .replace(/(^| · )too fast by the houses (\d+) s \(\+(\d+) s\)/, '$1zu schnell bei den Häusern $2 s (+$3 s)');
  }
  // the snowfarming Loipe (js/missions-data-snowfarm.js)
  dynamic = dynamic.replace(/^Bed (\d+ %) full$/, 'Brücke zu $1 voll').replace(/^(\d+) m to the snowcat$/, '$1 m bis zum Pistenfahrzeug');
  dynamic = dynamic.replace(/^Loipe covered (.+?) of (.+?) · bed (\d+ %)( · layer (\d+) cm)?$/, (_, a, b, c, _l, n) => `Loipe bedeckt: ${a} von ${b} · Brücke ${c}${n ? ` · Schicht ${n} cm` : ''}`);
  dynamic = dynamic.replace(/^Too fast: (\d+) cm, that leaves a gap$/, 'Zu schnell: $1 cm, das gibt eine Lücke').replace(/^Too slow: (\d+) cm, the load will run short$/, 'Zu langsam: $1 cm, die Ladung reicht nicht');
  dynamic = dynamic.replace(/^Loipe groomed (.+) of (.+)$/, 'Loipe präpariert: $1 von $2');
  dynamic = dynamic.replace(/^(\d+) loads? · Loipe covered (.+) · groomed (.+)$/, (_, n, a, b) => `${n} ${n === '1' ? 'Fuhre' : 'Fuhren'} · Loipe bedeckt ${a} · präpariert ${b}`);
  dynamic = dynamic.replace(/^(\d+ %) of the snow beside the Loipe$/, '$1 des Schnees neben der Loipe');
  // fresh ice on the Seehofseeli (js/missions-data-rink.js)
  dynamic = dynamic.replace(/^(\d+) m to the hydrant$/, '$1 m bis zum Hydranten').replace(/^(\d+) m to the machine$/, '$1 m bis zur Maschine');
  dynamic = dynamic.replace(/^Ice flooded (.+?) of (.+?)( · (\d+) footprint cells)?$/, (_, a, b, _x, n) => `Eis geflutet: ${a} von ${b}${n ? ` · ${n} Felder mit Fussabdrücken` : ''}`);
  dynamic = dynamic.replace(/^Ice resurfaced (.+) of (.+)$/, 'Eis geglättet: $1 von $2');
  dynamic = dynamic.replace(/^(\d+) footprints? flooded again · (.+) resurfaced$/, (_, n, p) => `${n} Fussabdr${n === '1' ? 'uck' : 'ücke'} nochmals geflutet · ${p} geglättet`);
  // the ice resurfacer in the Eisstadion (js/missions-data-zamboni.js, js/missions-zamboni.js)
  dynamic = dynamic.replace(/^Along the boards (\d+ %) of (\d+ %) · (\d+:\d\d) left$/, 'Der Bande entlang $1 von $2 · noch $3');
  dynamic = dynamic.replace(/^Ice (\d+ %) of (\d+ %) · water (\d+ %) · (\d+:\d\d) left$/, 'Eis $1 von $2 · Wasser $3 · noch $4');
  dynamic = dynamic.replace(/^(\d+) m to the gate · (\d+:\d\d) left$/, '$1 m bis zum Tor · noch $2').replace(/^Ice (\d+ %)$/, 'Eis $1');
  dynamic = dynamic.replace(/^Hard knock on the boards! −(\d+)$/, 'Harter Schlag an die Bande! −$1');
  dynamic = dynamic.replace(/^(\d+ %) of the ice resurfaced · (\d+) hard knocks? · (\d+) m² of puddles · water left (\d+ %)$/, (_, a, n, m, w) => `${a} des Eises geglättet · ${n} ${n === '1' ? 'harter Schlag' : 'harte Schläge'} · ${m} m² Pfützen · Wasser übrig ${w}`);
  dynamic = dynamic.replace(/^Clip your carabiners: Space \((\d)\/2\)$/, 'Karabiner einhängen: Space ($1/2)');
  dynamic = dynamic.replace(/^Carabiners (\d)\/2$/, 'Karabiner $1/2');
  dynamic = dynamic.replace(/^(\d+) (?:fall|falls) · (\d+) forgotten · (mattress at full speed|soft landing)$/, (_, a, b, c) => `${a} ${a === '1' ? 'Sturz' : 'Stürze'} · ${b} vergessen · ${c === 'soft landing' ? 'weiche Landung' : 'mit vollem Tempo in die Matte'}`);
  dynamic = dynamic.replace(/^You (\d+) : (\d+) Locals · (.+)$/, (_, a, b, c) => `Du ${a} : ${b} Einheimische · ${c === 'next goal wins' ? 'das nächste Tor entscheidet' : c}`);
  dynamic = dynamic.replace(/^(Won|Drawn|Lost) (\d+) : (\d+) · your goals: (\d+)(?: · assists: (\d+))?$/, (_, r, a, b, m, n) => `${{ Won: 'Gewonnen', Drawn: 'Unentschieden', Lost: 'Verloren' }[r]} ${a} : ${b} · deine Tore: ${m}${n ? ` · Assists: ${n}` : ''}`);
  dynamic = dynamic.replace(/(-?\d+) goals ahead\b/g, (_, n) => `${n} ${n === '1' ? 'Tor' : 'Tore'} Vorsprung`);
  dynamic = dynamic.replace(/^Loading swissBUILDINGS3D (\d+\/\d+)…$/, 'swissBUILDINGS3D wird geladen $1 …');
  dynamic = dynamic.replace(/^Previous launch stopped at: (.+)$/, 'Letzter Start abgebrochen bei: $1');
  dynamic = dynamic.replace(/ · last shader #/, ' · letzter Shader #');
  dynamic = dynamic.replace(/^(.+) · Click to teleport here$/, '$1 · Klicken, um hierher zu teleportieren');
  dynamic = dynamic.replace(/^You are at (.+)$/, 'Du bist bei $1');
  dynamic = dynamic.replace(/^Search (\d+) streets & landmarks…$/, '$1 Strassen und Orte suchen …');
  dynamic = dynamic.replace(/^Get in the (.+)$/, (_, vehicle) => `Einsteigen: ${enToDe.get(vehicle) || vehicle}`);
  dynamic = dynamic.replace(/^Take the (.+)$/, (_, vehicle) => `${enToDe.get(vehicle) || vehicle} übernehmen`);
  dynamic = dynamic.replace(/^Line (.+) · articulated$/, 'Linie $1 · Gelenkbus');
  dynamic = dynamic.replace(/^Line (.+)$/, 'Linie $1');
  dynamic = dynamic.replace(/^You are on (.+)$/, 'Du bist auf $1');
  dynamic = dynamic.replace(/^Mission: (.+) · Click to set the waypoint$/, 'Mission: $1 · Klicken, um den Wegpunkt zu setzen');
  dynamic = dynamic.replace(/^Start (.+)$/, (_, title) => `Starten: ${enToDe.get(title) || title}`);
  dynamic = dynamic.replace(/^(.+) · ([\d,.]+ (?:m|km))$/, (_, title, distance) => `${enToDe.get(title) || title} · ${distance}`);
  dynamic = dynamic.replace(/^Up to (\d+) points$/, 'Bis zu $1 Punkte');
  dynamic = dynamic.replace(/^Stop at (.+)$/, 'Bei $1 anhalten');
  dynamic = dynamic.replace(/^Split (\d+) at (.+)$/, 'Zwischenzeit $1 bei $2');
  dynamic = dynamic.replace(/^Hole (\d+): (.+) \(par (\d+)\)$/, (_, n, name, par) => `Loch ${n}: ${enToDe.get(name) || name} (Par ${par})`);
  dynamic = dynamic.replace(/^Hole (\d+)\/(\d+) · (.+) · par (\d+)$/, (_, n, of, name, par) => `Loch ${n}/${of} · ${enToDe.get(name) || name} · Par ${par}`);
  dynamic = dynamic.replace(/^Stroke (\d+) · total (\d+)$/, 'Schlag $1 · total $2');
  dynamic = dynamic.replace(/^Hole (\d+) · Par (\d+)$/, 'Loch $1 · Par $2');
  dynamic = dynamic.replace(/^Lap (\d+) of (\d+): to the finish$/, 'Runde $1 von $2: ins Ziel');
  dynamic = dynamic.replace(/^Lap (\d+) of (\d+)$/, 'Runde $1 von $2');
  dynamic = dynamic.replace(/^Penalty (\d+) of (\d+)$/, 'Penalty $1 von $2');
  dynamic = dynamic.replace(/^Deliver to the (.+)$/, 'Lieferung an $1');
  dynamic = dynamic.replace(/^Deliver to (.+)$/, 'Lieferung an $1');
  dynamic = dynamic.replace(/^Roll (\d+) Gipfeli$/, '$1 Gipfeli rollen');
  dynamic = dynamic.replace(/^Serve raclette for (\d+) s$/, '$1 s Raclette servieren');
  dynamic = dynamic.replace(/^Through the (\d+) gates$/, 'Durch alle $1 Tore');
  dynamic = dynamic.replace(/^Jump (\d+) of (\d+)$/, 'Sprung $1 von $2');
  dynamic = dynamic.replace(/^Groom (\d+) % of the trail$/, '$1 % der Loipe präparieren');
  dynamic = dynamic.replace(/^Trigger zone (\d+) of (\d+)$/, 'Zone $1 von $2 auslösen');
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) to (?:the )?(kicker|valley station|tennis hall|slide tower|easel|adit|stand)$/, (_, d, g) => `${d} bis ${{ kicker: 'zum Kicker', 'valley station': 'zur Talstation', 'tennis hall': 'zur Tennishalle', 'slide tower': 'zum Rutschbahnturm', easel: 'zur Staffelei', adit: 'zum Stollen', stand: 'zum Hochsitz' }[g]}`);
  dynamic = dynamic.replace(/^Jöri's questions: (\d) of (\d) right(?: \(\+(\d+) s\))?$/, (_, r, n, p) => `Jöris Fragen: ${r} von ${n} richtig${p ? ` (+${p} s)` : ''}`);
  dynamic = dynamic.replace(/^([\d,.]+ m) to (the Dalvazzerstollen|the Hilfsstollen|St Barbara|the stope|the year 1813|the year 1818|the crossing|the far end|the portal)$/, (_, d, g) => `${d} bis ${{ 'the Dalvazzerstollen': 'zum Dalvazzerstollen', 'the Hilfsstollen': 'zum Hilfsstollen', 'St Barbara': 'zur heiligen Barbara', 'the stope': 'zum Abbau', 'the year 1813': 'zur Jahreszahl 1813', 'the year 1818': 'zur Jahreszahl 1818', 'the crossing': 'zur Kreuzung', 'the far end': 'zum Stollenende', 'the portal': 'zum Portal' }[g]}`);
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) to the accident site( · .+)?$/, '$1 bis zur Unfallstelle$2');
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) to the finish$/, '$1 bis zum Ziel');
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) to the (.+)$/, '$1 bis zu $2');
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) to (.+)$/, '$1 bis $2');
  dynamic = dynamic.replace(/^Next stop (.+)$/, 'Nächster Halt: $1');
  dynamic = dynamic.replace(/^(\d+) of (\d+) rolled · (\d+) pts$/, '$1 von $2 gerollt · $3 Pkt.');
  dynamic = dynamic.replace(/^(\d+) pts · (\d+) plates · (.+)$/, '$1 Pkt. · $2 Teller · $3');
  // the rural missions (js/missions-data-rural.js)
  dynamic = dynamic.replace(/^Gate (\d+\/\d+)(?: · ([\d,.]+ (?:m|km)))?(?: · (\d+) clean (?:jump|jumps))?$/, (_, gate, dist, jumps) => `Tor ${gate}${dist ? ` · ${dist}` : ''}${jumps ? ` · ${jumps} ${jumps === '1' ? 'sauberer Sprung' : 'saubere Sprünge'}` : ''}`);
  dynamic = dynamic.replace(/^Air time ([\d.]+) s: -([\d.]+) s$/, 'Flugzeit $1 s: -$2 s');
  dynamic = dynamic.replace(/^(\d+) clean (?:jump|jumps) \(-([\d.]+) s\) · (\d+) mud and snow (?:patch|patches) crossed$/, (_, n, s, p) => `${n} ${n === '1' ? 'sauberer Sprung' : 'saubere Sprünge'} (-${s} s) · ${p} Schlamm- und Schneefelder durchquert`);
  dynamic = dynamic.replace(/^Barrels (\d+\/\d+) · load (\d+) %(?: · next (.+))?$/, (_, n, l, next) => `Fässer ${n} · Ladung ${l} %${next ? ` · nächstes ${next}` : ''}`);
  dynamic = dynamic.replace(/^Barrel up: (\d+) on the bed$/, 'Fass oben: $1 auf der Ladefläche');
  dynamic = dynamic.replace(/^Loading … (\d+) % · Space: reject the barrel$/, 'Laden … $1 % · Leertaste: Fass stehen lassen');
  dynamic = dynamic.replace(/^To the hopper · (.+)$/, 'Zum Annahmebunker · $1');
  dynamic = dynamic.replace(/^Unloading … (\d+) %$/, 'Abladen … $1 %');
  dynamic = dynamic.replace(/^That one was clean: (-?\d+) pts$/, 'Die war sauber: $1 Pkt.');
  dynamic = dynamic.replace(/^(\d+) clean barrels · (\d+) of 2 plastic barrels rejected(?: · (\d+) clean left behind)?(?: · (\d+) left out)?$/, (_, a, b, c, d) => `${a} saubere Fässer · ${b} von 2 Plastik-Fässern stehen gelassen${c ? ` · ${c} saubere stehen gelassen` : ''}${d ? ` · ${d} ausgelassen` : ''}`);
  dynamic = dynamic.replace(/^Path cleared (.+) of (.+)$/, 'Weg geräumt: $1 von $2');
  dynamic = dynamic.replace(/^Road cleared (.+) of (.+)$/, 'Strasse geräumt: $1 von $2');
  dynamic = dynamic.replace(/^Lawn mown (.+) of (.+)$/, 'Rasen gemäht: $1 von $2');
  dynamic = dynamic.replace(/^Bouquet (\d+\/\d+)(.*)$/, 'Blumenstrauss $1$2');
  dynamic = dynamic.replace(/^Bouquet of (\d+) · (.+) to go$/, 'Blumenstrauss mit $1 Zweigen · noch $2');
  dynamic = dynamic.replace(/^Basket (\d+\/\d+) · (.+) left$/, 'Korb $1 · noch $2');
  dynamic = dynamic.replace(/^Basket of (\d+) · control (.+)$/, 'Korb mit $1 Pilzen · Kontrolle $2');
  dynamic = dynamic.replace(/^([\d,.]+) left · dart (\d+) · turn (\d+)(.*)$/, '$1 übrig · Pfeil $2 · Runde $3$4');
  dynamic = dynamic.replace(/^You (\d+) : (\d+) Coach(.*)$/, 'Du $1 : $2 Trainer$3');
  dynamic = dynamic.replace(/ · your serve$/, ' · dein Aufschlag').replace(/ · coach serves$/, ' · Trainer schlägt auf');
  dynamic = dynamic.replace(/ · this turn (\d+)$/, ' · in dieser Runde $1');
  dynamic = dynamic.replace(/ · streak (\d+)/g, ' · Serie $1');
  // The end panels' summaries and scores (the missions' summary(): each template's words, the numbers as they come)
  const plural = (n, one, many) => (n === '1' ? one : many);
  const medalDe = (m) => enToDe.get(m) || m;
  dynamic = dynamic.replace(/^Mode switch \((.+)\): the mission was aborted\.$/, 'Moduswechsel ($1): Die Mission wurde abgebrochen.');
  dynamic = dynamic.replace(/^(?:first completion \+(\d+))?(?: · )?(?:(Gold|Silver|Bronze) \+(\d+))?$/, (whole, first, medal, n) => (whole ? [first && `erster Abschluss +${first}`, medal && `${medalDe(medal)} +${n}`].filter(Boolean).join(' · ') : whole));
  const unitDe = { goals: 'Tore', 'goals ahead': 'Tore Vorsprung', skiers: 'Skifahrer', points: 'Punkte', 'WC pts': 'Weltcup-Punkte' };
  dynamic = dynamic.replace(/^(?:(Gold|Silver|Bronze) )?(-?\d+) (goals ahead|goals|skiers|points|WC pts)$/, (_, medal, n, unit) => `${medal ? `${medalDe(medal)} ` : ''}${n} ${n === '1' ? unitDe[unit].replace('Tore', 'Tor') : unitDe[unit]}`);
  dynamic = dynamic.replace(/^Best score (-?\d+) (goals ahead|goals|skiers|points|WC pts)$/, (_, n, unit) => `Bestwert ${n} ${unitDe[unit]}`);
  dynamic = dynamic.replace(/^(\d+) (?:shot|shots) · (\d+) (?:hit|hits) · (\d+) missed$/, (_, a, b, c) => `${a} ${plural(a, 'Schuss', 'Schüsse')} · ${b} Treffer · ${c} daneben`);
  dynamic = dynamic.replace(/^(\d+) of (\d+) gates clean · (\d+) missed( \(\+[\d.]+ s\))?$/, '$1 von $2 Toren sauber · $3 verpasst$4');
  dynamic = dynamic.replace(/^(\d+) (?:crash|crashes)( \(\+[\d.]+ s\))?$/, (_, n, s) => `${n} ${plural(n, 'Sturz', 'Stürze')}${s || ''}`);
  dynamic = dynamic.replace(/^(\d+) (?:crash|crashes)( \(\+[\d.]+ s\))? · (\d+) (?:net|nets) touched · top speed (\d+) km\/h$/, (_, n, s, nets, v) => `${n} ${plural(n, 'Sturz', 'Stürze')}${s || ''} · ${nets} ${plural(nets, 'Netz', 'Netze')} berührt · Höchsttempo ${v} km/h`);
  dynamic = dynamic.replace(/\bLap (\d+): /g, 'Runde $1: ');
  dynamic = dynamic.replace(/^(?:(.+) · top|Top) speed ([\d.]+) km\/h · (\d+) power strokes of (\d+)(?: · (\d+) stumbles)?$/, (_, label, v, a, b, c) => `${label ? `${label} · ` : ''}Höchsttempo ${v} km/h · ${a} Kraftschritte von ${b}${c ? ` · ${c} Stolperer` : ''}`);
  dynamic = dynamic.replace(/^(\d+) of (\d+) scored:/, '$1 von $2 getroffen:');
  dynamic = dynamic.replace(/^(\d+) of (\d+) stones in the house · (\d+) points$/, '$1 von $2 Steinen im Haus · $3 Punkte');
  dynamic = dynamic.replace(/^(\d+) strokes, par (\d+): (.+)$/, '$1 Schläge, Par $2: $3');
  dynamic = dynamic.replace(/^(\d+) of (\d+) bars served$/, '$1 von $2 Bars beliefert');
  dynamic = dynamic.replace(/^(\d+) squirrels fed · best streak (\d+) · (\d+) scared away$/, '$1 Eichhörnchen gefüttert · beste Serie $2 · $3 verscheucht');
  dynamic = dynamic.replace(/^(\d+) plates · (\d+) just right · (\d+) burnt · (\d+) guests left hungry$/, '$1 Teller · $2 genau richtig · $3 verbrannt · $4 Gäste hungrig gegangen');
  dynamic = dynamic.replace(/^Tiebreak (\d+) : (\d+) · (\d+) aces · (\d+) winners$/, 'Tiebreak $1 : $2 · $3 Asse · $4 Winner');
  dynamic = dynamic.replace(/^Top speed (\d+) km\/h · on the wall ([\d.]+) s · jolts ([\d.]+) s$/, 'Höchsttempo $1 km/h · an der Wand $2 s · Schläge $3 s');
  dynamic = dynamic.replace(/^Likeness (\d+) % · colour (\d+) % · contours (\d+) %$/, 'Ähnlichkeit $1 % · Farbe $2 % · Konturen $3 %');
  dynamic = dynamic.replace(/^(\d+) shovels thrown onto the heaps · (\d+) % of the path cleared$/, '$1 Schaufeln auf die Haufen geworfen · $2 % des Wegs geräumt');
  dynamic = dynamic.replace(/^(\d+) parked cars? hit \(\+([\d.]+) s\) · cars buried for (\d+) s \(\+(\d+) s\)$/, (_, n, a, b, c) => `${n} ${plural(n, 'parkiertes Auto', 'parkierte Autos')} getroffen (+${a} s) · Autos ${b} s lang zugeschüttet (+${c} s)`);
  dynamic = dynamic.replace(/^(\d+) bed patch(?:es)? trodden \(\+([\d.]+) s\)$/, (_, n, a) => `${n} ${plural(n, 'Beet', 'Beete')} zertrampelt (+${a} s)`);
  dynamic = dynamic.replace(/^(\d+) of (\d+) collection points emptied(?: · (\d+) left out \(\+([\d.]+) s\))?$/, (_, a, b, c, d) => `${a} von ${b} Sammelstellen geleert${c ? ` · ${c} ausgelassen (+${d} s)` : ''}`);
  // the postman's round (js/missions-data-post.js)
  {
    dynamic = dynamic
      .replace(/^Emptied (\d+\/\d+) · (\d+) letters(?: · next (.+))?$/, (_, n, l, d) => `Geleert ${n} · ${l} Briefe${d ? ` · nächster ${d}` : ''}`)
      .replace(/^Emptied (\d+\/\d+)$/, 'Geleert $1')
      .replace(/^Emptying … (\d+) %$/, 'Leeren … $1 %')
      .replace(/^(\d+) box(?:es)? left out \(\+(\d+) s\)$/, (_, n, s) => `${n} ${plural(n, 'Briefkasten', 'Briefkästen')} ausgelassen (+${s} s)`)
      .replace(/^To the post office · (.+)$/, (_, d) => `Zur Poststelle · ${d}`)
      .replace(/^(\d+) of (\d+) post boxes emptied · (\d+) letters(?: · (\d+) left out \(\+(\d+) s\))?$/, (_, a, b, l, c, d) => `${a} von ${b} Briefkästen geleert · ${l} Briefe${c ? ` · ${c} ausgelassen (+${d} s)` : ''}`);
  }
  dynamic = dynamic.replace(/^(\d+) sprigs · (\d+) bush(?:es)? damaged · into the reserve (\d+)×$/, (_, a, b, c) => `${a} Zweige · ${b} ${plural(b, 'Strauch', 'Sträucher')} beschädigt · ${c}× ins Schutzgebiet`);
  dynamic = dynamic.replace(/^(\d+) edible · (\d+) thrown out(?: \((\d+) poisonous!\))?$/, (_, a, b, c) => `${a} essbar · ${b} weggeworfen${c ? ` (${c} giftig!)` : ''}`);
  dynamic = dynamic.replace(/^Brought out: ([\d.]+) kg galena · ([\d.]+) kg sphalerite · ([\d.]+) kg barren rock in (\d+) trips?$/, (_, a, b, c, n) => `Herausgebracht: ${a} kg Bleiglanz · ${b} kg Zinkblende · ${c} kg taubes Gestein in ${n} ${plural(n, 'Fahrt', 'Fahrten')}`);
  dynamic = dynamic.replace(/^The lamp went out: ([\d.]+) kg of ore stayed inside\.$/, 'Die Lampe ging aus: $1 kg Erz blieben drinnen.');
  dynamic = dynamic.replace(/^Out with (.+) of oil left\.$/, 'Draussen, mit $1 Öl übrig.');
  // (the Silberberg's ore shift)
  const oreDe = { galena: 'Bleiglanz', sphalerite: 'Zinkblende', 'barren rock': 'taubes Gestein', Galena: 'Bleiglanz', Sphalerite: 'Zinkblende', 'Barren rock': 'Taubes Gestein' };
  dynamic = dynamic.replace(/^Mined: ([\d.]+) kg galena · ([\d.]+) kg sphalerite · ([\d.]+) kg barren rock$/, (_, a, b, c) => `Abgebaut: ${a} kg Bleiglanz · ${b} kg Zinkblende · ${c} kg taubes Gestein`);
  dynamic = dynamic.replace(/^The lamp went out inside: ([\d.]+) kg in the basket stayed with you\.$/, (_, a) => `Die Lampe erlosch drinnen: ${a} kg im Korb blieben bei dir.`);
  dynamic = dynamic.replace(/^The lamp went out inside\.$/, 'Die Lampe erlosch drinnen.');
  dynamic = dynamic.replace(/^Out with (\d+:\d\d) of oil left: \+(\d+) pts$/, 'Draussen mit $1 Öl übrig: +$2 Pkt.');
  dynamic = dynamic.replace(/^(\d+) pts · basket ([\d.]+)\/(\d+) kg · lamp (\d+:\d\d)$/, (_, p, b, m, l) => `${p} Pkt. · Korb ${b}/${m} kg · Lampe ${l}`);
  dynamic = dynamic.replace(/^Basket ([\d.]+)\/(\d+) kg · ore bin (\d+) m · (\d+) pts$/, (_, b, m, d, p) => `Korb ${b}/${m} kg · Erzkasten ${d} m · ${p} Pkt.`);
  dynamic = dynamic.replace(/^\+([\d.]+) kg (galena|sphalerite|barren rock)$/, (_, k, o) => `+${k} kg ${oreDe[o]}`);
  dynamic = dynamic.replace(/^([\d.]+) kg into the ore bin: \+(\d+) pts$/, (_, k, p) => `${k} kg in den Erzkasten: +${p} Pkt.`);
  dynamic = dynamic.replace(/^(Galena|Sphalerite|Barren rock) · ([\d.]+) kg · hold Strike$/, (_, o, k) => `${oreDe[o]} · ${k} kg · Zuschlagen halten`);
  dynamic = dynamic.replace(/^(\d+) perfect · (\d+) good · (\d+) missed · best streak (\d+)$/, '$1 perfekt · $2 gut · $3 verpasst · beste Serie $4');
  dynamic = dynamic.replace(/^Final score (\d+) : (\d+) after (.+) · (\d+) shots$/, 'Schlussstand $1 : $2 nach $3 · $4 Schüsse');
  dynamic = dynamic.replace(/^(.+): missed$/, '$1: verpasst');
  dynamic = dynamic.replace(/^(.+) · doors (\d+) s → (-?\d+) pts$/, '$1 · Türen $2 s → $3 Pkt.');
  dynamic = dynamic.replace(/^Over the limit (\d+) s \(up to \+(\d+) km\/h\): −(\d+) pts$/, 'Über dem Limit $1 s (bis +$2 km/h): −$3 Pkt.');
  dynamic = dynamic.replace(/^(\d+) tricks( · best: )?/, (_, n, best) => `${n} Tricks${best ? ' · beste: ' : ''}`);
  dynamic = dynamic.replace(/^(\d+) airs · (\d+) grinds · (\d+) bails?$/, (_, a, b, c) => `${a} Airs · ${b} Grinds · ${c} ${plural(c, 'Sturz', 'Stürze')}`);
  dynamic = dynamic.replace(/^301 checked out in (\d+) darts · best turn (\d+) · (\d+) busts?$/, (_, a, b, c) => `301 ausgecheckt in ${a} Pfeilen · beste Runde ${b} · ${c}× überworfen`);
  dynamic = dynamic.replace(/(^| · )bust(?= · |$)/g, '$1überworfen');
  dynamic = dynamic.replace(/ — (\d+) strokes \(par (\d+), ([+-]?\d+)\)$/, ' — $1 Schläge (Par $2, $3)');
  dynamic = dynamic.replace(/^(\d+) (?:falls?) · (\d+) forgotten · (mattress at full speed|soft landing)$/, (_, a, b, c) => `${a} ${plural(a, 'Sturz', 'Stürze')} · ${b} vergessen · ${c === 'soft landing' ? 'weiche Landung' : 'volle Fahrt in die Matratze'}`);
  dynamic = dynamic.replace(/^(Won|Drawn|Lost) (\d+) : (\d+) · your goals: (\d+)(?: · assists: (\d+))?$/, (_, r, a, b, c, n) => `${{ Won: 'Gewonnen', Drawn: 'Unentschieden', Lost: 'Verloren' }[r]} ${a} : ${b} · deine Tore: ${c}${n ? ` · Assists: ${n}` : ''}`);
  dynamic = dynamic.replace(/^Jump (\d+): (.+) · (.+) landing · (-?\d+) pts$/, 'Sprung $1: $2 · Landung $3 · $4 Pkt.');
  dynamic = dynamic.replace(/^(\d+) passengers in (\d+) cabins · (\d+) % full on average · (\d+) full rows · (\d+) holes$/, '$1 Fahrgäste in $2 Kabinen · im Schnitt $3 % voll · $4 volle Reihen · $5 Löcher');
  dynamic = dynamic.replace(/^Set down:\s*$/, 'Abgesetzt:');
  // The steps' running texts
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) · (\d+) rounds left$/, '$1 · noch $2 Schuss');
  dynamic = dynamic.replace(/^(.+) in ([\d,.]+ (?:m|km)) · due ([\d:]+) \((.+)\) · (\d+)\/(\d+) km\/h$/, '$1 in $2 · fällig $3 ($4) · $5/$6 km/h');
  dynamic = dynamic.replace(/^Gate (\d+\/\d+) · (\d+) clean$/, 'Tor $1 · $2 sauber');
  dynamic = dynamic.replace(/^([\d,.]+) m of ([\d,.]+) m · (\d+) km\/h$/, '$1 m von $2 m · $3 km/h');
  dynamic = dynamic.replace(/^(\d+) goals? · (\d+) s left$/, (_, n, t) => `${n} ${plural(n, 'Tor', 'Tore')} · noch ${t} s`);
  dynamic = dynamic.replace(/^Stone (\d+) of (\d+) · (\d+) points$/, 'Stein $1 von $2 · $3 Punkte');
  dynamic = dynamic.replace(/^Stroke (\d+) · (\d+) m to the pin · (.+)$/, 'Schlag $1 · $2 m zur Fahne · $3');
  dynamic = dynamic.replace(/^(\d+:\d\d) to the summit · (\d+) s off the path · (before|after) the sun$/, (_, t, off, when) => `${t} bis zum Gipfel · ${off} s abseits vom Weg · ${when === 'before' ? 'vor' : 'nach'} der Sonne`);
  dynamic = dynamic.replace(/^(\d+:\d\d) for (.+) · (\d+) s off the path$/, '$1 für $2 · $3 s abseits vom Weg');
  dynamic = dynamic.replace(/^Stroke (\d+) · sliding … · total (\d+) \(par (\d+)\)$/, 'Schlag $1 · gleitet … · total $2 (Par $3)');
  dynamic = dynamic.replace(/^Stroke (\d+) · total (\d+) \(par (\d+)\)$/, 'Schlag $1 · total $2 (Par $3)');
  dynamic = dynamic.replace(/^Collected (\d+\/\d+) · next ([\d,.]+ (?:m|km))$/, 'Eingesammelt $1 · nächste $2');
  dynamic = dynamic.replace(/: (?:The )?(hill|tube|ramp|loop|centre island|round island|angle|bridge|Two posts) \(Par (\d)\)$/, (whole, name, par) => { const de = { 'Two posts': 'Zwei Pfosten', hill: 'Der Hügel', tube: 'Die Röhre', ramp: 'Die Rampe', loop: 'Der Looping', 'centre island': 'Die Mittelinsel', 'round island': 'Die runde Insel', angle: 'Der Winkel', bridge: 'Die Brücke' }[name]; return de ? `: ${de} (Par ${par})` : whole; });
  dynamic = dynamic.replace(/\bpts\b/g, 'Pkt.');
  const seasonDe = (season) => (season === 'Summer' ? 'Sommer' : 'Winter');
  dynamic = dynamic.replace(/^Day (\d+) · (Summer|Winter)( · \d\d:\d\d)?$/, (_, n, season, time) => `Tag ${n} · ${seasonDe(season)}${time || ''}`);
  dynamic = dynamic.replace(/^Opens at (\d\d:\d\d)$/, 'Öffnet um $1');
  dynamic = dynamic.replace(/^In (summer|winter): in 1 day$/, (_, season) => `Im ${season === 'summer' ? 'Sommer' : 'Winter'}: in 1 Tag`);
  dynamic = dynamic.replace(/^In (summer|winter): in (\d+) days$/, (_, season, n) => `Im ${season === 'summer' ? 'Sommer' : 'Winter'}: in ${n} Tagen`);
  dynamic = dynamic.replace(/^Tomorrow · (\d\d:\d\d)$/, 'Morgen · $1').replace(/^In (\d+) days · (\d\d:\d\d)$/, 'In $1 Tagen · $2');
  dynamic = dynamic.replace(/^(Gold|Silver|Bronze) ([\d:.]+|[\d,.]+ .+)$/, (_, medal, limit) => `${enToDe.get(medal) || medal} ${limit}`);
  dynamic = dynamic.replace(/^Completed · no medal yet$/, 'Abgeschlossen · noch keine Medaille');
  dynamic = dynamic.replace(/^(Gold|Silver|Bronze) · best medal$/, (_, medal) => `${enToDe.get(medal) || medal} · beste Medaille`);
  dynamic = dynamic.replace(/^Best time (.+)$/, 'Bestzeit $1');
  dynamic = dynamic.replace(/^Rank (\d+) of (\d+)$/, 'Rang $1 von $2');
  // the leaderboards' comparison (js/leaderboard-ui.js compareText)
  if (/^(You lead|Place \d+ of \d+)/.test(dynamic)) {
    const gapUnits = { points: 'Punkte', pts: 'Pkt.', goals: 'Tore', 'goals ahead': 'Tore Vorsprung', skiers: 'Skifahrer', 'WC pts': 'Weltcup-Punkte' };
    const gapDe = (g) => g.replace(/^(-?\d+) (goals ahead|goals|skiers|points|WC pts|pts)$/, (_, n, u) => `${n} ${n === '1' ? gapUnits[u].replace('Tore', 'Tor') : gapUnits[u]}`);
    dynamic = dynamic
      .replace(/^You lead by (.+) over place 2$/, (_, g) => `Du führst mit ${gapDe(g).replace(/ Punkte$/, ' Punkten').replace(/ Tore$/, ' Toren')} vor Platz 2`)
      .replace(/^Place (\d+) of (\d+)/, 'Platz $1 von $2')
      .replace(/ · ([^·]+?) behind place (\d+)/, (_, g, p) => ` · ${gapDe(g)} hinter Platz ${p}`)
      .replace(/ · ([^·]+?) behind the leader$/, (_, g) => ` · ${gapDe(g)} hinter der Spitze`);
  }
  dynamic = dynamic.replace(/^Best score (.+)$/, 'Bestwert $1');
  dynamic = dynamic.replace(/^Best (time|score) (.+)$/, (_, kind, value) => `Bester ${kind === 'time' ? 'Zeitwert' : 'Punktestand'} ${value}`);
  dynamic = dynamic.replace(/^New best (time|score) (.+) \(was (.+)\)$/, (_, kind, value, old) => `Neuer ${kind === 'time' ? 'Zeitrekord' : 'Punkterekord'} ${value} (vorher ${old})`);
  dynamic = dynamic.replace(/^First best (time|score) (.+)$/, (_, kind, value) => `Erster ${kind === 'time' ? 'Zeitwert' : 'Punktestand'} ${value}`);
  dynamic = dynamic.replace(/^(\d+) steps$/, '$1 Schritte');
  dynamic = dynamic.replace(/^of ([\d,.]+) points$/, 'von $1 Punkten');
  dynamic = dynamic.replace(/^(\d+) pts$/, '$1 Pkt.');
  dynamic = dynamic.replace(/^Time (.+)$/, 'Zeit $1');
  dynamic = dynamic.replace(/^first completion \+(\d+)$/, 'erster Abschluss +$1');
  dynamic = dynamic.replace(/^you hold (Gold|Silver|Bronze): no new points$/, (_, medal) => `${enToDe.get(medal) || medal} bleibt dein Bestwert: keine neuen Punkte`);
  dynamic = dynamic.replace(/^(Gold|Silver|Bronze) medal$/, (_, medal) => `${enToDe.get(medal) || medal}medaille`);
  // a feedback popup: a known line and its points after two spaces
  dynamic = dynamic.replace(new RegExp(`^(.+?)${POP}$`), (whole, head, tail) => (tail && enToDe.has(head) ? enToDe.get(head) + tail : whole));
  return match[1] + dynamic + match[3];
}

function updateText(node) {
  if (!node.parentElement || node.parentElement.closest('script, style, svg, .language-switch, .player-name, .ai-text')) return;
  const current = node.nodeValue;
  let original = sourceText.get(node);
  if (original === undefined || current !== translatedText.get(node)) {
    original = current;
    sourceText.set(node, original);
  }
  const next = translate(original);
  translatedText.set(node, next);
  if (current !== next) node.nodeValue = next;
}

function updateAttributes(element) {
  if (element.closest('.language-switch, .player-name, .ai-text')) return;
  let originals = sourceAttributes.get(element);
  let rendered = translatedAttributes.get(element);
  if (!originals) { originals = new Map(); sourceAttributes.set(element, originals); }
  if (!rendered) { rendered = new Map(); translatedAttributes.set(element, rendered); }
  for (const name of attributes) {
    if (!element.hasAttribute(name)) continue;
    const current = element.getAttribute(name);
    if (!originals.has(name) || current !== rendered.get(name)) originals.set(name, current);
    const next = translate(originals.get(name));
    rendered.set(name, next);
    if (current !== next) element.setAttribute(name, next);
  }
}

function updateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) { updateText(root); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.matches('script, style, svg, .language-switch, .player-name, .ai-text')) return;
  updateAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) updateText(node);
    else updateAttributes(node);
  }
}

export function getLanguage() { return language; }
export function t(value) { return translate(value); }
export function setLocalizedText(element, source) {
  const original = source || '';
  const rendered = translate(original);
  element.textContent = rendered;
  if (element.firstChild?.nodeType === Node.TEXT_NODE) {
    sourceText.set(element.firstChild, original);
    translatedText.set(element.firstChild, rendered);
  }
}
export function setLanguage(next) {
  if (next !== 'de' && next !== 'en') return;
  language = next;
  document.documentElement.lang = next === 'de' ? 'de-CH' : 'en';
  try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  document.querySelectorAll('.language-btn').forEach((button) => button.setAttribute('aria-pressed', String(button.lang === next)));
  updateTree(document.body);
  window.dispatchEvent(new CustomEvent('languagechange', { detail: { language: next } }));
}

/** A DE · EN switch for a screen of its own (the first-visit question, the guest's sign-in): the same language, key and
 *  buttons as the menu's, so a choice here carries over into the game. Its labels are not translated (.language-switch). */
export function languageSwitch() {
  const group = document.createElement('div');
  group.className = 'language-switch is-standalone';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Language / Sprache');
  for (const [lang, label] of [['de', 'Deutsch'], ['en', 'English']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'language-btn';
    button.lang = lang;
    button.textContent = lang.toUpperCase();
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(lang === language));
    button.addEventListener('click', () => setLanguage(lang));
    group.append(button);
  }
  return group;
}

function start() {
  document.querySelectorAll('.language-btn').forEach((button) => button.addEventListener('click', () => setLanguage(button.lang)));
  setLanguage(language);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') updateText(mutation.target);
      else if (mutation.type === 'attributes') updateAttributes(mutation.target);
      else for (const node of mutation.addedNodes) updateTree(node);
    }
  });
  observer.observe(document.body, { childList: true, characterData: true, attributes: true, attributeFilter: attributes, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
