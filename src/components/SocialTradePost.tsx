// Social Trade Post Component - Displays executed trades in the feed
import {
  BadgeCheck,
  Heart,
  MessageCircle,
  Share2,
  Copy,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useState, useEffect } from "react";
import type { TradePostWithCreator } from "@/types/database";
import { db } from "@/lib/db";
import { hyperliquidClient } from "@/lib/hyperliquidClient";

interface SocialTradePostProps {
  post: TradePostWithCreator;
  isLiked: boolean;
  currentUserId?: string;
  onLike: () => void;
  onFollow: () => void;
  onCopyTrade: () => void;
}

function DirectionBadge({ direction }: { direction: "LONG" | "SHORT" }) {
  const isLong = direction === "LONG";
  return (
    <span
      className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1.5 ${
        isLong
          ? "bg-success/20 text-success"
          : "bg-destructive/20 text-destructive"
      }`}
    >
      {isLong ? (
        <TrendingUp className="w-4 h-4" />
      ) : (
        <TrendingDown className="w-4 h-4" />
      )}
      {direction}
    </span>
  );
}

function LeverageBadge({ leverage }: { leverage: number }) {
  const color =
    leverage >= 10
      ? "text-destructive"
      : leverage >= 5
        ? "text-warning"
        : "text-success";
  return (
    <span
      className={`px-2 py-0.5 rounded-md bg-secondary text-xs font-bold ${color}`}
    >
      {leverage}x
    </span>
  );
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatPrice(price: number): string {
  if (price >= 1000)
    return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(8);
}

export function SocialTradePost({
  post,
  isLiked,
  currentUserId,
  onLike,
  onFollow,
  onCopyTrade,
}: SocialTradePostProps) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [localLikeCount, setLocalLikeCount] = useState(post.likes_count);
  const [localIsLiked, setLocalIsLiked] = useState(isLiked);
  const [isPositionOpen, setIsPositionOpen] = useState<boolean | null>(
    post.is_open,
  );
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const isProfitable = post.pnl_percentage >= 0;
  const isOwnPost = currentUserId === post.creator_id;

  // Check follow status
  useEffect(() => {
    async function checkFollow() {
      if (currentUserId && !isOwnPost) {
        const following = await db.follows.isFollowing(
          currentUserId,
          post.creator_id,
        );
        setIsFollowing(following);
      }
    }
    checkFollow();
  }, [currentUserId, post.creator_id, isOwnPost]);

  // Check live position status from Hyperliquid
  useEffect(() => {
    async function checkPositionStatus() {
      // Only check if the post says it's open (to avoid unnecessary API calls)
      if (!post.is_open) {
        setIsPositionOpen(false);
        return;
      }

      setIsCheckingStatus(true);
      try {
        // Get the creator's wallet address
        const creatorWallet = post.creator.wallet_address;
        if (!creatorWallet) {
          setIsPositionOpen(post.is_open);
          return;
        }

        // Fetch open positions from Hyperliquid
        const positions = await hyperliquidClient.getPositions(creatorWallet);

        // Parse the pair to extract all assets
        // Supports both simple pairs (BTC/USDC) and basket trades (BTC+ETH/DOGE+SHIB)
        const parseBasketPair = (pair: string) => {
          const [longSide, shortSide] = pair.split("/");
          const longAssets = longSide.split("+").map((a) => a.trim());
          const shortAssets = shortSide.split("+").map((a) => a.trim());
          return { longAssets, shortAssets };
        };

        const { longAssets, shortAssets } = parseBasketPair(post.pair);

        // Filter out stablecoins (USDC, USDT, DAI) as they don't have positions
        const stablecoins = ["USDC", "USDT", "DAI"];
        const activeAssets = [...longAssets, ...shortAssets].filter(
          (asset) => !stablecoins.includes(asset.toUpperCase()),
        );

        // Check if ALL active assets have open positions
        const hasOpenPosition = activeAssets.every((asset) =>
          positions.some(
            (pos) =>
              pos.coin.toUpperCase() === asset.toUpperCase() && pos.size !== 0,
          ),
        );

        setIsPositionOpen(hasOpenPosition);

        // If position is closed but DB says open, update the DB
        if (!hasOpenPosition && post.is_open) {
          // Note: This could trigger a DB update in a real implementation
          console.log(`Position ${post.pair} appears to be closed`);
        }
      } catch (error) {
        console.error("Failed to check position status:", error);
        // Fall back to stored value on error
        setIsPositionOpen(post.is_open);
      } finally {
        setIsCheckingStatus(false);
      }
    }

    checkPositionStatus();

    // Poll every 30 seconds for live updates
    const interval = setInterval(checkPositionStatus, 30000);
    return () => clearInterval(interval);
  }, [post.pair, post.is_open, post.creator.wallet_address]);

  // Sync isLiked prop
  useEffect(() => {
    setLocalIsLiked(isLiked);
  }, [isLiked]);

  const handleLike = () => {
    setLocalIsLiked(!localIsLiked);
    setLocalLikeCount((prev) => (localIsLiked ? prev - 1 : prev + 1));
    onLike();
  };

  const handleFollow = async () => {
    if (isOwnPost) return;
    setIsFollowing(!isFollowing);
    onFollow();
  };

  const handleShare = async () => {
    try {
      await navigator.share({
        title: `${post.creator.username}'s ${post.direction} on ${post.pair}`,
        text: post.thesis_text || `Check out this trade on TradeTok!`,
        url: window.location.href,
      });
    } catch {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <div className="min-h-fit flex flex-col p-4 animate-fade-in-up">
      {/* Header - Creator Info */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center text-2xl border border-border/50">
          {post.creator.avatar_emoji}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">
              {post.creator.username}
            </span>
            {post.creator.is_verified && (
              <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />
            )}
            <LeverageBadge leverage={post.leverage} />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{formatNumber(post.creator.total_followers)} followers</span>
            <span>•</span>
            <span className="text-success">
              {post.creator.win_rate.toFixed(0)}% win
            </span>
            <span>•</span>
            <span>{formatTimeAgo(post.created_at)}</span>
          </div>
        </div>

        {!isOwnPost && (
          <button
            onClick={handleFollow}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold tap-scale transition-all ${
              isFollowing
                ? "bg-secondary text-foreground border border-border"
                : "border border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            }`}
          >
            {isFollowing ? "Following" : "Follow"}
          </button>
        )}
      </div>

      {/* Thesis Text */}
      {post.thesis_text && (
        <p className="mb-4 text-foreground/90 leading-relaxed line-clamp-3">
          {post.thesis_text}
        </p>
      )}

      {/* Trade Card */}
      <div className="trade-card-gradient rounded-2xl p-4 border border-border/50 flex flex-col bg-gradient-to-br from-card to-card/50">
        {/* Pair and Direction */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{post.pair}</span>
            {/* Basket Trade Indicator */}
            {post.pair.includes("+") && (
              <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
                🧺 Basket
              </span>
            )}
            {isCheckingStatus ? (
              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                ● CHECKING...
              </span>
            ) : isPositionOpen ? (
              <span className="px-2 py-0.5 rounded-full bg-success/20 text-success text-xs font-medium animate-pulse">
                ● LIVE
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-destructive/20 text-destructive text-xs font-medium">
                ● CLOSED
              </span>
            )}
          </div>
          <DirectionBadge direction={post.direction} />
        </div>

        {/* PnL Display */}
        <div
          className={`text-3xl font-bold mb-3 ${isProfitable ? "text-success" : "text-destructive"}`}
        >
          {isProfitable ? "+" : ""}
          {post.pnl_percentage.toFixed(2)}%
          <span className="text-lg ml-2 opacity-70">
            ({isProfitable ? "+" : ""}${post.pnl_usd.toFixed(2)})
          </span>
        </div>

        {/* Trade Details Grid */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-secondary/30 rounded-lg p-2.5">
            <p className="text-xs text-muted-foreground mb-1">Entry Price</p>
            <p className="font-semibold text-lg">
              ${formatPrice(post.entry_price)}
            </p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-2.5">
            <p className="text-xs text-muted-foreground mb-1">Current Price</p>
            <p
              className={`font-semibold text-lg ${isProfitable ? "text-success" : "text-destructive"}`}
            >
              ${formatPrice(post.current_price)}
            </p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-2.5">
            <p className="text-xs text-muted-foreground mb-1">Position Size</p>
            <p className="font-semibold">${post.size_usd.toLocaleString()}</p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-2.5">
            <p className="text-xs text-muted-foreground mb-1">Leverage</p>
            <p className="font-semibold">{post.leverage}x</p>
          </div>
        </div>

        {/* TP/SL if set */}
        {(post.take_profit || post.stop_loss) && (
          <div className="flex gap-3 mb-4">
            {post.take_profit && (
              <div className="flex-1 bg-success/10 rounded-lg p-2 text-center">
                <p className="text-xs text-success/70">Take Profit</p>
                <p className="text-success font-semibold">
                  ${formatPrice(post.take_profit)}
                </p>
              </div>
            )}
            {post.stop_loss && (
              <div className="flex-1 bg-destructive/10 rounded-lg p-2 text-center">
                <p className="text-xs text-destructive/70">Stop Loss</p>
                <p className="text-destructive font-semibold">
                  ${formatPrice(post.stop_loss)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Creator Stats */}
        <div className="pt-3 border-t border-border/30 flex items-center gap-3 text-sm text-muted-foreground">
          <span>👤 {post.creator.total_trades} trades</span>
          <span className="text-success">
            📈 {post.creator.win_rate.toFixed(0)}% win rate
          </span>
          <span
            className={
              post.creator.total_pnl >= 0 ? "text-success" : "text-destructive"
            }
          >
            💰 {post.creator.total_pnl >= 0 ? "+" : ""}$
            {post.creator.total_pnl.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-6">
          <button
            onClick={handleLike}
            className="flex items-center gap-2 tap-scale group"
          >
            <Heart
              className={`w-6 h-6 transition-all ${
                localIsLiked
                  ? "fill-destructive text-destructive scale-110"
                  : "group-hover:text-destructive"
              }`}
            />
            <span className="text-sm font-medium">
              {formatNumber(localLikeCount)}
            </span>
          </button>

          <button className="flex items-center gap-2 tap-scale group">
            <MessageCircle className="w-6 h-6 group-hover:text-primary transition-colors" />
            <span className="text-sm font-medium">
              {formatNumber(post.comments_count)}
            </span>
          </button>

          <button onClick={handleShare} className="tap-scale group">
            <Share2 className="w-6 h-6 group-hover:text-primary transition-colors" />
          </button>
        </div>

        <button
          onClick={onCopyTrade}
          disabled={!isPositionOpen}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-primary-foreground font-semibold tap-scale shadow-lg shadow-primary/20 disabled:opacity-50 disabled:shadow-none"
        >
          <Copy className="w-5 h-5" />
          <span>
            {isPositionOpen
              ? `Copy Trade (${formatNumber(post.copies_count)})`
              : "Trade Closed"}
          </span>
        </button>
      </div>
    </div>
  );
}
