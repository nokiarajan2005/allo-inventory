import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredReservations } from "@/lib/expiry";

// This route is called by Vercel Cron (see vercel.json)
// It can also be triggered manually for testing
export async function GET(req: NextRequest) {
  // Simple bearer-token check to prevent public abuse
  const authHeader = req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const released = await releaseExpiredReservations();
  return NextResponse.json({ released, timestamp: new Date().toISOString() });
}
