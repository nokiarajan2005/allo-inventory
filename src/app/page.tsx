"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface StockEntry {
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  total: number;
  reserved: number;
  available: number;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  stock: StockEntry[];
  totalAvailable: number;
}

function ReserveModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const router = useRouter();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(
    product.stock.find((s) => s.available > 0)?.warehouseId ?? ""
  );
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStock = product.stock.find(
    (s) => s.warehouseId === selectedWarehouseId
  );

  async function handleReserve() {
    if (!selectedWarehouseId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: selectedWarehouseId,
          quantity,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setError(
          `Not enough stock available. Only ${data.available ?? 0} unit(s) left.`
        );
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      // Store in sessionStorage so the reservation page can display details
      sessionStorage.setItem(`reservation:${data.id}`, JSON.stringify(data));
      // Navigate to reservation page
      router.push(`/reservations/${data.id}`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Reserve Units</h2>
          <p className="text-gray-500 text-sm mt-1">{product.name}</p>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Warehouse
            </label>
            <div className="space-y-2">
              {product.stock.map((s) => (
                <button
                  key={s.warehouseId}
                  disabled={s.available === 0}
                  onClick={() => setSelectedWarehouseId(s.warehouseId)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    selectedWarehouseId === s.warehouseId
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 hover:border-gray-300"
                  } ${s.available === 0 ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium text-sm text-gray-900">
                        {s.warehouseName}
                      </div>
                      <div className="text-xs text-gray-500">{s.warehouseLocation}</div>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        s.available > 0
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-600"
                      }`}
                    >
                      {s.available} available
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-full border-2 border-gray-300 flex items-center justify-center font-bold hover:border-indigo-400 transition-colors"
              >
                −
              </button>
              <span className="text-lg font-semibold w-8 text-center">
                {quantity}
              </span>
              <button
                onClick={() =>
                  setQuantity((q) =>
                    Math.min(selectedStock?.available ?? 1, q + 1)
                  )
                }
                className="w-9 h-9 rounded-full border-2 border-gray-300 flex items-center justify-center font-bold hover:border-indigo-400 transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}

          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Total</span>
            <span className="font-semibold text-gray-900 text-lg">
              ₹{(product.price * quantity).toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        <div className="p-6 border-t flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleReserve}
            disabled={loading || !selectedWarehouseId}
            className="flex-1 py-2.5 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Reserving…" : "Reserve (10 min hold)"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductCard({
  product,
  onReserve,
}: {
  product: Product;
  onReserve: (p: Product) => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
      {product.imageUrl && (
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-48 object-cover"
        />
      )}
      <div className="p-5">
        <h3 className="font-semibold text-gray-900 text-lg leading-tight">
          {product.name}
        </h3>
        {product.description && (
          <p className="text-gray-500 text-sm mt-1 line-clamp-2">
            {product.description}
          </p>
        )}
        <div className="mt-3 text-2xl font-bold text-indigo-600">
          ₹{product.price.toLocaleString("en-IN")}
        </div>

        <div className="mt-4 space-y-2">
          {product.stock.map((s) => (
            <div key={s.warehouseId} className="flex justify-between text-sm">
              <span className="text-gray-600">{s.warehouseName}</span>
              <span
                className={`font-medium ${
                  s.available === 0 ? "text-red-500" : "text-green-600"
                }`}
              >
                {s.available === 0 ? "Out of stock" : `${s.available} left`}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={() => onReserve(product)}
          disabled={product.totalAvailable === 0}
          className="mt-5 w-full py-2.5 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {product.totalAvailable === 0 ? "Out of Stock" : "Reserve"}
        </button>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      setProducts(data);
    } catch {
      // keep previous state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    // Refresh stock every 30s so the UI stays fresh
    const interval = setInterval(fetchProducts, 30_000);
    return () => clearInterval(interval);
  }, [fetchProducts]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Products</h1>
        <p className="text-gray-500 mt-1">
          Reserve items across our warehouses. Hold lasts 10 minutes.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl h-80 animate-pulse border border-gray-100"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onReserve={setSelectedProduct} />
          ))}
        </div>
      )}

      {selectedProduct && (
        <ReserveModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
