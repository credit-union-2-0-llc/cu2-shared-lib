# @cu2/shared-lib

Shared TypeScript library for CU2/XDI projects. Extracted from 28 production repos — the best implementation of each pattern we've built, made configurable and reusable.

## v1.2.0 — Tier-2 send helpers (Twilio / Persona / Plaid) (cu2-billing W3-01)

Three new subpaths, each enforcing `cu_tenant_id` at the TS signature level:

- **`@credit-union-2-0-llc/shared-lib/send/twilio`** — `sendTwilioSms(input, { twilio })`. Forwards to `twilio.messages.create(...)` and echoes `cu_tenant_id` in the result for collector audit.
- **`@credit-union-2-0-llc/shared-lib/send/persona`** — `createPersonaInquiry(input, { apiKey })`. Stamps `reference-id = cu-<cu_tenant_id>-<user_ref>` and resolves `inquiry-template-id` from `template_map[cu_tenant_id][0]`. Calls Persona's REST API directly via `fetch` (no first-party server-side SDK exists; the `persona` npm package is the browser Inquiry Flow widget).
- **`@credit-union-2-0-llc/shared-lib/send/plaid`** — `createPlaidLinkToken(input, { plaid })`. Stamps `client_user_id = cu-<cu_tenant_id>-<end_user_ref>` so every downstream Plaid event is attributable to a tenant without out-of-band lookup.

ESLint rule `no-direct-vendor-sdk` denylist extended to include `persona` (the real npm package — the browser Inquiry Flow widget) alongside the historical `persona-sdk` placeholder, so server code cannot accidentally import the browser widget.

`peerDependencies`: `plaid >= 28.0.0` added (optional). `twilio` was already declared in v1.1.0.

## v1.1.0 — tagging + send/resend + no-direct-vendor-sdk (cu2-billing W2-01 / TAGS-03)

Three new subpaths:

- **`@credit-union-2-0-llc/shared-lib/tagging`** — typed Azure resource tags (`buildAzureResourceTags`, `assertRequiredTags`, `RequiredTags` interface). `cu-tenant-id` accepts UUID or literal `'shared'` for cross-tenant infra.
- **`@credit-union-2-0-llc/shared-lib/send/resend`** — `sendResendEmail(input, { resend })` wrapper. **`cu_tenant_id` is REQUIRED at the TS signature level** and is stamped automatically as a Resend tag (`{name: 'cu_tenant_id', value: <id>}`).
- **`@credit-union-2-0-llc/shared-lib/eslint-rules/no-direct-vendor-sdk`** — ESLint rule that flags direct `import 'resend'` (static + dynamic) outside the wrapper. Denylist already includes `twilio`, `persona-sdk`, `plaid` (their wrappers ship in v1.2.0).

Twilio/Persona/Plaid wrappers are intentionally **deferred to v1.2.0** (Wave 3) — bundling them now would publish dead code.

## Install

```bash
# From GitHub (current)
npm install git+https://github.com/CU2CU2/cu2-shared-lib.git

# Future: from registry
npm install @cu2/shared-lib
```

All heavy dependencies are **optional peer deps** — only install what you use.

## Modules

### `@cu2/shared-lib/auth` — Authentication & Authorization

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

#### `createNextAuthConfig(opts)` — NextAuth.js Azure AD

Generates a complete NextAuth.js configuration for Microsoft Entra ID (Azure AD) with JWT session strategy and optional database role lookup.

```typescript
import { createNextAuthConfig } from '@cu2/shared-lib/auth';

const authConfig = createNextAuthConfig({
  clientId: process.env.AZURE_AD_CLIENT_ID!,
  clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
  tenantId: process.env.AZURE_AD_TENANT_ID!,
  lookupUser: async (email) => {
    const user = await db.user.findUnique({ where: { email } });
    return user ? { role: user.role, tenantId: user.tenantId } : null;
  },
  protectedPaths: ['/admin', '/dashboard'],
});

export const { auth, handlers } = NextAuth(authConfig);
```

**What it does:** Creates a NextAuth config with Microsoft Entra ID provider, JWT session strategy, custom callbacks to enrich the session with role/tenantId from your database, and a middleware `authorized` callback that protects specified paths.

**Peer deps:** `next-auth`, `@auth/core`

*Extracted from: cugiftbot, trendforge-dashboard*

---

#### `createRbac(opts)` — Role-Based Access Control

Configurable role hierarchy with action-to-role mapping, permission checking, tenant-scoped access control, and Express middleware.

```typescript
import { createRbac } from '@cu2/shared-lib/auth';

const rbac = createRbac({
  hierarchy: {
    SUPER_ADMIN: 4,
    ADMIN: 3,
    MANAGER: 2,
    VIEWER: 1,
  },
  actions: {
    view_dashboard: 'VIEWER',
    export_data:    'MANAGER',
    manage_users:   'SUPER_ADMIN',
  },
});

rbac.hasRole('ADMIN', 'VIEWER');          // true (ADMIN >= VIEWER)
rbac.canPerform('VIEWER', 'manage_users'); // false
rbac.canAccessTenant('ADMIN', 'tenant-1', 'tenant-2'); // false
rbac.canAccessTenant('SUPER_ADMIN', null, 'any');       // true (super role)

// Express middleware
app.delete('/users/:id', rbac.requireAction('manage_users'), handler);
app.get('/admin', rbac.requireRole('ADMIN'), handler);
```

**What it does:** Define your role hierarchy as role-name-to-numeric-level pairs. Higher levels inherit all lower permissions. Map action names to minimum required roles. `hasRole` compares levels; `canPerform` checks actions. `canAccessTenant` enforces tenant isolation — the highest role (or explicit `superRole`) bypasses tenant scoping. Express middleware versions of both checks are included.

**Peer deps:** `express` (for middleware only)

*Extracted from: cugiftbot, scienceworks-platform*

---

#### `createTenantMiddleware(opts)` — Multi-Tenant Resolution

Express middleware that resolves the current tenant from request headers, subdomain, or custom hostname, with 5-minute in-memory caching.

```typescript
import { createTenantMiddleware } from '@cu2/shared-lib/auth';

// Strategy 1: Header-based (simplest)
app.use(createTenantMiddleware({ headerName: 'x-tenant-id' }));

// Strategy 2: Hostname resolution with caching
app.use(createTenantMiddleware({
  resolveTenant: async (hostname) => {
    const domain = await db.tenantDomain.findFirst({
      where: { domain: hostname },
      include: { tenant: true },
    });
    return domain ? { id: domain.tenantId, slug: domain.tenant.slug } : null;
  },
  cacheTtlMs: 300_000, // 5 min (default)
}));

// In route handlers:
app.get('/api/data', (req, res) => {
  const tenantId = req.tenantId;  // string
  const tenant = req.tenant;       // full TenantInfo object
});
```

**What it does:** First checks for a tenant ID in the request header (configurable name, default `x-tenant-id`). If not found and a `resolveTenant` function is provided, resolves from hostname. Caches hostname lookups in memory for 5 minutes. Attaches `tenantId` and `tenant` to the request object. Returns 404 if tenant is required but not resolvable.

**Peer deps:** `express`

*Extracted from: cugiftbot*

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

#### `emailWrapper(opts)`, `detailTable()`, `detailRow()`, `heading()`, `button()` — Email Templates

HTML email building blocks with consistent inline styling. Works with any email provider.

```typescript
import {
  emailWrapper, detailTable, detailRow, heading, paragraph, button, divider,
} from '@cu2/shared-lib/notifications';

const html = emailWrapper({
  title: 'Booking Confirmed',
  brandColor: '#2563eb',
  body: `
    ${heading('Your booking is confirmed!')}
    ${paragraph('Here are the details:')}
    ${detailTable([
      detailRow('Date', 'March 15, 2026'),
      detailRow('Time', '10:00 AM - 11:00 AM'),
      detailRow('Location', 'Main Hall'),
      detailRow('Confirmation', 'ABC-1234'),
    ])}
    ${button('View Booking', 'https://app.example.com/bookings/123')}
    ${divider()}
    ${paragraph('Questions? Reply to this email.')}
  `,
  footer: '&copy; 2026 ScienceWorks Museum',
});
```

**What it does:** Generates complete, inline-styled HTML emails that render consistently across email clients (Gmail, Outlook, Apple Mail). `emailWrapper` provides the full document structure with branded header, white content area, and optional footer. Building blocks (`detailRow`, `detailTable`, `heading`, `paragraph`, `button`, `divider`) compose the body. All styles are inline — no CSS classes that email clients strip.

**Peer deps:** None

*Extracted from: scienceworks-platform*

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
// { success: true, data: { user: ... }, error: null, meta: { timestamp, request_id } }

res.status(400).json(fail('INVALID_INPUT', 'Email is required'));
// { success: false, data: null, error: { code, message }, meta: { timestamp, request_id } }

// Mount at end of middleware chain
app.use(notFound);
app.use(errorHandler({ logger }));
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

**What it does:** In-memory rate limiting with configurable window and max requests. Returns 429 with a structured JSON error when exceeded. IP-based by default.

**Peer deps:** None (in-memory implementation)

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

**Peer deps:** None

*Extracted from: pm-knowledge-ai*

---

#### `envelope(data)`, `errorEnvelope(code, msg)` — Response Envelope

Standardized API response wrappers with success/error discriminator and metadata.

```typescript
import { envelope, errorEnvelope, envelopeMiddleware } from '@cu2/shared-lib/api';

// Direct use
res.json(envelope({ users: [...] }));
// { success: true, data: { users: [...] }, error: null, meta: { timestamp, request_id } }

res.status(400).json(errorEnvelope('VALIDATION_ERROR', 'Email is required'));
// { success: false, data: null, error: { code, message, details: null }, meta: { ... } }

res.status(422).json(errorEnvelope('VALIDATION_ERROR', 'Invalid fields', [
  { field: 'email', message: 'Required' },
]));

// Or use middleware for res.ok() / res.fail() helpers
app.use(envelopeMiddleware());
// Then in handlers:
res.ok({ users: [...] });
res.fail('VALIDATION_ERROR', 'Email is required', 400);
```

**What it does:** Wraps every response in a consistent envelope shape. `envelope()` for success, `errorEnvelope()` for failures. Both include a `meta` block with ISO timestamp and UUID request ID. The optional `envelopeMiddleware` adds `res.ok()` and `res.fail()` convenience methods to every response.

**Peer deps:** None (uses Node.js `crypto` for UUID)

*Extracted from: trendforge-execution*

---

#### `parsePagination(input)`, `paginatedResponse(items, total, params)` — Pagination

Parse pagination from query params and build paginated responses with metadata.

```typescript
import { parsePagination, paginatedResponse } from '@cu2/shared-lib/api';

// Parse from Express query params
const pg = parsePagination(req.query);
// { page: 1, limit: 25, offset: 0 }

const pg2 = parsePagination({ page: '3', limit: '10' });
// { page: 3, limit: 10, offset: 20 }

// With custom defaults
const pg3 = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

// Build response
const items = await db.users.findMany({ skip: pg.offset, take: pg.limit });
const total = await db.users.count();
const result = paginatedResponse(items, total, pg);
// {
//   items: [...],
//   pagination: { page: 3, limit: 10, total: 87, totalPages: 9, hasNext: true, hasPrev: true }
// }
```

**What it does:** Supports both page-based (`page` + `limit`) and offset-based (`offset` + `limit`) pagination. Automatically converts between the two. Clamps limit to `maxLimit` (default 100) to prevent abuse. `paginatedResponse` builds the response with computed `totalPages`, `hasNext`, and `hasPrev` metadata.

**Peer deps:** None

*Extracted from: broflo, scienceworks-platform*

---

#### `createCsvImporter(opts)` — CSV Import Validator

Row-level validation with partial success support. Never bulk-fails — imports what it can and reports errors per row.

```typescript
import { createCsvImporter } from '@cu2/shared-lib/api';

interface BudgetRow {
  program_code: string;
  year: number;
  month: number;
  budget_amount: number;
}

const importer = createCsvImporter<BudgetRow>({
  validate: (row, rowNumber) => {
    const errors: string[] = [];
    if (!row.program_code) errors.push('program_code is required');
    if (row.year < 2020 || row.year > 2099) errors.push('year must be 2020-2099');
    if (row.month < 1 || row.month > 12) errors.push('month must be 1-12');
    if (row.budget_amount < 0) errors.push('budget_amount must be positive');
    return errors;
  },
  process: async (validRows) => {
    await db.budgetTarget.createMany({ data: validRows });
  },
});

const result = await importer.import(parsedCsvRows);
// { imported: 47, total: 50, errors: [{ row: 3, message: 'year must be 2020-2099' }, ...], validRows: [...] }
```

**What it does:** Iterates rows, validates each one individually, collects valid rows and errors separately. Calls `process()` once with all valid rows (skipped if none are valid). Returns imported count, total count, error array with 1-based row numbers, and the valid rows array.

**Peer deps:** None

*Extracted from: scienceworks-platform*

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

**What it does:** Lazy-initializes the Anthropic client on first call. `complete` returns the full text response. `stream` yields text chunks as an async generator for real-time display. `completeJson` strips markdown code fences before parsing — handles the common Claude habit of wrapping JSON in fences. `chat` accepts full message history for multi-turn conversations.

**Peer deps:** `@anthropic-ai/sdk`

*Extracted from: pm-knowledge-ai*

---

### `@cu2/shared-lib/cache` — Caching

#### `createCache(opts)` — Redis + In-Memory Fallback

Redis cache client that automatically falls back to an in-memory Map with TTL when Redis is unavailable. Includes rate limiting and spend cap tracking.

```typescript
import { createCache } from '@cu2/shared-lib/cache';

const cache = createCache({ url: process.env.REDIS_URL });

// Basic key-value
await cache.set('user:123', JSON.stringify(userData), 3600); // 1 hour TTL
const val = await cache.get('user:123');
await cache.del('user:123');

// Pattern invalidation
await cache.invalidateByPattern('user:*');

// Rate limiting
const { allowed, remaining } = await cache.checkRateLimit('ratelimit:user-123', {
  limit: 20,
  windowSeconds: 3600,
});
if (!allowed) return res.status(429).json({ error: 'Rate limit exceeded' });

// Spend cap tracking (e.g., AI API costs)
await cache.trackSpend('spend:daily:2026-04-11', 150, 5000); // 150 cents, $50 cap
const { withinCap, currentCents } = await cache.checkSpendCap('spend:daily:2026-04-11', 5000);

// Cleanup
await cache.close();
```

**What it does:** Tries to connect to Redis via `ioredis` if a URL is provided. If Redis is unavailable or `ioredis` isn't installed, seamlessly falls back to an in-memory Map with automatic TTL expiration. `checkRateLimit` implements sliding-window rate limiting. `trackSpend` accumulates costs and checks against a configurable daily cap. All operations work identically in both Redis and in-memory mode.

**Peer deps:** `ioredis` (optional — falls back to in-memory)

*Extracted from: broflo*

---

### `@cu2/shared-lib/scheduling` — Job Scheduling

#### `createScheduler(opts)` — Cron Job Registry

Named cron job scheduler with error isolation, manual triggering, and UTC enforcement.

```typescript
import { createScheduler } from '@cu2/shared-lib/scheduling';

const scheduler = createScheduler({
  logger: myLogger,     // optional, defaults to console
  timezone: 'UTC',      // optional, defaults to 'UTC'
});

scheduler.register({
  name: 'daily-digest',
  schedule: '0 0 * * *',   // midnight UTC
  fn: async () => {
    const data = await aggregateDailyStats();
    await sendDigestEmail(data);
  },
});

scheduler.register({
  name: 'stale-cleanup',
  schedule: '0 6 * * *',   // 6 AM UTC
  fn: async () => { await cleanupStaleRecords(); },
});

scheduler.start();                          // starts all registered jobs
await scheduler.trigger('daily-digest');     // manual trigger (testing/admin)
scheduler.getJobs();                        // ['daily-digest', 'stale-cleanup']
scheduler.stop();                           // stops all
```

**What it does:** Register named jobs with cron expressions and async handlers. Each job runs independently — a failure in one never crashes the process or blocks others. Logs start/complete/failure with duration. `trigger()` runs a job on demand (useful for admin endpoints or testing). Jobs can be registered before or after `start()`.

**Peer deps:** `node-cron` (required for `start()`)

*Extracted from: trendforge-execution, trendforge-orchestration*

---

### `@cu2/shared-lib/db` — Database

#### `createDbPool(opts)` — PostgreSQL Pool + Transactions

Connection pool with slow query detection, automatic logging, and a higher-order transaction wrapper.

```typescript
import { createDbPool } from '@cu2/shared-lib/db';

const db = createDbPool({
  connectionString: process.env.DATABASE_URL!,
  max: 10,                    // max connections (default)
  ssl: process.env.NODE_ENV === 'production',
  slowQueryThresholdMs: 2000, // warn above 2s (default)
  logger: myLogger,           // optional
});

// Simple query
const { rows } = await db.query<User>('SELECT * FROM users WHERE id = $1', [userId]);

// Transaction — auto BEGIN/COMMIT/ROLLBACK
const order = await db.withTransaction(async (client) => {
  const { rows: [order] } = await client.query(
    'INSERT INTO orders (user_id, total) VALUES ($1, $2) RETURNING *',
    [userId, total],
  );
  await client.query(
    'INSERT INTO order_items (order_id, product_id, qty) VALUES ($1, $2, $3)',
    [order.id, productId, qty],
  );
  return order;
});

// Shutdown
await db.close();
```

**What it does:** Wraps `pg.Pool` with a factory pattern. Monitors query duration and logs warnings for queries exceeding the threshold (default 2 seconds). `withTransaction` acquires a client, runs BEGIN, executes your function, COMMITs on success, ROLLBACKs on error, and releases the client in all cases. Configurable max connections, idle timeout, connection timeout, and SSL.

**Peer deps:** `pg`

*Extracted from: trendforge-execution*

---

### `@cu2/shared-lib/testing` — Cross-Browser E2E Kit

#### `createPlaywrightConfig(opts)` — Playwright config factory

Produces a fully-formed `PlaywrightTestConfig` with the standard CU2/XDI browser/device matrix. Every project can test Chromium, Firefox, WebKit, Edge, iOS mobile, and Android mobile from a single import — no more hand-rolled configs drifting across repos.

```typescript
// playwright.config.ts
import { createPlaywrightConfig, FULL_MATRIX } from '@cu2/shared-lib/testing';

export default createPlaywrightConfig({
  baseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
  apiUrl: process.env.APP_API_URL ?? 'http://localhost:3001',
  matrix: FULL_MATRIX,
  setupFile: /auth\.setup\.ts/,
});
```

**What it does:** wires `baseURL`, trace/screenshot/video defaults, CI-aware retries, HTML + list reporter, and the project matrix. When `setupFile` is passed, a `setup` project is added and every matrix project depends on it, so auth state is established once and reused across browsers. `apiUrl` is surfaced via config metadata so specs can reach test-only endpoints.

**Matrix presets:**
- `MINIMAL_MATRIX` — Chromium + iPhone 15 (fast PR feedback)
- `STANDARD_MATRIX` — Chromium, Firefox, WebKit, iPhone 15 (engine coverage, default)
- `FULL_MATRIX` — + Edge (msedge channel) + Pixel 7 (release-candidate coverage)

Or compose your own from the named projects: `CHROMIUM`, `FIREFOX`, `WEBKIT`, `EDGE`, `MOBILE_IOS`, `MOBILE_ANDROID`, `TABLET_IOS`.

> **Note on fidelity:** Playwright's `webkit` is the WebKit engine, not real iOS Safari. Playwright's `mobile-android` is Chromium with a Pixel 7 viewport, not real Android Chrome. For device-cloud validation before production deploys, use **Microsoft Playwright Testing** (Azure, pay-per-minute) or **BrowserStack**. The config factory works unchanged against both.

**Peer deps:** `@playwright/test`

#### `fetchLatestOtp(opts)` — OTP retrieval helper for E2E login

For apps that use one-time-code (OTP / magic-code) login, this helper reads the most recent code for a given email from a test-only endpoint.

```typescript
import { fetchLatestOtp } from '@cu2/shared-lib/testing';

const code = await fetchLatestOtp({
  apiUrl: 'http://localhost:3001',
  email: 'qa+chromium@broflo.test',
});
await page.fill('input[name="code"]', code);
```

**What it does:** polls `GET {apiUrl}/test/last-otp/:email` until a code appears or the timeout elapses. Configurable endpoint path, response field name, poll interval, and timeout. Throws `OtpNotFoundError` on timeout.

**Security:** the test endpoint MUST be gated by `NODE_ENV !== 'production'` (throw `ForbiddenException` otherwise). Without that guard, anyone can harvest OTP codes from your prod API.

#### Templates — copy-paste starters

Shipped under `node_modules/@cu2/shared-lib/templates/testing/`:
- `auth.setup.ts` — reusable OTP auth setup project
- `login-otp.spec.ts` — cross-browser OTP login smoke test

Copy them into your project's `tests/e2e/` directory and customize the selectors.

*Extracted from: broflo (S-12) — generalized for all CU2 web projects*

---

## Architecture

- **Factory pattern everywhere** — pass config, no hardcoded env vars
- **Optional peer deps** — only install what your project uses
- **Subpath exports** — `import { x } from '@cu2/shared-lib/auth'` for tree-shaking
- **ESM + TypeScript declarations** — full IntelliSense support
- **No runtime deps** — everything is a peer dependency
- **10 categories, 30+ modules** — auth, azure, payments, notifications, api, ai, cache, scheduling, db, testing
