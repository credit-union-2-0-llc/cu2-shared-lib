# @cu2/shared-lib

Shared TypeScript library for CU2/XDI projects. Extracted from 28 production repos — the best implementation of each pattern we've built, made configurable and reusable.

## Install

```bash
# From GitHub (current)
npm install git+https://github.com/CU2CU2/cu2-shared-lib.git

# Future: from registry
npm install @cu2/shared-lib
```

All heavy dependencies are **optional peer deps** — only install what you use.

## Modules

### `@cu2/shared-lib/auth` — Authentication

#### `createJwtMiddleware(opts)` — Express Azure AD JWT

Validates Azure AD Bearer tokens using JWKS. Attaches `req.user` with `oid`, `email`, `name`, and `roles`. Includes a `requireRole()` factory for route-level RBAC.

```typescript
import { createJwtMiddleware, requireRole } from '@cu2/shared-lib/auth';

const auth = createJwtMiddleware({
  tenantId: process.env.AZURE_AD_TENANT_ID!,
  audience: process.env.AZURE_AD_AUDIENCE!,
  devBypass: process.env.NODE_ENV === 'development',
});

app.use('/api', auth);
app.get('/api/admin', requireRole('Admin'), adminHandler);
```

**What it does:** Fetches Azure AD public keys from the JWKS endpoint, caches them for 1 hour (rate-limited), verifies RS256 signatures, extracts `oid` (stable user ID), `upn`/`preferred_username` (email), and `roles` from the token. In dev mode, injects a configurable mock user.

**Peer deps:** `jsonwebtoken`, `jwks-rsa`

*Extracted from: trendforge-execution*

---

#### `Public()`, `createGuardFactory(opts)`, `createRoleGuard(role)` — NestJS Auth

Provides the `@Public()` decorator to skip auth on specific routes, guard configuration for cookie-based JWT validation, and a role guard factory.

```typescript
import { Public, createRoleGuard } from '@cu2/shared-lib/auth';

@Public()
@Get('health')
health() { return { ok: true }; }
```

**What it does:** `@Public()` marks routes to bypass JWT validation. `createGuardFactory` returns config for NestJS CanActivate guards — cookie name, dev bypass toggle, and mock user. `createRoleGuard` creates a role checker function for `@UseGuards()`.

**Peer deps:** `@nestjs/common`

*Extracted from: AI_CU_CDP*

---

### `@cu2/shared-lib/azure` — Azure Infrastructure

#### `createKeyVaultClient(opts)` — Secret Management

Fetches secrets from Azure Key Vault with a 5-minute in-memory cache. Falls back to environment variables when no vault URI is configured (local dev).

```typescript
import { createKeyVaultClient } from '@cu2/shared-lib/azure';

const secrets = createKeyVaultClient({ vaultUri: process.env.AZURE_KEY_VAULT_URI });
const dbUrl = await secrets.getSecret('database-url');
// Local dev (no vaultUri): reads DATABASE_URL env var automatically
```

**What it does:** Lazy-initializes a SecretClient using `DefaultAzureCredential` (Managed Identity in Azure, CLI creds locally). Caches secrets for 5 minutes to avoid hammering Key Vault. Converts secret names to env var names automatically (`database-url` → `DATABASE_URL`).

**Peer deps:** `@azure/identity`, `@azure/keyvault-secrets`

*Extracted from: trendforge-execution + resistance-wine*

---

#### `createEncryptor(hexKey)` — AES-256-GCM PII Encryption

Encrypts and decrypts strings and JSON objects using AES-256-GCM with random IVs and authentication tags. Format: `{iv_b64}:{authTag_b64}:{ciphertext_b64}`.

```typescript
import { createEncryptor } from '@cu2/shared-lib/azure';

const enc = createEncryptor(process.env.PII_ENCRYPTION_KEY!); // 64 hex chars
const cipher = enc.encrypt('123-45-6789');
const plain = enc.decrypt(cipher); // '123-45-6789'

const obj = enc.encryptJson({ ssn: '123-45-6789', dob: '1990-01-01' });
const data = enc.decryptJson<{ ssn: string; dob: string }>(obj);
```

**What it does:** Creates a 32-byte encryption key from a hex string. Each `encrypt()` call generates a fresh 12-byte IV (96-bit, GCM-recommended) and a 16-byte authentication tag for tamper detection. The output is a colon-separated base64 string safe for database storage.

**Peer deps:** None (uses Node.js `crypto`)

*Extracted from: trendforge-execution*

---

#### `initAppInsights(opts)` — Application Insights

Initializes Azure Application Insights with auto-collection of requests, performance, exceptions, dependencies, and console logs. Includes `trackEvent()` and `trackException()` helpers.

```typescript
import { initAppInsights, trackEvent, trackException } from '@cu2/shared-lib/azure';

await initAppInsights(); // reads APPLICATIONINSIGHTS_CONNECTION_STRING from env
trackEvent('order_created', { orderId: '123' });
trackException(new Error('Payment failed'), { userId: 'abc' });
```

**What it does:** Must be called before other imports in `server.ts`. Enables disk-retry caching so telemetry isn't lost during network blips. `trackEvent` and `trackException` are no-ops if App Insights isn't initialized — safe to call unconditionally.

**Peer deps:** `applicationinsights`

*Extracted from: trendforge-execution*

---

#### `createBlobClient(opts)` — Azure Blob Storage

Upload, download, delete, and generate SAS URLs for Azure Blob Storage. Falls back to local filesystem in development.

```typescript
import { createBlobClient } from '@cu2/shared-lib/azure';

const blobs = createBlobClient({
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  container: 'documents',
});

const { blobPath } = await blobs.upload(buffer, 'report.pdf', 'application/pdf', 'tenant-123');
const url = await blobs.generateSasUrl(blobPath, 60); // 60-minute read-only URL
const data = await blobs.download(blobPath);
await blobs.delete(blobPath);
```

**What it does:** Wraps `@azure/storage-blob` with tenant-scoped path organization (`{tenant}/{category}/{uuid}-{filename}`), automatic content-type headers, SAS URL generation with configurable expiry, and a local filesystem fallback for development. Lazy-initializes the container client.

**Peer deps:** `@azure/storage-blob`

*Extracted from: TIGMFL, BusinessLoanReview, misty-9000*

---

#### `createServiceBusClient(opts)` — Azure Service Bus Pub/Sub

Publish and subscribe to Azure Service Bus topics with a standardized event envelope format and idempotency support.

```typescript
import { createServiceBusClient } from '@cu2/shared-lib/azure';

const bus = createServiceBusClient({
  connectionString: process.env.SERVICE_BUS_CONNECTION_STRING!,
  publisher: 'my-service',
});

// Publish
await bus.publish('my-topic', 'order.created', { orderId: '123', total: 49.99 });

// Subscribe
bus.subscribe('my-topic', 'my-subscription', async (envelope) => {
  console.log(envelope.event_type, envelope.payload);
});

// Cleanup on shutdown
await bus.close();
```

**What it does:** Wraps `@azure/service-bus` with a standard event envelope (`{ event_id, event_type, version, published_at, publisher, payload }`). Publishers serialize and send; subscribers deserialize and invoke your handler with the typed envelope. Configurable `maxConcurrentCalls`. Auto-completes messages on success, abandons on handler error.

**Peer deps:** `@azure/service-bus`

*Extracted from: trendforge-execution*

---

### `@cu2/shared-lib/payments` — Stripe

#### `createStripeCheckout(opts)` — Checkout + Subscriptions

Get-or-create customers, create checkout sessions (subscription mode), manage billing portal sessions, and map Stripe price IDs to internal tier names.

```typescript
import { createStripeCheckout } from '@cu2/shared-lib/payments';

const billing = createStripeCheckout({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webUrl: process.env.WEB_URL!,
  priceTierMap: {
    [process.env.STRIPE_PRO_PRICE_ID!]: 'pro',
    [process.env.STRIPE_ELITE_PRICE_ID!]: 'elite',
  },
});

const customerId = await billing.getOrCreateCustomer('user@example.com', 'Kirk Drake');
const { url } = await billing.createCheckoutSession(customerId, priceId, { userId: '123' });
const tier = billing.tierFromPriceId(subscription.items.data[0]?.price?.id);
```

**What it does:** Wraps Stripe's checkout, customer, subscription, and billing portal APIs behind a config-driven factory. `getOrCreateCustomer` searches by email first to avoid duplicates. `tierFromPriceId` maps Stripe price IDs to your internal tier names (free/pro/elite/etc). `createPortalSession` generates self-service billing management links.

**Peer deps:** `stripe`

*Extracted from: broflo*

---

#### `createWebhookHandler(opts)` — Webhook Verification + Routing

Verify Stripe webhook signatures and route events to typed handlers. Works with Express raw body and Next.js App Router.

```typescript
import { createWebhookHandler } from '@cu2/shared-lib/payments';

const webhook = createWebhookHandler({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
});

// Express
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const event = webhook.verifyEvent(req.body, req.headers['stripe-signature']!);
  await webhook.route(event, {
    'checkout.session.completed': async (data) => { /* provision access */ },
    'customer.subscription.deleted': async (data) => { /* downgrade user */ },
    'invoice.payment_failed': async (data) => { /* send dunning email */ },
  });
  res.json({ received: true });
});
```

**What it does:** `verifyEvent` calls Stripe's `constructEvent` to verify the HMAC signature — rejects tampered payloads. `route` dispatches to your handler map by event type; unhandled events are logged and skipped. Also exports `mapStripeStatus()` to convert Stripe PaymentIntent statuses to simpler internal names (pending/processing/captured/failed).

**Critical:** In Next.js, read the raw body with `await req.text()` BEFORE any JSON parsing — calling `req.json()` first breaks HMAC verification.

**Peer deps:** `stripe`

*Extracted from: cugiftbot, resistance-wine*

---

### `@cu2/shared-lib/notifications` — Email, SMS, Teams

#### `createSendGridClient(opts)` — Email

Send HTML emails via SendGrid with automatic plain-text fallback.

```typescript
import { createSendGridClient } from '@cu2/shared-lib/notifications';

const email = createSendGridClient({
  apiKey: process.env.SENDGRID_API_KEY!,
  fromEmail: 'noreply@myapp.com',
  fromName: 'My App',
});

await email.send({
  to: 'user@example.com',
  subject: 'Welcome aboard',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
});
```

**What it does:** Wraps `@sendgrid/mail` with safe defaults. Auto-generates plain text by stripping HTML tags if you don't provide `text`. Returns `false` (not throw) on failure — safe for fire-and-forget. Logs sends and failures. Skips silently if no API key is configured.

**Peer deps:** `@sendgrid/mail`

*Extracted from: trendforge-orchestration*

---

#### `createTwilioClient(opts)` — SMS

Send SMS messages via Twilio. Includes `toE164()` helper for US phone number formatting.

```typescript
import { createTwilioClient, toE164 } from '@cu2/shared-lib/notifications';

const sms = createTwilioClient({
  accountSid: process.env.TWILIO_ACCOUNT_SID!,
  authToken: process.env.TWILIO_AUTH_TOKEN!,
  fromNumber: process.env.TWILIO_FROM_NUMBER!,
});

await sms.send({ to: toE164('5551234567'), body: 'Your code is 123456' });
```

**What it does:** Wraps the Twilio SDK with error handling that returns `null` on failure instead of throwing. `toE164` converts 10-digit US numbers to `+1XXXXXXXXXX` format. Dynamic-imports Twilio so it's not loaded until first use.

**Peer deps:** `twilio`

*Extracted from: cugiftbot*

---

#### `createTeamsClient(opts)` — Microsoft Teams Webhook

Send notifications to Teams channels via Incoming Webhook. Supports simple text and structured MessageCard format. **Never throws** — Teams failure must not crash your pipeline.

```typescript
import { createTeamsClient } from '@cu2/shared-lib/notifications';

const teams = createTeamsClient({ webhookUrl: process.env.TEAMS_WEBHOOK_URL });

await teams.send('Deployment complete');
await teams.sendCard({
  title: 'Build Failed',
  text: 'Unit tests failed on main',
  themeColor: 'EF4444',
  facts: [{ name: 'Branch', value: 'main' }],
  actionUrl: 'https://github.com/...',
  actionLabel: 'View Build',
});
```

**What it does:** Sends MessageCard-format messages to Teams. Converts Slack emoji codes (`:warning:`) to Unicode automatically. 5-second timeout prevents hanging. Returns `false` on failure — never throws. Supports structured cards with title, facts table, color theming, and action buttons.

**Peer deps:** `axios`

*Extracted from: trendforge-orchestration*

---

### `@cu2/shared-lib/api` — Express Utilities

#### `AppError`, `errorHandler(opts)`, `ok()`, `fail()` — Error Handling

Structured error responses with request IDs. Throw `AppError` anywhere; the middleware catches it and returns a consistent JSON envelope.

```typescript
import { AppError, errorHandler, notFound, ok, fail } from '@cu2/shared-lib/api';

// Throw structured errors in your routes
throw new AppError(400, 'INVALID_INPUT', 'Email is required', { field: 'email' });

// Response helpers
res.json(ok({ user: { id: 1, name: 'Kirk' } }));
// → { success: true, data: { user: ... }, error: null, meta: { timestamp, request_id } }

res.status(400).json(fail('INVALID_INPUT', 'Email is required'));
// → { success: false, data: null, error: { code, message }, meta: { timestamp, request_id } }

// Mount at end of middleware chain
app.use(notFound);    // 404 for unmatched routes
app.use(errorHandler({ logger }));  // catches AppError + generic errors
```

**What it does:** Standardizes API responses across all services. Every response includes `success`, `data`, `error`, and `meta` (with `timestamp` and `request_id` UUID). The error handler catches `AppError` (your code), `UnauthorizedError` (JWT libs), and generic errors (500). Never leaks stack traces in production.

**Peer deps:** `express`

*Extracted from: trendforge-orchestration*

---

#### `createLogger(opts)` — Winston Logger

Production-ready Winston logger with JSON format in production and pretty-print in development.

```typescript
import { createLogger } from '@cu2/shared-lib/api';

const logger = createLogger({ service: 'my-api' });
logger.info('Server started', { port: 3000 });
logger.error('Payment failed', { orderId: '123', error: err.message });
```

**What it does:** Creates a Winston logger with `timestamp`, `errors({ stack: true })`, and either JSON (production) or colorized simple (development) format. Log level defaults to `LOG_LEVEL` env var or `'info'`. All log entries include the `service` name for filtering in log aggregation.

**Peer deps:** `winston`

*Extracted from: trendforge-orchestration*

---

#### `createHealthCheck(opts)` — Health Endpoint

Express handler that runs named health checks and returns structured status with version, uptime, and component health.

```typescript
import { createHealthCheck } from '@cu2/shared-lib/api';

app.get('/health', createHealthCheck({
  version: '1.2.0',
  checks: {
    database: async () => { await pool.query('SELECT 1'); },
    redis: async () => { await redis.ping(); },
  },
}));
// 200 → { status: 'healthy', version, uptime, commit, checks: { database: 'connected', redis: 'connected' } }
// 503 → { status: 'degraded', ..., checks: { database: 'connected', redis: 'disconnected' } }
```

**What it does:** Runs each named check function in sequence. If any throws, that component is marked `'disconnected'` and the overall status becomes `'degraded'` (503). Includes `uptime` in seconds and `commit` from `GIT_COMMIT` env var. Zero auth — suitable for load balancer probes.

**Peer deps:** `express`

*Extracted from: pm-knowledge-ai*

---

#### `createRateLimiter(opts)` — Rate Limiting

Express middleware for per-IP request throttling. Apply to expensive endpoints (AI, payment, auth).

```typescript
import { createRateLimiter } from '@cu2/shared-lib/api';

const aiLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
app.post('/api/ai/query', aiLimiter, queryHandler);
```

**What it does:** Wraps `express-rate-limit` with a structured JSON error response matching the `fail()` format. Configurable window and max. Returns 429 with a human-readable message when exceeded.

**Peer deps:** `express-rate-limit`

*Extracted from: pm-knowledge-ai*

---

#### `createCorsMiddleware(opts)` — CORS

Express CORS middleware factory with separate dev/prod origin lists and credential support.

```typescript
import { createCorsMiddleware } from '@cu2/shared-lib/api';

app.use(createCorsMiddleware({
  productionOrigins: [process.env.WEB_URL!],
  devOrigins: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));
```

**What it does:** In production (`NODE_ENV=production`), allows only the specified origins. In development, allows localhost origins for Vite/Next.js/CRA dev servers. Always allows `Content-Type`, `Authorization`, and configurable extra headers. Enables credentials for cookie-based auth.

**Peer deps:** `cors`

*Extracted from: pm-knowledge-ai*

---

### `@cu2/shared-lib/ai` — Claude SDK

#### `createClaudeClient(opts)` — Anthropic Claude Wrapper

Wraps the Anthropic SDK with convenience methods for completions, streaming, JSON extraction, and multi-turn chat.

```typescript
import { createClaudeClient } from '@cu2/shared-lib/ai';

const claude = createClaudeClient({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-sonnet-4-20250514',
});

// Simple completion
const answer = await claude.complete('Summarize this document', systemPrompt);

// Streaming
for await (const chunk of claude.stream('Explain quantum computing')) {
  process.stdout.write(chunk);
}

// JSON extraction (strips markdown fences automatically)
const data = await claude.completeJson<{ items: string[] }>(
  'Return a JSON object with an "items" array of 5 colors',
);

// Multi-turn chat
const reply = await claude.chat([
  { role: 'user', content: 'What is 2+2?' },
  { role: 'assistant', content: '4' },
  { role: 'user', content: 'Multiply that by 10' },
], systemPrompt);
```

**What it does:** Lazy-initializes the Anthropic client on first call. `complete` returns the full text response. `stream` yields text chunks as an async generator for real-time display. `completeJson` strips markdown code fences (`\`\`\`json ... \`\`\``) before parsing — handles the common Claude habit of wrapping JSON in fences. `chat` accepts full message history for multi-turn conversations.

**Peer deps:** `@anthropic-ai/sdk`

*Extracted from: pm-knowledge-ai*

---

## Architecture

- **Factory pattern everywhere** — pass config, no hardcoded env vars
- **Optional peer deps** — only install what your project uses
- **Subpath exports** — `import { x } from '@cu2/shared-lib/auth'` for tree-shaking
- **ESM + TypeScript declarations** — full IntelliSense support
- **No runtime deps** — everything is a peer dependency
