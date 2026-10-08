# Phase-II Roadmap
# Campus Carpool Matching Platform

**Purpose of this document:** Phase-I is specified to implementation-ready precision across every other document in this set. Phase-II is deliberately **not** specified to that same depth — writing detailed schemas, endpoints, and screens against assumptions unvalidated by real usage would very likely produce work that gets thrown away once actual Phase-I data and learnings arrive. This document instead consolidates everything Phase-II-related that is currently scattered across `PRD.md`, `ARCHITECTURE.md`, `SECURITY.md`, `DESIGN.md`, and `DECISIONS.md` into one place, and for each item, distinguishes what is **already decided** (the *why* and general direction) from what remains **genuinely open** and depends on Phase-I outcomes.

---

## 1. AI/ML Enhancements

### 1.1 ML-Based Re-Ranking Model
- **Already decided:** Replaces the fixed-weight (50/50 rating/price) fusion formula once real usage data exists. A gradient-boosted ranking model (e.g., LightGBM Ranker) is the presumptively correct choice over a deep neural network, given the expected data volume from a single-university pilot — this reasoning is already documented in `DECISIONS.md` and should not be revisited casually.
- **Genuinely open:** The exact feature set the model trains on (likely includes rating, price, detour distance, semantic similarity score, and possibly time-of-day patterns — but this needs real interaction logs to determine what actually predicts a rider's choice). The exact evaluation methodology (offline evaluation against held-out historical choices vs. online A/B testing) is also undecided, and depends on how much usage volume Phase-I actually generates.

### 1.2 Whisper-Based Voice-to-Text Ride Posting
- **Already decided:** Driver speaks ride details ("leaving now from Clement Town to college, two seats") → Whisper (open-source speech-to-text) transcribes → an NLU layer extracts structured slots (origin, destination, seat count, time) → auto-fills the Post-a-Ride form. Deferred from Phase-I specifically due to UI/UX complexity (recording flow, error handling for misheard input, fallback to manual typing) and reliability risk in a live demo (background noise, accents).
- **Genuinely open:** Whether slot extraction uses a fine-tuned NLU model or a simpler rule-based/regex extraction layered on top of Whisper's transcript (the latter may be entirely sufficient and dramatically simpler to build — this should be evaluated against real transcript samples before committing to a heavier NLU approach).

### 1.3 DBSCAN Geospatial Clustering
- **Already decided:** Used to auto-discover common commute corridors from accumulated ride data, potentially powering smarter matching suggestions or admin-facing analytics ("these are our busiest corridors"). Structurally cannot exist meaningfully in Phase-I due to insufficient data volume — this is not a Phase-I oversight, it is a genuine data-dependency.
- **Genuinely open:** The minimum data volume/time window needed before clustering produces meaningful (non-noisy) corridors; whether cluster results are surfaced to end-users directly or only used internally to inform matching/analytics.

### 1.4 Multimodal ID Verification (Facial Recognition)
- **Already decided:** Uses `face-api.js` (free, runs client-side or in Node) to compare the user's profile photo against their ID card photo, as an additive automated pre-check layered on top of (never replacing) manual admin review. Requires explicit DPDP Act-compliant consent language before implementation, since this involves processing biometric data — this consent flow must be designed before, not alongside, the face-matching code itself.
- **Genuinely open:** The exact similarity threshold for "likely same person" given real-world ID card photo quality issues (low-resolution scans, outdated photos); the fallback UX when the automated check is inconclusive (does it simply flag for closer manual review, or block progress entirely — the former is likely safer against false rejections).

### 1.5 LLM-Based Agentic Chat Safety Monitoring
- **Already decided:** Monitors in-app chat for harassment/inappropriate-language signals; on trigger, makes a genuinely multi-step decision (flag-for-review vs. escalate directly to admin vs. suggest SOS to the user) — this is the one place in the system where "agentic AI" is an honest, defensible label, distinct from the deterministic core matching pipeline.
- **Genuinely open:** Which LLM/API this runs against (cost and privacy implications differ substantially between a hosted API call on private student chat data versus a self-hosted smaller model); the precise decision logic/prompt design for the flag/escalate/SOS-suggest branching; false-positive handling (a flagged-but-innocent conversation should not silently damage a user's standing).

---

## 2. Product Features

### 2.1 Live Visual Map Interface
- **Already decided:** Replaces Phase-I's ranked list/cards with a Swiggy/Uber-style visual map (pins, live driver position) using the free OSM + Leaflet + OSRM stack already validated in Phase-I's architecture.
- **Genuinely open:** Whether the map becomes the primary results view or an optional toggle alongside the existing card view (some users may prefer the scannable card format even once a map is available — worth validating with real Phase-I users before assuming the map should fully replace it).

### 2.2 Wider Detour Tolerance + Compensation Logic
- **Already decided:** Introducing a looser detour threshold as an option increases match availability but introduces a legitimate driver cost (more fuel/time for a bigger detour) — Phase-I deliberately avoided this by keeping detour tolerance tight enough that compensation wasn't a real issue.
- **Genuinely open:** The actual compensation mechanism (a per-kilometer detour surcharge? a flat "extra detour" fee tier?) and how it interacts with the existing UPI-based, no-gateway payment model — this needs real design work, not just a schema field.

### 2.3 Smart Fallback Suggestions (All Requests Fail)
- **Already decided:** When all 5 parallel requests fail, Phase-II should proactively suggest broadening search parameters (wider time window, relaxed gender filter, more detour tolerance) rather than Phase-I's simple "no rides matched" message.
- **Genuinely open:** Whether these are presented as one-tap "try broadening" buttons or an automatic re-search with relaxed parameters — the former preserves user control, the latter reduces friction; needs UX validation.

### 2.4 Payment Dispute Resolution
- **Already decided:** Necessary precisely because the platform has no visibility into actual UPI/cash transactions (a deliberate Phase-I trade-off to avoid gateway liability) — meaning any dispute resolution can only ever be evidence-based on what the app *does* track (chat logs, ride completion timestamps), not transaction proof the app never had.
- **Genuinely open:** The actual resolution workflow/authority — does an admin manually adjudicate disputes, or is there a lighter "both parties must confirm payment or the ride is flagged" mechanism? This needs real dispute examples from Phase-I usage to design against sensibly rather than speculatively.

### 2.5 Reverse No-Show Disputes
- **Already decided:** Addresses the case where a rider claims a driver never arrived, contradicting the driver's "no-show" cancellation — inherently a "he-said-she-said" scenario requiring some form of evidence.
- **Genuinely open:** Whether the Phase-II `Location_History` persistence (see 2.9) is sufficient evidence on its own, or whether additional signals (chat timestamps, arrival-marking timestamps) are needed for a fair resolution process.

### 2.6 Mid-Ride Destination Change
- **Already decided:** Identified as a real scenario (rider wants to be dropped slightly further/closer than originally planned) not handled in Phase-I's fixed-destination model.
- **Genuinely open:** Whether this requires a fare adjustment (tied to 2.2's detour-compensation logic) or is treated as a no-cost convenience within a small tolerance radius — likely depends on how far "mid-ride change" requests actually tend to be in practice.

### 2.7 Harassment/Safety Incident Reporting
- **Already decided:** A formal, human-reviewed reporting workflow distinct from the star-rating system, complementing the LLM-based automatic chat monitoring (1.5) — automatic flagging and formal reporting are two different entry points into the same underlying safety-response process.
- **Genuinely open:** The actual admin escalation/response protocol once a report is filed — this likely needs input from the university's existing student-safety/disciplinary procedures, not something to design in isolation from university policy.

### 2.8 Full SOS Integration
- **Already decided:** Notifies both parent/emergency contact and university admin/security simultaneously (see `DECISIONS.md` for reasoning). Deliberately not built as a placeholder in Phase-I.
- **Genuinely open:** The actual technical integration with university security (is there an existing security dispatch system/contact protocol to integrate with, or does this require establishing that process with the university administration first — likely the latter, meaning this feature has a real-world coordination dependency beyond pure engineering).

### 2.9 Location History Persistence
- **Already decided:** A dedicated `Location_History` table, populated via periodic snapshots (not persisting every single GPS ping), introduced specifically alongside the dispute-resolution features that consume it (2.4, 2.5) — not built ahead of its actual consumer.
- **Genuinely open:** The exact snapshot interval and retention period, which should be informed by what dispute-resolution actually needs (e.g., is a 30-second interval sufficient, or does resolving disputes need finer granularity near the pickup point specifically).

### 2.10 Abuse-Pattern Detection
- **Already decided:** Acts on the `incident_logs` data already being collected in Phase-I (driver mid-route cancellations, logged but unpunished) — the data collection already exists, only the detection/action logic is Phase-II.
- **Genuinely open:** The actual threshold/rule for flagging a pattern as abuse (e.g., "3+ mid-route cancellations in 30 days") — should be calibrated against real Phase-I incident data, not guessed in advance.

### 2.11 Recurring/Scheduled Rides
- **Already decided:** Deliberately excluded even from Phase-II by default, since the target population's vehicle usage is fundamentally irregular (see `DECISIONS.md`) — this is listed here only as a possibility to revisit if real usage data contradicts the original assumption.
- **Genuinely open:** Whether Phase-I usage data actually shows enough regular-pattern users to justify building this at all — the default expectation is "no," but this should be a data-driven decision, not assumed indefinitely.

### 2.12 Multi-University/Multi-Tenant Rollout
- **Already decided:** Architecture is multi-tenant-ready from day one (`university_id` on core tables) specifically to make this possible without a schema rewrite.
- **Genuinely open:** Everything about actual rollout — which university would be next, how tenant-specific configuration (email domain, branding) is administered, whether a single admin team manages multiple universities or each gets independent admins. This is a business/operational question as much as a technical one, and is realistically far beyond Phase-II's timeframe — included here for completeness, not as a near-term commitment.

### 2.13 Full Web Push Notifications
- **Already decided:** Extends beyond Phase-I's in-app notification inbox to notify users even when the app is fully closed, using Firebase Cloud Messaging or the raw Web Push protocol with VAPID keys.
- **Genuinely open:** Notification frequency/preferences design (avoiding notification fatigue) — a real UX question best informed by observing how Phase-I users actually engage with the in-app inbox first.

### 2.14 Messages Auto-Deletion Policy
- **Already decided:** A scheduled job purging `messages` rows older than 30 days past ride completion, balancing dispute-investigation usefulness against not indefinitely hoarding personal conversations.
- **Genuinely open:** Whether 30 days is the right window in practice, or should be adjusted based on how quickly disputes are typically reported/investigated once Phase-II's dispute-resolution workflow is actually operating.

---

## 3. Cross-Cutting Phase-II Infrastructure Work

- Full RLS (Row-Level Security) coverage across all remaining tables, beyond Phase-I's scope-limited application to `users`, `ride_requests`, and `messages`
- `pgvector` extension adoption for caching computed sentence-transformer embeddings (avoiding redundant recomputation on repeated searches for the same address text)
- GitHub Actions CI pipeline (automated test suite gating merges), staging-environment promotion flow, and deployment rollback automation — building on Phase-I's simpler auto-deploy-from-`main` approach
- Endpoint-specific rate-limiting hardening (stricter per-IP limits, CAPTCHA, anomaly detection) informed by real abuse patterns observed during the Phase-I pilot

---

## 4. How to Use This Document

When Phase-II work begins, each section above should be revisited and converted into the same implementation-ready format used for Phase-I (detailed schema additions, endpoint specifications, screen designs) — but only once the "genuinely open" questions have real answers informed by Phase-I usage data, not before. Treat this document as a **living reference of intent and open questions**, not a locked specification.
