import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getUsers, verifyPassword } from "../../collab/db";

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

        const users = await getUsers();
        const user = users.find(
          (u: any) => u.username?.toLowerCase() === credentials.username.toLowerCase()
        );

        if (!user) {
          return null;
        }

        if (!verifyPassword(credentials.password, user.passwordSalt, user.passwordHash)) {
          return null;
        }

        // Return user object containing username (as name), role, and token
        return {
          id: user.username,
          name: user.username,
          role: user.role,
          token: user.token
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.token = user.token;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role;
        session.user.token = token.token;
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
