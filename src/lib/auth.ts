import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.authAccount,
      verification: schema.verification,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: {
    user: {
      create: {
        // Auto-create a household for each new user.
        after: async (user) => {
          const existing = await db
            .select()
            .from(schema.household)
            .where(eq(schema.household.userId, user.id))
            .limit(1);
          if (existing.length > 0) return;
          await db.insert(schema.household).values({
            userId: user.id,
            name: user.name || user.email.split("@")[0],
            baseCurrency: "EUR",
          });
        },
      },
    },
  },
});
