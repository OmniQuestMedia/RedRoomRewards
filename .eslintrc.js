module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  ignorePatterns: [
    'dist/**',
    'node_modules/**',
    'coverage/**',
    '.next/**',
    'out/**',
    'build/**',
    'LEGACY_CONFIGS/**',
    'PROGRAM_CONTROL/**',
    'scripts/**/*.js',
    '*.mjs',
    '*.cjs',
  ],
  overrides: [
    {
      files: ['src/**/*.ts', 'src/**/*.tsx', 'api/**/*.ts', 'api/**/*.tsx', 'scripts/**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended'],
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
  ],
};
