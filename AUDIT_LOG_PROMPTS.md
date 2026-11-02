# Audit Log: prompts for Backend and Frontend

How to use: run the BACKEND prompt first, in the `zelora-ERP-Backend` project. Test the API. Then run the FRONTEND prompt in `zelora-erp-web`.
Both prompts were written from what is in your code today (Laravel 13 + PostgreSQL + Sanctum, Angular 20 + Material + Bootstrap Icons).

---

## PROMPT 1: BACKEND (paste into Claude Code in `zelora-ERP-Backend`)

```
GOAL
Build a tamper-proof Audit Log for the whole Zelora ERP. Every create, update, delete, restore, login, logout, failed login, export and permission change must be stored in ONE separate table, with WHO did it, WHEN, FROM WHERE, WHICH MODULE, WHICH RECORD, and exactly WHAT CHANGED (old value -> new value). An admin must be able to read it in plain language. Accuracy matters more than speed: no action may go unlogged, and no log row may ever be edited or deleted.

READ FIRST (do not guess, open these files)
- app/Http/Controllers/Api/BaseApiController.php  (response envelope ok()/fail()/paginated(), sort(), perPage(), run())
- app/Models/User.php, HrEmployee.php, ModulePermission.php (table modules_premission, parent_id = parent module), Role.php
- app/Support/Auth/*  (BranchScope, UnitRef, AuthSession, LoginDevice, LoginLocation, CurrentEmployee)
- app/Http/Controllers/Api/AuthController.php and PortalAuthController.php (staff login, employee login, customer OTP login)
- app/Http/Middleware/EnsureModuleAction.php, config/module_actions.php, database/seeders/ModulePermissionSeeder.php and ModuleActionSeeder.php (how a new module + its permissions are registered)
- routes/api.php, hr.php, purchase.php, branch.php, franchise.php, dashboard.php
- Memory/design notes on branch / franchise scoping (branch_or_franchise_id, header filter). Follow them.
- Database is PostgreSQL (the code uses ILIKE). Use jsonb. Do not use SQLite-only syntax.

IMPORTANT FACTS ABOUT THIS CODEBASE (they decide the design)
1. BaseApiController::sort() now falls back to ORDER BY updated_at DESC when no sort_by is sent. The audit_logs table has NO updated_at. The Audit controller must NOT use that fallback. Order by occurred_at DESC, id DESC.
2. There are 3 kinds of logged-in people: staff (users table, Sanctum), employee portal sessions (HrEmployee), customer portal sessions (OTP). Also non-human actors: Meta webhook, telephony webhooks, queued jobs, artisan commands, seeders. Actor must be stored for all of them.
3. The code has ~190 places that use query-builder writes (Model::where(...)->update([...]), ->delete(), DB::table(...)->insert/update/delete). These DO NOT fire Eloquent model events, so a plain model observer will MISS them. You must find every one (grep) and either convert it to load the models and save them one by one, or call the audit logger manually. Produce a table in your final report listing each site and what you did. No site may be skipped silently.
4. Most models use SoftDeletes. A soft delete is event "deleted" (not forceDeleted). Restore is "restored".
5. Child rows (purchase_request_items, purchase_order_items, goods_inward_lines, stock_transfer_lines, purchase_return_lines, franchise_invoice_items, treatment_materials, treatment_combo_items, hr_bonuses, hr_candidate_documents, hr_employee_kyc_documents, appointment_treatments, appointment_documents, customer_payments, role_permissions, module_action/tab permissions, etc.) must be logged under their PARENT record's history (for example "Purchase Order PO-0012: item 'Gloves' qty 10 -> 12"), but also be filterable on their own.
6. Parent modules come from modules_premission (parent_id null) e.g. lead-management, appoinment, customer-management, treatment-management, inventory, tele-caller, settings, accounts-management, franchises-management, branch-management, hr-management, reports. Sub modules are its children. Every log row stores BOTH the parent module and the sub module so the UI can group by parent module.

STEP 1: DATABASE
Create a migration for table `audit_logs` (append-only, NO updated_at, NO deleted_at, NO soft deletes):
- id bigserial pk; uuid (unique); batch_uuid nullable (rows written by one request/transaction share a request_id; bulk actions share a batch_uuid)
- occurred_at timestamptz not null default now(), store UTC, display Asia/Kolkata (config('hr.timezone'))
- event varchar(30): created, updated, deleted, restored, force_deleted, login, logout, login_failed, password_changed, password_reset, permission_changed, status_changed, exported, viewed, imported, custom
- module_slug, module_name (parent module), sub_module_slug, sub_module_name  (strings, snapshot, indexed)
- auditable_type (morph class), auditable_id, auditable_label (human label such as "Lead: Ravi Kumar (LD-1024)"), parent_auditable_type, parent_auditable_id (for child rows)
- description text (ready-to-read sentence, see STEP 3)
- old_values jsonb, new_values jsonb, changes jsonb (array of {field, label, old, new, old_display, new_display})
- actor_type (user | employee | customer | system | webhook | console), actor_id, actor_name, actor_role, actor_code (emp_code / email), actor_branch_type, actor_branch_id, actor_branch_name   (ALL snapshots, so the log stays correct if the user is renamed or deleted later)
- scope_branch_type, scope_branch_id  (branch/franchise the changed record belongs to, taken from branch_or_franchise_* so BranchScope can filter)
- ip_address, user_agent, device (use LoginDevice), location nullable (LoginLocation), http_method, url, route_name, request_id
- extra jsonb (reason, export filters, file name, record counts)
Indexes: (occurred_at desc), (module_slug, occurred_at), (actor_type, actor_id, occurred_at), (auditable_type, auditable_id), (parent_auditable_type, parent_auditable_id), (event), (scope_branch_type, scope_branch_id), (request_id), GIN on changes.
Immutability, enforced in TWO layers:
 a) AuditLog Eloquent model: throw LogicException on updating/deleting/restoring/truncating; no fillable mass update path.
 b) PostgreSQL trigger in the migration: BEFORE UPDATE OR DELETE on audit_logs RAISE EXCEPTION 'audit_logs is append-only'. Also REVOKE nothing needed, the trigger is enough. The down() migration drops the trigger first.
Never add retention/auto-prune. Never add any edit/delete API or UI.

STEP 2: CAPTURE ENGINE (cover EVERYTHING)
Create:
- config/audit.php: map of model class -> {module_slug, sub_module_slug, label (callable or attribute list), parent relation for child models, hidden fields, field labels, value resolvers}. Provide a field label map (e.g. 'lead_status_id' => 'Lead Status', 'branch_or_franchise_id' => 'Branch / Franchise').
- app/Models/AuditLog.php
- app/Support/Audit/AuditLogger.php (single entry point: record(event, model/context, old, new, extra)) and AuditContext (actor, ip, request_id, batch_uuid, "audit disabled" flag for seeders/migrations/tests).
- app/Models/Concerns/Auditable.php trait with bootAuditable(): observers for created, updated, deleted, restored, forceDeleted.
  * updated: use getChanges() vs getOriginal(); log ONLY real changes (skip if nothing changed after removing excluded fields). Ignore updated_at, remember_token, and the audit trait's own noise.
  * NEVER store secrets: password, otp, remember_token, api tokens, refresh tokens, OTP codes, payment gateway secrets, FCM tokens, bank account numbers and Aadhaar/PAN: store "••••• (changed)" only, with changed=true. Put the hidden list in config/audit.php.
  * created: store all non-hidden attributes in new_values. deleted: store the full old snapshot in old_values so the deleted record can be understood later.
  * Resolve ids to readable names for display (role_id -> Role name, lead_status_id -> status name, branch id -> branch/franchise name, user ids -> user name, treatment id -> treatment name, etc.) in old_display/new_display. Keep the raw ids too in old_values/new_values. Resolve at write time and store the text (snapshot), never at read time.
  * Money, dates, booleans and enums must be stored in the same format the UI shows (e.g. 1500.00, 28 Oct 2026, Yes/No, Active/Inactive).
- Apply the trait to EVERY model in app/Models that holds business data (all 90+ models). Exclusions only: AuditLog itself, RefreshToken, UserPushToken, and pure technical/high-frequency tables (call events, hr attendance activity pings, sync logs, stock_movements which is already a ledger). List each exclusion with the reason in the final report.
- Write the audit row INSIDE the same DB transaction as the change (same connection, synchronous, NOT queued). If the business change rolls back, the log rolls back with it. If the audit insert itself fails, the request must fail (fail closed) and the error goes to a dedicated log channel `audit_failures`. Never swallow an audit exception.
- Non-model writes: build helper AuditLogger::recordBulk(...) and use it for the ~190 query-builder sites (see fact 3). For true mass updates, write one row per affected record when the count is <= 200, otherwise one row with the filter, count, and the id list in extra.
- Request context: a middleware `AttachAuditContext` (add to the api group in bootstrap/app.php) sets actor, ip (respect proxy headers), user_agent, device, request_id (also return it in header X-Request-Id), route_name, url, method. Actor resolution: User => user; HrEmployee session => employee; customer OTP session => customer; webhook routes (/webhooks/meta, telephony webhooks) => webhook with the source name; artisan/queue => console/system.
- Auth events: in AuthController and PortalAuthController log login (success), login_failed (store attempted email/emp code/mobile, NEVER the password), logout, password reset requested/completed, OTP verified/failed, token refresh failures. Failed logins have no actor_id, store actor_code as the attempted identifier.
- Special events (no model change but must be logged): every export (Excel/CSV/PDF) with the filters used and row count; download of sensitive files (payslip, KYC document, appointment documents, call recordings); role/permission matrix changes (log as permission_changed with a readable diff "Role Telecaller: Lead Management -> Add Lead ON -> OFF"); impersonation/scope header switch is NOT logged (it is a view filter).
- Seeders, migrations, tests and artisan commands must not flood the log: AuditContext::disabled() is set by DatabaseSeeder and in tests unless a test turns it on.

STEP 3: DESCRIPTION (must read like a sentence)
Generate `description` at write time, plain English, for example:
 - "Priya S (Telecaller, Chennai Branch) created Lead 'Ravi Kumar' in Lead Management."
 - "Arun K (Admin) changed Lead 'Ravi Kumar': Status New -> Contacted, Next Follow-up 29 Oct -> 31 Oct."
 - "Meena R (Branch Manager) deleted Vendor 'ABC Pharma' in Inventory."
 - "Unknown user failed to log in with employee ID 'EMP-1002' from 49.x.x.x."
Truncate nothing in `changes`; description may summarise after 5 fields ("and 3 more").

STEP 4: API (read-only) under routes/api.php, middleware auth:sanctum + RequireUserAccount + module.action
Register a NEW parent module "Audit Logs" (slug audit-logs, icon bi-clipboard2-data-fill, url /app/audit-logs) in ModulePermissionSeeder, visible to super_admin and admin ONLY, and add its actions in config/module_actions.php: view-audit-logs, view-audit-log-detail, export-audit-logs. Run both seeders. A normal staff user must get 403.
Endpoints (use BaseApiController envelope and paginated style: {success,message,data,pagination}):
 - GET /api/audit-logs : filters module (parent slug), sub_module, event[], actor_id, actor_type, from, to (dates, inclusive, Asia/Kolkata day boundaries), search (ILIKE on description, actor_name, auditable_label, ip), auditable_type + auditable_id, branch scope, per_page (max 200, default 25). Sort whitelist: occurred_at (default, desc), actor_name, module_name, event. ALWAYS add id desc as tiebreaker. Follow BranchScope: admin sees the header branch/franchise filter result; super_admin sees all.
 - GET /api/audit-logs/{uuid} : full row including changes.
 - GET /api/audit-logs/summary : for the same filters return counts total, created, updated, deleted, logins, failed_logins, distinct users; per-module counts; top 5 active users; per-day counts for a chart; latest 5 failed logins.
 - GET /api/audit-logs/filters : modules (with sub modules), events, users who have appeared in the log (id, name, role).
 - GET /api/audit-logs/history/{module}/{id} : full change history of ONE record (including child rows via parent_auditable) newest first, so any detail page can show "History".
 - GET /api/audit-logs/export : Excel via maatwebsite (same filters, max 50,000 rows, the export itself is logged as event exported).
 There must be NO POST/PUT/PATCH/DELETE route on audit logs. Verify with `php artisan route:list --path=audit`.
 Use an API Resource (app/Http/Resources/AuditLogResource.php) that returns: id(uuid), occurred_at (ISO), occurred_at_display, relative time, event, event_label, module{slug,name}, sub_module{slug,name}, record{type,type_label,id,label}, description, changes[{label,old_display,new_display}], actor{type,id,name,role,code,branch}, request{ip,device,url,method}, extra. Never expose raw hidden values.

STEP 5: PROVE IT (accuracy gate, do not skip)
Write feature tests (phpunit, PostgreSQL) that assert:
 1. Create, update (only changed fields appear), soft delete, restore each add exactly one row with the right actor, module, record label and diff.
 2. An update that changes nothing writes NO row.
 3. password / otp / token fields never appear anywhere in old_values/new_values/changes/description.
 4. Rolling back a transaction rolls back the audit row too.
 5. UPDATE and DELETE on audit_logs by raw SQL throws (trigger).
 6. Query-builder bulk update site X now writes rows (cover every converted site, or at least one test per controller group).
 7. Login success, login failure (unknown user, wrong password), logout each log correctly; failed login stores the attempted id but no password.
 8. A non-admin gets 403 on every /api/audit-logs endpoint; admin/super_admin get 200; branch scoping works.
 9. Export writes an `exported` row.
 10. Child item change appears under the parent's /history.
Then run the full existing test suite and `php artisan route:list` to prove nothing else broke. Run `php -l` on every touched file.
Finally smoke-test manually through tinker/HTTP: create a lead, edit its status, delete it, restore it, and print the resulting audit rows.

DELIVERABLE / FINAL REPORT (be honest, list gaps)
- Files created/changed.
- Table of every model with the trait and every excluded model + reason.
- Table of every query-builder write site and how it is now audited.
- Any write path you could not cover, stated plainly. Do not claim 100% coverage unless the grep proves it.
- Commands I must run (migrate, db:seed --class=ModulePermissionSeeder, db:seed --class=ModuleActionSeeder).
Do not touch unrelated code. Match existing code style (BaseApiController envelope, PostgreSQL ILIKE, existing naming). Do not commit.
```

---

## PROMPT 2: FRONTEND (paste into Claude Code in `zelora-erp-web`, after the backend works)

```
GOAL
Add an "Audit Logs" parent module to the Angular app so an admin can see, in plain language, WHO changed WHAT, WHEN, in WHICH module, with before/after values. It must be easy for a non-technical admin: readable sentences, colours for event types, and a clear before -> after view. It is strictly READ-ONLY (no edit, delete or clear buttons anywhere).

READ FIRST (copy the existing patterns, do not invent new ones)
- src/app/app.routes.ts (lazy loadComponent routes under 'app')
- src/app/shared/common-services/api-route-constants.ts and an existing service such as hr.service.ts / branch.service.ts (how API calls, params and the {success,data,pagination} envelope are handled)
- src/app/shared/components/: common-table-card, common-filter-card, common-detail-card, breadcrumb, page-loader, module-tabs, local-list-base.ts
- src/app/shared/styles/erp-page.scss, erp-dialog.scss, branch-franchise-list.scss (page and dialog look)
- A comparable finished page, e.g. src/app/pages/look-up-master/users/ and src/app/pages/branch-management/branches/ (layout, filters, pagination, loading/empty states)
- The `*appCan` directive and how left-side-navbar builds the menu (the menu comes from the backend modules_premission tree; the new module "Audit Logs" url is /app/audit-logs and already exists after the backend seeders are run, so do NOT hardcode the menu)
- Backend contract (read-only API, envelope {success,message,data,pagination}):
  GET /audit-logs (filters: module, sub_module, event[], actor_id, actor_type, from, to, search, auditable_type, auditable_id, per_page, page, sort_by, sort_direction)
  GET /audit-logs/{uuid}, GET /audit-logs/summary, GET /audit-logs/filters, GET /audit-logs/history/{module}/{id}, GET /audit-logs/export
  Each log item: id, occurred_at, occurred_at_display, relative, event, event_label, module{slug,name}, sub_module{slug,name}, record{type,type_label,id,label}, description, changes[{label,old_display,new_display}], actor{type,id,name,role,code,branch}, request{ip,device,url,method}, extra.
- Stack: Angular 20 standalone components, Angular Material 20, Bootstrap 5 + Bootstrap Icons, chart.js. No new UI library.

BUILD
1. Route: add `audit-logs` (lazy, standalone) in app.routes.ts. The page must also be guarded the same way other permission-based pages are, and hide the export button without the `export-audit-logs` action (`*appCan`).
2. Files: src/app/pages/audit-logs/audit-logs.ts/.html/.scss (list page), audit-log-detail-dialog (or side drawer), shared/common-services/audit-log.service.ts, shared/models/audit-log.model.ts, route constant in api-route-constants.ts. Add a reusable `app-record-history` component (src/app/shared/components/record-history) that takes module + record id and shows that record's timeline, so any detail page (lead profile, employee profile, purchase order...) can later add a "History" button. Add it first to lead-profile-dialog and hr employee-profile as examples.
3. Page layout (top to bottom):
   a) Page header: title "Audit Logs", subtitle "Track every change made in the application", Export button (permission-gated), Refresh button, "Last updated" time.
   b) Summary cards row (from /summary, follow the date filter): Total Activities, Created, Updated, Deleted, Logins, Failed Logins (red when > 0), Active Users. Small icons, large numbers, skeleton while loading.
   c) Parent-module chips/tabs: "All Modules" + one chip per parent module (Lead Management, Appoinment, Customer Management, Inventory, HR Management, Settings, Accounts...) each with a count. Selecting a parent shows a second row of its sub-module chips.
   d) Filter bar: quick date chips (Today, Yesterday, Last 7 days, Last 30 days, Custom range with Material date range picker), User dropdown (searchable, shows name + role), Action multi-select (Created, Updated, Deleted, Restored, Login, Logout, Failed login, Exported, Permission changed), Search box (debounced 400 ms; searches description, user, record, IP), "Clear filters" button. Filters are kept in the URL query params so a page refresh or shared link keeps them.
   e) View toggle: "Timeline" (default) and "Table".
      - Timeline: grouped by day with sticky day headings ("Today", "Yesterday", "27 Oct 2026"). Each entry is a card: coloured round icon (green plus = created, blue pencil = updated, red trash = deleted, purple restore = restored, grey key = login/logout, orange warning = failed login, teal download = exported), then the readable sentence from `description` with the user name and record label in bold, then small grey line "10:42 AM · 5 min ago · Chennai Branch · IP 49.x.x.x · Chrome on Windows". Up to 3 changed fields shown inline as "Status: [New] -> [Contacted]" (old value red with strike, new value green); "+N more" opens the detail.
      - Table: columns Time, User (avatar initials + name + role), Action (colour badge), Module (parent > sub), Record, Summary, with a "View" button per row. Use the existing common-table-card where it fits; server-side pagination (25 default; 10/25/50/100) and sortable columns (time, user, module, action).
   f) Detail dialog/drawer (opens on click): header with action badge + exact time (dd MMM yyyy, hh:mm:ss a) + relative time; "Who" block (avatar, name, role, employee code/email, branch); "Where" block (IP, device, browser, URL, method); "What" block (module path, record type and label); "Changes" table with columns Field | Before | After, old value on a light red background, new value on a light green background, empty value shown as "Empty"; for created show "New record details", for deleted show "Deleted record details" (the old snapshot). A "View full history of this record" button that opens the record-history timeline. Close with Esc and an X.
4. Behaviour rules (accuracy):
   - Show server data exactly as sent. Never recompute a diff, never reformat old/new values, never hide a row. Use `old_display`/`new_display`.
   - All times shown in Asia/Kolkata (12-hour with AM/PM). Relative time must update on refresh only.
   - Handle: loading (skeleton, use page-loader), empty ("No activity found for these filters" + clear button), error (message + Retry), 403 (friendly "You do not have access" message), network error.
   - Cancel the in-flight request when filters change (switchMap) so an old response never overwrites a newer one.
   - Respect the header Branch/Franchise scope the same way other pages do (branch-context / scope-header store) and reload when it changes.
   - No auto-refresh timers except an optional "Auto refresh every 30s" toggle that is OFF by default.
   - Read-only: no edit/delete/clear controls anywhere.
5. Design quality: consistent with the existing ERP look (same fonts, colours, card radius, shadows as erp-page.scss). Responsive: on mobile the timeline is full width, filters collapse into a "Filters" button opening a bottom sheet, summary cards become a 2-column grid. Accessible: all icons have aria-labels, colour is never the only signal (badge has text), keyboard navigation works, focus is trapped in the dialog, contrast is AA. Smooth, subtle transitions only.
6. Do not modify unrelated pages (other than adding the History button to lead-profile-dialog and employee-profile). Keep strict TypeScript (no `any` for the new models). Follow existing naming and file structure. Do not commit.

VERIFY (before you say done)
- `npx tsc --noEmit -p tsconfig.app.json` and `ng build` pass with no errors.
- Start the app (`ng serve`) with the backend running and test in the browser: log in as admin, create/edit/delete a lead in another tab, confirm the entries appear with the correct user, sentence, and before/after values; test each filter, quick date chip, module chip, search, pagination, sort, table/timeline toggle, detail dialog, record history, export; test a non-admin user cannot see the menu item or open /app/audit-logs; test mobile width 375px.
- Report exactly what you tested and what you could not test. Do not claim it works without running it.
```

---

## Notes for you (not part of the prompts)

- Why the backend prompt is long: your code has about 190 query-builder writes (`->update([...])`, `->delete()`, `DB::table(...)`) that skip Eloquent model events. A plain observer would silently miss them. The prompt forces a per-site audit.
- Your recent change to `BaseApiController::sort()` (updated_at default) would break an audit table with no `updated_at`. The prompt already warns about it.
- "100% accuracy" is only believable if the final report lists every uncovered write path. The prompt asks for that list. Check it before trusting the log.
- Audit log rows hold personal data (IP, names). Plan who may export them.
