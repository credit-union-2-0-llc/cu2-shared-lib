/**
 * Type declarations for optional peer dependencies.
 * These allow TypeScript to compile without installing every optional dep.
 * Consumers install only the deps they use.
 */

declare module '@anthropic-ai/sdk' {
  class Anthropic {
    constructor(opts: { apiKey: string });
    messages: {
      create(params: unknown): Promise<{ content: Array<{ type: string; text?: string }> }>;
      stream(params: unknown): AsyncIterable<{ type: string; delta?: { type: string; text?: string } }>;
    };
  }
  export default Anthropic;
}

declare module 'applicationinsights' {
  interface TelemetryClient {
    trackEvent(telemetry: { name: string; properties?: Record<string, string> }): void;
    trackException(telemetry: { exception: Error; properties?: Record<string, string> }): void;
  }
  export const defaultClient: TelemetryClient | undefined;
  export function setup(connectionString: string): {
    setAutoCollectRequests(value: boolean): ReturnType<typeof setup>;
    setAutoCollectPerformance(value: boolean, extended?: boolean): ReturnType<typeof setup>;
    setAutoCollectExceptions(value: boolean): ReturnType<typeof setup>;
    setAutoCollectDependencies(value: boolean): ReturnType<typeof setup>;
    setAutoCollectConsole(value: boolean, all?: boolean): ReturnType<typeof setup>;
    setUseDiskRetryCaching(value: boolean): ReturnType<typeof setup>;
    start(): void;
  };
}

declare module '@azure/identity' {
  export class DefaultAzureCredential {}
}

declare module '@azure/keyvault-secrets' {
  export class SecretClient {
    constructor(vaultUrl: string, credential: unknown);
    getSecret(name: string): Promise<{ value?: string }>;
  }
}

declare module '@nestjs/common' {
  export function SetMetadata(key: string, value: unknown): MethodDecorator & ClassDecorator;
}

declare module 'stripe' {
  class Stripe {
    constructor(key: string);
    customers: {
      list(params: { email: string; limit: number }): Promise<{ data: Array<{ id: string }> }>;
      create(params: unknown): Promise<{ id: string }>;
    };
    checkout: {
      sessions: { create(params: unknown): Promise<{ id: string; url: string | null }> };
    };
    billingPortal: {
      sessions: { create(params: unknown): Promise<{ url: string }> };
    };
    subscriptions: {
      retrieve(id: string, opts?: unknown): Promise<{
        metadata?: Record<string, string>;
        items: { data: Array<{ price?: { id: string } }> };
        default_payment_method: unknown;
      }>;
    };
    webhooks: {
      constructEvent(payload: string | Buffer, sig: string, secret: string): Stripe.Event;
    };
  }
  namespace Stripe {
    interface Event {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    }
  }
  export = Stripe;
  export default Stripe;
}

declare module 'twilio' {
  function twilio(accountSid: string, authToken: string): {
    messages: {
      create(params: { to: string; from: string; body: string }): Promise<{ sid: string }>;
    };
  };
  export default twilio;
}

declare module '@sendgrid/mail' {
  export function setApiKey(key: string): void;
  export function send(msg: unknown): Promise<unknown>;
}

declare module '@azure/storage-blob' {
  export class BlobServiceClient {
    static fromConnectionString(connStr: string): BlobServiceClient;
    getContainerClient(name: string): ContainerClient;
  }
  export class ContainerClient {
    getBlockBlobClient(name: string): BlockBlobClient;
  }
  export class BlockBlobClient {
    url: string;
    uploadData(data: Buffer, opts?: unknown): Promise<void>;
    downloadToBuffer(): Promise<Buffer>;
    deleteIfExists(): Promise<unknown>;
    exists(): Promise<boolean>;
  }
  export class StorageSharedKeyCredential {
    constructor(accountName: string, accountKey: string);
  }
  export class BlobSASPermissions {
    static parse(permissions: string): BlobSASPermissions;
  }
  export function generateBlobSASQueryParameters(
    opts: { containerName: string; blobName: string; permissions: BlobSASPermissions; expiresOn: Date },
    credential: StorageSharedKeyCredential,
  ): { toString(): string };
}

declare module '@azure/service-bus' {
  export class ServiceBusClient {
    constructor(connectionString: string);
    createSender(topic: string): ServiceBusSender;
    createReceiver(topic: string, subscription: string, opts?: unknown): ServiceBusReceiver;
    close(): Promise<void>;
  }
  export interface ServiceBusSender {
    sendMessages(msg: { body: unknown; applicationProperties?: unknown }): Promise<void>;
    close(): Promise<void>;
  }
  export interface ServiceBusReceiver {
    subscribe(handlers: {
      processMessage: (msg: unknown) => Promise<void>;
      processError: (args: { error: Error }) => Promise<void>;
    }, opts?: unknown): void;
    close(): Promise<void>;
  }
}

declare module 'ioredis' {
  class Redis {
    constructor(url: string);
    get(key: string): Promise<string | null>;
    setex(key: string, ttl: number, value: string): Promise<void>;
    del(...keys: string[]): Promise<void>;
    keys(pattern: string): Promise<string[]>;
    incr(key: string): Promise<number>;
    incrby(key: string, amount: number): Promise<number>;
    expire(key: string, seconds: number): Promise<void>;
    quit(): Promise<void>;
    on(event: string, handler: (...args: unknown[]) => void): void;
  }
  export default Redis;
}

declare module 'node-cron' {
  interface ScheduledTask {
    stop(): void;
  }
  export function schedule(
    expression: string,
    fn: () => void,
    options?: { timezone?: string },
  ): ScheduledTask;
}

declare module 'pg' {
  export class Pool {
    constructor(config: {
      connectionString: string;
      max?: number;
      idleTimeoutMillis?: number;
      connectionTimeoutMillis?: number;
      ssl?: boolean | { rejectUnauthorized: boolean };
    });
    query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
    connect(): Promise<PoolClient>;
    on(event: string, handler: (err: Error) => void): void;
    end(): Promise<void>;
  }
  export interface PoolClient {
    query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
    release(): void;
  }
}

declare module 'axios' {
  interface AxiosStatic {
    post(url: string, data?: unknown, config?: { timeout?: number }): Promise<unknown>;
  }
  const axios: AxiosStatic;
  export default axios;
}
