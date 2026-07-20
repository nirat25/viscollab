import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { normalizeUsername } from "htmlcollab-app/persistence";
import { persistenceRepository } from "@/server/persistence";
import { verifyPassword } from "@/server/auth/password";

/**
 * Resolve the NextAuth secret.
 *
 * In production the secret MUST come from the environment — there is no
 * hardcoded fallback, so a missing NEXTAUTH_SECRET makes NextAuth fail loudly
 * (its own MissingSecret guard), which is the desired forcing function for the
 * operator. Outside production we allow a clearly-labelled dev-only secret so
 * local dev / tests work without configuration.
 */
function resolveAuthSecret(): string | undefined {
  const fromEnv = process.env.NEXTAUTH_SECRET;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV !== "production") {
    return "dev-only-insecure-secret-do-not-use-in-production";
  }
  return undefined;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const normalizedUsername = normalizeUsername(credentials.username);
        if (!normalizedUsername) return null;
        const user = await (await persistenceRepository()).getAccountByNormalizedUsername(normalizedUsername);

        if (!user) {
          return null;
        }

        if (!verifyPassword(credentials.password, user.passwordHash)) {
          return null;
        }

        // Account UUID is the authorization subject. Roles are looked up for
        // the requested resource on the server and are never held in JWTs.
        return {
          id: user.id,
          name: user.username,
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accountId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (typeof token.accountId !== "string") return session;
        session.user.accountId = token.accountId;
        if (token.name) {
          session.user.name = token.name;
        }
      }
      return session;
    }
  },
  session: {
    strategy: "jwt",
  },
  secret: resolveAuthSecret(),
  pages: {
    signIn: "/",
  }
};
