import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

function normalizeGhanaPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  return `+233${digits}`;
}

function prismaErrorMessage(error: unknown) {
  const err = error as { code?: string; meta?: { target?: string[] } };
  if (err.code === "P2002") {
    const target = err.meta?.target?.join(", ") || "field";
    return `A record with this ${target} already exists.`;
  }
  if (err.code === "P2003") return "The selected owner or shop reference is invalid.";
  return "Failed to register shop";
}

// GET /api/admin/shops - list all shops with owner + counts
export async function GET(req: NextRequest) {
  const role = req.headers.get("x-user-role");
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const shops = await prisma.shop.findMany({
    include: {
      owner: { select: { id: true, name: true, phone: true } },
      _count: { select: { bookings: true, barbers: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: shops });
}

// POST /api/admin/shops - register a new shop and owner account.
export async function POST(req: NextRequest) {
  const role = req.headers.get("x-user-role");
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { ownerName, ownerPhone, ownerPassword, shopName, city, region, address, phone } = body;

    if (!ownerName || !ownerPhone || !shopName || !city || !region || !address) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!ownerPassword || ownerPassword.length < 6) {
      return NextResponse.json({ error: "Owner password must be at least 6 characters" }, { status: 400 });
    }

    const normalizedOwnerPhone = normalizeGhanaPhone(ownerPhone);
    const normalizedShopPhone = phone ? normalizeGhanaPhone(phone) : normalizedOwnerPhone;
    const hashedPassword = await hashPassword(ownerPassword);

    const shop = await prisma.$transaction(async (tx) => {
      const existingOwner = await tx.user.findUnique({ where: { phone: normalizedOwnerPhone } });
      const owner = existingOwner
        ? await tx.user.update({
            where: { id: existingOwner.id },
            data: { role: "OWNER", name: ownerName.trim(), password: hashedPassword },
          })
        : await tx.user.create({
            data: {
              phone: normalizedOwnerPhone,
              name: ownerName.trim(),
              role: "OWNER",
              password: hashedPassword,
            },
          });

      const baseSlug = shopName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shop";
      let slug = baseSlug;
      let attempt = 0;
      while (await tx.shop.findUnique({ where: { slug } })) {
        attempt++;
        slug = `${baseSlug}-${attempt}`;
      }

      return tx.shop.create({
        data: {
          name: shopName.trim(),
          slug,
          city: city.trim(),
          region: region.trim(),
          address: address.trim(),
          phone: normalizedShopPhone,
          ownerId: owner.id,
          isActive: true,
          isVerified: false,
        },
        include: {
          owner: { select: { id: true, name: true, phone: true } },
          _count: { select: { bookings: true, barbers: true } },
        },
      });
    });

    return NextResponse.json({ data: shop }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/admin/shops]", error);
    return NextResponse.json({ error: prismaErrorMessage(error) }, { status: 500 });
  }
}
