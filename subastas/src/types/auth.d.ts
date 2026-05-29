import NextAuth, { DefaultSession } from "next-auth";

// UserTier enum definition (moved from Prisma)
type UserTier = 'FREE' | 'GOLD' | 'DIAMOND';

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tier?: UserTier;
    } & DefaultSession["user"];
  }
}
