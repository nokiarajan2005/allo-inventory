import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const result = await prisma.$transaction(async (tx) => {
    const reservations = await tx.$queryRaw<
      {
        id: string;
        status: string;
        quantity: number;
        productId: string;
        warehouseId: string;
      }[]
    >`
      SELECT id, status, quantity, "productId", "warehouseId"
      FROM "Reservation"
      WHERE id = ${id}
      FOR UPDATE
    `;

    const reservation = reservations[0];

    if (!reservation) {
      return { error: "Reservation not found", status: 404 };
    }

    if (reservation.status === "RELEASED") {
      return { message: "Already released", status: 200 }; // idempotent
    }

    if (reservation.status === "CONFIRMED") {
      return {
        error: "Cannot release a confirmed reservation",
        status: 409,
      };
    }

    // Release: return reserved units to available
    await tx.stock.update({
      where: {
        productId_warehouseId: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
      },
      data: { reserved: { decrement: reservation.quantity } },
    });

    await tx.reservation.update({
      where: { id },
      data: { status: "RELEASED" },
    });

    return { message: "Reservation released", status: 200 };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ message: result.message }, { status: result.status });
}
