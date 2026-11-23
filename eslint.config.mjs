// ESLint as a net under the refactoring (npm run lint): names that are used but not defined are errors, declarations
// nothing uses are warnings. No style rules.
import globals from 'globals';

const trimmed = (set) => Object.fromEntries(Object.entries(set).map(([name, value]) => [name.trim(), value]));

export default [
  { ignores: ['node_modules/**', 'data/**', 'assets/**', 'kraftwerk-data/**', 'channels/**', 'tools/data/**', 'supabase/**'] },
  {
    files: ['js/**/*.js', 'sw.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...trimmed(globals.browser), ...trimmed(globals.serviceworker) } },
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] },
  },
  {
    // (the tools run in Node and hand callbacks to a browser page, so both sets of globals)
    files: ['tools/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...trimmed(globals.browser), ...trimmed(globals.node) } },
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] },
  },
  {
    files: ['tests/**/*.cjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: trimmed(globals.node) },
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] },
  },
];
