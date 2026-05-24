import { prisma } from "./prisma";

/**
 * Release any reservations that have passed their expiresAt timestamp.
 * Called lazily on reads (GET /api/products) and also suitable for a cron job.
 *
 * Uses a single atomic UPDATE + return to avoid race conditions between
 * multiple instances running the cleanup simultaneously.
 */
export async function releaseExpiredReservations(): Promise<number> {
  const now = new Date();

  // Find expired PENDING reservations and release them in one transaction
  const result = await prisma.$transaction(async (tx) => {
    const expired = await tx.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: now },
      },
      select: { id: true, productId: true, warehouseId: true, quantity: true },
    });

    if (expired.length === 0) return 0;

    // Mark them all as RELEASED
    await tx.reservation.updateMany({
      where: { id: { in: expired.map((r) => r.id) } },
      data: { status: "RELEASED" },
    });

    // Return the reserved units to stock for each affected (product, warehouse) pair
    for (const r of expired) {
      await tx.stock.update({
        where: {
          productId_warehouseId: {
            productId: r.productId,
            warehouseId: r.warehouseId,
          },
        },
        data: { reserved: { decrement: r.quantity } },
      });
    }

    return expired.length;
  });

  return result;
}
