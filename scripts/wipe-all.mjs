/**
 * Hard-wipe all user data from the database.
 * Uses the DIRECT_URL (port 5432) to bypass pgbouncer.
 * Run once: node scripts/wipe-all.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");

// Parse .env.local manually (no dotenv needed)
let directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  try {
    const raw = readFileSync(envPath, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("DIRECT_URL=")) {
        directUrl = trimmed.slice("DIRECT_URL=".length).replace(/^["']|["']$/g, "");
        break;
      }
    }
  } catch {
    // .env.local not found — fall through and let Prisma use its defaults
  }
}

if (!directUrl) {
  console.error("❌  DIRECT_URL not found in .env.local or environment.");
  console.error("    Set DIRECT_URL to your local Postgres connection (postgresql://postgres:postgres@localhost:5432/salonpro).");
  process.exit(1);
}

console.log("⚠️  Wiping ALL user data from the database …");

const prisma = new PrismaClient({ datasources: { db: { url: directUrl } } });

try {
  // TRUNCATE users CASCADE wipes every table that has a FK back to users:
  // shops, barbers, bookings, queue_entries, payments, loyalty_accounts,
  // loyalty_rewards, reviews, notifications, otp_codes, refresh_tokens, etc.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');

  // Also wipe standalone tables that don't reference users
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "loyalty_rewards" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "suppliers" CASCADE');

  console.log("✅  All user data wiped. Admin env-login still works.");
} catch (err) {
  console.error("❌  Wipe failed:", err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
