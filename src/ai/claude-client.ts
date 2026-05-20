/**
 * Anthropic Claude SDK wrapper with prompt caching, streaming, JSON parsing, and batch support.
 *
 * ## Prompt caching (default: on)
 * System prompts and large user content are automatically marked with
 * `cache_control: { type: "ephemeral" }` so Anthropic caches them for 5 minutes.
 * Cache hits cost 10% of normal input-token price — a 90% reduction on repeated prefixes.
 *
 * To disable: `createClaudeClient({ ..., cache: false })`
 * To cache user content too: pass `cacheContent: true` in call options.
 *
 * Cache telemetry is logged at debug level:
 *   cache_creation_input_tokens — tokens written to cache (first call)
 *   cache_read_input_tokens     — tokens read from cache (subsequent calls, 90% cheaper)
 *
 * Usage:
 *   import { createClaudeClient } from '@cu2/shared-lib/ai/claude-client';
 *
 *   const claude = createClaudeClient({ apiKey: process.env.ANTHROPIC_API_KEY! });
 *
 *   // Simple completion (system prompt cached automatically)
 *   const answer = await claude.complete('Summarize this text', systemPrompt);
 *
 *   // Streaming
 *   for await (const chunk of claude.stream('Explain quantum computing', systemPrompt)) {
 *     process.stdout.write(chunk);
 *   }
 *
 *   // JSON extraction
 *   const data = await claude.completeJson<{ items: string[] }>(
 *     'List 5 items as JSON array under "items" key',
 *     systemPrompt,
 *   );
 */

export interface ClaudeClientOptions {
  /** Anthropic API key */
  apiKey: string;
  /** Model ID (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Max tokens (default: 4096) */
  maxTokens?: number;
  /**
   * Enable prompt caching (default: true).
   * Wraps system prompts with cache_control so repeated calls save ~90% on input tokens.
   * Set false only for one-off calls where the system prompt changes every time.
   */
  cache?: boolean;
  /** Logger — must support warn() and optionally debug() */
  logger?: {
    warn: (msg: string, meta?: unknown) => void;
    debug?: (msg: string, meta?: unknown) => void;
  };
}

export interface ClaudeCallOptions {
  maxTokens?: number;
  /**
   * Cache the user message content block too (useful for large documents sent
   * repeatedly across calls, e.g. a loan application re-analyzed with different prompts).
   * Requires cache: true on the client (default).
   */
  cacheContent?: boolean;
}

export interface CacheUsage {
  /** Tokens written to cache (first call — billed at 125% of normal) */
  cacheCreationTokens: number;
  /** Tokens served from cache (90% cheaper than normal input) */
  cacheReadTokens: number;
  /** Normal input tokens (not cached) */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
}

export interface ClaudeClient {
  /** Single-turn completion. Returns the full text. */
  complete: (userMessage: string, system?: string, opts?: ClaudeCallOptions) => Promise<string>;
  /** Streaming completion. Yields text chunks as they arrive. */
  stream: (userMessage: string, system?: string, opts?: ClaudeCallOptions) => AsyncGenerator<string>;
  /** Complete and parse the response as JSON. Strips markdown fences if present. */
  completeJson: <T = unknown>(userMessage: string, system?: string, opts?: ClaudeCallOptions) => Promise<T>;
  /** Multi-turn completion with full message history. */
  chat: (
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    system?: string,
    opts?: ClaudeCallOptions,
  ) => Promise<string>;
  /** Last call's cache usage — useful for logging/cost tracking. */
  lastCacheUsage: () => CacheUsage | null;
}

export function createClaudeClient(opts: ClaudeClientOptions): ClaudeClient {
  const log = opts.logger ?? console;
  const model = opts.model ?? 'claude-sonnet-4-20250514';
  const defaultMaxTokens = opts.maxTokens ?? 4096;
  const cacheEnabled = opts.cache !== false; // default true

  let clientInstance: unknown = null;
  let _lastCacheUsage: CacheUsage | null = null;

  async function getClient() {
    if (clientInstance) return clientInstance;
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    clientInstance = new Anthropic({ apiKey: opts.apiKey });
    return clientInstance;
  }

  /** Build a cacheable system block array, or a plain string if caching is off. */
  function buildSystem(system: string | undefined): unknown {
    if (!system) return undefined;
    if (!cacheEnabled) return system;
    return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
  }

  /** Build message content — optionally mark user message for caching too. */
  function buildUserContent(userMessage: string, cacheContent?: boolean): unknown {
    if (!cacheEnabled || !cacheContent) return userMessage;
    return [{ type: 'text', text: userMessage, cache_control: { type: 'ephemeral' } }];
  }

  /** Extract and log cache usage from API response. */
  function trackUsage(usage: {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  }) {
    const u: CacheUsage = {
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens:     usage.cache_read_input_tokens ?? 0,
      inputTokens:         usage.input_tokens ?? 0,
      outputTokens:        usage.output_tokens ?? 0,
    };
    _lastCacheUsage = u;
    if (cacheEnabled && log.debug && (u.cacheCreationTokens > 0 || u.cacheReadTokens > 0)) {
      log.debug('claude cache usage', {
        model,
        cacheCreated: u.cacheCreationTokens,
        cacheRead: u.cacheReadTokens,
        input: u.inputTokens,
        output: u.outputTokens,
        // Estimated savings vs uncached (cache reads = 10% price)
        savedTokens: Math.round(u.cacheReadTokens * 0.9),
      });
    }
  }

  async function complete(
    userMessage: string,
    system?: string,
    callOpts?: ClaudeCallOptions,
  ): Promise<string> {
    const client = await getClient() as {
      messages: { create: (params: unknown) => Promise<{ content: Array<{ type: string; text?: string }>; usage: Record<string, number> }> };
    };

    const response = await client.messages.create({
      model,
      max_tokens: callOpts?.maxTokens ?? defaultMaxTokens,
      ...(system !== undefined && { system: buildSystem(system) }),
      messages: [{ role: 'user', content: buildUserContent(userMessage, callOpts?.cacheContent) }],
    });

    trackUsage(response.usage ?? {});
    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock?.text ?? '';
  }

  async function* stream(
    userMessage: string,
    system?: string,
    callOpts?: ClaudeCallOptions,
  ): AsyncGenerator<string> {
    const client = await getClient() as {
      messages: {
        stream: (params: unknown) => AsyncIterable<{
          type: string;
          delta?: { type: string; text?: string };
          message?: { usage: Record<string, number> };
        }>;
      };
    };

    const strm = client.messages.stream({
      model,
      max_tokens: callOpts?.maxTokens ?? defaultMaxTokens,
      ...(system !== undefined && { system: buildSystem(system) }),
      messages: [{ role: 'user', content: buildUserContent(userMessage, callOpts?.cacheContent) }],
    });

    for await (const event of strm) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        yield event.delta.text ?? '';
      }
      // Stream metadata arrives in message_delta event
      if (event.type === 'message_start' && (event as { message?: { usage?: Record<string, number> } }).message?.usage) {
        trackUsage((event as { message: { usage: Record<string, number> } }).message.usage);
      }
    }
  }

  function stripMarkdownFences(text: string): string {
    let clean = text.trim();
    const fenceMatch = clean.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
    if (fenceMatch) clean = fenceMatch[1];
    return clean.trim();
  }

  async function completeJson<T = unknown>(
    userMessage: string,
    system?: string,
    callOpts?: ClaudeCallOptions,
  ): Promise<T> {
    const raw = await complete(userMessage, system, callOpts);
    const cleaned = stripMarkdownFences(raw);
    try {
      return JSON.parse(cleaned) as T;
    } catch (err) {
      log.warn('Failed to parse Claude JSON response', { raw: raw.slice(0, 200), error: String(err) });
      throw new Error(`Claude response is not valid JSON: ${String(err)}`);
    }
  }

  async function chat(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    system?: string,
    callOpts?: ClaudeCallOptions,
  ): Promise<string> {
    const client = await getClient() as {
      messages: { create: (params: unknown) => Promise<{ content: Array<{ type: string; text?: string }>; usage: Record<string, number> }> };
    };

    const response = await client.messages.create({
      model,
      max_tokens: defaultMaxTokens,
      ...(system !== undefined && { system: buildSystem(system) }),
      messages,
    });

    trackUsage(response.usage ?? {});
    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock?.text ?? '';
  }

  return {
    complete,
    stream,
    completeJson,
    chat,
    lastCacheUsage: () => _lastCacheUsage,
  };
}

/**
 * Convenience factory for Haiku — ~20x cheaper than Sonnet.
 * Use for: classification, extraction, structured formatting, short responses.
 * Use Sonnet for: complex reasoning, code generation, multi-step analysis.
 */
export function createHaikuClient(opts: Omit<ClaudeClientOptions, 'model'>): ClaudeClient {
  return createClaudeClient({ ...opts, model: 'claude-haiku-4-5' });
}
