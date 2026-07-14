# CODEBASE.md — credit-union-2-0-llc/cu2-shared-lib

## Purpose
Shared TypeScript library for CU2/XDI projects, extracted from 28 production repos. It provides configurable, reusable implementations of authentication, infrastructure, payments, and notification patterns to standardize development across the ecosystem.

## Stack
TypeScript (Node.js runtime). Key dependencies include `express`, `@nestjs/common`, `stripe`, `twilio`, `@sendgrid/mail`, and Azure SDKs (`@azure/identity`, `@azure/keyvault-secrets`). All heavy libraries are optional peer dependencies to minimize bundle size.

## Entry Points
Install via `npm install git+https://github.com/CU2CU2/cu2-shared-lib.git`. Import specific subpaths (e.g., `@cu2/shared-lib/auth`) in your application code. No standalone CLI; it functions as a library linked into consumer services.

## Key Directories
- `auth/`: JWT middleware, NestJS guards, NextAuth config, RBAC, and tenant resolution.
- `azure/`: Key Vault, PII encryption, App Insights, Blob Storage, and Service Bus clients.
- `payments/`: Stripe checkout, subscriptions, and webhook verification handlers.
- `notifications/`: SendGrid email, Twilio SMS, Teams webhooks, and HTML template builders.
- `api/`: Express utilities including structured error handling, Winston logging, health checks, and rate limiting.
- `send/`: Tier-2 helpers for Twilio, Persona, and Plaid with tenant ID enforcement.

## External Dependencies
Azure AD (JWT validation), Azure Key Vault & Blob Storage, Stripe API, SendGrid, Twilio, Persona (REST API), Plaid, Microsoft Teams Incoming Webhooks, and Application Insights.

## Development Status
v1.2.0 is the current stable release. Core modules (auth, azure, payments, notifications, api) are production-ready. The `send/` subpaths for Twilio, Persona, and Plaid are newly added in v1.2.0 with strict tenant-ID typing. ESLint rules prevent direct vendor SDK imports.

## Gotchas
- **Peer Dependencies**: Consumers must install specific peer deps (e.g., `stripe`, `twilio`) they intend to use; unused ones can be omitted.
- **Webhooks**: Stripe webhook handlers require raw body parsing before JSON conversion in Next.js.
- **Dev Fallbacks**: Azure Key Vault and Blob clients fall back to environment variables or local filesystems when configured for development.
- **Error Handling**: Notification clients (SendGrid, Twilio, Teams) return `false`/`null` on failure rather than throwing; never assume they succeed without checking results.