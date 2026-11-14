import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { db } from "./db/client";
import { sendSignInLink } from "./mail";

const signInLinkMinutes = 5;

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", usePlural: true }),
  plugins: [
    magicLink({
      expiresIn: signInLinkMinutes * 60,
      sendMagicLink: ({ email, url }) =>
        sendSignInLink(email, url, signInLinkMinutes),
    }),
    nextCookies(),
  ],
});
