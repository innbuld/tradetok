import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Settings,
  Share2,
  Edit2,
  TrendingUp,
  ArrowLeft,
  Wallet,
  UserPlus,
  UserMinus,
} from "lucide-react";
import { usePearAuthContext } from "@/contexts/PearAuthContext";
import { useAccount } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { db } from "@/lib/db";
import type { User, TradePost, TradePostWithCreator } from "@/types/database";
import { usePearPositions, usePearTradeHistory } from "@/hooks/usePear";
import { calculateAndUpdateUserStats } from "@/lib/userStats";
import { SocialTradePost } from "@/components/SocialTradePost";

type Tab = "trades" | "history" | "about" | "posts";

export function ProfileScreen() {
  const { id: routeUserId } = useParams();
  const navigate = useNavigate();
  const { user: authUser, logout, isAuthenticated } = usePearAuthContext();
  const { address } = useAccount();
  const { open } = useWeb3Modal();
  const [activeTab, setActiveTab] = useState<Tab>(
    routeUserId ? "posts" : "trades",
  );
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasUpdatedStats = useRef(false);

  const [userTrades, setUserTrades] = useState<TradePost[]>([]);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [isFollowing, setIsFollowing] = useState(false);

  // Pear Hooks
  const { positions: pearPositions, isLoading: positionsLoading } =
    usePearPositions();
  const { trades: pearHistory, isLoading: historyLoading } =
    usePearTradeHistory();

  const fetchUserData = async () => {
    setIsLoading(true);
    try {
      let userData: User | null = null;

      if (routeUserId) {
        // Public Profile View
        userData = await db.users.getById(routeUserId);
      } else {
        // Own Profile View
        const wallet = authUser?.walletAddress || address;
        if (wallet) {
          userData = await db.users.getOrCreate(wallet);
        }
      }

      if (userData) {
        setUser(userData);
        setEditName(userData.username || "");
        setEditBio(userData.bio || "");

        // Check follow status if viewing someone else
        if (authUser && userData.id !== authUser.id) {
          const following = await db.follows.isFollowing(
            authUser.id,
            userData.id,
          );
          setIsFollowing(following);
        }

        // Fetch posts
        const posts = await db.posts.getByUser(userData.id);
        // Sort by created_at desc
        setUserTrades(
          posts.sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          ),
        );
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, [authUser?.walletAddress, authUser?.id, address, routeUserId]);

  // Update stats on load
  useEffect(() => {
    const updateStats = async () => {
      if (user?.id && user?.wallet_address && !hasUpdatedStats.current) {
        hasUpdatedStats.current = true;
        await calculateAndUpdateUserStats(user.id, user.wallet_address);
        // Silent refresh of user data to get new stats
        const updatedUser = await db.users.getById(user.id);
        if (updatedUser) {
          // Only update fields that changed to avoid flicker, or just setUser
          setUser((prev) => (prev ? { ...prev, ...updatedUser } : updatedUser));
        }
      }
    };
    updateStats();
  }, [user?.id, user?.wallet_address]);

  const saveProfile = async () => {
    if (!user || !editName.trim()) return;

    // Optimistic update
    setUser({ ...user, username: editName, bio: editBio });
    setIsEditing(false);

    try {
      await db.users.update(user.id, {
        username: editName,
        bio: editBio,
      });
    } catch (error) {
      console.error("Failed to update profile", error);
      // Revert if failed (optional, for now just log it)
    }
  };

  const isOwnProfile = !routeUserId || authUser?.id === user?.id;

  const handleFollowToggle = async () => {
    if (!authUser || !user) return;

    // Optimistic Update
    setIsFollowing(!isFollowing);

    if (isFollowing) {
      // Unfollow
      const success = await db.follows.unfollow(authUser.id, user.id);
      if (!success) setIsFollowing(true); // Revert
    } else {
      // Follow
      const success = await db.follows.follow(authUser.id, user.id);
      if (!success) setIsFollowing(false); // Revert
    }
  };

  if (!address && !routeUserId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center pb-32">
        <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-4">
          <TrendingUp className="w-10 h-10 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Connect Your Wallet</h3>
        <p className="text-muted-foreground text-sm mb-6">
          Connect your wallet to view your trading profile
        </p>
        <button
          onClick={() => open()}
          className="px-6 py-3 rounded-xl gradient-primary text-primary-foreground font-bold flex items-center gap-2 tap-scale"
        >
          <Wallet className="w-5 h-5" />
          Connect Wallet
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center pb-32">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center pb-32">
        <p className="text-muted-foreground">Failed to load profile</p>
      </div>
    );
  }

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatTimeAgo = (dateString: string): string => {
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
  };

  return (
    <div className="min-h-screen pb-32">
      {/* Header */}
      <div className="relative">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-br from-primary/30 to-primary/10" />

        {/* Actions */}
        {/* Actions */}
        <div className="absolute top-4 left-4 z-10">
          {routeUserId && (
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-full bg-background/50 backdrop-blur-sm tap-scale text-foreground hover:bg-background/80"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="absolute top-4 right-4 flex gap-2 z-10">
          {isOwnProfile && (
            <button
              onClick={() => setIsEditing(true)}
              className="p-2 rounded-full bg-background/50 backdrop-blur-sm tap-scale"
            >
              <Edit2 className="w-5 h-5" />
            </button>
          )}
          <button className="p-2 rounded-full bg-background/50 backdrop-blur-sm tap-scale">
            <Share2 className="w-5 h-5" />
          </button>
          {isOwnProfile && (
            <button
              onClick={logout}
              className="p-2 rounded-full bg-background/50 backdrop-blur-sm tap-scale text-destructive"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* ... (Avatar section remains) ... */}

        {/* Edit Profile Modal */}
        {isEditing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
              onClick={() => setIsEditing(false)}
            />
            <div className="relative w-full max-w-sm bg-card rounded-2xl p-6 shadow-xl animate-slide-up">
              <h3 className="text-xl font-bold mb-4">Edit Profile</h3>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Username
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl bg-secondary border border-border focus:border-primary focus:outline-none"
                    placeholder="Enter username"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Bio
                  </label>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl bg-secondary border border-border focus:border-primary focus:outline-none resize-none h-24"
                    placeholder="Tell us about your trading style..."
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-3 rounded-xl bg-secondary font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveProfile}
                    className="flex-1 py-3 rounded-xl gradient-primary text-primary-foreground font-semibold"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Avatar */}
        <div className="absolute -bottom-12 left-4">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 border-4 border-background flex items-center justify-center text-4xl">
            {user.avatar_emoji}
          </div>
        </div>
      </div>

      {/* Profile Info */}
      <div className="px-4 pt-14 pb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-bold">{user.username}</h1>
          {user.is_verified && <BadgeCheck className="w-6 h-6 text-primary" />}
        </div>

        {user.bio && <p className="text-muted-foreground mb-4">{user.bio}</p>}

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-lg font-bold">
              {formatNumber(user.total_followers)}
            </p>
            <p className="text-xs text-muted-foreground">Followers</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-success">
              {user.win_rate.toFixed(0)}%
            </p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p
              className={`text-lg font-bold ${user.total_pnl >= 0 ? "text-success" : "text-destructive"}`}
            >
              ${formatNumber(Math.abs(user.total_pnl))}
            </p>
            <p className="text-xs text-muted-foreground">Total P&L</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-lg font-bold">{user.total_trades}</p>
            <p className="text-xs text-muted-foreground">Trades</p>
          </div>
        </div>

        {/* Edit Profile / Follow Button */}
        {isOwnProfile ? (
          <button
            onClick={() => setIsEditing(true)}
            className="w-full py-3 rounded-xl border-2 border-primary text-primary font-bold tap-scale hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
          >
            <Edit2 className="w-5 h-5" />
            Edit Profile
          </button>
        ) : (
          <button
            onClick={handleFollowToggle}
            className={`w-full py-3 rounded-xl border-2 font-bold tap-scale transition-colors flex items-center justify-center gap-2 ${
              isFollowing
                ? "border-border text-muted-foreground bg-secondary/50"
                : "border-primary text-primary hover:bg-primary/5"
            }`}
          >
            {isFollowing ? (
              <UserMinus className="w-5 h-5" />
            ) : (
              <UserPlus className="w-5 h-5" />
            )}
            {isFollowing ? "Unfollow" : "Follow"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-4 overflow-x-auto no-scrollbar">
        {(
          (isOwnProfile
            ? ["trades", "history", "posts", "about"]
            : ["posts", "about"]) as Tab[]
        ).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 font-medium capitalize transition-colors ${
              activeTab === tab
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground"
            }`}
          >
            {tab === "trades" ? "Active Trades" : tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="px-4 py-4">
        {activeTab === "trades" && (
          <div className="space-y-3">
            {positionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : pearPositions.length > 0 ? (
              pearPositions.map((position) => {
                // Join all assets with + for basket display
                const longAsset =
                  position.longAssets.map((a) => a.coin).join("+") || "UNKNOWN";
                const shortAsset =
                  position.shortAssets.map((a) => a.coin).join("+") || "USDT";
                const pair = `${longAsset}/${shortAsset}`;
                const direction =
                  position.longAssets.length > 0 ? "LONG" : "SHORT";

                return (
                  <div
                    key={position.positionId}
                    className="bg-card border border-border rounded-xl p-4 tap-scale"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center -space-x-2">
                          {Array.from(
                            new Set(
                              pair
                                .split("/")
                                .flatMap((side) => side.split("+")),
                            ),
                          ).map((asset: string) => (
                            <img
                              key={asset}
                              src={`https://assets.coincap.io/assets/icons/${asset.trim().toLowerCase()}@2x.png`}
                              onError={(e) => {
                                e.currentTarget.src = `https://ui-avatars.com/api/?name=${asset}&background=random&color=fff&size=32`;
                              }}
                              alt={asset}
                              className="w-6 h-6 rounded-full border-2 border-background bg-secondary"
                            />
                          ))}
                        </div>
                        <span className="font-bold">{pair}</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          direction === "LONG"
                            ? "bg-success/20 text-success"
                            : "bg-destructive/20 text-destructive"
                        }`}
                      >
                        {direction}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                      <div>
                        <p className="text-muted-foreground text-xs">Entry</p>
                        <p className="font-semibold">
                          $
                          {(
                            position.longAssets[0]?.entryPrice ??
                            position.shortAssets[0]?.entryPrice ??
                            0
                          ).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Value</p>
                        <p className="font-semibold">
                          ${position.positionValue.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {formatTimeAgo(position.createdAt)}
                      </span>
                      <span
                        className={`font-semibold ${
                          position.unrealizedPnl >= 0
                            ? "text-success"
                            : "text-destructive"
                        }`}
                      >
                        {position.unrealizedPnl >= 0 ? "+" : ""}
                        {position.unrealizedPnlPercentage.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No active trades</p>
                <p className="text-sm mt-2">
                  Create your first trade to see it here!
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-3">
            {historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : pearHistory.length > 0 ? (
              pearHistory.map((trade) => {
                // Join all assets with + for basket display
                // Helper to get assets from various possible fields
                const getAssets = (
                  closed?: { coin: string }[],
                  active?: { coin: string }[],
                  legacy?: string[],
                ) => {
                  // Prioritize the full position context (legacy strings) to show "BTC/SOL+LIT"
                  if (legacy && legacy.length > 0) return legacy;
                  if (closed && closed.length > 0)
                    return closed.map((a) => a.coin);
                  if (active && active.length > 0)
                    return active.map((a) => a.coin);
                  return [];
                };

                const longAssetsList = getAssets(
                  trade.closedLongAssets,
                  trade.longAssets,
                  trade.positionLongAssets,
                );
                const shortAssetsList = getAssets(
                  trade.closedShortAssets,
                  trade.shortAssets,
                  trade.positionShortAssets,
                );

                const longAsset = longAssetsList.join("+") || "UNKNOWN";
                const shortAsset = shortAssetsList.join("+") || "USDC";
                const pair = `${longAsset}/${shortAsset}`;

                return (
                  <div
                    key={
                      trade.tradeHistoryId || trade.tradeId || trade.positionId
                    }
                    className="bg-card border border-border rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center -space-x-2">
                          {Array.from(
                            new Set(
                              pair
                                .split("/")
                                .flatMap((side) => side.split("+")),
                            ),
                          ).map((asset: string) => (
                            <img
                              key={asset}
                              src={`https://assets.coincap.io/assets/icons/${asset.trim().toLowerCase()}@2x.png`}
                              onError={(e) => {
                                e.currentTarget.src = `https://ui-avatars.com/api/?name=${asset}&background=random&color=fff&size=32`;
                              }}
                              alt={asset}
                              className="w-6 h-6 rounded-full border-2 border-background bg-secondary"
                            />
                          ))}
                        </div>
                        <span className="font-bold">{pair}</span>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-sm font-bold ${
                            (trade.realizedPnl ?? 0) >= 0
                              ? "text-success"
                              : "text-destructive"
                          }`}
                        >
                          {trade.realizedPnlPercentage !== undefined
                            ? `${trade.realizedPnlPercentage >= 0 ? "+" : ""}${(trade.realizedPnlPercentage * 100).toFixed(2)}%`
                            : trade.status || "CLOSED"}
                        </span>
                        {trade.realizedPnl !== undefined && (
                          <p className="text-xs text-muted-foreground">
                            {trade.realizedPnl >= 0 ? "+" : ""}$
                            {trade.realizedPnl.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(trade.createdAt || trade.openedAt) &&
                        new Date(
                          trade.createdAt || trade.openedAt!,
                        ).toLocaleString()}
                      {trade.closedAt &&
                        ` → ${new Date(trade.closedAt).toLocaleString()}`}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No trade history yet</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "posts" && (
          <div className="space-y-4">
            {userTrades.length > 0 ? (
              userTrades.map((post) => (
                <SocialTradePost
                  key={post.id}
                  post={{ ...post, creator: user }} // Inject creator
                  isLiked={false} // Todo: fetch like status
                  currentUserId={authUser?.id}
                  onLike={() => {}}
                  isFollowing={isFollowing}
                  onFollow={handleFollowToggle}
                  onCopyTrade={() => {}}
                />
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No posts yet</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "about" && (
          <div className="space-y-6">
            {isOwnProfile && (
              <div>
                <h3 className="font-bold mb-2">Wallet Address</h3>
                <p className="text-muted-foreground text-sm font-mono break-all">
                  {user.wallet_address}
                </p>
              </div>
            )}

            {user.bio && (
              <div>
                <h3 className="font-bold mb-2">About</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {user.bio}
                </p>
              </div>
            )}

            <div>
              <h3 className="font-bold mb-2">Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Member since</span>
                  <span className="font-medium">
                    {new Date(user.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total trades</span>
                  <span className="font-medium">{user.total_trades}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Following</span>
                  <span className="font-medium">{user.total_following}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
