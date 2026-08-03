/**
 * Microsoft Teams Incoming Webhook notification helper.
 *
 * Uses MessageCard format. Never throws — Teams failure must not crash the pipeline.
 *
 * Extracted from: trendforge-orchestration/src/services/notifications/teams.ts
 *
 * Usage:
 *   import { createTeamsClient } from '@cu2/shared-lib/notifications/teams';
 *
 *   const teams = createTeamsClient({
 *     webhookUrl: process.env.TEAMS_WEBHOOK_URL,
 *   });
 *
 *   await teams.send('Deployment complete');
 *   await teams.sendCard({
 *     title: 'Build Failed',
 *     text: 'Unit tests failed on main',
 *     themeColor: 'EF4444',
 *     facts: [{ name: 'Branch', value: 'main' }, { name: 'Commit', value: 'abc123' }],
 *   });
 */

export interface TeamsOptions {
  /** Teams Incoming Webhook URL. If missing, messages are skipped. */
  webhookUrl?: string;
  /** Default theme color (hex, no #). Default: '0078D4' (Azure blue) */
  themeColor?: string;
  /** Card summary text. Default: 'Notification' */
  summary?: string;
  /** Request timeout in ms. Default: 5000 */
  timeoutMs?: number;
  /** Logger */
  logger?: {
    debug: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string, meta?: unknown) => void;
  };
}

export interface CardMessage {
  title?: string;
  text: string;
  themeColor?: string;
  facts?: Array<{ name: string; value: string }>;
  actionUrl?: string;
  actionLabel?: string;
}

export interface TeamsClient {
  /** Send a simple text message. Never throws. */
  send: (text: string) => Promise<boolean>;
  /** Send a structured MessageCard. Never throws. */
  sendCard: (card: CardMessage) => Promise<boolean>;
}

// Slack emoji → Unicode mapping
const EMOJI_MAP: Record<string, string> = {
  ':rotating_light:': '\u{1F6A8}',
  ':warning:': '\u26A0\uFE0F',
  ':moneybag:': '\u{1F4B0}',
  ':white_check_mark:': '\u2705',
  ':information_source:': '\u2139\uFE0F',
  ':chart_with_upwards_trend:': '\u{1F4C8}',
  ':chart_with_downwards_trend:': '\u{1F4C9}',
  ':bell:': '\u{1F514}',
  ':x:': '\u274C',
  ':rocket:': '\u{1F680}',
};

function sanitizeText(text: string): string {
  let out = text;
  for (const [code, emoji] of Object.entries(EMOJI_MAP)) {
    out = out.replaceAll(code, emoji);
  }
  return out;
}

export function createTeamsClient(opts: TeamsOptions = {}): TeamsClient {
  const log = opts.logger ?? console;
  const timeout = opts.timeoutMs ?? 5_000;
  const defaultColor = opts.themeColor ?? '0078D4';
  const summary = opts.summary ?? 'Notification';

  async function postToTeams(body: unknown): Promise<boolean> {
    if (!opts.webhookUrl) {
      log.warn('Teams webhook URL not configured — skipping');
      return false;
    }

    try {
      const axios = (await import('axios')).default;
      await axios.post(opts.webhookUrl, body, { timeout });
      log.debug('Teams message sent');
      return true;
    } catch (err) {
      log.error('Failed to send Teams message', { error: String(err) });
      return false;  // theater-ok: documented at the top of this file — "Never throws — Teams failure must not crash the pipeline"; the boolean return is the checkable handling decision
    }
  }

  async function send(text: string): Promise<boolean> {
    return postToTeams({
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      themeColor: defaultColor,
      summary,
      sections: [{ activityText: sanitizeText(text) }],
    });
  }

  async function sendCard(card: CardMessage): Promise<boolean> {
    const sections: unknown[] = [];

    if (card.title) {
      sections.push({ activityTitle: sanitizeText(card.title) });
    }

    const section: Record<string, unknown> = {
      text: sanitizeText(card.text),
    };
    if (card.facts?.length) {
      section.facts = card.facts;
    }
    sections.push(section);

    const body: Record<string, unknown> = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      themeColor: card.themeColor ?? defaultColor,
      summary,
      sections,
    };

    if (card.actionUrl) {
      body.potentialAction = [{
        '@type': 'OpenUri',
        name: card.actionLabel ?? 'View',
        targets: [{ os: 'default', uri: card.actionUrl }],
      }];
    }

    return postToTeams(body);
  }

  return { send, sendCard };
}
