import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromToken } from "@/lib/auth";
import { moolre } from "@/lib/moolre";
import { disbursementSchema } from "@/lib/validators";

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const user = await getUserFromToken(token ?? "");
  if (!user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const data = disbursementSchema.parse(body);

    const balanceResult = await moolre.checkAccountStatus();
    const availableBalance = Number(balanceResult.data?.balance ?? 0);
    const totalAmount = data.recipients.reduce((sum, recipient) => sum + recipient.amount, 0);

    if (!Number.isFinite(availableBalance) || availableBalance < totalAmount) {
      return NextResponse.json(
        { success: false, message: "Insufficient Moolre wallet balance for this batch." },
        { status: 409 }
      );
    }

    const results: Array<{
      recipient: string;
      name: string;
      status: "SUCCESS" | "FAILED";
      message: string;
      validatedName?: string | null;
      externalRef?: string;
      txStatus?: number | null;
    }> = [];

    for (const recipient of data.recipients) {
      try {
        const normalizedPhone = recipient.phoneNumber.replace(/^\+/, "");
        const validation = await moolre.validateRecipientName(normalizedPhone, recipient.network, data.currency);
        const validatedName = typeof validation.data === "string"
          ? validation.data
          : validation.data?.name ?? validation.data?.receiverName ?? null;

        const nameMatches = validatedName ? normalizeName(validatedName) === normalizeName(recipient.name) : true;
        if (!validatedName || !nameMatches) {
          results.push({
            recipient: recipient.phoneNumber,
            name: recipient.name,
            status: "FAILED",
            message: validatedName ? "Recipient name mismatch" : "Recipient name validation failed",
            validatedName,
          });
          continue;
        }

        const externalRef = recipient.externalRef ?? `SP-DISB-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        const transfer = await moolre.initiateTransfer(
          recipient.amount,
          normalizedPhone,
          externalRef,
          recipient.network,
          `${data.reference ?? "SalonPro payout"} - ${recipient.name}`
        );

        const transferStatus = typeof transfer.data?.txstatus === "number" ? transfer.data.txstatus : null;
        const transferMessage = Array.isArray(transfer.message)
          ? transfer.message.join("; ")
          : transfer.message ?? "Transfer initiated";

        results.push({
          recipient: recipient.phoneNumber,
          name: recipient.name,
          status: transferStatus === 1 ? "SUCCESS" : "FAILED",
          message: transferMessage,
          validatedName,
          externalRef,
          txStatus: transferStatus,
        });
      } catch (providerError) {
        const failReason = providerError instanceof Error ? providerError.message : "Unknown error";
        results.push({
          recipient: recipient.phoneNumber,
          name: recipient.name,
          status: "FAILED",
          message: failReason,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        results,
        totalAmount,
        availableBalance,
        currency: data.currency,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid disbursement payload" }, { status: 400 });
    }

    console.error("[POST /payments/disburse]", err);
    return NextResponse.json({ success: false, message: "Disbursement failed" }, { status: 500 });
  }
}
