-- schema.sql
-- SQL schema for MCP Viral System, designed for Supabase.

-- Note: Supabase handles its own 'auth.users' table for authentication.
-- This schema defines tables for application-specific data that often reference 'auth.users.id'.
-- Ensure RLS (Row Level Security) is enabled on these tables in your Supabase dashboard as needed.

-- Public user profile information, extending Supabase's auth.users
CREATE TABLE public.users (
    id UUID NOT NULL PRIMARY KEY, -- This should match the id from auth.users
    email TEXT, -- Can be denormalized from auth.users or managed separately if profiles can exist without login
    full_name TEXT,
    avatar_url TEXT,
    subscription_status TEXT DEFAULT 'free' NOT NULL, -- e.g., 'free', 'premium_monthly', 'premium_annual'
    subscription_expires_at TIMESTAMPTZ,
    solana_wallet_address TEXT, -- For linking payments or other Web3 interactions
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users table
CREATE TRIGGER users_updated_at_modtime
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- User preferences for services
CREATE TABLE public.user_service_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL, -- e.g., 'image_generation', 'voice_generation', 'video_generation', 'social_distribution'
    service_id TEXT NOT NULL,   -- e.g., 'runway', 'claude_opus', 'elevenlabs_v2', 'user_added_blotato'
    priority INTEGER NOT NULL DEFAULT 0, -- Lower number means higher priority for that type
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (user_id, service_type, service_id), -- Ensure a user doesn't have duplicate entries for the same service
    UNIQUE (user_id, service_type, priority) -- Ensure priority is unique for a given type per user
);

-- Trigger for user_service_preferences table (if you want updated_at on this too)
-- CREATE TRIGGER user_service_preferences_updated_at_modtime
-- BEFORE UPDATE ON public.user_service_preferences
-- FOR EACH ROW
-- EXECUTE FUNCTION public.update_updated_at_column();


-- Payment records
CREATE TABLE public.payments (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    external_transaction_id TEXT UNIQUE, -- e.g., Solana transaction signature, Stripe charge ID
    amount DECIMAL(12, 6) NOT NULL, -- Using 12,6 for crypto, adjust if only fiat
    currency TEXT NOT NULL, -- e.g., 'SOL', 'USD'
    payment_method TEXT DEFAULT 'solana' NOT NULL,
    status TEXT NOT NULL, -- e.g., 'pending', 'succeeded', 'failed', 'refunded'
    subscription_months INTEGER, -- e.g., 1 for monthly, 12 for annual
    metadata JSONB, -- For any extra details from payment gateway or notes
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Trigger for payments table
CREATE TRIGGER payments_updated_at_modtime
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Log for admin notifications sent via Telegram or other means
CREATE TABLE public.admin_notifications_log (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL, -- e.g., 'new_user_signup', 'payment_received', 'critical_error', 'user_feedback'
    message TEXT NOT NULL,
    details JSONB, -- Any relevant data associated with the event
    sent_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    status TEXT DEFAULT 'sent' NOT NULL -- e.g., 'sent', 'failed_to_send'
);

-- Example: How to link public.users to auth.users using a trigger (optional, can also be handled by application logic)
-- This function assumes that when a new user signs up via Supabase Auth,
-- you want to create a corresponding row in public.users.
-- CREATE OR REPLACE FUNCTION public.handle_new_user()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   INSERT INTO public.users (id, email)
--   VALUES (NEW.id, NEW.email);
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Note: The above trigger for handle_new_user needs to be created by a superuser in Supabase SQL editor.
-- RLS policies for these tables should be configured in the Supabase dashboard
-- to control access based on user roles and authentication status.
-- For example, users should only be able to read/update their own preferences and profile.

COMMENT ON COLUMN public.users.id IS 'Must match the id from Supabase''s auth.users table.';
COMMENT ON COLUMN public.user_service_preferences.user_id IS 'References Supabase''s auth.users table.';
COMMENT ON COLUMN public.payments.user_id IS 'References Supabase''s auth.users table.';
COMMENT ON COLUMN public.payments.amount IS 'Using precision 12 and scale 6 to accommodate cryptocurrencies like SOL. Adjust if only dealing with fiat like USD (e.g., 10,2).';
