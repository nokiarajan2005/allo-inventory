import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkIdempotency, saveIdempotencyResult } from "@/lib/idempotency";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const idempotencyKey = req.headers.get("Idempotency-Key");

  const cached = await checkIdempotency(idempotencyKey);
  if (cached) return cached;

  const { id } = await params;

  const result = await prisma.$transaction(async (tx) => {
    const reservations = await tx.$queryRaw<
      {
        id: string;
        status: string;
        expiresAt: Date;
        quantity: number;
        productId: string;
        warehouseId: string;
      }[]
    >`
      SELECT id, status, "expiresAt", quantity, "productId", "warehouseId"
      FROM "Reservation"
      WHERE id = ${id}
      FOR UPDATE
    `;

    const reservation = reservations[0];

    if (!reservation) {
      return { error: "Reservation not found", status: 404 };
    }

    if (reservation.status === "CONFIRMED") {
      return { reservation, status: 200 }; // idempotent
    }

    if (
      reservation.status === "RELEASED" ||
      new Date(reservation.expiresAt) < new Date()
    ) {
      // If PENDING but expired: release stock and mark as RELEASED
      if (
        reservation.status === "PENDING" &&
        new Date(reservation.expiresAt) < new Date()
      ) {
        await tx.reservation.update({
          where: { id },
          data: { status: "RELEASED" },
        });
        await tx.stock.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
          },
          data: { reserved: { decrement: reservation.quantity } },
        });
      }
      return { error: "Reservation has expired or was already released", status: 410 };
    }

    if (reservation.status !== "PENDING") {
      return { error: "Reservation is not in a confirmable state", status: 409 };
    }

    // Confirm: decrement total (permanently consume the stock) and clear reserved
    await tx.stock.update({
      where: {
        productId_warehouseId: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
      },
      data: {
        total: { decrement: reservation.quantity },
        reserved: { decrement: reservation.quantity },
      },
    });

    const updated = await tx.reservation.update({
      where: { id },
      data: { status: "CONFIRMED" },
      include: {
        product: { select: { name: true, price: true } },
        warehouse: { select: { name: true } },
      },
    });

    return { reservation: updated, status: 200 };
  });

  if ("error" in result) {
    const errBody = { error: result.error };
    await saveIdempotencyResult(idempotencyKey, errBody, result.status);
    return NextResponse.json(errBody, { status: result.status });
  }

  const responseBody = {
    id: result.reservation.id,
    status: result.reservation.status,
    productName: (result.reservation as any).product?.name,
    warehouseName: (result.reservation as any).warehouse?.name,
    quantity: result.reservation.quantity,
    updatedAt: result.reservation.updatedAt.toISOString(),
  };

  await saveIdempotencyResult(idempotencyKey, responseBody, result.status);
  return NextResponse.json(responseBody, { status: result.status });
}
