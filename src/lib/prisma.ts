import { PrismaClient } from "@prisma/client";

// Supabase's transaction-mode pooler (port 6543, ?pgbouncer=true) only allows a
// single prepared-statement connection per serverless instance. On Vercel each
// lambda must use connection_limit=1, and the password may contain characters
// (like '@') that must be URL-encoded. We normalize the URL here so a raw
// Supabase string ("...:pass@word@host...") works without manual editing.
function buildDatasourceUrl(raw?: string): string | undefined {
  if (!raw) return undefined;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  // Re-encode the password so special chars (e.g. '@', '#', '/') don't break parsing.
  if (url.password) {
    url.password = encodeURIComponent(decodeURIComponent(url.password));
  }

  const params = url.searchParams;
  if (params.get("pgbouncer") === "true" && !params.has("connection_limit")) {
    params.set("connection_limit", "1");
  }
  if (!params.has("sslmode")) {
    params.set("sslmode", "require");
  }

  return url.toString();
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const datasourceUrl = buildDatasourceUrl(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: datasourceUrl ? { db: { url: datasourceUrl } } : undefined,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
