# Phase 4 — Models Spec (Domain 4: Leave)

Source: HRMS_System_Design_fnf.docx, section 6.4. Build after Phase-1 (Tenancy/RBAC),
Phase-2 (Org Structure), and Phase-3 (Attendance & Time) — `comp_off_credits` depends on
`attendance`. All tables: `id` PK, `created_at`, `updated_at`, `deleted_at` (paranoid)
implied but not repeated below.

---

## leave_types
Company-defined leave categories.
| Column | Type | Key | Notes |
|---|---|---|---|
| company_id | bigint | FK → companies.id | |
| code | varchar | | CL \| SL \| EL \| CO (Comp-Off) \| LWP... |
| name | varchar | | Display name |
| is_paid | boolean | | Paid leave |
| carry_forward | boolean | | Carries to next year |

## leave_policies
Quota / accrual rules per leave type.
| Column | Type | Key | Notes |
|---|---|---|---|
| company_id | bigint | FK → companies.id | |
| leave_type_id | bigint | FK → leave_types.id | |
| annual_quota | numeric | | Days per year |
| accrual | enum | | yearly \| monthly |
| applicable_after_days | int | | Eligibility after joining |

## leave_balances
Running balance per employee / type / year.
| Column | Type | Key | Notes |
|---|---|---|---|
| employee_id | bigint | FK → employees.id | |
| leave_type_id | bigint | FK → leave_types.id | |
| year | int | UQ (with employee_id + leave_type_id) | |
| allotted | numeric | | Total for the year |
| used | numeric | | Consumed so far |
| balance | numeric | | Remaining (allotted − used) |

## leave_requests
Leave applications and their approval state.
| Column | Type | Key | Notes |
|---|---|---|---|
| employee_id | bigint | FK → employees.id | |
| leave_type_id | bigint | FK → leave_types.id | |
| from_date / to_date | date | | Range |
| days | numeric | | Working days (excl. weekoffs/holidays) |
| reason | varchar | | Justification |
| status | enum | | pending \| approved \| rejected \| cancelled |
| approver_id | bigint | FK → employees.id | |

## comp_off_credits
Comp-Off earned by working a holiday/weekoff; auto-detected from attendance, needs
manager approval before it can be used as leave.
| Column | Type | Key | Notes |
|---|---|---|---|
| employee_id | bigint | FK → employees.id | |
| source_attendance_id | bigint | FK → attendance.id | The holiday/weekoff day worked |
| earned_date | date | | The holiday/weekoff date actually worked |
| status | enum | | pending_approval \| approved \| rejected \| expired \| used |
| approver_id | bigint | FK → employees.id | |
| expiry_date | date | | Must be used by this date (company policy, default 90 days) |

## holidays
Holiday calendar (company or brand level).
| Column | Type | Key | Notes |
|---|---|---|---|
| company_id | bigint | FK → companies.id | |
| brand_id | bigint | FK → brands.id | NULL = applies to all brands in the company |
| date | date | | Holiday date |
| name | varchar | | e.g. Diwali |
| type | enum | | public \| optional |

---

## Workflow notes

### Leave application + approval
1. Employee applies via ESS: `POST /leave-requests` with `leave_type_id`, `from_date`,
   `to_date`, `reason`.
2. Backend computes `days` (working days only — exclude weekoffs per the employee's
   roster/shift and company `holidays`).
3. Check `leave_balances.balance` ≥ `days` for that employee/type/year — reject if
   insufficient, unless the leave type allows negative balance (LWP-style; check
   `leave_types.is_paid`).
4. Also check `leave_policies.applicable_after_days` — reject if employee's
   `date_of_joining` + that many days hasn't passed yet.
5. Manager (via `employees.manager_id` → their linked `user`) approves/rejects.
   On approval: decrement `leave_balances.used`/`balance`; on rejection/cancellation:
   no change.

### Comp-off auto-detection
Triggered from the attendance write path (Phase-3), not from a user action:
- When an `attendance` row is written with `status = present` (or `on_duty`) on a date
  that is a company/brand `holiday` **or** a weekoff per the employee's roster, auto-create
  a `comp_off_credits` row: `status = pending_approval`, `earned_date` = that attendance
  date, `expiry_date` = `earned_date + 90 days` (company-policy default — make configurable
  later, don't hardcode only in code without a setting).
- Manager approval flips `status` to `approved`; only then can it be consumed as leave
  (a comp-off consumption likely creates/links a `leave_requests` row with `leave_type_id`
  pointing at the company's `CO` leave type — confirm this join before hardcoding it).
- A background job (reuse the existing cron/Bull pattern from Sri Sai's approvals
  escalation cron) should flip stale `approved` credits past `expiry_date` to `expired`.

### Leave balance accrual
- `accrual = yearly`: full `annual_quota` credited to `leave_balances` at policy
  assignment / start of year.
- `accrual = monthly`: `annual_quota / 12` credited each month (cron job), pro-rated
  for employees joining mid-year based on `date_of_joining`.

### Holiday-aware working-day calculation
`leave_requests.days` and comp-off eligibility both depend on knowing which dates are
holidays/weekoffs — reuse one shared "is this a working day for this employee" utility
across both leave and comp-off logic rather than duplicating the calendar lookup.

## Build order for this phase
`leave_types` → `leave_policies` → `leave_balances` → `holidays` → `leave_requests` →
`comp_off_credits` (6 tables). `comp_off_credits.source_attendance_id` requires
Phase-3's `attendance` table to already exist (it does).