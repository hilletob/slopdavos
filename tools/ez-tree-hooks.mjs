// tools/ez-tree-hooks.mjs — node loader hooks for baking EZ-Tree (tools/bake-ez-trees.mjs): its sources import images
// (a bundler feature) and extensionless relative modules; images become empty strings, '.js' is added.
export async function resolve(specifier, context, next) {
  if (/\.(jpg|jpeg|png|webp)$/i.test(specifier)) return { url: 'data:text/javascript,export default ""', shortCircuit: true };
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier)) {
    try { return await next(specifier + '.js', context); } catch { /* fall through */ }
  }
  return next(specifier, context);
}

// Its presets are imported as JSON without the import attribute node requires
export async function load(url, context, next) {
  if (url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } });
  return next(url, context);
}
