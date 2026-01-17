// Database Service - All Supabase operations for TradeTok

import { supabase } from './supabase';
import type {
  User,
  UserInsert,
  UserUpdate,
  TradePost,
  TradePostInsert,
  TradePostUpdate,
  TradePostWithCreator,
  CopyTradeInsert,
} from '@/types/database';

// ============================================
// USER OPERATIONS
// ============================================

export const userService = {
  // Get user by wallet address
  async getByWallet(walletAddress: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user:', error);
    }
    return data;
  },

  // Get user by ID
  async getById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) console.error('Error fetching user:', error);
    return data;
  },

  // Get user by username
  async getByUsername(username: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.toLowerCase())
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user:', error);
    }
    return data;
  },

  // Create new user
  async create(user: UserInsert): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .insert({
        ...user,
        wallet_address: user.wallet_address.toLowerCase(),
        username: user.username.toLowerCase(),
      })
      .select()
      .single();
    
    if (error) console.error('Error creating user:', error);
    return data;
  },

  // Update user
  async update(id: string, updates: UserUpdate): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) console.error('Error updating user:', error);
    return data;
  },

  // Get or create user by wallet
  async getOrCreate(walletAddress: string, username?: string): Promise<User | null> {
    let user = await this.getByWallet(walletAddress);
    
    if (!user) {
      // Generate a random username if not provided
      const defaultUsername = username || `trader_${walletAddress.slice(2, 8).toLowerCase()}`;
      user = await this.create({
        wallet_address: walletAddress,
        username: defaultUsername,
      });
    }
    
    return user;
  },

  // Search users by username
  async search(query: string, limit = 10): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', `%${query}%`)
      .limit(limit);
    
    if (error) console.error('Error searching users:', error);
    return data || [];
  },

  // Get top traders by win rate
  async getTopTraders(limit = 10): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('win_rate', { ascending: false })
      .limit(limit);
    
    if (error) console.error('Error fetching top traders:', error);
    return data || [];
  },
};

// ============================================
// TRADE POST OPERATIONS
// ============================================

export const postService = {
  // Get all posts (For You feed - random/recent)
  async getFeed(limit = 20, offset = 0): Promise<TradePostWithCreator[]> {
    const { data, error } = await supabase
      .from('trade_posts')
      .select(`
        *,
        creator:users!creator_id(*)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) console.error('Error fetching feed:', error);
    return (data as TradePostWithCreator[]) || [];
  },

  // Get posts from followed users (Following feed)
  async getFollowingFeed(userId: string, limit = 20, offset = 0): Promise<TradePostWithCreator[]> {
    // First get the list of users this user follows
    const { data: follows, error: followError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId);
    
    if (followError || !follows || follows.length === 0) {
      return [];
    }
    
    const followingIds = follows.map(f => f.following_id);
    
    const { data, error } = await supabase
      .from('trade_posts')
      .select(`
        *,
        creator:users!creator_id(*)
      `)
      .in('creator_id', followingIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) console.error('Error fetching following feed:', error);
    return (data as TradePostWithCreator[]) || [];
  },

  // Get posts by user
  async getByUser(userId: string, limit = 20): Promise<TradePost[]> {
    const { data, error } = await supabase
      .from('trade_posts')
      .select('*')
      .eq('creator_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) console.error('Error fetching user posts:', error);
    return data || [];
  },

  // Get single post by ID
  async getById(id: string): Promise<TradePostWithCreator | null> {
    const { data, error } = await supabase
      .from('trade_posts')
      .select(`
        *,
        creator:users!creator_id(*)
      `)
      .eq('id', id)
      .single();
    
    if (error) console.error('Error fetching post:', error);
    return data as TradePostWithCreator;
  },

  // Create new trade post
  async create(post: TradePostInsert): Promise<TradePost | null> {
    const { data, error } = await supabase
      .from('trade_posts')
      .insert(post)
      .select()
      .single();
    
    if (error) console.error('Error creating post:', error);
    // User total_trades is automatically incremented by DB trigger
    
    return data;
  },

  // Update trade post (for live PnL updates)
  async update(id: string, updates: TradePostUpdate): Promise<TradePost | null> {
    const { data, error } = await supabase
      .from('trade_posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) console.error('Error updating post:', error);
    return data;
  },

  // Close a position
  async closePosition(id: string, finalPnl: number, finalPnlUsd: number): Promise<TradePost | null> {
    return this.update(id, {
      is_open: false,
      pnl_percentage: finalPnl,
      pnl_usd: finalPnlUsd,
      closed_at: new Date().toISOString(),
    });
  },
};

// ============================================
// FOLLOW OPERATIONS
// ============================================

export const followService = {
  // Follow a user
  async follow(followerId: string, followingId: string): Promise<boolean> {
    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: followerId, following_id: followingId });
    
    if (error) {
      console.error('Error following user:', error);
      return false;
    }
    return true;
  },

  // Unfollow a user
  async unfollow(followerId: string, followingId: string): Promise<boolean> {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingId);
    
    if (error) {
      console.error('Error unfollowing user:', error);
      return false;
    }
    return true;
  },

  // Check if user is following another
  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error checking follow status:', error);
    }
    return !!data;
  },

  // Get followers of a user
  async getFollowers(userId: string): Promise<User[]> {
    const { data, error } = await supabase
      .from('follows')
      .select('follower:users!follower_id(*)')
      .eq('following_id', userId);
    
    if (error) console.error('Error fetching followers:', error);
    return data?.map(f => f.follower as unknown as User) || [];
  },

  // Get users that a user follows
  async getFollowing(userId: string): Promise<User[]> {
    const { data, error } = await supabase
      .from('follows')
      .select('following:users!following_id(*)')
      .eq('follower_id', userId);
    
    if (error) console.error('Error fetching following:', error);
    return data?.map(f => f.following as unknown as User) || [];
  },
};

// ============================================
// LIKE OPERATIONS
// ============================================

export const likeService = {
  // Like a post
  async like(userId: string, postId: string): Promise<boolean> {
    const { error } = await supabase
      .from('likes')
      .insert({ user_id: userId, post_id: postId });
    
    if (error) {
      console.error('Error liking post:', error);
      return false;
    }
    return true;
  },

  // Unlike a post
  async unlike(userId: string, postId: string): Promise<boolean> {
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('user_id', userId)
      .eq('post_id', postId);
    
    if (error) {
      console.error('Error unliking post:', error);
      return false;
    }
    return true;
  },

  // Check if user has liked a post
  async hasLiked(userId: string, postId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('likes')
      .select('id')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error checking like status:', error);
    }
    return !!data;
  },

  // Get likes for multiple posts at once (for feed)
  async getUserLikesForPosts(userId: string, postIds: string[]): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();
    
    const { data, error } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', userId)
      .in('post_id', postIds);
    
    if (error) console.error('Error fetching user likes:', error);
    return new Set(data?.map(l => l.post_id) || []);
  },
};

// ============================================
// COPY TRADE OPERATIONS
// ============================================

export const copyTradeService = {
  // Record a copy trade
  async create(copyTrade: CopyTradeInsert): Promise<boolean> {
    const { error } = await supabase
      .from('copy_trades')
      .insert(copyTrade);
    
    if (error) {
      console.error('Error creating copy trade:', error);
      return false;
    }
    return true;
  },

  // Get copy trades for a post
  async getForPost(postId: string): Promise<number> {
    const { count, error } = await supabase
      .from('copy_trades')
      .select('*', { count: 'exact', head: true })
      .eq('original_post_id', postId);
    
    if (error) console.error('Error fetching copy count:', error);
    return count || 0;
  },

  // Check if user has copied a trade
  async hasCopied(userId: string, postId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('copy_trades')
      .select('id')
      .eq('copier_id', userId)
      .eq('original_post_id', postId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error checking copy status:', error);
    }
    return !!data;
  },
};

// Export all services
export const db = {
  users: userService,
  posts: postService,
  follows: followService,
  likes: likeService,
  copyTrades: copyTradeService,
};
