-- AutoQA Pilot Test Database Initialization Script
-- Minimal setup for testing environment

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create test application user
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'autoqa_test_app') THEN
        CREATE ROLE autoqa_test_app WITH LOGIN PASSWORD 'autoqa_test_app_password';
    END IF;
END
$$;

-- Grant necessary permissions
GRANT CONNECT ON DATABASE autoqa_pilot_test TO autoqa_test_app;
GRANT USAGE ON SCHEMA public TO autoqa_test_app;
GRANT CREATE ON SCHEMA public TO autoqa_test_app;

-- Create minimal audit log table for testing
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(255) NOT NULL,
    operation VARCHAR(10) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- Set up optimized settings for testing
ALTER DATABASE autoqa_pilot_test SET statement_timeout = '10s';
ALTER DATABASE autoqa_pilot_test SET idle_in_transaction_session_timeout = '5min';
ALTER DATABASE autoqa_pilot_test SET lock_timeout = '2s';

-- Disable logging for testing (reduce noise)
ALTER DATABASE autoqa_pilot_test SET log_statement = 'none';
ALTER DATABASE autoqa_pilot_test SET log_min_duration_statement = -1;
ALTER DATABASE autoqa_pilot_test SET log_connections = off;
ALTER DATABASE autoqa_pilot_test SET log_disconnections = off;

-- Create function for automatic updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Simplified audit function for testing
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (table_name, operation, old_values)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD));
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (table_name, operation, old_values, new_values)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (table_name, operation, new_values)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;