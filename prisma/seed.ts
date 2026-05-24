import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clear existing data
  await prisma.reservation.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.idempotencyRecord.deleteMany();

  // Create warehouses
  const wh1 = await prisma.warehouse.create({
    data: { name: "Mumbai Central", location: "Mumbai, Maharashtra" },
  });
  const wh2 = await prisma.warehouse.create({
    data: { name: "Delhi North Hub", location: "Delhi, NCR" },
  });
  const wh3 = await prisma.warehouse.create({
    data: { name: "Bangalore Tech Park", location: "Bangalore, Karnataka" },
  });

  // Create products
  const products = [
    {
      name: "Sony WH-1000XM5",
      description: "Industry-leading noise canceling wireless headphones",
      price: 29990,
      imageUrl:
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
    },
    {
      name: "Apple AirPods Pro",
      description: "Active noise cancellation with transparency mode",
      price: 24900,
      imageUrl:
        "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=400",
    },
    {
      name: "Samsung Galaxy Watch 6",
      description: "Advanced health monitoring smartwatch",
      price: 29999,
      imageUrl:
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400",
    },
    {
      name: "Logitech MX Master 3",
      description: "Advanced wireless mouse for power users",
      price: 9995,
      imageUrl:
        "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400",
    },
    {
      name: "iPad Air (M2)",
      description: "Powerful thin tablet with M2 chip",
      price: 59900,
      imageUrl:
        "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400",
    },
  ];

  for (const productData of products) {
    const product = await prisma.product.create({ data: productData });

    // Add stock in each warehouse with varying quantities
    const stockData = [
      { warehouseId: wh1.id, total: Math.floor(Math.random() * 5) + 1 },
      { warehouseId: wh2.id, total: Math.floor(Math.random() * 5) + 1 },
      { warehouseId: wh3.id, total: Math.floor(Math.random() * 3) + 0 }, // sometimes 0
    ];

    for (const s of stockData) {
      await prisma.stock.create({
        data: {
          productId: product.id,
          warehouseId: s.warehouseId,
          total: s.total,
          reserved: 0,
        },
      });
    }
  }

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
