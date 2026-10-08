# System Architecture Document
# Campus Carpool Matching Platform

---

## 1. Architectural Style

The system follows a **layered client-server architecture with one isolated microservice**, not a pure monolith and not a full microservices decomposition. This is a deliberate middle ground:

- A **pure monolith** (everything in one Node.js process, including ML inference) would force a single language/runtime to handle relational data, spatial computation, real-time messaging, AND natural-language similarity scoring — Python's ML ecosystem (`sentence-transformers`, and later `scikit-learn`, `Whisper`) is dramatically more mature for the ML piece than JavaScript equivalents.
- A **full microservices architecture** (separate services for every domain — auth service, ride service, rating service, etc.) would be over-engineered for a 4-person student team and a single-university pilot — the operational overhead (service discovery, inter-service auth, distributed tracing) would consume time better spent on the actual product.
- The chosen middle ground: **one primary Node.js/Express monolith** handling all core business logic (auth, rides, requests, ratings, admin), **one isolated Python/FastAPI microservice** for the one genuinely distinct computational concern (ML-based semantic similarity), and **Supabase** as a managed backend-as-a-service layer (database, auth, file storage) rather than self-managing that infrastructure.

This is a legitimate, industry-recognized pattern: a polyglot setup where the primary language handles business logic and a secondary language handles a specialized computational task, communicating over an internal API — not a buzzword, a real production pattern.

## 2. High-Level Component Map

```
+-------------------------------+
|      React PWA (Client)        |
|  - Installable, offline-shell  |
|  - Talks to backend via REST   |
|    + persistent WebSocket      |
+---------------+-----------------+
                |
                v
+-----------------------------------------------------+
|         Application Server (Node.js)                  |
|  +-------------------+   +---------------------------+|
|  |   REST API         |   |  Real-Time Layer           ||
|  |  (Express routes,  |   |  (Socket.IO - chat,        ||
|  |  business logic)   |   |  live tracking, alerts)    ||
|  +-------------------+   +---------------------------+|
+--------+-----------------------------------+------------+
         |                                   |
         v                                   v
+-------------------------+       +-------------------------+
|  Data & Auth Services     |       |  Python ML Service       |
|  (Supabase, hosted)       |       |  (FastAPI)               |
|  - PostgreSQL + PostGIS   |       |  - sentence-transformers |
|  - Auth (JWT)             |       |  - embedding + cosine    |
|  - File Storage           |       |    similarity            |
+-------------------------+       +-------------------------+
```

## 3. Component Responsibilities (Detailed)

### 3.1 React PWA (Client)
- **Framework:** React, structured as a Progressive Web App (manifest.json + service worker for installability, offline-shell caching of static assets)
- **Responsibilities:** all UI rendering, client-side form validation (fast feedback, never trusted as the sole enforcement), Geolocation API usage (`navigator.geolocation.watchPosition`) for live tracking, direct-to-storage file uploads to Supabase Storage (bypassing the Node backend for raw file bytes)
- **State management:** React's built-in state (useState/useReducer) for local UI state; no browser localStorage/sessionStorage used for anything security-sensitive (tokens are managed by Supabase's client SDK, which handles secure storage/refresh internally)
- **Communication:** REST calls (via fetch/axios) to `/api/v1/*` for standard CRUD and business actions; a persistent Socket.IO connection for real-time events (chat messages, live location, instant notifications)

### 3.2 Node.js + Express (Application Server)
- **REST API module:** stateless request-response handling for all resource groups (auth wrapper, users, vehicles, rides, requests, ratings, notifications, messages, admin) — see `API_DESIGN.md` for full endpoint list
- **Business logic module:** houses the actual rules — matching pipeline orchestration (calling PostGIS, calling the Python ML service, computing weighted fusion), ride lifecycle state transitions, atomic accept-locking (database transactions with row-level locking), composite rating recomputation
- **Middleware stack:** JWT verification (via Supabase server-side SDK), role-based authorization checks (student vs admin), express-rate-limit, Helmet.js (secure HTTP headers), input validation (zod/joi schemas on every route)
- **Socket.IO server (co-located in the same Node process):** manages WebSocket connections, room-based broadcast (one room per active ride), and the three categories of real-time data described in Section 6

### 3.3 Python + FastAPI (ML Microservice)
- **Sole responsibility:** compute semantic similarity between two pieces of location text using a pretrained sentence-transformer model (e.g., all-MiniLM-L6-v2), returning a cosine-similarity score
- **Exposed internally only** — never reachable from the public internet directly; only the Node backend calls it, over a simple internal REST call (e.g., POST /embed-similarity)
- **Isolation rationale:** if this service is slow, crashes, or is redeployed independently, it must not take down the core booking/matching flow — Node's calling code always has a fallback (basic string similarity) if this service doesn't respond within a timeout
- **Phase-II expansion:** this same service will later host the gradient-boosted re-ranking model, DBSCAN clustering logic, and (separately) Whisper-based speech-to-text — keeping all ML-adjacent computation in one language/environment

### 3.4 Supabase (Managed Backend-as-a-Service)
- **PostgreSQL + PostGIS:** the system of record for all relational and spatial data (see `DATABASE_SCHEMA.md`)
- **Auth:** issues and manages JWTs, handles refresh-token rotation, email verification flows — the Node backend only *verifies* incoming tokens, it does not issue or manage them
- **Storage:** two buckets — a **private** bucket for ID card images (accessed only via short-lived signed URLs generated on-demand for admin review) and a **public** bucket for profile photos (self-service, no approval gate)
- **Connection pooling:** provided by default (PgBouncer), preventing connection exhaustion under concurrent load without any custom configuration

## 4. Detailed Data Flow #1 — Ride Search & Matching

This is the most architecturally significant flow, touching every component in the system.

**Step-by-step:**

1. **Client:** Rider opens the app (already authenticated — a Supabase session/JWT is attached automatically by the client SDK to all outgoing requests). Rider enters/confirms pickup location text, and a preferred departure time window. On submitting search, React sends `POST /api/v1/rides/search` with this criteria as a JSON payload.

2. **Express — request validation:** Middleware verifies the JWT is valid and the user's `verification_status = 'verified'`. Input validation schema checks the payload shape (valid lat/long or address string, valid time format).

3. **Express — hard filter query construction:** The backend constructs a single PostgreSQL query using PostGIS spatial functions:
   - `ST_DWithin(rides.origin_point, :rider_pickup_point, :max_detour_meters)` — restricts to rides whose origin is within an acceptable spatial range
   - `WHERE rides.departure_time BETWEEN :window_start AND :window_end` — timing overlap filter
   - `WHERE rides.status = 'posted'` — only active, not-yet-departed rides
   - Mutual gender-preference check — both the rider's stated preference and the driver's stated preference on that ride must be compatible
   - This single query, backed by the GiST spatial index and the composite (status, departure_time) index, returns the full candidate list — the "survivors" of hard filtering — in one efficient database round-trip, not application-level looping.

4. **Express to Python microservice (semantic similarity):** For each surviving candidate (or batched in one request), Node sends the rider's typed pickup address text alongside each candidate ride's stored origin address text to the Python FastAPI service via an internal POST /embed-similarity call. The Python service:
   - Loads (or uses an already-loaded, cached-in-memory) sentence-transformer model
   - Encodes both text strings into embedding vectors
   - Computes cosine similarity between the vectors
   - Returns a similarity score (0 to 1) for each candidate pair
   - **Timeout/fallback handling:** Node sets a reasonable timeout (e.g., 2 seconds) on this call. If the Python service does not respond in time, or returns an error, Node's calling code catches this and falls back to a simple string-similarity function (e.g., Levenshtein-distance-based) computed locally — the search flow **never blocks or fails** due to ML service unavailability.

5. **Express — weighted score-level fusion:** With the candidate list now enriched (PostGIS-derived distance, semantic similarity score, each candidate's cached composite_rating and price_per_seat pulled from the initial query), Node computes the final ranking score for each candidate:
   ```
   final_score = (0.5 x normalized_rating) + (0.5 x normalized_price_score)
   ```
   Semantic similarity is used earlier, within the hard-filter/detour-matching stage, to correctly treat differently-written equivalent addresses as genuinely proximate — it strengthens the filtering stage rather than being a third weighted component in the final fusion formula. Candidates are sorted descending by final_score.

6. **Express to Client:** The top-ranked results (top 3-5) are serialized as JSON and returned to React.

7. **Client renders:** React displays the ranked results as cards (Phase-I — no map), showing driver name/photo, composite rating, price, estimated pickup proximity, and a "Request Ride" call-to-action per card.

## 5. Detailed Data Flow #2 — Ride Request Lifecycle & Atomic Acceptance

1. **Client:** Rider taps "Request" on up to 5 cards from the search results. For each, React sends POST /api/v1/requests with the target ride_id.

2. **Express — per-request creation:** For each incoming request:
   - Checks the rider does not already have 5 active (pending/accepted) requests outstanding (application-level enforcement of the max-5 rule)
   - Checks the database-level partial unique constraint (ride_id, rider_id where status is pending/accepted) — this is the actual last line of defense against duplicate/race-condition requests, not just the application check
   - Computes expiry_at dynamically: expiry_at = now() + (fraction x (ride.departure_time - now())) — e.g., 50% of remaining time, no hard cap
   - Inserts the row into ride_requests with status = 'pending'
   - Writes a corresponding row into notifications for the driver (per the always-write pattern — see Section 6) and emits a live Socket.IO event to that driver's room if currently connected

3. **Driver's client:** Receives the live notification (or fetches it from GET /api/v1/notifications?unread=true on next app open if they were disconnected). Driver views incoming requests via GET /api/v1/requests/incoming.

4. **Driver accepts — the atomic transaction (the most safety-critical piece of business logic in the system):**
   ```javascript
   await db.transaction(async (trx) => {
     // Row-level lock prevents a race condition where two drivers
     // accept the same rider's competing requests simultaneously
     const request = await trx('ride_requests').where({id}).forUpdate().first();

     if (request.status !== 'pending') {
       throw new Error('Request already handled'); // triggers rollback
     }

     // Accept this specific request
     await trx('ride_requests').where({id}).update({
       status: 'accepted',
       responded_at: now()
     });

     // Auto-cancel the rider's OTHER pending requests (to other drivers)
     const othersCancelled = await trx('ride_requests')
       .where({rider_id: request.rider_id, status: 'pending'})
       .whereNot({id})
       .update({status: 'cancelled_by_rider', responded_at: now()})
       .returning('*');

     // Notify each of those other drivers that the rider is no longer available
     for (const cancelled of othersCancelled) {
       await notifyDriver(cancelled.driver_id, 'Rider booked with another driver');
     }
   });
   // Transaction commits only if ALL steps succeed; rolls back entirely on any failure,
   // guaranteeing the database never ends up in a partially-updated, inconsistent state
   ```

5. **Explicit decline (separate, simpler path):** If a driver explicitly declines rather than the request expiring, the rider's slot is freed **immediately** (status becomes 'declined'), not held until the dynamic expiry timer would have elapsed — no reason to make the rider wait when the driver has already given a definitive answer.

6. **Expiry (background process):** A scheduled job (or lazy-check-on-read pattern) periodically checks for ride_requests where status = 'pending' and expiry_at < now(), flipping them to status = 'expired' and notifying the rider — this frees the rider to consider it a "no" and rely on their other parallel requests.

## 6. Detailed Data Flow #3 — Real-Time Layer (Chat, Live Tracking, Notifications)

The Socket.IO layer handles three distinct categories of real-time data, each with different persistence rules — this distinction is architecturally important and easy to get wrong if conflated:

**Category A — Chat messages (persisted):**
- On sending a message, Express writes to the messages table FIRST (source of truth), then emits the message live via Socket.IO to the recipient's room if they're currently connected
- If the recipient is offline, the message simply waits in the messages table until they open the ride's chat screen and fetch history via GET /api/v1/messages/:rideId
- Phase-II adds a scheduled 30-day post-completion auto-purge job (not built in Phase-I)

**Category B — Live GPS location (ephemeral, NOT persisted in Phase-I):**
- Once a driver marks "Departed," a Socket.IO room is created/joined for that specific ride (e.g., room name ride_<id>)
- The driver's client calls navigator.geolocation.watchPosition(), firing periodically (every 5-10 seconds)
- Each position update is emitted directly over the already-open Socket.IO connection (not a new HTTP request per update — critical for battery/data efficiency)
- The Node/Socket.IO server receives this and **immediately re-broadcasts it to everyone else in that ride's room** (i.e., the rider) — a pure relay, no database write involved
- **This is a deliberate Phase-I decision:** no location history is persisted at all. It has zero Phase-I use case (dispute resolution, the only consumer of this data, is a Phase-II feature) and designing storage before its actual consumer exists risks building the wrong schema for it. Phase-II introduces a Location_History table with periodic snapshot persistence once the dispute-resolution feature that needs it is being built.
- Room is destroyed/cleaned up once the ride is marked "Completed," and the driver's client stops watching position (battery-friendly)

**Category C — Notifications (persisted, always-write/always-emit pattern):**
- Any notification-worthy event (request accepted, declined, expired; ride departed; no-show flagged; ride completed) follows this exact pattern:
  1. Write a row to the notifications table — ALWAYS happens, unconditionally, this is the source of truth
  2. Attempt a live emit: io.to(user_${userId}).emit('notification', data)
  3. If the user has an active Socket.IO connection, they receive it instantly (Socket.IO's native room mechanism handles this)
  4. If the user is not connected, the emit silently goes nowhere — **no explicit online/offline state tracking is built**, because it's unnecessary: Socket.IO already handles "is anyone listening" for free, and the fallback (fetching unread notifications via REST on next app load) covers the "was offline" case completely
- This pattern was deliberately chosen over building explicit connection-state tracking, which would add complexity (a stale "online" flag risk if a connection drops without the server immediately detecting it) for no real benefit over the simpler always-write/always-emit approach

## 7. Driver Safety-by-Design (Live Tracking UX Philosophy)

This is a core, deliberate architectural principle worth documenting explicitly, since it shapes both the real-time data flow and the frontend UX:

**Both driver and rider always have technical access to each other's live location once a ride has departed** — there is no asymmetric hiding of data. However, the **behavioral flow** is intentionally designed so the driver does not need to actively watch a live map while operating a vehicle:

1. Pre-departure, driver and rider have a voice call or chat conversation to clarify the pickup landmark verbally ("near the blue gate," "beside the tea stall") — humans are better at resolving this kind of fuzzy, conversational location description than reading a map pin while driving
2. Once departed, the driver's UI does not force attention to the live map — it can sit passively/minimized
3. Only once the driver has physically arrived near the area and cannot immediately spot the rider does he pull over, park safely, and *then* open the app to check live tracking for final-meters precision (e.g., "we're 15 meters apart, I see you now")
4. This reduces the temptation/need for a driver to glance at a live-updating map while actively driving, which the founding team identified as a genuine road-safety hazard specific to non-professional drivers unfamiliar with treating this as a "job" requiring constant navigation attention (unlike commercial rideshare drivers who often have dedicated phone mounts)

## 8. Security Architecture Summary

*(Full detail in SECURITY.md — summarized here for architectural completeness)*

- **Authentication:** Supabase Auth issues/manages JWTs; Node/Express verifies incoming tokens via Supabase's server-side SDK as middleware — no custom JWT signing/refresh logic built (avoiding a well-known production anti-pattern of rolling your own auth)
- **Authorization:** two layers — (1) Express middleware role-checks as the primary, fast-fail gate; (2) Supabase Row-Level Security (RLS) policies on users, ride_requests, and messages as a defense-in-depth safety net at the database level, ensuring a bug in application code cannot alone expose sensitive data
- **File uploads:** validated for type (JPEG/PNG only) and size (max 5MB) before accepting; uploaded directly from client to Supabase Storage (bypassing the Node backend for raw bytes); ID card images live in a private bucket accessed only via short-lived signed URLs generated on-demand for admin review; profile photos live in a public bucket, self-service
- **Rate limiting:** express-rate-limit applied to signup, ride-request, and auth endpoints in Phase-I (general protection); endpoint-specific hardening deferred to Phase-II once real abuse patterns from a live pilot are observable
- **Data integrity:** critical business rules enforced at the database layer, not just application logic (e.g., the partial unique constraint preventing duplicate active ride requests) — defense in depth, since application-level checks alone can fail silently under race conditions (double-taps, network retries)

## 9. Deployment Topology

*(Full detail in DEPLOYMENT.md — summarized here)*

- **Frontend (React PWA):** Vercel or Netlify, auto-deployed from the main branch
- **Backend (Node/Express + Socket.IO):** Render or Railway, auto-deployed from main
- **ML Microservice (Python/FastAPI):** Render or Railway, deployed as a separate service, auto-deployed from main
- **Database/Auth/Storage:** Supabase, hosted, free tier
- All services run on free-tier cloud infrastructure — a deliberate, documented architectural constraint to keep the project sustainably deployable without institutional funding, appropriate for a student project intended for real university adoption

## 10. Why Not Alternative Architectures (Explicitly Rejected, With Reasoning)

| Alternative considered | Why rejected |
|---|---|
| MongoDB (default "M" in MERN) | Data is heavily relational with strong ACID/transactional requirements (e.g., atomic first-accept-wins); PostgreSQL + PostGIS provides equally strong (often superior) geospatial capability via extension, without sacrificing relational integrity |
| Google Maps API for mapping | Requires a billing account/credit card even on free tier, introduces usage-cost risk for a student project; OpenStreetMap + Leaflet + OSRM achieves the same UX fully free with no API keys |
| Real payment gateway/escrow | Legally classifies the platform as a Payment Aggregator requiring RBI licensing in India; UPI direct-transfer achieves the same practical goal without this liability |
| Full microservices decomposition | Over-engineered for a 4-person student team and single-university pilot scale; operational overhead outweighs benefit at this scale |
| Database triggers for rating recomputation | Splits business logic across two languages/environments (SQL procedures + Node.js); keeping recomputation in application code keeps it colocated with future ML re-ranking logic and easier for the team to read/test/modify |
| Custom-built JWT auth | Rolling your own authentication is a well-known production anti-pattern carrying disproportionate security risk; Supabase Auth provides the same JWT-based mechanism without that risk |
| Polling instead of WebSockets for real-time features | Wasteful (constant unnecessary requests), less "live-feeling," drains mobile battery faster — unsuitable specifically for a live GPS tracking feature |
