import "server-only";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";
import { prisma } from "../db/client";
import { prismaAccountStore } from "../db/accounts";
import { TRANSACTION_MAX_WAIT_MS } from "../db/transactions";
import { readAdminEmail, readGoogleProfile, signInWithGoogle } from "./google";
import { readAuthSecret, readSignedUserId, USER_COOKIE } from "./identity";

// Auth.js (next-auth v5): sign-in with Google, a JWT session in a cookie, no adapter and no Auth.js tables. The JWT
// carries our user id; who that user is, and what becomes of the browser's anonymous user, is src/auth/google.ts.
// Reads AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET from the environment, ADMIN_EMAIL here.

declare module "next-auth" {
  interface Session {
    userId?: string; // our User.id
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string; // our User.id, set at sign-in
  }
}

const AUTH_SECRET = readAuthSecret(process.env.AUTH_SECRET);

/** A sign-in moves saves between owners and may delete a user: up to 20 s for its transaction on a remote database. */
const SIGN_IN_TIMEOUT_MS = 20_000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: AUTH_SECRET,
  providers: [Google],
  session: { strategy: "jwt" },
  // No Auth.js page is shown: signing in and its errors happen on /login.
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // Only a Google account with a verified email becomes one of our users.
    signIn: ({ account, profile }) => account?.provider === "google" && readGoogleProfile(profile) !== null,

    async jwt({ token, account, profile, trigger }) {
      if (trigger !== "signIn" || account?.provider !== "google") {
        return token;
      }
      const googleProfile = readGoogleProfile(profile);
      if (googleProfile === null) {
        throw new Error("Google sign-in without a verified email"); // refused by the signIn callback already
      }
      const store = await cookies();
      const { userId } = await prisma.$transaction(
        (tx) =>
          signInWithGoogle(prismaAccountStore(tx), {
            profile: googleProfile,
            anonymousUserId: readSignedUserId(store.get(USER_COOKIE)?.value, AUTH_SECRET),
            adminEmail: readAdminEmail(process.env.ADMIN_EMAIL),
            // Not simulation code: lastSeenAt is real time.
            now: new Date(),
          }),
        { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: SIGN_IN_TIMEOUT_MS },
      );
      // The anonymous identity is over: its saves now belong to the account.
      store.delete(USER_COOKIE);
      return { ...token, userId };
    },

    session({ session, token }) {
      return { ...session, userId: token.userId };
    },
  },
});
