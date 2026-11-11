// Correctness only: names that do not exist, code that cannot run, mistakes a reader would not see. No formatting rules:
// the scripts keep the layout they were written in.
import js from '@eslint/js';
import globals from 'globals';

// What the page publishes on window for its own scripts and for the browser tests that drive it (page.evaluate).
const page = Object.fromEntries(['oceanControls', 'oceanDiagnostics', 'oceanExpedition', 'oceanTour', 'oceanArchive', 'oceanProfile', 'oceanUi',
  'oceanDiveLog', 'oceanAudio', 'oceanPlan', 'oceanHud', 'oceanDiveSummary', 'oceanInput', 'oceanJourney', 'oceanExperienceMetrics',
  // Set on the page or on globalThis by the test that reads them.
  'reefAudit', 'tracked'].map(name => [name, 'readonly']).concat([['completedStops', 'writable'], ['position', 'writable']]));

export default [
  {ignores: ['dist/**', 'node_modules/**', 'ocean-refined/vendor/**', '.vercel/**', '.taste-skill/**', 'design/**']},
  js.configs.recommended,
  {
    files: ['ocean-refined/**/*.js'],
    languageOptions: {ecmaVersion: 2024, sourceType: 'module', globals: {...globals.browser, ...page}},
  },
  {
    files: ['**/*.mjs', 'supabase/**/*.js'],
    languageOptions: {ecmaVersion: 2024, sourceType: 'module', globals: {...globals.node, ...globals.browser, Deno: 'readonly', ...page}},
  },
  {
    rules: {
      'no-control-regex': 'off',   // the intake handler strips control characters on purpose
      'no-empty': ['error', {allowEmptyCatch: true}],
      'no-unused-vars': ['warn', {args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_'}],
    },
  },
];
