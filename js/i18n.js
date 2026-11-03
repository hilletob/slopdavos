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
  ['Based on Slop Zürich on GitHub (opens in a new tab)', 'Basierend auf Slop Zürich auf GitHub (öffnet einen neuen Tab)'],
  ['Based on colorfield/slop-zurich', 'Basierend auf colorfield/slop-zurich'],
  ['Atmosphere & time of day', 'Atmosphäre und Tageszeit'],
  ['Golden Hour', 'Goldene Stunde'], ['Sunny Midday', 'Sonniger Mittag'], ['Midday', 'Mittag'],
  ['Blue Hour', 'Blaue Stunde'], ['Night 23:00', 'Nacht 23:00'], ['Night', 'Nacht'],
  ['Teleport the active player', 'Aktive Spielfigur teleportieren'], ['Teleport to', 'Teleportieren nach'],
  ['Teleport', 'Teleportieren'], ['Full Davos street map [M]', 'Davos-Strassenkarte öffnen [M]'],
  ['Map', 'Karte'], ['Mute sound [N]', 'Ton ausschalten [N]'], ['Mute sound', 'Ton ausschalten'],
  ['Enable sound', 'Ton einschalten'], ['Clean view: hide the HUD [H]', 'Freie Sicht: HUD ausblenden [H]'],
  ['Enable sound [N]', 'Ton einschalten [N]'], ['Show the HUD [H]', 'HUD einblenden [H]'],
  ['Web Audio is unavailable', 'Web Audio ist nicht verfügbar'],
  ['Hide HUD', 'HUD ausblenden'], ['Show HUD', 'HUD einblenden'],
  ['Data & credits', 'Daten & Quellen'], ['Close', 'Schliessen'],
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
  ['Third-Person Navigation Mode', 'Fortbewegungsmodus'],
  ['Person [1]', 'Zu Fuss [1]'], ['Car · Yellow Cab [2]', 'Auto · Gelbes Taxi [2]'],
  ['Cyclist [3]', 'Fahrrad [3]'], ['RhB · drive a train on the rails [4]', 'RhB · Zug auf den Gleisen fahren [4]'],
  ['Rega helicopter [5]', 'Rega-Helikopter [5]'], ['Pistenfahrzeug [6]', 'Pistenfahrzeug [6]'],
  ['Walk', 'Gehen'], ['Drive', 'Fahren'], ['Cycle', 'Radfahren'], ['Fly', 'Fliegen'], ['Groomer', 'Pistenfahrzeug'],
  ['Vehicle telemetry and camera', 'Fahrdaten und Kamera'], ['Davos Cyclist', 'Davos-Radfahrer'],
  ['m a.s.l.', 'm ü. M.'],
  ['Pedestrian', 'Fussgänger'], ['Cargo bike', 'Lastenrad'], ['Snow groomer', 'Pistenfahrzeug'],
  ['Previous camera', 'Vorherige Kamera'], ['Next camera', 'Nächste Kamera'],
  ['Next camera [V]', 'Nächste Kamera [V]'], ['All cameras [V cycles]', 'Alle Kameras [V wechselt]'],
  ['Multiple Camera Angles', 'Kameraperspektiven'], ['Follow', 'Folgen'], ['Scenic', 'Aussicht'],
  ['3rd-Person Chase', 'Verfolgerkamera'], ['Low-Angle Action', 'Tiefe Actionkamera'],
  ['First-Person / Cockpit', 'Ich-Perspektive / Cockpit'], ['Schatzalp over the valley', 'Schatzalp über dem Tal'],
  ['Dischma valley', 'Dischmatal'], ['Auto-Director Aerial', 'Automatische Luftkamera'],
  ['Touch controls', 'Touch-Steuerung'], ['Movement joystick: drag up or down to move, left or right to turn', 'Joystick: nach oben oder unten zum Bewegen, nach links oder rechts zum Lenken ziehen'],
  ['Move & steer', 'Bewegen & lenken'], ['Drag to look · Pinch to zoom', 'Ziehen zum Umschauen · Zwei Finger zum Zoomen'],
  ['Hold to perform an action', 'Gedrückt halten, um eine Aktion auszuführen'],
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
  ['Tap to teleport · Drag to pan · Use + / − to zoom', 'Tippen zum Teleportieren · Ziehen zum Verschieben · Mit + / − zoomen'],
  ['You', 'Du'], ['Landmark', 'Sehenswürdigkeit'], ['GPS route', 'GPS-Route'], ['Bridge / Hwy', 'Brücke / Hauptstrasse'],
  ['near', 'bei'], ['Click to teleport here', 'Klicken, um hierher zu teleportieren'],
  ['Mission', 'Mission'], ['Mission complete', 'Mission abgeschlossen'],
  ['Loading the surroundings …', 'Umgebung wird geladen …'],
  ['The stopwatch will be ready in a moment', 'Die Stoppuhr ist gleich bereit'],
  ['Press Enter or the button to start', 'Zum Starten Enter oder die Schaltfläche drücken'],
  ['Get in', 'Einsteigen'], ['Get out', 'Aussteigen'],
  ['Get off', 'Aussteigen'], ['Leave the cab', 'Führerstand verlassen'],
  ['Board the RhB', 'In die RhB einsteigen'], ['Take the bike', 'Fahrrad nehmen'],
  ['Drive the bus', 'Bus fahren'], ['End of the line: you got off', 'Endstation: Du bist ausgestiegen'],
  ['On foot', 'Zu Fuss'], ['Wait for the next station', 'Bis zum nächsten Bahnhof warten'],
  ['Only at a station', 'Nur an einem Bahnhof'], ['Land first', 'Erst landen'],
  ['Stop first', 'Erst anhalten'], ['Brake to a stop first (S)', 'Erst mit S zum Stillstand bremsen'],
  ['bike', 'Fahrrad'], ['snow groomer', 'Pistenfahrzeug'],
  ['Grab', 'Greifen'], ['Pick', 'Pflücken'], ['Strike', 'Schlagen'], ['Kick', 'Abstossen'],
  ['Shovel', 'Schaufeln'], ['Double pole', 'Doppelstockschub'],
  ['Chase', 'Verfolgen'], ['Action', 'Action'], ['POV / Dash', 'Ich / Cockpit'], ['Director', 'Regie'],
  ['Turn', 'Drehen'], ['Sprint', 'Sprinten'], ['Orbit', 'Umschauen'],
  ['Drive / Reverse', 'Fahren / Rückwärts'], ['Steer', 'Lenken'], ['Boost', 'Beschleunigen'],
  ['Horn', 'Hupe'], ['Indicators', 'Blinker'], ['High beam', 'Fernlicht'],
  ['Pedal / Brake', 'Treten / Bremsen'], ['Lean & Turn', 'Neigen & Lenken'],
  ['Throttle', 'Gas geben'], ['Brake', 'Bremsen'], ['Pitch', 'Nicken'], ['Yaw', 'Gieren'],
  ['Ascend', 'Steigen'], ['Searchlight', 'Suchscheinwerfer'],
  ['Forward / Reverse', 'Vorwärts / Rückwärts'], ['Turn on the spot', 'Auf der Stelle drehen'],
  ['Beacon', 'Rundumleuchte'], ['Tiller', 'Fräse'], ['Drag', 'Ziehen'],
  ['Missions', 'Missionen'], ['All missions', 'Alle Missionen'], ['Choose a mission', 'Mission auswählen'],
  ['Back to the game', 'Zurück zum Spiel'], ['Day', 'Tag'], ['Fire', 'Abfeuern'],
  ['No best score yet', 'Noch kein Bestwert'], ['No best time yet', 'Noch keine Bestzeit'],
  ['No medal this time', 'Diesmal keine Medaille'],
  ['Completed, no medal', 'Abgeschlossen, keine Medaille'], ['Not completed yet', 'Noch nicht abgeschlossen'],
  ['no new points', 'keine neuen Punkte'],
  ['First best time', 'Erste Bestzeit'], ['First best score', 'Erster Bestwert'],
  ['The stopwatch starts with your first input after Start.', 'Die Stoppuhr startet mit deiner ersten Eingabe nach dem Start.'],
  ['Start', 'Starten'], ['Restart', 'Neustarten'], ['Retry', 'Erneut versuchen'],
  ['Continue', 'Weiter'], ['Quit', 'Beenden'], ['Cancel', 'Abbrechen'],
  ['Resume', 'Fortsetzen'], ['Pause', 'Pause'], ['Failed', 'Gescheitert'],
  ['Gold', 'Gold'], ['Silver', 'Silber'], ['Bronze', 'Bronze'],
  ['Loading', 'Laden'], ['Ready', 'Bereit'], ['Complete', 'Abgeschlossen'],
  ['Speed skating: 2 × 400 m', 'Eisschnelllauf: 2 × 400 m'],
  ['Penalty shoot-out in the Eisstadion', 'Penaltyschiessen im Eisstadion'],
  ['Curling on the Eisbahn', 'Curling auf der Eisbahn'],
  ['Headbang contest at the BOX', 'Headbang-Wettbewerb in der BOX'],
  ['Table football at La Onda', 'Tischfussball im La Onda'],
  ['Pack the Jakobshorn cabin', 'Jakobshorn-Gondel füllen'],
  ['RhB driver: Wolfgang – Davos Platz', 'RhB-Lokführer: Wolfgang – Davos Platz'],
  ['Ore in the Silberberg mine', 'Erz im Silberbergwerk'],
  ['Snow shovelling at Dischmastrasse', 'Schneeschaufeln an der Dischmastrasse'],
  ['Snow blower on the Bündastrasse', 'Schneefräsen auf der Bündastrasse'],
  ['Mowing the Kurpark lawn', 'Rasenmähen im Kurpark'],
  ['Refuse round in Davos Platz', 'Kehrichtrunde in Davos Platz'],
  ['Alpine roses below the Strelaberg', 'Alpenrosen unter dem Strelaberg'],
  ['Mushroom hunt in the Dischma forest', 'Pilzsuche im Dischmawald'],
  ['Horn sledge race at the Rinerhorn', 'Hornschlittenrennen am Rinerhorn'],
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
  ['Mine the ore and bring it to day', 'Erz abbauen und ans Tageslicht bringen'],
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
  ['Z / right click: scope · Shift: hold breath · Space / click: fire', 'Z / Rechtsklick: Zielfernrohr · Shift: Atem anhalten · Space / Klick: schiessen'],
  ['Warming up …', 'Aufwärmen …'],
  ['WASD: run · Space / click: swing · A/D at the swing: aim', 'WASD: laufen · Space / Klick: schlagen · A/D beim Schlag: zielen'],
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
  ['W/S or 1-5 club · A/D or drag aim · Space: swing, power, strike · C cart', 'W/S oder 1–5: Schläger · A/D oder Ziehen: zielen · Space: Schwung, Kraft, Schlag · C: Golfwagen'],
  ['W hold: stroke · Space in the green: power stroke · A/D lean · S brake', 'W halten: laufen · Space im grünen Bereich: kräftiger Abstoss · A/D lehnen · S bremsen'],
  ['Power stroke!', 'Kräftiger Abstoss!'], ['Too early: stumble', 'Zu früh: gestolpert'],
  ['W skate · A/D steer · S stop · Space shoot · drag to aim', 'W laufen · A/D lenken · S stoppen · Space schiessen · Ziehen zum Zielen'],
  ['A/D or drag: aim · W/S: curl · hold Space: power, let go: throw · hold Space: sweep', 'A/D oder Ziehen: zielen · W/S: Drall · Space halten: Kraft, loslassen: werfen · Space halten: wischen'],
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
  ['W hold: stride · Space in the green: power stroke · Q hold: double pole (flat) · let go of W downhill: tuck · A/D steer', 'W halten: laufen · Space im grünen Bereich: kräftiger Abstoss · Q halten: Doppelstockschub · bergab W loslassen: Hocke · A/D lenken'],
  ['A/D aim · hold Space, let go to putt · or drag back from the ball and let go · V overview', 'A/D zielen · Space halten und zum Putten loslassen · oder Ball zurückziehen und loslassen · V Übersicht'],
  ['Mouse / WASD aim · hold Space or the mouse button, let go in the green · phone: touch to aim, swipe up to throw', 'Maus / WASD zielen · Space oder Maustaste halten, im grünen Bereich loslassen · Handy: antippen zum Zielen, nach oben wischen zum Werfen'],
  ['W pump · A/D carve / spin · Space hold: grab · grind: A/D balance, Space drops in', 'W Tempo holen · A/D lenken / drehen · Space halten: Grab · Grind: A/D balancieren, Space zurück in die Bowl'],
  ['F: get out', 'F: aussteigen'],
  ['F: get in', 'F: einsteigen'],
  ['At the bar', 'An der Bar'],
  ['Order a Flämmli', 'Flämmli bestellen'],
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
  ['Flämmli in the Rot Liechtli', 'Flämmli im Rot Liechtli'],
  ['The red lamp turns gently. Take the Rufbus home: nobody is driving tonight.', 'Die rote Lampe dreht sich sanft. Nimm den Rufbus nach Hause: Heute Abend fährt niemand.'],
  ['The landlord called time', 'Der Wirt hat Feierabend gerufen'],
  ['Go into the Rot Liechtli', 'Ins Rot Liechtli gehen'],
  ['Finding a place at the bar …', 'Platz an der Bar suchen …'],
  ['Space or the button', 'Space oder die Taste'],
  ['Tomato', 'Tomate'],
  ['Basil', 'Basilikum'],
  ['Ham', 'Schinken'],
  ['Mushrooms', 'Pilze'],
  ['Pineapple', 'Ananas'],
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
  // the rural missions (js/missions-data-rural.js)
  ['Quad ride from Heldstab', 'Quadfahrt ab Heldstab'],
  ['Through Davos Dorf to the Bedraweg', 'Durch Davos Dorf zum Bedraweg'],
  ['Round the off-road course', 'Rund um den Geländeparcours'],
  ['Back to the Heldstab yard', 'Zurück auf den Heldstab-Platz'],
  ['Too slow: Heldstab wants the quad back before closing time.', 'Zu langsam: Heldstab will das Quad vor Feierabend zurück.'],
  ['Back onto the quad', 'Zurück aufs Quad'],
  ['In the air!', 'In der Luft!'],
  ['Mud: ease off, the quad slides', 'Schlamm: Gas weg, das Quad rutscht'],
  ['Old snow: hardly any grip', 'Altschnee: kaum Grip'],
  ['Back in the Heldstab yard, mud up to the ears. They hose the quad down without a word and ask if you would like to see the invoice for a new one.', 'Zurück auf dem Heldstab-Platz, Dreck bis über die Ohren. Sie spritzen das Quad wortlos ab und fragen, ob du die Rechnung für ein neues sehen möchtest.'],
  ['Green waste to the biogas plant', 'Bioabfall zur Biogasanlage'],
  ['Collect the barrels', 'Fässer einsammeln'],
  ['Unload at the biogas plant', 'Bei der Biogasanlage abladen'],
  ['Open transporter', 'Offener Transporter'],
  ['Biogas plant', 'Biogasanlage'],
  ['Load', 'Ladung'],
  ['Smell', 'Gestank'],
  ['Reject', 'Stehen lassen'],
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
  ['The hopper swallows the load, the digester burps contentedly. Electricity and district heat by Thursday, and the flies stay at the plant.', 'Der Bunker schluckt die Ladung, der Fermenter rülpst zufrieden. Bis Donnerstag gibt das Strom und Fernwärme, und die Fliegen bleiben bei der Anlage.'],
  ["Batch spoiled: the plastic went into the digester's hopper", 'Fuhre verdorben: Das Plastik ist im Annahmebunker gelandet'],
  ['A clean load: the plant manager nods', 'Eine saubere Ladung: Der Anlagenleiter nickt'],
];

const enToDe = new Map(pairs);
// Long mission introductions are keyed by their unique opening phrase. The live values
// contain numbers calculated by the mission definitions, so exact string keys are brittle.
const missionIntros = [
  ['Heldstab AG on the Bahnhofstrasse', 'Die Heldstab AG an der Bahnhofstrasse in Davos Dorf verkauft Landmaschinen und auch Quads. Heute gehört dir eines für eine Probefahrt: durchs Dorf zum Bedraweg, rund um die Wege und Wiesen oberhalb von Dorf und über die Mühlestrasse zurück. Das Quad ist leicht und nervös. Nimm die Buckel schnell: Ein sauberer Sprung schenkt dir 1,5 s. Schlamm und der letzte Altschnee nehmen dir den Grip, und in der Luft lenkt nichts mehr.'],
  ['Davos collects green waste now', 'Davos sammelt jetzt Bioabfall in runden Fässern, und der kommt in die Biogasanlage bei der Duchli Ranch. Fahr mit dem offenen Transporter durch Davos Dorf: Halte mit der Ladefläche neben jedem Fass, die Crew hebt es hinauf, solange du stehst, und stellt ein leeres an seinen Platz. Schau in die Fässer: In zweien steckt Plastik. Lass sie mit Leertaste oder E (oder der Taste «Stehen lassen») stehen, bevor sie oben sind, sonst ist die ganze Fuhre verdorben. Dann den Duchliweg hinunter zum Annahmebunker des Fermenters, wo die Fässer gekippt werden. Punkte gibt es für Fässer, eine saubere Ladung und die Zeit.'],
  ['The Natureisbahn Davos, Europe', 'Zwei Runden à 400 m auf der Natureisbahn, gegen den Uhrzeigersinn. W gedrückt halten zum Laufen, Space im Rhythmus für einen kräftigen Abstoss drücken. Mit A/D in die Kurven lehnen, mit S bremsen. Wer die Innenkegel schneidet, wird disqualifiziert.'],
  ["The HCD's home ice", 'Fünf Penaltys gegen den Torhüter im Eisstadion. Mit W auf das Tor zufahren, mit A/D lenken und mit S bremsen. Die rote Markierung zeigt die Schussrichtung; mit Space schiessen. Komm nahe heran, aber halte mindestens zwei Meter Abstand zum Torhüter.'],
  ['A sheet on the hard court', 'Acht Curlingsteine ins Haus spielen. Mit A/D zielen, mit W/S den Drall wählen und mit gedrückter Leertaste die Wurfkraft bestimmen. Während der Stein gleitet, mit Space wischen: Er läuft weiter und gerader. Je näher am Zentrum, desto mehr Punkte.'],
  ['Three holes on the course', 'Drei Löcher im Golf Club Davos spielen. Schläger mit W/S oder 1–5 wählen, mit A/D zielen. Space dreimal drücken: Schwung starten, Kraft festlegen, Ball auf der Linie treffen. Auf Touch: Swing halten, loslassen und auf der Linie tippen. Wind und Grüngefälle beachten. Nach jedem Schlag zum Ball gehen oder mit C den Golfwagen rufen.'],
  ['The Davoser Craft Beer on', 'Bier für fünf Davoser Bars ausliefern. Mit F aus dem VW T3 steigen, zwei Stapel Kisten in den Wagen tragen und zu Rot Liechtli, Ex Bar, La Onda, Dorfkeller und BOX fahren. Jeweils nahe parken, aussteigen und eine Kiste zur Tür tragen.'],
  ['Early shift at the Bäckerei', 'Frühschicht in der Bäckerei Weber: fünf Gipfeli gleichmässig rollen, indem du über den Teig nach unten ziehst oder S / ↓ im Takt drückst. Dann per Velo die Gipfeli vor sieben Uhr zu Seehof, Montana und Turmhotel Victoria bringen und bei jedem Hotel anhalten.'],
  ['Rush hour at Gourmet Käch', '90 Sekunden lang Raclette servieren. Käse im richtigen Moment mit einer Wischbewegung oder Space abschaben: goldgelb für normale Bestellungen, leicht braun für „extra knusprig“. Zu früh ist er roh, zu spät verbrannt.'],
  ['September, the Bündner Hochjagd', 'Bei der Bündner Hochjagd nur einen alten Bock mit mindestens 75 cm langen Hörnern erlegen. Langsam zum Stand gehen. Zum Zielen ziehen, mit Rechtsklick oder Z das Zielfernrohr nutzen und mit Shift den Atem beruhigen. Hinter die Schulter zielen und den Wind beachten. Geissen, Kitze und junge Böcke sind geschützt. Vier Schuss.'],
  ['The squirrels of the Seepromenade', 'Eichhörnchen am Davosersee füttern. Ruhig am Ufer entlanggehen, stehen bleiben und mit E oder „Nuss“ eine Haselnuss hinhalten. Nicht bewegen, während das Tier herankommt; Rennen verscheucht es. In drei Minuten so viele wie möglich füttern.'],
  ['The coach of the tennis club', 'Tiebreak in der Sporthalle Färbi: zuerst sieben Punkte mit zwei Punkten Vorsprung gewinnen. Mit W/A/S/D bewegen, nach dem Aufprall mit Space oder Klick schlagen; A/D beim Schlag lenkt den Ball. Beim Aufschlag mit Space hochwerfen und am höchsten Punkt erneut drücken.'],
  ["The eau-là-là's slide", 'Die Rutsche im eau-là-là möglichst schnell hinunterfahren. In den Kurven mit A/D oder dem Joystick auf der idealen Linie bleiben. Zu hoch an der Wand bremst, zu tief rüttelt. Schnell ins Becken eintauchen.'],
  ['Ernst Ludwig Kirchner painted', 'Vor dem Kirchner Museum ein Bild in Kirchners kräftigen Farben malen: Farbe und Pinsel wählen, mit Maus oder Finger malen und schwarze Konturen ergänzen. „Vorlage“ legt eine vereinfachte Ansicht über die Leinwand. Drei Minuten Zeit; Ähnlichkeit, Farben und Konturen zählen. Das Bild lässt sich speichern.'],
  ['Race day on the Jakobshorn', 'Slalomrennen auf dem Jakobshorn: durch jedes rot-blaue Tor und ins Ziel fahren. Mit A/D lenken, W für die Hocke, S zum Bremsen. Ein ausgelassenes Tor gibt Zeitstrafe; zu viele führen zur Disqualifikation.'],
  ['The JatzPark has built', 'Drei Big-Air-Sprünge im JatzPark. Auf dem Anlauf Tempo holen; in der Luft mit A/D drehen, mit W/S einen Flip machen und mit Space einen Grab halten. Aufrecht und in Fahrtrichtung landen. Die Punkte aller drei Sprünge zählen.'],
  ['The bike race of the summer', 'Mountainbike-Abfahrt von der Ischalp nach Bolgen Plaza: 2,7 km und fast 400 Höhenmeter. Alle Checkpoints der Reihe nach durchfahren; bei einer Abkürzung zum ausgelassenen Punkt zurückkehren. Zu enge Kurven bei hohem Tempo führen zum Sturz und kosten fünf Sekunden.'],
  ['Metal night at the BOX', 'Metal-Nacht in der BOX Davos an der Bahnhofstrasse in Davos Dorf. Geh hinein und headbange zur Band: Drücke Space (oder tippe BANG) genau im Takt. Perfekte Treffer zählen mehr, eine Serie vervielfacht deine Punkte bis ×5, die Menge dreht durch. Ein Song, 60 Sekunden.'],
  ['The regulars at the Bar La Onda', 'Tischfussball im La Onda: Du spielst Rot von links. Mit W/S oder der Maus die Stange beim Ball bewegen, mit 1–4 eine Stange wählen und mit Q zur Automatik zurückkehren. Space oder Klick schiesst. Auf dem Handy ziehen und SHOOT tippen. Wer zuerst fünf Tore erzielt, gewinnt.'],
  ['Rush hour at the valley station', 'Die Jakobshorn-Gondel wie bei Tetris füllen. Mit ←/→ oder A/D verschieben, mit ↑/W drehen, mit S oder Space abwerfen und mit E oder Enter die Gondel losschicken. Volle Reihen bringen Bonuspunkte, Lücken kosten Punkte. Auf dem Handy wischen und tippen. 100 Sekunden.'],
  ['Take the Capricorn from Davos Wolfgang', 'Den RhB-Capricorn von Davos Wolfgang nach Davos Platz fahren. In Davos Dorf und Kongress/Eisstadion fahrplanmässig anhalten, mit der Zugspitze an der Markierung stoppen, die Türen 20 Sekunden offen lassen und Tempolimits beachten. W gibt Gas, S bremst.'],
  ['The Silberberg above Schmelzboden', 'Im Silberbergwerk Galenit und Zinkblende abbauen. Mit W/S gehen und A/D drehen. E oder Space halten, um Erz aus der Wand zu schlagen; der 16-kg-Korb entleert sich in den Förderwagen. Den Wagen zum Stollenportal schieben: Nur Erz draussen zählt. Die Öllampe brennt vier Minuten.'],
  ['The horn sledge race of the winter', 'Mit dem Hornschlitten vom Jatzmeder Richtung Glaris fahren: 2 km und 350 Höhenmeter. A/D lenken und lehnen, S bremst mit Fersen und Kette, W duckt dich oder stösst an. In engen Kurven kann der Schlitten kippen; jeder Sturz kostet fünf Sekunden.'],
  ['The night shift is calling', 'Die Dischma-Loipe in der Nachtschicht präparieren. Mit dem Pistenfahrzeug auf der Spur fahren und die Fräse mit F absenken, bis 90 % der Loipe bearbeitet sind.'],
  ['A skier lies injured', 'Ein Skifahrer auf der Jakobshorn-Standardpiste ist verletzt. Mit dem Rega-Helikopter hinfliegen, tief über ihm schweben oder neben ihm landen, bis er an Bord ist. Dann zum Landeplatz beim Spital zurückfliegen.'],
  ['After the fresh snow', 'Den Hang unter dem Salezer Horn mit dem Lawinenwerfer sichern. Ziehen dreht und hebt das Rohr; nach oben ziehen macht den Winkel steiler. Der weisse Ring zeigt den Auftreffpunkt. Mit Space oder Klick feuern. Zwölf Schuss für vier Zonen.'],
  ['Alert: motorbike crash', 'Motorradunfall an der Flüelapassstrasse. Mit der Rega hinfliegen, auf der markierten Wiese neben der Strasse landen, den Patienten versorgen und zum Spital bringen.'],
  ['Dispatch to patrol Davos', 'Als Polizeipatrouille zum Motorradunfall an der Flüelapassstrasse fahren. Mit K Blaulicht einschalten und vor der Unfallstelle quer parken. Dann zu Fuss (1) je 50 m vor und hinter dem Unfall Kegel aufstellen und die Rega einweisen.'],
  ['Thirty centimetres of fresh snow', 'Den Zugangsweg an der Dischmastrasse 19 freischaufeln. Space oder „Schaufeln“ halten und den Weg entlanggehen. Wenn der Schieber voll ist oder du loslässt, landet der Schnee auf einem Haufen im Garten. Mindestens 95 % des Weges räumen.'],
  ['Forty centimetres overnight', 'Die Bündastrasse mit der Schneefräse auf 300 m von Rand zu Rand räumen. Eine Seite hinauf, wenden, die andere zurück. Unter 13 km/h bleiben, damit die 2,8 m breite Fräse nicht verstopft. Geparkte Autos weder rammen noch zuschütten; V dreht den Auswurf.'],
  ['The Kurpark in Davos Platz', 'Den Rasen im Kurpark beim Carl-Dorno-Weg in Bahnen mähen, bis 93 % geschnitten sind. Die beiden Blumenbeete aussparen: Jeder beschädigte Bereich kostet zwei Sekunden.'],
  ['Tuesday is refuse day', 'Mit dem Kehrichtwagen im Hofquartier zehn Sammelstellen anfahren. Mit dem Heck anhalten, damit die Crew laden kann, und danach bei der KMA entladen. Jede ausgelassene Stelle kostet 45 Sekunden.'],
  ['July, and the Alpenrosen', 'Zwölf blühende Alpenrosenzweige unter dem Strelaberg pflücken. Zu einem blühenden Busch gehen und Space oder „Pflücken“ halten. Unblühende Büsche und das eingezäunte Schutzgebiet meiden; beides gibt Zeitstrafe. Danach zum Start zurückkehren.'],
  ['Late summer rain', 'Zehn Pilze im Dischmawald sammeln oder fünf Minuten lang suchen. Steinpilze und Eierschwämme sind gut; Gallenröhrling, falscher Pfifferling und Fliegenpilz meiden. Das HUD beschreibt den Pilz vor dir. Mit Space oder „Pflücken“ aufnehmen und den Korb zur Pilzkontrolle bringen.'],
  ['Davos Nordic, the World Cup', '4,3-km-Langlaufrennen auf den Flüela-Loipen. Mit 1 klassisch oder mit 2 Skating wählen. W halten, Space im Rhythmus für einen kräftigen Abstoss drücken. Mit Q auf flachen Strecken Doppelstockschub, bergab W loslassen für die Hocke; A/D lenkt, S bremst. Gegen sieben Läufer antreten.'],
  ['The nine red Eternit lanes', 'Neun Minigolfbahnen beim Hotel Waldhuus. Mit A/D oder der Maus zielen, Space zum Aufladen halten und zum Schlagen loslassen. Auf dem Handy den Ball wie bei einer Schleuder zurückziehen. Maximal sieben Schläge pro Bahn; ein Ball im Graben kostet einen Schlag. 20 Schläge oder weniger ergeben Gold.'],
  ['The Green Wildman, the Irish pub', 'Darts im Green Wildman: 301 Double Out mit möglichst wenigen Pfeilen. Mit Maus oder W/A/S/D zielen, Space oder Maustaste zum Ausholen halten und im grünen Bereich loslassen. Auf dem Handy auf die Scheibe tippen und nach oben wischen. Der letzte Wurf muss ein Doppel oder Bullseye sein. Höchstens 45 Pfeile.'],
  ["The Schüssla in the Färich", '60 Sekunden in der Schüssla skaten. W gibt Tempo, A/D lenkt. Über die Kante springen: A/D dreht, Space hält einen Grab. Langsam am Rand entlang für einen Grind; mit A/D balancieren, mit Space zurück in die Bowl. Tricks in kurzer Folge bilden Combos; ein Sturz löscht die Combo.'],
  ['Evening in the Rot Liechtli', 'Abend im Rot Liechtli, dem kleinen Pub in Davos Platz. Ein Flämmli ist ein Schweizer Shot: ein Glas Schnaps, angezündet, ausgeblasen und getrunken. Geh hinein und setz dich an die Bar. Dann folgen sechs Runden mit einer einzigen Taste (Space, Enter oder Tippen): bestellen, anzünden, wenn das Feuerzeug über dem Glas ist, ausblasen, solange die Flamme im grünen Bereich ist, und kippen, wenn der Rand abgekühlt ist. Jeder Drink macht die Fenster enger und bringt den Raum zum Schwanken. Nach drei Pannen ruft der Wirt Feierabend. Du gehst heute Abend übrigens zu Fuss nach Hause.'],
  ['Friday night at Pizza Heaven', 'Freitagabend im Pizza Heaven, dem Pizzakurier an der Promenade, und der Kurier hat sich krankgemeldet. Steig aus dem Lieferwagen (F) und geh in den Laden: Belege vier Pizzas mit den Zutaten auf dem Bon, in der angegebenen Reihenfolge (Tasten 1–8 oder Antippen), schnell und ohne falsche Zutat. Dann bring sie zu vier Adressen vom Eisstadion bis Davos Dorf: parken, die Schachtel hinten aus dem Lieferwagen nehmen und zur Tür tragen. Der Wärmebalken sinkt ab dem Moment, in dem die Pizzas den Laden verlassen, und heisse Pizzas zahlen sich aus.'],
  ['A sunny day on the Parsenn', 'Ein sonniger Tag auf dem Parsenn, und im Radio der Liftbude läuft ein Ländler. Du bist der Liftwart am Hauptertäli-Bügellift: Die Skifahrer kommen paarweise die Spur herauf, und du reichst ihnen den Bügel genau dann, wenn er ankommt. Drücke Space (oder tippe), wenn der Bügel die grüne Markierung erreicht. Zu früh oder zu spät wirft er einen Skifahrer um (sie lachen es weg); tust du nichts, schwingt er leer nach oben. Der Andrang wächst: Der Chef dreht den Lift hoch. Zwei Minuten: Wie viele Skifahrer bringst du hinauf?'],
  ['Saturday morning at Sport Hofmänner', 'Samstagmorgen bei Sport Hofmänner an der Mattastrasse: Die Langläufer wollen ihre Langlaufski gewachst haben. Lies die Schneetemperatur auf der Tafel ab und wähle das Wachs nach seiner Farbe (Tasten 1–5 oder Antippen). Bügle es in einem gleichmässigen Zug pro Ski auf, von der Spitze bis zum Ende: Zieh das Bügeleisen oder halte → / D und halte das Tempo im grünen Band. Zu langsam oder ein heisses Bügeleisen, das stillsteht, verbrennt den Belag. Dann abziehen und bürsten, von der Spitze bis zum Ende (ziehen oder → halten). Zweieinhalb Minuten: Es zählt die Qualität, aber auch die Anzahl Paare.'],
  ['A bluebird winter morning', 'Ein Wintermorgen mit Kaiserwetter, und halb Davos will aufs Jakobshorn. In deiner Warnweste dirigierst du den Parkplatz Jakobshornbahn: Jedes Auto rollt die Gasse auf dich zu, und du winkst es nach links, rechts oder geradeaus (← → ↑ oder die Tasten) dorthin, wo grüne Pfeile freie Plätze zeigen. Winkst du rechtzeitig, parkt es gerade ein; zu spät, und es parkt schräg; ohne Zeichen macht der Fahrer, was er will, vielleicht quer über die Gasse. Wenn Skifahrer direkt vor deinen Füssen queren, halte das Auto an (↓ / Space) und winke es hinter ihnen durch. Zwei Minuten.'],
  ['Last run done, boots still on', 'Letzte Abfahrt geschafft, die Skischuhe noch an: Après-Ski-Party in der Bolgenschanze an der Skistrasse in Davos Platz. Geh hinein und spring mit der Menge: Drücke Space (oder tippe SPRINGEN) genau im Takt, und wenn der DJ zu den Off-Beats wechselt, zwischen den Kicks. Perfekte Treffer zählen mehr, eine Serie vervielfacht deine Punkte bis ×5. Ein Track, 60 Sekunden.'],
];
// Mission places in running text: [after "bis" (distance), after "geh" (walk in)]
const placeDe = new Map([
  ['the Rot Liechtli', ['zum Rot Liechtli', 'ins Rot Liechtli']], ['Pizza Heaven', ['zu Pizza Heaven', 'ins Pizza Heaven']],
  ['the Bolgenschanze', ['zur Bolgenschanze', 'in die Bolgenschanze']], ['the BOX', ['zur BOX', 'in die BOX']],
  ['the loading point', ['zur Einstiegsstelle', '']], ['your place', ['zu deinem Platz', '']],
  ['the Eisstadion, Talstrasse 41', ['zum Eisstadion, Talstrasse 41', '']],
  ['the Kongresszentrum, Talstrasse 49a', ['zum Kongresszentrum, Talstrasse 49a', '']],
  ['the Hotel Seehof, Promenade 159', ['zum Hotel Seehof, Promenade 159', '']],
  ['Museumstrasse 2, Davos Dorf', ['zur Museumstrasse 2, Davos Dorf', '']]
]);
const POP = '((?:  [+\\-−]?\\d+)?)'; // a feedback popup's points, after two spaces
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
  let dynamic = match[2].replace(/^(\d+) streets · ([\d,.]+) blocks$/, '$1 Strassen · $2 Blöcke');
  // gastro / resort / après-ski missions (before the generic rules below, which would mangle these)
  dynamic = dynamic.replace(/^([\d,.]+ (?:m|km)) to (.+?)( · .+)?$/, (whole, d, label, rest) => (placeDe.has(label) ? `${d} bis ${placeDe.get(label)[0]}${rest || ''}` : whole));
  dynamic = dynamic.replace(/^Get out \(F\) and walk into (.+)$/, (whole, label) => (placeDe.get(label)?.[1] ? `Steig aus (F) und geh ${placeDe.get(label)[1]}` : whole));
  dynamic = dynamic.replace(/(\d+) % hot\b/g, '$1 % heiss');
  const popped = /^(\S.*?)(  [+\-−]?\d+)$/.exec(dynamic);
  if (popped && enToDe.has(popped[1])) dynamic = enToDe.get(popped[1]) + popped[2];
  dynamic = dynamic.replace(new RegExp(`^Not yet: (.+) next${POP}$`), (_, top, tail) => `Noch nicht: zuerst ${enToDe.get(top) || top}${tail}`);
  dynamic = dynamic.replace(new RegExp(`^(.+): in the oven${POP}$`), '$1: ab in den Ofen$2');
  dynamic = dynamic.replace(new RegExp(`^(.+): flawless!${POP}$`), '$1: makellos!$2');
  dynamic = dynamic.replace(/^(\d+) of (\d+) Flämmli down · (\d+) perfect moments · (\d+) (?:mishap|mishaps)$/, (_, a, b, c, n) => `${a} von ${b} Flämmli getrunken · ${c} perfekte Momente · ${n} ${n === '1' ? 'Panne' : 'Pannen'}`);
  dynamic = dynamic.replace(/^(\d+) rounds of Flämmli$/, '$1 Runden Flämmli');
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
  dynamic = dynamic.replace(/^(\d+) cars parked well · (\d+) crooked · (\d+) blockers · (\d+) close calls$/, '$1 Autos gut geparkt · $2 schräg · $3 blockiert · $4 Beinahe-Unfälle');
  dynamic = dynamic.replace(/^(\d+) pts · (\d+) parked · (\d+:\d{2})$/, '$1 Pkt. · $2 geparkt · $3');
  dynamic = dynamic.replace(/^pts · (\d+) good · (\d+) crooked · (\d+) blocking · (\d+) s · (.+)$/, (_, good, crooked, blocking, s, hand) => {
    const place = hand.replace(/^held \((\d+) s\)$/, 'angehalten ($1 s)').replace(/^(\d+) m to the line$/, '$1 m bis zur Linie').replace(/^no car in sight$/, 'kein Auto in Sicht');
    return `Pkt. · ${good} gut · ${crooked} schräg · ${blocking} blockiert · ${s} s · ${place}`;
  });
  dynamic = dynamic.replace(/^(\d+) perfect · (\d+) good · (\d+) missed · best streak (\d+)$/, '$1 perfekt · $2 gut · $3 verpasst · beste Serie $4');
  dynamic = dynamic.replace(/(\d+) skiers$/, '$1 Skifahrer');
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
  dynamic = dynamic.replace(/^Hole (\d+): (.+) \(par (\d+)\)$/, 'Loch $1: $2 (Par $3)');
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
  dynamic = dynamic.replace(/\bpts\b/g, 'Pkt.');
  dynamic = dynamic.replace(/^Completed · no medal yet$/, 'Abgeschlossen · noch keine Medaille');
  dynamic = dynamic.replace(/^(Gold|Silver|Bronze) · best medal$/, (_, medal) => `${enToDe.get(medal) || medal} · beste Medaille`);
  dynamic = dynamic.replace(/^Best time (.+)$/, 'Bestzeit $1');
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
  return match[1] + dynamic + match[3];
}

function updateText(node) {
  if (!node.parentElement || node.parentElement.closest('script, style, svg, .language-switch')) return;
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
  if (element.closest('.language-switch')) return;
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
  if (root.matches('script, style, svg, .language-switch')) return;
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
