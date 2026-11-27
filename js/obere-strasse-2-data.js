// The houses along the Obere Strasse in Davos Platz from the arthausHOTEL (−740/190) south past the Schatzalpbahn's
// valley station down to the houses above the Post (−370/−460) (js/obere-strasse-2.js): twenty-eight houses by hand in
// one module, each its surveyed volumes, its roofs and its look. Pure data and frame maths, shared by the browser
// module and the tests.
//
// Sources: swissBUILDINGS3D (tiles 11/1744/1007–1011, 11/1745/1011–1013, 11/1746/1013; the batches are each house's
// `exclude`): GEOM below holds each batch's flat roofs as outlines with their heights (a prism down under the ground
// each; an outline inside another as high or higher dropped) and its sloped roof triangles as they are (the walls of a
// house under them stand on the triangles' outline drawn in by EAVES m). Heights in the world frame (y = m a.s.l.
// − 1558, js/davos-frame.js; x east, z south). Where a batch holds a neighbour's volume too, that part names the
// neighbour's OpenStreetMap id (`osm`) and its outline is registered for it: w123384639 and w1529620023 in the batch of
// w123384621, w1528718535 in w123384622's, w123384632 in w123384644's, w127653845 in w127653849's, w127653850 in
// w127653863's, w123385329 in the arthausHOTEL's; the outlines of w1529620025 (in w127653863's batch) and w123384628 (in
// w1529973400's) are only partly built and keep no walls of their own (their survey's walls are the parts' around
// them). OpenStreetMap maps five of the houses twice (w1528797228–32): those copies keep no walls either.
// w127653804's outline in OpenStreetMap is much larger than what the survey has (its two pitched blocks next to
// w127653856): the rest is empty ground in the survey and its walls stood there unseen. js/europe-block.js leaves it
// alone. js/promenade-platz.js builds the low podium on the Promenade before w123384637 (its own walls, no outline);
// w123384637's pitched house stands over the podium's back here. The Schatzalpbahn's hall (js/bergbahnen.js) runs into
// the valley station from the north-west: the station's walls leave its box open (HALL), the hall's lining is
// js/bergbahnen.js'.
// The look after Mapillary's street views (CC BY-SA, all from the winters 2013–2016), each house's note saying which
// photographs show it and what is guessed. The north half of the row (from w127653851 to the arthausHOTEL) has no
// photographs of its own: its look is guessed from its neighbours.
import { outwardRing, ringArea2, wallFrame, onWall, pointInRing } from './spital-data.js';

// The windows' grid every house's storeys are scaled to (the walls' material draws a window per bay from it)
export const STOREY = 3.0;
// a window (m over its storey's foot in the grid), its half width; the bays' spacing along a wall (a house's `bay`)
export const WIN = { lo: 0.9, hi: 2.25, half: 0.6 };
export const BAY = 2.8;
// The windows' kinds the walls' material draws: white-framed with a post, wide with outside blinds, dark-framed in
// timber, between green shutters, between brown shutters, a shop's glazing band
export const KINDS = { punched: 0, blinds: 1, dark: 2, greenShutters: 3, brownShutters: 4 };
// how far the walls of a house under sloped triangles stand in from the roof's outline (the eaves)
export const EAVES = 0.6;

// The streets' centre lines (OpenStreetMap w957801418, w219004104, w957801417, w37352306; the Promenade's stretch by
// w122930760 and the Post): a house's walls facing one within FRONT m are its fronts
export const STREETS = {
  obere: [[-307, -484], [-339, -465], [-408, -393], [-425, -377], [-436, -363], [-453, -340], [-466, -322], [-476, -312], [-491, -298],
    [-506, -288], [-547, -265], [-561, -255], [-572, -243], [-589, -212], [-593, -201], [-622, -144], [-641, -110], [-652, -92], [-669, -69],
    [-687, -54], [-725, -32], [-735, -23], [-744, -11], [-750, 1], [-751, 17], [-751, 33], [-760, 130], [-757, 143], [-762, 159], [-768, 202],
    [-770, 221]],
  promenade: [[-574, -137], [-562, -180], [-560, -188], [-547, -226], [-544, -233], [-540, -238], [-535, -244], [-526, -252], [-515, -257],
    [-506, -261], [-491, -267], [-483, -272], [-477, -276], [-472, -281], [-453, -302], [-430, -326], [-391, -370], [-370, -391], [-349, -412],
    [-328, -433]],
  // the lane from the Promenade up to the Schatzalpbahn
  lane: [[-574, -148], [-601, -150]]
};
export const FRONT = 14;
export const GEOM = {
  w117012195: {exclude: [{x: -453.9, z: -363.2, r: 3}], floor: 5.23, parts: [{ring: [[-454.5, -353.9], [-462.8, -360.6], [-453.3, -372.4], [-445, -365.8]], top: 17.87}]},
  w121860620: {exclude: [{x: -473.9, z: -342.4, r: 3}], floor: 3.7, parts: [{ring: [[-464.3, -347.8], [-469.3, -355], [-483.7, -342], [-474.6, -329.8], [-470.4, -336], [-471.6, -336.7]], top: 22.28}]},
  w122930760: {exclude: [{x: -589.3, z: -161.5, r: 3}, {x: -579.4, z: -172.3, r: 3}], floor: -3.2, parts: [{ring: [[-586.9, -175.9], [-594.6, -147.8], [-591.7, -147], [-584, -174.9]], top: 6.75}, {ring: [[-579.8, -185.4], [-581, -181.1], [-571.6, -178.5], [-569.9, -184.7], [-573, -185.5], [-573.6, -183.5], [-579, -185]], top: 10.71}, {ring: [[-582.6, -185.5], [-582.5, -186.2], [-578.9, -185.2], [-577.9, -188.8], [-572.5, -187.3], [-573, -185.5], [-569.1, -184.5], [-566.6, -193.8], [-573.6, -195.7], [-572.9, -198.4], [-585.1, -201.7], [-589.1, -187.3]], top: 11.22}, {ring: [[-582.2, -181.4], [-592.1, -145.6], [-581.2, -142.6], [-571.3, -178.5]], top: 11.9}, {ring: [[-581.2, -156.8], [-582.9, -150.6], [-589.6, -152.5], [-587.9, -158.7]], top: 14.01, onRoof: true}, {ring: [[-572.5, -187.3], [-577.9, -188.8], [-579, -185], [-573.6, -183.5]], top: 14.01}], tris: [[[-579.8, 11.9, -159.7], [-581.2, 14.6, -161.8], [-580.3, 11.9, -159.4]], [[-580.3, 11.9, -159.4], [-581.2, 14.6, -161.8], [-581, 11.9, -159.3]], [[-581, 11.9, -159.3], [-581.2, 14.6, -161.8], [-581.6, 11.9, -159.3]], [[-581.6, 11.9, -159.3], [-581.2, 14.6, -161.8], [-582.2, 11.9, -159.4]], [[-582.2, 11.9, -159.4], [-581.2, 14.6, -161.8], [-582.8, 11.9, -159.8]], [[-582.8, 11.9, -159.8], [-581.2, 14.6, -161.8], [-583.2, 11.9, -160.2]], [[-583.2, 11.9, -160.2], [-581.2, 14.6, -161.8], [-583.5, 11.9, -160.8]], [[-583.5, 11.9, -160.8], [-581.2, 14.6, -161.8], [-583.7, 11.9, -161.4]], [[-583.7, 11.9, -161.4], [-581.2, 14.6, -161.8], [-583.7, 11.9, -162]], [[-583.7, 11.9, -162], [-581.2, 14.6, -161.8], [-583.6, 11.9, -162.6]], [[-583.6, 11.9, -162.6], [-581.2, 14.6, -161.8], [-583.3, 11.9, -163.2]], [[-583.3, 11.9, -163.2], [-581.2, 14.6, -161.8], [-582.9, 11.9, -163.7]], [[-582.9, 11.9, -163.7], [-581.2, 14.6, -161.8], [-582.3, 11.9, -164]], [[-582.3, 11.9, -164], [-581.2, 14.6, -161.8], [-581.7, 11.9, -164.2]], [[-581.7, 11.9, -164.2], [-581.2, 14.6, -161.8], [-581.1, 11.9, -164.3]], [[-581.1, 11.9, -164.3], [-581.2, 14.6, -161.8], [-580.5, 11.9, -164.2]], [[-580.5, 11.9, -164.2], [-581.2, 14.6, -161.8], [-579.9, 11.9, -163.9]], [[-579.9, 11.9, -163.9], [-581.2, 14.6, -161.8], [-579.4, 11.9, -163.6]], [[-579.4, 11.9, -163.6], [-581.2, 14.6, -161.8], [-579, 11.9, -163.1]], [[-579, 11.9, -163.1], [-581.2, 14.6, -161.8], [-578.8, 11.9, -162.5]], [[-578.8, 11.9, -162.5], [-581.2, 14.6, -161.8], [-578.7, 11.9, -161.8]], [[-578.7, 11.9, -161.8], [-581.2, 14.6, -161.8], [-578.7, 11.9, -161.2]], [[-578.7, 11.9, -161.2], [-581.2, 14.6, -161.8], [-578.9, 11.9, -160.6]], [[-578.9, 11.9, -160.6], [-581.2, 14.6, -161.8], [-579.3, 11.9, -160.1]], [[-581.2, 14.6, -161.8], [-579.8, 11.9, -159.7], [-579.3, 11.9, -160.1]]]},
  w123383537: {exclude: [{x: -737.3, z: 41.5, r: 3}, {x: -738.9, z: 32.8, r: 3}], floor: 13.33, parts: [{ring: [[-744.6, 40.3], [-744.7, 43.6], [-730.3, 44.3], [-730, 38.8], [-735.3, 38.5], [-735.4, 40.8]], top: 20.95}, {ring: [[-741.8, 25.4], [-741.8, 25.8], [-748.6, 25.5], [-749, 34.5], [-747.7, 34.5], [-747.8, 37.1], [-749.1, 37], [-749.3, 40.1], [-747.4, 41.6], [-744.4, 41.7], [-744.4, 41.1], [-734.6, 41.5], [-734.5, 39.3], [-729.3, 39.6], [-728.6, 24.5], [-739.3, 24.1], [-739.4, 25.5]], top: 29.67}, {ring: [[-733.5, 30.2], [-738.4, 29.9], [-738.6, 33.7], [-733.8, 34]], top: 31.58, onRoof: true}]},
  w123384611: {exclude: [{x: -403.8, z: -424.8, r: 3}], floor: 2.06, parts: [{ring: [[-402.4, -409.5], [-404.9, -411.9], [-399.5, -417.6], [-400.2, -418.2], [-395.7, -422.9], [-394.7, -422], [-389.2, -427.8], [-387, -425.7], [-392.5, -419.8], [-394.1, -421.3], [-398.3, -416.9], [-396.7, -415.4]], top: 14.2}, {ring: [[-401.9, -420.3], [-402.7, -421.1], [-398.4, -425.6], [-397.1, -424.3], [-391.6, -430.1], [-389.2, -427.8], [-394.7, -422], [-395.7, -422.9], [-400.2, -418.2], [-399.5, -417.6], [-405.9, -410.9], [-408.5, -413.3]], top: 16.54}, {ring: [[-391.6, -430.1], [-397.1, -424.3], [-398.4, -425.6], [-402.7, -421.1], [-401.9, -420.3], [-408.5, -413.3], [-410.2, -414.9], [-403.5, -421.9], [-403.9, -422.2], [-394.1, -432.5]], top: 19.26}, {ring: [[-418.8, -424.4], [-420.8, -426.3], [-407.6, -440.1], [-403.9, -436.5], [-400.8, -439.8], [-393.6, -433], [-403.9, -422.2], [-403.5, -421.9], [-410.3, -414.8], [-419.6, -423.6]], top: 22.41}]},
  w123384613: {exclude: [{x: -363.4, z: -418.7, r: 3}, {x: -367.6, z: -418.7, r: 3}, {x: -367.6, z: -418.7, r: 3}], floor: -4.7, parts: [{ring: [[-356.4, -432.1], [-347.9, -425.8], [-348, -423.5], [-356.1, -415], [-356.5, -419.9], [-362.5, -425.4]], top: 7.76}, {ring: [[-362.8, -425.7], [-364, -424.4], [-366.3, -426.6], [-379, -413.2], [-370.2, -405.1], [-366.7, -405.4], [-356.3, -416.7], [-356.5, -419.9]], top: 15.64}], slabs: [{ring: [[-364, -424.1], [-366.3, -426.2], [-378.7, -413.2], [-370.1, -405.4], [-366.8, -405.6], [-357.1, -416.2], [-356.3, -416.7], [-356.4, -419.1], [-354, -416.8], [-366.3, -403.9], [-369.5, -403.4], [-381.1, -414.5], [-362.4, -434], [-358, -429.8], [-362.4, -425.3], [-362.7, -425.3]], top: -4.7}]},
  w123384616: {exclude: [{x: -542.6, z: -274.8, r: 3}, {x: -552.4, z: -274.9, r: 3}, {x: -556, z: -266.8, r: 3}], floor: 3.1, parts: [{ring: [[-545, -270.3], [-545.1, -270.6], [-542.9, -272], [-546, -277.3], [-543.2, -279.2], [-539.2, -274.2]], top: 10.61}, {ring: [[-556.6, -272.4], [-559, -270.9], [-562.8, -277.4], [-550.7, -284.6], [-549.8, -283.7], [-548.1, -284.7], [-546.5, -284.7], [-543, -280], [-545.1, -277.3], [-541.9, -271.8], [-551.9, -265.1]], top: 17.15}, {ring: [[-557.8, -263.2], [-560, -266.7], [-554.4, -270.3], [-552.1, -266.8]], top: 10.51}]},
  w123384618: {exclude: [{x: -430.7, z: -393.4, r: 3}], floor: 2.98, parts: [{ring: [[-431.9, -405.2], [-435.8, -400.6], [-436.6, -401.2], [-440.7, -396.4], [-437.8, -393.9], [-443.9, -386.7], [-437.6, -381.3], [-433.9, -385.6], [-429.1, -381.5], [-417.4, -395.2], [-420.4, -397.9], [-419.5, -398.9], [-427, -405.3], [-429.1, -402.8]], top: 17.49}]},
  w123384621: {exclude: [{x: -520.3, z: -293.7, r: 3}], floor: 3.1, parts: [{ring: [[-503.2, -306.3], [-507.1, -308.9], [-509, -307.4], [-506.6, -303.7]], top: 12.21}, {ring: [[-508.9, -298.3], [-509.9, -299.9], [-505.8, -302.5], [-506.6, -303.7], [-503.2, -306.3], [-496.6, -300.8], [-505, -294.3]], top: 13.56, osm: "w1529620023"}, {ring: [[-521.4, -284], [-525.7, -294.1], [-516.6, -297.9], [-519.1, -302.2], [-509.5, -308.2], [-505.8, -302.5], [-509.9, -299.9], [-505.1, -292.3], [-512.6, -287.9]], top: 18.75}, {ring: [[-530.3, -298.9], [-544.2, -292.7], [-540.7, -284.8], [-542.1, -284.2], [-539.5, -278.3], [-522.1, -286.1], [-525.2, -293], [-527.2, -292.1]], top: 19.03, osm: "w123384639"}]},
  w123384622: {exclude: [{x: -490.3, z: -320.4, r: 3}], floor: 3.46, parts: [{ring: [[-476.9, -316.7], [-478.2, -316.1], [-481.5, -323.3], [-480.1, -323.9]], top: 12.75}, {ring: [[-493.4, -311.7], [-497.2, -310], [-495.4, -306.1], [-491.6, -307.8]], top: 13.28}, {ring: [[-495.9, -317.3], [-496.1, -317.7], [-499.9, -316], [-497.2, -310], [-493.4, -311.7], [-493.6, -312.2], [-495, -311.6], [-497.3, -316.7]], top: 16.4}, {ring: [[-495, -311.6], [-497.3, -316.7], [-495.9, -317.3], [-493.6, -312.2]], top: 20.05, onRoof: true}, {ring: [[-500.3, -329.4], [-503.9, -327.7], [-499.9, -318.8], [-493.6, -321.7], [-492.7, -319.7], [-484, -323.7], [-489, -334.6], [-494, -332.3], [-492.4, -328.7], [-490, -329.8], [-487, -323.1], [-491.1, -321.3], [-491.9, -322.8], [-496.3, -320.8]], top: 22.32, osm: "w1528718535"}, {ring: [[-477.2, -313.8], [-491.4, -307.3], [-496.3, -318.1], [-482.1, -324.6]], top: 22.66}, {ring: [[-487, -323.1], [-491.1, -321.3], [-491.9, -322.8], [-496.3, -320.8], [-500.3, -329.5], [-494.1, -332.4], [-492.4, -328.7], [-490, -329.8]], top: 25.24, osm: "w1528718535", onRoof: true}]},
  w123384623: {exclude: [{x: -370.8, z: -461.5, r: 3}], floor: 0.82, parts: [{ring: [[-380.9, -450.1], [-382, -451.1], [-371.9, -461.6], [-369.9, -459.8], [-361.8, -468.2], [-357.8, -464.4], [-358.4, -463.9], [-355.7, -461.3], [-377.9, -438.2], [-385.4, -445.4]], top: 18.18}, {ring: [[-369.9, -459.8], [-377, -466.6], [-376.1, -467.5], [-376.6, -468], [-375.9, -468.8], [-382.3, -474.9], [-373.1, -484.4], [-360.7, -472.4], [-362.8, -470.3], [-361.3, -468.8]], top: 22.94}]},
  w123384627: {exclude: [{x: -721.3, z: -3.8, r: 3}, {x: -724.7, z: -4.2, r: 3}], floor: 11.07, parts: [{ring: [[-731.9, 0.3], [-731.9, 2.7], [-711, 3], [-710.8, -10.2], [-731.7, -10.5], [-731.8, -10], [-716.6, -9.8], [-716.7, 0.5]], top: 25.98}, {ring: [[-731.9, 0.8], [-731.9, 2.7], [-733.4, 2.7], [-733.2, -10.5], [-716.1, -10.3], [-716.2, 1.1]], top: 28.86}]},
  w123384630: {exclude: [{x: -381.9, z: -397.6, r: 3}, {x: -388.9, z: -404, r: 3}], floor: -4.6, parts: [{ring: [[-370.7, -399.1], [-381.4, -408.9], [-393.2, -396], [-382.5, -386.2]], top: 9.8}, {ring: [[-392, -396.5], [-396.4, -399.8], [-385.4, -411.9], [-381.7, -407.8]], top: 14.8}]},
  w123384631: {exclude: [{x: -571.4, z: -261.5, r: 3}], floor: 5.63, parts: [{ring: [[-575.2, -253.2], [-580.5, -261], [-567.6, -269.8], [-562.3, -261.9]], top: 16.49}]},
  w123384637: {exclude: [{x: -453.6, z: -316.7, r: 3}, {x: -448, z: -324, r: 3}], floor: -4.19, parts: [{ring: [[-459.8, -318.1], [-451.6, -310.7], [-447.5, -315.2], [-449.9, -317.3], [-451.7, -317.5], [-453.1, -320.3], [-455.7, -322.6]], tris: [0, 14]}, {ring: [[-446.9, -331.7], [-455.6, -322.1], [-452.8, -319.6], [-451.7, -317.5], [-450.3, -317.4], [-449.1, -316.2], [-440.4, -325.8]], tris: [14, 14]}], tris: [[[-459.8, 4.2, -318.1], [-457.6, 6.6, -320.1], [-457.8, 6.6, -320.3]], [[-457.8, 6.6, -320.3], [-457.6, 6.6, -320.1], [-455.7, 4.2, -322.6]], [[-455.7, 4.2, -322.6], [-457.6, 6.6, -320.1], [-453.1, 4.2, -320.3]], [[-453.1, 4.2, -320.3], [-457.6, 6.6, -320.1], [-452.8, 4.4, -319.6]], [[-452.8, 4.4, -319.6], [-457.6, 6.6, -320.1], [-451.7, 5, -317.5]], [[-457.6, 6.6, -320.1], [-449.8, 6.6, -313], [-451.7, 5, -317.5]], [[-451.7, 5, -317.5], [-449.8, 6.6, -313], [-450.3, 4.4, -317.4]], [[-450.3, 4.4, -317.4], [-449.8, 6.6, -313], [-449.9, 4.2, -317.3]], [[-449.9, 4.2, -317.3], [-449.8, 6.6, -313], [-447.5, 4.2, -315.2]], [[-447.5, 4.2, -315.2], [-449.8, 6.6, -313], [-449.6, 6.6, -312.9]], [[-449.6, 6.6, -312.9], [-449.8, 6.6, -313], [-451.6, 4.2, -310.7]], [[-449.8, 6.6, -313], [-457.6, 6.6, -320.1], [-451.6, 4.2, -310.7]], [[-457.6, 6.6, -320.1], [-459.8, 4.2, -318.1], [-451.6, 4.2, -310.7]], [[-449.9, 6.5, -312.9], [-447.9, 4.4, -315.1], [-449.8, 6.6, -313]], [[-446.6, 8.6, -331.4], [-446.9, 8.4, -331.7], [-446.8, 8.6, -331.2]], [[-446.9, 8.4, -331.7], [-455.6, 8.4, -322.1], [-446.8, 8.6, -331.2]], [[-455.6, 8.4, -322.1], [-455.4, 8.5, -322], [-446.8, 8.6, -331.2]], [[-455.4, 8.5, -322], [-455.3, 8.6, -321.9], [-446.8, 8.6, -331.2]], [[-449.1, 8.6, -316.2], [-440.4, 8.6, -325.8], [-449.1, 8.6, -316.3]], [[-449.1, 8.6, -316.3], [-440.4, 8.6, -325.8], [-450.3, 9.5, -317.4]], [[-440.4, 8.6, -325.8], [-442.6, 10.1, -327.4], [-450.3, 9.5, -317.4]], [[-450.3, 9.5, -317.4], [-442.6, 10.1, -327.4], [-451.7, 10.1, -317.5]], [[-451.7, 10.1, -317.5], [-442.6, 10.1, -327.4], [-452.8, 9.5, -319.6]], [[-455.3, 8.6, -321.9], [-452.8, 9.5, -319.6], [-446.8, 8.6, -331.2]], [[-452.8, 9.5, -319.6], [-442.6, 10.1, -327.4], [-446.8, 8.6, -331.2]], [[-446.6, 8.6, -331.4], [-446.8, 8.6, -331.2], [-442.5, 10.1, -327.6]], [[-446.8, 8.6, -331.2], [-442.6, 10.1, -327.4], [-442.5, 10.1, -327.6]], [[-442.6, 10.1, -327.4], [-440.4, 8.6, -325.8], [-442.5, 10.1, -327.6]]]},
  w123384643: {exclude: [{x: -609.8, z: -149.3, r: 3}], floor: 1.34, parts: [{ring: [[-601.5, -155.2], [-603.9, -155.8], [-603.8, -156.2], [-609.5, -158], [-608.7, -161], [-600.6, -158.7]], top: 7.75}, {ring: [[-606.2, -141.7], [-607.3, -138.2], [-608.8, -138.8], [-603.9, -155.8], [-601.4, -155.1], [-602.6, -150.5], [-602.6, -146.1], [-603.4, -144.4], [-604.5, -142.9]], top: 8.54}, {ring: [[-617.3, -143.9], [-619.3, -144.3], [-611.7, -158.8], [-603.8, -156.2], [-609.1, -137.6], [-615.7, -139.6], [-615.2, -141.4]], top: 15.77}]},
  w123384644: {exclude: [{x: -465.5, z: -308.4, r: 3}], floor: -4.14, parts: [{ring: [[-453, -310.3], [-455.5, -307.6], [-463.1, -314.9], [-460.6, -317.5]], top: 6.59, osm: "w123384632"}, {ring: [[-476.5, -302.1], [-477.8, -303.4], [-477.9, -305.7], [-466.3, -317.9], [-455.1, -307.2], [-463.1, -298.9], [-469.2, -299.7], [-469, -301.1]], top: 11.69}]},
  w123385352: {exclude: [{x: -739.3, z: 192.3, r: 3}], floor: 8.92, parts: [{ring: [[-747.5, 202.4], [-746.6, 191.1], [-735.6, 195.6], [-738.9, 203.1]], top: 14.98}, {ring: [[-741.7, 213.3], [-742.6, 213], [-740.2, 205.2], [-747.5, 203], [-747.5, 200.6], [-737.6, 203.5]], top: 16.22, osm: "w123385329"}, {ring: [[-742.3, 174], [-743.8, 177.7], [-746, 176.8], [-744.5, 173.1]], top: 16.73}, {ring: [[-747.5, 189], [-748.2, 190.5], [-735.3, 195.7], [-732.9, 189.7], [-733.5, 189.4], [-735.4, 193.9]], top: 16.95}, {ring: [[-740.2, 205.2], [-743.1, 214.3], [-748.5, 212.6], [-747.5, 203]], top: 18.7, osm: "w123385329"}, {ring: [[-733.8, 176.3], [-735.6, 175.6], [-734.9, 174.1], [-741.3, 171.5], [-742.7, 175], [-734.6, 178.3]], top: 18.7}, {ring: [[-735.4, 193.9], [-748.3, 188.7], [-742.8, 175], [-729.8, 180.3]], top: 26.55}], tris: [[[-741.3, 16.2, 171.5], [-743.5, 16.2, 170.6], [-742.3, 16.8, 174]], [[-743.5, 16.2, 170.6], [-744.5, 16.8, 173.1], [-742.3, 16.8, 174]]]},
  w127653787: {exclude: [{x: -593.4, z: -256.2, r: 3}], floor: 8.3, parts: [{ring: [[-592.2, -247.3], [-601.9, -252.3], [-601.2, -253.6], [-591.5, -248.7]], top: 25.29}, {ring: [[-590.9, -248.4], [-601.7, -253.8], [-598.4, -260.4], [-593.8, -264.5], [-592.7, -263.9], [-591.6, -264.9], [-590.6, -265], [-589.7, -264.7], [-589.1, -263.1], [-589.4, -262.2], [-585, -260]], top: 27.34}]},
  w127653804: {exclude: [{x: -648, z: -140.8, r: 3}, {x: -647.3, z: -152.5, r: 3}], floor: 8.72, parts: [{ring: [[-653.1, -144.8], [-650.1, -136.8], [-647.4, -135.4], [-643.2, -143.7], [-645.5, -144.8]], tris: [0, 20]}, {ring: [[-650.5, -157.2], [-653, -152.2], [-644.1, -147.7], [-641.6, -152.7]], tris: [20, 10]}], tris: [[[-652.3, 26.1, -144.4], [-653, 26.1, -144.8], [-653.1, 26.1, -144.8]], [[-653, 26.1, -144.8], [-652.3, 26.1, -144.4], [-653, 26.1, -144.8]], [[-653, 26.1, -144.8], [-652.3, 26.1, -144.4], [-652, 25.8, -145]], [[-652.3, 26.1, -144.4], [-645.6, 26.1, -141.1], [-652, 25.8, -145]], [[-652, 25.8, -145], [-645.6, 26.1, -141.1], [-646.9, 24.4, -146]], [[-644.9, 23.9, -146.1], [-645.3, 23.9, -146.3], [-645.4, 24.4, -145.2]], [[-645.3, 23.9, -146.3], [-646.9, 24.4, -146], [-645.4, 24.4, -145.2]], [[-645.4, 24.4, -145.2], [-646.9, 24.4, -146], [-645.5, 24.5, -144.8]], [[-646.9, 24.4, -146], [-645.6, 26.1, -141.1], [-645.5, 24.5, -144.8]], [[-645.5, 24.5, -144.8], [-645.6, 26.1, -141.1], [-644.1, 24.5, -144.1]], [[-644.1, 24.5, -144.1], [-645.6, 26.1, -141.1], [-643.2, 24.5, -143.7]], [[-643.2, 24.5, -143.7], [-645.6, 26.1, -141.1], [-644.8, 26.1, -140.6]], [[-644.8, 26.1, -140.6], [-645.6, 26.1, -141.1], [-647.4, 23.9, -135.4]], [[-650.1, 23.9, -136.8], [-647.4, 23.9, -135.4], [-650.3, 24.1, -137.3]], [[-647.4, 23.9, -135.4], [-645.6, 26.1, -141.1], [-650.3, 24.1, -137.3]], [[-650.3, 24.1, -137.3], [-645.6, 26.1, -141.1], [-650.6, 24.3, -138.1]], [[-650.6, 24.3, -138.1], [-645.6, 26.1, -141.1], [-652.7, 25.8, -143.8]], [[-645.6, 26.1, -141.1], [-652.3, 26.1, -144.4], [-652.7, 25.8, -143.8]], [[-652.3, 26.1, -144.4], [-653.1, 26.1, -144.8], [-652.7, 25.8, -143.8]], [[-645.7, 26, -141], [-644.1, 24.5, -144.1], [-645.6, 26.1, -141.1]], [[-650.5, 23.3, -157.2], [-646.4, 25.2, -154], [-645.9, 25.2, -154.8]], [[-641.6, 23.6, -152.7], [-645.9, 25.2, -154.8], [-642, 23.6, -151.8]], [[-645.9, 25.2, -154.8], [-646.4, 25.2, -154], [-642, 23.6, -151.8]], [[-646.4, 25.2, -154], [-648, 25.2, -150.8], [-642, 23.6, -151.8]], [[-642, 23.6, -151.8], [-648, 25.2, -150.8], [-644.1, 23.6, -147.7]], [[-644.1, 23.6, -147.7], [-648, 25.2, -150.8], [-648.4, 25.2, -149.9]], [[-648.4, 25.2, -149.9], [-648, 25.2, -150.8], [-652.1, 23.7, -151.8]], [[-648, 25.2, -150.8], [-646.4, 25.2, -154], [-652.1, 23.7, -151.8]], [[-646.4, 25.2, -154], [-650.5, 23.3, -157.2], [-652.1, 23.7, -151.8]], [[-652.1, 23.7, -151.8], [-650.5, 23.3, -157.2], [-653, 23.3, -152.2]]]},
  w127653849: {exclude: [{x: -611.3, z: -239.9, r: 3}, {x: -595.1, z: -246.3, r: 3}], floor: 6.96, parts: [{ring: [[-595.4, -240], [-599.1, -243.8], [-600.2, -248.1], [-592.9, -240.7], [-599.8, -233.9]], top: 18.75}, {ring: [[-607, -230.5], [-610.8, -234.4], [-610.4, -234.8], [-614.5, -239], [-610.7, -242.7], [-612.2, -244.3], [-604.1, -252.2], [-600.2, -248.2], [-599.1, -243.8], [-595.4, -240], [-598.9, -236.6], [-599, -234.7], [-601.8, -231.9], [-603.7, -233.8]], top: 20.08}, {ring: [[-610.7, -242.7], [-614.5, -239], [-616.9, -241.6], [-613.2, -245.3]], top: 22.53}, {ring: [[-622.5, -244.7], [-629.8, -237.8], [-623.8, -231.6], [-617.9, -227.6], [-610.4, -234.8], [-617, -241.6], [-618.3, -240.3]], top: 23, osm: "w127653845"}, {ring: [[-598.3, -250.4], [-599.7, -247.6], [-594.2, -242], [-590.9, -248.4], [-591.5, -248.7], [-592.2, -247.3]], top: 14.09}]},
  w127653851: {exclude: [{x: -699.1, z: -65.7, r: 3}], floor: 11.26, parts: [{ring: [[-695.3, -70.4], [-695.4, -73.5], [-700.1, -73.4], [-700, -70.3]], top: 22.16}, {ring: [[-708.2, -57.9], [-708.5, -70.1], [-690, -70.5], [-689.8, -58.3]], top: 22.57}]},
  w127653856: {exclude: [{x: -628.3, z: -147, r: 3}, {x: -637.6, z: -148.4, r: 3}], floor: 6.82, parts: [{ring: [[-632.9, -145.6], [-633.4, -144.8], [-627.3, -141.7], [-623.3, -149.5], [-628.8, -152.3], [-629.2, -151.7], [-629.8, -152]], tris: [0, 10]}, {ring: [[-628.4, -152.4], [-639.9, -158.2], [-646.9, -144.4], [-635.4, -138.6]], tris: [10, 8]}], tris: [[[-632.9, 20.9, -145.6], [-626.3, 22.3, -145.9], [-631.5, 22.3, -148.5]], [[-631.5, 22.3, -148.5], [-626.3, 22.3, -145.9], [-630.2, 20.6, -151.1]], [[-629.8, 20, -152], [-630.2, 20.6, -151.1], [-629.2, 20, -151.7]], [[-630.2, 20.6, -151.1], [-626.3, 22.3, -145.9], [-629.2, 20, -151.7]], [[-628.8, 19.6, -152.3], [-629.2, 20, -151.7], [-623.3, 19.6, -149.5]], [[-629.2, 20, -151.7], [-626.3, 22.3, -145.9], [-623.3, 19.6, -149.5]], [[-623.3, 19.6, -149.5], [-626.3, 22.3, -145.9], [-625.4, 22.3, -145.4]], [[-625.4, 22.3, -145.4], [-626.3, 22.3, -145.9], [-627.3, 20.4, -141.7]], [[-626.3, 22.3, -145.9], [-632.9, 20.9, -145.6], [-627.3, 20.4, -141.7]], [[-632.9, 20.9, -145.6], [-633.4, 20.4, -144.8], [-627.3, 20.4, -141.7]], [[-634.2, 27.5, -155.3], [-634.6, 27.5, -154.4], [-628.4, 24.7, -152.4]], [[-634.6, 27.5, -154.4], [-640.7, 27.5, -142.4], [-628.4, 24.7, -152.4]], [[-628.4, 24.7, -152.4], [-640.7, 27.5, -142.4], [-635.4, 24.7, -138.6]], [[-635.4, 24.7, -138.6], [-640.7, 27.5, -142.4], [-641.1, 27.5, -141.5]], [[-641.1, 27.5, -141.5], [-640.7, 27.5, -142.4], [-646.9, 24.8, -144.4]], [[-646.9, 24.8, -144.4], [-640.7, 27.5, -142.4], [-639.9, 24.8, -158.2]], [[-640.7, 27.5, -142.4], [-634.6, 27.5, -154.4], [-639.9, 24.8, -158.2]], [[-634.6, 27.5, -154.4], [-634.2, 27.5, -155.3], [-639.9, 24.8, -158.2]]]},
  w127653863: {exclude: [{x: -618.4, z: -197.2, r: 3}], floor: 4.54, parts: [{ring: [[-631.7, -188.4], [-635.9, -184.1], [-627.8, -176.2], [-622.6, -181.5], [-625.5, -184.3], [-622.5, -187.3], [-623, -187.8], [-612.1, -198.9], [-615.1, -201.9], [-630, -186.8]], top: 13.4}, {ring: [[-616.4, -206.4], [-622.8, -212.6], [-639.2, -195.8], [-630, -186.8], [-614.5, -202.6], [-615.3, -203.3], [-614.9, -203.7], [-617, -205.8]], top: 19.48}, {ring: [[-605.3, -193.6], [-615.3, -203.3], [-614.9, -203.7], [-617, -205.8], [-615.2, -207.7], [-617.1, -209.7], [-608.9, -218.1], [-597.9, -207.4]], top: 19.85, osm: "w127653850"}]},
  w1529620024: {exclude: [{x: -517.2, z: -309, r: 3}], floor: 10.13, parts: [{ring: [[-512, -308.9], [-516.2, -313.3], [-522.4, -309.7], [-519.5, -304.6]], top: 18.81}]},
  w1529973395: {exclude: [{x: -745.7, z: 128.2, r: 3}, {x: -742.3, z: 112.3, r: 3}], floor: 10.74, parts: [{ring: [[-740.2, 119.2], [-753.6, 114], [-754.8, 129.9], [-750.3, 131.7], [-753.1, 138.9], [-743.5, 142.7], [-736.7, 125.3], [-741.7, 123.4]], top: 33.58}, {ring: [[-741.5, 106.2], [-743.2, 105.6], [-747.9, 116.2], [-740.5, 119.1], [-736.8, 110], [-738.4, 106.5], [-740.8, 107.5]], top: 25.8}]},
  w1529973398: {exclude: [{x: -734.5, z: 64.7, r: 3}], floor: 12.5, parts: [{ring: [[-746.4, 56.5], [-747.2, 71.8], [-722.7, 73], [-721.9, 57.6]], top: 35.5}]},
  w1529973400: {exclude: [{x: -684.8, z: -34, r: 3}, {x: -690.9, z: -31, r: 3}], floor: 9.78, parts: [{ring: [[-686.4, -25.9], [-698.1, -31.9], [-687.5, -38.2], [-688.5, -39.7], [-678.7, -45.5], [-673.4, -36.6]], top: 45.11}, {ring: [[-671.5, -33.4], [-685.8, -24.9], [-686.4, -25.9], [-692.4, -22.4], [-698.1, -31.9]], top: 45.21, onRoof: true}, {ring: [[-688.2, -39.5], [-689.7, -42], [-683.4, -45.8], [-683, -45.2], [-677.1, -48.7], [-672.6, -41.2], [-673.5, -40.7], [-668.6, -32.6], [-680, -25.8], [-680.7, -27.1], [-704, -13.2], [-713.2, -28.6], [-703.9, -34.2], [-702.1, -31.3]], top: 39.84}]},
};

// --- Colours (linear) ----------------------------------------------------------------------------------------------------
export const COLOURS = {
  white: [0.6, 0.6, 0.58], offWhite: [0.57, 0.56, 0.52], cream: [0.55, 0.5, 0.38], beige: [0.5, 0.43, 0.31], ochre: [0.47, 0.32, 0.18],
  salmon: [0.52, 0.33, 0.24], pink: [0.58, 0.48, 0.45], yellow: [0.56, 0.47, 0.25], paleYellow: [0.56, 0.52, 0.34], grey: [0.36, 0.36, 0.35],
  lightGrey: [0.47, 0.47, 0.45], larch: [0.17, 0.095, 0.05], brown: [0.12, 0.065, 0.035], teal: [0.2, 0.33, 0.33], dark: [0.07, 0.065, 0.06]
};
const C = COLOURS;

/**
 * Each house's look: `name`, `colour` (its render), `kind` (its windows, KINDS), `bay` (its bays' spacing in m),
 * `plinth` (the grey render along its foot, m over the ground), `timber` ({ over: m under its top, colour }: boards on
 * its top storey), `cornice` ({ h, out, colour }: a band round its flat roofs' edges), `balconies` ({ rail: 'metal',
 * 'glass', 'concrete' or 'timber', depth, walls: how many of its longest fronts carry a stack }), `shops` ({ near: [x, z],
 * r }: glazing on its ground floor along the fronts within r m of the point), `garage` (the same, doors instead of
 * glazing), `signs` ({ at: [x, z], face: [dx, dz], w, y0, y1, key }: lettering from the atlas on the wall nearest `at`
 * facing `face`), `parts` ({ index: { colour, kind, closed } }: a part's own look), `note` (the photographs).
 */
export const LOOKS = {
  w123384623: { name: 'the block above the Post', colour: C.white, kind: KINDS.punched, bay: 2.7, balconies: { rail: 'glass', depth: 1.6, walls: 2 },
    cornice: { h: 0.4, out: 0.4, colour: C.lightGrey },
    note: 'Photographs 432557667997160 and 480338893206933 (2013, up the Obere Strasse from the south-west): white render, the balconies\' sea-green glass parapets in stacks on the street. Its back is guessed.' },
  w123384613: { name: 'the Richmond', colour: C.white, kind: KINDS.punched, bay: 2.6, balconies: { rail: 'concrete', depth: 1.5, walls: 2 },
    cornice: { h: 0.5, out: 0.5, colour: C.white }, shops: { near: [-356, -422], r: 20 },
    signs: [{ at: [-362.3, -415.1], face: [0.7, 0.7], w: 7, y0: -0.6, y1: 0.4, key: 'richmond' }],
    note: 'Photographs 811153132941997, 282380660038014 and 213050970268573 (2013–2015, from the north-east along the Promenade): white render, the balconies\' white parapets in bands round its corner, RICHMOND in gold over the shops. 203711604677330 and 480338893206933 show its neighbours. Its side up the Obere Strasse is guessed.' },
  w123384630: { name: 'the house with the green shutters', colour: C.ochre, kind: KINDS.punched, bay: 3.0,
    cornice: { h: 0.35, out: 0.6, colour: C.brown }, parts: { 1: { colour: C.offWhite, kind: KINDS.greenShutters } },
    note: 'The low block on the Obere Strasse in ochre render under its dark eaves (1097073310769336, 293009539087518, from the south-west, 2013) and the house before it towards the Promenade, white with green shutters (150337593761821, 203711604677330, 2014, from the Promenade; the survey has its roof as one sloping plane, here flat at its mean). The timber pergola over the parking by the Promenade in 203711604677330 is left out.' },
  w123384611: { name: 'the white block with the glass balconies', colour: C.white, kind: KINDS.punched, bay: 2.7, balconies: { rail: 'glass', depth: 1.6, walls: 2 },
    cornice: { h: 0.4, out: 0.4, colour: C.lightGrey },
    note: 'Up behind the retaining wall on the Obere Strasse (1097073310769336, 293009539087518, 2013, from the south-west; 150337593761821, 203711604677330 from the Promenade over the green-shuttered house): white render, sea-green glass parapets. Its back is guessed.' },
  w123384618: { name: 'the white house with the timber balconies', colour: C.white, kind: KINDS.punched, bay: 2.6, balconies: { rail: 'timber', depth: 1.4, walls: 1 },
    cornice: { h: 0.35, out: 0.7, colour: C.brown },
    note: 'Photographs 4131251006937258 and 797708084493950 (2013, up the Obere Strasse from the south, on the left): white render, dark timber balconies, the dark eaves. 297912768443495 and 2862577134052761 show the Blue Lemon across the street (js/promenade-platz.js).' },
  w117012195: { name: 'the white house over the retaining wall', colour: C.offWhite, kind: KINDS.punched, bay: 2.6, balconies: { rail: 'metal', depth: 1.3, walls: 1 },
    cornice: { h: 0.35, out: 0.5, colour: C.lightGrey },
    note: 'Seen far off over the stone retaining wall of the Obere Strasse (460185361917054, 533731034284808, 735658003793597, 2013, from the south): white render, grey balconies. Mostly guessed.' },
  w121860620: { name: 'the ochre house with the brown balconies', colour: C.beige, kind: KINDS.punched, bay: 2.6, balconies: { rail: 'timber', depth: 1.3, walls: 2 },
    cornice: { h: 0.35, out: 0.6, colour: C.brown }, plinth: 0.6,
    note: 'Photographs 275821720841968, 786928665590627, 2703518783105958, 293642439050436 (2013, up the Obere Strasse from the south-west, on the left): beige-ochre render, the rounded brown balconies stacked over the street. Its back is guessed.' },
  w123384637: { name: 'the pink house with the saddle roof', colour: C.salmon, kind: KINDS.punched, bay: 2.6,
    note: 'Its gable close on the right in 735658003793597 (2013, from the south-west): salmon-pink render, windows with a painted lozenge between them. 362920881815693 and 4149823025050272 look along the Promenade past it; 786928665590627 shows the Obere Strasse. Its two roofs as the survey has them. The podium with Swiss Alp Fantasy before it is js/promenade-platz.js\'.' },
  w123384644: { name: 'the pale house of Allenbach', colour: [0.55, 0.43, 0.34], kind: KINDS.punched, bay: 2.6, balconies: { rail: 'metal', depth: 1.2, walls: 1 },
    cornice: { h: 0.35, out: 0.6, colour: C.brown }, shops: { near: [-459.2, -303.1], r: 9 },
    note: 'Photographs 2703518783105958 and 293642439050436 (2013, from the south-west, on the right): pale salmon render, a balcony with a dark railing, the dark eaves. 375367497032523 and 298475358559765 (2015, from the north-east) show the Promenade\'s shops before it. The shop front on the Promenade is guessed.' },
  w123384622: { name: 'the house of the Bar LaOnda', colour: C.beige, kind: KINDS.punched, bay: 2.6, balconies: { rail: 'timber', depth: 1.3, walls: 2 },
    cornice: { h: 0.35, out: 0.6, colour: C.brown }, plinth: 0.9, shops: { near: [-489.6, -310.3], r: 10 },
    note: 'Photographs 2703518783105958, 293642439050436, 2790213314575095, 1954049114750205 (2013, from the south-west, on the left): beige render over a tall grey plinth, brown balconies stacked over the street, the shop windows at the corner. The house behind it (w1528718535) the same, guessed.' },
  w1529620024: { name: 'the house up the slope', colour: C.white, kind: KINDS.brownShutters, bay: 2.4,
    cornice: { h: 0.3, out: 0.6, colour: C.brown },
    note: 'Up the slope behind the pink house: 834078170651594, 2699994366958289, 501504534364690 (2013, from the south-west) show it only between its neighbours. Guessed.' },
  w123384621: { name: 'the pink house with the painted lozenges', colour: C.pink, kind: KINDS.brownShutters, bay: 2.5, balconies: { rail: 'timber', depth: 1.3, walls: 1 },
    cornice: { h: 0.3, out: 0.6, colour: C.brown }, parts: { 3: { colour: C.offWhite, kind: KINDS.punched } },
    note: 'Photographs 834078170651594, 471647407398476 and 165381018828607 (2013, from the south-west): pink-white render with painted lozenges between the windows and a timber balcony; the block west of it in its batch (w123384639) white with dark timber balconies. 828092747841421 looks along the Promenade.' },
  w123384616: { name: 'the white house with the timber top', colour: C.white, kind: KINDS.punched, bay: 2.5, timber: { over: 3.2, colour: C.larch },
    cornice: { h: 0.35, out: 0.9, colour: C.brown }, garage: { near: [-553, -273], r: 9 },
    note: 'Photographs 733600500657759, 471647407398476, 3995674817168322 (2013, from the south-west, on the left): white render, the top floor in dark timber under the deep eaves, garage doors on the street, the low wings beside it. 1184422205412577 shows the yellow block on the Promenade (js/promenade-platz.js).' },
  w123384631: { name: 'the cream house over the carports', colour: [0.56, 0.5, 0.33], kind: KINDS.punched, bay: 2.7,
    cornice: { h: 0.35, out: 0.5, colour: C.brown },
    note: 'Behind the timber carport on the street in 212556497301489 and 195250035762456 (2013, from the south); 3894118067361892 and 205284747825470 (from the east) show the yellow block on the Promenade before it. Its render and windows are guessed.' },
  w127653787: { name: 'the white block up the lane', colour: C.white, kind: KINDS.punched, bay: 2.7, balconies: { rail: 'metal', depth: 1.4, walls: 2 },
    cornice: { h: 0.35, out: 0.5, colour: C.lightGrey },
    note: 'Photographs 187533229900884, 298031071838781, 208060640836062 (2013, from the south up the lane): white render, grey balconies stacked on its front. Its back is guessed.' },
  w127653849: { name: 'the house with the dark balconies', colour: C.offWhite, kind: KINDS.dark, bay: 2.6, balconies: { rail: 'timber', depth: 1.5, walls: 2 },
    cornice: { h: 0.45, out: 0.6, colour: [0.06, 0.18, 0.12] },
    note: 'Photographs 208060640836062, 298031071838781, 187533229900884 (2013, from the south, on the left): dark brown timber balconies over the whole front, a green band under the eaves. 209198624046125 shows Bucherer\'s on the Promenade (js/promenade-platz.js). Its back and w127653845 in its batch are guessed.' },
  w127653863: { name: 'the house of the Pizza da Toni', colour: C.cream, kind: KINDS.punched, bay: 2.6,
    cornice: { h: 0.6, out: 0.3, colour: [0.5, 0.46, 0.36] }, shops: { near: [-611, -198], r: 14 },
    signs: [{ at: [-611.5, -197.5], face: [1, 0], w: 6, y0: 11.25, y1: 12.25, key: 'pizza' }],
    note: 'Photograph 2820521514931353 (2013, from the east): cream render with a meander frieze, the shop windows of the Remixbar and the Pizza da Toni. 485775819140310 shows the Schatzalpbahn\'s information board. Its back and w127653850 in its batch are guessed.' },
  w122930760: { name: 'the salmon house on the Promenade', colour: C.salmon, kind: KINDS.punched, bay: 2.7,
    cornice: { h: 0.5, out: 0.4, colour: [0.45, 0.42, 0.36] }, shops: { near: [-575, -165], r: 30 },
    note: 'Photographs 507188803628591 (2013, from the south, on the right), 452854539120882 and 734937793857471 (from the north-east), 479326543484368 (from the east): salmon render, shops along the Promenade. The small conical roof is the survey\'s.' },
  w123384643: { name: 'the Schatzalpbahn\'s valley station', colour: C.grey, kind: KINDS.punched, bay: 2.8,
    cornice: { h: 0.3, out: 0.2, colour: C.lightGrey }, shops: { near: [-602.6, -148.3], r: 5 },
    signs: [
      { at: [-602.6, -148.3], face: [1, 0], w: 4.0, y0: 6.75, y1: 7.5, key: 'strela' },
      { at: [-606.4, -147], face: [0.96, 0.28], w: 12, y0: 9.2, y1: 15.2, key: 'banner' }
    ],
    note: 'Photograph 1550561302002067 (2013, from the east up the lane): grey render, the shop windows under the blue fascia with "Schatzalp Strela", the big blue picture of the mountain with DAVOS SCHATZALP over it; 285588499727490, 786410572280890, 856465395251148 (2016, from the track): its flat roofs, the track running into it. Its walls keep the hall of js/bergbahnen.js open.' },
  w127653856: { name: 'the pale yellow house by the track', colour: C.paleYellow, kind: KINDS.punched, bay: 2.6,
    note: 'Photographs 281525836983938, 828723754401745, 483214743123700 (2016, from the track): pale yellow render under its saddle roofs; 1550561302002067 (2013) the lane. Its back is guessed.' },
  w127653804: { name: 'the grey house west of the track', colour: C.lightGrey, kind: KINDS.punched, bay: 2.6,
    note: 'On the left in 1550561302002067 and 456487858744451 (2013, up the lane from the east): grey render; 543935789951627 and 135609228547923 (2016, from the track) its roofs. Partly guessed.' },
  w1529973400: { name: 'the tall white block', colour: C.white, kind: KINDS.punched, bay: 2.8, shops: { near: [-680, -28], r: 18 },
    cornice: { h: 0.45, out: 0.3, colour: C.lightGrey },
    note: 'Photograph 904860353422899 (2013, from the south-east): white render, the shop windows on the ground floor. Its upper floors are guessed; so is w123384628 in its batches.' },
  w127653851: { name: 'the house at the bend', colour: C.cream, kind: KINDS.brownShutters, bay: 2.5, cornice: { h: 0.3, out: 0.6, colour: C.brown },
    note: 'No photograph: guessed.' },
  w123384627: { name: 'the cream block', colour: C.cream, kind: KINDS.punched, bay: 2.7, balconies: { rail: 'metal', depth: 1.4, walls: 1 },
    cornice: { h: 0.35, out: 0.5, colour: C.brown }, note: 'No photograph: guessed.' },
  w123383537: { name: 'the white block', colour: C.white, kind: KINDS.punched, bay: 2.7, balconies: { rail: 'metal', depth: 1.4, walls: 1 },
    cornice: { h: 0.35, out: 0.4, colour: C.lightGrey }, note: 'No photograph: guessed.' },
  w1529973398: { name: 'the tall block', colour: C.offWhite, kind: KINDS.punched, bay: 2.7, balconies: { rail: 'glass', depth: 1.5, walls: 1 },
    cornice: { h: 0.4, out: 0.4, colour: C.lightGrey }, note: 'No photograph: guessed.' },
  w1529973395: { name: 'the house of the Bistro Guggerzyt', colour: C.beige, kind: KINDS.punched, bay: 2.7, balconies: { rail: 'timber', depth: 1.3, walls: 1 },
    cornice: { h: 0.35, out: 0.5, colour: C.brown }, shops: { near: [-743.6, 109.8], r: 9 }, note: 'No photograph: guessed.' },
  w123385352: { name: 'the arthausHOTEL', colour: C.white, kind: KINDS.blinds, bay: 3.0,
    cornice: { h: 0.45, out: 0.3, colour: C.dark }, note: 'No photograph: guessed (its hanging sign is js/shops.js\').' }
};
// The OpenStreetMap copies of five houses (the same outlines again) and the outlines only partly in a batch here: no
// walls of their own
export const NO_WALLS = ['w1528797228', 'w1528797229', 'w1528797230', 'w1528797231', 'w1528797232', 'w1529620025', 'w123384628'];

// --- Frames --------------------------------------------------------------------------------------------------------------
const area = (r) => Math.abs(ringArea2(r)) / 2;
/** The nearest point of a polyline to (x, z) and its distance: { p, d } */
export function nearestOn(line, x, z) {
  let best = { p: line[0], d: Infinity };
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], dx = line[i][0] - ax, dz = line[i][1] - az, L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
    if (d < best.d) best = { p: [px, pz], d };
  }
  return best;
}
/** A ring with every edge moved `d` m inwards (the corners where they meet) */
export function inset(ring, d) {
  const R = outwardRing(ring), n = R.length;
  const lines = R.map((a, i) => { const F = wallFrame(a, R[(i + 1) % n]); return { p: [a[0] - F.n[0] * d, a[1] - F.n[1] * d], u: F.u }; });
  return lines.map((B, i) => {
    const A = lines[(i + n - 1) % n], den = A.u[0] * B.u[1] - A.u[1] * B.u[0];
    if (Math.abs(den) < 1e-6) return B.p.map((v) => Math.round(v * 100) / 100);
    const t = ((B.p[0] - A.p[0]) * B.u[1] - (B.p[1] - A.p[1]) * B.u[0]) / den;
    return [A.p[0] + A.u[0] * t, A.p[1] + A.u[1] * t].map((v) => Math.round(v * 100) / 100);
  });
}

// --- The houses -------------------------------------------------------------------------------------------------------------
/** A sloped triangle's height over (x, z), or null outside it */
function triY(t, x, z) {
  const [a, b, c] = t, d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(d) < 1e-9) return null;
  const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
  if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) return null;
  return l1 * a[1] + l2 * b[1] + l3 * c[1];
}
/** The highest of a house's sloped triangles over (x, z) (from `from`, `count` of them), or null */
export function slopeY(house, x, z, [from, count] = [0, house.tris.length]) {
  let y = null;
  for (let i = from; i < from + count; i++) { const v = triY(house.tris[i], x, z); if (v !== null && (y === null || v > y)) y = v; }
  return y;
}

/**
 * Each house: its look (LOOKS) and its volumes (GEOM): `id`, `exclude`, `floor` (its storeys' grid: the lowest ground
 * under it), `base` (how far down its walls reach), `storey` (its storeys' height, scaled so that whole storeys and a
 * parapet fill its highest part), `parts` ({ ring, top } flat-roofed; { ring, tris: [from, count], eavesRing } under
 * sloped triangles, the ring drawn in by EAVES from the triangles' outline; `osm`: a neighbour's outline it stands in;
 * `onRoof`: standing on a lower part), `tris` (the sloped roof triangles, [[x, y, z] × 3]), `slabs` (paving at the
 * ground the survey had as roofs), `fronts` (its walls facing a street)
 */
export const HOUSES = Object.entries(GEOM).map(([id, g]) => {
  const look = LOOKS[id];
  const parts = g.parts.map((p, i) => {
    const q = { ...p, ...(look.parts?.[i] || {}) };
    if (p.tris) { q.eavesRing = p.ring; q.ring = inset(p.ring, EAVES); }
    return q;
  });
  const house = { id, ...look, exclude: g.exclude, floor: g.floor, base: Math.round((g.floor - 1.2) * 100) / 100, parts, tris: g.tris || [], slabs: g.slabs || [] };
  // the storeys: whole storeys and a parapet of 0.3–1.2 m under the highest part on the ground
  const tops = parts.filter((p) => !p.onRoof).map((p) => partTop(house, p, ...centroid(p.ring)));
  const H = Math.max(...tops) - house.floor;
  let n = Math.max(1, Math.round((H - 0.7) / 3.0));
  while ((H - 0.7) / n > 3.4) n++;
  while (n > 1 && (H - 0.7) / n < 2.65) n--;
  house.storey = Math.round(((H - 0.7) / n) * 1000) / 1000;
  return house;
});
/** A ring's centroid */
export function centroid(r) {
  let a = 0, x = 0, z = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length], c = p[0] * q[1] - q[0] * p[1]; a += c; x += (p[0] + q[0]) * c; z += (p[1] + q[1]) * c; }
  return [x / (3 * a), z / (3 * a)];
}

/** How high a part stands at a world point (the walls' top there): its flat roof, or its sloped roof a step under it */
export function partTop(house, part, x, z) {
  if (part.top !== undefined) return part.top;
  const y = slopeY(house, x, z, part.tris);
  if (y !== null) return y - 0.06;
  let lo = Infinity;
  for (let i = part.tris[0]; i < part.tris[0] + part.tris[1]; i++) for (const p of house.tris[i]) lo = Math.min(lo, p[1]);
  return lo;
}
/** Every part of the row, with its house */
export const allParts = () => HOUSES.flatMap((h) => h.parts.map((p) => ({ house: h, part: p })));

/** The parts' outlines the player's walls stand on, by OpenStreetMap id (js/landmarks.js SURVEYED_FOOTPRINTS) */
export function groundOutlines() {
  const out = new Map();
  for (const h of HOUSES) {
    if (!out.has(h.id)) out.set(h.id, []);
    for (const p of h.parts) {
      if (p.onRoof) continue;
      const id = p.osm || h.id;
      if (!out.has(id)) out.set(id, []);
      out.get(id).push(p.ring);
    }
  }
  for (const id of NO_WALLS) out.set(id, []);
  return out;
}
/** Is a point inside one of the row's houses (at the ground)? */
export const insideRow = (x, z) => [...groundOutlines().values()].flat().some((r) => pointInRing(r, x, z));

/** A wall's frame from a segment (a, b), turned so that it faces out of the house's parts on the ground */
export function wallOut(house, a, b) {
  const F = wallFrame(a, b), [x, z] = onWall(F, F.len / 2, 0.4);
  return house.parts.some((p) => !p.onRoof && pointInRing(p.ring, x, z)) ? wallFrame(b, a) : F;
}
/**
 * The walls of a house's parts on the ground facing a street (within FRONT m, facing it; a house standing further back:
 * within 40 m): [{ part, F }]
 */
export function fronts(house) {
  const near = frontsWithin(house, FRONT);
  return near.length ? near : frontsWithin(house, 40);
}
function frontsWithin(house, FRONT) {
  const out = [];
  for (const part of house.parts) {
    if (part.onRoof) continue;
    const R = outwardRing(part.ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 2.5) continue;
      const [x, z] = onWall(F, F.len / 2, 0.3);
      // (not against another part of the row)
      if (HOUSES.some((h) => h.parts.some((p) => !p.onRoof && pointInRing(p.ring, x, z)))) continue;
      for (const line of Object.values(STREETS)) {
        const { p, d } = nearestOn(line, x, z);
        if (d > FRONT) continue;
        if (((p[0] - x) * F.n[0] + (p[1] - z) * F.n[1]) / (d || 1) > 0.6) { out.push({ part, F }); break; }
      }
    }
  }
  return out;
}
/** The wall of a house nearest a point, facing `face`: { part, F, s } */
export function wallNear(house, [x, z], face) {
  let best = null;
  for (const part of house.parts) {
    const R = outwardRing(part.ring);
    for (let i = 0; i < R.length; i++) {
      const F = wallFrame(R[i], R[(i + 1) % R.length]);
      if (F.len < 1 || F.n[0] * face[0] + F.n[1] * face[1] < 0.5) continue;
      const t = Math.max(0, Math.min(F.len, (x - F.a[0]) * F.u[0] + (z - F.a[1]) * F.u[1]));
      const d = Math.hypot(F.a[0] + F.u[0] * t - x, F.a[1] + F.u[1] * t - z);
      if (!best || d < best.d) best = { part, F, s: t, d };
    }
  }
  return best;
}
/** The storeys' feet over the ground floor whose floor lies under `top` − 2.4 */
export function upperFloors(house, top, from = 1) {
  const out = [];
  for (let k = from; house.floor + k * house.storey < top - 2.4; k++) out.push(house.floor + k * house.storey);
  return out;
}
export { area };

// --- The Schatzalpbahn's hall ------------------------------------------------------------------------------------------------
// js/bergbahnen.js' hall into the valley station (its carve boxes: the track's samples, 2.7 m left of it and 5.4 m right,
// a metre under it and 6.2 m over it, 6 m past the track's end), as the station's walls leave it open: the track's first
// samples (js/funicular-track.js, path 0) and the box's sides
export const HALL = { left: 2.7, right: 5.4, under: 1.0, over: 6.25, beyond: 6 };

/** The camera spots for a look along the street (world [px, py, pz, tx, ty, tz]) */
export const VIEWS = {
  // the Obere Strasse above the Post looking south-west: the block with the glass balconies on the right, the Richmond
  // and the ochre block on the left
  post: [-352, 4.7, -470, -400, 8, -420],
  // the Obere Strasse by the Bar LaOnda looking north-east: the beige house on the left, the pink house's gable beyond
  onda: [-512, 4.9, -282, -470, 10, -318],
  // the lane up from the Promenade to the Schatzalpbahn, looking west: the station's front with the banner
  schatzalp: [-572, -0.8, -147, -606, 9, -149]
};

export { outwardRing, ringArea2, wallFrame, onWall, pointInRing };
