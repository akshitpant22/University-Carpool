# Security Document
# Campus Carpool Matching Platform

---

## 1. Authentication

**Decision: Use Supabase Auth entirely. Do not build custom JWT issuance/signing/refresh logic.**

**Reasoning:** Rolling your own authentication system is a well-recognized production anti-pattern, even among experienced teams — it means owning an entire category of security responsibility (token signing, refresh rotation, secure client-side storage, replay protection) that a managed provider already solves correctly. Auth bugs are catastrophic (account takeover), not just a broken feature, so this is one of the few areas where "build vs. buy" clearly favors "buy" (or in this case, "use the free managed service already in the stack").

**How it works:**
- Supabase issues a JWT on successful login
- The Supabase client SDK (`@supabase/supabase-js`) on the frontend automatically attaches this token to outgoing requests and handles refresh-token rotation before expiry, transparently
- Node/Express backend **only verifies** incoming tokens — via Supabase's server-side SDK (`supabase.auth.getUser(token)` or direct JWT signature verification against Supabase's public key) — as middleware applied to every protected route
- The verified token yields a `user_id`, which downstream route handlers use for authorization decisions (e.g., "can this user cancel this specific ride request")

**Signup gate:** Before Supabase Auth account creation is permitted, the backend validates that the submitted email's domain matches the `universities.email_domain` value for the relevant tenant (e.g., must end in `@gehu.ac.in`) — this is the first trust gate, filtering out non-university signups before any account exists.

---

## 2. Authorization — Two-Layer Model

**Decision: Express middleware as the primary gate, Supabase Row-Level Security (RLS) as a defense-in-depth database-level safety net.**

**Layer 1 — Express middleware (primary):**
- Runs on every protected route, checks the authenticated user's `role` (student/admin) and, where relevant, resource ownership (e.g., "is this the rider who created this request") before any business logic executes
- Fast to write, test, and modify — lives entirely in familiar Node.js code

**Layer 2 — Supabase RLS (safety net):**
- Enforced directly inside PostgreSQL, independent of application code — even if a bug in Express accidentally omits an authorization check on some route, the database itself refuses to return or modify rows a user shouldn't access
- **Phase-I scope (deliberately limited, not exhaustive):** applied to `users` (a regular user can only read/write their own row; only admins can change `verification_status`), `ride_requests` (a user can only see requests they are the rider or the ride's driver for), and `messages` (a user can only read messages belonging to a ride they are a participant in)
- Full RLS coverage across every table is explicitly a Phase-II hardening task — Phase-I prioritizes RLS on the tables holding the most sensitive personal data, where a leak would be most damaging

**Why both layers, not just one:** this is the standard "defense in depth" security principle — no single point of failure should be able to expose sensitive data. The application layer is where most day-to-day logic lives (easy to iterate on), but the database layer is the unbreakable last line of defense for the handful of tables where a mistake would be genuinely damaging (personal contact info, ID verification status, private conversations).

---

## 3. File Upload Security

**Threats addressed:**

| Risk | Mitigation |
|---|---|
| Malicious/oversized file upload | File type restricted to JPEG/PNG only; max size 5MB — enforced on both frontend (fast feedback) and backend/storage-policy level (actual enforcement; client-side checks are never trusted alone) |
| Public exposure of sensitive documents | ID card images stored in a **private** Supabase Storage bucket, never publicly readable by URL |
| Leaked/reusable access to private documents | Admin review of ID cards uses **short-lived signed URLs** (e.g., 5-minute validity), generated on-demand only when an admin actively opens that specific pending verification — the URL expires automatically, cannot be bookmarked or shared for later reuse |
| Backend resource exhaustion from large file proxying | Files are uploaded **directly from the client to Supabase Storage**, never routed through the Node/Express backend as raw bytes — the backend only ever receives and stores a resulting file path/URL reference |

**Profile photos** are treated differently from ID cards: stored in a **public** bucket, self-service upload with no admin review gate, since they are not safety/trust-critical documents (unlike identity verification). Any future misuse concern (e.g., an inappropriate profile photo) is addressed through the Phase-II harassment/incident-reporting workflow, not an upload-time gate.

---

## 4. Input Validation

- Every API request body is validated against an explicit schema (using `zod` or `joi`) before it reaches any business logic — malformed, missing, or type-mismatched fields are rejected with a `400` response immediately
- This applies uniformly across all 8 resource groups (auth, users, vehicles, rides, requests, ratings, notifications, messages, admin) — no endpoint is exempt
- Client-side validation exists for fast user feedback but is never treated as the actual security boundary — the backend re-validates everything independently, since client-side checks can always be bypassed

---

## 5. Rate Limiting & Abuse Prevention (Phase-I Scope)

**Decision: general-purpose rate limiting via `express-rate-limit`, applied to the highest-risk endpoints. Endpoint-specific hardening deferred to Phase-II.**

Applied to:
- `POST /auth/signup` — mitigates automated fake-account creation
- `POST /auth/login` — mitigates brute-force credential guessing
- `POST /requests` — network-layer backstop reinforcing the application-level max-5-parallel-requests business rule

**Explicitly deferred to Phase-II** (not because they're unimportant, but because designing defenses against unobserved abuse patterns is premature at Phase-I): stricter per-IP signup limits, CAPTCHA, IP reputation scoring, anomaly detection on request patterns. These will be designed against real abuse data once a live pilot generates observable signal — building speculative defenses now would consume time better spent validating the core product.

**Database-level statement timeout:** PostgreSQL itself is configured to kill any query running longer than a set threshold (e.g., 5 seconds) — a safety net against a runaway or unoptimized query monopolizing the free-tier database instance, independent of any application-level rate limiting.

---

## 6. Data Integrity Enforcement at the Database Layer

**Principle: critical business rules affecting data integrity are enforced at the database layer, not application logic alone.**

The clearest example: the **partial unique constraint** on `ride_requests(ride_id, rider_id) WHERE status IN ('pending', 'accepted')`. This exists because application-level "check before insert" logic can fail silently under race conditions — a double-tapped button or a network retry could pass an application-level pre-check twice in quick succession before either insert commits, resulting in duplicate active requests. A database constraint closes this gap completely and unconditionally, regardless of what the application code does or fails to do.

The same reasoning underlies the **atomic accept-transaction** for ride requests (row-level locking via `SELECT ... FOR UPDATE`, wrapped in a database transaction) — ensuring the "first driver to accept wins" rule cannot be violated by two near-simultaneous accepts, even under real concurrent load.

---

## 7. Transport & Infrastructure Security

- **HTTPS enforced everywhere** — automatic on Vercel/Netlify (frontend) and Render/Railway (backend), no additional configuration required
- **Helmet.js** middleware applied to the Express app — sets secure HTTP headers (X-Content-Type-Options, X-Frame-Options, etc.) by default, standard practice with minimal setup cost
- **CORS** restricted to the actual deployed frontend domain once live — never left open to `*` in production
- **Secrets management:** all API keys, database credentials, and service tokens live in environment variables, managed through Vercel/Render/Supabase's built-in environment variable dashboards — never committed to Git under any circumstance

---

## 8. Monitoring & Incident Visibility

**Sentry** is integrated across all three deployable components (React frontend, Node/Express backend, Python FastAPI microservice) from Phase-I. This is treated as a security-adjacent concern, not just a debugging convenience: for a safety-critical application handling real students' commutes, silent failures are unacceptable — the team needs to know when something breaks (an unhandled exception, a failed matching request, an ML service timeout) ideally before a user has to report it manually.

---

## 9. Data Privacy Considerations

- The system collects genuinely sensitive personal data: ID card images, phone numbers, parent/emergency contact numbers, live GPS location during rides. This data is handled with awareness of India's **Digital Personal Data Protection (DPDP) Act, 2023** — clear disclosure to users of what is collected and why, and deliberate minimization of retention where there is no ongoing need (see Section 10).
- **Biometric data caution (Phase-II, facial recognition):** the planned Phase-II multimodal ID verification (face-matching between profile photo and ID card) involves processing biometric data, a legally sensitive category requiring explicit user consent language before implementation — this is documented as a prerequisite in `PRD.md`, not something to be added casually to the face-matching feature.

---

## 10. Data Retention Policy

| Data type | Retention approach | Reasoning |
|---|---|---|
| `users`, `rides`, `ride_requests` | Soft-delete (`deleted_at` timestamp) | Preserves referential integrity for ratings/incident history tied to these records — a rating or incident log pointing to a hard-deleted ride would break |
| `notifications` | Hard-delete, purgeable anytime | No dispute/history value in indefinite retention |
| `messages` | Persisted in Phase-I; Phase-II adds scheduled 30-day post-completion auto-purge | Balances enabling future harassment/dispute investigation against not indefinitely hoarding personal conversations — a deliberate middle ground between "never save anything" and "keep forever" |
| Live GPS location during a ride | **Not persisted at all in Phase-I** — pure ephemeral relay via Socket.IO | Zero Phase-I use case (the only consumer, dispute resolution, is Phase-II); Phase-II introduces a `Location_History` table with periodic snapshot persistence once the feature that needs it is actually being built |

---

## 11. Explicitly Rejected Security Approaches (With Reasoning)

| Rejected approach | Reasoning |
|---|---|
| Custom-built JWT signing/verification | Well-known production anti-pattern; disproportionate security risk relative to using an existing, audited managed provider |
| Real payment gateway holding user funds | Would legally classify the platform as a Payment Aggregator requiring RBI licensing in India; UPI direct-transfer achieves the same practical outcome without this liability |
| Blockchain-based reputation/identity | No genuine decentralization requirement exists — a single-university deployment already has a natural centralized trust authority (the institution itself) |
| Storing raw GPS history from day one "just in case" | Speculative data collection with no defined Phase-I consumer is a privacy liability without corresponding benefit; storage is introduced only alongside the Phase-II feature that actually needs it |
