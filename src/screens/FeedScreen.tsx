import { useState, useEffect, useCallback } from "react";
import { Filter, Plus, RefreshCw, TrendingUp } from "lucide-react";
import { SocialTradePost } from "@/components/SocialTradePost";
import { CopyTradeModal } from "@/components/CopyTradeModal";
import { CreateTradeModal } from "@/components/CreateTradeModal";
import { FilterDrawer } from "@/components/FilterDrawer";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { usePearAuthContext } from "@/contexts/PearAuthContext";
import { db } from "@/lib/db";
import type { TradePostWithCreator, User } from "@/types/database";

type FeedTab = "foryou" | "following";

export function FeedScreen() {
  const { isAuthenticated, address } = usePearAuthContext();

  const [activeTab, setActiveTab] = useState<FeedTab>("foryou");
  const [posts, setPosts] = useState<TradePostWithCreator[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedPost, setSelectedPost] = useState<TradePostWithCreator | null>(
    null,
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // User liked posts (for optimistic UI)
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());

  // Fetch current user
  useEffect(() => {
    async function fetchUser() {
      if (address) {
        const user = await db.users.getOrCreate(address);
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
      }
    }
    fetchUser();
  }, [address]);

  // Fetch feed
  const fetchFeed = useCallback(
    async (showLoading = true) => {
      if (showLoading) setIsLoading(true);
      else setIsRefreshing(true);

      try {
        let feedPosts: TradePostWithCreator[] = [];

        if (activeTab === "following" && currentUser) {
          feedPosts = await db.posts.getFollowingFeed(currentUser.id);
        } else {
          feedPosts = await db.posts.getFeed();
        }

        setPosts(feedPosts);

        // Fetch user's likes for these posts
        if (currentUser && feedPosts.length > 0) {
          const postIds = feedPosts.map((p) => p.id);
          const userLikes = await db.likes.getUserLikesForPosts(
            currentUser.id,
            postIds,
          );
          setLikedPosts(userLikes);
        }
      } catch (error) {
        console.error("Error fetching feed:", error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeTab, currentUser],
  );

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Handle like
  const handleLike = async (postId: string) => {
    if (!currentUser) return;

    const isLiked = likedPosts.has(postId);

    // Optimistic update
    setLikedPosts((prev) => {
      const newSet = new Set(prev);
      if (isLiked) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });

    // Update post's like count optimistically
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id === postId) {
          return {
            ...post,
            likes_count: isLiked ? post.likes_count - 1 : post.likes_count + 1,
          };
        }
        return post;
      }),
    );

    // Persist to DB
    if (isLiked) {
      await db.likes.unlike(currentUser.id, postId);
    } else {
      await db.likes.like(currentUser.id, postId);
    }
  };

  // Handle follow
  const handleFollow = async (userId: string) => {
    if (!currentUser) return;

    const isFollowing = await db.follows.isFollowing(currentUser.id, userId);

    if (isFollowing) {
      await db.follows.unfollow(currentUser.id, userId);
    } else {
      await db.follows.follow(currentUser.id, userId);
    }

    // Refresh feed if on following tab
    if (activeTab === "following") {
      fetchFeed(false);
    }
  };

  // Handle trade created
  const handleTradeCreated = () => {
    setIsCreateOpen(false);
    fetchFeed(false);
  };

  return (
    <div className="min-h-screen pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
            TradeTok
          </h1>
          <div className="flex items-center gap-2">
            <WalletConnectButton compact />
            <button
              onClick={() => setIsFilterOpen(true)}
              className="p-2 rounded-full bg-secondary tap-scale hover:bg-secondary/80 transition-colors"
            >
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-4 gap-1">
          <button
            onClick={() => setActiveTab("foryou")}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === "foryou"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            For You
          </button>
          <button
            onClick={() => setActiveTab("following")}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === "following"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Following
          </button>
        </div>
      </div>

      {/* Pull to refresh button */}
      <div className="flex justify-center py-2">
        <button
          onClick={() => fetchFeed(false)}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary/50 text-sm text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-muted-foreground">Loading trades...</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-4">
            <TrendingUp className="w-10 h-10 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {activeTab === "following"
              ? "No posts from people you follow"
              : "No trades yet"}
          </h3>
          <p className="text-muted-foreground text-sm mb-6">
            {activeTab === "following"
              ? "Start following traders to see their trades here"
              : "Be the first to share a trade!"}
          </p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl gradient-primary text-primary-foreground font-semibold tap-scale"
          >
            <Plus className="w-5 h-5" />
            Create Trade
          </button>
        </div>
      ) : (
        <div className="snap-y snap-mandatory">
          {posts.map((post) => (
            <div key={post.id} className="snap-start">
              <SocialTradePost
                post={post}
                isLiked={likedPosts.has(post.id)}
                currentUserId={currentUser?.id}
                onLike={() => handleLike(post.id)}
                onFollow={() => handleFollow(post.creator_id)}
                onCopyTrade={() => setSelectedPost(post)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Floating Create Button */}
      {/* Floating Create Button */}
      <button
        onClick={() => setIsCreateOpen(true)}
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full gradient-primary shadow-xl shadow-primary/30 flex items-center justify-center tap-scale z-20"
      >
        <Plus className="w-7 h-7 text-primary-foreground" />
      </button>

      {/* Modals */}
      {selectedPost && (
        <CopyTradeModal
          trade={{
            id: selectedPost.id,
            trader: {
              id: selectedPost.creator.id,
              username: selectedPost.creator.username,
              avatar: selectedPost.creator.avatar_emoji,
              verified: selectedPost.creator.is_verified,
              followers: selectedPost.creator.total_followers.toString(),
              bio: selectedPost.creator.bio || "",
              winRate: `${selectedPost.creator.win_rate}%`,
              totalPnl: `$${selectedPost.creator.total_pnl}`,
              avgReturn: "0%",
            },
            timestamp: new Date(selectedPost.created_at).toLocaleDateString(),
            thesis: selectedPost.thesis_text || "",
            pair: selectedPost.pair,
            direction: selectedPost.direction,
            entry: selectedPost.entry_price.toString(),
            current: selectedPost.current_price.toString(),
            pnl: `${selectedPost.pnl_percentage >= 0 ? "+" : ""}${selectedPost.pnl_percentage.toFixed(2)}%`,
            pnlValue: selectedPost.pnl_percentage,
            size: `$${selectedPost.size_usd}`,
            winRate: `${selectedPost.creator.win_rate}%`,
            riskLevel:
              selectedPost.leverage > 5
                ? "high"
                : selectedPost.leverage > 2
                  ? "medium"
                  : "low",
            likes: selectedPost.likes_count,
            comments: selectedPost.comments_count,
            copies: selectedPost.copies_count,
            voiceDuration: "0:00",
            leverage: selectedPost.leverage,
          }}
          isOpen={!!selectedPost}
          onClose={() => setSelectedPost(null)}
        />
      )}

      <CreateTradeModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onTradeCreated={handleTradeCreated}
      />

      <FilterDrawer
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
      />
    </div>
  );
}
