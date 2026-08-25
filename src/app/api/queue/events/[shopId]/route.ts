import { NextResponse } from "next/server";

/** SSE is disabled on Vercel serverless; clients should poll queue status. */
export async function GET() {
  return NextResponse.json(
    { success: false, message: "Live streams are not supported; poll /api/queue/status/:shopId instead." },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
