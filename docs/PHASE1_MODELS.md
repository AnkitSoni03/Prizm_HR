# Phase 1 — Models Spec (Domain 1: Tenancy & Access Control, Domain 2: Organization Structure)

Source: HRMS_System_Design_fnf.docx, section 6.4. Build these first — everything
else depends on them. All tables: `id` PK, `created_at`, `updated_at`, `deleted_at`
(paranoid) implied but not repeated below.

---

## Domain 1 — Tenancy & Access Control

### groups
Top-level tenant. Created only by Super Admin.
| Column | Type | Key | Notes |
|---|---|---|---|
| name | varchar | | Display name |
| status | enum | | active \| suspended |
| plan_id | bigint | FK → plans.id | Default plan for new Companies in this Group |
| created_by | bigint | FK → users.id | Super Admin who created it |

### companies
Belongs to exactly one Group. No self-nesting.
| Column | Type | Key | Notes |
|---|---|---|---|
| group_id | bigint | FK → groups.id | |
| name | varchar | | Display name |
| legal_name | varchar | | Registered legal entity name |
| gst_number | varchar | | |
| status | enum | | trial \| active \| grace \| suspended \| terminated |
| plan_id | bigint | FK → plans.id | |
| created_by | bigint | FK → users.id | |

### users
Login identities; may or may not link to an employee.
| Column | Type | Key | Notes |
|---|---|---|---|
| company_id | bigint | FK → companies.id | Tenant |
| employee_id | bigint | FK → employees.id | NULL for admin-only users |
| email | varchar | UQ (per company) | |
| password_hash | varchar | | Bcrypt/Argon2; NULL until activated |
| status | enum | | invited \| active \| disabled |
| invited_at | timestamp | | |
| activated_at | timestamp | | |
| is_active | boolean | | |
| two_fa_enabled | boolean | | |
| last_login_at | timestamp | | |

### roles
System roles or per-company custom roles.
| Column | Type | Key | Notes |
|---|---|---|---|
| company_id | bigint | FK → companies.id | NULL = system role |
| name | varchar | | e.g. Company Admin, HR |
| is_system | boolean | | Non-editable platform role |
| description | varchar | | Optional |

### permissions
Master list of `resource:action` codes.
| Column | Type | Key | Notes |
|---|---|---|---|
| code | varchar | UQ | e.g. employee:create |
| module | varchar | | hr, payroll, billing... |
| description | varchar | | |

### role_permissions (M2M)
| Column | Type | Key |
|---|---|---|
| role_id | bigint | FK/PK → roles.id |
| permission_id | bigint | FK/PK → permissions.id |

### user_roles
Assigns roles to users with a scope.
| Column | Type | Key | Notes |
|---|---|---|---|
| user_id | bigint | FK → users.id | |
| role_id | bigint | FK → roles.id | |
| company_id | bigint | FK | Scope company |
| brand_id | bigint | FK | Scope brand; NULL = all brands |

### refresh_tokens
| Column | Type | Key |
|---|---|---|
| user_id | bigint | FK → users.id |
| token_hash | varchar | |
| expires_at | timestamp | |
| revoked_at | timestamp | |

### password_resets
| Column | Type | Key |
|---|---|---|
| user_id | bigint | FK → users.id |
| token_hash | varchar | |
| expires_at | timestamp | |
| used_at | timestamp | |

### invitations
Admin/user invitations with one-time activation tokens.
| Column | Type | Key | Notes |
|---|---|---|---|
| company_id | bigint | FK → companies.id | |
| email | varchar | | Invitee email |
| role_id | bigint | FK → roles.id | Role granted on activation |
| brand_id | bigint | FK | Scope; nullable |
| token_hash | varchar | | One-time activation token (hashed) |
| expires_at | timestamp | | Link expiry |
| accepted_at | timestamp | | When activated |

---

## Domain 2 — Organization Structure

### brands
Location dimension within a company.
| Column | Type | Key | Notes |
|---|---|---|---|
| company_id | bigint | FK → companies.id | |
| name | varchar | | e.g. Delhi |
| code | varchar | | Short code |
| address / city / state | varchar | | |
| is_active | boolean | | |

### departments
Function dimension within a company.
| Column | Type | Key | Notes |
|---|---|---|---|
| company_id | bigint | FK → companies.id | |
| name | varchar | | e.g. Engineering |
| code | varchar | | |
| head_employee_id | bigint | FK → employees.id | |

### designations
| Column | Type | Key | Notes |
|---|---|---|---|
| company_id | bigint | FK → companies.id | |
| title | varchar | | e.g. Senior Engineer |
| level | int | | Seniority band |

### employees
Core HR record. Brand and Department are independent FKs.
| Column | Type | Key | Notes |
|---|---|---|---|
| employee_code | varchar | UQ | Per-company code |
| company_id | bigint | FK → companies.id | |
| brand_id | bigint | FK → brands.id | WHERE |
| department_id | bigint | FK → departments.id | WHAT |
| designation_id | bigint | FK → designations.id | |
| manager_id | bigint | FK → employees.id | Reporting line |
| user_id | bigint | FK → users.id | Login |
| date_of_joining | date | | |
| employment_type | enum | | full_time \| part_time \| contract |
| status | enum | | onboarding \| active \| on_notice \| exited \| archived |

### employee_documents
| Column | Type | Key | Notes |
|---|---|---|---|
| employee_id | bigint | FK → employees.id | |
| type | varchar | | id_proof \| address \| bank... |
| file_url | varchar | | Object-storage URL |
| verified | boolean | | HR verified |

---

## Build note for Claude Code
Generate Sequelize models + migrations for these 15 tables first, in this order
(respecting FK dependencies): `groups` → `plans` (stub if not yet built) →
`companies` → `permissions` → `roles` → `role_permissions` → `users` →
`user_roles` → `refresh_tokens` → `password_resets` → `invitations` →
`brands` → `departments` → `designations` → `employees` → `employee_documents`.

Add `defaultScope` on tenant-bound models to auto-filter by `company_id` where
a request-scoped company_id is available via `cls-hooked` / async local storage,
so no controller can forget the tenant filter.