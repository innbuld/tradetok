// Supabase Database Types - Auto-synced with Supabase schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Direction types
export type TradeDirection = 'LONG' | 'SHORT';

// Database Schema Types
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          wallet_address: string;
          username: string;
          avatar_emoji: string;
          bio: string | null;
          is_verified: boolean;
          total_followers: number;
          total_following: number;
          total_trades: number;
          win_rate: number;
          total_pnl: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          username: string;
          avatar_emoji?: string;
          bio?: string | null;
          is_verified?: boolean;
          total_followers?: number;
          total_following?: number;
          total_trades?: number;
          win_rate?: number;
          total_pnl?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          username?: string;
          avatar_emoji?: string;
          bio?: string | null;
          is_verified?: boolean;
          total_followers?: number;
          total_following?: number;
          total_trades?: number;
          win_rate?: number;
          total_pnl?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      trade_posts: {
        Row: {
          id: string;
          creator_id: string;
          position_id: string | null;
          pair: string; // Display format: "BTC/USDC" or "BTC+ETH/DOGE+SHIB"
          long_assets: Json | null; // Array of { asset: string, weight: number }
          short_assets: Json | null; // Array of { asset: string, weight: number }
          direction: TradeDirection;
          entry_price: number;
          current_price: number;
          leverage: number;
          size_usd: number;
          take_profit: number | null;
          stop_loss: number | null;
          thesis_text: string | null;
          voice_note_url: string | null;
          pnl_percentage: number;
          pnl_usd: number;
          is_open: boolean;
          likes_count: number;
          comments_count: number;
          copies_count: number;
          created_at: string;
          updated_at: string;
          closed_at: string | null;
        };
        Insert: {
          id?: string;
          creator_id: string;
          position_id?: string | null;
          pair: string;
          long_assets?: Json | null;
          short_assets?: Json | null;
          direction: TradeDirection;
          entry_price: number;
          current_price?: number;
          leverage?: number;
          size_usd: number;
          take_profit?: number | null;
          stop_loss?: number | null;
          thesis_text?: string | null;
          voice_note_url?: string | null;
          pnl_percentage?: number;
          pnl_usd?: number;
          is_open?: boolean;
          likes_count?: number;
          comments_count?: number;
          copies_count?: number;
          created_at?: string;
          updated_at?: string;
          closed_at?: string | null;
        };
        Update: {
          id?: string;
          creator_id?: string;
          position_id?: string | null;
          pair?: string;
          long_assets?: Json | null;
          short_assets?: Json | null;
          direction?: TradeDirection;
          entry_price?: number;
          current_price?: number;
          leverage?: number;
          size_usd?: number;
          take_profit?: number | null;
          stop_loss?: number | null;
          thesis_text?: string | null;
          voice_note_url?: string | null;
          pnl_percentage?: number;
          pnl_usd?: number;
          is_open?: boolean;
          likes_count?: number;
          comments_count?: number;
          copies_count?: number;
          created_at?: string;
          updated_at?: string;
          closed_at?: string | null;
        };
      };
      follows: {
        Row: {
          id: string;
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          follower_id: string;
          following_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          follower_id?: string;
          following_id?: string;
          created_at?: string;
        };
      };
      likes: {
        Row: {
          id: string;
          user_id: string;
          post_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          post_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          post_id?: string;
          created_at?: string;
        };
      };
      copy_trades: {
        Row: {
          id: string;
          copier_id: string;
          original_post_id: string;
          copier_position_id: string | null;
          size_usd: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          copier_id: string;
          original_post_id: string;
          copier_position_id?: string | null;
          size_usd: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          copier_id?: string;
          original_post_id?: string;
          copier_position_id?: string | null;
          size_usd?: number;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      trade_direction: TradeDirection;
    };
  };
}

// Convenience types for common use
export type User = Database['public']['Tables']['users']['Row'];
export type UserInsert = Database['public']['Tables']['users']['Insert'];
export type UserUpdate = Database['public']['Tables']['users']['Update'];

export type TradePost = Database['public']['Tables']['trade_posts']['Row'];
export type TradePostInsert = Database['public']['Tables']['trade_posts']['Insert'];
export type TradePostUpdate = Database['public']['Tables']['trade_posts']['Update'];

export type Follow = Database['public']['Tables']['follows']['Row'];
export type FollowInsert = Database['public']['Tables']['follows']['Insert'];

export type Like = Database['public']['Tables']['likes']['Row'];
export type LikeInsert = Database['public']['Tables']['likes']['Insert'];

export type CopyTrade = Database['public']['Tables']['copy_trades']['Row'];
export type CopyTradeInsert = Database['public']['Tables']['copy_trades']['Insert'];

// Extended types with relations
export interface TradePostWithCreator extends TradePost {
  creator: User;
}

export interface UserWithStats extends User {
  posts_count?: number;
  is_following?: boolean;
}
