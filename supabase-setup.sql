-- ================================================================
-- Arena Champions '98 — Supabase Database Setup SQL
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- Project: qupwfpijbtzgitdzawvx
-- ================================================================

-- 1. Leaderboard table
CREATE TABLE IF NOT EXISTS leaderboard (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  fid BIGINT,
  wins INTEGER DEFAULT 0 NOT NULL,
  losses INTEGER DEFAULT 0 NOT NULL,
  points INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Index for fast leaderboard queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_wins ON leaderboard (wins DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_points ON leaderboard (points DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_fid ON leaderboard (fid);

-- 3. Match history table (optional, for tracking all games)
CREATE TABLE IF NOT EXISTS match_history (
  id BIGSERIAL PRIMARY KEY,
  player1_name TEXT NOT NULL,
  player2_name TEXT NOT NULL,
  winner_name TEXT,
  player1_fid BIGINT,
  player2_fid BIGINT,
  player1_character TEXT,
  player2_character TEXT,
  rounds_p1 INTEGER DEFAULT 0,
  rounds_p2 INTEGER DEFAULT 0,
  points_awarded INTEGER DEFAULT 0,
  mode TEXT DEFAULT 'cpu',
  stage INTEGER,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. Index for match history queries
CREATE INDEX IF NOT EXISTS idx_match_history_player1 ON match_history (player1_name);
CREATE INDEX IF NOT EXISTS idx_match_history_player2 ON match_history (player2_name);
CREATE INDEX IF NOT EXISTS idx_match_history_created ON match_history (created_at DESC);

-- 5. Active rooms table (for PvP matchmaking via Supabase Realtime)
CREATE TABLE IF NOT EXISTS active_rooms (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  host_name TEXT NOT NULL,
  host_fid BIGINT,
  host_character TEXT,
  status TEXT DEFAULT 'waiting' NOT NULL, -- waiting, ready, playing, finished
  guest_name TEXT,
  guest_fid BIGINT,
  guest_character TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 6. Index for active rooms
CREATE INDEX IF NOT EXISTS idx_active_rooms_code ON active_rooms (code);
CREATE INDEX IF NOT EXISTS idx_active_rooms_status ON active_rooms (status);

-- 7. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER leaderboard_updated_at
  BEFORE UPDATE ON leaderboard
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER active_rooms_updated_at
  BEFORE UPDATE ON active_rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 8. Clean up stale rooms (rooms older than 30 minutes)
CREATE OR REPLACE FUNCTION cleanup_stale_rooms()
RETURNS void AS $$
BEGIN
  DELETE FROM active_rooms
  WHERE status = 'waiting'
  AND created_at < NOW() - INTERVAL '30 minutes';
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ================================================================

-- Enable RLS on all tables
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_rooms ENABLE ROW LEVEL SECURITY;

-- Leaderboard: anyone can read, anyone can insert/update their own record
CREATE POLICY "Leaderboard is readable by all"
  ON leaderboard FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert leaderboard entries"
  ON leaderboard FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update leaderboard entries"
  ON leaderboard FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Match history: anyone can read, anyone can insert
CREATE POLICY "Match history is readable by all"
  ON match_history FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert match history"
  ON match_history FOR INSERT
  WITH CHECK (true);

-- Active rooms: anyone can read, insert, update, delete
CREATE POLICY "Active rooms are readable by all"
  ON active_rooms FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert active rooms"
  ON active_rooms FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update active rooms"
  ON active_rooms FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete active rooms"
  ON active_rooms FOR DELETE
  USING (true);

-- ================================================================
-- Enable Realtime for active_rooms (for PvP matchmaking)
-- ================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE active_rooms;

-- ================================================================
-- Done! Verify with:
-- SELECT * FROM leaderboard LIMIT 5;
-- ================================================================
