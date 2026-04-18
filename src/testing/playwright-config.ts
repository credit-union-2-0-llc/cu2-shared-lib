/**
 * Factory for Playwright configs with a standard CU2/XDI cross-browser matrix.
 *
 * Usage:
 *   // playwright.config.ts
 *   import { createPlaywrightConfig, FULL_MATRIX } from '@cu2/shared-lib/testing';
 *
 *   export default createPlaywrightConfig({
 *     baseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
 *     apiUrl: process.env.APP_API_URL ?? 'http://localhost:3001',
 *     matrix: FULL_MATRIX,
 *     setupFile: /auth\.setup\.ts/,
 *   });
 *
 * Why this exists: every CU2 project was hand-rolling nearly-identical Playwright
 * configs. Centralizing the matrix + defaults means one upgrade path for all repos.
 *
 * @requires @playwright/test (peer dep)
 */

import { defineConfig } from '@playwright/test';
import type { PlaywrightTestConfig } from '@playwright/test';
import { STANDARD_MATRIX, type MatrixProject } from './device-matrix.js';

export interface CreatePlaywrightConfigOptions {
  /** Base URL of the web app under test. */
  baseUrl: string;
  /** Optional API URL — surfaced in config metadata for test helpers. */
  apiUrl?: string;
  /** Test directory. Default: `./tests/e2e`. */
  testDir?: string;
  /**
   * Browser/device projects to run.
   * Pass a preset from device-matrix (MINIMAL_MATRIX, STANDARD_MATRIX, FULL_MATRIX)
   * or a custom MatrixProject[] array. Default: STANDARD_MATRIX.
   */
  matrix?: MatrixProject[];
  /**
   * If set, a setup project is added and every matrix project depends on it.
   * Pass the test file regex (e.g., `/auth\.setup\.ts/`) that your setup lives in.
   */
  setupFile?: RegExp;
  /**
   * Merged over the generated config. Use to override timeouts, reporter, etc.
   * Arrays (e.g., `projects`) are replaced, not concatenated.
   */
  extend?: Partial<PlaywrightTestConfig>;
}

export function createPlaywrightConfig(
  opts: CreatePlaywrightConfigOptions,
): PlaywrightTestConfig {
  const {
    baseUrl,
    apiUrl,
    testDir = './tests/e2e',
    matrix = STANDARD_MATRIX,
    setupFile,
    extend,
  } = opts;

  const projects: NonNullable<PlaywrightTestConfig['projects']> = [];

  if (setupFile) {
    projects.push({ name: 'setup', testMatch: setupFile });
  }

  for (const m of matrix) {
    projects.push({
      name: m.name,
      use: m.use,
      dependencies: setupFile ? [...(m.dependencies ?? []), 'setup'] : m.dependencies,
    });
  }

  const base: PlaywrightTestConfig = {
    testDir,
    fullyParallel: false,
    forbidOnly: !!process.env['CI'],
    retries: process.env['CI'] ? 1 : 0,
    workers: 1,
    reporter: [['html', { open: 'never' }], ['list']],
    timeout: 60_000,
    expect: { timeout: 10_000 },
    use: {
      baseURL: baseUrl,
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
      actionTimeout: 15_000,
    },
    projects,
    metadata: apiUrl ? { apiUrl } : undefined,
  };

  return defineConfig({ ...base, ...extend });
}
