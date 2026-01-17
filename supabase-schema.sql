-- TradeTok Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for trade direction
CREATE TYPE trade_direction AS ENUM ('LONG', 'SHORT');

-- ============================================
-- USERS TABLE
-- Stores all platform users (identified by wallet address)
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    avatar_emoji TEXT DEFAULT '🧑‍💼',
    bio TEXT,
    is_verified BOOLEAN DEFAULT false,
    total_followers INTEGER DEFAULT 0,
    total_following INTEGER DEFAULT 0,
    total_trades INTEGER DEFAULT 0,
    win_rate DECIMAL(5,2) DEFAULT 0,
    total_pnl DECIMAL(18,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast wallet lookup
CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_users_username ON users(username);

-- ============================================
-- TRADE POSTS TABLE
-- Each trade execution creates a post on the feed
-- ============================================
CREATE TABLE trade_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position_id TEXT, -- Pear Protocol position ID
    pair TEXT NOT NULL, -- Display format: 'BTC/USDC' or 'BTC+ETH/DOGE+SHIB'
    long_assets JSONB, -- Array of { asset: string, weight: number }
    short_assets JSONB, -- Array of { asset: string, weight: number }
    direction trade_direction NOT NULL,
    entry_price DECIMAL(24,8) NOT NULL,
    current_price DECIMAL(24,8) NOT NULL,
    leverage INTEGER DEFAULT 1,
    size_usd DECIMAL(18,2) NOT NULL,
    take_profit DECIMAL(24,8),
    stop_loss DECIMAL(24,8),
    thesis_text TEXT,
    voice_note_url TEXT,
    pnl_percentage DECIMAL(10,4) DEFAULT 0,
    pnl_usd DECIMAL(18,2) DEFAULT 0,
    is_open BOOLEAN DEFAULT true,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    copies_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

-- Indexes for feed queries
CREATE INDEX idx_posts_creator ON trade_posts(creator_id);
CREATE INDEX idx_posts_created ON trade_posts(created_at DESC);
CREATE INDEX idx_posts_is_open ON trade_posts(is_open);

-- ============================================
-- FOLLOWS TABLE
-- Many-to-many relationship for user follows
-- ============================================
CREATE TABLE follows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

-- Indexes for follow queries
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- ============================================
-- LIKES TABLE
-- Track which users liked which posts
-- ============================================
CREATE TABLE likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES trade_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, post_id)
);

-- Index for like queries
CREATE INDEX idx_likes_post ON likes(post_id);
CREATE INDEX idx_likes_user ON likes(user_id);

-- ============================================
-- COPY TRADES TABLE
-- Track when users copy a trade
-- ============================================
CREATE TABLE copy_trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    copier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_post_id UUID NOT NULL REFERENCES trade_posts(id) ON DELETE CASCADE,
    copier_position_id TEXT, -- Pear Protocol position ID for the copier
    size_usd DECIMAL(18,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for copy trade queries
CREATE INDEX idx_copies_post ON copy_trades(original_post_id);
CREATE INDEX idx_copies_copier ON copy_trades(copier_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Trigger for trade_posts table
CREATE TRIGGER trigger_posts_updated_at
    BEFORE UPDATE ON trade_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Function to increment/decrement follower counts
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users SET total_followers = total_followers + 1 WHERE id = NEW.following_id;
        UPDATE users SET total_following = total_following + 1 WHERE id = NEW.follower_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users SET total_followers = total_followers - 1 WHERE id = OLD.following_id;
        UPDATE users SET total_following = total_following - 1 WHERE id = OLD.follower_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger for follows table
CREATE TRIGGER trigger_follow_counts
    AFTER INSERT OR DELETE ON follows
    FOR EACH ROW
    EXECUTE FUNCTION update_follow_counts();

-- Function to increment/decrement like counts
CREATE OR REPLACE FUNCTION update_like_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE trade_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE trade_posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger for likes table
CREATE TRIGGER trigger_like_counts
    AFTER INSERT OR DELETE ON likes
    FOR EACH ROW
    EXECUTE FUNCTION update_like_counts();

-- Function to increment copy counts
CREATE OR REPLACE FUNCTION update_copy_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE trade_posts SET copies_count = copies_count + 1 WHERE id = NEW.original_post_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger for copy_trades table
CREATE TRIGGER trigger_copy_counts
    AFTER INSERT ON copy_trades
    FOR EACH ROW
    EXECUTE FUNCTION update_copy_counts();

-- Function to update trade counts
CREATE OR REPLACE FUNCTION update_trade_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users SET total_trades = total_trades + 1 WHERE id = NEW.creator_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users SET total_trades = total_trades - 1 WHERE id = OLD.creator_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger for trade_posts table (trade count)
CREATE TRIGGER trigger_trade_counts
    AFTER INSERT OR DELETE ON trade_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_trade_counts();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE copy_trades ENABLE ROW LEVEL SECURITY;

-- Users policies (public read, authenticated write)
CREATE POLICY "Users are viewable by everyone" ON users
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON users
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own profile" ON users
    FOR UPDATE USING (true);

-- Trade posts policies (public read, creator write)
CREATE POLICY "Posts are viewable by everyone" ON trade_posts
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create posts" ON trade_posts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Creators can update their posts" ON trade_posts
    FOR UPDATE USING (true);

-- Follows policies
CREATE POLICY "Follows are viewable by everyone" ON follows
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can follow" ON follows
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can unfollow" ON follows
    FOR DELETE USING (true);

-- Likes policies
CREATE POLICY "Likes are viewable by everyone" ON likes
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can like" ON likes
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can unlike" ON likes
    FOR DELETE USING (true);

-- Copy trades policies
CREATE POLICY "Copy trades are viewable by everyone" ON copy_trades
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can copy trades" ON copy_trades
    FOR INSERT WITH CHECK (true);
