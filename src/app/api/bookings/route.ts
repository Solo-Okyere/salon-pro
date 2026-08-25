import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getUserFromToken, normalizePhone } from "@/lib/auth";
import { bookingSchema } from "@/lib/validators";
import { sendAndLogNotification } from "@/lib/notifications";
import { sms } from "@/lib/sms";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const user = await getUserFromToken(token ?? "");
  if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get("shopId");
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");

  const where: Record<string, unknown> = {};
  if (user.role === "CUSTOMER") where.customerId = user.id;
  else if (user.role === "BARBER") {
    const barber = await prisma.barber.findUnique({ where: { userId: user.id } });
    if (barber) where.barberId = barber.id;
  } else if (shopId) {
    where.shopId = shopId;
  }

  if (status) where.status = status;
  where.deletedAt = null;

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true, avatar: true } },
        barber: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        service: true,
        shop: { select: { id: true, name: true, address: true } },
      },
      orderBy: { scheduledAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: bookings,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(req: NextRequest) {
  // Auth is optional — guests provide name+phone instead
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const authUser = token ? await getUserFromToken(token) : null;

  try {
    const body = await req.json();
    const data = bookingSchema.parse(body);

    // Resolve customerId: logged-in user OR guest find-or-create
    let customerId: string;
    if (authUser) {
      customerId = authUser.id;
    } else {
      if (!data.customerName || !data.customerPhone) {
        return NextResponse.json(
          { success: false, message: "Guest bookings require your name and phone number" },
          { status: 400 }
        );
      }
      const guestPhone = normalizePhone(data.customerPhone);
      const existing = await prisma.user.findUnique({ where: { phone: guestPhone } });
      const guestUser = existing
        ? existing
        : await prisma.user.create({
            data: { phone: guestPhone, name: data.customerName, role: "CUSTOMER" },
          });
      customerId = guestUser.id;
    }

    // Validate barber belongs to shop and is available
    const barber = await prisma.barber.findFirst({
      where: { id: data.barberId, shopId: data.shopId, isActive: true },
    });
    if (!barber) {
      return NextResponse.json({ success: false, message: "Barber not found in shop" }, { status: 404 });
    }
    if (!barber.isAvailable) {
      return NextResponse.json({ success: false, message: "Barber is not available for bookings" }, { status: 409 });
    }

    const service = await prisma.service.findFirst({
      where: { id: data.serviceId, shopId: data.shopId, isActive: true },
    });
    if (!service) {
      return NextResponse.json({ success: false, message: "Service not found" }, { status: 404 });
    }

    // Check for time conflicts
    const scheduledAt = new Date(data.scheduledAt);
    const endAt = new Date(scheduledAt.getTime() + service.durationMinutes * 60 * 1000);

    const conflict = await prisma.booking.findFirst({
      where: {
        barberId: data.barberId,
        deletedAt: null,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        scheduledAt: { lt: endAt },
        AND: [
          {
            scheduledAt: {
              gte: new Date(scheduledAt.getTime() - service.durationMinutes * 60 * 1000),
            },
          },
        ],
      },
    });

    if (conflict) {
      return NextResponse.json({ success: false, message: "Time slot not available" }, { status: 409 });
    }

    const booking = await prisma.booking.create({
      data: {
        customerId,
        barberId: data.barberId,
        shopId: data.shopId,
        serviceId: data.serviceId,
        scheduledAt,
        totalAmount: service.price,
        depositAmount: service.depositAmount,
        notes: data.notes,
        status: service.depositAmount > 0 ? "PENDING" : "CONFIRMED",
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        barber: { include: { user: { select: { id: true, name: true } } } },
        service: true,
        shop: { select: { id: true, name: true, address: true, phone: true } },
      },
    });

    await sendAndLogNotification({
      userId: booking.customerId,
      shopId: booking.shopId,
      bookingId: booking.id,
      channel: "SMS",
      type: "BOOKING_CONFIRMATION",
      title: booking.status === "CONFIRMED" ? "Booking confirmed" : "Booking pending deposit",
      body: `Booking ${booking.status === "CONFIRMED" ? "confirmed" : "created and awaiting deposit"} at ${booking.shop.name} on ${booking.scheduledAt.toISOString()}`,
      templateFn: () =>
        sms.bookingConfirmation(
          booking.customer.phone,
          booking.customer.name,
          booking.shop.name,
          format(booking.scheduledAt, "dd MMM yyyy"),
            format(booking.scheduledAt, "h:mm a"),
            booking.barber.user.name,
            booking.id,
            booking.status !== "CONFIRMED"
          ),
    });

    return NextResponse.json({ success: true, data: booking }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid data", errors: err.flatten().fieldErrors }, { status: 400 });
    }
    console.error("[POST /bookings]", err);
    return NextResponse.json({ success: false, message: "Failed to create booking" }, { status: 500 });
  }
}
