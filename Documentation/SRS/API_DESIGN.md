# API Design Document
# Campus Carpool Matching Platform

---

## 1. Conventions

- **Base path:** all endpoints are prefixed `/api/v1/` — versioned from day one so future breaking changes (`/api/v2/`) never disrupt an already-deployed client
- **Authentication:** every endpoint except `auth/signup`, `auth/login`, and `auth/verify-email` requires a valid Supabase-issued JWT in the `Authorization: Bearer <token>` header. Node/Express verifies this token via the Supabase server-side SDK as middleware — the backend never issues or signs tokens itself.
- **Authorization:** two layers on every protected route — (1) Express middleware checks the user's role/ownership before executing business logic, (2) Supabase Row-Level Security (RLS) policies act as a database-level safety net on `users`, `ride_requests`, and `messages`
- **Validation:** every request body is validated against a schema (zod/joi) before touching business logic; malformed requests are rejected with `400` before any database interaction
- **Response shape (standard envelope):**
  ```json
  { "success": true, "data": { ... } }
  { "success": false, "error": { "code": "...", "message": "..." } }
  ```
- **Soft-deleted records** (`users`, `rides`, `ride_requests`) are automatically excluded from all standard queries via a `deleted_at IS NULL` condition baked into the query layer, not repeated manually per-endpoint

---

## 2. Auth (`/api/v1/auth/*`)

Thin wrappers around Supabase Auth — Supabase handles credential storage, hashing, session/token issuance, and refresh-token rotation.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/signup` | Validates email against the university's registered domain (per `universities.email_domain`) before allowing Supabase Auth account creation; creates a matching row in `users` with `verification_status: pending` |
| POST | `/auth/verify-email` | Confirms the email verification callback from Supabase |
| POST | `/auth/login` | Delegates credential check to Supabase Auth, returns session/JWT |
| POST | `/auth/logout` | Invalidates the current session |
| POST | `/auth/refresh` | Refresh-token rotation (largely handled client-side by the Supabase SDK; exposed server-side for completeness) |

---

## 3. Users (`/api/v1/users/*`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/users/me` | Full own profile — ALL fields including sensitive ones (phone, parent contact, ID card reference). Auth required, self-access only. |
| PATCH | `/users/me` | Update own profile fields |
| GET | `/users/:id/public` | **Deliberately separate endpoint** — public-safe profile view exposing only name, profile photo, composite_rating, completed_rides_count, branch/course. Never returns phone, parent contact, exact student ID, or ID card reference. |
| POST | `/users/me/id-card` | Saves the storage path of an already-uploaded ID card image (see Section 8 — upload flow). Triggers `verification_status → pending` if not already set. |
| POST | `/users/me/profile-photo` | Saves the storage path of an uploaded profile photo. Self-service, no admin review required. |
| PATCH | `/users/me/dl` | Add/update driving license number — only becomes a required field the first time a user attempts to post a ride as driver |

**Design note:** `GET /users/me` and `GET /users/:id/public` are intentionally two separate endpoints rather than one endpoint with conditional field-hiding logic. This is a deliberate security choice — separating "my own full data" from "someone else's public data" into distinct code paths makes it structurally impossible for a single conditional-logic bug to leak sensitive fields to unauthorized viewers.

---

## 4. Vehicles (`/api/v1/vehicles/*`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/vehicles/mine` | List all vehicles registered by the current user |
| POST | `/vehicles` | Register a new vehicle (type, number) — `seat_capacity` auto-derived from `vehicle_type` |
| PATCH | `/vehicles/:id` | Update a vehicle's details |
| DELETE | `/vehicles/:id` | Remove a vehicle. **Blocked** if the vehicle is referenced by any ride with `status IN ('posted', 'departed')` — returns an error ("Cannot delete a vehicle used in an active ride"). Hard delete otherwise (no ratings/history tied directly to a vehicle). |

---

## 5. Rides (`/api/v1/rides/*`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/rides` | Driver posts a new ride (origin, destination, departure_time, vehicle_id, price, gender_preference) |
| GET | `/rides/search` | Rider searches — runs the full matching pipeline (hard filters via PostGIS → semantic similarity via ML microservice → weighted score-level fusion) → returns ranked results |
| GET | `/rides/:id` | Ride details for a specific ride (shown when a rider views a candidate before requesting) |
| PATCH | `/rides/:id/depart` | Driver marks "Leaving now" — triggers Socket.IO room creation, live GPS relay begins |
| PATCH | `/rides/:id/complete` | **Driver-only** confirmation, single tap. No rider confirmation required — trusts the driver's on-ground judgment, consistent with the no-show design. Triggers the rating prompt to appear automatically on the rider's client, and makes the UPI payment QR/link available. |
| PATCH | `/rides/:id/cancel` | Cancel a posted/departed ride (driver-side) — triggers incident logging per the tiered cancellation rules |
| GET | `/rides/mine` | A driver's own posted ride history |

**Design note on `/rides/:id/complete`:** ride completion happens BEFORE payment, not after — this ordering is deliberate. Payment (UPI QR/deep-link) only becomes relevant once the ride is confirmed done; making completion depend on payment first would create a circular dependency (ride can't complete until paid, but payment isn't shown until completed).

---

## 6. Ride Requests (`/api/v1/requests/*`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/requests` | Rider sends a request to a specific ride. Enforces the max-5-parallel-requests rule (application-level) and the partial unique constraint (database-level). Computes dynamic `expiry_at`. |
| GET | `/requests/mine` | Rider's own active/past requests, with expiry countdown data |
| PATCH | `/requests/:id/accept` | Driver accepts — **atomic transaction**: locks the row (`SELECT ... FOR UPDATE`), flips this request to `accepted`, auto-cancels the rider's other pending requests, notifies those other drivers. Implemented as a Node.js-managed database transaction with row-level locking, not a stored procedure — keeps business logic colocated with the rest of the Node codebase. |
| PATCH | `/requests/:id/decline` | Driver declines — frees the rider's slot **immediately**, does not wait for the dynamic expiry timer |
| PATCH | `/requests/:id/cancel` | Rider cancels their own request — tiered penalty logic applies based on ride stage (before/after departure) |
| GET | `/requests/incoming` | Driver's view of incoming requests for their posted rides |

---

## 7. Ratings (`/api/v1/ratings/*`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/ratings` | Submit a 1-5 star rating for a completed ride. Triggers `composite_rating` recomputation for the ratee — implemented as an explicit application-level function call in Node (not a database trigger), invoked immediately after a successful insert. |
| GET | `/ratings/user/:id` | View a user's ratings/reviews (public-safe, feeds the public profile view) |

**Note:** `incident_logs` (no-shows, cancellations) has no direct user-facing endpoint — these rows are written automatically by the business logic inside the Requests/Rides endpoints above, never created directly by a user action. Admin read-access is covered under Section 10.

---

## 8. Notifications (`/api/v1/notifications/*`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/notifications` | Fetch current user's notifications. Supports `?unread=true` — this is the "catch-up on load" endpoint that covers the case where a live Socket.IO push was missed while offline. |
| PATCH | `/notifications/:id/read` | Mark a single notification as read |
| PATCH | `/notifications/read-all` | Mark all as read |

---

## 9. Messages (`/api/v1/messages/*`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/messages/:rideId` | Fetch message history for a specific ride — access restricted to the two participants only, enforced via middleware + RLS |
| POST | `/messages` | Send a message — writes to the `messages` table first (source of truth), then emits live via Socket.IO to the recipient if connected |

---

## 10. Admin (`/api/v1/admin/*`)

All routes in this group require both JWT verification AND role-check middleware (`role === 'admin'`) — the two-layer authorization pattern applied consistently across the API.

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/verifications/pending` | List of users awaiting ID verification |
| GET | `/admin/verifications/:id` | Full detail view for one pending user — generates a short-lived signed URL for their private-bucket ID card image on demand |
| PATCH | `/admin/verifications/:id/approve` | Approve → `verification_status: verified` |
| PATCH | `/admin/verifications/:id/reject` | Reject (optional reason) → `verification_status: rejected` |
| GET | `/admin/incidents` | View logged incidents (no-shows, cancellations) — supports future Phase-II abuse-pattern review |
| GET | `/admin/users` | General user list/search for admin oversight |

---

## 11. File Upload Flow (Referenced by Users endpoints)

Files are **never routed through the Node/Express backend as raw bytes**. The flow:

1. Frontend uploads the image **directly to Supabase Storage** using the Supabase client SDK (authenticated with the user's session) — ID card images go to a **private** bucket, profile photos to a **public** bucket
2. Backend-side validation (enforced via Supabase Storage policies and pre-upload checks): file type restricted to JPEG/PNG, max size 5MB
3. Frontend receives back a storage path/URL from Supabase
4. Frontend sends that path to Express (`POST /users/me/id-card` or `/users/me/profile-photo`)
5. Express validates the path genuinely belongs to this user's own upload, then saves the reference into the corresponding `users` column
6. For admin review of ID cards specifically: Express generates a **short-lived signed URL** (e.g., valid 5 minutes) on demand, only when an admin opens that specific pending verification — the URL expires automatically afterward

This avoids proxying large binary file data through the backend server (wasteful on free-tier hosting) and ensures sensitive documents are never publicly/permanently accessible via a guessable URL.

---

## 12. Rate Limiting (Phase-I Scope)

`express-rate-limit` applied at the middleware level to:
- `/auth/signup` — general protection against automated fake-account creation
- `/auth/login` — protection against brute-force credential guessing
- `/requests` (POST) — network-layer backstop on top of the application-level max-5-parallel-requests rule

Endpoint-specific hardening beyond this (stricter per-IP limits, CAPTCHA, anomaly detection) is explicitly deferred to Phase-II, once a live pilot generates real, observable abuse patterns to design against — building defenses against unobserved attack patterns is considered premature optimization for Phase-I.

---

## 13. Open Implementation Detail (Flagged, Not Yet Resolved)

The exact mathematical formula for `composite_rating` recomputation (how explicit star ratings combine with no-show count, late-cancellation count, and completed-rides count into one final decimal score) has been conceptually designed (two-layer: explicit + silent behavioral modifiers) but the precise formula/weighting has been deliberately deferred to implementation time, to be finalized when Person 3 (REST API & Business Logic owner) builds the `POST /ratings` endpoint's recomputation logic. See `DECISIONS.md` for the full reasoning trail on this design.
