# HRMS Platform — Project Context

## What this is
Multi-tenant, group-enabled HRMS SaaS. Used internally across Sri Sai Group
companies and sold externally. Full design reference: `docs/HRMS_System_Design_fnf.docx`
(Phase-1 schema: 58 tables across 10 functional domains).

## Tenancy hierarchy (fixed, non-recursive, 4 levels — Brand optional)
Super Admin → Group → Company → [Brand] → (Roster mandatory) → Department / Employees

- Only Super Admin creates Groups, Companies, Brands (and their first admin).
- Group Admin / Company Admin cannot self-serve creation of the tier below them.
- **Brand is optional per Company** (`companies.uses_brands`, chosen at company creation
  and not changeable via any UI today): a Brand-mode company still requires every
  Employee/Roster to belong to a Brand (unchanged); a direct-mode company
  (`uses_brands = false`) has zero Brands — brand creation is rejected for it — and
  Employees/Rosters/QR terminals are created straight at the Company level instead
  (`brand_id` null throughout).
- Roster-mandatory rule now applies one level up for direct-mode companies: a Brand
  needs ≥1 roster before its first Brand-scoped employee (unchanged); a direct-mode
  Company needs ≥1 company-level roster (`brand_id IS NULL`) before its first employee.
- Brand and Department are independent dimensions on `employees` (WHERE vs WHAT).

## Tech stack
| Layer      | Tech |
|------------|------|
| Backend    | Node.js + **Express only** (no NestJS) — modular services, multi-tenant middleware |
| ORM        | Sequelize — `paranoid: true` soft deletes everywhere |
| Database   | PostgreSQL — shared DB, `company_id` row isolation at ORM layer |
| Frontend   | **React (Vite SPA) — no Next.js** — separate portals: Super Admin, Company Admin, ESS |
| Styling (FE) | **Tailwind CSS v4** (`@tailwindcss/vite` + CSS-native `@theme`, not a `tailwind.config.js`) |
| Routing (FE) | React Router |
| Auth       | JWT + OAuth2, RBAC middleware (`resource:action` codes), optional SSO |
| Async/Jobs | Redis + Bull — payroll runs, notifications, reports |
| Payments   | Razorpay / Stripe |
| Notifications | Email (SES/SendGrid), SMS, in-app |
| Hosting    | AWS / Azure, region-wise |

> Note: the original design doc mentions Express/NestJS and React/Next.js as options.
> This project has locked the choice to **Express** and **React (Vite)** — do not
> scaffold NestJS modules/decorators or Next.js App Router/pages anywhere.

## Non-negotiable design rules
1. **Every business table carries `company_id`.** No query skips this — enforced
   at ORM layer (default scope / middleware), not per-controller.
2. **Soft deletes only.** All tables have `deleted_at`. Never hard-delete.
3. **RBAC via `resource:action` codes** (e.g. `employee:create`, `leave:approve`),
   mapped through `roles` → `role_permissions` → `permissions`.
4. **Scope-aware access:** same role sees different data at tenant / company /
   brand level via `user_roles.company_id` / `brand_id`.
5. **Audit everything sensitive** → `audit_logs`.
6. **Attendance is face-recognition-only, kiosk-side.** No QR/WebAuthn/phone-based
   flow, no GPS/free-text punch (superseded 2026-08-03 — see Progress log). Flow:
   employee self-registers 3 angle face embeddings once (ESS Settings → Face ID,
   `face-api.js` client-side); at the kiosk (a logged-in Scanner-role `User`, its own
   camera — admin-provisioned via email/password Scanner accounts), the employee taps
   Check-In or Check-Out, completes a random on-screen liveness challenge (blink /
   head-turn, checked via face-api.js landmark tracking across a short frame burst —
   this does **not** defeat a determined pre-recorded-video attack, an accepted known
   limitation), the kiosk extracts a 128-d descriptor client-side, and the backend
   1:N-matches it against a Redis-cached per-company embedding set (`config/redis.js`)
   before writing the `attendance` row via `applyAttendancePunch(..., source: 'face')`.
   Any failure → regularisation request, not a fallback punch.
7. **Roster > default shift.** `shift_rosters` (per employee per date) takes
   priority over `employee_shifts` when present.
8. **Company vs admin are separate records.** Onboarding a company creates a
   `companies` row + a `users` row (status=invited) + one-time activation link
   email. No plaintext passwords ever emailed.

## Database connection (dev environment)
- Using **Supabase** (free tier) as the dev/test Postgres, AWS RDS planned for production later.
- Supabase's **direct DB host is IPv6-only** — if the dev machine has no IPv6 route, connection
  will fail. Use the **Connection Pooling** host/port instead (Project Settings → Database →
  Connection Pooling): host like `aws-<n>-<region>.pooler.supabase.com`, port `6543`, user
  formatted as `postgres.<project-ref>` (not just `postgres`).
- Supabase requires SSL: `config/config.js` must set
  `dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }`.
- `.env` holds `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` — never commit this file,
  never paste real passwords into chat/docs; rotate immediately if accidentally exposed.

## Build order — actual applied order (corrected for FK dependencies)
The order below was adjusted from a first-pass domain listing: `plans` must exist before
`groups`/`companies` (both have `plan_id` FKs to it), and 6 columns with circular references
(`groups.created_by`, `companies.created_by` → users; `users.employee_id` → employees;
`departments.head_employee_id` → employees; `user_roles.brand_id`, `invitations.brand_id` →
brands) are created as plain columns first, then wired up with real FK constraints in a final
deferred-FK migration. Applied order: `plans` → `groups` → `permissions` → `roles` →
`role_permissions` → `companies` → `users` → `user_roles` → `refresh_tokens` →
`password_resets` → `invitations` → `brands` → `departments` → `designations` → `employees` →
`employee_documents` → deferred-FK migration (17 migrations total).

## Progress log
- ✅ Phase-1 schema (16 tables, 17 migrations) live on Supabase (dev DB)
- ✅ RBAC seeded: 85 permissions, 6 system roles, role_permissions mapped (243 rows).
  Roles/permissions now have real unique constraints — seeders are genuinely idempotent.
- ✅ Auth module + RBAC middleware live and smoke-tested against Supabase:
  signup-invite, activate, login, refresh (rotating), logout.
  `requireAuth` (JWT → tenant context) + `requirePermission(code)` (scoped to company_id/brand_id).
  Platform-level users (`company_id IS NULL`) supported via a partial unique index; one
  bootstrap Super Admin seeded from `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` in `.env`.
  Super Admin gate on signup-invite uses `requireSuperAdmin` (structural: `company_id === null`),
  not a permission string — prevents a Company Admin inviting admins for companies they don't own.
- ✅ Organization Structure CRUD live: brands (Super-Admin-only writes), departments,
  designations, employees (+ transfer), employee_documents. Cross-tenant referential checks
  on employee create/transfer (brand/department/designation/manager must belong to caller's
  own company). Delete guards (409) when active employees still reference a brand/dept/designation.
  17/17 smoke tests passed; test data cleaned, only bootstrap Super Admin remains in Supabase.
- ⚠️ Known scope boundary: `user_roles.brand_id` affects the permission gate only — it does not
  yet auto-filter list/detail rows to a Brand Admin's own brand. Company-level isolation is fully
  enforced; brand-level row-scoping within a company is not. Revisit when building Brand Admin
  dashboards (rosters/attendance approvals are brand-scoped by nature).
- ✅ Phase-3 schema (8 tables, 8 migrations) live on Supabase: `shifts`, `employee_shifts`,
  `qr_attendance_terminals`, `employee_devices`, `shift_rosters`, `attendance`,
  `attendance_regularizations`, `od_requests`. Redis (Upstash, TLS) wired via ioredis at
  `src/config/redis.js`.
- ✅ QR + WebAuthn check-in/out flow live (`src/modules/attendance/attendance.service.js`):
  rotating terminal-signed JWTs (`src/utils/qrToken.js`), Redis `SET jti EX rotation_seconds NX`
  replay guard, WebAuthn registration/assertion via `@simplewebauthn/server`
  (`src/utils/webauthn.js`), roster-over-default-shift resolution, night-shift midnight-crossing
  business-date handling. Smoke-tested end-to-end for QR issuance/replay-rejection and the
  roster-mandatory gate; WebAuthn itself needs a real authenticator/browser to fully exercise.
  Terminals authenticate their own `POST /attendance/terminals/:terminalCode/rotate` call via an
  `X-Terminal-Secret` header (not a user JWT — terminals aren't logged-in users).
  **⚠️ Superseded 2026-08-03**: this entire QR-terminal + WebAuthn mechanism (and the
  later office-kiosk QR+WebAuthn flow below) has been deleted and replaced by
  face recognition — see the dated entry near the end of this log.
- ✅ shift_rosters CRUD live, and the roster-mandatory check in
  `employee.service.js::createEmployee` is wired up (`db.ShiftRoster.count({ where: { brandId }})`).
  **Deviation from PHASE3_MODELS.md**: `shift_rosters.employee_id` is nullable, not required as
  the doc's table implies — required-employee_id was circular with the tenancy rule itself
  (a Brand can't get a roster without an employee, and can't get an employee without a roster).
  Resolved the same way as Phase-1's deferred-FK columns: an "unassigned slot" roster row
  (employee_id NULL, brand+shift+date only) satisfies the roster-mandatory check, then gets
  assigned to an employee later via `PATCH /attendance/rosters/:id`.
- ✅ `employee_devices.signature_counter` (bigint, default 0, migration `20260708090000`) added
  beyond PHASE3_MODELS.md's table — needed for real clone/replay detection. The check-in flow
  rejects (401) if the incoming assertion's counter isn't strictly greater than the stored value,
  then persists the new counter on success. `verifyRegistrationResponse`'s counter seeds the
  column at device registration time.
- ⚠️ Known gaps: (1) `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` env vars aren't set yet — code falls back
  to `localhost`/`http://localhost:5173` for dev; must be set to the real frontend domain before
  this leaves local dev. (2) Two follow-up permission-seed files (`20260707150800`,
  `20260707150900`) add `employee_shift:*` and `attendance_regularization/od_request:read(_own)`
  codes that PHASE3_MODELS.md's permission list omitted.
- ✅ Phase-4 schema (6 tables, 8 migrations) live on Supabase: `leave_types`, `leave_policies`,
  `leave_balances`, `holidays`, `leave_requests`, `comp_off_credits`. `leave_requests.comp_off_credit_id`
  uses the same deferred-FK pattern as Phase-1 (comp_off_credits is created after leave_requests in
  build order, so the constraint is added in a follow-up migration). Also added
  `shifts.weekly_off_days` (int array, day-of-week ints) — no table anywhere modeled a weekly-off
  day before this, and both leave day-counting and comp-off detection need it.
- ✅ Leave application + approval, comp-off auto-detection, balance accrual, and holiday CRUD live
  in `src/modules/leave/`. Key design resolutions (flagged as ambiguous in PHASE4_MODELS.md):
  - **Comp-off join**: `leave_requests.comp_off_credit_id` (unique) links a request to the credit
    it consumes; approval flips the credit to `used`. Since one row can only link one credit,
    comp-off requests are constrained to a single day (`fromDate === toDate`) — taking multiple
    comp-off days means multiple 1-day requests.
  - **Working-day utility**: `src/utils/workingDays.js` (`isWorkingDay`/`isHoliday`/`isWeeklyOff`)
    is the single shared implementation used by both leave day-counting and comp-off
    auto-detection, per the doc's explicit instruction not to duplicate this logic. Comp-off
    detection is wired into all three attendance-write paths that can produce `present`/`on_duty`:
    `attendance.service.js::checkIn`, `odRequest.service.js::approveOdRequest`, and
    `attendanceRegularization.service.js::approveRegularization` — always as a best-effort,
    logged-not-thrown side effect so a bug in comp-off logic can never block an attendance write.
  - **Balance tracking for unpaid (LWP) types**: only the insufficient-balance *rejection* is
    skipped at request-creation time for `is_paid: false` leave types — usage is still recorded in
    `leave_balances` on approval and is allowed to go negative.
  - **Accrual trigger**: `leaveBalance.service.js::getOrCreateBalance` lazily creates the
    employee's balance row for a given year the first time it's needed (from the policy's
    `annual_quota`/`accrual`), rather than requiring a separate backfill step. The monthly cron
    (below) tops up `monthly`-accrual balances going forward; `yearly`-accrual balances are correct
    the moment they're created.
  - Bull was introduced fresh for this phase (`src/config/queue.js`, `src/jobs/`) — no queue/cron
    infrastructure existed anywhere in the repo before Phase-4. Repeatable jobs run in the same
    process as the API (no separate worker process yet): `leaveAccrual.job.js` (monthly, 1st of
    month) and `compOffExpiry.job.js` (daily), both wired up in `src/server.js`.
- ⚠️ Known gap: weekly-off detection now works (`shifts.weekly_off_days`), but nothing in the UI/API
  surface lets it be set except direct shift create/update — fine for now since Phase-4 didn't touch
  the shift module's routes beyond the model/migration addition.
- ⚠️ Found and fixed during Phase-4 smoke testing (pre-existing, not introduced by this phase): the
  date-range helpers used `.toISOString()` to format local dates, which silently rolls a date back
  by one calendar day on any server running ahead of UTC (this deployment is IST). Fixed in
  `src/utils/dateRange.js` (now shared by leave + `odRequest.service.js`, which had its own inline
  copy of the same bug) to use local `Y-M-D` formatting throughout, matching the convention
  `attendance.service.js`'s `dateOnly()` already established. Worth double-checking any other
  ad-hoc date-string formatting added in future phases against this same trap.
- ✅ Frontend design system + auth foundation live in `Frontend/`: Tailwind CSS v4 via
  `@tailwindcss/vite` (CSS-native `@theme` in `src/index.css`, not `tailwind.config.js` — v4
  dropped the JS config in favor of CSS tokens), Inter font via `@fontsource/inter`. Layout shell
  (`src/components/layout/{Sidebar,Topbar,Layout}.tsx`) is portal-agnostic — takes `navItems` +
  labels as props — and is reused across `/super-admin`, `/company-admin`, `/ess` placeholder
  routes in `src/routes/AppRoutes.tsx`. Auth: `src/api/client.ts` (axios + JWT interceptor +
  single-flight 401 refresh-retry), `src/context/AuthContext.tsx` + `useAuth` (in-memory only,
  no localStorage — token also mirrored into `src/api/tokenStore.ts` since axios interceptors run
  outside React), `src/pages/auth/LoginPage.tsx`, `src/components/ProtectedRoute.tsx` (auth +
  optional permission gate).
  **Resolved gap**: `POST /auth/login` only returns `{ accessToken, refreshToken }`, but
  `GET /auth/me` (`requireAuth`-gated) is now live and does a real `UserRole → Role → Permission`
  lookup, returning `{ id, email, employeeId, roles: [{ name, companyId, groupId, brandId }],
  permissions: string[] }`. `AuthContext` calls it right after login (and on app-load session
  restore) and wires the real array into `hasPermission()`, so `ProtectedRoute`'s `permission` prop
  and every `hasPermission()` gate across the Company Admin portal (see below) work correctly
  against real RBAC data — confirmed end-to-end against Supabase, not just unit-level. Login also
  already redirects role-aware via `src/routes/roleRedirect.ts`'s `getDefaultRoute(roles)` (Super
  Admin → `/super-admin`, Company Admin → `/company-admin`, Employee → `/ess`), not hardcoded to
  `/super-admin` as previously noted here.
- ✅ Company Admin portal live at `/company-admin`: Dashboard (brand/employee/pending-approval
  counts via a new `GET /dashboard/summary` endpoint, `src/modules/dashboard/`), Employees
  (list/filter/create/edit/transfer + employee_documents upload/verify), Organization (Brands
  read-only — Company Admin has no `brand:create/update/delete` — plus Departments/Designations
  CRUD, tabbed), Shifts & Rosters (CRUD + roster create/assign, tabbed), Approvals (Leave/OD/
  Regularization/Comp-Off, tabbed, approve/reject). New Company Admin API modules
  (`src/api/companyAdmin/*.ts`) deliberately omit `companyId` from every call — unlike the Super
  Admin portal's `api/tenancy.ts`, which must pass one explicitly since Super Admin has no company
  of its own, a Company Admin's JWT always carries their own `companyId` and the backend resolves
  it automatically via `resolveCompanyScope`/`requireCompanyScope`. Added three small UI kit
  primitives the Super Admin portal never needed (`Table`, `Pagination`, `Tabs`) since Super Admin
  uses an expand-on-click card tree rather than filterable list pages. Every mutating action is
  gated by `hasPermission()` against the real seeded RBAC codes.
- ✅ ESS (Employee Self-Service) portal live at `/ess`: Dashboard (composed client-side from
  `*_own`-scoped endpoints — there's no `/dashboard/summary` for Employees, that route is
  `company:read`-gated), My Attendance (history + raise `attendance_regularization` for a date),
  My Leave (balances, apply, cancel-own), My OD (apply, cancel-own), My Comp-Off (view own
  credits; "consuming" one is just applying leave against the `CO` leave type — the backend
  auto-picks the oldest approved unexpired credit, there's no separate consume call), My Profile
  (read-only — no self-service edit, matches HR-only profile changes). New
  `src/api/ess/*.ts` modules follow the Company Admin convention (no `employeeId`/`companyId`
  params — resolved server-side from the JWT). Three backend gaps found and fixed while wiring
  this up (`Backend/src/seeders/20260710090200-seed-ess-followup-permissions.js` plus two small
  code changes, all additive — no already-applied seeder files were edited):
  (1) Employee never had `leave_type:read`, needed for the apply-leave dropdown — granted the
  existing permission to the Employee role. (2) There was no `comp_off:read_own` at all, so
  Employees couldn't see their own comp-off credits — added the permission and wired
  `compOff.routes.js`/`compOff.controller.js` with the same `requireReadAccess`
  own-scope-fallback pattern already used by `leaveBalance.routes.js`/`leaveRequest.routes.js`/etc.
  (3) `employee.service.js::getEmployeeForRead` (`GET /employees/:id`) now eager-loads
  brand/department/designation/manager (id + display name only) — Employees have no
  `brand:read`/`department:read`/`designation:read` to resolve those names client-side the way
  Company Admin's `EmployeesPage` does, so My Profile needs them pre-joined. Additive change,
  doesn't affect existing Company Admin consumers of the same endpoint.
- ✅ Brand-optional operation (2026-07-09): `companies.uses_brands` (boolean, default true,
  migration `20260709120000`) lets a company operate directly at the Company level instead of
  through Brands. `employees.brand_id` (migration `20260709120100`),
  `qr_attendance_terminals.brand_id` (migration `20260709120300`) are now nullable.
  `shift_rosters` gained a direct `company_id` column (migration `20260709120200`, backfilled
  from `brands.company_id` for all pre-existing rows) — it previously had no `company_id` of its
  own and derived tenancy solely by joining `brand_id → brands.company_id`, which can't work for a
  brand-less roster; every tenant-scope check in `shiftRoster.service.js` now filters on
  `company_id` directly instead of joining Brand. Design resolutions:
  - **Mode is fixed at company creation**, not inferred from brand count — chosen explicitly in
    the Super Admin "Add Company" wizard (`CreateCompanyModal.tsx`) and persisted so it survives
    even if a Brand-mode company's brands are all later deleted. `brand.service.js::createBrand`
    rejects (400) if the target company has `uses_brands = false`.
  - **`employee.service.js::createEmployee`** now cross-validates `brandId` presence against
    `company.usesBrands` (400 either way it disagrees) instead of always requiring it.
  - **Roster-mandatory gate** (`employee.service.js::createEmployee`) branches: Brand-mode checks
    `ShiftRoster.count({ brandId })` (unchanged); direct-mode checks
    `ShiftRoster.count({ companyId, brandId: null })`.
  - **QR attendance terminals** (`qrTerminal.service.js`, `attendance.service.js::checkIn`) also
    made brand-optional in the same pass, not deferred — a direct-mode company with no working
    terminal path would have no attendance mechanism at all (CLAUDE.md rule 6 is QR-only, no
    fallback punch). A terminal with `brand_id` set only serves that Brand's employees; a
    terminal with `brand_id` null serves every employee in the company regardless of brand.
  - **`employee.service.js::transferEmployee`** now distinguishes `brandId: undefined` ("not
    touching brand") from `brandId: null` ("un-assign from Brand, move to company level") —
    previously any falsy `brandId` was silently ignored, so "un-assign" had no code path.
  - **`employee.controller.js::list` gained a `companyId` query param** (via
    `resolveCompanyScope`, Super-Admin-overridable like the rest of the tenancy modules) — a
    brandId filter used to be sufficient to scope a Super Admin's employee list to one company
    (brand ids are globally unique), but a direct-mode company's employees have no brandId to
    filter by, so this was a real gap, not just a nice-to-have.
  - **`GET /auth/me` gained `companyUsesBrands: boolean | null`** (null only for Super Admin, who
    has no company of their own) — the Company Admin frontend needs this to decide whether to
    show Brand pickers at all; inferring it from an empty Brand list can't distinguish "this
    company never uses Brands" from "Super Admin hasn't added one yet".
  - **Frontend**: `BrandCard.tsx` (Super Admin) now accepts `brand: Brand | null` — a single
    component renders both a Brand's roster/employee panel and a direct-mode company's
    company-level panel, since the underlying logic (create roster, create employee, list both)
    is identical; `CompanyCard.tsx` branches on `company.usesBrands` to render either the Brands
    list + "Add Brand" or one `BrandCard` with `brand={null}`. Company Admin's
    `RosterFormModal.tsx`/`EmployeeFormModal.tsx`/`EmployeeDetailModal.tsx` read
    `user.companyUsesBrands` from `useAuth()` and hide the Brand `<Select>` entirely for a
    direct-mode company rather than leaving it present-but-disabled.
  - Migrations were written and syntax-verified but **could not be applied** from this
    environment — no network route to the Supabase pooler host (`getaddrinfo EAI_AGAIN`). Run
    `npx sequelize-cli db:migrate` from a machine with connectivity before relying on this in dev.
- ✅ Group Admin (`/group-admin`) and Brand Admin (`/brand-admin`) portals live (2026-07-11), plus a
  Brand invite-first-admin step that previously didn't exist. Design resolutions:
  - **`POST /auth/signup-invite-brand`** (`auth.service.js::inviteBrandAdmin`) mirrors
    `inviteGroupAdmin`, but — unlike a Group Admin, who is platform-level (`company_id NULL`) — a
    Brand Admin's `User`/`UserRole` rows get `companyId = brand.companyId`. A Group Admin's
    `company_id` is null on both their JWT and their `UserRole` row so they still match; a Brand
    Admin's `company_id` must be real or `rbac.middleware.js`'s `UserRole` lookup (scoped to
    `req.auth.companyId`) would never match post-login. `CreateBrandModal.tsx` now uses the same
    3-step form/invite/done pattern as `CreateGroupModal.tsx`/`CreateCompanyModal.tsx` instead of
    creating a Brand with no invite step.
  - **`brandId`/`groupId` are not on the JWT** (`auth.middleware.js`'s `requireAuth` only signs
    `companyId`/`groupId`/`employeeId` — `brandId` was never added). The Brand Admin frontend reads
    its own `brandId` off `GET /auth/me`'s `roles[].brandId` and passes it as an explicit query
    param on every call (dashboard, employees, rosters, approvals) — same pattern the Super Admin
    portal already used for `CompanyCard`/`BrandCard`. `AuthRole` gained a `groupId` field to match
    (the backend already returned it; the TS interface just hadn't caught up).
  - **Found and fixed a real cross-tenant leak while wiring the Group Admin drill-in**: the
    `leave_request`/`od_request`/`attendance_regularization`/`comp_off` list routes' custom
    `requireReadAccess` gate called `userHasPermission(req.auth, code)` with no `brandId`, so it
    granted access regardless of which `brandId` a caller's query string named — a Brand Admin
    could read a *sibling* Brand's approvals just by editing the query param, since the actual
    data-scoping brandId filter (added in this same pass, service-level) was reachable before the
    permission check would have blocked it. Fixed by passing `brandId` into `userHasPermission`
    (mirrors `rbac.middleware.js`'s `requirePermission`), so a grant that's scoped to one specific
    `brand_id` (not brand-wide `NULL`) now 403s on any other brandId. Same shape of gap existed for
    Group Admin's `companyId` override (`resolveCompanyScope`'s override path never checked group
    membership) — fixed with a new `assertCompanyInCallerGroup` helper
    (`resolveCompanyScope.js`), applied to `employee.controller.js::list` and all four approval
    list controllers. Both gaps were verified closed with a live cross-tenant test (see below).
  - **`dashboard.service.js::getDashboardSummary`** gained an optional `brandId` filter (new
    `GET /dashboard/brand-summary`, brandId required as a query param, `brand:read`-gated so the
    permission check itself rejects a mismatched brand) and a sibling `getGroupDashboardSummary`
    (new `GET /dashboard/group-summary`, no params — a Group Admin's own `groupId` is read
    server-side from the JWT, unlike brandId). Also added `pendingCompOffCredits` to the shared
    summary shape (was missing entirely before, needed for Brand Admin's dashboard tiles).
  - **RBAC gaps found while building the Brand Admin dashboard** (Shifts/Rosters/Approvals, per its
    spec): Brand Admin had `attendance_regularization`/`od_request`/`leave_request`/`comp_off`
    approve+reject but not `comp_off:read` (could decide a credit it couldn't list — same shape of
    gap `20260709110000` already fixed for Company Admin/HR Manager), no `shift:read` (could
    approve a regularization referencing a Shift it couldn't see), and only `shift_roster:read`
    (dashboard spec says "Rosters (create/edit)"). Group Admin was missing `comp_off:read` too, for
    its read-only company drill-in. Fixed in a new seeder,
    `20260711100000-seed-group-brand-admin-portal-permissions.js` — no new permission codes needed,
    all four already existed from earlier phases.
  - **Employees stayed read-only for Brand Admin** (no `employee:create`/`update`/`transfer` grant
    added) — the dashboard spec's "view/manage" wasn't explicit about employee creation, and
    CLAUDE.md's tenancy rule ("Group Admin / Company Admin cannot self-serve creation of the tier
    below them") plus the existing precedent (only Company Admin/HR Manager hold `employee:create`
    today) argued against expanding it without an explicit ask — flag this if a future spec wants
    Brand Admin to onboard employees directly.
  - **Shifts stayed read-only for Brand Admin** too — only `shift_roster:create/update` was added,
    not `shift:create/update/delete`. Shift *definitions* remain a Company-level decision (Company
    Admin/HR Manager only); the "(create/edit)" in the dashboard spec was read as applying to
    Rosters specifically, matching the existing Shift-vs-Roster ownership split noted throughout
    Phase-3.
  - **`ApprovalsPage.tsx`** (Company Admin's) gained an optional `extraParams?: { companyId?,
    brandId? }` prop merged into every list call, so it's reused as-is by both `/brand-admin`
    (passes its own `brandId`) and the Group Admin company drill-in modal (passes the selected
    `companyId`) — approve/reject buttons still show or hide purely via `hasPermission()`, so no
    read-only flag was needed for Group Admin's case.
  - Verified end-to-end against Supabase with a live cross-tenant API script (no browser automation
    tool was available in this environment, so the UI itself wasn't click-driven — `tsc`/`eslint`/
    `vite build` all passed clean, and every network call the new pages make was exercised
    directly): created a Group → Company → two Brands, invited+activated a Brand Admin per Brand
    and a Group Admin, confirmed `GET /auth/me` returns the right role/scope/permissions for each,
    and confirmed a Brand Admin is 403'd from the sibling Brand's dashboard/rosters/employees/leave
    requests, and a Group Admin is 403'd from a second Group's company/employees/leave requests.
    Test data was cleaned from Supabase afterward via direct model `.destroy()` calls (soft
    delete), matching the "test data cleaned" convention from earlier phases.
- ✅ Redis restricted to QR attendance only (2026-07-11). Audit (grepped every
  `require('.../config/redis')` and read Bull 4.16.5's own source, `node_modules/bull/lib/queue.js`)
  confirmed the suspicion that Bull's idle polling — not the QR flow, which hadn't been exercised
  live — was the dominant Redis consumer: each `Queue.process()`'d queue re-arms
  `updateDelayTimer` (a Lua `EVALSHA` round trip) on a `min(time-to-next-job, guardInterval)`
  timer, `guardInterval` defaulting to 5000ms, and separately runs `moveUnlockedJobsToWait` on a
  30000ms `setInterval` — both fire forever regardless of whether any job is due. With 2 queues
  (`leave-accrual`, `comp-off-expiry`) that's ~40,000+ Redis round trips/day from two jobs that run
  once a month and once a day respectively. Confirmed live: Upstash was already returning
  `ERR max requests limit exceeded (500000)` on every connection attempt by the time this was
  investigated. Fix: `src/config/queue.js` and the `bull` dependency removed entirely (nothing else
  imported it — verified by grep before deleting); `src/server.js`'s `startLeaveJobs` now uses
  plain `node-cron` (`cron.schedule('0 0 1 * *', ...)` / `cron.schedule('0 0 * * *', ...)`) calling
  the *same* `runLeaveAccrual`/`sweepExpiredCompOff` functions in `src/jobs/` — that logic itself is
  untouched (`git diff --stat src/jobs/` confirmed zero changes), only the scheduling mechanism
  changed. `grep -rl "config/redis" src/` now returns exactly three files, all under
  `src/modules/attendance/`: `attendance.service.js`, `employeeDevice.service.js`,
  `qrTerminal.service.js` — the QR replay-guard and WebAuthn challenge storage in the check-in/
  check-out/device-registration path, nothing else.
  **⚠️ Stale even before the 2026-08-03 face-recognition change**: a later, undocumented
  office-kiosk feature (2026-07-27) added a 4th Redis-using file
  (`officeKiosk.service.js`) that this count never accounted for. Post-2026-08-03, both
  `employeeDevice.service.js` and `qrTerminal.service.js` are deleted entirely (WebAuthn/QR
  terminal retired) and `officeKiosk.service.js` no longer touches Redis either (its
  office-token/SSE-ticket logic was removed along with the QR/phone check-in step) — the
  accurate current file list is `attendance.service.js` doesn't even use Redis directly
  anymore either; see the dated entry near the end of this log for the real, current list
  (`faceCache.js`, `faceAttendance.service.js`).
- ✅ Brand Admin employee ESS invite (2026-07-11): Brand Admin's Employees page gained a detail
  modal (`src/pages/brand-admin/components/EmployeeDetailModal.tsx`) with the same "Employee
  Self-Service Access" invite capability as Company Admin's `EmployeeDetailModal.tsx` — deliberately
  trimmed to just that section (no edit-details/transfer forms), since Brand Admin holds no
  `employee:update`/`employee:transfer` grant. New seeder
  `20260711120000-seed-brand-admin-invite-permission.js` grants `user:invite` to Brand Admin (it
  had none before, so the invite endpoint was previously unreachable for this role).
  **Found and fixed a real cross-brand gap while wiring this up**: `auth.service.js::inviteEmployeeUser`
  only ever scoped its target-employee lookup by `companyId`, never `brandId` — granting Brand Admin
  bare `user:invite` without any other change would have let them invite *any* employee in the
  company, not just their own brand's, since `rbac.middleware.js`'s `userHasPermission` only checks
  `brandId` when the request actually supplies one. Fixed by threading an optional `brandId` through
  `POST /auth/signup-invite-employee` → `authController.signupInviteEmployee` →
  `authService.inviteEmployeeUser`, which now 403s if the target employee's own `brandId` doesn't
  match — defense-in-depth on top of the RBAC middleware check, which independently blocks a
  spoofed `brandId` in the request body since a Brand Admin's grant is stored scoped to their own
  `brand_id`, not brand-wide `NULL`. `api/companyAdmin/employees.ts`'s `inviteEmployeeUser()` gained
  an optional third `brandId` param (Company Admin's own call site never passes it — company-wide
  scope is unaffected). Verified live: Brand Admin A can invite their own brand's employee: 201;
  cannot invite a sibling brand's employee even when sending their own `brandId` (service-level
  block): 403; cannot invite by spoofing the sibling brand's `brandId` (RBAC middleware block): 403;
  Company Admin's existing invite flow (no `brandId` sent) is unaffected: 201. Test data cleaned
  from Supabase afterward.
- ✅ Brand Admin "full power" parity with Company Admin (2026-07-13): Brand Admin now
  holds create/update/delete on Employees, Shifts, Departments, and Designations — matching
  Company Admin's grant exactly for these four domains (Shift Roster and Holiday already got
  this in `20260711100000-seed-group-brand-admin-portal-permissions.js` and
  `20260712100000-seed-brand-admin-holiday-permissions.js`). New seeder:
  `20260713100000-seed-brand-admin-full-power-permissions.js`.
  - **Department/Designation/Shift have no `brand_id` column** (company-level entities, no
    brand dimension anywhere in the schema) — granting these codes gives Brand Admin the same
    company-wide reach Company Admin already has over them, no additional scoping needed.
  - **Employee does carry a `brand_id`**, so this is the one domain that needed real
    brand-scoping work rather than a bare permission grant, mirroring the existing
    `holiday.service.js`/`shiftRoster.service.js` pattern:
    `employee.service.js::getEmployeeForWrite` now takes `scopedBrandIds` and 404s (not 403 —
    avoids leaking existence to a Brand Admin probing ids outside their brand) when the target
    employee's own `brandId` isn't one of the caller's; `updateEmployee`/`transferEmployee`/
    `deleteEmployee` all thread it through. `transferEmployee` additionally rejects outright
    (403) any attempt to change `brandId` at all (including `null`/un-assign) for a
    brand-scoped caller — a Brand Admin can transfer an employee's Department freely but can't
    move them to a sibling Brand or out to company-level. `employee.controller.js::create`
    requires `brandId` explicitly when `req.auth.scopedBrandIds` is set (same "omitted brandId
    must not silently fall through" fix already applied to shift_roster create).
  - **Frontend**: `brand-admin/EmployeesPage.tsx` was rewritten to reuse Company Admin's
    `EmployeeFormModal`/`EmployeeDetailModal` directly (passing `brands={[ownBrand]}` — same
    trick `ShiftsRostersPage.tsx` already used for `RosterFormModal`) instead of the old
    trimmed read-only modal, which is now deleted (`brand-admin/components/EmployeeDetailModal.tsx`).
    `brand-admin/ShiftsRostersPage.tsx` gained the same Add/Edit/Delete Shift UI Company Admin's
    page has, reusing `company-admin/components/ShiftFormModal.tsx`. A new
    `/brand-admin/organization` route reuses `company-admin/OrganizationPage.tsx` as-is (same
    reuse-the-whole-page approach already used for `/brand-admin/holidays`), with a new
    "Organization" nav entry in `BRAND_ADMIN_NAV`.
  - Verified end-to-end against Supabase with a live cross-brand script (create Company with
    two Brands, invite+activate a Brand Admin for Brand A): Brand Admin creates a Department/
    Designation/Shift/own-Brand Employee successfully; is blocked (403) creating an Employee
    directly in Brand B; is blocked (403) transferring their own Brand A employee to Brand B;
    is blocked (404) updating a Brand B employee by id. `tsc --noEmit` and `eslint` both pass
    clean on the touched frontend files.
- ✅ Real activation emails via Gmail SMTP (2026-07-13): `src/utils/mailer.js` (new,
  `nodemailer`-based) sends the actual activation link by email instead of only returning it in
  the API response. Config is entirely env-driven — `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/
  `SMTP_USER`/`SMTP_PASS`/`MAIL_FROM_NAME`/`MAIL_FROM_EMAIL` in `.env` (gitignored, never
  committed) — no credentials hardcoded anywhere. `buildActivationUrl` reuses the existing
  `WEBAUTHN_ORIGIN` env var (already the frontend's own origin) rather than adding a redundant
  second "frontend URL" var. Wired into all four invite endpoints in `auth.controller.js`
  (`signupInvite`, `signupInviteGroup`, `signupInviteBrand`, `signupInviteEmployee`) via a
  `trySendActivationEmail` wrapper — best-effort, logged-not-thrown (same convention as comp-off
  auto-detection/HR Team role sync), so a transient SMTP failure never blocks the invite itself
  (the User/Invitation rows are already committed by then). The dev-only `activationToken` in
  the JSON response (`!isProd()`) is intentionally kept as a local-testing fallback if SMTP is
  unreachable — it still never appears in production. Verified live: sent a real email through
  the configured Gmail account end-to-end using the actual `sendActivationEmail` function.
- ✅ Forgot-password + change-password (2026-07-13): the `password_resets` table (scaffolded
  since Phase-1, previously unused) is now wired up end to end.
  - **`POST /auth/forgot-password`** (public) always returns the same generic message regardless
    of whether the email matches an account (standard anti-enumeration practice) — never lets a
    caller distinguish "no such account" from "reset email sent". When a match is found,
    `auth.service.js::requestPasswordReset` invalidates any previous unused reset row for that
    user (only the newest link is ever valid), creates a new one with a 10-minute expiry
    (`minutesFromNow(10)` in `src/utils/tokens.js`), and a real email goes out via
    `mailer.js::sendPasswordResetEmail` (same best-effort, logged-not-thrown convention as the
    activation emails). The raw token is echoed in the response outside production only, as the
    same local-testing fallback the invite endpoints already use.
  - **`POST /auth/reset-password`** (public) validates the token's hash, expiry, and single-use
    (`usedAt`) status, updates the password, and — since a forgot-password request implies the
    account owner may have lost control of their credentials — revokes every outstanding refresh
    token for that user, forcing a re-login on all other devices/sessions.
  - **`POST /auth/change-password`** (any authenticated user, no permission code — this isn't a
    resource-scoped RBAC action) verifies the current password before setting a new one. Existing
    sessions are deliberately left alone here (unlike reset-password) since the caller already
    proved they hold the current password.
  - Password strength (≥8 chars, letter + number) is validated both client-side
    (`Frontend/src/utils/passwordStrength.ts`, shared by `ActivatePage`, `ResetPasswordPage`, and
    `ChangePasswordCard` — `ActivatePage` no longer has its own copy) and server-side
    (`auth.controller.js::validatePasswordStrength`).
  - **Frontend**: `LoginPage.tsx` gained a "Forgot password?" link and a `resetSuccess` banner
    (same pattern as the existing `activated` banner). New public pages
    `pages/auth/ForgotPasswordPage.tsx` and `pages/auth/ResetPasswordPage.tsx` (the latter mirrors
    `ActivatePage.tsx`'s structure). New shared `components/ChangePasswordCard.tsx` is mounted on
    a "Settings" page in **every** portal — Super Admin's previously-disabled Settings nav item is
    now live, Group Admin/Brand Admin/ESS each gained a new Settings nav entry + page (just the
    password card), and Company Admin's existing `SettingsPage.tsx` (company profile) gained the
    card alongside it.
  - No rate-limiting middleware exists yet on `forgot-password` (no `express-rate-limit` or
    similar dependency in this repo) — the generic-response anti-enumeration protection is in
    place, but repeated requests aren't throttled. Worth adding before this leaves local dev.
  - Verified live end-to-end: unknown email gets the generic response with no token leaked; known
    email gets a token (dev-only) and a real email; weak passwords rejected; reset token is
    single-use and expires; old password stops working and the new one works immediately;
    change-password rejects a wrong current password and succeeds with the right one.
- ✅ Manager-based leave approval (2026-07-13): a "manager" isn't a distinct RBAC role in this
  system — it's just any Employee referenced by another employee's `managerId`
  (`employees.manager_id`, self-referencing FK). That relationship previously had zero bearing on
  leave approval; only Company Admin/Brand Admin/HR Manager (company/brand-wide
  `leave_request:approve`/`reject`) could decide any leave request. New seeder
  `20260713110000-seed-manager-leave-approval-permissions.js` adds `leave_request:read_reports`,
  `approve_reports`, `reject_reports` — granted broadly to the **Employee** role, same shape as
  `employee:read_own` (most employees have zero direct reports and the grant is a no-op for them;
  the actual scoping happens per-request, not by who holds the code).
  - **`leaveRequest.routes.js`**: `requireDecisionAccess(action)` (replaces the plain
    `requirePermission('leave_request:approve'/'reject')`) first checks the company/brand-wide
    code (unchanged for Company Admin/Brand Admin/HR Manager — this is purely additive for them);
    only if that fails does it check `..._reports` + load the target request's own
    `employee.managerId` and compare against the caller's `employeeId` — never trusts a
    client-supplied manager claim. `requireReadAccess` gained an explicit `?scope=reports` opt-in
    (query param, not a default) that resolves the caller's direct reports
    (`src/utils/managerScope.js::getDirectReportEmployeeIds`, company-scoped only — a manager and
    their report can even be in different Brands, since `employees.manager_id` has no brand
    constraint) and filters the list to those employees. Deliberately opt-in rather than merged
    into the default scope, so the existing ESS "My Leave" page (`leave_request:read_own`, no
    scope param) is completely unaffected.
  - **`leaveRequest.service.js::listLeaveRequests`** now accepts `employeeId` as an array
    (`Op.in`) for the reports-scope case — unlike the existing `brandId` array handling in the
    same function (which intentionally skips the filter entirely when empty, since that shape
    can't occur there), an empty reports array here must still filter to zero rows, not fall
    through to "all requests".
  - **Frontend**: new `pages/ess/TeamApprovalsPage.tsx` (leave-only, not the full 4-tab
    `ApprovalsPage` — OD/regularization/comp-off have no manager-scoping wired up, only what was
    asked for) at a new `/ess/team-approvals` route, always shown in `ESS_NAV` (the permission is
    granted to every Employee, so gating the nav item on it wouldn't hide it for non-managers
    anyway — it just renders empty via `EmptyStateCard` for them). Reuses
    `api/companyAdmin/approvals.ts`'s `listLeaveRequests`/`approveLeaveRequest`/
    `rejectLeaveRequest` (already generic, no portal-specific coupling) with a new
    `scope: 'reports'` param.
  - Not extended to OD requests, attendance regularizations, or comp-off approvals — the user's
    ask was specifically about leave; those three have the identical shape and could get the same
    treatment on request.
  - Verified live end-to-end: a report's leave request is invisible to an unrelated employee
    (`scope=reports` list and a direct approve attempt both correctly rejected/empty) but visible
    to and approvable by their actual manager; the report's own default `leave_request:read_own`
    view is unaffected and shows the request as approved afterward.
- ✅ Manager-based OD approval (2026-07-13): extended the same manager-approval treatment to OD
  requests. New seeder `20260713120000-seed-manager-od-approval-permissions.js` adds
  `od_request:read_reports`/`approve_reports`/`reject_reports`, granted to the Employee role —
  identical shape to `leave_request:*_reports`. `odRequest.routes.js` gained the same
  `requireDecisionAccess(action)` middleware (checks the plain company/brand-wide code first,
  unaffected for Company Admin/Brand Admin/HR Manager; falls back to loading the target request's
  `employee.managerId` and comparing against the caller's own `employeeId`) and the same
  `?scope=reports` opt-in on `requireReadAccess` (never the default — `MyOdPage.tsx`'s plain
  `GET /attendance/od-requests` is unaffected). `odRequest.service.js::listOdRequests` gained the
  same array-`employeeId` (`Op.in`) support as `leaveRequest.service.js`.
  - **Frontend**: `pages/ess/TeamApprovalsPage.tsx` (previously leave-only) is now tabbed
    (Leave Requests / OD Requests), mirroring `company-admin/ApprovalsPage.tsx`'s shape —
    same `ActionButtons` component, same `scope: 'reports'` param threaded through the already-
    generic `api/companyAdmin/approvals.ts` list/approve/reject functions. Attendance
    regularizations and comp-off still have no manager-scoping (not asked for) — only Leave and OD
    are tabs here.
  - Verified live end-to-end, same shape as the leave test: an unrelated employee can't see or
    approve a report's OD request; the actual manager can see it (`scope=reports`) and approve it;
    the report's own default view is unaffected; and — the key regression check — Company Admin's
    pre-existing company-wide OD approval still works on an unrelated request, confirming this
    change is purely additive for HR/Admin roles.
- ✅ Per-employee "powers" — delegated admin capabilities (2026-07-14): Company Admin/HR
  Manager/Brand Admin (anyone holding `employee:update`) can now optionally multi-select a
  curated catalog of extra capabilities for one specific Employee, independent of their base
  role — fully optional, editable any time, and deliberately does not touch the existing
  manager-based (`employees.manager_id`) leave/OD approval built in a prior session. Catalog
  (`Backend/src/config/powerCatalog.js`, exposed via `GET /powers`):
  1. **Add/Edit/Delete Yearly Holidays** — `holiday:create/update/delete`
  2. **Assign Leaves** — `leave_balance:read`, `leave_balance:adjust`
  3. **Add/Edit/Delete Company Policy** — a brand-new module (title + rich text body + optional
     file URL, company-wide, `company_policies` table/`CompanyPolicy` model, mirrors the
     Holiday module 1:1 minus brand scoping) — `company_policy:create/update/delete`
  4. **Approve Leave/OD Requests** — company-wide (broader than the existing direct-reports-only
     manager scope) — `leave_request:read/approve/reject`, `od_request:read/approve/reject`
  - **Mechanism**: reuses an extension point that already existed in the schema but was
    completely unused — `roles.company_id` (nullable) + `roles.is_system` support non-system,
    company-scoped custom roles, but no code exercised this before now (`role:create/read/
    update/delete/assign` permission codes were seeded but dead). New `employees.custom_role_id`
    (nullable FK → roles) points at a dedicated, auto-created-on-first-assignment Role per
    employee (`employee.service.js::assignEmployeePowers`, gated on `employee:update` — no new
    gate permission, per the user's explicit "all admins have right to assign that power").
    Assigning replaces that Role's `role_permissions` wholesale (**hard**-deleted via
    `RolePermission.destroy({ force: true })` first — this table is `paranoid: true` but never
    actually soft-deleted anywhere else in the app; a normal `.destroy()` would leave a dead row
    occupying the `(role_id, permission_id)` composite PK, silently no-op'ing a later re-grant of
    the same power — confirmed as a real bug via the live toggle-off/toggle-on test below before
    the `force: true` fix). Because the entire rest of the permission-resolution stack
    (`auth.service.js::getCurrentUser`, `rbac.middleware.js`) already unions permissions across
    *every* `UserRole` row a user holds, **zero changes were needed there** — this is purely a
    new Role + a second `UserRole` grant alongside the base "Employee" role's existing one.
  - **Grant timing mirrors `hrTeamSync.js`'s established convention exactly**: the actual
    `UserRole` row is only created once the employee has both a linked ESS login (`userId` set)
    and reaches activation — `auth.service.js::activateAccount` calls the new
    `customPowerSync.js::ensureCustomRoleGrant` (best-effort, logged-not-thrown, right alongside
    the existing `syncHrTeamRole` call), covering "powers assigned before any invite exists."
    `assignEmployeePowers` calls the same idempotent helper for the "already active, powers
    changed later" case. Verified live: assigning powers to an employee *before* they're ever
    invited correctly and retroactively grants the `UserRole` at activation time.
  - **The one necessary change to existing behavior**: once an Employee can hold company-wide
    `leave_request:read` (via the `approve_requests` power) *in addition to* their base role's
    `read_own`, `leaveRequest.routes.js`/`odRequest.routes.js`'s `requireReadAccess` would have
    let the blanket grant silently win by default, breaking that employee's own "My Leave"/"My
    OD" page (`GET .../requests`, no `scope` param) by returning *everyone's* requests instead of
    just theirs. Fixed by reordering both middlewares so `*_read_own` wins by default when held,
    with a new explicit `?scope=company` opt-in (parallel to the existing `?scope=reports`) that
    the Team Approvals page sends when it auto-detects the caller holds the plain company-wide
    code rather than the reports-only variant. Confirmed via the actual seed data that Company
    Admin/HR Manager/Brand Admin/Group Admin never hold `*_read_own`, so this reorder is provably
    a no-op for every pre-existing caller — verified live (Company Admin's own default list call
    unaffected) alongside the critical regression assertion (an employee holding the company-wide
    power still sees only their own request via the default, no-scope call).
  - **Frontend**: new `components/PowerAssignment.tsx` (checkbox list from `GET /powers`, single
    source of truth so labels never drift from the backend catalog) wired into both
    `EmployeeFormModal.tsx` (optional, at creation — a separate, non-blocking `PUT
    /employees/:id/powers` call after the employee itself is created) and a new "Powers" tab in
    `EmployeeDetailModal.tsx` (editable any time; pre-checks currently-granted keys by fetching
    the full employee record, since the list-view `employee` prop doesn't eager-load
    `customRole`). `TeamApprovalsPage.tsx` (ESS) auto-detects `scope=company` vs `scope=reports`
    per tab based on which permission variant the caller actually holds — same "Team Approvals"
    nav entry serves both a manager and a company-wide power-holder transparently, no new nav
    item. New `EssDashboard.tsx` section, "Your Additional Responsibilities", lists whichever
    catalog entries the caller's `permissions` array satisfies in full. New `CompanyPoliciesPage.tsx`
    (mirrors `HolidaysPage.tsx`) reused across Company Admin/Brand Admin/ESS nav + a new
    "Company Policies" tab on Group Admin's `CompanyDetailPage.tsx` (same `extraParams`
    company-override pattern as its existing Approvals tab).
  - Verified live end-to-end (34 assertions): zero-powers baseline fully blocked on all four
    capabilities; granting two powers makes exactly those two work and nothing else, with "My
    Leave" unaffected; adding the company-wide approve power lets the employee approve *any*
    other employee's leave/OD while their own default list stays own-only; the untouched
    manager-approval path (E2/E3's `manager_id` relationship) keeps working exactly as before,
    completely unaffected; Company Admin's own company-wide list is unaffected; a power assigned
    before an employee is ever invited is retroactively granted at activation; toggling a power
    off then back on works cleanly (the hard-delete fix); an unknown power key is rejected (400).
- 🐛 Fixed (2026-07-14): the `assign_leaves` power bundle only granted `leave_balance:read`/
  `adjust` — missed that the "Provide Leaves" page (`ProvideLeavesPage.tsx`) also needs
  `employee:read`/`department:read`/`brand:read` to browse and filter the employee list to pick
  who to assign a balance to (Company Admin/HR Manager never noticed this gap since they already
  hold those broadly as part of their role). Surfaced as "Could not load employees." for an
  Employee granted only this one power. Fixed in `powerCatalog.js` (bundle now includes all five
  codes) plus a one-off repair script run against the dev DB to add the three missing codes to
  any custom Role that already had the old, narrower grant (detected by the old
  `leave_balance:read`+`adjust` signature, not a "fully satisfies the current bundle" check — the
  latter can't detect an under-provisioned old grant once the bundle itself has grown, confirmed
  live when the first repair attempt updated 0 roles). Verified live against the actual reported
  account (`lala1@gmail.com`): `GET /employees` and `GET /departments` now both return 200.
- ✅ Approval history + mandatory rejection reasons (2026-07-16): every approve/reject decision
  on a leave request, OD request, attendance regularization, or comp-off credit is now recorded
  to a new immutable `approval_histories` table (migration `20260716090000`,
  `src/models/approvalHistory.js`), independent of the mutable `status`/`approver_id` columns on
  the request row itself — CLAUDE.md rule 5 ("Audit everything sensitive"). This session picked
  up the work mid-flight after a local machine reset interrupted it: the model, migration,
  `recordApprovalDecision`/`listApprovalHistory` helpers (`src/utils/approvalHistory.js`), the
  `approver_user_id`/`rejection_reason` columns (migration `20260716090100`), and the
  mandatory-reason validation in all four `rejectX` service functions were already written and
  syntactically sound but had never been migrated onto the dev DB, and — the actual gap — nothing
  ever read the history back (`listApprovalHistory` was defined but uncalled from any
  controller/route) and the frontend's reject buttons were passing only an `id` to
  `rejectLeaveRequest(id, reason)`-shaped API functions that require a `reason` string second
  argument, which fails `tsc -p tsconfig.app.json` outright (the root `tsconfig.json`'s
  `files: []` + project-references shape means a plain `npx tsc --noEmit` silently checks
  nothing — worth remembering next time a "no errors" result here looks suspicious).
  - **`approver_user_id`** (all four tables) is the reliable "who decided this" identity — a User
    always exists for any authenticated caller, unlike the pre-existing `approver_id` (Employee
    FK), which is null for a Company/Brand/Group Admin with no Employee record of their own.
  - **New `GET .../:id/history` endpoint per module** (`leave/requests`, `attendance/od-requests`,
    `attendance/regularizations`, `leave/comp-off`) — controller-driven (no new route middleware),
    mirroring `list`'s own `resolveCompanyScope`+`assertCompanyInCallerGroup` pattern so a Group
    Admin's read-only company drill-in can reach it too. Access is checked against the *actual*
    loaded record (company/brand-wide `:read`, the caller's own record via `:read_own`, or — for
    leave/OD only, which are the two domains with manager scoping — the record's own
    `employee.managerId` via `:read_reports`), not trusted query params. `attendanceRegularization`
    and `compOff` needed new `getRegularizationById`/`getCompOffCreditById` lookups alongside the
    existing `getXForDecision` helpers, since those already-existing helpers throw 409 on an
    already-decided record — exactly the case history-viewing needs most.
  - **Frontend**: new shared `components/RejectReasonModal.tsx` (mandatory free-text reason,
    replaces the old `window.confirm()` reject flow that never collected one) and
    `components/ApprovalHistoryModal.tsx` (renders the `approval_histories` timeline: action,
    actor, reason, timestamp) are used from both `company-admin/ApprovalsPage.tsx` (also reused
    as-is by Brand Admin and Group Admin's read-only company drill-in) and `ess/TeamApprovalsPage.tsx`.
    A new always-visible "History" icon sits next to Approve/Reject in every row's actions column
    (previously that column only rendered anything for `status === 'pending'` rows — approved/
    rejected rows had no actions at all). `Badge` gained an optional `title` prop so a rejected
    row's status badge shows its rejection reason on hover without a dedicated table column.
  - Verified live end-to-end: a direct-service test (create → approve → create → reject-with-empty-
    reason [blocked, 400] → reject-with-reason) confirmed both the request row's `rejection_reason`
    and a matching `approval_histories` row are written correctly; a second HTTP-level test against
    the running dev server confirmed the new history endpoint's permission gating — company-wide
    `:read`, the record owner's `:read_own`, and the record's actual manager's `:read_reports` all
    get 200, while an unrelated employee (no grant) and an unrelated employee's own `:read_own`
    against someone else's request both correctly get 403. `tsc -p tsconfig.app.json --noEmit`,
    `eslint`, and `vite build` all pass clean on the touched frontend files. Test fixtures were
    hard-deleted from Supabase afterward.
- ✅ In-app notifications (2026-07-16): new `notifications` table (migration `20260716120000`,
  `src/models/notification.js`) + a `src/utils/notifications.js` pair of best-effort helpers —
  `notifyUser` (one specific recipient) and `notifyApprovers` (fans out to every user holding a
  given `resource:approve` code, company-wide or scoped to a specific brand, via the same
  UserRole→Role→Permission join shape as `rbac.middleware.js`'s `getBrandScope`) — wired into all
  four approve/reject/submit paths (leave, OD, attendance regularization, comp-off):
  - **On decision** (approve/reject): the submitting employee is notified, if they have an ESS
    login (`employee.userId` set) — title states the outcome, body carries the rejection reason
    when rejected. Comp-off has no employee-initiated "submit" (credits are auto-created by
    `checkAndCreateCompOffCredit`), so only its decision side notifies the employee.
  - **On submission**: the employee's direct manager (via `employee.managerId` → that Employee's
    own `userId`, leave/OD only — regularization and comp-off have no manager-decision path) and
    every company/brand-wide `:approve` holder are notified. `excludeUserId` on `notifyApprovers`
    keeps a submitter who also holds the company-wide approve power (see the per-employee
    "powers" feature above) from notifying themselves about their own submission.
  - Every `getXForDecision`/`getXById` employee `include` across all four services gained a
    `userId` attribute (previously omitted) since decision-time notification needs it to resolve
    the recipient.
  - **New portal-agnostic `GET/PATCH /notifications*` endpoints** (`src/modules/notifications/`,
    mounted at `/notifications` — no RBAC permission code, same shape as `/auth/me` or `/powers`:
    every authenticated user manages only their own notifications, scoped by `user_id` in every
    query; `company_id` scoping comes for free from the tenant-scope hook, same as every other
    tenant-scoped model): `GET /` (paginated list), `GET /unread-count`, `PATCH /:id/read`,
    `PATCH /read-all`.
  - **Frontend**: new `components/NotificationBell.tsx`, mounted once in the shared, portal-
    agnostic `Topbar.tsx` — covers every portal (Super Admin, Group Admin, Company Admin, Brand
    Admin, ESS) from a single insertion point. Polls `/notifications/unread-count` every 30s (no
    websocket/push infra in this stack — Redis is restricted to QR attendance only, see above);
    the badge uses Tailwind's built-in `animate-ping` for a persistent attention pulse whenever
    unread count > 0, per the explicit ask for a "blink to get attention" effect. Clicking the
    bell opens a dropdown (click-outside-to-close) listing recent notifications with an unread
    dot + relative timestamp; clicking one marks it read optimistically, "Mark all read" clears
    the badge. New portal-agnostic `api/notifications.ts` (same convention as the existing
    `api/powers.ts`).
  - Verified live: a direct-service test confirmed manager + company-wide approver both get a
    notification on leave submission while the submitter does not self-notify, and the employee
    gets notified on both approve and reject (reason in the body for reject); a second run
    confirmed the same submit/decide notification pairs for OD, attendance regularization
    (approver-only on submit, no manager path), and comp-off (system-triggered credit creation
    notifies approvers; decision notifies the employee) — 8/8 assertions passed. HTTP-level checks
    on the read endpoints confirmed unread-count, list, mark-one-read, and mark-all-read all work
    correctly and are properly isolated per user (one user's mark-all-read never touches another
    user's unread count). **Incident during testing**: an early cleanup script's
    `db.LeaveRequest.destroy({ where: {}, force: true })` — an unscoped `where` clause, meant to
    be scoped to the test's own employee ids — hard-deleted every row in the live dev `leave_requests`
    table. Confirmed with the user this was disposable dummy data and no recovery was needed;
    flagged here as a reminder that `force: true` bypasses `paranoid` soft-deletes entirely, so an
    unscoped `where` on a destroy call is unrecoverable through the app. `tsc -p tsconfig.app.json
    --noEmit`, `eslint`, and `vite build` all pass clean.
- ✅ Notification follow-up round (2026-07-16): three additions on top of the same day's initial
  notification system, per explicit follow-up ask.
  - **Coverage extended beyond submit/approve/reject** to the other two status transitions that
    exist in these four workflows: **cancel** (`leaveRequest.service.js::cancelLeaveRequest`,
    `odRequest.service.js::cancelOdRequest` — notifies the manager + company/brand-wide approvers,
    same recipients as the original submission notification, new `type: 'request_cancelled'`) and
    **comp-off expiry** (`compOffExpiry.job.js::sweepExpiredCompOff`, the daily cron — rewritten
    from a single bulk `UPDATE` to a per-row loop with the owning Employee joined in, since
    notifying the credit's employee needs `employee.userId`; new `type: 'request_expired'`).
    Attendance regularization and comp-off credits have no cancel path in the API today, so this
    is the complete set of state transitions across all four workflows. Broader coverage (e.g.
    employee profile changes, new holidays/company policies) was flagged as available on request
    but not built — this round stayed scoped to the approval-lifecycle domain already in place.
  - **Notifications are now clickable and always land on fresh data**: `NotificationBell.tsx`
    resolves a target route per notification (`resolveTargetPath`) — a decision/expiry
    notification always routes to the recipient's own ESS page (`/ess/leave`, `/ess/od`,
    `/ess/attendance?tab=requests`, `/ess/comp-off`) regardless of which portal they're currently
    in, since that's always where an Employee's own requests live; a pending/cancelled
    notification routes into whichever portal's approvals view the recipient actually has,
    resolved via `roleRedirect.ts`'s `getDefaultRoute(user.roles)` (not the current URL — more
    reliable if the bell is clicked from a shared page like Settings). `ApprovalsPage.tsx`,
    `TeamApprovalsPage.tsx`, and `MyAttendancePage.tsx` all gained an initial-tab read from a new
    `?tab=` query param so the deep link lands on the right tab, not always the first one. Since
    React Router doesn't remount a page just because `navigate()` was called to the same
    pathname+search it's already on, the click handler compares the resolved target against
    `useLocation()` and falls back to `window.location.reload()` in that one case — guarantees the
    page always shows the just-changed data, whether that means a fresh SPA mount (normal case) or
    a full reload (already-there case), per the explicit "make sure it rerenders" ask.
  - **Unread/read styling** now uses the project's actual brand-blue tokens more assertively:
    unread rows get a solid `bg-primary-light` fill (previously further diluted to `/40`, which
    made it barely visible) plus a 3px `border-l-primary` accent; read rows are plain `bg-card`
    with no tint. `AppNotification.type` gained the two new values.
  - Verified live: a direct-service test confirmed leave and OD cancellation both notify the
    manager and the company-wide approver (`type: 'request_cancelled'`); confirmed
    `sweepExpiredCompOff` correctly flips a past-expiry approved credit to `expired` and sends the
    owning employee a `request_expired` notification with the credit's earned date. `tsc -p
    tsconfig.app.json --noEmit`, `eslint`, and `vite build` all pass clean. Test fixtures were
    hard-deleted from Supabase afterward, correctly scoped this time (verified via a company-count
    check before/after) — distinct from unrelated notification rows already present in the DB from
    the user's own manual testing of the feature, which were left untouched.
- ✅ Phase-5 v1 — Payroll (2026-07-17): new `src/modules/payroll/` module, 8 tables/models
  (`payroll_settings`, `salary_component_definitions`, `employee_salary_structures`,
  `employee_salary_components`, `payroll_runs`, `payslips`, `payslip_components`,
  `payroll_adjustments`, migrations `20260717090000`–`20260717091200`), 20 new `payroll_*`
  permission codes, a `run_payroll` delegable power (`powerCatalog.js`), and a Company Admin
  "Payroll" portal page (5 tabs: Settings/Components/Structures/Adjustments/Runs) plus an ESS
  "My Payslips" page — the nav entry for Payroll already existed as a disabled placeholder from
  an earlier session and just needed activating.
  - **Extensibility mechanism, per explicit ask** ("design so PF/ESI/PT/TDS, reimbursements,
    loans, advances, arrears, incentives, formula components, and other country rules can be
    added later without major schema changes"): salary is a company-defined *catalog* of
    components (`salary_component_definitions`, same shape as `leave_types`), each with
    `component_category` (`earning`/`deduction`/`reimbursement`, reimbursement unused in v1) and
    `calculation_type` (`fixed_amount`/`percentage_of_component`/`formula`, formula unused/
    rejected in v1 — the column exists so it becomes valid later with zero schema change). An
    employee's structure (`employee_salary_structures`, versioned — a revision supersedes the
    prior one rather than mutating it, `effective_from`/`effective_to`, partial unique index
    enforcing one `status='active'` row per employee — **first use of a partial unique index in
    this codebase**) **snapshots** each line's `calculation_type`/`value`/`resolved_amount` at
    assignment time (`employee_salary_components`), and each processed run snapshots them *again*
    into `payslip_components` (`category`/`name` also copied, `component_definition_id` nullable
    with `ON DELETE SET NULL`) — this double-snapshot is what guarantees a historical payslip
    never retroactively changes if the catalog or an employee's structure is edited later.
    `payroll_settings.enable_statutory_deductions` (bool) + `statutory_config` (JSONB, empty by
    default) exist as the per-company toggle/config seam for future PF/ESI/PT/TDS, unused in v1.
    `payroll_adjustments` (ad-hoc bonus/deduction, `component_definition_id` optionally
    categorizes it against the catalog) is the seam for future loans/advances/arrears — no new
    table needed, just new `type` values or catalog entries.
  - **Multi-level percentage chains are fully supported**, not limited to one level (e.g. a
    component that's a percentage of HRA, which is itself a percentage of Basic) —
    `salaryStructure.service.js::resolveComponentAmounts` topologically sorts a structure's
    components by their `percentage_of_component_id` dependency (Kahn's algorithm) before
    resolving `resolved_amount` in dependency order, and rejects (400) any cycle (A % of B, B %
    of A, directly or transitively) or any percentage reference to a component not included in
    the same structure being assigned.
  - **Segment-based proration** (`payrollRun.service.js::processRun`) handles a new joiner's
    first partial month and a mid-period raise correctly — an employee's structures overlapping
    the run's pay period each contribute their own clipped date range. **A real proration bug was
    caught and fixed during the verification pass, before it ever reached production**: the
    initial implementation divided each segment's payable days by *that segment's own* working
    days, which — hand-calculated against the smoke test before trusting it — would have paid a
    new joiner present for all 16 working days of their first half-month a **full month's** pay
    (16/16 = 1.0) instead of the correct ~53% of a month (16/30), and would have double-counted a
    flat deduction (e.g. PT) across both segments of a mid-month raise. Fixed: the proration
    denominator (`periodWorkingDays`) is now the same shared value — working days across the
    *whole* run period — for every segment, while each segment's own working/payable days are
    still used separately, only for the payslip's *displayed* `workingDays`/`lopDays` (so a new
    joiner correctly shows zero LOP for days before they existed under any structure, even though
    their pay is correctly a fraction of a full month). Flat (deduction/reimbursement) components
    are taken from only the *current* segment's structure, not summed across segments.
  - **Audit trail reuses `approval_histories`, no new table**: `request_type` gained a
    `'payroll_run'` value and `action` gained `'processed'`/`'paid'` (alongside the existing
    `'approved'`/`'rejected'`) via `ALTER TYPE ... ADD VALUE IF NOT EXISTS` migrations — **first
    use of this pattern in the codebase**; confirmed safe as a standalone migration since this
    repo's migrations aren't transaction-wrapped and the new value is only ever consumed by later
    application code in a separate DB session. `notifications.request_type` needed its own,
    separate `ALTER TYPE` — despite identical values today it's a distinct Postgres enum type
    from `approval_histories.request_type` (confirmed by reading both `CREATE TABLE` migrations).
  - **RBAC**: Company Admin/HR Manager hold all 19 write/read codes; every Employee gets
    `payslip:read_own` only; Brand Admin/Group Admin get nothing beyond that in v1 (payroll runs
    are company-wide only, per explicit requirement) — flagged with an inline seeder comment as a
    deliberate exclusion, not a gap, open to revisit if either portal needs read-only visibility
    later.
  - Verified end-to-end with a direct-service smoke test against dev Supabase (36/36 assertions):
    a 3-level percentage chain (Basic → HRA 40% → Special Allowance 10% of HRA) resolved
    correctly; a deliberately cyclic definition was rejected (400); a full-month employee with a
    present/half-day/paid-leave/unpaid-leave/absent mix plus a bonus and a deduction adjustment
    matched hand-calculated gross/deductions/net exactly; a new joiner's and a mid-month raise's
    payslips matched the corrected segment math (confirmed materially different from the
    naive-wrong full-month answer); draft→processed→paid guards all rejected out-of-order/repeat
    transitions; editing the catalog/a structure after a payslip existed left that payslip's
    snapshotted values untouched; a plain Employee role was confirmed to lack
    `payroll_run:process` while holding `payslip:read_own`; two `ApprovalHistory` rows
    (`processed`, `paid`) were written with the right actor/timestamps. HTTP-level pass against
    the running dev server confirmed every `/payroll/*` route requires auth (401) and the router
    is mounted correctly (an unknown sub-path 404s rather than matching everything). `tsc -p
    tsconfig.app.json --noEmit`, `eslint`, and `vite build` all pass clean. Test fixtures
    (company, employees, structures, components, runs, payslips, users) were hard-deleted from
    Supabase afterward, scoped tightly by the test company's id; a first test run that crashed
    mid-script (before an `actorUserId` fix) left one orphan company behind, caught by an
    explicit orphan-row check and cleaned up separately.
  - Not built in v1 (deliberately, per explicit scope): PF/ESI/PT/TDS calculation logic, formula-
    based components, a payslip PDF export (detail view is in-app HTML only), and any automatic/
    cron-triggered draft-run creation (runs are admin-initiated only — auto-creating a real-money
    payroll run without a human trigger was judged too risky to do silently).
- ✅ Statutory payroll deductions — PF + ESI + PT (2026-07-20): the `payroll_settings.
  enable_statutory_deductions`/`statutory_config` placeholders from Phase-5 v1 (previous entry)
  are now real. **TDS deliberately deferred** — unlike PF/ESI/PT, it needs tax-regime selection,
  investment declarations, and annualized projection; a "simplified" version would be silently
  wrong for real tax withholding, which is worse than not having it.
  - New `employees.work_state` (nullable, free text — not an ENUM) for Professional Tax slab
    lookup; no employee identity/location field existed anywhere in the schema before this.
    New `salary_component_definitions.is_pf_wage` marks which of a company's own earning
    components (Basic, DA) count toward the PF wage basis — components are an arbitrary
    company-defined catalog, so there was no other way to know "which one is Basic".
  - **Rates/ceilings/PT slabs are company-editable**, not hardcoded: new
    `Backend/src/config/statutoryDefaults.js` exports `DEFAULT_STATUTORY_CONFIG` (current-law PF
    12%/12%/₹15,000 ceiling, ESI 0.75%/3.25%/₹21,000 threshold, PT slabs for Karnataka/
    Maharashtra/West Bengal/Tamil Nadu + a `default` catch-all) and `resolveStatutoryConfig()`,
    which shallow-merges a company's `statutory_config` JSONB on top of the defaults — every
    existing company (still `{}`) gets working defaults with zero backfill.
  - New pure `statutoryDeduction.service.js::computeStatutoryDeductions` (no DB access) does the
    actual PF/ESI/PT math. Wired into `payrollRun.service.js::processRun` additively: a
    `pfWageAmount` running total is accumulated alongside the *existing* per-segment earning loop
    (untouched — this proration engine had a real, carefully-fixed bug in Phase-5 v1 and stayed
    off-limits here), and statutory entries are injected into the same `componentTotals` map
    *after* `grossEarnings` is computed, using the same synthetic-string-key pattern
    `payroll_adjustment` entries already established. If `enableStatutoryDeductions` is false
    (every company's default today), none of this runs — output is byte-identical to before this
    feature existed, confirmed as the primary regression check.
  - **Employer-side contributions** (PF 12%, ESI 3.25% — no employer-side PT exists in India) are
    computed and stored too, informational only: a new `payslip_components.category` enum value
    `'employer_contribution'` (via the same standalone `ALTER TYPE ... ADD VALUE` pattern
    Phase-5 v1 already established) rides the *existing* `PayslipComponent.bulkCreate` call for
    free — the existing gross/deduction filters only match `earning`/`reimbursement`/`deduction`,
    so this category is naturally excluded from `netPay` math with zero changes to that logic.
    New `payslips.employer_contributions` and `payroll_runs.total_employer_contributions` rollup
    columns.
  - RBAC: no new permission codes — reused the existing `payroll_settings:update` (statutory
    config), `salary_component:create/update` (`is_pf_wage`), and `employee:create/update`
    (`work_state`) grants.
  - **Frontend**: `PayrollSettingsForm.tsx`'s "reserved, not yet calculated" copy is now a real
    editable panel (PF/ESI rate/ceiling/threshold fields; PT is enabled/disabled only — full
    slab-table editing is out of scope, flagged as a follow-up alongside TDS). New
    `utils/indianStates.ts` backs a "Work State" select on both `EmployeeFormModal.tsx` (create)
    and `EmployeeDetailModal.tsx` (edit) — **caught a real bug before it shipped**: the initial
    PT slab keys (`TamilNadu`, `WestBengal`) didn't match the human-readable dropdown values
    (`Tamil Nadu`, `West Bengal`), which would have silently fallen back to the `default` slab for
    every employee in those two states with zero error — fixed by changing the config keys to the
    spaced form to match. `SalaryComponentFormModal.tsx` gained an `is_pf_wage` checkbox (earning
    components only). `PayslipDetailModal.tsx`/`PayrollRunDetailModal.tsx` show employer
    contributions in a clearly-separate, informational section/column.
  - Verified live against Supabase (34/34 assertions): the false→true regression guard: PF
    ceiling capping correctly (₹20,000 Basic capped to ₹15,000 basis) vs. not hit (₹10,000 basic);
    ESI threshold correctly excluding a ₹28,000-gross employee and including a ₹10,000-gross one;
    two different states' PT slabs (Karnataka flat ₹200, Maharashtra's ₹175 bracket); employer
    contributions correctly excluded from `netPay` at both the payslip and run-total level; the
    `is_pf_wage`-on-a-deduction-component rejection (400) at both create and update; an
    unrecognized work state falling back to the `default` PT slab. `tsc -p tsconfig.app.json
    --noEmit`, `eslint`, and `vite build` all pass clean. Migrations applied cleanly to dev
    Supabase. Test fixtures hard-deleted afterward; one orphan company from a script crash mid-run
    (an `ApprovalHistory.actorUserId` NOT NULL violation in the test script itself, not product
    code) was caught by an explicit orphan-row check and cleaned up separately.
- ✅ TDS — New Tax Regime only (2026-07-30): closes the TDS gap explicitly deferred in the PF/ESI/PT
  entry above. Scoped to **New Regime only** (explicit user choice) — no investment declarations
  (80C/80D/HRA), no `dateOfBirth`/other Employee fields, no new tables, no new permission codes.
  Standard **annualized-projection** method (same as greytHR/Zoho Payroll): each run projects the
  employee's full-year taxable salary from this-FY-YTD-actual + current-month-rate, computes
  annual tax under new-regime slabs + 4% cess + §87A rebate, subtracts tax already deducted this
  FY, and spreads the remainder over the FY's remaining months (April–March).
  - **`salary_component_definitions.taxable`** (seeded since Phase-5's statutory-deductions pass
    but never wired to anything — confirmed by grep before starting) is the taxable-income basis:
    TDS excludes any earning/reimbursement component marked `taxable: false`. Found and fixed a
    real gap while wiring this up — `salaryComponent.service.js::createComponent`/the controller
    never accepted `taxable` at all (no way to ever set it false), and `SalaryComponentFormModal.tsx`
    had no checkbox for it, despite the frontend `SalaryComponentDefinition` type already declaring
    the field. Added a `taxable` checkbox (earning/reimbursement categories only, default checked)
    to the create form, matching the existing `isPfWage` checkbox pattern exactly — editing stays
    creation-only, same precedent `isPfWage` already set.
  - New `payslip_components.taxable` column (migration `20260730090000`) snapshots the flag per row
    at processing time — same double-snapshot principle as `calculation_type`/`resolved_amount` —
    so a later edit to a component's `taxable` flag can never retroactively change a historical
    payslip's year-to-date reconstruction.
  - New `Backend/src/utils/financialYear.js` (April–March FY helpers) and
    `Backend/src/modules/payroll/tdsCalculation.service.js` (pure `computeTds`, no DB access, same
    convention as `statutoryDeduction.service.js`). `statutoryDefaults.js` gained a `tds` section
    (current-law new-regime slabs/standard-deduction/cess/§87A) alongside `pf`/`esi`/`pt`, merged
    via `resolveStatutoryConfig` the same shallow-plus-one-level-deeper way as `pt.slabs`.
  - **`payrollRun.service.js::processRun`** batch-fetches YTD taxable-gross and YTD-TDS-already-
    deducted once per run (not per employee, to avoid N+1 across a run with many employees), then
    injects a `statutory-tds` deduction entry into the same `componentTotals` map PF/ESI/PT already
    use — zero changes to `netPay`/`Payslip.create` math, zero payslip-UI changes needed
    (`PayslipDetailModal.tsx` already renders any `category: 'deduction'` row generically).
  - **Caught and fixed a real correctness bug before it shipped**: the first draft of the
    "prior runs in this FY" filter (`isBeforeInFinancialYear`) was a pure chronological
    comparator — it would have pulled a **previous** financial year's payslips into a new FY's
    YTD-TDS reconstruction (silently understating tax at the start of every new FY, the exact
    class of bug this feature was built to avoid). Fixed by requiring both same-FY-membership
    AND chronological order. Verified live with a dedicated regression scenario: processed a
    March-2031 run (FY2030-31) then jumped straight to an April-2032 run (FY2032-33, skipping the
    whole of FY2031-32) — confirmed April 2032's TDS came out identical to a fresh first-month
    calculation, not deflated by the skipped FY's data.
  - Verified live end-to-end against dev Supabase (15/15 assertions): a 3-component structure
    (Basic + 40%-of-Basic HRA + a non-taxable reimbursement) produced the hand-calculated monthly
    TDS exactly across three consecutive months with zero drift (sum of 3 months' TDS matched the
    annual tax figure exactly); a lower-salary employee whose projected annual taxable income fell
    under the ₹7L §87A threshold owed zero TDS; the FY-rollover regression above; disabling
    `tds.enabled` while `pf`/`esi`/`pt` stayed enabled produced byte-identical PF/ESI/PT output and
    no TDS row (existing companies, where `enableStatutoryDeductions` still defaults `false`, are
    completely unaffected by construction — this was the primary safety check). `tsc -p
    tsconfig.app.json --noEmit`, `eslint`, and `vite build` all pass clean. Migration applied
    cleanly to dev Supabase. Test fixtures (company, employees, structures, a dedicated actor User
    for `ApprovalHistory.actorUserId`, runs, payslips) hard-deleted afterward, scoped to the test
    company/group id.
  - Not built (deliberately, per explicit scope): Old Tax Regime (80C/80D/HRA declarations),
    other-income declarations, arrears relief (§89), multiple-employer/previous-employer income
    aggregation, Form 16/Form 24Q filing exports, an editable TDS slab table in the UI (code-default
    only, same precedent as PT's slabs). All flagged as follow-ups, not gaps introduced silently.
- ✅ Face-recognition kiosk attendance replaces QR + WebAuthn (2026-08-03): the QR-terminal
  (secretKey-based) flow and the undocumented office-kiosk QR+phone+WebAuthn flow (built
  2026-07-27, never logged here before now — see the superseded notes earlier in this log)
  are both fully deleted. A kiosk (Scanner-role `User`, admin-provisioned email/password
  account — unchanged) now identifies employees directly via its own camera, no employee
  phone/QR/WebAuthn step at all. Uses `face-api.js` (pure JS/TensorFlow.js, no Python
  service) — chosen specifically to stay inside this project's Node/Express-only stack
  rather than adding a second language/runtime.
  - **Employee self-registration**: ESS Settings gained a "Face ID" tab
    (`components/RegisterFaceCard.tsx`, replacing the deleted `DeviceRegistrationCard.tsx`)
    — captures 3 angle photos (front/left/right) via `getUserMedia`, extracts 128-d
    descriptors client-side with face-api.js, checks the 3 angles are mutually consistent
    (Euclidean distance) before submitting to `POST /attendance/face-profile`. New table
    `employee_face_profiles` (`company_id`, `employee_id`, one JSONB embedding column per
    angle, partial unique index on `employee_id WHERE status='active'` — same pattern as
    `employee_salary_structures`'s active-row index).
  - **Kiosk check-in/out**: `pages/kiosk/KioskPage.tsx` fully rewritten — live camera
    preview + Check-In/Check-Out buttons (no more QR display or SSE video-trigger). On tap,
    picks a random liveness challenge (blink / turn-left / turn-right), samples face
    landmarks across a ~2.5s frame burst (eye-aspect-ratio for blink, a coarse jaw/nose
    geometric proxy for yaw), extracts a final descriptor, and calls
    `POST /attendance/face-checkin` with the embedding + numeric liveness frames — the
    backend re-validates liveness from the raw numbers itself
    (`faceAttendance.service.js::validateLiveness`), never trusting a client-asserted
    "challenge passed" boolean. An audit capture clip still uploads immediately after a
    successful match (reusing the existing GCS pipeline, `officeKiosk.service.js::uploadFaceCapture`,
    renamed from `uploadOfficeVideo`) — no SSE/pub-sub needed anymore since the kiosk
    already has the `attendance.id` straight from the check-in response, unlike the old
    flow which needed a remote push to learn it.
  - **Matching**: `faceAttendance.service.js::checkInWithFace` 1:N-matches the kiosk's
    captured embedding against a Redis-cached, per-company set of registered employee
    embeddings (`faceCache.js`, reusing the existing `config/redis.js`/`memoryRedis.js`
    abstraction — `REDIS_URL=memory` for local dev, real Upstash in production, zero code
    branching either way) via nearest-neighbor Euclidean distance, with both a distance
    threshold and an ambiguity margin (rejects if the runner-up candidate is nearly as
    close as the best match, rather than guessing between similar-looking people).
  - **The one function every check-in mechanism has always shared,
    `attendance.service.js::applyAttendancePunch`, is completely untouched** beyond taking
    a new `source: 'face'` value — payroll (`payrollRun.service.js`), comp-off
    auto-detection, leave, and regularizations all still read only `status`+`date` off the
    `attendance` table and are provably unaffected by this change.
  - **Deleted entirely** (no fallback kept, per explicit decision): `qrTerminal.*`,
    `employeeDevice.*`, `utils/qrToken.js`, `utils/webauthn.js`, `utils/officeToken.js`,
    `config/redisSubscriber.js`, `jobs/pendingAttendanceExpiry.job.js`, the
    `qr_attendance_terminals`/`employee_devices`/`pending_attendances` tables, and
    `attendance.device_id`/`terminal_id`/`qr_token_jti` columns (lossy for historical
    rows' forensic device/terminal linkage — `videoObjectPathCheckin/Checkout` remains the
    retained audit trail). `pending_attendances` specifically isn't replaced by a trimmed
    version: it existed only to bridge the old flow's two-network-round-trip gap (QR scan
    by phone, time passes, WebAuthn confirm); the new flow is one continuous client-side
    operation ending in exactly one request that fully succeeds or fully fails, so there's
    no "started but never finished" state left to persist.
  - **RBAC**: new codes `face_profile:register`/`face_profile:read_own` (Employee),
    `attendance:face_verify` (Scanner) — seeded in
    `20260803110000-seed-face-recognition-permissions.js`, which also hard-deletes the
    `role_permissions` rows for the now-dead `attendance:kiosk_token`,
    `attendance:kiosk_video`, `employee_device:register/revoke`, `qr_terminal:create/read`,
    and `attendance:mark` codes (their routes are all gone) — same
    hard-delete-the-join-row-only reasoning as `employee.service.js::assignEmployeePowers`'s
    established precedent, so a future re-grant of the same code composite PK is never
    silently blocked. The `permissions` rows themselves are left in place, dormant.
  - **Current accurate Redis-usage file list** (correcting the stale 2026-07-11 count
    above): exactly one file, `src/modules/attendance/faceCache.js` — nothing else in the
    codebase touches `config/redis` (`faceAttendance.service.js` calls into `faceCache.js`
    rather than importing Redis directly).
  - Not built (deliberately, per explicit scope discussion): dedicated presentation-attack
    (screen/photo texture) detection or a commercial liveness SDK — this build's liveness
    check (random blink/turn challenge + frame-to-frame motion variance) stops a printed
    photo or a photo shown on a second screen, but does **not** stop a pre-recorded video
    of the actual person performing the exact requested challenge. This is a known,
    explicitly discussed and accepted limitation, not an oversight — closing it would need
    a dedicated anti-spoofing model or a commercial liveness API, out of scope for this
    pass.
- ⏳ Next: Phase-6+ — Recruitment (ATS) → Performance → Exit → Billing/Subscription → Platform &
  System (see build order below), or Old Tax Regime as a follow-up to the TDS work above.

### Known gotcha — tenant-scope hook + system-level rows
`tenant-scope.js` auto-filters queries by `company_id` whenever a tenant context is active.
If code running under a normal (non-null) tenant context tries to look up a system-level row
(`company_id IS NULL`, e.g. a system role), the hook silently filters it to zero results instead
of erroring. Only known-safe today because Super Admin's own context is always null. Any new
code that needs to read system-level rows from within a scoped request must bypass the hook
deliberately (not just rely on context being null) — flag this explicitly when building
Organization Structure and later modules.

## Build order (phases)
1. **Tenancy & Access Control** — groups, companies, users, roles, permissions,
   role_permissions, user_roles, refresh_tokens, password_resets, invitations
2. **Organization Structure** — brands, departments, designations, employees,
   employee_documents
3. **Attendance & Time** — shifts, employee_shifts, attendance,
   attendance_regularizations, employee_devices, qr_attendance_terminals,
   shift_rosters, od_requests
4. **Leave** — leave_types, leave_policies, leave_balances, leave_requests,
   comp_off_credits, holidays
5. Payroll → Recruitment (ATS) → Performance → Exit → Billing/Subscription →
   Platform & System (audit_logs, notifications, feature_flags, settings)

Full field-level schema for phases 1–2 is in `docs/PHASE1_MODELS.md`.

## Conventions (match existing Tech Prizm projects)
- Node.js + Express, port 5000 for backend dev
- Sequelize migrations + models, `paranoid: true`
- JWT + RBAC middleware pipeline
- React (Vite) + TypeScript on frontend, React Router for routing, Tailwind CSS v4 for styling
  (superseded the original "SCSS modules, not Tailwind" call — Tailwind was chosen instead when
  the design system was built, see Progress log)
- Complete files over diffs when generating code

## Suggested folder layout
```
backend/
  src/
    config/          # db, redis, env
    models/          # Sequelize models
    migrations/
    middleware/       # auth, rbac, tenant-scope
    modules/          # one folder per domain: tenancy, org, attendance, leave...
      <domain>/
        <domain>.controller.js
        <domain>.service.js
        <domain>.routes.js
    routes/           # aggregates module routes
    app.js
    server.js
frontend/
  src/
    portals/
      super-admin/
      company-admin/
      ess/
    components/
    routes/           # React Router config
    api/              # axios clients per module
    App.tsx
    main.tsx
```