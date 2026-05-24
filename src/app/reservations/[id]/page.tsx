"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";

interface ReservationData {
  id: string;
  productId: string;
  productName: string;
  productPrice: number;
  productImageUrl: string | null;
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  createdAt: string;
}

function useCountdown(expiresAt: string, status: string) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (status !== "PENDING") return;

    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, diff));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, status]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const expired = remaining === 0 && status === "PENDING";

  return { minutes, seconds, expired, remaining };
}

export default function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<
    "confirm" | "cancel" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const fetchReservation = useCallback(async () => {
    try {
      // We'll get the reservation data from the create response stored in sessionStorage
      // or we can expose a GET endpoint. For simplicity we store it client-side on navigation.
      const stored = sessionStorage.getItem(`reservation:${id}`);
      if (stored) {
        setReservation(JSON.parse(stored));
        setLoading(false);
        return;
      }
      // Fallback: try a lightweight endpoint (we'll add it)
      const res = await fetch(`/api/reservations/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setReservation(data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReservation();
  }, [fetchReservation]);

  const { minutes, seconds, expired } = useCountdown(
    reservation?.expiresAt ?? new Date().toISOString(),
    reservation?.status ?? "RELEASED"
  );

  async function handleConfirm() {
    setActionLoading("confirm");
    setError(null);

    try {
      const res = await fetch(`/api/reservations/${id}/confirm`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.status === 410) {
        setError("This reservation has expired and can no longer be confirmed.");
        setReservation((r) => (r ? { ...r, status: "RELEASED" } : r));
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      setReservation((r) => (r ? { ...r, status: "CONFIRMED" } : r));
      sessionStorage.removeItem(`reservation:${id}`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel() {
    setActionLoading("cancel");
    setError(null);

    try {
      const res = await fetch(`/api/reservations/${id}/release`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      setReservation((r) => (r ? { ...r, status: "RELEASED" } : r));
      sessionStorage.removeItem(`reservation:${id}`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto" />
        <p className="text-gray-500 mt-4">Loading reservation…</p>
      </div>
    );
  }

  if (notFound || !reservation) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🔍</div>
        <h2 className="text-xl font-semibold text-gray-900">
          Reservation not found
        </h2>
        <p className="text-gray-500 mt-2">
          This reservation doesn't exist or may have already been processed.
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-6 py-2.5 px-6 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
        >
          Back to Products
        </button>
      </div>
    );
  }

  const isPending = reservation.status === "PENDING";
  const isConfirmed = reservation.status === "CONFIRMED";
  const isReleased = reservation.status === "RELEASED";
  const isExpired = isPending && expired;

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {/* Status banner */}
      {isConfirmed && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <div className="font-semibold text-green-800">Order Confirmed!</div>
            <div className="text-sm text-green-600">
              Your purchase has been confirmed successfully.
            </div>
          </div>
        </div>
      )}
      {(isReleased || isExpired) && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <span className="text-2xl">
            {isExpired ? "⏰" : "❌"}
          </span>
          <div>
            <div className="font-semibold text-red-800">
              {isExpired ? "Reservation Expired" : "Reservation Released"}
            </div>
            <div className="text-sm text-red-600">
              {isExpired
                ? "Your hold has expired. The units have been returned to stock."
                : "This reservation was cancelled and units returned to stock."}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {reservation.productImageUrl && (
          <img
            src={reservation.productImageUrl}
            alt={reservation.productName}
            className="w-full h-48 object-cover"
          />
        )}

        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {reservation.productName}
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {reservation.warehouseName} · {reservation.warehouseLocation}
              </p>
            </div>
            <span
              className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full ${
                isConfirmed
                  ? "bg-green-100 text-green-700"
                  : isReleased || isExpired
                  ? "bg-red-100 text-red-600"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {isExpired ? "EXPIRED" : reservation.status}
            </span>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Quantity</span>
              <span className="font-medium text-gray-900">
                {reservation.quantity}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Unit price</span>
              <span className="font-medium text-gray-900">
                ₹{reservation.productPrice.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="flex justify-between text-sm border-t pt-3">
              <span className="font-semibold text-gray-900">Total</span>
              <span className="font-bold text-indigo-600 text-lg">
                ₹
                {(
                  reservation.productPrice * reservation.quantity
                ).toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* Countdown */}
          {isPending && !expired && (
            <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <div className="text-sm text-amber-700 font-medium mb-1">
                Hold expires in
              </div>
              <div className="text-3xl font-mono font-bold text-amber-800">
                {String(minutes).padStart(2, "0")}:
                {String(seconds).padStart(2, "0")}
              </div>
              <div className="text-xs text-amber-600 mt-1">
                Complete your purchase before time runs out
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}

          {/* Actions */}
          {isPending && !expired && (
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleCancel}
                disabled={actionLoading !== null}
                className="flex-1 py-2.5 px-4 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {actionLoading === "cancel" ? "Cancelling…" : "Cancel"}
              </button>
              <button
                onClick={handleConfirm}
                disabled={actionLoading !== null}
                className="flex-1 py-2.5 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading === "confirm"
                  ? "Confirming…"
                  : "Confirm Purchase"}
              </button>
            </div>
          )}

          {(isConfirmed || isReleased || isExpired) && (
            <button
              onClick={() => router.push("/")}
              className="mt-6 w-full py-2.5 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
            >
              Back to Products
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        Reservation ID: {reservation.id}
      </p>
    </div>
  );
}
