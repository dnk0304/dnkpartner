import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import { execute, queryOne } from "@/lib/db";
import bcrypt from "bcryptjs";

const oauthProviders = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  oauthProviders.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

if (process.env.APPLE_ID && process.env.APPLE_SECRET) {
  oauthProviders.push(
    Apple({
      clientId: process.env.APPLE_ID,
      clientSecret: process.env.APPLE_SECRET,
    })
  );
}

async function ensureUserForOAuth(email: string, name?: string | null, image?: string | null): Promise<string> {
  const existingUser = await queryOne<{ id: string }>(
    "SELECT id FROM User WHERE email = ?",
    [email]
  );

  if (existingUser?.id) {
    await execute(
      `
      UPDATE User
      SET name = COALESCE(name, ?),
          image = COALESCE(image, ?),
          emailVerified = COALESCE(emailVerified, ?)
      WHERE id = ?
      `,
      [name || null, image || null, new Date().toISOString(), existingUser.id]
    );
    return existingUser.id;
  }

  // 30-day trial window (Dennis 2026-06-04, freemium gate). Constant lives in
  // src/lib/access.ts (TRIAL_DAYS). Dynamic import to avoid circular-import
  // risk: auth.ts is imported by access.ts.
  const { TRIAL_DAYS } = await import('@/lib/access');
  const now = new Date();
  const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  await execute(
    `
    INSERT INTO User (
      id, email, password, name, image, emailVerified, tier,
      trialStartDate, trialEndDate, hasUsedTrial, createdAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    [
      userId,
      email,
      null,
      name || null,
      image || null,
      now.toISOString(),
      "FREE",
      now.toISOString(),
      trialEnd.toISOString(),
      false,
    ]
  );

  return userId;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true, // Trust the host in development and production
  providers: [
    ...oauthProviders,
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await queryOne<{
          id: string;
          email: string;
          password: string | null;
          name: string | null;
          image: string | null;
        }>('SELECT id, email, password, name, image FROM User WHERE email = ?', [
          credentials.email as string
        ]);

        if (!user || !user.password) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider === "credentials") {
        return true;
      }

      if (!user.email) {
        return false;
      }

      try {
        const dbUserId = await ensureUserForOAuth(user.email, user.name, user.image);
        user.id = dbUserId;
        return true;
      } catch (error) {
        console.error("OAuth user sync failed:", error);
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        if (user.email) {
          try {
            const dbUser = await queryOne<{ id: string; name: string | null; image: string | null }>(
              "SELECT id, name, image FROM User WHERE email = ?",
              [user.email]
            );

            if (dbUser) {
              token.id = dbUser.id;
              token.name = dbUser.name || user.name;
              token.picture = dbUser.image || user.image;
            } else {
              token.id = user.id;
              token.name = user.name;
              token.picture = user.image;
            }
          } catch (error) {
            console.error("JWT user sync fallback:", error);
            token.id = user.id;
            token.name = user.name;
            token.picture = user.image;
          }
        } else {
          token.id = user.id;
          token.name = user.name;
          token.picture = user.image;
        }
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string | null;
        session.user.image = token.picture as string | null;
        
        // Add tier + trialEndDate to session - wrap in try/catch to prevent
        // session failures. Freemium gate (2026-06-04): the client derives
        // "trial-active" from trialEndDate so it doesn't need an extra fetch.
        try {
          const userWithTier = await queryOne<{ tier: string; trialEndDate: string | Date | null }>(
            'SELECT tier, "trialEndDate" FROM "User" WHERE id = ?',
            [token.id as string]
          );

          if (userWithTier) {
            session.user.tier = userWithTier.tier as 'FREE' | 'ACCESO' | 'GOLD' | 'DIAMOND';
            session.user.trialEndDate = userWithTier.trialEndDate
              ? new Date(userWithTier.trialEndDate).toISOString()
              : null;
          } else {
            // Default tier if user not found
            session.user.tier = 'FREE';
            session.user.trialEndDate = null;
          }
        } catch (error) {
          console.error("Error fetching user tier:", error);
          // Set defaults on error to prevent session failure
          session.user.tier = 'FREE';
          session.user.trialEndDate = null;
        }
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  debug: process.env.NODE_ENV === "development",
});
