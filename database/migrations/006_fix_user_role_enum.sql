-- Migration: 006_fix_user_role_enum
-- Normalizes user_role enum to exactly: voter, admin
-- Handles legacy enum values (student, observer) by mapping them to voter.

DO $$
DECLARE
    labels text[];
BEGIN
    -- Fresh databases may not have the enum yet.
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('voter', 'admin');
        RETURN;
    END IF;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
    INTO labels
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role';

    -- Already correct: no-op.
    IF labels = ARRAY['voter', 'admin'] THEN
        RETURN;
    END IF;

    -- Build replacement enum with desired values.
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_v2') THEN
        DROP TYPE user_role_v2;
    END IF;

    CREATE TYPE user_role_v2 AS ENUM ('voter', 'admin');

    -- Migrate data safely from any legacy role set.
    ALTER TABLE users
        ALTER COLUMN role DROP DEFAULT;

    ALTER TABLE users
        ALTER COLUMN role TYPE user_role_v2
        USING (
            CASE lower(role::text)
                WHEN 'admin' THEN 'admin'
                WHEN 'voter' THEN 'voter'
                WHEN 'student' THEN 'voter'
                WHEN 'observer' THEN 'voter'
                ELSE 'voter'
            END
        )::user_role_v2;

    DROP TYPE user_role;
    ALTER TYPE user_role_v2 RENAME TO user_role;

    ALTER TABLE users
        ALTER COLUMN role SET DEFAULT 'voter'::user_role;
END
$$;
