-- AutoQA Pilot Database Initialization Script
-- Production-ready PostgreSQL setup with security and performance optimizations

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create application user with limited privileges
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'autoqa_app') THEN
        CREATE ROLE autoqa_app WITH LOGIN PASSWORD 'autoqa_app_password';
    END IF;
END
$$;

-- Grant necessary permissions
GRANT CONNECT ON DATABASE autoqa_pilot TO autoqa_app;
GRANT USAGE ON SCHEMA public TO autoqa_app;
GRANT CREATE ON SCHEMA public TO autoqa_app;

-- Create audit log table for security tracking
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(255) NOT NULL,
    operation VARCHAR(10) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id UUID,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for audit log performance
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_operation ON audit_log(table_name, operation);

-- Set up connection limits and timeouts
ALTER DATABASE autoqa_pilot SET statement_timeout = '30s';
ALTER DATABASE autoqa_pilot SET idle_in_transaction_session_timeout = '10min';
ALTER DATABASE autoqa_pilot SET lock_timeout = '5s';

-- Configure logging for security and performance monitoring
ALTER DATABASE autoqa_pilot SET log_statement = 'mod';
ALTER DATABASE autoqa_pilot SET log_min_duration_statement = 1000;
ALTER DATABASE autoqa_pilot SET log_connections = on;
ALTER DATABASE autoqa_pilot SET log_disconnections = on;

-- Create function for automatic updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create function for audit logging
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