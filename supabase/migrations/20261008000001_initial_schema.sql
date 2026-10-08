-- Campus Carpool Matching Platform
-- Initial Schema Migration: PostGIS Extension, Custom Types, 9 Core Tables & Indexes

-- 1. Enable PostGIS Extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Custom ENUM Types
CREATE TYPE user_role AS ENUM ('student', 'admin');
CREATE TYPE verification_status_enum AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE vehicle_type_enum AS ENUM ('bike', 'scooty', 'car');
CREATE TYPE ride_status_enum AS ENUM ('posted', 'departed', 'completed', 'cancelled');
CREATE TYPE gender_pref_enum AS ENUM ('no_preference', 'same_gender_only');
CREATE TYPE request_status_enum AS ENUM (
    'pending', 'accepted', 'declined', 'expired',
    'cancelled_by_rider', 'cancelled_by_driver', 'no_show'
);
CREATE TYPE incident_type_enum AS ENUM (
    'no_show', 'late_cancellation', 'early_cancellation', 'driver_midroute_cancellation'
);
CREATE TYPE ride_stage_enum AS ENUM ('before_departure', 'after_departure', 'at_pickup');
CREATE TYPE notification_type_enum AS ENUM (
    'request_accepted', 'request_declined', 'request_expired',
    'ride_departed', 'no_show_flagged', 'ride_completed', 'general'
);

-- 3. Table: universities
CREATE TABLE universities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    email_domain    TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Table: users
CREATE TABLE users (
    id                          UUID PRIMARY KEY, -- links to Supabase auth.users.id
    university_id               UUID NOT NULL REFERENCES universities(id),
    name                        TEXT NOT NULL,
    email                       TEXT NOT NULL UNIQUE,
    phone_number                TEXT,
    parent_contact_number       TEXT,
    student_id_number           TEXT NOT NULL,
    branch                      TEXT,
    course                      TEXT,
    year                        INT,
    semester                    INT,
    role                        user_role NOT NULL DEFAULT 'student',
    verification_status         verification_status_enum NOT NULL DEFAULT 'pending',
    id_card_image_url           TEXT,
    profile_photo_url           TEXT,
    upi_id                      TEXT,
    dl_number                   TEXT,
    dl_verified                 BOOLEAN NOT NULL DEFAULT false,
    composite_rating            DECIMAL(2,1) DEFAULT 5.0,
    completed_rides_count       INT NOT NULL DEFAULT 0,
    no_show_count               INT NOT NULL DEFAULT 0,
    late_cancellation_count     INT NOT NULL DEFAULT 0,
    deleted_at                  TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_verification_status ON users(verification_status);
CREATE INDEX idx_users_university_id ON users(university_id);

-- 5. Table: vehicles
CREATE TABLE vehicles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    vehicle_type    vehicle_type_enum NOT NULL,
    seat_capacity   INT NOT NULL,
    vehicle_number  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicles_user_id ON vehicles(user_id);

-- 6. Table: rides
CREATE TABLE rides (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id               UUID NOT NULL REFERENCES users(id),
    vehicle_id              UUID NOT NULL REFERENCES vehicles(id),
    university_id           UUID NOT NULL REFERENCES universities(id),
    origin_point            GEOGRAPHY(Point, 4326) NOT NULL,
    origin_address_text     TEXT NOT NULL,
    destination_point       GEOGRAPHY(Point, 4326) NOT NULL,
    departure_time          TIMESTAMPTZ NOT NULL,
    available_seats         INT NOT NULL,
    price_per_seat          DECIMAL(6,2),
    gender_preference       gender_pref_enum NOT NULL DEFAULT 'no_preference',
    status                  ride_status_enum NOT NULL DEFAULT 'posted',
    posted_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rides_origin_point ON rides USING GIST (origin_point);
CREATE INDEX idx_rides_status_departure ON rides(status, departure_time);
CREATE INDEX idx_rides_university_id ON rides(university_id);
CREATE INDEX idx_rides_driver_id ON rides(driver_id);

-- 7. Table: ride_requests
CREATE TABLE ride_requests (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id                 UUID NOT NULL REFERENCES rides(id),
    rider_id                UUID NOT NULL REFERENCES users(id),
    status                  request_status_enum NOT NULL DEFAULT 'pending',
    requested_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    expiry_at               TIMESTAMPTZ NOT NULL,
    responded_at            TIMESTAMPTZ,
    gender_filter_applied   BOOLEAN NOT NULL DEFAULT false,
    deleted_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_active_request UNIQUE (ride_id, rider_id)
);

CREATE UNIQUE INDEX idx_unique_active_ride_request
    ON ride_requests(ride_id, rider_id)
    WHERE status IN ('pending', 'accepted');

CREATE INDEX idx_ride_requests_ride_status ON ride_requests(ride_id, status);
CREATE INDEX idx_ride_requests_rider_id ON ride_requests(rider_id);

-- 8. Table: ratings
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
CREATE INDEX idx_ratings_ride_id ON ratings(ride_id);

-- 9. Table: incident_logs
CREATE TABLE incident_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id         UUID NOT NULL REFERENCES rides(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    incident_type   incident_type_enum NOT NULL,
    stage           ride_stage_enum NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incident_logs_user_id ON incident_logs(user_id);
CREATE INDEX idx_incident_logs_ride_id ON incident_logs(ride_id);

-- 10. Table: notifications
CREATE TABLE notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    type                notification_type_enum NOT NULL,
    title               TEXT NOT NULL,
    body                TEXT NOT NULL,
    related_ride_id     UUID REFERENCES rides(id),
    is_read             BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read);

-- 11. Table: messages
CREATE TABLE messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id     UUID NOT NULL REFERENCES rides(id),
    sender_id   UUID NOT NULL REFERENCES users(id),
    receiver_id UUID NOT NULL REFERENCES users(id),
    content     TEXT NOT NULL,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_ride_id ON messages(ride_id);
