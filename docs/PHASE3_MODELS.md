# Phase 3 — Models Spec (Domain 3: Attendance & Time)

Source: HRMS_System_Design_fnf.docx, section 6.4. Build after Phase-1 (Tenancy/RBAC) and
Phase-2 (Org Structure) — this domain depends on `companies`, `brands`, and `employees`.
All tables: `id` PK, `created_at`, `updated_at`, `deleted_at` (paranoid) implied but not
repeated below.

---

## shifts
Shift definitions.
| Column | Type | Key | Notes |
|---|---|---|---|
| company_id | bigint | FK → companies.id | |
| name | varchar | | e.g. General |
| start_time / end_time | time | | Shift window |
| is_night_shift | boolean | | Crosses midnight |

## employee_shifts
Employee-to-shift assignment over time (the *default*, low-priority assignment).
| Column | Type | Key | Notes |
|---|---|---|---|
| employee_id | bigint | FK → employees.id | |
| shift_id | bigint | FK → shifts.id | |
| effective_from | date | | Assignment start |

## shift_rosters
Day-level shift roster — **overrides** `employee_shifts` for a specific date
(Morning/Day/Night scheduling). A Brand must have ≥1 roster before it can receive
its first employee (per CLAUDE.md's tenancy rule).
| Column | Type | Key | Notes |
|---|---|---|---|
| employee_id | bigint | FK → employees.id | |
| shift_id | bigint | FK → shifts.id | |
| brand_id | bigint | FK → brands.id | |
| roster_date | date | | The specific day this shift applies |
| status | enum | | draft \| published |
| published_by | bigint | FK → employees.id | Brand Admin / HR / Manager |

## qr_attendance_terminals
Company QR-generating machines used for attendance capture.
| Column | Type | Key | Notes |
|---|---|---|---|
| company_id | bigint | FK → companies.id | |
| brand_id | bigint | FK → brands.id | |
| terminal_code | varchar | | Physical machine identifier, e.g. GATE-01 |
| secret_key | varchar | | HMAC signing secret used to sign rotating tokens |
| rotation_seconds | int | | QR refresh interval (5–10s) |
| status | enum | | active \| inactive |

## employee_devices
Passkey-registered devices used to authorize QR check-in/out. No fallback attendance
method exists — a device must be registered here before an employee can check in.
| Column | Type | Key | Notes |
|---|---|---|---|
| employee_id | bigint | FK → employees.id | |
| device_fingerprint | varchar | | Client-generated device ID, bound at first login |
| credential_id | varchar | | WebAuthn passkey credential ID |
| public_key | text | | WebAuthn public key |
| registered_at | timestamp | | First-login passkey registration time |
| last_used_at | timestamp | | Last successful check-in/check-out |
| status | enum | | active \| revoked |

## attendance
Daily attendance records — the core write target of the check-in/out flow.
| Column | Type | Key | Notes |
|---|---|---|---|
| employee_id | bigint | FK → employees.id | |
| date | date | | Attendance date |
| check_in / check_out | timestamp | | Punches |
| source | enum | | qr \| od |
| device_id | bigint | FK → employee_devices.id | |
| terminal_id | bigint | FK → qr_attendance_terminals.id | |
| qr_token_jti | varchar | | JWT ID of the scanned QR token — replay check key |
| status | enum | | present \| absent \| half_day \| leave \| holiday \| weekoff \| on_duty |
| overtime_minutes | int | | Computed OT |

## attendance_regularizations
Requests to correct attendance.
| Column | Type | Key | Notes |
|---|---|---|---|
| attendance_id | bigint | FK → attendance.id | |
| employee_id | bigint | FK → employees.id | |
| requested_status | enum | | Desired status |
| reason | varchar | | Justification |
| approver_id | bigint | FK → employees.id | |
| status | enum | | pending \| approved \| rejected |

## od_requests
On-Duty requests — pre-approved offsite work; approval marks attendance without a QR scan.
| Column | Type | Key | Notes |
|---|---|---|---|
| employee_id | bigint | FK → employees.id | |
| from_date / to_date | date | | OD date range |
| purpose | varchar | | e.g. client visit, field work, offsite meeting |
| location | varchar | | Where the employee will be working from |
| status | enum | | pending \| approved \| rejected \| cancelled |
| approver_id | bigint | FK → employees.id | |

---

## QR + WebAuthn check-in/check-out flow (implementation notes)

1. **Device registration (one-time, at first login):** client generates a device
   fingerprint, browser/app performs WebAuthn `navigator.credentials.create()`,
   backend stores `credential_id` + `public_key` in `employee_devices` (status=active).
   No device registered → no check-in possible, no fallback path.
2. **Terminal emits rotating QR:** every `rotation_seconds` (5–10s), the terminal
   requests a new signed token from the backend: `{ terminalId, jti, iat, exp }`
   signed with `qr_attendance_terminals.secret_key` (HMAC) or a JWT. `jti` is a
   fresh UUID each rotation.
3. **Employee scans + WebAuthn assertion:** employee's app scans the QR, then
   performs `navigator.credentials.get()` against their registered passkey to
   prove device possession, then POSTs `{ qrToken, webauthnAssertion }`.
4. **Backend validates, in order:**
   - Verify QR token signature against the terminal's `secret_key` and check `exp`.
   - **Redis replay check:** `SET attendance:jti:<jti> EX <rotation_seconds> NX`
     — if `NX` fails (key exists), the token was already used → reject.
   - Verify WebAuthn assertion against the employee's stored `public_key`.
   - Confirm terminal's `company_id`/`brand_id` matches the employee's own.
   - Write/update the `attendance` row: first scan of the day → `check_in`;
     a later scan → `check_out` (logic must handle `is_night_shift` crossing
     midnight — look up the roster/shift by the *shift's* effective date, not
     calendar date, for night shifts).
5. **Any failure at any step → no attendance write.** Employee must file an
   `attendance_regularizations` request instead; there is intentionally no
   silent/manual fallback punch.

## Build order for this phase
`shifts` → `employee_shifts` → `qr_attendance_terminals` → `employee_devices` →
`shift_rosters` → `attendance` → `attendance_regularizations` → `od_requests`
(8 tables). No circular FKs expected in this domain — all reference already-existing
`companies`/`brands`/`employees` from Phase-1/2.

## Reminder — wire up the deferred check
`employee.service.js::createEmployee` has a commented-out roster-mandatory check
(a Brand needs ≥1 `shift_rosters` entry before it can receive its first employee).
Uncomment and implement it once `shift_rosters` exists.