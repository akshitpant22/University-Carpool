# Decisions Log
# Campus Carpool Matching Platform

This document exists to answer "why did we build it this way, not another way" for every major decision — useful for onboarding a new teammate, defending choices in a viva/interview, or handing context to an AI coding assistant. Decisions are grouped by domain and listed roughly in the order they were made.

---

## Scope & Positioning

**Single university now, multi-tenant-ready architecture.**
GEHU Dehradun is the only live tenant, but `university_id` exists on core tables (`users`, `rides`) from day one. Retrofitting multi-tenancy onto a schema built single-tenant is genuinely painful (auth, RLS policies, and admin dashboards often need rework); adding the field now costs almost nothing.

**Restricted to college↔home commute, not general city-wide rideshare.**
Keeps scope and liability contained; the institutional trust model (verified university members only) is the core differentiator and doesn't generalize to an open market.

**Unified profile model — no fixed driver/rider account type.**
Reflects how the target population actually behaves: a student might drive one day and need a ride the next, depending on exam schedules and single-period days. Role is decided per-ride, not per-account. This also directly shaped the Home screen design (no persistent mode toggle) and the gender-preference design (must be mutual/bidirectional, since either party could be "the driver" on a given day).

---

## Ride Posting Model

**Ad-hoc daily posting, not recurring schedules.**
Vehicle usage among the target population is irregular — college buses cover most days; personal vehicles come out for exam days or single-period days specifically. A recurring-schedule abstraction would be the wrong fit and would require constant pause/unpause management for something inherently unpredictable.

---

## Matching Algorithm

**Weighted scoring (rule-based) for Phase-I, not a machine learning model.**
No historical usage data exists on day one — an ML model would have nothing to learn from (cold-start problem). A weighted-scoring/fusion model is fully explainable ("why did this match rank higher"), deployable immediately, and still legitimately classifiable as AI (a rule-based decision system) for academic purposes. ML-based re-ranking is documented as Phase-II work, once real usage data exists to train against.

**Hard filters (timing, route/detour, gender) run before weighted scoring, not blended into one score.**
Timing and route are treated as feasibility constraints (if either fails, the match is not viable at all, regardless of price or rating) — not soft factors to weigh against a good rating. Gender preference is treated the same way deliberately: a safety/comfort preference deserves exclusion, not deprioritization in a ranked list.

**Gender preference is mutual/bidirectional (driver can also set it), not rider-only.**
Initially designed as a rider-side filter only. Corrected after recognizing this gave drivers no equivalent say in who could request their ride — inconsistent with the project's broader safety-symmetry philosophy (see live-tracking design below). A driver declining requests one-by-one after they arrive is more awkward/friction-prone than simply not appearing in a mismatched rider's search results at all.

**Rating and price weighted 50/50 for Phase-I scoring.**
Simplest defensible starting point; explicitly flagged as tunable once real usage data suggests otherwise.

**Sentence-transformer semantic similarity added to strengthen location matching.**
Exact-string or coordinate-only address comparison fails on cases like "X Road" vs "X Rd" — genuinely the same location, described differently. A pretrained sentence-transformer model captures semantic equivalence that string-distance metrics miss. Chosen over deep-learning-based re-ranking for the *scoring* step itself, because gradient-boosted/classical ranking is the textbook-correct choice at this data scale — a full neural ranking model would overfit on a single-university pilot's limited interaction volume. Knowing when *not* to use deep learning is treated as a stronger signal than using it everywhere.

**Multi-agent AI explicitly rejected for the verification/matching pipeline.**
The verification → filter → match flow is a deterministic, sequential pipeline — not autonomous agents that reason, plan, or communicate. Labeling a linear pipeline as "multi-agent AI" would not survive a basic technical follow-up question ("what does each agent's reasoning loop look like?"). Genuine multi-agent behavior is reserved for the Phase-II LLM-based chat safety monitoring feature, where actual multi-step autonomous decision-making (flag → escalate → suggest SOS) is a legitimate fit.

**Blockchain explicitly rejected for reputation/identity.**
No genuine decentralization problem exists — a single-university deployment already has a natural centralized trust authority (the institution itself). Adopting blockchain would add complexity with no corresponding architectural benefit, and would not survive scrutiny about *why* it was used.

---

## Ride Request Lifecycle

**Parallel requests (max 5), not sequential one-at-a-time requests.**
Originally considered a fixed timeout per request (e.g., "expires after 10 minutes"), but this was recognized as fundamentally flawed — a fixed timer ignores how much time is actually left before departure, and could kill a perfectly viable match purely due to an arbitrary cap. The fix: dynamic expiry (a fraction of remaining time, no hard cap) plus giving the rider agency to request multiple drivers simultaneously rather than being blocked waiting on one. Capped at 5 to prevent one rider spamming the entire available driver pool.

**First-accept-wins, implemented as an atomic database transaction with row-level locking.**
Needed to prevent a race condition where two drivers could both accept competing requests from the same rider in the same instant. Implemented as a Node.js-managed transaction (`SELECT ... FOR UPDATE`) rather than a stored procedure, to keep business logic in one language/codebase the team is comfortable in, rather than splitting logic across SQL procedures and application code.

**Explicit driver decline instantly frees the rider's slot; does not wait for expiry.**
No reason to make a rider wait out a timer when the driver has already given a definitive "no."

**No-show handling: no forced grace period, driver decides manually when to cancel.**
Reflects the project's "this is a favor, not a job" philosophy — the team deliberately avoided imposing a mandatory wait time on drivers, since that would feel like an employment obligation rather than a favor. A soft UI hint (e.g., "most drivers wait 5-10 minutes") nudges behavior without enforcing it.

**No-show is a distinct status/incident type, separate from generic cancellation.**
Ensures fairness: a driver who waited and genuinely couldn't find the rider should not be penalized on their own reliability score, while the rider's absence is tracked distinctly and dings *their* score specifically.

**Driver mid-route cancellation (e.g., breakdown) is no-fault in Phase-I, but logged.**
Not the driver's fault in the way a rider's late cancellation is. Logged (timestamp, ride stage) without penalty, specifically to enable future Phase-II abuse-pattern detection (repeated "breakdowns" as an excuse to bail) without over-engineering enforcement logic before real data exists to justify it.

**Ride completion is driver-only confirmation (single tap), not mutual confirmation.**
Consistent with trusting the driver's on-ground judgment throughout the lifecycle (same reasoning as no-show timing). Also resolves a circular-dependency risk: payment only becomes available after completion, so requiring payment confirmation before completion would create a deadlock.

**Rating prompt triggers automatically on ride completion; no separate rider confirmation step precedes it.**
Simpler, avoids unnecessary friction, consistent with driver-only completion authority.

---

## Payments

**No payment gateway; UPI QR/deep-link facilitation instead.**
A gateway that collects and forwards money between two parties would legally classify the platform as a Payment Aggregator under RBI regulations in India — not appropriate or feasible for a student project. UPI deep-linking to the recipient's own UPI ID achieves the same practical outcome (easy digital payment) with money flowing directly bank-to-bank, never touched or held by the platform.

**Payment triggers only after ride completion — never pre-paid, never mid-ride, no escrow.**
This single ordering decision eliminates the vast majority of refund/dispute complexity: since no money moves through the app at any earlier stage, a cancelled or incomplete ride simply has nothing to refund. All Phase-I cancellation scenarios (early, late, no-show, driver mid-route) resolve purely as reliability-score consequences, with zero monetary complexity.

**No monetary compensation to drivers for wasted time/fuel from rider cancellations, in Phase-I.**
Detours are minimal by design (bounded by the route/detour hard filter), so the "wasted fuel" argument is weak at Phase-I's scope. This becomes relevant only once Phase-II introduces wider detour tolerance — compensation logic is deferred to align with that.

---

## Trust & Safety

**Two-layer composite rating: explicit stars + silent behavioral modifiers.**
Distinguishes subjective peer feedback (stars) from objectively observed platform events (no-shows, cancellations) — a rider can't "outvote" a real behavioral problem with friendly 5-star reviews from acquaintances, since the behavioral layer isn't user-controllable.

**Displayed as an exact decimal (e.g., 4.7), not rounded.**
Rounding would hide meaningful differences between two users who might otherwise look identical (e.g., both "4.5 stars") despite very different underlying reliability histories.

**Composite rating recomputed via an explicit application-level function call, not a database trigger.**
The team is more comfortable in Node.js than in procedural SQL. Keeping this logic in application code also colocates it with where the Phase-II ML re-ranking logic will eventually live, keeping related logic in one place/language rather than split across the database and the backend.

**SOS designed now, deliberately built in Phase-II, not Phase-I.**
A placeholder SOS button with no real emergency-response integration behind it was judged worse than no SOS at all — it would create false confidence in a safety feature that doesn't actually work. Phase-I instead focuses on preventive trust mechanisms (verification, ratings, cancellation handling) that reduce risk *before* a ride happens.

**SOS notifies both parent/emergency contact AND university admin/security, not parent-only.**
A parent, especially if not local, cannot physically intervene in an emergency within minutes. University security is campus-local and can realistically dispatch help — the admin-verification infrastructure being built anyway is reused for this purpose rather than requiring separate infrastructure.

**Facial recognition (multimodal ID verification) deferred to Phase-II.**
ID card photos are frequently low-quality/outdated, creating real false-rejection risk if used as the sole or primary verification signal. Also introduces DPDP Act biometric-data consent obligations that deserve deliberate handling, not a casual bolt-on. Since a human admin already reviews every ID manually, face-matching is additive verification, not a Phase-I necessity.

---

## Live Tracking Philosophy

**Mutual (not asymmetric) live location access, but designed so the driver isn't required to watch it while driving.**
Initial framing considered one-directional tracking (rider sees driver, not vice versa) to address a stated concern about driver distraction. Corrected after clarifying the actual intent: both parties *can* see each other's location, but the **behavioral flow** is engineered so the driver doesn't need to — a pre-departure voice/chat conversation resolves location ambiguity conversationally (which humans handle better than reading a live map pin), and live tracking becomes a fallback only for final-meters precision once the driver has already parked. This is treated as a genuine safety-by-design contribution, not just a UX preference.

**No persisted location history in Phase-I — pure ephemeral Socket.IO relay.**
The only genuine consumer of location history (dispute resolution) is explicitly a Phase-II feature. Building storage ahead of its actual consumer risks designing the wrong schema for a not-yet-defined need. `Location_History` is introduced in Phase-II alongside the dispute-resolution workflow that requires it.

---

## Technology Stack

**PostgreSQL + PostGIS over MongoDB (despite MERN-stack familiarity).**
The data is heavily relational with genuine ACID/transactional requirements (e.g., first-accept-wins must be atomic) — a strength of relational databases, not NoSQL. PostGIS provides equally strong (often superior) geospatial capability via extension, without sacrificing relational integrity. The team already had relational database experience, making this a lower-friction choice than learning NoSQL under time pressure.

**OpenStreetMap + Leaflet.js + OSRM over Google Maps API.**
Google Maps API requires a billing account/credit card even for free-tier access, introducing real usage-cost risk for a student project (e.g., if a demo goes viral). The OSM/Leaflet/OSRM stack achieves the same core UX (map display, geocoding, routing) fully free, with no API keys, and is legitimate in real production systems, not just a "student version."

**Socket.IO (WebSockets) adopted from Phase-I, not deferred to Phase-II.**
Retrofitting real-time infrastructure onto a REST-only app later is more painful than building it in from the start, and live tracking/chat are core to the safety-by-design philosophy, not optional polish.

**Python/FastAPI microservice, isolated from the Node backend, for ML inference.**
Python's ML ecosystem (`sentence-transformers`, later `scikit-learn`, `Whisper`) is dramatically more mature than JavaScript equivalents. Isolating it as a separate service (rather than embedding it in Node via a JS port) means an ML service slowdown/crash cannot take down the core booking flow — Node's calling code always has a string-similarity fallback.

**React PWA, not a separate native mobile app.**
A native app is effectively a second codebase with its own build/deployment/testing overhead — a real risk to actually finishing well within a small team's 12-week Phase-I window. A PWA achieves near-native experience (installable, app-like) from the same React codebase already being built.

**Supabase Auth over custom JWT infrastructure.**
See Security decisions above — rolling your own auth is a recognized anti-pattern; Supabase provides the same underlying JWT mechanism without the associated risk.

**Fully free-tier deployment across the entire stack.**
Validated explicitly (Vercel/Netlify, Render/Railway, Supabase) to be achievable at zero cost through Phase-I and Phase-II, including a real pilot deployment — an important claim for a project intended for actual post-graduation university use without institutional funding.

---

## Team & Process

**Roles split as: ML Microservice, Database, REST API & Business Logic, Real-Time Systems — not split by frontend/backend/other.**
Initially considered a "DB, ML, backend, other" split, refined further. Frontend work is deliberately collective/shared across all four rather than a dedicated role, since frontend-only specialization was judged a weaker individual resume signal for a final-year CS project compared to backend/ML/real-time/database specializations. The REST-vs-real-time split (rather than an arbitrary "pre-match/post-match" split) was chosen specifically because it maps to two distinct, individually recognizable software engineering skill sets, each defensible in an interview or viva with real technical depth.

**Schema migrations version-controlled in Git, not run manually against the live database.**
Manual database changes lose history (no record of when/why a column was added) and have no review step. Migration files, checked into Git and applied via the Supabase CLI, bring the same review/history discipline to schema changes as to application code — a recognized "schema-as-code" practice.

**One shared repository, personal branches per team member, PR-based merging into `main`.**
Preserves individually attributed commit history (important for each team member's own GitHub contribution graph/resume) while still keeping `main` in a working, demo-able state at all times.

---

## Explicitly Rejected Ideas (Consolidated)

| Idea | Why rejected |
|---|---|
| Recurring/scheduled rides | Vehicle usage is inherently irregular for the target population; wrong abstraction |
| Native mobile app (separate codebase) | Unjustified overhead for a small team's timeline; PWA achieves the same goal from one codebase |
| MongoDB | Data is relational with real ACID requirements; PostGIS covers geospatial needs without sacrificing this |
| Google Maps API | Billing-account requirement introduces cost risk; free OSM-based stack achieves the same UX |
| Real payment gateway / escrow | Legal licensing burden (RBI Payment Aggregator classification) disproportionate to project scope |
| Multi-agent AI framing for the core pipeline | Pipeline is deterministic/sequential, not autonomous — mislabeling collapses under scrutiny |
| Blockchain-based reputation | No genuine decentralization problem in a single-institution deployment |
| Custom JWT auth | Recognized production anti-pattern; unnecessary risk given a managed alternative exists |
| Database triggers for rating recomputation | Splits logic across two languages/environments unnecessarily for this team's context |
| Hard grace-period timer for no-shows | Would impose an employment-like obligation, contradicting the "favor, not a job" philosophy |
| Persisting full GPS history from day one | Speculative data collection with no Phase-I consumer; privacy liability without benefit |
| Monetization in Phase-I/II | Would undermine trust/adoption within a closed student community; documented as future, not current, possibility |
