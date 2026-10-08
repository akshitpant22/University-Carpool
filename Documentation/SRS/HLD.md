# High-Level Design (HLD)
# Campus Carpool Matching Platform

This document accompanies four diagrams: one component/orientation diagram (the static architecture) and three flow-specific diagrams (search & matching, request lifecycle, real-time layer). Together they form the complete HLD presentation set. Diagrams are provided as separate image files in this folder (`hld-component-overview.png`, `hld-search-matching.png`, `hld-request-lifecycle.png`, `hld-realtime-layer.png`); this document provides the theory behind each.

---

## Diagram 1: Component Overview

**What it shows:** the four static layers of the system — the React PWA client, the Node.js application server (containing both a REST API module and a Socket.IO real-time module), and the two backend services it depends on: Supabase (PostgreSQL + PostGIS, Auth, Storage) and a standalone Python FastAPI ML microservice.

**Theory:** This is a **layered client-server architecture with one isolated microservice** — deliberately not a pure monolith (which would force Python's ML ecosystem into JavaScript, a poor fit) and not a full microservices decomposition (which would be over-engineered for a 4-person team at single-university pilot scale). The Node.js application server handles all core business logic in one place, while only the one genuinely distinct computational concern — semantic similarity via sentence-transformers — is isolated into its own service. This isolation matters operationally: if the ML service is slow or crashes, it cannot take down the core booking flow, because the calling code always has a fallback.

---

## Diagram 2: Search & Matching Flow

**What it shows:** a rider's search request travels from the React client to Express, which fans out to two places in parallel — a PostGIS query in PostgreSQL for hard filters (timing, route/detour, mutual gender preference), and the Python ML microservice for semantic similarity scoring on location text. Both results converge into a weighted fusion step (50% rating, 50% price), and the ranked result set flows back to the client as cards.

**Theory:** This flow embodies the system's two-layer matching design. **Hard filters run first and are pass/fail**, not scored — timing and route are treated as feasibility constraints (if either fails, the match is not viable regardless of price or rating), and gender preference is treated identically, because a safety/comfort preference deserves exclusion rather than being merely deprioritized in a ranked list. Only candidates that survive filtering proceed to **weighted score-level fusion**, a classical, fully explainable multi-criteria ranking method chosen deliberately over a machine-learning ranker for Phase-I: there is no historical usage data yet to train a model against (the cold-start problem), so a hand-weighted formula is both the practical and the textbook-correct choice at this data scale. The semantic similarity step exists because coordinate-only or exact-string address matching fails on cases like "X Road" versus "X Rd" — genuinely the same location, described differently — which a pretrained sentence-transformer model correctly recognizes as equivalent. The explicit timeout-and-fallback path (falling back to basic string similarity if the ML service is slow or unreachable) ensures the search experience never breaks due to a dependency failure, a deliberate resilience decision, not an afterthought.

---

## Diagram 3: Ride Request Lifecycle & Atomic Acceptance

**What it shows:** a rider sends parallel requests to up to five drivers simultaneously. When one driver (in the example, Driver B) accepts, an atomic database transaction locks the relevant row, flips that request to accepted, and automatically cancels the rider's other pending requests — notifying the other drivers through the notifications system.

**Theory:** This design solves a concrete flaw discovered during the system's design process: an earlier idea used a fixed timeout per request (e.g., "expires after 10 minutes"), which was recognized as fundamentally broken because a fixed timer ignores how much time actually remains before departure — it could kill a perfectly viable match purely due to an arbitrary cap. The fix was **dynamic expiry** (a fraction of remaining time, with no hard cap) combined with giving the rider **agency through parallel requests**, capped at five to prevent one rider from overwhelming the entire driver pool. The **atomic transaction with row-level locking** (`SELECT ... FOR UPDATE`) is the safety-critical piece: without it, two drivers could both accept competing requests from the same rider in the same instant, leaving the database in an inconsistent state. The transaction guarantees this cannot happen — it commits fully or rolls back entirely, with no partial state possible. This logic deliberately lives in application code (Node.js) rather than a database stored procedure, keeping business logic in one language the team is comfortable maintaining, rather than splitting it across SQL procedures and JavaScript.

---

## Diagram 4: Real-Time Layer — Three Data Categories

**What it shows:** Socket.IO manages one room per active ride and handles three distinct categories of data through it — chat messages, live GPS location, and notifications — each following a different persistence rule.

**Theory:** This distinction is the most architecturally important detail of the real-time layer, and conflating the three would be a design error. **Chat messages** and **notifications** both follow a **write-then-emit pattern**: the data is written to its database table first (the source of truth), and only then broadcast live over the socket connection. If the recipient is offline, nothing is lost — the data waits in the database until they reconnect and fetch it via a normal REST call. **Live GPS location** is treated completely differently: it is a **pure ephemeral relay**, never written to the database at all in Phase-I. This is a deliberate decision, not an oversight — the only genuine consumer of historical location data (dispute resolution) is explicitly a Phase-II feature, and building storage ahead of its actual consumer risks designing the wrong schema for a not-yet-defined need. The notification path additionally demonstrates a subtle but important simplification: rather than building explicit online/offline connection-state tracking (which risks a stale "online" flag if a connection drops silently), the system simply **always emits** and lets Socket.IO's native room mechanism handle whether anyone is listening — combined with a REST "fetch unread on load" call as the catch-up mechanism for anything missed while disconnected.

---

## How These Four Diagrams Fit Together

The component overview answers "what exists and what talks to what" — the orientation view for anyone new to the system. The three flow diagrams each answer "how does X actually happen" for the system's three most architecturally significant behaviors: finding a match, committing to a match under concurrency, and communicating in real time. Presented together, they form a complete high-level design: static structure first, then the dynamic behavior that structure supports.
