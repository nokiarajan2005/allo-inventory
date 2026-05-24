import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    redis.on("error", (err) => {
      console.error("Redis connection error:", err.message);
    });
  }

  return redis;
}

/**
 * Acquire a distributed lock via Redis SET NX PX.
 * Returns true if the lock was acquired, false if not.
 */
export async function acquireLock(
  key: string,
  ttlMs: number = 5000
): Promise<boolean> {
  const client = getRedis();
  if (!client) return true; // No Redis: allow, rely on DB-level locking

  try {
    const result = await client.set(key, "1", "NX", "PX", ttlMs);
    return result === "OK";
  } catch {
    return true; // Redis unavailable — fall through to DB locking
  }
}

export async function releaseLock(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await client.del(key);
  } catch {
    // best-effort
  }
}
