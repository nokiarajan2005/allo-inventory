import { prisma } from "./prisma";
import { NextResponse } from "next/server";

/**
 * Check if we have a stored result for this idempotency key.
 * Returns a NextResponse if the key was already used, null otherwise.
 */
export async function checkIdempotency(
  key: string | null
): Promise<NextResponse | null> {
  if (!key) return null;

  const record = await prisma.idempotencyRecord.findUnique({
    where: { key },
  });

  if (record) {
    return NextResponse.json(JSON.parse(record.responseBody), {
      status: record.statusCode,
      headers: { "Idempotency-Replayed": "true" },
    });
  }

  return null;
}

/**
 * Persist a response for an idempotency key.
 */
export async function saveIdempotencyResult(
  key: string | null,
  body: object,
  statusCode: number
): Promise<void> {
  if (!key) return;

  try {
    await prisma.idempotencyRecord.upsert({
      where: { key },
      create: { key, responseBody: JSON.stringify(body), statusCode },
      update: {}, // don't overwrite
    });
  } catch {
    // Race: another request saved it first — fine, ignore
  }
}
