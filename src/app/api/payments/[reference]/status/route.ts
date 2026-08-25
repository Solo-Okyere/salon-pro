import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";
import { moolre } from "@/lib/moolre";
import { sendAndLogNotification } from "@/lib/notifications";
import { sms } from "@/lib/sms";

export async function GET(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const user = await getUserFromToken(token ?? "");

  const payment = await prisma.payment.findUnique({
    where: { reference },
    include: { booking: true, customer: { select: { id: true, name: true } } },
  });
  if (!payment) return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
  if (user && payment.customerId !== user.id) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  if (payment.status !== "PENDING") {
    return NextResponse.json({ success: true, data: { status: payment.status } });
  }

  try {
    const result = await moolre.checkPaymentStatus(reference);
    const succeeded = result.data?.txstatus === 1;

    if (succeeded) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", paidAt: new Date(), momoTxId: result.data.transactionid },
      });

      if (payment.bookingId) {
        await prisma.booking.update({
          where: { id: payment.bookingId },
          data: {
            depositPaid: true,
            ...(payment.booking?.status === "PENDING" && { status: "CONFIRMED" }),
          },
        });
      }

      // Notify the customer by SMS the moment the deposit clears
      await sendAndLogNotification({
        userId: payment.customerId,
        shopId: payment.shopId,
        bookingId: payment.bookingId ?? undefined,
        channel: "SMS",
        type: "DEPOSIT_CONFIRMATION",
        title: "Deposit received",
        body: `Deposit of GHS ${payment.amount} received (ref: ${reference}).`,
        templateFn: () =>
          sms.depositConfirmation(payment.phoneNumber, payment.customer.name, payment.amount.toString(), reference),
      });
    }

    return NextResponse.json({ success: true, data: { status: succeeded ? "PAID" : "PENDING" } });
  } catch (err) {
    console.error("[GET /payments/:reference/status]", err);
    return NextResponse.json({ success: true, data: { status: "PENDING" } });
  }
}
