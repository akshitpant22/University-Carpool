# Campus Carpool Matching Platform — GEHU Dehradun

A peer-to-peer campus ride-sharing and carpool coordination platform engineered specifically for the university community of Graphic Era Hill University (GEHU), Dehradun.

---

## 🏗️ Repository Architecture (Monorepo)

```text
University-Carpool/
├── Documentation/          # Complete SRS, Architecture, PRD, Schemas & ADRs
│   └── SRS/
├── backend/                # Node.js + Express REST API & Socket.IO Real-Time Server
├── ml-service/             # Python + FastAPI microservice (Sentence-Transformers)
├── client/                 # React Progressive Web App (Vite)
└── supabase/               # Version-controlled migrations & seed data (PostgreSQL + PostGIS)
```

---

## 👥 Team Roles & Responsibilities

| Role | Domain / Directory | Key Responsibilities |
|---|---|---|
| **Person 1** | `ml-service/` | FastAPI semantic location matching (`all-MiniLM-L6-v2`), fallback handling, cosine similarity endpoints |
| **Person 2** | `supabase/` | PostgreSQL schema migrations, PostGIS spatial queries & indexes, Supabase RLS policies |
| **Person 3** | `backend/` | Express REST API (`/api/v1/*`), Supabase JWT auth verification, PostGIS query orchestration, weighted fusion ranking |
| **Person 4** | `backend/` | Socket.IO real-time layer, room management, dynamic request expiry, atomic accept transactions, notifications |
| **Shared** | `client/` | React PWA pages & components (Find/Offer rides, active tracking, rating, admin portal) |

---

## 🌿 Git Branching & Contribution Workflow

1. **Main Branch Protection:** `main` must always remain in a working, deployable state. Do not commit directly to `main`.
2. **Branch Naming Conventions:**
   - Person 1 (ML): `feat/ml-<feature-name>` (e.g. `feat/ml-similarity-endpoint`)
   - Person 2 (Database): `feat/db-<feature-name>` (e.g. `feat/db-postgis-tuning`)
   - Person 3 (REST API): `feat/api-<feature-name>` (e.g. `feat/api-ride-endpoints`)
   - Person 4 (Real-Time): `feat/realtime-<feature-name>` (e.g. `feat/realtime-socket-rooms`)
   - Frontend: `feat/ui-<screen-name>` (e.g. `feat/ui-search-cards`)
3. **Pull Requests (PR):**
   - Create a PR targeting `main`.
   - At least **one teammate** must review and approve before merging.
   - Database migrations must be checked into `supabase/migrations/` as version-controlled files.

---

## 🚀 Local Development Quickstart

### 1. Database (Supabase + PostGIS)
1. Link your Supabase project using Supabase CLI:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   ```
2. Apply the initial schema migration:
   ```bash
   npx supabase db push
   ```

### 2. Backend Server (`backend/`)
```bash
cd backend
npm install
cp .env.example .env
# Fill in your Supabase credentials in .env
npm run dev
```
Runs at: `http://localhost:5000`

### 3. ML Microservice (`ml-service/`)
```bash
cd ml-service
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
# source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```
Runs at: `http://localhost:8000` (Docs: `http://localhost:8000/docs`)

### 4. Frontend Client (`client/`)
```bash
cd client
npm install
cp .env.example .env
npm run dev
```
Runs at: `http://localhost:5173`

---

## 📖 System Documentation
For complete technical specifications, see the [`Documentation/SRS/`](Documentation/SRS/) folder:
- **Product Requirements:** [`PRD.md`](Documentation/SRS/PRD.md)
- **High-Level Design:** [`HLD.md`](Documentation/SRS/HLD.md)
- **Architecture & Data Flows:** [`ARCHITECTURE.md`](Documentation/SRS/ARCHITECTURE.md)
- **Database Schema:** [`database-schema.md`](Documentation/SRS/database-schema.md)
- **API Endpoints:** [`API_DESIGN.md`](Documentation/SRS/API_DESIGN.md)
- **Architectural Decisions (ADR):** [`DECISIONS.md`](Documentation/SRS/DECISIONS.md)
- **Security & DPDP Compliance:** [`SECURITY.md`](Documentation/SRS/SECURITY.md)
- **Development Roadmap:** [`ROADMAP.md`](Documentation/SRS/ROADMAP.md)
