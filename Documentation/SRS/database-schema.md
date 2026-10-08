# Campus Carpool Platform — Database Schema

**Database:** PostgreSQL + PostGIS extension (hosted via Supabase)
**Design principles:** multi-tenant-ready (`university_id` on core tables), soft-deletes where history matters for disputes/ratings, database-level constraints for critical business rules (not just application logic), denormalized cached fields for read performance.

---

## 1. universities
Multi-tenancy root — currently one row (GEHU Dehradun), architected to support more later.

```sql
CREATE TABLE universities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    email_domain    TEXT NOT NULL UNIQUE,   -- e.g. 'gehu.ac.in', used for signup validation
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 2. users
Unified profile — every user can act as driver or rider per-ride. Auth credentials themselves live in Supabase Auth (`auth.users`); this table holds app-specific profile data, linked by shared `id`.

```sql
CREATE TYPE user_role AS ENUM ('student', 'admin');
CREATE TYPE verification_status_enum AS ENUM ('pending', 'verified', 'rejected');

CREATE TABLE users (
    id                          UUID PRIMARY KEY,   -- shared with auth.users
    university_id               UUID NOT NULL REFERENCES universities(id),
    name                        TEXT NOT NULL,
    email                       TEXT NOT NULL UNIQUE,
    phone_number                TEXT,
    parent_contact_number       TEXT,               -- for SOS (Phase-II)
    student_id_number           TEXT NOT NULL,
    branch                      TEXT,
    course                      TEXT,
    year                        INT,
    semester                    INT,
    role                        user_role NOT NULL DEFAULT 'student',
    verification_status         verification_status_enum NOT NULL DEFAULT 'pending',
    id_card_image_url           TEXT,               -- Supabase Storage
    profile_photo_url           TEXT,
    upi_id                      TEXT,
    dl_number                   TEXT,                -- nullable, required only if user offers rides
    dl_verified                 BOOLEAN NOT NULL DEFAULT false,
    composite_rating            DECIMAL(2,1) DEFAULT 5.0,   -- cached, recomputed after each rating/incident
    completed_rides_count       INT NOT NULL DEFAULT 0,
    no_show_count               INT NOT NULL DEFAULT 0,
    late_cancellation_count     INT NOT NULL DEFAULT 0,
    deleted_at                  TIMESTAMPTZ,          -- soft delete
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_verification_status ON users(verification_status);
```

---

## 3. vehicles
A user may own multiple vehicles; seat capacity derives from vehicle type.

```sql
CREATE TYPE vehicle_type_enum AS ENUM ('bike', 'scooty', 'car');

CREATE TABLE vehicles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    vehicle_type    vehicle_type_enum NOT NULL,
    seat_capacity   INT NOT NULL,        -- derived at creation from vehicle_type, editable
    vehicle_number  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicles_user_id ON vehicles(user_id);
```

---

## 4. rides
Ad-hoc daily ride postings (no recurring schedules). Uses PostGIS `GEOGRAPHY` type for spatial queries.

```sql
CREATE TYPE ride_status_enum AS ENUM ('posted', 'departed', 'completed', 'cancelled');
CREATE TYPE gender_pref_enum AS ENUM ('no_preference', 'same_gender_only');

CREATE TABLE rides (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id               UUID NOT NULL REFERENCES users(id),
    vehicle_id              UUID NOT NULL REFERENCES vehicles(id),
    university_id           UUID NOT NULL REFERENCES universities(id),  -- denormalized for fast tenant-scoped queries
    origin_point            GEOGRAPHY(Point, 4326) NOT NULL,
    origin_address_text     TEXT NOT NULL,
    destination_point       GEOGRAPHY(Point, 4326) NOT NULL,   -- usually fixed campus location
    departure_time          TIMESTAMPTZ NOT NULL,
    available_seats         INT NOT NULL,
    price_per_seat          DECIMAL(6,2),        -- NULL = free ride
    gender_preference       gender_pref_enum NOT NULL DEFAULT 'no_preference',
    status                  ride_status_enum NOT NULL DEFAULT 'posted',
    posted_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ,          -- soft delete
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rides_origin_point ON rides USING GIST (origin_point);
CREATE INDEX idx_rides_status_departure ON rides(status, departure_time);
CREATE INDEX idx_rides_university_id ON rides(university_id);
```

---

## 5. ride_requests
Parallel requests (max 5 per rider, enforced in application logic). Dynamic expiry computed at request time. Database-level constraint prevents duplicate active requests.

```sql
CREATE TYPE request_status_enum AS ENUM (
    'pending', 'accepted', 'declined', 'expired',
    'cancelled_by_rider', 'cancelled_by_driver', 'no_show'
);

CREATE TABLE ride_requests (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id                 UUID NOT NULL REFERENCES rides(id),
    rider_id                UUID NOT NULL REFERENCES users(id),
    status                  request_status_enum NOT NULL DEFAULT 'pending',
    requested_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    expiry_at               TIMESTAMPTZ NOT NULL,    -- computed: fraction x time-remaining-to-departure
    responded_at            TIMESTAMPTZ,
    gender_filter_applied   BOOLEAN NOT NULL DEFAULT false,
    deleted_at              TIMESTAMPTZ,             -- soft delete
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Prevents duplicate simultaneously-active requests from the same rider on the same ride
    CONSTRAINT unique_active_request UNIQUE (ride_id, rider_id)
);

-- Partial index enforcing the constraint only while a request is genuinely "active"
CREATE UNIQUE INDEX idx_unique_active_ride_request
    ON ride_requests(ride_id, rider_id)
    WHERE status IN ('pending', 'accepted');

CREATE INDEX idx_ride_requests_ride_status ON ride_requests(ride_id, status);
CREATE INDEX idx_ride_requests_rider_id ON ride_requests(rider_id);
```

---

## 6. ratings
Explicit post-ride 1-5 star ratings (both directions: driver rates rider, rider rates driver).

```sql
CREATE TABLE ratings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id     UUID NOT NULL REFERENCES rides(id),
    rater_id    UUID NOT NULL REFERENCES users(id),
    ratee_id    UUID NOT NULL REFERENCES users(id),
    stars       INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ratings_ratee_id ON ratings(ratee_id);
```

---

## 7. incident_logs
Covers no-shows, tiered cancellations, and driver mid-route cancellations — feeds the composite reliability score and future abuse-pattern detection.

```sql
CREATE TYPE incident_type_enum AS ENUM (
    'no_show', 'late_cancellation', 'early_cancellation', 'driver_midroute_cancellation'
);
CREATE TYPE ride_stage_enum AS ENUM ('before_departure', 'after_departure', 'at_pickup');

CREATE TABLE incident_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id         UUID NOT NULL REFERENCES rides(id),
    user_id         UUID NOT NULL REFERENCES users(id),   -- who the incident is attributed to
    incident_type   incident_type_enum NOT NULL,
    stage           ride_stage_enum NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incident_logs_user_id ON incident_logs(user_id);
CREATE INDEX idx_incident_logs_ride_id ON incident_logs(ride_id);
```

---

## 8. notifications
Persistent source of truth for all notifications; Socket.IO delivers live on top of this.

```sql
CREATE TYPE notification_type_enum AS ENUM (
    'request_accepted', 'request_declined', 'request_expired',
    'ride_departed', 'no_show_flagged', 'ride_completed', 'general'
);

CREATE TABLE notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    type                notification_type_enum NOT NULL,
    title               TEXT NOT NULL,
    body                TEXT NOT NULL,
    related_ride_id     UUID REFERENCES rides(id),
    is_read             BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    -- hard-delete table: old/read notifications can be purged safely, no dispute value
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read);
```

---

## 9. messages
Pre-departure coordination chat, persisted per ride. Phase-II adds a 30-day post-completion auto-purge job.

```sql
CREATE TABLE messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id     UUID NOT NULL REFERENCES rides(id),
    sender_id   UUID NOT NULL REFERENCES users(id),
    receiver_id UUID NOT NULL REFERENCES users(id),
    content     TEXT NOT NULL,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    -- hard-delete table: Phase-II adds scheduled purge of rows where sent_at < (ride completed_at - 30 days)
);

CREATE INDEX idx_messages_ride_id ON messages(ride_id);
```

---

## Design Notes / Rationale Summary

| Decision | Reasoning |
|---|---|
| `university_id` on `users` and `rides` | Multi-tenant-ready from day one; costs nothing now, avoids painful retrofit later |
| `GEOGRAPHY(Point, 4326)` + GiST index | Enables fast `ST_DWithin()` / `ST_Distance()` spatial queries — core to route/detour matching |
| Composite index `(status, departure_time)` on rides | Matches the exact query pattern of every search (active rides within a time window) |
| Partial unique constraint on `ride_requests` | Prevents duplicate active requests under race conditions (double-tap, network retry) — enforced at DB level, not just app logic |
| Cached `composite_rating`, `completed_rides_count` on `users` | Denormalized for read performance — avoids recomputing from full history on every search |
| Soft-delete (`deleted_at`) on `users`, `rides`, `ride_requests` | Preserves referential integrity for ratings/incident history tied to these records |
| Hard-delete on `notifications`, `messages` | No dispute/history value in keeping these indefinitely; keeps tables lean |
| `gender_preference` on `rides` (mirrors rider-side filter) | Symmetric safety design — drivers get equal say in who can request their ride, not just riders |
| `incident_logs` separate from `ratings` | Explicit stars (subjective) vs. system-tracked behavioral facts (objective) — feeds the two-layer composite rating |

**Not yet included (Phase-II, per locked roadmap):**
- `location_history` table (GPS snapshot persistence for dispute resolution)
- Vector/embedding storage for semantic address matching (likely `pgvector` extension, cached per-ride rather than recomputed on every search)
- Auto-purge scheduled jobs for `messages` (30-day policy)
