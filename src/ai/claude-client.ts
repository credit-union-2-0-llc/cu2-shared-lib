/**
 * Anthropic Claude SDK wrapper with streaming, JSON parsing, and batch support.
 *
 * Extracted from: pm-knowledge-ai/backend/src/services/claude.ts
 *
 * Usage:
 *   import { createClaudeClient } from '@cu2/shared-lib/ai/claude-client';
 *
 *   const claude = createClaudeClient({ apiKey: process.env.ANTHROPIC_API_KEY! });
 *
 *   // Simple completion
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
  /** Logger */
  logger?: { warn: (msg: string, meta?: unknown) => void };
}

export interface ClaudeClient {
  /** Single-turn completion. Returns the full text. */
  complete: (userMessage: string, system?: string, opts?: { maxTokens?: number }) => Promise<string>;
  /** Streaming completion. Yields text chunks as they arrive. */
  stream: (userMessage: string, system?: string, opts?: { maxTokens?: number }) => AsyncGenerator<string>;
  /** Complete and parse the response as JSON. Strips markdown fences if present. */
  completeJson: <T = unknown>(userMessage: string, system?: string, opts?: { maxTokens?: number }) => Promise<T>;
  /** Multi-turn completion with full message history. */
  chat: (messages: Array<{ role: 'user' | 'assistant'; content: string }>, system?: string) => Promise<string>;
}

export function createClaudeClient(opts: ClaudeClientOptions): ClaudeClient {
  const log = opts.logger ?? console;
  const model = opts.model ?? 'claude-sonnet-4-20250514';
  const defaultMaxTokens = opts.maxTokens ?? 4096;

  let clientInstance: unknown = null;

  async function getClient() {
    if (clientInstance) return clientInstance;
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    clientInstance = new Anthropic({ apiKey: opts.apiKey });
    return clientInstance;
  }

  async function complete(
    userMessage: string,
    system?: string,
    callOpts?: { maxTokens?: number },
  ): Promise<string> {
    const client = await getClient() as {
      messages: { create: (params: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }> };
    };

    const response = await client.messages.create({
      model,
      max_tokens: callOpts?.maxTokens ?? defaultMaxTokens,
      ...(system && { system }),
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock?.text ?? '';
  }

  async function* stream(
    userMessage: string,
    system?: string,
    callOpts?: { maxTokens?: number },
  ): AsyncGenerator<string> {
    const client = await getClient() as {
      messages: { stream: (params: unknown) => AsyncIterable<{ type: string; delta?: { type: string; text?: string } }> };
    };

    const strm = client.messages.stream({
      model,
      max_tokens: callOpts?.maxTokens ?? defaultMaxTokens,
      ...(system && { system }),
      messages: [{ role: 'user', content: userMessage }],
    });

    for await (const event of strm) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        yield event.delta.text ?? '';
      }
    }
  }

  function stripMarkdownFences(text: string): string {
    let clean = text.trim();
    // Remove ```json ... ``` or ``` ... ```
    const fenceMatch = clean.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
    if (fenceMatch) clean = fenceMatch[1];
    return clean.trim();
  }

  async function completeJson<T = unknown>(
    userMessage: string,
    system?: string,
    callOpts?: { maxTokens?: number },
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
  ): Promise<string> {
    const client = await getClient() as {
      messages: { create: (params: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }> };
    };

    const response = await client.messages.create({
      model,
      max_tokens: defaultMaxTokens,
      ...(system && { system }),
      messages,
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock?.text ?? '';
  }

  return { complete, stream, completeJson, chat };
}
