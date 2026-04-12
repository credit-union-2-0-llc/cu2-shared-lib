/**
 * Azure Service Bus pub/sub with standardized event envelope.
 *
 * Extracted from: trendforge-execution/execution-engine/src/services/event-handler.ts
 *
 * Usage:
 *   import { createServiceBusClient } from '@cu2/shared-lib/azure/service-bus';
 *
 *   const bus = createServiceBusClient({
 *     connectionString: process.env.SERVICE_BUS_CONNECTION_STRING!,
 *     publisher: 'my-service',
 *   });
 *
 *   // Publish an event
 *   await bus.publish('orders-topic', 'order.created', { orderId: '123', total: 49.99 });
 *
 *   // Subscribe to events
 *   bus.subscribe('orders-topic', 'my-subscription', async (envelope) => {
 *     console.log(envelope.event_type, envelope.payload);
 *   });
 *
 *   // Graceful shutdown
 *   process.on('SIGTERM', () => bus.close());
 */

import { randomUUID } from 'crypto';

// ─── Event Envelope ──────────────────────────────────────────────────

export interface EventEnvelope<T = unknown> {
  event_id: string;
  event_type: string;
  version: string;
  published_at: string;
  publisher: string;
  payload: T;
}

export interface ServiceBusOptions {
  /** Azure Service Bus connection string */
  connectionString: string;
  /** Publisher name included in every event envelope */
  publisher: string;
  /** Max concurrent message handlers per subscription (default: 3) */
  maxConcurrentCalls?: number;
  /** Logger */
  logger?: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
}

export type MessageHandler<T = unknown> = (envelope: EventEnvelope<T>) => Promise<void>;

export interface ServiceBusClient {
  /** Publish an event to a topic with the standard envelope. */
  publish: <T>(topicName: string, eventType: string, payload: T) => Promise<string>;
  /** Subscribe to a topic/subscription. Handler receives parsed envelopes. */
  subscribe: <T = unknown>(topicName: string, subscriptionName: string, handler: MessageHandler<T>) => void;
  /** Close all senders and receivers. Call on shutdown. */
  close: () => Promise<void>;
}

export function createServiceBusClient(opts: ServiceBusOptions): ServiceBusClient {
  const log = opts.logger ?? console;
  const maxConcurrent = opts.maxConcurrentCalls ?? 3;

  // Lazy-loaded Azure SDK instances
  let sbClient: unknown = null;
  const senders = new Map<string, unknown>();
  const receivers: unknown[] = [];

  async function getClient() {
    if (sbClient) return sbClient;
    const { ServiceBusClient: SBClient } = await import('@azure/service-bus');
    sbClient = new SBClient(opts.connectionString);
    return sbClient;
  }

  async function getSender(topicName: string) {
    const existing = senders.get(topicName);
    if (existing) return existing;
    const client = await getClient() as {
      createSender: (topic: string) => unknown;
    };
    const sender = client.createSender(topicName);
    senders.set(topicName, sender);
    return sender;
  }

  // ─── Publish ─────────────────────────────────────────────────────

  async function publish<T>(
    topicName: string,
    eventType: string,
    payload: T,
  ): Promise<string> {
    const eventId = randomUUID();
    const envelope: EventEnvelope<T> = {
      event_id: eventId,
      event_type: eventType,
      version: '1.0',
      published_at: new Date().toISOString(),
      publisher: opts.publisher,
      payload,
    };

    const sender = await getSender(topicName) as {
      sendMessages: (msg: { body: unknown; applicationProperties?: unknown }) => Promise<void>;
    };

    await sender.sendMessages({
      body: envelope,
      applicationProperties: { event_type: eventType },
    });

    log.info('Event published', { topicName, eventType, eventId });
    return eventId;
  }

  // ─── Subscribe ───────────────────────────────────────────────────

  async function subscribe<T = unknown>(
    topicName: string,
    subscriptionName: string,
    handler: MessageHandler<T>,
  ): Promise<void> {
    const client = await getClient() as {
      createReceiver: (topic: string, sub: string, opts?: unknown) => unknown;
    };

    const receiver = client.createReceiver(topicName, subscriptionName, {
      receiveMode: 'peekLock',
    });
    receivers.push(receiver);

    const typedReceiver = receiver as {
      subscribe: (handlers: {
        processMessage: (msg: unknown) => Promise<void>;
        processError: (args: { error: Error }) => Promise<void>;
      }, opts?: unknown) => void;
    };

    typedReceiver.subscribe(
      {
        processMessage: async (message: unknown) => {
          const msg = message as {
            body: EventEnvelope<T>;
            messageId?: string;
          };
          const completeMsg = message as { complete?: () => Promise<void>; abandon?: () => Promise<void> };

          try {
            await handler(msg.body);
            if (completeMsg.complete) await completeMsg.complete();
          } catch (err) {
            log.error('Message handler failed', {
              topicName,
              subscriptionName,
              messageId: msg.messageId,
              error: String(err),
            });
            if (completeMsg.abandon) await completeMsg.abandon();
          }
        },
        processError: async (args: { error: Error }) => {
          log.error('Service Bus receiver error', {
            topicName,
            subscriptionName,
            error: String(args.error),
          });
        },
      },
      { maxConcurrentCalls: maxConcurrent },
    );

    log.info('Subscribed', { topicName, subscriptionName, maxConcurrent });
  }

  // ─── Close ───────────────────────────────────────────────────────

  async function close(): Promise<void> {
    for (const receiver of receivers) {
      try {
        await (receiver as { close: () => Promise<void> }).close();
      } catch { /* ignore */ }
    }
    for (const sender of senders.values()) {
      try {
        await (sender as { close: () => Promise<void> }).close();
      } catch { /* ignore */ }
    }
    if (sbClient) {
      try {
        await (sbClient as { close: () => Promise<void> }).close();
      } catch { /* ignore */ }
    }
    log.info('Service Bus client closed');
  }

  return { publish, subscribe: subscribe as ServiceBusClient['subscribe'], close };
}
