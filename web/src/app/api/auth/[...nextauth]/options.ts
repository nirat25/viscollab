import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getUsers, hashPassword } from "../../collab/db";

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

        const hash = hashPassword(credentials.password);
        if (user.passwordHash !== hash) {
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
  secret: process.env.NEXTAUTH_SECRET || "viscollab-secret-key-12345",
  pages: {
    signIn: "/",
  }
};
