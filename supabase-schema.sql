-- Vision 61 Studios — Supabase Leads Table Schema
-- Run this in your Supabase SQL Editor to create the leads table.

-- 1. Create the leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  business_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  source TEXT NOT NULL DEFAULT 'unknown',
  audit_score_mobile INTEGER,
  audit_score_desktop INTEGER,
  audit_url TEXT DEFAULT '',
  service_interest TEXT DEFAULT '',
  message TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Index on source for filtering
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads (source);

-- 3. Index on status for pipeline filtering
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);

-- 4. Index on created_at for date sorting
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);

-- 5. Row Level Security — allow anonymous INSERT from the marketing site
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Allow anyone to INSERT (the marketing site uses the anon key)
CREATE POLICY "Allow anonymous inserts" ON leads
  FOR INSERT
  WITH CHECK (true);

-- Allow authenticated users to SELECT (for CRM dashboard)
CREATE POLICY "Allow authenticated reads" ON leads
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow authenticated users to UPDATE (for CRM pipeline management)
CREATE POLICY "Allow authenticated updates" ON leads
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- 6. Auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
