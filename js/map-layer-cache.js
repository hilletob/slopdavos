// A map layer drawn once per view: the full map is redrawn every frame (js/town-map.js), and a layer of hundreds of
// kilometres of dashed lines or of hundreds of outlined names stroked anew each frame takes the GPU process down with
// it (the WebGPU device is lost). The layer is drawn into its own canvas when the view or `extra()` changes, and that
// canvas is copied on the frames between.

/**
 * `draw(ctx, view)` (the context in the view's screen transform: CSS pixels from the canvas centre) wrapped into
 * `(ctx, view)`, which draws it into the map from the cache. `extra()`: what else the layer depends on (the season,
 * the language), as a string.
 */
export function cachedMapLayer(draw, extra = () => '') {
  let canvas = null, key = '';
  return (ctx, v) => {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const k = `${v.cx}|${v.cz}|${v.s}|${cw}|${ch}|${extra()}`;
    if (!canvas) canvas = document.createElement('canvas');
    if (k !== key) {
      key = k;
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      const c = canvas.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cw, ch);
      c.save();
      v.screen(c);
      draw(c, v);
      c.restore();
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  };
}
