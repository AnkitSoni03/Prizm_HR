# HRMS Platform — Project Context

## What this is
Multi-tenant, group-enabled HRMS SaaS. Used internally across Sri Sai Group
companies and sold externally. Full design reference: `docs/HRMS_System_Design_fnf.docx`
(Phase-1 schema: 58 tables across 10 functional domains).

## Tenancy hierarchy (fixed, non-recursive, 4 levels)
Super Admin → Group → Company → Brand → (Roster mandatory) → Department / Employees

- Only Super Admin creates Groups, Companies, Brands (and their first admin).
- Group Admin / Company Admin cannot self-serve creation of the tier below them.
- A Brand cannot receive its first employee until it has ≥1 Roster.
- Brand and Department are independent dimensions on `employees` (WHERE vs WHAT).

## Tech stack
| Layer      | Tech |
|------------|------|
| Backend    | Node.js + **Express only** (no NestJS) — modular services, multi-tenant middleware |
| ORM        | Sequelize — `paranoid: true` soft deletes everywhere |
| Database   | PostgreSQL — shared DB, `company_id` row isolation at ORM layer |
| Frontend   | **React (Vite SPA) — no Next.js** — separate portals: Super Admin, Company Admin, ESS |
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
6. **Attendance is QR-only.** No biometric/GPS/free-text punch. Flow:
   WebAuthn passkey check on device → scan rotating signed QR (JWT/HMAC,
   5–10s rotation) → backend validates signature + Redis replay check
   (`SET jti EX rotation_seconds NX`) → terminal company/brand match → write
   `attendance` row. Any failure → regularisation request, not a fallback punch.
7. **Roster > default shift.** `shift_rosters` (per employee per date) takes
   priority over `employee_shifts` when present.
8. **Company vs admin are separate records.** Onboarding a company creates a
   `companies` row + a `users` row (status=invited) + one-time activation link
   email. No plaintext passwords ever emailed.

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
- React (Vite) + TypeScript on frontend, React Router for routing, SCSS modules (not Tailwind)
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