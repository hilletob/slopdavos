// Whether the world stands: js/main.js marks it once the GPU has got through the first frame, with the loading screen's
// shader warm-up. Until then the layers only winter shows are drawn in summer too, so that their shaders compile behind
// the loading screen and switching to winter doesn't stall on them (js/loipen.js, js/ski-pistes.js, ...).
let ready = false;
export const worldReady = () => ready;
export const markWorldReady = () => { ready = true; };
