-- Development seed data
-- Run after migrations to populate local environment with test data

-- ── Create admin user ────────────────────────────────────────────────────────
-- Password: Admin@123456 (Argon2id hash — generate fresh in scripts/seed.sh)
INSERT INTO users (email, password_hash, full_name, role, is_active, email_verified)
VALUES (
    'admin@university.edu',
    '$argon2id$v=19$m=19456,t=2,p=1$placeholder_hash_replace_with_real',
    'Dr. Rajesh Kumar',
    'admin',
    TRUE,
    TRUE
)
ON CONFLICT (email) DO NOTHING;

-- ── Create student users ──────────────────────────────────────────────────────
INSERT INTO users (email, password_hash, full_name, student_id, department, role, is_active, email_verified)
VALUES
    ('priya.sharma@university.edu',   '$argon2id$v=19$placeholder', 'Priya Sharma',   'STU-2024-001', 'Computer Science',       'student', TRUE, TRUE),
    ('arjun.patel@university.edu',    '$argon2id$v=19$placeholder', 'Arjun Patel',    'STU-2024-002', 'Electronics',            'student', TRUE, TRUE),
    ('sneha.reddy@university.edu',    '$argon2id$v=19$placeholder', 'Sneha Reddy',    'STU-2024-003', 'Civil',                  'student', TRUE, TRUE),
    ('rahul.gupta@university.edu',    '$argon2id$v=19$placeholder', 'Rahul Gupta',    'STU-2024-004', 'Mechanical',             'student', TRUE, TRUE),
    ('aisha.khan@university.edu',     '$argon2id$v=19$placeholder', 'Aisha Khan',     'STU-2024-005', 'Business Administration', 'student', TRUE, TRUE)
ON CONFLICT (email) DO NOTHING;

-- ── Upcoming election ─────────────────────────────────────────────────────────
INSERT INTO elections (title, description, start_time, end_time, status, created_by, is_public_results)
SELECT
    'Student Council President 2024',
    'Elect the president of the student council for the academic year 2024-25. The president will represent students in all university governance meetings.',
    NOW() + INTERVAL '1 day',
    NOW() + INTERVAL '3 days',
    'upcoming',
    id,
    TRUE
FROM users WHERE email = 'admin@university.edu'
ON CONFLICT DO NOTHING;

-- ── Active election ───────────────────────────────────────────────────────────
INSERT INTO elections (title, description, start_time, end_time, status, created_by, is_public_results)
SELECT
    'Cultural Secretary Election 2024',
    'Vote for the Cultural Secretary who will organize all cultural events and festivals on campus.',
    NOW() - INTERVAL '1 hour',
    NOW() + INTERVAL '2 days',
    'active',
    id,
    TRUE
FROM users WHERE email = 'admin@university.edu'
ON CONFLICT DO NOTHING;

-- ── Candidates for the active election ────────────────────────────────────────
INSERT INTO candidates (election_id, name, manifesto, department, position)
SELECT
    e.id,
    'Vikram Nair',
    'I will bring fresh ideas and energy to our cultural scene. My vision is to organize at least one major cultural event every month and ensure all departments participate.',
    'Arts & Humanities',
    'Cultural Secretary Candidate'
FROM elections e WHERE e.title = 'Cultural Secretary Election 2024'
ON CONFLICT DO NOTHING;

INSERT INTO candidates (election_id, name, manifesto, department, position)
SELECT
    e.id,
    'Meera Iyer',
    'As a passionate artist and organizer, I will create inclusive cultural events that celebrate our diverse student community. I will also launch an annual inter-college arts festival.',
    'Computer Science',
    'Cultural Secretary Candidate'
FROM elections e WHERE e.title = 'Cultural Secretary Election 2024'
ON CONFLICT DO NOTHING;

INSERT INTO candidates (election_id, name, manifesto, department, position)
SELECT
    e.id,
    'Kabir Singh',
    'With 2 years of event management experience, I will professionalize our cultural events, secure external sponsorships, and create a dedicated cultural fund.',
    'Business Administration',
    'Cultural Secretary Candidate'
FROM elections e WHERE e.title = 'Cultural Secretary Election 2024'
ON CONFLICT DO NOTHING;
