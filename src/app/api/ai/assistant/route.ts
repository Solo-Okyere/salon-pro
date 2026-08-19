import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SYSTEM_PROMPT = `You are SalonPro AI, a business assistant for Ghanaian barbershop owners.
You have access to the shop'\''s business data and help owners make smart decisions.
Be concise, practical, and culturally relevant to the Ghanaian barbering market.
Always respond in a friendly, professional tone. Use GHS for currency.
When giving advice, be specific and actionable.`;

interface BusinessContext {
  shop: { name: string; city: string };
  metrics: {
    totalBookings: number;
    completedBookings: number;
    noShows: number;
    noShowRate: number;
    totalRevenue: number;
    uniqueCustomers: number;
    queueToday: number;
  };
  topServices: Array<{ name: string; count: number }>;
  revenueThisWeek: number;
}

async function getBusinessContext(shopId: string, shop: { name: string; city: string }): Promise<BusinessContext> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [totalBookings, completedBookings, noShows, uniqueCustomers, queueToday, revenueAgg, weekRevenue] = await Promise.all([
    prisma.booking.count({ where: { shopId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.booking.count({ where: { shopId, status: "COMPLETED", createdAt: { gte: thirtyDaysAgo } } }),
    prisma.booking.count({ where: { shopId, status: "NO_SHOW", createdAt: { gte: thirtyDaysAgo } } }),
    prisma.booking.findMany({ where: { shopId, createdAt: { gte: thirtyDaysAgo } }, select: { customerId: true }, distinct: ["customerId"] }),
    prisma.queueEntry.count({ where: { shopId, status: { in: ["WAITING", "CALLED", "IN_SERVICE"] }, joinedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    prisma.payment.aggregate({ where: { shopId, status: "PAID", createdAt: { gte: thirtyDaysAgo } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { shopId, status: "PAID", createdAt: { gte: weekAgo } }, _sum: { amount: true } }),
  ]);

  const completed = completedBookings;
  const noShowRate = (completed + noShows) > 0 ? noShows / (completed + noShows) : 0;

  const topServicesRaw = await prisma.booking.groupBy({
    by: ["serviceId"],
    where: { shopId, createdAt: { gte: thirtyDaysAgo } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 3,
  });

  const serviceDetails = await Promise.all(
    topServicesRaw.map(async (s) => {
      const svc = await prisma.service.findUnique({ where: { id: s.serviceId }, select: { name: true } });
      return { name: svc?.name ?? "Unknown", count: s._count.id };
    })
  );

  return {
    shop,
    metrics: {
      totalBookings,
      completedBookings,
      noShows,
      noShowRate,
      totalRevenue: revenueAgg._sum.amount ?? 0,
      uniqueCustomers: uniqueCustomers.length,
      queueToday,
    },
    topServices: serviceDetails,
    revenueThisWeek: weekRevenue._sum.amount ?? 0,
  };
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  const role = req.headers.get("x-user-role");
  if (!userId || !["OWNER", "ADMIN"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { message, history } = await req.json();
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const shop = await prisma.shop.findFirst({
    where: { ownerId: userId, deletedAt: null },
    select: { id: true, name: true, city: true },
  });
  if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

  const context = await getBusinessContext(shop.id, shop);

  const contextBlock = `
## Your Shop: ${context.shop.name} (${context.shop.city})
### Last 30 Days Metrics
- Total Bookings: ${context.metrics.totalBookings}
- Completed: ${context.metrics.completedBookings}
- No-Shows: ${context.metrics.noShows} (${(context.metrics.noShowRate * 100).toFixed(1)}% rate)
- Revenue: GHS ${context.metrics.totalRevenue.toFixed(2)}
- Revenue This Week: GHS ${context.revenueThisWeek.toFixed(2)}
- Unique Customers: ${context.metrics.uniqueCustomers}
- Queue Today: ${context.metrics.queueToday} people
### Top Services (30 days)
${context.topServices.map((s) => `- ${s.name}: ${s.count} bookings`).join("\n")}
`;

  const apiKey = process.env.DEEPSEEK_API_KEY;

  // If no DeepSeek API key, use rule-based responses
  if (!apiKey) {
    const reply = generateFallbackResponse(message, context);
    return NextResponse.json({ reply, context: { shopName: shop.name } });
  }

  try {
    const messages = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${contextBlock}` },
      ...(history ?? []),
      { role: "user", content: message },
    ];

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 500,
        messages,
      }),
    });

    if (!response.ok) throw new Error("API error");
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content ?? "I couldn'\''t process that. Please try again.";

    return NextResponse.json({ reply, context: { shopName: shop.name } });
  } catch {
    const reply = generateFallbackResponse(message, context);
    return NextResponse.json({ reply, context: { shopName: shop.name } });
  }
}

function generateFallbackResponse(message: string, ctx: BusinessContext): string {
  const msg = message.toLowerCase();

  if (msg.includes("revenue") || msg.includes("money") || msg.includes("earn")) {
    return `Your shop earned GHS ${ctx.metrics.totalRevenue.toFixed(2)} in the last 30 days, with GHS ${ctx.revenueThisWeek.toFixed(2)} this week. Your top service is "${ctx.topServices[0]?.name ?? "N/A"}". To boost revenue, consider upselling premium services or running a loyalty campaign.`;
  }
  if (msg.includes("no show") || msg.includes("noshow") || msg.includes("miss")) {
    const rate = (ctx.metrics.noShowRate * 100).toFixed(1);
    if (parseFloat(rate) > 15) {
      return `Your no-show rate is ${rate}% — that'\''s above average. Require deposits for new customers and send WhatsApp reminders 2 hours before appointments. This usually cuts no-shows by 40-60%.`;
    }
    return `Your no-show rate is ${rate}% — that'\''s good! Keep sending reminders to maintain this.`;
  }
  if (msg.includes("queue") || msg.includes("wait")) {
    return `You have ${ctx.metrics.queueToday} people in queue today. To reduce wait times, encourage advance bookings and consider adding another barber on busy days. Peak hours in Ghanaian shops are typically 10am-12pm and 4pm-7pm.`;
  }
  if (msg.includes("customer") || msg.includes("retention") || msg.includes("loyal")) {
    return `You served ${ctx.metrics.uniqueCustomers} unique customers in 30 days. Your best retention tool is WhatsApp follow-ups after each visit. A simple "How was your haircut?" message within 24 hours can increase repeat visits by 30%.`;
  }
  if (msg.includes("service") || msg.includes("popular")) {
    const tops = ctx.topServices.map((s) => `${s.name} (${s.count} bookings)`).join(", ");
    return `Your most popular services are: ${tops || "No data yet"}. Consider creating bundles around your top service, or promoting lower-demand services with discounts to balance your barbers' workload.`;
  }
  if (msg.includes("tip") || msg.includes("advice") || msg.includes("help") || msg.includes("improve")) {
    return `Based on your shop data: 1) Your no-show rate is ${(ctx.metrics.noShowRate * 100).toFixed(0)}% — ${ctx.metrics.noShowRate > 0.15 ? "reduce this by requiring deposits" : "great job keeping this low"}. 2) You have ${ctx.metrics.uniqueCustomers} regular customers — try a loyalty reward campaign to retain them. 3) This week you earned GHS ${ctx.revenueThisWeek.toFixed(0)} — aim for 10% more next week by upselling beard trims.`;
  }

  return `I'\''m SalonPro AI for ${ctx.shop.name}. I can help you with revenue analysis, reducing no-shows, customer retention, service optimization, and business growth strategies. What would you like to know?`;
}