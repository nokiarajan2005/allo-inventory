import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
{ params }: { params: Promise<{ id: string }> }
) {
const { id } = await params;

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      product: { select: { name: true, price: true, imageUrl: true } },
      warehouse: { select: { name: true, location: true } },
    },
  });

  if (!reservation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: reservation.id,
    productId: reservation.productId,
    productName: reservation.product.name,
    productPrice: reservation.product.price,
    productImageUrl: reservation.product.imageUrl,
    warehouseId: reservation.warehouseId,
    warehouseName: reservation.warehouse.name,
    warehouseLocation: reservation.warehouse.location,
    quantity: reservation.quantity,
    status: reservation.status,
    expiresAt: reservation.expiresAt.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
  });
}
