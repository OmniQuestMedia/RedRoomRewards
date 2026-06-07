// @ts-check
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  // Global ignores (replaces ignorePatterns)
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.next/**',
      'out/**',
      'build/**',
      'LEGACY_CONFIGS/**',
      'PROGRAM_CONTROL/**',
      'scripts/**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      'apps/**',
    ],
  },

  // TypeScript files in src/, api/, and scripts/
  ...tsPlugin.configs['flat/recommended'],
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'api/**/*.ts', 'api/**/*.tsx', 'scripts/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        // node globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // jest globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/no-wrapper-object-types': 'warn',
      'no-useless-catch': 'off',
      'no-console': 'off',
    },
  },

  // Allow CommonJS require() in the config file itself
  {
    files: ['eslint.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
