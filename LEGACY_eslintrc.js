/**
 * LEGACY_eslintrc.js — RedRoomRewards (Legacy ESLint Config Reference)
 *
 * ⚠️  NOTICE: This file is a REFERENCE COPY for ESLint 8 / ESLint 9.
 *     It is NOT the active config for this project.
 *     Renamed from .eslintrc.js as part of P0.1 linting stabilisation.
 *
 *     The active config is: eslint.config.mjs  (flat config, required for ESLint 10+)
 *     ESLint 10 ignores .eslintrc.* files by default.
 *
 *     If you need to downgrade to ESLint 8/9, copy this file's rules into
 *     your project and set ESLINT_USE_FLAT_CONFIG=false.
 *
 * TODO: When the project scaffolds a Next.js app router, replace extends with:
 *   extends: ['next/core-web-vitals', 'next/typescript']
 *
 * TODO: Add `eslint-config-next` and `eslint-plugin-react` packages:
 *   npm install -D eslint-config-next eslint-plugin-react eslint-plugin-react-hooks
 */

module.exports = {
  root: true,
  env: {
    browser: true,   // TODO: Remove if this is a pure Node.js service
    node: true,
    es2022: true,
    jest: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    // TODO: Uncomment for type-aware linting:
    // project: './tsconfig.json',
    // tsconfigRootDir: __dirname,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    // TODO: Uncomment when Next.js app router is scaffolded:
    // 'next/core-web-vitals',
    // TODO: Uncomment when React components are added:
    // 'plugin:react/recommended',
    // 'plugin:react-hooks/recommended',
  ],
  plugins: [
    '@typescript-eslint',
    // TODO: Add when React components are added:
    // 'react',
    // 'react-hooks',
  ],
  rules: {
    // TypeScript
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-require-imports': 'warn',

    // General
    'no-console': 'off',

    // TODO: Tighten these rules once codebase reaches full type coverage:
    // '@typescript-eslint/no-explicit-any': 'error',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    '.next/',
    'out/',
    'build/',
    'LEGACY_CONFIGS/',
  ],
};
