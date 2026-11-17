import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { db } from "./db/client";
import { sendSignInLink } from "./mail";
import { createList } from "./planner";

const signInLinkMinutes = 5;

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
export const googleSignInEnabled = Boolean(
  googleClientId && googleClientSecret,
);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", usePlural: true }),
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await createList(user.id, { title: "Inbox" });
        },
      },
    },
  },
  socialProviders: {
    google: {
      clientId: googleClientId ?? "",
      clientSecret: googleClientSecret ?? "",
      enabled: googleSignInEnabled, // why: dev without a Google client keeps working; better-auth skips a disabled provider
    },
  },
  plugins: [
    magicLink({
      expiresIn: signInLinkMinutes * 60,
      sendMagicLink: ({ email, url }) =>
        sendSignInLink(email, url, signInLinkMinutes),
    }),
    nextCookies(),
  ],
});
