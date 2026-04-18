/**
 * Browser and device matrix constants for cross-browser Playwright testing.
 *
 * Presets cover the common CU2/XDI test targets:
 *   - MINIMAL_MATRIX: Chromium + iPhone 15 (fast PR feedback)
 *   - STANDARD_MATRIX: + Firefox + WebKit (engine coverage)
 *   - FULL_MATRIX: + Edge + Pixel 7 (release-candidate coverage)
 *
 * Real iOS Safari / real Android Chrome are not covered by Playwright locally —
 * use Microsoft Playwright Testing or BrowserStack for device-cloud validation
 * before production deploys.
 */

import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

type PwProject = NonNullable<PlaywrightTestConfig['projects']>[number];

export interface MatrixProject {
  name: string;
  use: PwProject['use'];
  dependencies?: string[];
}

/** Chromium engine (Chrome). */
export const CHROMIUM: MatrixProject = {
  name: 'chromium',
  use: { ...devices['Desktop Chrome'] },
};

/** Gecko engine (Firefox). */
export const FIREFOX: MatrixProject = {
  name: 'firefox',
  use: { ...devices['Desktop Firefox'] },
};

/** WebKit engine (Safari engine — not real iOS Safari). */
export const WEBKIT: MatrixProject = {
  name: 'webkit',
  use: { ...devices['Desktop Safari'] },
};

/** Microsoft Edge (Chromium channel). Requires `npx playwright install msedge`. */
export const EDGE: MatrixProject = {
  name: 'edge',
  use: { ...devices['Desktop Edge'], channel: 'msedge' },
};

/** iPhone 15 — WebKit mobile. */
export const MOBILE_IOS: MatrixProject = {
  name: 'mobile-ios',
  use: { ...devices['iPhone 15'] },
};

/** Pixel 7 — Chromium mobile. */
export const MOBILE_ANDROID: MatrixProject = {
  name: 'mobile-android',
  use: { ...devices['Pixel 7'] },
};

/** iPad Pro 11 — WebKit tablet. */
export const TABLET_IOS: MatrixProject = {
  name: 'tablet-ios',
  use: { ...devices['iPad Pro 11'] },
};

/** Fast PR feedback: Chrome + iOS mobile. */
export const MINIMAL_MATRIX: MatrixProject[] = [CHROMIUM, MOBILE_IOS];

/** Engine coverage: Chromium + Firefox + WebKit + iOS mobile. */
export const STANDARD_MATRIX: MatrixProject[] = [
  CHROMIUM,
  FIREFOX,
  WEBKIT,
  MOBILE_IOS,
];

/** Release-candidate coverage: all engines + Edge + Android mobile. */
export const FULL_MATRIX: MatrixProject[] = [
  CHROMIUM,
  FIREFOX,
  WEBKIT,
  EDGE,
  MOBILE_IOS,
  MOBILE_ANDROID,
];
