# Product Requirements Document (PRD)
# Campus Carpool Matching Platform — Graphic Era Hill University, Dehradun

---

## 1. Problem Statement

University campuses with a large residential and commuting student population experience significant traffic congestion during peak commuting hours, driven largely by single-occupant private vehicle trips. At GEHU Dehradun, the college bus service operates on fixed schedules that do not accommodate irregular routines (exam days, single-class days), forcing students who miss the bus into costly, inefficient alternatives — public transport or a personal vehicle for a single trip — despite the strong likelihood that another student or faculty member is independently travelling the same or a similar route at approximately the same time.

No existing mechanism allows verified members of a single university community to safely and reliably discover, coordinate, and share such rides. General ride-hailing platforms are commercial, unverified, and not designed around institutional trust. Informal coordination (e.g., messaging groups) lacks structure, identity verification, and reliability tracking.

## 2. Core Motivation (in priority order)

1. **Reduce campus-area traffic congestion** — the primary driver for building this system
2. **Environmental impact** — fewer single-occupant vehicles on the road
3. **Cost-sharing** — informal, optional, minimal contribution toward fuel (not a commercial fare)
4. **Community/socialization** — connecting students who travel similar routes but wouldn't otherwise interact

## 3. Target Users

- **Primary:** Students at GEHU Dehradun who commute daily or occasionally between campus and residence
- **Secondary:** Faculty members with similar commuting patterns
- **Scope constraint:** Restricted strictly to **college ↔ home commute** — not a general-purpose city-wide rideshare app
- **Tenancy:** Single university (GEHU) for now; architecture is multi-tenant-ready for future expansion to other universities, ERP-style

## 4. User Model

- **Single unified profile per user** — no separate driver/rider account types. Any verified user can post a ride (act as driver) one day and request a ride (act as rider) another day. Role is decided per-ride, not per-account.
- **Profile fields:** name, university student ID, branch, course, year, semester, mobile number (hidden until match accepted), parent/emergency contact number, UPI ID, vehicle(s), driving license (conditionally required — only if user posts a ride as driver).
- **Vehicle ownership:** a user may register multiple vehicles (e.g., bike and car); seat capacity is derived from the vehicle type used for a specific ride, not fixed to the user.

## 5. Core Feature Set — Phase-I (MVP)

### 5.1 Authentication & Verification
- University email domain-restricted signup (e.g., `@gehu.ac.in`)
- Supabase Auth handles credential/session/JWT management (no custom auth built)
- ID card image upload → manual admin review queue → approve/reject
- Users in "Pending Verification" state can browse the app (read-only) but cannot post/request rides
- Driving license required only when a user first attempts to post a ride as driver

### 5.2 Ride Posting
- **Ad-hoc daily posting only** — no recurring/scheduled rides. Reasoning: students don't drive daily (bus covers most days); vehicle use is irregular (exam days, single-period days), so a recurring schedule would be the wrong abstraction.
- Fields: origin (pickup point), destination (fixed as campus), departure time, vehicle used, available seats (derived), price per seat (optional — free rides allowed), gender preference (optional, mutual filter — see 5.3)
- Earlier posting is transparently surfaced in UI ("Posted 45 min ago") to encourage early posting for better matching, but not enforced as a rule

### 5.3 Matching Algorithm
**Two-layer design: hard filters, then weighted score-level fusion.**

**Hard filters (exclude non-viable candidates):**
1. Timing overlap — ride departure time within an acceptable window of rider's needed time
2. Route/detour proximity — computed via PostGIS as `detour = distance(driver_origin → rider_pickup → destination) − distance(driver_origin → destination)`; excluded if detour exceeds threshold
3. Gender preference — **mutual/bidirectional**: both the rider's stated preference AND the driver's stated preference (if either has opted for same-gender-only) must be compatible for the pair to survive filtering. If a rider's gender filter excludes all matches, the UI transparently offers to show excluded results rather than silently hiding them.

**Weighted score (ranks survivors):**
- Rating (composite reliability score) — 50%
- Price — 50%
- Enhanced by sentence-transformer semantic similarity on location text (see 5.4), feeding into the route-matching stage to correctly treat differently-written equivalent addresses (e.g., "X Road" vs "X Rd") as a strong match — not just coordinate-only comparison

Results are shown as **ranked list/cards** in Phase-I (not a visual map — see 5.9).

### 5.4 AI/ML Components (Phase-I)
- **Sentence-transformer semantic address matching**: a dedicated Python/FastAPI microservice computes cosine similarity between rider-typed and driver-typed location text using a pretrained sentence-transformer model. Falls back to basic string similarity if the microservice is slow/unreachable — search never breaks.
- Score-level fusion (rating + price) is the formal name for the weighted ranking logic — legitimate multi-criteria decision-making, not deep learning, and the textbook-correct choice at this data scale (a full neural ranking model would overfit on a single-university pilot's limited data).

### 5.5 Ride Request Lifecycle (full state machine)
```
Rider searches → gender filter applied (opt-in, transparent fallback)
→ hard filters applied → weighted score ranks survivors
→ rider sends parallel requests to up to 5 drivers simultaneously (hard cap)
→ each request has a DYNAMIC expiry = fraction x time-remaining-to-departure
  (e.g., 50%, NO hard cap — deliberately chosen over a fixed timer, since a fixed
  cap could kill valid matches; rider instead gets agency via parallel requests)
→ explicit driver "Decline" instantly frees that rider's request slot (no waiting for expiry)
→ FIRST driver to accept WINS (atomic, transaction-based, row-locked);
  other pending requests auto-cancelled + those drivers notified
→ pre-departure in-app call/chat to clarify pickup landmark verbally
  (verbal/landmark description is more reliable than typed addresses)
→ driver sends "Leaving in 10 min" → "Departed now"
→ MUTUAL live GPS tracking becomes active for both parties from this point —
  NOT asymmetric — but UX is designed so the driver does not need to watch
  the live map while driving (pre-departure call already resolved ambiguity;
  live tracking is a fallback for final-meters precision once parked)
→ [Rider cancels BEFORE departure] → low-penalty cancellation
→ [Rider cancels AFTER departure] → high-penalty "late-stage" cancellation
→ [Driver cancels mid-route, e.g. breakdown] → NO-FAULT for Phase-I
  (no penalty on occasional occurrence), but LOGGED for future abuse-pattern detection
→ Driver arrives at pickup → if rider not found: NO forced grace period —
  driver manually decides when to cancel (soft UI hint, not enforced) →
  marked as explicit "NO-SHOW" status → dings RIDER's reliability score specifically
  (driver's score stays clean)
→ Driver marks ride "Completed" (driver-only confirmation, single tap — no
  rider confirmation required; consistent with trusting driver's on-ground judgment)
→ Rating prompt appears automatically for rider (no separate rider confirmation step)
→ PAYMENT triggers ONLY HERE, after completion (see 5.6)
```

**Fallback when all 5 requests fail:** Phase-I shows a simple "No rides matched, please try again" message. Smart broadening suggestions (wider time window, relaxed gender filter, more detour tolerance) are Phase-II — deliberately deferred since relaxed detour tolerance has cost/pricing implications not yet designed.

### 5.6 Payments
- **No payment gateway** — would legally require RBI Payment Aggregator licensing in India; not feasible or appropriate for this project.
- **UPI QR/deep-link facilitation**: each user has their own UPI ID on profile; app generates a QR/deep-link pointing directly to the recipient's own UPI ID. Money flows bank-to-bank directly between users — the app never touches, holds, or processes funds.
- Payment is triggered only after ride completion — never pre-paid, never mid-ride, no escrow. This deliberately avoids all refund/dispute complexity: since no money moves through the app, a cancelled/incomplete ride simply has nothing to refund.
- Cash is also an accepted option, entirely off-app.
- No monetary compensation to drivers for wasted time/fuel on rider cancellations in Phase-I (reliability-score penalty on the rider is the sole consequence) — revisited in Phase-II once larger detour tolerances are introduced.

### 5.7 Trust & Reliability System
**Two-layer composite rating:**
- **Layer 1 (explicit):** 1-5 star rating given by driver and rider to each other after each completed ride
- **Layer 2 (silent, system-computed):** the *displayed* rating is adjusted using objective behavioral signals — no-show count and late-cancellation count (penalties), completed-rides count (confidence/weighting factor, similar to how review-count affects trust on Amazon/eBay)
- Displayed as an **exact decimal** (e.g., 4.7), not rounded — preserves meaningful differences between users who might otherwise look identical if rounded
- Repeated no-shows (e.g., 3 in a rolling 30-day window) trigger a temporary restriction on booking rides
- Recomputation happens as an explicit application-level function call (Node/Express) after any insert into `ratings` or `incident_logs` — not a database trigger, to keep logic readable/testable in one place, colocated with future ML re-ranking work

### 5.8 Safety Features
- **SOS (designed now, built Phase-II):** triggers simultaneous notification to (a) a parent/emergency contact (collected at signup, for awareness) and (b) university admin/security (for actual physical/immediate response capability). A placeholder SOS button that doesn't connect to a real responder is considered worse than no SOS — it creates false confidence in a safety feature that doesn't work.
- **Live tracking safety-by-design:** driver is never required to watch a live map while driving; pre-departure voice/chat coordination handles the "fuzzy" navigation, live tracking is only a final-meters fallback used once parked.
- Gender preference as a **hard filter/exclusion**, not a soft ranking weight — a safety/comfort preference deserves exclusion, not deprioritization.

### 5.9 Live Tracking & Maps
- **Phase-I:** No visual map. Matches shown as ranked list/cards (distance, time, price, rating as text/numbers). Live GPS tracking active only after driver marks "Departed," relayed via Socket.IO, ephemeral (not persisted to database).
- **Phase-II:** Full visual map interface using OpenStreetMap + Leaflet.js + OSRM (self-hosted regional extract) — fully free, no API keys, no billing-account risk (deliberately avoiding Google Maps API for this reason).

### 5.10 Real-Time Infrastructure
- **Socket.IO (WebSockets)** used from Phase-I (not deferred) for: pre-departure chat, live GPS relay, instant status notifications (request accepted/declined/expired)
- **Notifications:** always-write (to `notifications` table) then always-emit (via Socket.IO) pattern — no explicit online/offline tracking needed; Socket.IO's room-based delivery silently handles "nobody's listening," and the frontend fetches unread notifications on load as a catch-up mechanism

### 5.11 Platform Type
- **React Progressive Web App (PWA)** — not a separate native mobile app. One codebase delivers installable, app-like experience (manifest + service worker) without the overhead of maintaining two codebases. PWA skeleton (installability) built in Phase-I; full Web Push notifications (works when app fully closed) deferred to Phase-II.

### 5.12 Operational Resilience (Phase-I)
- Sentry error monitoring across frontend, backend, and Python microservice
- `express-rate-limit` on signup, ride-request, and auth endpoints (general protection; endpoint-specific hardening deferred to Phase-II once real abuse patterns are observed)
- Explicit GPS permission-denied UX + manual address entry fallback
- Socket.IO auto-reconnect handling + "tracking unavailable" soft UI state for signal drops

## 6. Phase-II Feature List (Deferred, Documented)

**AI/ML enhancements:**
1. ML-based re-ranking model (gradient-boosted ranker, once real usage data exists) — replaces fixed-weight fusion
2. Whisper-based voice-to-text ride posting with NLU intent/slot extraction (driver speaks ride details, auto-fills form)
3. DBSCAN geospatial clustering — auto-discover common commute corridors from accumulated ride data (structurally requires real data volume, cannot exist meaningfully in Phase-I)
4. Multimodal ID verification — face-api.js matching profile photo against ID card photo, layered on top of (not replacing) manual admin review; requires DPDP-Act-compliant consent flow
5. LLM-based agentic chat safety/harassment monitoring — multi-step: flag → escalate to admin / suggest SOS

**Product features:**
6. Live visual map interface (OSM + Leaflet + OSRM) replacing ranked list/cards
7. Wider detour tolerance option, with associated pricing/compensation logic for driver detour cost
8. Smart fallback suggestions when all 5 parallel requests fail (broaden time window / gender filter / detour tolerance)
9. Payment dispute resolution system
10. Reverse no-show disputes (rider claims driver never arrived — "he-said-she-said" resolution workflow)
11. Mid-ride destination change handling
12. Formal harassment/safety incident reporting workflow (human review, beyond LLM flagging)
13. Full SOS integration (real university security dispatch protocol)
14. Abuse-pattern detection acting on logged driver mid-route cancellations (currently only logged, not acted on)
15. Recurring/scheduled rides (if ever genuinely needed — currently deliberately excluded)
16. Multi-university/multi-tenant rollout (architecture ready; only GEHU is live initially)
17. Full Web Push notifications (notify even when app fully closed) + deeper offline PWA support
18. `Messages` table auto-deletion policy (30-day post-completion purge)
19. `Location_History` table + periodic GPS snapshot persistence, to support dispute resolution and abuse-pattern investigation (deliberately has zero Phase-I use case, since the disputes it serves are Phase-II features)

## 7. Explicitly Out of Scope (with rationale)

| Excluded | Reasoning |
|---|---|
| Blockchain-based reputation | No genuine decentralization problem — a single-university deployment already has a natural centralized trust authority (the institution) |
| "Multi-agent AI" for verification pipeline | The verification → filter → match flow is a deterministic sequential pipeline, not autonomous reasoning agents — mislabeling it would collapse under interview/viva scrutiny |
| Payment gateway / escrow | Legal risk (RBI Payment Aggregator licensing); UPI direct-transfer achieves the same user goal without the liability |
| General city-wide ride-hailing | Scope deliberately restricted to college↔home commute for a single verified institution |
| Recurring/scheduled rides | Vehicle usage among the target population is irregular by nature (exam days, single-period days) — ad-hoc daily posting is the correct abstraction |
| Native mobile app (separate codebase) | PWA achieves near-native experience from a single React codebase; avoids splitting a small team's effort across two platforms |

## 8. Monetization

No monetization in Phase-I or Phase-II — the platform operates as a free, university-community service, consistent with its core philosophy of peer-to-peer, favor-based commuting rather than a commercial transport service. Introducing monetization prematurely would undermine trust and adoption within a closed student community.

**Future potential (speculative, long-term, outside current project scope):**
- Official adoption/licensing by the university as part of campus transportation infrastructure
- Optional, non-intrusive "support the platform" contributions once real adoption and trust are established
- Institutional licensing model if scaled to multiple universities (leveraging the multi-tenant-ready architecture) — universities pay for a verified, branded instance rather than individual users being charged

## 9. Success Criteria (Phase-I)

- Working, deployed prototype accessible via a live URL (not just local demo)
- Complete ride lifecycle demonstrable end-to-end: search → request → accept → chat → depart → live track → complete → rate
- Genuine AI component functioning: sentence-transformer semantic matching measurably improves location-matching accuracy over exact-string comparison
- Admin verification workflow functioning with real test accounts
- Zero critical security gaps in auth, file upload, or payment-adjacent flows
