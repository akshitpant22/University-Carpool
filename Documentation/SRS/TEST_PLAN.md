# Test Plan
# Campus Carpool Matching Platform

---

## 1. Testing Philosophy

Given a 4-person student team building toward a hard Phase-I deadline, testing effort is prioritized by **risk and blast radius**, not by chasing 100% coverage. Three categories get the most attention: (1) anything involving money/payment-adjacent logic, (2) anything involving concurrency/race conditions, and (3) anything involving trust/safety (verification, ratings, no-shows) — because bugs in these areas are the hardest to detect informally and the most damaging if they reach real users.

---

## 2. Unit Testing (Per Component)

### 2.1 Node/Express Backend

| Area | What to test |
|---|---|
| Weighted fusion scoring | Given known rating/price inputs, does the formula output the expected ranked order? Edge cases: identical scores (tie-breaking), all-free rides (price component), a candidate with the lowest possible rating |
| Dynamic request expiry calculation | Given a departure time and current time, does `expiry_at` compute correctly at the boundary (e.g., request sent 1 minute before departure vs. 2 hours before)? |
| Composite rating recomputation | Given a set of star ratings + no-show count + cancellation count, does the recompute function produce the expected decimal output? Edge case: a brand-new user with zero history (default rating) |
| Gender-preference mutual filter logic | Given all four combinations (rider pref × driver pref: none/none, none/same, same/none, same/same), does the filter correctly include/exclude each combination? |
| Vehicle seat-capacity derivation | Does each vehicle type (bike/scooty/car) correctly derive its default seat count? |

### 2.2 Python/FastAPI ML Microservice

| Area | What to test |
|---|---|
| Embedding + cosine similarity | Given two clearly-equivalent address strings ("X Road" / "X Rd"), does the similarity score exceed the matching threshold? Given two clearly different addresses, does it fall below? |
| Timeout/error handling | Does the service return a proper error response (not a silent crash) on malformed input? |
| Response time | Does a single similarity computation complete within the timeout budget Node expects (e.g., under 2 seconds)? |

### 2.3 React Frontend

| Area | What to test |
|---|---|
| Form validation | Do signup/profile/ride-posting forms correctly reject invalid input before submission (client-side fast-feedback layer)? |
| Conditional rendering | Does the "Pending Verification" banner correctly show/hide based on account status? Does the DL field only appear as required when a user attempts to post a ride? |
| Request expiry countdown display | Does the UI correctly reflect an approaching/passed expiry time for a pending request? |

---

## 3. Integration Testing (Cross-Component)

These tests matter more than unit tests for this project, since most of the real complexity lives in how components interact, not in isolated functions.

| Flow | What to verify |
|---|---|
| Full search pipeline | A search request correctly flows: Express → PostGIS hard filters → Python ML service call → fusion scoring → ranked response — with realistic seeded data |
| ML service fallback | With the Python microservice intentionally stopped/unreachable, does search still return results using the string-similarity fallback, without erroring out? |
| Atomic accept transaction | Simulate two near-simultaneous "accept" calls on two different pending requests from the same rider — verify only one succeeds cleanly and the other is correctly auto-cancelled, with no database inconsistency |
| Duplicate request prevention | Attempt to insert two active requests from the same rider to the same ride in rapid succession — verify the database-level partial unique constraint rejects the second one, and the API returns a clean error rather than a 500 |
| Notification always-write/always-emit | Trigger a notification-worthy event while the target user is disconnected — verify the notification row exists in the database, and verify it is correctly returned when the user later calls the unread-notifications endpoint |
| File upload flow | Upload an ID card image through the full flow (direct-to-Supabase-Storage → path saved via API) — verify the private bucket correctly restricts direct public access, and verify a signed URL generated for admin review actually expires after its validity window |
| RLS enforcement | Attempt to directly query another user's private profile fields or another ride's messages using a valid-but-unauthorized JWT — verify Supabase RLS blocks this even if application-level middleware were hypothetically bypassed |

---

## 4. Scenario-Based Testing (End-to-End Ride Lifecycle)

These are the tests that most directly validate the actual product, not just individual code paths. Each should be run manually (and ideally scripted where feasible) before any Phase-I demo.

1. **Happy path:** Rider searches → sends request → driver accepts → pre-departure chat → driver departs → live tracking active → driver marks complete → rider rates → both composite ratings update correctly
2. **Parallel requests, first-accept-wins:** Rider sends requests to 3 different drivers → one accepts → verify the other two are auto-cancelled and their drivers are notified
3. **Explicit decline:** Driver declines a request → verify the rider's slot frees immediately (not waiting for expiry)
4. **Request expiry:** A request is left unanswered past its computed expiry time → verify it auto-transitions to `expired` and the rider is notified
5. **No-show:** Driver marks "arrived," waits, then manually cancels citing no-show → verify `ride_requests.status = 'no_show'`, an `incident_logs` row is created, and the rider's (not driver's) reliability score reflects the penalty
6. **Late-stage cancellation:** Rider cancels after the driver has already marked "departed" → verify the tiered (heavier) penalty applies compared to an early-stage cancellation
7. **Driver mid-route cancellation:** Driver cancels after departure (e.g., simulating a breakdown) → verify this is logged with no penalty applied to the driver's score
8. **Gender preference — mutual exclusion:** A rider with "same gender only" enabled should not see rides from a driver whose own gender preference is incompatible, and vice versa
9. **Gender preference — transparent fallback:** A rider's gender filter returns zero results → verify the UI offers to show excluded results rather than silently returning empty
10. **Vehicle deletion guard:** Attempt to delete a vehicle currently referenced by an active (posted/departed) ride → verify the API rejects this with a clear error
11. **Pending verification restrictions:** A user with `verification_status = 'pending'` can browse but cannot successfully post a ride or send a request
12. **Admin verification workflow:** Admin views a pending user's ID card via signed URL, approves → verify `verification_status` flips to `verified` and the user is notified

---

## 5. Load/Performance Considerations (Lightweight, Given Scale)

Given a single-university pilot scale, full load testing is not a Phase-I priority, but a few sanity checks are worth doing before deployment:

- Confirm the `ST_DWithin` spatial query performs acceptably (sub-second) with a seeded dataset of a few hundred to a thousand sample rides — enough to validate the GiST index is actually being used (verify via `EXPLAIN ANALYZE`, not assumption)
- Confirm Socket.IO handles a reasonable number of concurrent connections (e.g., 50-100 simulated simultaneous users) without degradation on free-tier hosting
- Confirm the Python ML microservice's cold-start time (if hosted on a free tier that sleeps when idle) doesn't cause search requests to time out — may require a fallback UX (loading state) or a periodic keep-alive ping

---

## 6. What Is Explicitly Not Tested in Phase-I

- Automated abuse-pattern detection (Phase-II feature — no logic exists yet to test)
- Payment dispute resolution (Phase-II feature)
- Reverse no-show disputes (Phase-II feature)
- Facial recognition matching accuracy (Phase-II feature)
- Multi-tenant isolation beyond the single GEHU tenant (architecture supports it, but no second tenant exists yet to test against)

---

## 7. Testing Ownership (Aligned with Team Roles)

| Role | Testing responsibility |
|---|---|
| ML Microservice owner | Unit tests for embedding/similarity logic, timeout/error handling |
| Database owner | Integration tests for constraints, RLS policies, index performance verification |
| REST API & Business Logic owner | Unit tests for scoring/fusion logic, integration tests for the search pipeline and file upload flow |
| Real-Time Systems owner | Integration tests for the atomic accept transaction, notification always-write/always-emit pattern, Socket.IO connection handling |
| All (shared) | End-to-end scenario testing (Section 4) — run collaboratively before the Phase-I demo, since these span every role's work |
