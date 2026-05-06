/**
 * @cu2/shared-lib/eslint-rules/no-direct-vendor-sdk
 *
 * v1.1.0 — cu2-billing W2-01.
 * v1.2.0 — cu2-billing W3-01: Twilio/Persona/Plaid wrappers shipped; `persona`
 *          (real npm package — the browser Inquiry Flow SDK) added to denylist
 *          alongside the historical `persona-sdk` placeholder so server code
 *          cannot accidentally import the browser widget OR a fictional SDK.
 *
 * Flags direct imports of vendor SDKs that MUST go through a shared-lib
 * wrapper. v1.2.0 enforces:
 *   • `resend`         → must use @cu2/shared-lib/send/resend
 *   • `twilio`         → must use @cu2/shared-lib/send/twilio
 *   • `persona-sdk`    → must use @cu2/shared-lib/send/persona
 *   • `persona`        → must use @cu2/shared-lib/send/persona (real npm pkg
 *                        is the BROWSER Inquiry Flow widget; server-side
 *                        inquiry creation goes through the REST wrapper)
 *   • `plaid`          → must use @cu2/shared-lib/send/plaid
 *
 * Catches both static `ImportDeclaration` and dynamic `ImportExpression`
 * (`await import('resend')`) — the latter is the obvious denylist bypass.
 *
 * Exempts the wrapper file itself, identified by path suffix
 *   /src/send/<vendor>.(ts|tsx|js|cjs|mjs)
 * so the wrapper can legitimately import the SDK it wraps.
 *
 * Implemented as a flat-config-compatible RuleModule (works with ESLint 8 +
 * 9). Exported as default + named for both import styles.
 */
import type { Rule } from 'eslint';

const VENDOR_DENYLIST: Record<string, { wrapperPathFragment: string }> = {
  resend: { wrapperPathFragment: '/src/send/resend.' },
  twilio: { wrapperPathFragment: '/src/send/twilio.' },
  'persona-sdk': { wrapperPathFragment: '/src/send/persona.' },
  persona: { wrapperPathFragment: '/src/send/persona.' },
  plaid: { wrapperPathFragment: '/src/send/plaid.' },
};

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct imports of vendor SDKs that must go through @cu2/shared-lib wrappers.',
      recommended: true,
    },
    schema: [],
    messages: {
      directVendorSdk:
        "Direct import of vendor SDK '{{vendor}}' is forbidden. " +
        "Use the @cu2/shared-lib wrapper instead (e.g. '@cu2/shared-lib/send/{{wrapper}}'). " +
        'See cu2-billing W2-01 / TAGS-03.',
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    // ESLint 8 used getFilename(); ESLint 9 uses .filename. Read both
    // defensively without provoking a TS error on the v9 typings.
    const ctxAny = context as unknown as {
      filename?: string;
      getFilename?: () => string;
    };
    const filename = ctxAny.filename ?? ctxAny.getFilename?.() ?? '';

    function check(
      node: Rule.Node,
      source: string | null | undefined,
    ): void {
      if (!source) return;
      const entry = VENDOR_DENYLIST[source];
      if (!entry) return;
      // Allow the wrapper file itself to import its own vendor SDK.
      if (filename.includes(entry.wrapperPathFragment)) return;
      const wrapperName =
        source === 'persona-sdk' || source === 'persona' ? 'persona' : source;
      context.report({
        node,
        messageId: 'directVendorSdk',
        data: { vendor: source, wrapper: wrapperName },
      });
    }

    return {
      ImportDeclaration(node) {
        const src = node.source && (node.source as { value?: unknown }).value;
        check(node, typeof src === 'string' ? src : null);
      },
      // Dynamic `import('resend')` — denylist bypass attempt.
      ImportExpression(node: Rule.Node) {
        // ESTree: ImportExpression { source: Literal | Expression }
        const src = (
          node as unknown as { source?: { type?: string; value?: unknown } }
        ).source;
        if (src && src.type === 'Literal' && typeof src.value === 'string') {
          check(node, src.value);
        }
      },
    };
  },
};

export default rule;
export { rule };
