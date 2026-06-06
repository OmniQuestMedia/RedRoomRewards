/**
 * jest.config.js — RedRoomRewards
 * Modern Jest configuration for Next.js 14+ / TypeScript projects.
 *
 * TODO: When Next.js app router is scaffolded, replace ts-jest with
 *   the official Next.js Jest transformer:
 *   https://nextjs.org/docs/app/building-your-application/testing/jest
 *
 * TODO: Add moduleNameMapper entries if path aliases are added to tsconfig.json
 */

/** @type {import('jest').Config} */
module.exports = {
  // ── Test Runner Setup ──────────────────────────────────────────────────
  preset: 'ts-jest',
  testEnvironment: 'node',

  // ── Test Discovery ─────────────────────────────────────────────────────
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],

  // ── Transforms ────────────────────────────────────────────────────────
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },

  // ── Module Resolution ─────────────────────────────────────────────────
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // TODO: Add moduleNameMapper when tsconfig path aliases are configured:
  // moduleNameMapper: {
  //   '^@/(.*)$': '<rootDir>/src/$1',
  // },

  // ── Coverage ──────────────────────────────────────────────────────────
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',

    '!src/test-setup.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  // Coverage floor is pinned to current measured levels (A-011, re-pinned
  // in #277, #283, and again in ALP-5 after the reconciliation, HMAC
  // canonical, and health-probe specs landed). The 80% target is the goal;
  // the ratchet only ever moves up. Notable still-uncovered surface that
  // would lift the floor further: admin-ops, ingest-worker, balance-
  // snapshot-cache, white-label.module, webhook.module, reporting service.
  // Current measured (ALP-5 commit):
  //   statements 64.32 (-15.68), branches 59.72 (-20.28),
  //   lines      65.09 (-14.91), functions 61.24 (-18.76)
  coverageThreshold: {
    global: {
      branches: 58,
      functions: 60,
      lines: 64,
      statements: 63,
    },
  },

  // ── Globals ───────────────────────────────────────────────────────────
  verbose: true,

  // ── Setup Files ───────────────────────────────────────────────────────
  // Mock uuid as a simple function returning predictable IDs in tests
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
};
