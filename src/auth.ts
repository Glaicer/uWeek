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
      // why: better-auth's own verify URL consumes the one-time token on GET, so mail scanners and prefetchers sign the person in or burn the link; the emailed URL is a pure GET page that verifies only on submit
      sendMagicLink: ({ email, token }) => {
        const url = new URL("/sign-in/confirm", process.env.BETTER_AUTH_URL);
        url.searchParams.set("token", token);
        return sendSignInLink(email, url.toString(), signInLinkMinutes);
      },
    }),
    nextCookies(),
  ],
});
