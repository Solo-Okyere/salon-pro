import { NextResponse } from "next/server";

/** SSE is disabled on Vercel serverless; clients should poll queue status. */
export async function GET() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store", "X-Queue-Events-Deprecated": "poll-status" },
  });
}
