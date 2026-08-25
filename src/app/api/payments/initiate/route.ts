import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";
import { paymentSchema } from "@/lib/validators";
import { moolre } from "@/lib/moolre";
import { z } from "zod";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const user = await getUserFromToken(token ?? "");

  try {
    const body = await req.json();
    const data = paymentSchema.parse(body);

    // Resolve shopId from booking to avoid trusting client input
    let shopId: string | null = null;
    let customerId = user?.id ?? null;
    if (data.bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: data.bookingId },
        select: { shopId: true, customerId: true, depositAmount: true },
      });
      if (!booking) {
        return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
      }
      if (user && booking.customerId !== user.id) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      }
      if (data.amount !== booking.depositAmount) {
        return NextResponse.json({ success: false, message: "Payment amount does not match the booking deposit" }, { status: 400 });
      }
      shopId = booking.shopId;
      customerId = booking.customerId;
    }
    if (!customerId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const reference = `SP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const payment = await prisma.payment.create({
      data: {
        customerId,
        shopId: shopId ?? "",
        bookingId: data.bookingId,
        amount: data.amount,
        provider: data.provider,
        phoneNumber: data.phoneNumber,
        reference,
        status: "PENDING",
      },
    });

    try {
      const result = await moolre.initiatePayment(data.provider, data.amount, data.phoneNumber, reference);
      await prisma.payment.update({
        where: { id: payment.id },
        data: { momoTxId: typeof result.data === "string" ? result.data : undefined },
      });
    } catch (providerErr) {
      const failReason = providerErr instanceof Error ? providerErr.message : "Unknown error";
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", failReason },
      });
      return NextResponse.json(
        { success: false, message: "Payment initiation failed. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        paymentId: payment.id,
        reference,
        message: "Payment request sent to your phone. Approve it to complete.",
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid data" }, { status: 400 });
    }
    console.error("[POST /payments/initiate]", err);
    return NextResponse.json({ success: false, message: "Payment initiation failed" }, { status: 500 });
  }
}
