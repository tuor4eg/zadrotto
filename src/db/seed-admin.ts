import "dotenv/config";

import { dbClient } from "@/db";
import { createAdminUser, getAdminUsersCount } from "@/db/queries/admin-users";
import { hashPassword } from "@/lib/auth/password";

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

async function seedAdminUser() {
  const existingAdminUsersCount = await getAdminUsersCount();

  if (existingAdminUsersCount > 0) {
    console.log("Admin user already exists, skipping seed.");
    return;
  }

  const login = readRequiredEnv("ADMIN_LOGIN");
  const password = readRequiredEnv("ADMIN_PASSWORD");
  const passwordHash = await hashPassword(password);

  await createAdminUser(login, passwordHash);

  console.log(`Admin user '${login}' created.`);
}

seedAdminUser()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbClient.end();
  });
