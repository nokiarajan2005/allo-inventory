# Allo Inventory — Take-Home Exercise

A Next.js application implementing a **multi-warehouse inventory reservation system** with race-condition-safe stock holds.

## Running Locally

### 1. Prerequisites

- Node.js 18+
- A hosted Postgres instance (Supabase, Neon, or Railway — all have free tiers)
- Redis instance (Upstash free tier) — optional but recommended

### 2. Clone and install

```bash
git clone <your-repo-url>
cd allo-inventory
npm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in your values:

```
DATABASE_URL="postgresql://..."   # your Postgres connection string
REDIS_URL="redis://..."           # optional — Upstash or similar
CRON_SECRET="some-random-string"  # protects the /api/cron/expire endpoint
```

### 4. Run migrations and seed

```bash
# Push schema to your Postgres instance
npx prisma db push

# Seed with sample products, warehouses, and stock
npm run db:seed
```

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture decisions

### Concurrency-safe reservations

The core challenge is: two simultaneous requests for the last unit of a SKU must result in exactly one success and one 409.

I solve this with **two layers**:

1. **Redis distributed lock** (`SET NX PX 5000`) — fast path. Only one request per `(productId, warehouseId)` pair can enter the transaction at a time. If Redis is unavailable, we fall through gracefully to layer 2.

2. **PostgreSQL `SELECT FOR UPDATE`** inside a transaction — the lock row-level on the `Stock` record before reading `available = total - reserved`. Even without Redis (e.g. in a single-instance dev environment), the DB-level lock guarantees correctness. The combination of both means we're safe under Postgres's default `READ COMMITTED` isolation.

The flow:
```
POST /api/reservations
  → acquireLock("lock:stock:{productId}:{warehouseId}")  [Redis, 5s TTL]
  → BEGIN TRANSACTION
     → SELECT ... FROM Stock WHERE ... FOR UPDATE         [DB row lock]
     → check available >= quantity
     → UPDATE Stock SET reserved += quantity
     → INSERT Reservation (status=PENDING, expiresAt=now+10min)
  → COMMIT
  → releaseLock()
```

If two requests race:
- With Redis: the second one fails to acquire the lock and gets a 429 "retry"
- Without Redis (fallback): both enter the transaction, but `FOR UPDATE` serialises them — one succeeds, the other re-reads the decremented `reserved` count and correctly returns 409

### Stock accounting model

```
available = total - reserved
```

- **Confirm**: `total -= qty`, `reserved -= qty` (stock is permanently consumed)
- **Release**: `reserved -= qty` (units return to available)
- **Expiry cleanup**: same as Release

This means `total` represents physical stock on hand, and `reserved` is the current hold count.

### Expiry mechanism

**Two complementary approaches:**

1. **Lazy cleanup on reads** — `GET /api/products` calls `releaseExpiredReservations()` before computing available stock. This means availability is always accurate at browse time, with no background process needed in development.

2. **Vercel Cron job** — `vercel.json` configures `/api/cron/expire` to run every minute in production. This ensures expiry happens even if nobody browses (e.g., a warehouse dashboard with no frontend load).

`releaseExpiredReservations()` uses a single transaction: it finds all `PENDING` reservations past `expiresAt`, marks them `RELEASED`, and returns their units to stock. Multiple cron instances running simultaneously are safe — the transaction is idempotent because we filter on `status = PENDING`, and concurrent runs will partition the work without double-releasing.

### Idempotency (bonus)

The `POST /api/reservations` and `POST /api/reservations/:id/confirm` endpoints accept an `Idempotency-Key` header.

Implementation:
- On first request: process normally, then `upsert` the response body + status into `IdempotencyRecord` keyed by the header value
- On retry: find the record and return the stored response with an `Idempotency-Replayed: true` header
- The `upsert` uses `update: {}` to prevent overwriting on concurrent retries

The key is stored on the `Reservation` itself (as a nullable unique column) so that retried reservation creates return the same reservation object, not a new one.

---

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products` | List products with available stock per warehouse |
| GET | `/api/warehouses` | List warehouses |
| POST | `/api/reservations` | Create reservation; returns 409 if stock insufficient |
| GET | `/api/reservations/:id` | Fetch reservation details |
| POST | `/api/reservations/:id/confirm` | Confirm (payment succeeded); returns 410 if expired |
| POST | `/api/reservations/:id/release` | Release (payment failed or user cancelled) |
| GET | `/api/cron/expire` | Release expired reservations (called by Vercel Cron) |

---

## Trade-offs and things I'd do differently

**With more time:**
- Add proper auth (the reservation ID is guessable via CUID — in production, add a session check or short-lived JWT)
- The cron job runs every minute but Vercel's free tier enforces 1 invocation/day — switch to Upstash QStash for reliable per-minute scheduling
- Add a proper toast/notification system instead of in-place error divs
- Write integration tests for the concurrency path (load testing with k6 or artillery)
- Add pagination to the product listing
- Track reservation history per customer

**Deliberate choices:**
- No local SQLite — Prisma + hosted Postgres is wired up from day one as specified
- Redis is optional, not required — the app is fully correct without it, just slightly less efficient under burst load
- No ORM-level optimistic locking (e.g. version fields) — `FOR UPDATE` is simpler and more reliable for this use case
- Lazy cleanup is the primary expiry mechanism; the cron is belt-and-suspenders
"# allo-inventory" 
