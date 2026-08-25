import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;

  const [entries, shop, barbers] = await Promise.all([
    prisma.queueEntry.findMany({
      where: { shopId, status: { in: ["WAITING", "CALLED", "IN_SERVICE"] } },
      include: {
        customer: { select: { id: true, name: true, avatar: true } },
        barber: { include: { user: { select: { id: true, name: true } } } },
        service: { select: { id: true, name: true, durationMinutes: true } },
      },
      orderBy: [{ isPremium: "desc" }, { queueNumber: "asc" }],
    }),
    prisma.shop.findUnique({ where: { id: shopId }, select: { id: true, name: true } }),
    prisma.barber.findMany({
      where: { shopId, isActive: true },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { rating: "desc" },
    }),
  ]);

  if (!shop) return NextResponse.json({ success: false, message: "Shop not found" }, { status: 404 });

  // Recalculate wait times
  const avgServiceMins = 30;
  let cumulativeWait = 0;
  const entriesWithWait = entries.map((entry: { status: string; estimatedWaitMinutes: number }) => {
    const wait = entry.status === "IN_SERVICE" ? 0 : cumulativeWait;
    cumulativeWait += avgServiceMins;
    return { ...entry, estimatedWaitMinutes: wait };
  });

  // Compute per-barber queue stats
  const barberStats = barbers.map((b) => {
    const barberEntries = entries.filter((e: { barberId: string | null; status: string }) => e.barberId === b.id);
    const waiting = barberEntries.filter((e: { status: string }) => e.status === "WAITING").length;
    const inService = barberEntries.some((e: { status: string }) => e.status === "IN_SERVICE");
    return {
      id: b.id,
      name: b.user.name,
      avatar: b.user.avatar,
      rating: b.rating,
      waiting,
      inService,
      estimatedWaitMinutes: waiting * avgServiceMins,
    };
  });

  // Sort so least-busy first
  barberStats.sort((a, b) => a.waiting - b.waiting);

  return NextResponse.json({
    success: true,
    data: {
      shop,
      entries: entriesWithWait,
      barbers: barberStats,
      totalWaiting: entries.filter((e: { status: string }) => e.status === "WAITING").length,
      currentlyServing: entries.find((e: { status: string }) => e.status === "IN_SERVICE") ?? null,
    },
  });
}
