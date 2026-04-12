/**
 * Azure Application Insights initialization and telemetry helpers.
 *
 * Extracted from: trendforge-execution/execution-engine/src/config/azure.ts
 *
 * Usage:
 *   // MUST be first import in server.ts
 *   import { initAppInsights, trackEvent, trackException } from '@cu2/shared-lib/azure/app-insights';
 *
 *   initAppInsights(); // reads APPLICATIONINSIGHTS_CONNECTION_STRING from env
 *   trackEvent('order_created', { orderId: '123' });
 */

let appInsightsModule: typeof import('applicationinsights') | null = null;

export interface AppInsightsOptions {
  /** Connection string. Defaults to APPLICATIONINSIGHTS_CONNECTION_STRING env var. */
  connectionString?: string;
  /** Optional logger */
  logger?: { info: (msg: string) => void; warn: (msg: string) => void };
}

export async function initAppInsights(opts: AppInsightsOptions = {}): Promise<void> {
  const log = opts.logger ?? console;
  const connStr = opts.connectionString ?? process.env['APPLICATIONINSIGHTS_CONNECTION_STRING'];

  if (!connStr) {
    log.warn('APPLICATIONINSIGHTS_CONNECTION_STRING not set — App Insights disabled');
    return;
  }

  const appInsights = await import('applicationinsights');
  appInsightsModule = appInsights.default ?? appInsights;

  appInsightsModule
    .setup(connStr)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true, true)
    .setUseDiskRetryCaching(true)
    .start();

  log.info('Azure Application Insights initialised');
}

export function trackEvent(name: string, properties?: Record<string, string>): void {
  if (appInsightsModule?.defaultClient) {
    appInsightsModule.defaultClient.trackEvent({ name, properties });
  }
}

export function trackException(error: Error, properties?: Record<string, string>): void {
  if (appInsightsModule?.defaultClient) {
    appInsightsModule.defaultClient.trackException({ exception: error, properties });
  }
}
