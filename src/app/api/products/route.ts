import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { releaseExpiredReservations } from "@/lib/expiry";

export async function GET() {
  // Lazy cleanup: release any expired reservations before computing available stock
  await releaseExpiredReservations();

  const products = await prisma.product.findMany({
    include: {
      stock: {
        include: {
          warehouse: {
            select: { id: true, name: true, location: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const response = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    imageUrl: p.imageUrl,
    stock: p.stock.map((s) => ({
      warehouseId: s.warehouseId,
      warehouseName: s.warehouse.name,
      warehouseLocation: s.warehouse.location,
      total: s.total,
      reserved: s.reserved,
      available: s.total - s.reserved,
    })),
    totalAvailable: p.stock.reduce((sum, s) => sum + (s.total - s.reserved), 0),
  }));

  return NextResponse.json(response);
}
