# Cursor Project Rules Handout — Beauty Bliss Sales Tracker

Paste this into Cursor and ask it to generate a `.cursor/rules/project.mdc` (or `.cursorrules`) file based on the sections below.

---

## 1. Project Purpose

A daily sales-entry web app for beauty counter Beauty Advisors (BAs) with a management dashboard. BAs submit units + amount per brand per counter per day, plus GWP (Gift-With-Purchase) counts tied to active promotions. Management views trends, promotion performance, and counter/brand breakdowns. No login — trust-based BA entry, open dashboard.

---

## 2. Tech Stack & Versions

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 22.x (Railway default) |
| Language | TypeScript | 5.x, strict mode, ESM (`"type": "module"`) |
| Backend framework | Express | 5.x |
| Frontend framework | React | 18.3 |
| Client routing | wouter | 3.x (hash-based, not react-router) |
| Build tool | Vite | 5.x (client) + tsx script (server bundle to `dist/index.cjs`) |
| Styling | Tailwind CSS | 3.x + `tailwindcss-animate` + `tw-animate-css` |
| UI primitives | shadcn/ui on Radix UI | latest |
| Data fetching | TanStack Query | 5.x |
| Forms | react-hook-form + `@hookform/resolvers` + Zod | latest |
| Validation | Zod | 3.24 + `drizzle-zod` + `zod-validation-error` |
| ORM | Drizzle ORM | 0.39 |
| Database (target) | PostgreSQL | 15+ via `pg` 8.x |
| Current storage | In-memory `MemStorage` class | — (swap to Postgres for production) |
| Session (planned) | `express-session` + `connect-pg-simple` | — |
| CSV parsing | `csv-parse/sync` | 6.x, with `relax_column_count: true` |
| Charts | Recharts | 2.x |
| Icons | lucide-react | 0.453 |
| Deployment | Railway (auto-detects Node, runs `npm ci` → `npm run build` → `npm start`) | — |

**Scripts:** `npm run dev` (tsx watch), `npm run build` (client + server bundle), `npm start` (production), `npm run check` (tsc), `npm run db:push` (drizzle-kit).

---

## 3. Project Structure

```
beauty-bliss-tracker/
├── client/                     # Vite React SPA
│   ├── index.html
│   └── src/
│       ├── main.tsx            # Entry, mounts App, QueryClient, Toaster
│       ├── App.tsx             # wouter routes: "/" → BA entry, "/dashboard/*" → dashboard
│       ├── index.css           # Tailwind directives + CSS variables (rose accent 340 65% 47%)
│       ├── pages/
│       │   ├── ba-entry.tsx    # Daily sales entry form for BAs
│       │   ├── dashboard.tsx   # Dashboard shell/nav
│       │   ├── dashboard/      # Sub-pages: sales, counters, brands, promotions, reports
│       │   └── not-found.tsx
│       ├── components/
│       │   ├── ui/             # shadcn/ui primitives — DO NOT hand-edit; regenerate via shadcn CLI
│       │   └── *.tsx           # App-specific components
│       ├── hooks/              # Custom React hooks (use-toast, use-mobile, etc.)
│       └── lib/                # queryClient, utils (cn), API helpers
│
├── server/                     # Express backend
│   ├── index.ts                # Bootstrap; reads process.env.PORT; dev uses Vite middleware, prod serves static
│   ├── routes.ts               # ALL API routes registered here under /api/*
│   ├── storage.ts              # IStorage interface + MemStorage impl; single `storage` singleton
│   ├── vite.ts                 # Vite dev middleware wiring
│   └── static.ts               # Production static serving from dist/public
│
├── shared/
│   └── schema.ts               # SINGLE SOURCE OF TRUTH: Drizzle tables + Zod insert schemas + inferred TS types
│                               # Imported by both client and server via "@shared/*" alias
│
├── script/
│   └── build.ts                # Builds client (Vite) then bundles server with esbuild → dist/index.cjs
│
├── drizzle.config.ts           # Points to shared/schema.ts, outputs migrations to ./migrations
├── tailwind.config.ts          # Rose/blush accent theme, container config
├── vite.config.ts              # Aliases: @ → client/src, @shared → shared, @assets → attached_assets
├── tsconfig.json               # Strict, ESM, path aliases
└── package.json
```

**Path aliases (both client and server):**
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`

---

## 4. Coding Guidelines & Constraints

### TypeScript
- Strict mode always on. No `any` unless annotated with `// eslint-disable` and a reason.
- Prefer `type` for props/DTOs, `interface` only for extendable contracts.
- Use `import type { ... }` for type-only imports.
- ESM syntax only (`import`/`export`), no CommonJS `require` in source files.

### Schema & Types (CRITICAL)
- **`shared/schema.ts` is the single source of truth.** Define every entity as a Drizzle table there, derive the Zod insert schema with `createInsertSchema`, and export the inferred `Insert*` and `Select*` types.
- Both client and server import types from `@shared/schema` — never redefine a shape locally.
- When adding a field: update `shared/schema.ts` first, then run `npm run db:push`, then update UI/API.

### React (Client)
- Functional components only. No class components.
- Prefer named function declarations over arrow-function default exports for pages: `export default function BAEntry() { ... }`.
- Server state → TanStack Query (`useQuery`, `useMutation`). Local UI state → `useState`. Do not stuff server data into Zustand/Context.
- Query keys: array form starting with the resource path, e.g. `['/api/sales', { date }]`. Reuse the same shape for invalidation.
- All forms use `react-hook-form` + `zodResolver` bound to the matching `@shared/schema` Zod schema.
- Routing: use `wouter` (`useLocation`, `Link`, `Route`, `Switch`). Do **not** add react-router.
- Never mutate props or query cache data directly — return new objects from selectors and use `queryClient.setQueryData` / `invalidateQueries` for updates.

### UI & Styling
- Use existing shadcn/ui components from `client/src/components/ui/` before building new ones.
- **Do not hand-edit files in `components/ui/`** — regenerate via the shadcn CLI when an upgrade is needed.
- Style with Tailwind utility classes. Compose with the `cn()` helper from `@/lib/utils`.
- Follow the existing rose/blush accent (`340 65% 47%`) on warm white theme — do not introduce new accent colors without approval.
- Accessible defaults: keyboard-navigable, WCAG AA contrast, `aria-*` where Radix doesn't cover it.

### Server / API
- Register every route in `server/routes.ts` under the `/api/*` prefix.
- Validate every request body with the matching Zod schema from `@shared/schema`. Reject with 400 on failure.
- **All API errors must follow the shape `{ status: number, error: string, details?: unknown }`** and be sent with the matching HTTP status code. Success responses return the resource JSON directly.
- Use the exported `storage` singleton (`server/storage.ts`) for all data access. Do not touch the underlying store directly from routes.
- Never read a hardcoded port — always `process.env.PORT` with a dev fallback. Never call `app.listen` outside `server/index.ts`.
- Keep route handlers thin: parse → validate → delegate to `storage` → respond. Business logic that touches multiple entities belongs in `storage.ts` methods.

### Storage Layer
- `IStorage` is the contract. `MemStorage` is the current implementation. When adding a method, add it to the interface first.
- The future Postgres implementation must satisfy the same interface — do not leak Mem-specific behavior (like synchronous returns) into callers. Every storage method returns a `Promise`.

### CSV / External Data
- Use `csv-parse/sync` with `columns: true, skip_empty_lines: true, relax_column_count: true, trim: true` for Microsoft Lists CSV imports (columns vary).
- Map external brand codes through the `BRAND_CODE_MAP` in `server/routes.ts`; do not scatter magic strings.
- Sync endpoints must be idempotent: upsert on a stable natural key (e.g. `PromotionID` from the source), never blind-insert.

### State & Side Effects
- No global mutable singletons other than `storage` and `queryClient`.
- Never mutate global state directly — go through setters, mutations, or `storage` methods.
- No `useEffect` for data fetching — use TanStack Query.
- No `window`/`document` access outside components; wrap in `useEffect` when unavoidable.

### File & Naming Conventions
- Components: `PascalCase.tsx`. Hooks: `use-kebab-case.ts`. Utilities: `kebab-case.ts`.
- One default-exported component per page file; co-locate small helpers.
- Never use `.jsx` / `.js` in `client/src` or `server/` — TypeScript only.

### Git / Deployment Hygiene
- `package.json` and `package-lock.json` must stay in sync. After any dependency change, run `npm install` locally and commit the updated lock file. Railway uses `npm ci` and will fail on drift.
- Do not commit `node_modules/`, `dist/`, `.env`, or `*.db-shm`/`*.db-wal`.
- `NODE_ENV=production` is set by Railway; do not set `PORT` manually in Railway variables.
- Client bundle output: `dist/public/`. Server bundle output: `dist/index.cjs`. Both produced by `npm run build`.

### Testing & Verification (when added)
- Any new API route needs at least one happy-path and one validation-failure check.
- Run `npm run check` (tsc) before every commit — zero TS errors is the merge bar.

### Don'ts
- Don't add authentication middleware to public routes (`/` BA entry and `/dashboard/*` are intentionally open).
- Don't introduce a new state manager (Redux, Zustand, Jotai) — TanStack Query + local state is sufficient.
- Don't swap the router, ORM, or UI library without a written proposal.
- Don't hardcode counter names, brand names, or promotion types — they are user-editable data and live in `storage`.
- Don't use `alert()` / `confirm()` — use the shadcn `Dialog` / `AlertDialog` and the `useToast` hook.

---

## 5. Prompt for Cursor

> Using the sections above, generate a `.cursor/rules/project.mdc` file with `alwaysApply: true`. Structure it with clear headings (Stack, Structure, Conventions, Guardrails). Keep it under 400 lines. Prioritize the CRITICAL items (shared schema as source of truth, API error shape, package-lock discipline, no-auth routes) as bold callouts at the top.
