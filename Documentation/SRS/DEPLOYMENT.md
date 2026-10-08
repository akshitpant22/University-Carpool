# Deployment Document
# Campus Carpool Matching Platform

---

## 1. Deployment Philosophy

The entire stack is deployed on **free-tier cloud infrastructure**, validated as genuinely achievable at zero cost through both Phase-I and Phase-II, including a real pilot deployment for actual GEHU students. This is a deliberate architectural constraint, not a limitation accepted reluctantly — it directly supports the goal of this becoming a sustainably running tool after graduation, without requiring institutional funding or ongoing personal expense.

Deployment is treated as a Phase-I deliverable, not an afterthought — the MVP submitted for evaluation is a live, deployed system reachable via a real URL, not a local-only demo. This protects against the classic "works on my machine" demo failure and allows real students to begin using the platform during Phase-II, generating the usage data that Phase-II's ML re-ranking model depends on.

---

## 2. Hosting Topology

| Component | Platform | Notes |
|---|---|---|
| Frontend (React PWA) | Vercel (or Netlify) | Free tier; automatic HTTPS; auto-deploys from `main` |
| Backend (Node/Express + Socket.IO) | Render (or Railway) | Free tier; automatic HTTPS; auto-deploys from `main`; note free-tier instances sleep after inactivity, causing a cold-start delay (~30-60s) on the first request after idle — acceptable for a demo/pilot, a known limitation to mention if asked |
| ML Microservice (Python/FastAPI) | Render (or Railway) | Deployed as a separate service from the backend; same free-tier sleep behavior applies |
| Database, Auth, File Storage | Supabase | Free tier; includes connection pooling (PgBouncer) by default; generous free storage/row limits well beyond a single-university pilot's needs |
| Maps (OSM/Leaflet/OSRM) | Self-hosted OSRM instance, loaded with a Uttarakhand/Dehradun regional extract (not all of India) | Keeps memory usage low enough to fit on a free-tier VM; fully open-source, no API keys |
| Domain | Default subdomains (`.vercel.app`, `.onrender.com`) for Phase-I/pilot | A custom domain is optional, low-cost (~$10/year), and not required for functionality |

---

## 3. Environment Configuration

- **Environment variables** (Supabase URL/keys, any service-to-service secrets) are managed through each platform's built-in environment variable dashboard (Vercel, Render, Supabase) — never committed to Git under any circumstance
- **Three logical environments** recommended:
  - **Local development** — each team member runs the stack locally against either a shared Supabase dev project or their own local Postgres instance with PostGIS enabled
  - **Staging** (optional but recommended once the team is comfortable) — a separate Render/Vercel deployment connected to a separate Supabase project, used to verify changes before they reach the live pilot
  - **Production** — the live, deployed system connected to the real Supabase project, auto-deployed from `main`
- For a 4-person team on a tight timeline, a staging environment can be introduced once Phase-I core features stabilize (e.g., around Week 7-8) rather than from Week 1 — earlier than that, the overhead of maintaining two environments may outweigh the benefit while the system is still rapidly changing

---

## 4. Deployment Flow (CI/CD)

**Decision: simple auto-deploy from `main`, not a custom CI/CD pipeline with automated test gating, for Phase-I.**

Reasoning: building a full CI/CD pipeline (automated test suite required to pass before merge, staged rollout, etc.) is real, valuable engineering practice — but it's additional setup overhead that a 4-person team under a 10-week deadline should defer until the basics are solid. The chosen approach still captures the most important property (main is always deployable) without the additional tooling investment.

**The actual flow:**
1. Developer works on their personal branch
2. Opens a Pull Request into `main`
3. At least one teammate reviews the PR
4. On merge, Vercel (frontend) and Render (backend, ML service) — each connected directly to the GitHub repository — automatically detect the change and trigger a new deployment
5. No manual deployment step is required; merging to `main` **is** the deploy trigger

**Phase-II hardening (not built in Phase-I):** introducing GitHub Actions to run the automated test suite (from `TEST_PLAN.md`) before allowing a merge, adding a staging-environment gate before production, and potentially adding deployment rollback automation.

---

## 5. Database Migrations in Deployment

- Schema changes are never applied by manually running SQL against the live Supabase database
- Migration files are version-controlled in Git (see `ROADMAP.md`, Section 2) and applied via the **Supabase CLI**
- The database owner (Person 2) is responsible for reviewing migration PRs for correctness, but any team member can propose a migration file when their feature requires a schema change
- Before merging a migration to `main`, it should be tested against a local or staging database first — never applied directly to production as the first test

---

## 6. Monitoring in Production

- **Sentry** is integrated across all three deployable components (React frontend, Node/Express backend, Python FastAPI microservice) from the first production deployment — not added retroactively after issues arise
- This provides visibility into unhandled errors, crashes, and exceptions in the live system, with alerts (email) on new error types — critical for a system real students will depend on for their actual daily commute, where silent failures are unacceptable
- Render/Vercel's built-in deployment logs and basic uptime/health indicators serve as a lightweight first line of visibility alongside Sentry

---

## 7. Rollback Strategy (Phase-I, Lightweight)

- Both Vercel and Render retain deployment history and support reverting to a previous successful deployment with a few clicks, without requiring a Git revert-and-redeploy cycle — this is sufficient as a Phase-I safety net
- For database schema issues specifically: since migrations are version-controlled, a problematic migration can be identified and a corrective migration written and applied, following the same PR review process — direct manual correction against production is avoided even in a rollback scenario, to preserve the same history/review discipline

---

## 8. Pre-Launch Checklist (Before Week 10 Demo Deployment)

- [ ] All environment variables correctly set in each platform's dashboard (not hardcoded anywhere in the codebase)
- [ ] CORS restricted to the actual deployed frontend domain (not left open to `*`)
- [ ] HTTPS confirmed active on all three deployed services
- [ ] Sentry confirmed receiving events from all three services (verified with a deliberate test error)
- [ ] Rate limiting confirmed active on signup/login/request endpoints
- [ ] RLS policies confirmed active on `users`, `ride_requests`, `messages` in the production Supabase project
- [ ] OSRM regional extract correctly loaded and responding (if Phase-I includes any routing-dependent features ahead of the Phase-II map UI)
- [ ] Realistic seed/demo data populated for a smooth live demonstration
- [ ] All Section 4 scenario tests from `TEST_PLAN.md` re-verified against the actual deployed production environment, not just locally

---

## 9. Long-Term Sustainability Note

Because this project is intended to continue serving real GEHU students beyond Phase-II and graduation, the free-tier deployment choice is not merely a cost-saving shortcut for the academic project — it is the foundation of the platform's ability to keep running afterward without requiring the team (or a future maintainer) to pay ongoing hosting costs out of pocket. If real adoption grows to a scale where free tiers become insufficient (a positive problem to have), the most likely next step is the institutional licensing/adoption model noted in `PRD.md`'s monetization section, where the university itself could fund upgraded infrastructure as part of adopting the platform formally.
