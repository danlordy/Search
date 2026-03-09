import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { authDb } from "@/lib/auth/db";
import {
  DEFAULT_USER_GRADE,
  DEFAULT_USER_ROLE,
} from "@/lib/auth/permissions";
import * as schema from "@/lib/auth/schema";

const authBaseUrl =
  process.env.BETTER_AUTH_URL ||
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
  "http://localhost:9002";

const authSecret = process.env.BETTER_AUTH_SECRET || "change-this-secret-in-production";

export const auth = betterAuth({
  baseURL: authBaseUrl,
  secret: authSecret,
  database: drizzleAdapter(authDb, {
    provider: "sqlite",
    schema,
  }),
  plugins: [nextCookies()],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        input: false,
        defaultValue: DEFAULT_USER_ROLE,
      },
      grade: {
        type: "number",
        required: false,
        input: false,
        defaultValue: DEFAULT_USER_GRADE,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          authDb
            .update(schema.user)
            .set({
              role: DEFAULT_USER_ROLE,
              grade: DEFAULT_USER_GRADE,
              updatedAt: new Date(),
            })
            .where(eq(schema.user.id, createdUser.id))
            .run();
        },
      },
    },
  },
});
