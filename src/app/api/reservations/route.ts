import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireLock, releaseLock } from "@/lib/redis";
import { CreateReservationSchema } from "@/lib/schemas";
import { checkIdempotency, saveIdempotencyResult } from "@/lib/idempotency";

const RESERVATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: NextRequest) {
  const idempotencyKey = req.headers.get("Idempotency-Key");

  // Check idempotency first
  const cached = await checkIdempotency(idempotencyKey);
  if (cached) return cached;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateReservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { productId, warehouseId, quantity } = parsed.data;

  // Distributed lock key scoped to the (product, warehouse) pair
  const lockKey = `lock:stock:${productId}:${warehouseId}`;
  const acquired = await acquireLock(lockKey, 5000);

  if (!acquired) {
    return NextResponse.json(
      { error: "Too many concurrent requests — please retry" },
      { status: 429 }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Lock the stock row with SELECT FOR UPDATE (serializable read)
      const stocks = await tx.$queryRaw<
        { id: string; total: number; reserved: number }[]
      >`
        SELECT id, total, reserved
        FROM "Stock"
        WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
        FOR UPDATE
      `;

      const stock = stocks[0];
      if (!stock) {
        return { error: "Stock record not found", status: 404 };
      }

      const available = stock.total - stock.reserved;
      if (available < quantity) {
        return {
          error: "Not enough stock available",
          available,
          status: 409,
        };
      }

      // Increment reserved count
      await tx.stock.update({
        where: {
          productId_warehouseId: { productId, warehouseId },
        },
        data: { reserved: { increment: quantity } },
      });

      // Create the reservation
      const reservation = await tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: "PENDING",
          expiresAt: new Date(Date.now() + RESERVATION_WINDOW_MS),
          idempotencyKey,
        },
        include: {
          product: { select: { name: true, price: true, imageUrl: true } },
          warehouse: { select: { name: true, location: true } },
        },
      });

      return { reservation, status: 201 };
    });

    if ("error" in result) {
      const errBody = {
        error: result.error,
        ...(result.available !== undefined && { available: result.available }),
      };
      await saveIdempotencyResult(idempotencyKey, errBody, result.status);
      return NextResponse.json(errBody, { status: result.status });
    }

    const responseBody = {
      id: result.reservation.id,
      productId: result.reservation.productId,
      productName: result.reservation.product.name,
      productPrice: result.reservation.product.price,
      productImageUrl: result.reservation.product.imageUrl,
      warehouseId: result.reservation.warehouseId,
      warehouseName: result.reservation.warehouse.name,
      warehouseLocation: result.reservation.warehouse.location,
      quantity: result.reservation.quantity,
      status: result.reservation.status,
      expiresAt: result.reservation.expiresAt.toISOString(),
      createdAt: result.reservation.createdAt.toISOString(),
    };

    await saveIdempotencyResult(idempotencyKey, responseBody, 201);
    return NextResponse.json(responseBody, { status: 201 });
  } finally {
    await releaseLock(lockKey);
  }
}
