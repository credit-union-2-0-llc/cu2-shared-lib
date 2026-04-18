/**
 * @cu2/shared-lib/testing — Cross-browser E2E testing kit.
 *
 * Factory-driven Playwright config + OTP helpers so every CU2/XDI web project
 * can run the same browser/device matrix with a single import.
 */

export {
  createPlaywrightConfig,
  type CreatePlaywrightConfigOptions,
} from './playwright-config.js';

export {
  CHROMIUM,
  FIREFOX,
  WEBKIT,
  EDGE,
  MOBILE_IOS,
  MOBILE_ANDROID,
  TABLET_IOS,
  MINIMAL_MATRIX,
  STANDARD_MATRIX,
  FULL_MATRIX,
  type MatrixProject,
} from './device-matrix.js';

export {
  fetchLatestOtp,
  OtpNotFoundError,
  type FetchOtpOptions,
} from './otp-helper.js';
