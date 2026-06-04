import NextAuth, { DefaultSession } from "next-auth";

// UserTier enum definition (moved from Prisma).
// Feature #10 (2026-06-02): collapsed to FREE + ACCESO (the single paid tier,
// Whop plan plan_c4MzcxWSJP7eT). GOLD/DIAMOND remain in the enum for
// reversibility — no active code branches on them.
type UserTier = 'FREE' | 'ACCESO' | 'GOLD' | 'DIAMOND';

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tier?: UserTier;
      // Freemium gate (2026-06-04): trial-end ISO string so the client can
      // derive trial-active without an extra fetch. Logged-in users only;
      // NULL when no trial was provisioned for the row.
      trialEndDate?: string | null;
    } & DefaultSession["user"];
  }
}
