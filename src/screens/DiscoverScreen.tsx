// Updated Discover Screen with Top Pairs and Working Search

import { useState, useEffect, useMemo } from "react";
import {
  Search,
  TrendingUp,
  TrendingDown,
  BadgeCheck,
  ChevronRight,
  Loader2,
  RefreshCw,
  Star,
  ShieldAlert,
} from "lucide-react";
import { traders, trades } from "@/data/mockData";
import { pearClient } from "@/lib/pearClient";
import { QuickTradeModal } from "@/components/QuickTradeModal";
import { AgentWalletSetupModal } from "@/components/AgentWalletSetupModal";
import { usePearAuthContext } from "@/contexts/PearAuthContext";
import { Button } from "@/components/ui/button";
import type { Market, MarketsResponse } from "@/types/pear";

export function DiscoverScreen() {
  const { isAuthenticated, agentWallet } = usePearAuthContext();
  const [markets, setMarkets] = useState<MarketsResponse | null>(null);
  const [activeMarkets, setActiveMarkets] = useState<{
    topGainers: Market[];
    topLosers: Market[];
    highlighted: Market[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Market[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [showQuickTrade, setShowQuickTrade] = useState(false);
  const [showAgentSetup, setShowAgentSetup] = useState(false);

  const topTraders = traders.slice(0, 5);
  const lowRiskTrades = trades.filter((t) => t.riskLevel === "low").slice(0, 3);
  const highRiskTrades = trades
    .filter((t) => t.riskLevel === "high")
    .slice(0, 3);

  // Fetch initial data
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch active markets - this has all the data we need
      const active = await pearClient.getActiveMarkets();
      setActiveMarkets({
        topGainers: active.topGainers || [],
        topLosers: active.topLosers || [],
        highlighted: active.highlighted || [],
      });

      // Use active markets for top pairs too
      setMarkets({
        markets: active.active || [],
        total: active.active?.length || 0,
        page: 1,
        pageSize: active.active?.length || 0,
        totalPages: 1,
      });
    } catch (err) {
      console.error("Failed to fetch markets:", err);
      setError(err instanceof Error ? err.message : "Failed to load markets");
    } finally {
      setIsLoading(false);
    }
  };

  // Search markets locally from active markets
  const handleSearch = (query: string) => {
    setSearchQuery(query);

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);

    try {
      // Search from all active markets
      const allActiveMarkets = [
        ...(activeMarkets?.topGainers || []),
        ...(activeMarkets?.topLosers || []),
        ...(markets?.markets || []),
      ];

      // Remove duplicates by creating a map
      const uniqueMarkets = Array.from(
        new Map(
          allActiveMarkets.map((m) => [
            `${m.longAssets?.[0]?.asset}-${m.shortAssets?.[0]?.asset}`,
            m,
          ]),
        ).values(),
      );

      const upperQuery = query.toUpperCase();
      const filtered = uniqueMarkets.filter((m) => {
        const longAsset = m.longAssets?.[0]?.asset || "";
        const shortAsset = m.shortAssets?.[0]?.asset || "";
        return (
          longAsset.includes(upperQuery) || shortAsset.includes(upperQuery)
        );
      });

      setSearchResults(filtered);
    } catch (err) {
      console.error("Search failed:", err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        handleSearch(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, []);

  // Format market for display
  const formatMarket = (market: Market) => {
    // Handle undefined or empty arrays
    const longAssets = market.longAssets || [];
    const shortAssets = market.shortAssets || [];

    const longAsset = longAssets[0]?.asset ?? "UNKNOWN";
    const shortAsset = shortAssets[0]?.asset ?? "USDT";
    const pair = `${longAsset}/${shortAsset}`;
    const change = parseFloat(market.change24h || "0") * 100;
    const volume = parseFloat(market.volume || "0");
    const isPositive = change >= 0;

    return {
      pair,
      longAsset,
      shortAsset,
      change: `${isPositive ? "+" : ""}${change.toFixed(2)}%`,
      isPositive,
      volume: formatVolume(volume),
      ratio: parseFloat(market.ratio || "0").toFixed(4),
      rawVolume: volume,
    };
  };

  // Check if market is valid
  const isValidMarket = (market: Market): boolean => {
    return !!(market?.longAssets?.length && market?.shortAssets?.length);
  };

  // Format volume for display
  const formatVolume = (volume: number): string => {
    if (volume >= 1_000_000_000) {
      return `$${(volume / 1_000_000_000).toFixed(1)}B`;
    } else if (volume >= 1_000_000) {
      return `$${(volume / 1_000_000).toFixed(1)}M`;
    } else if (volume >= 1_000) {
      return `$${(volume / 1_000).toFixed(1)}K`;
    } else if (volume > 0) {
      return `$${volume.toFixed(0)}`;
    }
    return "$0";
  };

  // Get top pairs (BTC, ETH, SOL from markets with highest volume)
  const topPairs = useMemo(() => {
    if (!markets?.markets) return [];

    const priorityAssets = ["BTC", "ETH", "SOL", "HYPE", "AVAX", "LINK"];
    // Only process valid markets
    const validMarkets = markets.markets.filter(isValidMarket);

    // Map with both formatted and original
    const allMarkets = validMarkets.map((m) => ({
      formatted: formatMarket(m),
      original: m,
    }));

    // Find markets containing priority assets, sorted by volume
    const prioritized: typeof allMarkets = [];

    for (const asset of priorityAssets) {
      const matching = allMarkets.find(
        (m) =>
          (m.formatted.longAsset === asset ||
            m.formatted.shortAsset === asset) &&
          !prioritized.some((p) => p.formatted.pair === m.formatted.pair),
      );
      if (matching) {
        prioritized.push(matching);
      }
    }

    // Fill with highest volume pairs if needed
    const remaining = allMarkets
      .filter(
        (m) => !prioritized.some((p) => p.formatted.pair === m.formatted.pair),
      )
      .sort((a, b) => b.formatted.rawVolume - a.formatted.rawVolume)
      .slice(0, 6 - prioritized.length);

    return [...prioritized, ...remaining].slice(0, 6);
  }, [markets]);

  // Get top gainers/losers
  const topGainers = useMemo(() => {
    const gainers = activeMarkets?.topGainers || [];
    return gainers
      .filter(isValidMarket)
      .slice(0, 5)
      .map((m) => ({
        formatted: formatMarket(m),
        original: m,
      }));
  }, [activeMarkets]);

  const topLosers = useMemo(() => {
    const losers = activeMarkets?.topLosers || [];
    return losers
      .filter(isValidMarket)
      .slice(0, 5)
      .map((m) => ({
        formatted: formatMarket(m),
        original: m,
      }));
  }, [activeMarkets]);

  // Get hot pairs from highlighted
  const hotPairs = useMemo(() => {
    const highlighted = activeMarkets?.highlighted || [];
    const assets = highlighted
      .filter(isValidMarket)
      .map((m) => m.longAssets[0]?.asset)
      .filter(Boolean) as string[];
    return [...new Set(assets)].slice(0, 8);
  }, [activeMarkets]);

  // Search results formatted
  const formattedSearchResults = useMemo(() => {
    return searchResults.filter(isValidMarket).map(formatMarket);
  }, [searchResults]);

  // Handle market click
  const handleMarketClick = (market: Market) => {
    setSelectedMarket(market);
    if (!agentWallet && isAuthenticated) {
      setShowAgentSetup(true);
    } else {
      setShowQuickTrade(true);
    }
  };

  return (
    <div className="min-h-screen pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl px-4 py-3">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Discover</h1>

          <div className="flex items-center gap-2">
            {isAuthenticated && !agentWallet && (
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs gap-1"
                onClick={() => setShowAgentSetup(true)}
              >
                <ShieldAlert className="w-3 h-3" />
                Setup Trading
              </Button>
            )}

            <button
              onClick={fetchData}
              disabled={isLoading}
              className="p-2 rounded-xl bg-secondary tap-scale disabled:opacity-50"
            >
              <RefreshCw
                className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search pairs, assets... (e.g. BTC, SOL)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary focus:outline-none transition-colors"
          />
          {isSearching && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-primary" />
          )}
        </div>
      </div>

      {/* Search Results */}
      {searchQuery && (
        <div className="px-4 py-4">
          <h2 className="text-lg font-bold mb-4">
            Search Results{" "}
            {formattedSearchResults.length > 0 &&
              `(${formattedSearchResults.length})`}
          </h2>

          {isSearching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : formattedSearchResults.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No results found for "{searchQuery}"</p>
              <p className="text-sm mt-2">Try searching for BTC, ETH, SOL...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {formattedSearchResults.map((item) => (
                <div
                  key={item.pair}
                  className="flex items-center justify-between bg-card border border-border rounded-xl p-4 tap-scale hover:border-primary transition-colors"
                >
                  <div>
                    <p className="font-bold">{item.pair}</p>
                    <p className="text-xs text-muted-foreground">
                      Vol: {item.volume}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-semibold ${item.isPositive ? "text-success" : "text-destructive"}`}
                    >
                      {item.change}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ratio: {item.ratio}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Content (hidden when searching) */}
      {!searchQuery && (
        <div className="px-4 space-y-8 mt-4">
          {/* Agent Wallet Warning Banner - if detailed needed */}
          {isAuthenticated && !agentWallet && (
            <div
              onClick={() => setShowAgentSetup(true)}
              className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 cursor-pointer tap-scale"
            >
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-yellow-500 mt-0.5" />
                <div>
                  <h3 className="font-bold text-yellow-500">
                    Setup Trading Account
                  </h3>
                  <p className="text-sm text-yellow-500/80 mt-1">
                    You need to create and approve an Agent Wallet to start
                    trading on Pear Protocol. Tap to setup.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Top Pairs - NEW SECTION */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-yellow-500" />
              <h2 className="text-lg font-bold">Top Pairs</h2>
              {isLoading && (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(topPairs.length > 0
                ? topPairs
                : [
                    {
                      pair: "BTC/USDT",
                      change: "+2.1%",
                      isPositive: true,
                      volume: "$12.8B",
                      ratio: "0.0456",
                    },
                    {
                      pair: "ETH/USDT",
                      change: "+1.8%",
                      isPositive: true,
                      volume: "$6.2B",
                      ratio: "0.0345",
                    },
                    {
                      pair: "SOL/USDT",
                      change: "+5.2%",
                      isPositive: true,
                      volume: "$2.4B",
                      ratio: "0.0234",
                    },
                    {
                      pair: "HYPE/USDT",
                      change: "+8.5%",
                      isPositive: true,
                      volume: "$1.8B",
                      ratio: "0.0123",
                    },
                    {
                      pair: "AVAX/USDT",
                      change: "+3.1%",
                      isPositive: true,
                      volume: "$890M",
                      ratio: "0.0567",
                    },
                    {
                      pair: "LINK/USDT",
                      change: "+4.2%",
                      isPositive: true,
                      volume: "$1.1B",
                      ratio: "0.0678",
                    },
                  ]
              ).map((item) => {
                // Handle both real data (with .formatted) and fallback data
                const data = "formatted" in item ? item.formatted : item;
                const market = "original" in item ? item.original : null;

                return (
                  <div
                    key={data.pair}
                    onClick={() => market && handleMarketClick(market)}
                    className="bg-gradient-to-br from-card to-secondary/50 border border-border rounded-xl p-4 tap-scale hover:border-primary transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-lg">
                        {data.pair.split("/")[0]}
                      </p>
                      <p
                        className={`text-sm font-semibold ${data.isPositive ? "text-success" : "text-destructive"}`}
                      >
                        {data.change}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">{data.pair}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Vol: {data.volume}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Top Gainers */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-success" />
              <h2 className="text-lg font-bold">Top Gainers</h2>
            </div>

            {error ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                Failed to load markets. Showing demo data.
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
                {(topGainers.length > 0
                  ? topGainers
                  : [
                      {
                        pair: "SOL/USDT",
                        change: "+5.2%",
                        isPositive: true,
                        volume: "$2.4B",
                      },
                      {
                        pair: "AVAX/USDT",
                        change: "+8.1%",
                        isPositive: true,
                        volume: "$890M",
                      },
                      {
                        pair: "LINK/USDT",
                        change: "+6.7%",
                        isPositive: true,
                        volume: "$1.1B",
                      },
                    ]
                ).map((item) => {
                  const data = "formatted" in item ? item.formatted : item;
                  const market = "original" in item ? item.original : null;

                  return (
                    <div
                      key={data.pair}
                      onClick={() => market && handleMarketClick(market)}
                      className="flex-shrink-0 bg-card border border-border rounded-xl p-4 min-w-[140px] tap-scale hover:border-success transition-colors cursor-pointer"
                    >
                      <p className="font-bold mb-1">{data.pair}</p>
                      <p className="text-success text-sm font-semibold">
                        {data.change}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Vol: {data.volume}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Top Losers */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown className="w-5 h-5 text-destructive" />
              <h2 className="text-lg font-bold">Top Losers</h2>
            </div>

            <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
              {(topLosers.length > 0
                ? topLosers
                : [
                    {
                      pair: "DOGE/USDT",
                      change: "-3.2%",
                      isPositive: false,
                      volume: "$1.2B",
                    },
                    {
                      pair: "SHIB/USDT",
                      change: "-5.1%",
                      isPositive: false,
                      volume: "$450M",
                    },
                  ]
              ).map((item) => {
                const data = "formatted" in item ? item.formatted : item;
                const market = "original" in item ? item.original : null;

                return (
                  <div
                    key={data.pair}
                    onClick={() => market && handleMarketClick(market)}
                    className="flex-shrink-0 bg-card border border-border rounded-xl p-4 min-w-[140px] tap-scale hover:border-destructive transition-colors cursor-pointer"
                  >
                    <p className="font-bold mb-1">{data.pair}</p>
                    <p className="text-destructive text-sm font-semibold">
                      {data.change}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Vol: {data.volume}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Top Traders */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Top Traders</h2>
              <button className="text-sm text-primary font-medium flex items-center gap-1">
                See all <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {topTraders.map((trader, index) => (
                <div
                  key={trader.id}
                  className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 tap-scale"
                >
                  <span className="text-lg font-bold text-muted-foreground w-6">
                    #{index + 1}
                  </span>
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-xl">
                    {trader.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{trader.username}</span>
                      {trader.verified && (
                        <BadgeCheck className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-success">{trader.winRate} win</span>
                      <span className="text-muted-foreground">
                        {trader.followers}
                      </span>
                    </div>
                  </div>
                  <button className="px-3 py-1.5 rounded-full border border-primary text-primary text-sm font-medium tap-scale hover:bg-primary hover:text-primary-foreground transition-colors">
                    Follow
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Hot Pairs */}
          <section>
            <h2 className="text-lg font-bold mb-4">🔥 Hot Pairs</h2>
            <div className="flex flex-wrap gap-2">
              {(hotPairs.length > 0
                ? hotPairs
                : ["SOL", "AVAX", "JTO", "LINK", "ARB", "OP", "INJ", "TIA"]
              ).map((pair) => (
                <button
                  key={pair}
                  onClick={() => setSearchQuery(pair)}
                  className="px-4 py-2 rounded-full bg-secondary font-medium tap-scale hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  {pair}
                </button>
              ))}
            </div>
          </section>

          {/* Low Risk Section */}
          <section>
            <h2 className="text-lg font-bold mb-4">🛡️ Low Risk Picks</h2>
            <div className="space-y-3">
              {lowRiskTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="bg-card border border-border rounded-xl p-4 tap-scale hover:border-success transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{trade.trader.avatar}</span>
                      <span className="font-medium">
                        {trade.trader.username}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-success/20 text-success">
                      LOW RISK
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{trade.pair}</span>
                    <span className="text-success font-semibold">
                      {trade.pnl}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Moonshots */}
          <section>
            <h2 className="text-lg font-bold mb-4">🚀 Moonshots</h2>
            <div className="space-y-3">
              {highRiskTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="bg-card border border-border rounded-xl p-4 tap-scale hover:border-warning transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{trade.trader.avatar}</span>
                      <span className="font-medium">
                        {trade.trader.username}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive/20 text-destructive">
                      HIGH RISK
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{trade.pair}</span>
                    <span
                      className={`font-semibold ${trade.pnlValue > 0 ? "text-success" : "text-destructive"}`}
                    >
                      {trade.pnl}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Pair Trading Info */}
          <section className="pb-8">
            <div className="bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20 rounded-xl p-4">
              <h3 className="font-bold mb-2">💡 What is Pair Trading?</h3>
              <p className="text-sm text-muted-foreground">
                Pair trading lets you go{" "}
                <span className="text-success font-medium">LONG</span> on one
                asset while going{" "}
                <span className="text-destructive font-medium">SHORT</span> on
                another. This captures the relative performance between them,
                reducing market-wide risk.
              </p>
              <button className="mt-3 text-sm text-primary font-medium flex items-center gap-1">
                Learn more <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Quick Trade Modal */}
      <QuickTradeModal
        market={selectedMarket}
        isOpen={showQuickTrade}
        onClose={() => setShowQuickTrade(false)}
      />

      {/* Agent Wallet Setup Modal */}
      <AgentWalletSetupModal
        isOpen={showAgentSetup}
        onClose={() => setShowAgentSetup(false)}
      />
    </div>
  );
}
