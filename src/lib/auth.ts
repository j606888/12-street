import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    line: {
      clientId: process.env.LINE_CLIENT_ID ?? "",
      clientSecret: process.env.LINE_CLIENT_SECRET ?? "",
      // Email needs extra approval from LINE, so only ask for profile
      disableDefaultScope: true,
      scope: ["openid", "profile"],
      // Better Auth requires a unique email; LINE usually doesn't give one
      mapProfileToUser: (profile) => ({
        email: profile.email ?? `${profile.sub}@line.local`,
      }),
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "customer" },
      phone: { type: "string", required: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
