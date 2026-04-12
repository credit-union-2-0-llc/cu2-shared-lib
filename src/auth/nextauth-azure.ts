/**
 * NextAuth.js Azure AD configuration factory.
 *
 * Generates a NextAuth config object for Microsoft Entra ID (Azure AD)
 * with JWT session strategy and optional database role lookup.
 *
 * Extracted from: cugiftbot/src/lib/auth.ts
 *
 * Usage:
 *   // src/lib/auth.ts
 *   import { createNextAuthConfig } from '@cu2/shared-lib/auth/nextauth-azure';
 *   import NextAuth from 'next-auth';
 *
 *   const config = createNextAuthConfig({
 *     clientId: process.env.AZURE_AD_CLIENT_ID!,
 *     clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
 *     tenantId: process.env.AZURE_AD_TENANT_ID!,
 *     secret: process.env.NEXTAUTH_SECRET!,
 *     signInPage: '/login',
 *     // Optional: look up user role from your database on login
 *     lookupUser: async (oid) => {
 *       const user = await db.user.findUnique({ where: { azureOid: oid } });
 *       return { role: user?.role ?? 'viewer', tenantId: user?.tenantId ?? null };
 *     },
 *     // Optional: protect certain path prefixes
 *     protectedPaths: ['/admin', '/dashboard'],
 *   });
 *
 *   export const { handlers, auth, signIn, signOut } = NextAuth(config);
 */

export interface NextAuthAzureOptions {
  /** Azure AD client ID */
  clientId: string;
  /** Azure AD client secret */
  clientSecret: string;
  /** Azure AD tenant ID */
  tenantId: string;
  /** NextAuth secret for JWT encryption */
  secret: string;
  /** Custom sign-in page path (default: '/login') */
  signInPage?: string;
  /**
   * Optional async function to look up user role/tenant from your database.
   * Called with the Azure AD `oid` (object ID) on every sign-in.
   * Return null/undefined to use defaults.
   */
  lookupUser?: (oid: string) => Promise<{ role?: string; tenantId?: string | null } | null>;
  /** Path prefixes that require authentication (default: none — use middleware) */
  protectedPaths?: string[];
  /** Default role when lookupUser returns null (default: 'viewer') */
  defaultRole?: string;
}

export interface NextAuthAzureConfig {
  providers: unknown[];
  pages: { signIn: string };
  callbacks: {
    authorized: (params: { auth: unknown; request: { nextUrl: { pathname: string } } }) => boolean;
    jwt: (params: { token: Record<string, unknown>; account: unknown; profile: unknown }) => Promise<Record<string, unknown>>;
    session: (params: { session: Record<string, unknown>; token: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  session: { strategy: 'jwt' };
  secret: string;
}

/**
 * Create a NextAuth configuration object for Azure AD.
 *
 * Returns a config you pass directly to `NextAuth(config)`.
 * The provider, callbacks, and session strategy are all pre-configured.
 */
export function createNextAuthConfig(opts: NextAuthAzureOptions): NextAuthAzureConfig {
  const signInPage = opts.signInPage ?? '/login';
  const defaultRole = opts.defaultRole ?? 'viewer';
  const protectedPaths = opts.protectedPaths ?? [];

  // Build provider config — the actual NextAuth provider import happens
  // in the consumer's code since NextAuth is not a peer dep of this library.
  // This returns the raw config object for MicrosoftEntraID provider.
  const providerConfig = {
    id: 'microsoft-entra-id',
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    issuer: `https://login.microsoftonline.com/${opts.tenantId}/v2.0`,
  };

  return {
    providers: [providerConfig],
    pages: { signIn: signInPage },
    callbacks: {
      authorized({ auth: session, request }) {
        const { pathname } = request.nextUrl;
        const isProtected = protectedPaths.some((p) => pathname.startsWith(p));
        const isSignIn = pathname === signInPage;
        if (isProtected && !isSignIn) {
          return !!(session as { user?: unknown } | null)?.user;
        }
        return true;
      },

      async jwt({ token, account, profile }) {
        if (account && profile) {
          const p = profile as { oid?: string; name?: string; email?: string };
          token.oid = p.oid;
          token.name = p.name;
          token.email = p.email;

          if (opts.lookupUser && p.oid) {
            const user = await opts.lookupUser(p.oid);
            token.role = user?.role ?? defaultRole;
            token.tenantId = user?.tenantId ?? null;
          } else {
            token.role = defaultRole;
            token.tenantId = null;
          }
        }
        return token;
      },

      async session({ session, token }) {
        const s = session as { user?: Record<string, unknown> };
        if (s.user) {
          s.user.id = token.oid as string;
          s.user.role = token.role as string;
          s.user.tenantId = token.tenantId as string | null;
        }
        return session;
      },
    },
    session: { strategy: 'jwt' as const },
    secret: opts.secret,
  };
}
