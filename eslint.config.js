import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-android/**',
      'dist-pwa/**',
      'android-native/**',
      'node_modules/**',
      'coverage/**',
      'scripts/**',
      'server/**',
      'public/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Classic hook rules only. eslint-plugin-react-hooks v7 `recommended`
      // also enables React Compiler diagnostics (set-state-in-effect,
      // preserve-manual-memoization, immutability, refs, purity, ...). Those
      // are not actionable for this codebase and make lint runs prohibitively
      // slow, so they are intentionally excluded.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // The PouchDB service stores its singleton instance in a module-level
      // variable (`activePouchInstance = this`); this is not a closure alias.
      '@typescript-eslint/no-this-alias': ['error', { allowedNames: ['activePouchInstance'] }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  }
);
