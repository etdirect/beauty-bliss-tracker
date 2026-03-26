# Auth + POS Restructure Implementation Summary

## Files Modified

### 1. `shared/schema.ts`
- Added 4 new table definitions: `posLocations`, `users`, `userPosAssignments`, `brandPosAvailability`
- Added corresponding types: `PosLocation`, `User`, `UserPosAssignment`, `BrandPosAvailability`
- Added insert schemas and insert types for all new tables
- All existing types preserved (counters, brands, counterBrands, salesEntries, promotions, promotionResults)

### 2. `server/storage.ts`
- Added new methods to `IStorage` interface: POS locations CRUD, Users CRUD, User-POS assignments, Brand-POS availability
- **PgStorage**: Added CREATE TABLE statements for 4 new tables in `init()`. Implemented all new methods.
- **MemStorage**: Added 4 new Maps for new entities. Seed data includes:
  - 7 POS locations (FACESSS AD, LOGON CWB/TS/MK/KT/ST, SOGO KT)
  - 2 users: admin (management, PIN 1234) and ba1 (BA, PIN 1111, assigned to LOGON/TS)
  - All brands available at all POS locations by default
  - POS location IDs shared with legacy counter IDs for backward compatibility
- PIN hashed with bcryptjs (hashSync for seed, hash for runtime)

### 3. `server/routes.ts`
- Added `requireAuth` middleware (checks session.userId)
- Added `requireManagement` middleware (checks session.role === "management")
- Added auth routes: POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
- Added CRUD routes: /api/pos-locations, /api/users, /api/user-pos-assignments, /api/brand-pos-availability
- Protected all existing routes with requireAuth (GET) or requireManagement (POST/PATCH)
- Exception: POST /api/promotions/push remains unprotected (server-to-server endpoint)
- PIN hashed with bcrypt before storing on create/update

### 4. `server/index.ts`
- Added express-session middleware BEFORE routes registration
- Session config: MemoryStore, 24h cookie, httpOnly, secret from env or default

### 5. `client/src/pages/login.tsx` (NEW)
- Clean centered card with username + PIN (password/numeric) inputs
- Calls POST /api/auth/login via apiRequest
- On success calls onLogin callback to update auth context

### 6. `client/src/App.tsx`
- Added AuthContext with user state, loading state, login/logout functions
- AuthProvider checks GET /api/auth/me on mount
- AppRouter: unauthenticated → login, BA → ba-entry only, Management → full app
- logout clears session via POST /api/auth/logout and clears queryClient cache

### 7. `client/src/pages/ba-entry.tsx`
- POS selector shows only assigned locations (for BA) or all active (for management)
- Brands filtered by brand-POS availability for selected POS location
- Shows "No POS Locations Assigned" message if BA has no assignments
- Added logout button in header
- Dashboard link only shown for management users

### 8. `client/src/pages/dashboard.tsx`
- Management-only guard (redirects BA to /)
- Added logout button in sidebar
- Shows user name in sidebar subtitle

### 9. `client/src/pages/dashboard/settings.tsx`
- Added 3 new tabs: POS Locations, Users, Brand-POS
- POS Locations: add/deactivate POS locations with sales channel, store code, store name
- Users: add users, activate/deactivate, PIN reset, POS assignment checkboxes per BA
- Brand-POS: matrix of brands × POS locations with checkboxes
- Legacy tabs (Counters, Brands, Assignments) preserved

### 10. `client/src/lib/queryClient.ts`
- Added `credentials: "same-origin"` to apiRequest and getQueryFn for session cookies

### 11. `script/build.ts`
- Added `bcryptjs` to esbuild allowlist

## Seed Credentials
- **admin** / PIN: 1234 (management - full access)
- **ba1** / PIN: 1111 (BA - assigned to LOG-ON TST Harbour City)
