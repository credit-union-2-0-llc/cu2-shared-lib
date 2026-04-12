/**
 * Cron job scheduler with named job registry and error isolation.
 *
 * Each job runs independently — a failure in one job never crashes the process
 * or blocks other jobs. Supports manual triggering for testing/admin endpoints.
 *
 * Extracted from: trendforge-execution/src/ingestion/scheduler.ts,
 *                 trendforge-orchestration/src/jobs/
 *
 * Usage:
 *   import { createScheduler } from '@cu2/shared-lib/scheduling';
 *
 *   const scheduler = createScheduler({
 *     logger: myLogger,          // optional, defaults to console
 *     timezone: 'UTC',           // optional, defaults to 'UTC'
 *   });
 *
 *   scheduler.register({
 *     name: 'daily-digest',
 *     schedule: '0 0 * * *',     // cron expression
 *     fn: async () => { ... },
 *   });
 *
 *   scheduler.start();                          // start all registered jobs
 *   await scheduler.trigger('daily-digest');     // manual trigger
 *   scheduler.stop();                           // stop all
 *
 * @requires node-cron (optional peer dep)
 */

// ---------- Types ----------

export interface SchedulerOptions {
  /** Logger instance. Defaults to console. */
  logger?: {
    info(msg: string, meta?: unknown): void;
    warn(msg: string, meta?: unknown): void;
    error(msg: string, meta?: unknown): void;
  };
  /** Timezone for cron expressions. Default: 'UTC' */
  timezone?: string;
}

export interface JobDefinition {
  /** Unique name for this job (used for logging and manual triggering). */
  name: string;
  /** Cron expression — e.g. every 4 hours: '0 0,4,8,12,16,20 * * *' */
  schedule: string;
  /** Async function to execute. */
  fn: () => Promise<void>;
}

export interface Scheduler {
  /** Register a job. Can be called before or after start(). */
  register(job: JobDefinition): void;
  /** Start all registered jobs. */
  start(): void;
  /** Stop all jobs. */
  stop(): void;
  /** Manually trigger a job by name. Throws if name not found. */
  trigger(name: string): Promise<void>;
  /** Get list of registered job names. */
  getJobs(): string[];
}

// ---------- Factory ----------

export function createScheduler(options: SchedulerOptions = {}): Scheduler {
  const log = options.logger ?? console;
  const timezone = options.timezone ?? 'UTC';

  const jobs: JobDefinition[] = [];
  const tasks: Array<{ stop(): void }> = [];
  let started = false;

  let cronModule: { schedule(expr: string, fn: () => void, opts: { timezone: string }): { stop(): void } } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cronModule = require('node-cron');
  } catch {
    // Will error on start() if cron needed
  }

  async function runJob(job: JobDefinition): Promise<void> {
    const start = Date.now();
    log.info(`Job started: ${job.name}`);
    try {
      await job.fn();
      log.info(`Job complete: ${job.name}`, { duration_ms: Date.now() - start });
    } catch (err) {
      log.error(`Job failed: ${job.name}`, {
        error: (err as Error).message,
        duration_ms: Date.now() - start,
      });
    }
  }

  return {
    register(job: JobDefinition): void {
      jobs.push(job);

      // If already started, schedule immediately
      if (started && cronModule) {
        const task = cronModule.schedule(
          job.schedule,
          () => void runJob(job),
          { timezone },
        );
        tasks.push(task);
        log.info(`Scheduled job "${job.name}"`, { schedule: job.schedule });
      }
    },

    start(): void {
      if (!cronModule) throw new Error('node-cron is required. Install it: npm install node-cron');
      started = true;
      log.info('Starting scheduler', { jobs: jobs.map((j) => j.name) });

      for (const job of jobs) {
        const task = cronModule.schedule(
          job.schedule,
          () => void runJob(job),
          { timezone },
        );
        tasks.push(task);
        log.info(`Scheduled job "${job.name}"`, { schedule: job.schedule });
      }
    },

    stop(): void {
      for (const task of tasks) task.stop();
      tasks.length = 0;
      started = false;
      log.info('Scheduler stopped');
    },

    async trigger(name: string): Promise<void> {
      const job = jobs.find((j) => j.name === name);
      if (!job) throw new Error(`Unknown job: ${name}`);
      await runJob(job);
    },

    getJobs(): string[] {
      return jobs.map((j) => j.name);
    },
  };
}
