-- Seed Data for Graphic Era Hill University (GEHU), Dehradun

INSERT INTO universities (id, name, email_domain)
VALUES (
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    'Graphic Era Hill University, Dehradun',
    'gehu.ac.in'
)
ON CONFLICT (email_domain) DO NOTHING;
