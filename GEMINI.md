# benom Operations Hub — Engineering & Post-Feature System Audit Standard

## Mandatory Rule: Full-System Review & Optimization After Every New Feature
Whenever any new feature, endpoint, modal, chart, or workflow is added to `benom Operations Hub` (`app/`), you **MUST** perform a full-system review and optimization pass before considering the task complete:

### 1. Frontend Bundle & On-Demand Lazy Loading
- **Never eagerly import** modals (`*Modal.tsx`), heavy drill-down panels (`*DrilldownPanel.tsx`), secondary sub-tab boards (`KtvFieldBoard`, `SparePartsPanel`), or Recharts components into views that do not always render them on first paint. Use `React.lazy(() => import(...))` + `<Suspense>` and conditionally render modals only when active.
- Keep `vite.config.ts` `manualChunks` free of Rollup circular chunk warnings (`vendor-react`, `vendor-icons`, `vendor-charts`).
- Reuse shared formatters (`fmtVnd`, `fmtNum` in `src/api.ts`) and memoize expensive table/chart derivations with `useMemo`.
- Keep secondary lists paginated or expandable (`Top 6 → Top 50`, or `limit`/`offset` with `X-Total-Count`) so initial page paint stays minimal on mobile 4G.

### 2. Backend Query Efficiency, Indexes & Turso Cloud RTT
- **Avoid N+1 and sequential DB round-trips:** Batch multi-row lookups with `batchQueryByIds()` / `WHERE ... IN (...)`, run independent queries in `Promise.all()`, and group multi-row writes with `dbBatch()`.
- **Index every new lookup/filter column:** Whenever a new query filters or joins on a column (`ref_invoice`, `invoice_no`, `order_id`, etc.), add `CREATE INDEX IF NOT EXISTS ...` in `app/server/db.mjs`.
- **Zero-data-loss additive migrations only:** Never drop or recreate existing tables; all schema updates in `db.mjs` must be safe on live Local SQLite and Turso Cloud (`CREATE TABLE/INDEX IF NOT EXISTS`, `try/catch ALTER TABLE`).
- **Keep wire payloads tiny:** Preserve Gzip middleware, immutable asset caching, lean SQL column projections (omit heavy Base64 blobs or full markdown bodies from list endpoints), and server-side short-TTL caching with automatic invalidation on `POST`/`PUT`/`DELETE`.

### 3. SOP, Finance & Security Parity (Frontend ↔ Backend)
- Enforce every business guardrail on **both** UI and backend API:
  - **Self-install (`require_install = 0` / `Khách hàng tự lắp đặt`):** Always lock UI picker AND clear KTV fields (`[]`) on `POST/PUT /api/orders`, `POST /api/orders/:id/generate-handover`, `PUT /api/handovers/:id`, and PDF print payloads so technician allowance never leaks.
  - **Heavy goods (`>= 25 kg`):** Require `>= 2 KTV` whenever `require_install = 1` and `status != 'Cancelled'`.
  - **Locked allowance periods:** Respect `423 Locked` checks on allowance-affecting fields.
  - **Timezone:** Always use Vietnam GMT+7 helpers (`getVnIsoDate`, `getVnDateTime`, `getVnYearMonth`) for cut-off rules, document numbering, and SLA timestamps.
  - **Security:** Never leak default passwords or quick-login helpers into production bundles (`LEAK_COUNT=0` in `dist/assets/*.js`); check RBAC (`ADMIN`, `EDITOR`, `KTV`, `VIEWER`) and write `audit_logs` on sensitive mutations.

### 4. Mandatory Pre-Completion Verification
Before reporting done (and before any commit/deploy), run and pass:
1. `npx tsc --noEmit` (0 errors)
2. `npm run build` (0 circular chunk warnings; check chunk wire sizes)
3. Production bundle secret-leak check (`LEAK_COUNT=0` for `benom2026` in `dist/assets/*.js`)
4. Targeted API/functional verification for the new feature and impacted flows (cleaning up any temporary test rows afterward).
