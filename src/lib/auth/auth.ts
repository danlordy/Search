import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { count, eq } from "drizzle-orm";
import { authDb } from "@/lib/auth/db";
import {
  ADMIN_GRADE,
  ADMIN_ROLE,
  DEFAULT_USER_GRADE,
  DEFAULT_USER_ROLE,
  getDefaultGradeForRole,
  normalizeRegisterableRoleInput,
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
        input: true,
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
          const row = authDb.select({ total: count() }).from(schema.user).get();
          const total = Number(row?.total ?? 0);
          const requestedRole = normalizeRegisterableRoleInput(createdUser.role);
          const defaultGrade = getDefaultGradeForRole(requestedRole);

          if (total !== 1) {
            authDb
              .update(schema.user)
              .set({
                role: requestedRole,
                grade: defaultGrade,
                updatedAt: new Date(),
              })
              .where(eq(schema.user.id, createdUser.id))
              .run();
            return;
          }

          authDb
            .update(schema.user)
            .set({
              role: ADMIN_ROLE,
              grade: ADMIN_GRADE,
              updatedAt: new Date(),
            })
            .where(eq(schema.user.id, createdUser.id))
            .run();
        },
      },
    },
  },
});
