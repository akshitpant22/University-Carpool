# Development Roadmap
# Campus Carpool Matching Platform

---

## 1. Team Structure

A 4-person team, roles chosen to map onto distinct, individually recognizable software engineering specializations rather than an arbitrary split — each role should be independently defensible in an evaluation or interview.

| Role | Owns |
|---|---|
| **Person 1 — ML Microservice** | Python/FastAPI service: sentence-transformer semantic matching (Phase-I); gradient-boosted re-ranking, DBSCAN clustering, Whisper NLU, multimodal face-matching (Phase-II) |
| **Person 2 — Database** | Schema implementation, migrations (version-controlled, PR-reviewed), indexes, PostGIS query design/optimization, RLS policies |
| **Person 3 — REST API & Business Logic** | Node/Express: Auth wrapper, Users, Vehicles, Rides (posting + search orchestration), Ratings, Admin endpoints; matching pipeline orchestration (calling PostGIS + ML service + fusion scoring) |
| **Person 4 — Real-Time Systems** | Socket.IO architecture: chat, live GPS relay, room management; Ride Requests lifecycle (accept/decline/cancel/expiry, atomic transactions); Notifications; Messages |
| **Frontend (React PWA)** | Shared/collective across all four — built incrementally as each backend piece becomes ready to connect to |

**Why this split, not "frontend/backend/other":** frontend-only specialization is a weaker individual differentiator for a final-year CS resume compared to backend/ML/real-time/database ownership. The Person 3 / Person 4 split specifically follows an architectural-concern boundary (stateless REST vs. stateful real-time systems) rather than a "who does more work" split — both are genuinely deep, separately defensible specializations.

---

## 2. Repository & Workflow

- **One shared GitHub repository**, not four separate repos — preserves a coherent project history and lets any team member's individual contribution graph reflect real work on a real team project
- **Personal branches per team member** (e.g., `person1-ml-service`, `person2-database`, `person3-api`, `person4-realtime`) — every commit is individually attributed
- **Pull-Request-based merging into `main`** — at least one teammate reviews before merge; `main` stays in a working, demo-able state at all times
- **Schema migrations are version-controlled files in Git**, applied via the Supabase CLI, going through the same PR review process as application code — not manual SQL run directly against the live database
- **Vercel/Render auto-deploy directly from `main`** — no custom CI/CD pipeline required for Phase-I; merging to `main` triggers an automatic production redeploy

---

## 3. Week-by-Week Plan — Phase-I

**Week 1 — Foundation & Setup**
- *All:* Set up GitHub repo, branch strategy, project board; finalize local dev environments
- *Person 2:* Set up Supabase project, run initial schema migration (all 9 tables), enable PostGIS extension
- *Person 1:* Set up FastAPI skeleton, install `sentence-transformers`, verify basic embedding generation works locally
- *Person 3:* Set up Express skeleton, connect Supabase Auth, build signup/login/email-verify endpoints
- *Person 4:* Set up Socket.IO server skeleton, verify basic connection/room-join behavior

**Week 2 — Auth, Profiles & Core Data**
- *Person 2:* Add indexes; implement RLS policies on `users`, `ride_requests`, `messages`
- *Person 3:* Build Users endpoints (own profile, public profile), Vehicles endpoints
- *Person 1:* Wrap embedding comparison in a working `/embed-similarity` internal API endpoint
- *Person 4:* Design and begin Notification data-model integration (write-then-emit pattern), Messages endpoints
- *All:* Start shared React app skeleton — routing, auth screens (signup, login, profile creation, ID upload)

**Week 3 — File Uploads & Admin**
- *Person 3:* ID card/profile photo upload flow (direct-to-Supabase-Storage), Admin verification endpoints
- *Person 2:* Test/optimize spatial queries (`ST_DWithin`, `ST_Distance`) against seeded sample data
- *Person 1:* Integrate fallback logic (basic string similarity when the ML service is unreachable)
- *Person 4:* Build notification "fetch unread" + "mark read" endpoints
- *All:* Build Admin Verification Queue screen, Pending Verification state UI

**Week 4 — Ride Posting & Search (core matching begins)**
- *Person 3:* Ride posting endpoint; ride search endpoint (hard filters via PostGIS)
- *Person 1:* Connect the ML microservice into the search pipeline (Node → Python call, with timeout handling)
- *Person 2:* Tune indexes based on real query patterns observed from Week 4 testing
- *Person 4:* Begin Socket.IO room-per-ride logic (join on ride creation)
- *All:* Build Post-a-Ride screen, Search screen

**Week 5 — Weighted Fusion & Search Results**
- *Person 3:* Implement weighted score-level fusion (rating + price); finalize ranked results endpoint
- *Person 1:* Validate semantic similarity scores against real test addresses; tune the matching threshold
- *Person 2:* Verify soft-delete logic correctly excludes deactivated rides/users from search results
- *Person 4:* Wire notification triggers into ride status changes
- *All:* Build Search Results screen (ranked cards), Ride Details screen

**Week 6 — Ride Request Lifecycle**
- *Person 3:* Ride Request endpoints (send, list mine, incoming) with dynamic expiry calculation
- *Person 4:* Atomic accept/decline logic (transaction + row-level locking), auto-cancel-others logic
- *Person 2:* Verify partial unique constraint behavior under simulated concurrent requests
- *Person 1:* Begin Phase-II groundwork — literature/approach research for gradient-boosted re-ranking (no implementation yet)
- *All:* Build My Requests screen, Incoming Requests screen

**Week 7 — Real-Time: Chat & Live Tracking**
- *Person 4:* Full chat implementation (Messages + Socket.IO); live GPS relay (ephemeral, no persistence)
- *Person 3:* Ride depart/complete endpoints; cancellation endpoints (tiered penalty logic)
- *Person 2:* Support queries for `incident_logs` writes (no-show/cancellation)
- *Person 1:* Support Person 3/4 on any embedding-related edge cases surfaced during testing
- *All:* Build Active Ride screen (chat + live tracking UI), GPS permission handling

**Week 8 — Ratings, Payment UI & Notifications**
- *Person 3:* Ratings endpoints; finalize composite-rating recompute logic (the formula flagged as an open detail in `API_DESIGN.md`)
- *Person 4:* Full notification UI wiring; incident logging on no-show/cancellation
- *Person 2:* Final schema review; backup/restore test
- *Person 1:* Finalize and write basic tests for the ML service
- *All:* Build Rate Ride screen, UPI QR/deep-link generation UI, Notifications inbox

**Week 9 — Integration, Bug Fixes, Polish**
- *All:* End-to-end testing of the full ride lifecycle (search → request → accept → chat → depart → track → complete → rate) — see `TEST_PLAN.md` Section 4 for the full scenario list
- *All:* Fix integration bugs surfaced between frontend/backend/ML service
- *Person 2 + Person 4:* Add Sentry, rate-limiting (`express-rate-limit`), security headers (Helmet.js)

**Week 10 — Deployment & Demo Prep**
- *All:* Deploy to free-tier hosting (Vercel, Render, Supabase); verify production build behaves correctly
- *All:* Prepare demo script, seed realistic demo data, rehearse presentation

---

## 4. Dependency Notes

A few cross-role dependencies worth flagging so blockers are anticipated, not discovered late:

- Person 4's Week 6 work (accept/decline logic) depends on Person 3's Week 6 request-creation endpoints already existing
- Person 3's Week 5 fusion scoring depends on Person 1's Week 4 similarity endpoint being callable
- Person 2's Week 3 spatial query tuning is most useful once Person 3 has real search queries (Week 4) to tune against — some iteration between these two is expected, not a sign of poor planning
- The shared frontend work in each week assumes the corresponding backend endpoint from that same week is at least stubbed/mocked early, so frontend development isn't fully blocked waiting on backend completion

---

## 5. Checkpoints

- **End of Week 5:** Core matching pipeline (search → filters → similarity → fusion → ranked results) should be fully functional and demoable in isolation, even before the request lifecycle is built
- **End of Week 8:** Full ride lifecycle should be functional end-to-end in a local/staging environment
- **End of Week 9:** All Section 4 scenario tests from `TEST_PLAN.md` should pass
- **End of Week 10:** Live, deployed, demo-ready MVP

---

*Phase-II roadmap (post-MVP, remainder of the academic year) is covered separately in `PHASE_2_ROADMAP.md`, since Phase-II priorities and sequencing depend substantially on learnings and real usage data from the Phase-I deployment.*
