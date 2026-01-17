// Portfolio Screen with Real Balance Integration (Wallet + Hyperliquid)
import { useState, useEffect } from "react";
import {
  Volume2,
  TrendingUp,
  TrendingDown,
  X,
  Loader2,
  RefreshCw,
  Wallet,
  AlertCircle,
  Smartphone,
  Globe,
  Settings,
} from "lucide-react";
import { useAccount, useBalance } from "wagmi";
import { positions as mockPositions } from "@/data/mockData";
import {
  usePearPositions,
  usePearAccount,
  usePearTradeHistory,
} from "@/hooks/usePear";
import { usePearAuthContext } from "@/contexts/PearAuthContext";
import { pearClient } from "@/lib/pearClient";
import { hyperliquidClient } from "@/lib/hyperliquidClient";
import { useToast } from "@/hooks/use-toast";
import type { OpenPosition } from "@/types/pear";
import { RiskParametersModal } from "@/components/RiskParametersModal";

// Arbitrum One USDC Address
const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

type Tab = "active" | "history";

export function PortfolioScreen() {
  const { toast } = useToast();
  const { isAuthenticated, account } = usePearAuthContext();
  const { address } = useAccount();

  // Real Wallet Balance (Arbitrum USDC)
  const { data: walletBalance, refetch: refetchWallet } = useBalance({
    address,
    token: USDC_ADDRESS,
    chainId: 42161,
  });

  // Real Hyperliquid Balance
  const [hlBalance, setHlBalance] = useState<number>(0);
  const [hlLoading, setHlLoading] = useState(false);

  const {
    positions: pearPositions,
    isLoading: positionsLoading,
    error: positionsError,
    refetch: refetchPositions,
  } = usePearPositions();
  const {
    portfolio,
    isLoading: accountLoading,
    refetch: refetchAccount,
  } = usePearAccount();
  const {
    trades: tradeHistory,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = usePearTradeHistory();

  const [activeTab, setActiveTab] = useState<Tab>("active");
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [closingPositionId, setClosingPositionId] = useState<string | null>(
    null,
  );
  const [riskModalPosition, setRiskModalPosition] =
    useState<OpenPosition | null>(null);

  // Fetch Hyperliquid Balance
  const fetchHlBalance = async () => {
    if (!address) return;
    setHlLoading(true);
    try {
      const data = await hyperliquidClient.getPortfolio(address);
      setHlBalance(data.accountValue);
    } catch (e) {
      console.error("Failed to fetch HL balance", e);
    } finally {
      setHlLoading(false);
    }
  };

  useEffect(() => {
    fetchHlBalance();
  }, [address]);

  // Calculate Totals
  // If authenticated, use real values. If not, use 0 (or fallback to demo if desired, but user wants accuracy)
  const walletUsd = isAuthenticated ? Number(walletBalance?.formatted || 0) : 0;
  const hyperliquidUsd = isAuthenticated ? hlBalance : 0;
  const totalValue = walletUsd + hyperliquidUsd;

  // Derived stats
  const unrealizedPnl = account?.unrealizedPnl ?? 0;
  const marginUsed = account?.marginUsed ?? 0;

  // Portfolio stats from real data
  const stats = portfolio?.overall
    ? {
        totalPnl: `${portfolio.overall.totalWinningUsd - portfolio.overall.totalLosingUsd >= 0 ? "+" : ""}$${Math.abs(portfolio.overall.totalWinningUsd - portfolio.overall.totalLosingUsd).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        winRate:
          portfolio.overall.totalTrades > 0
            ? `${Math.round((portfolio.overall.totalWinningTradesCount / portfolio.overall.totalTrades) * 100)}%`
            : "0%",
        totalTrades: portfolio.overall.totalTrades,
        openInterest: portfolio.overall.currentOpenInterest,
      }
    : {
        totalPnl: "$0.00",
        winRate: "0%",
        totalTrades: 0,
        openInterest: 0,
      };

  // Handle position close
  const handleClosePosition = async (positionId: string) => {
    if (closingPositionId) return;

    setClosingPositionId(positionId);

    try {
      await pearClient.closePosition(positionId, { executionType: "MARKET" });

      toast({
        title: "Position Closed",
        description: "Your position has been successfully closed",
      });

      // Refresh positions
      await refetchPositions();
      await refetchAccount();
      fetchHlBalance(); // Refresh balance too
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to close position";
      toast({
        title: "Close Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setClosingPositionId(null);
      setSwipedId(null);
    }
  };

  // Refresh data
  const handleRefresh = async () => {
    await Promise.all([
      refetchPositions(),
      refetchAccount(),
      refetchHistory(),
      refetchWallet(),
      fetchHlBalance(),
    ]);
  };

  // Format position for display
  const formatPosition = (position: OpenPosition) => {
    const longAsset = position.longAssets[0]?.coin ?? "UNKNOWN";
    const shortAsset = position.shortAssets[0]?.coin ?? "USDT";
    const pair = `${longAsset}/${shortAsset}`;
    const direction = position.longAssets.length > 0 ? "LONG" : "SHORT";
    const entryPrice =
      position.longAssets[0]?.entryPrice ??
      position.shortAssets[0]?.entryPrice ??
      0;
    const currentValue = position.positionValue;
    const pnl = position.unrealizedPnl;
    const pnlPercent = position.unrealizedPnlPercentage;

    return {
      id: position.positionId,
      pair,
      direction,
      entryPrice: `$${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      currentValue: `$${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      pnl: `${pnl >= 0 ? "+" : ""}$${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      pnlPercent: `${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(2)}%`,
      isProfitable: pnl >= 0,
      marginUsed: `$${position.marginUsed.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      leverage:
        position.longAssets[0]?.leverage ??
        position.shortAssets[0]?.leverage ??
        1,
      createdAt: new Date(position.createdAt).toLocaleDateString(),
    };
  };

  // Render not connected state
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen pb-32">
        {/* Header */}
        <div className="bg-gradient-to-b from-card to-background px-4 pt-6 pb-8">
          <h1 className="text-xl font-bold mb-6">Portfolio</h1>

          {/* Connect Wallet CTA */}
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Wallet className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">Connect Wallet</h2>
            <p className="text-muted-foreground text-center mb-6">
              Connect your wallet to view your real positions and trade history
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      {/* Header */}
      <div className="bg-gradient-to-b from-card to-background px-4 pt-6 pb-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Portfolio</h1>
          <button
            onClick={handleRefresh}
            disabled={positionsLoading || accountLoading || hlLoading}
            className="p-2 rounded-xl bg-secondary tap-scale disabled:opacity-50"
          >
            <RefreshCw
              className={`w-5 h-5 ${positionsLoading || accountLoading || hlLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {/* Total Value */}
        <div className="mb-6">
          <p className="text-sm text-muted-foreground mb-1">Total Net Worth</p>
          <p className="text-4xl font-bold mb-4">
            $
            {totalValue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>

          {/* Detailed Breakdown */}
          <div className="grid grid-cols-2 gap-3">
            {/* Wallet Balance */}
            <div className="bg-secondary/50 rounded-xl p-3 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Arbitrum USDC
                </span>
              </div>
              <p className="text-lg font-semibold">
                $
                {walletUsd.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            {/* Hyperliquid Balance */}
            <div className="bg-secondary/50 rounded-xl p-3 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">
                  Hyperliquid
                </span>
              </div>
              <p className="text-lg font-semibold">
                $
                {hyperliquidUsd.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Unrealized P&L */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            {unrealizedPnl >= 0 ? (
              <TrendingUp className="w-5 h-5 text-success" />
            ) : (
              <TrendingDown className="w-5 h-5 text-destructive" />
            )}
            <span
              className={`font-semibold ${unrealizedPnl >= 0 ? "text-success" : "text-destructive"}`}
            >
              {unrealizedPnl >= 0 ? "+" : ""}$
              {unrealizedPnl.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
          <span
            className={`px-2 py-1 rounded-lg text-sm font-semibold ${
              unrealizedPnl >= 0
                ? "bg-success/20 text-success"
                : "bg-destructive/20 text-destructive"
            }`}
          >
            Unrealized P&L
          </span>
        </div>

        {/* Margin Info */}
        <div className="flex items-center gap-4">
          <div className="px-3 py-2 rounded-xl bg-secondary/50">
            <p className="text-xs text-muted-foreground">Margin Used</p>
            <p className="font-semibold">
              $
              {marginUsed.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="px-3 py-2 rounded-xl bg-secondary/50">
            <p className="text-xs text-muted-foreground">Free Collateral</p>
            <p className="font-semibold">
              $
              {(account?.freeCollateral ?? 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-4">
        {(["active", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 font-medium capitalize transition-colors ${
              activeTab === tab
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground"
            }`}
          >
            {tab === "active" ? `Active (${pearPositions.length})` : "History"}
          </button>
        ))}
      </div>

      {/* Error State */}
      {positionsError && (
        <div className="mx-4 mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-destructive" />
          <span className="text-sm text-destructive">{positionsError}</span>
        </div>
      )}

      {/* Positions List */}
      <div className="px-4 py-4 space-y-3">
        {activeTab === "active" ? (
          positionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : pearPositions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium mb-2">No Open Positions</p>
              <p className="text-sm">Copy a trade to get started!</p>
            </div>
          ) : (
            pearPositions.map((position) => {
              const formatted = formatPosition(position);
              const isSwiped = swipedId === formatted.id;
              const isClosing = closingPositionId === formatted.id;

              return (
                <div
                  key={formatted.id}
                  className="relative overflow-hidden rounded-xl"
                >
                  {/* Swipe Action */}
                  <div className="absolute inset-y-0 right-0 w-24 bg-destructive flex items-center justify-center rounded-r-xl">
                    <button
                      onClick={() => handleClosePosition(formatted.id)}
                      disabled={isClosing}
                      className="p-2 flex flex-col items-center"
                    >
                      {isClosing ? (
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      ) : (
                        <>
                          <X className="w-6 h-6 text-white" />
                          <span className="text-xs text-white mt-1">Close</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Position Card */}
                  <div
                    onClick={() => setSwipedId(isSwiped ? null : formatted.id)}
                    className={`relative bg-card border border-border rounded-xl p-4 transition-transform duration-200 cursor-pointer ${
                      isSwiped ? "-translate-x-24" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold">
                          {formatted.pair}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold ${
                            formatted.direction === "LONG"
                              ? "bg-success/20 text-success"
                              : "bg-destructive/20 text-destructive"
                          }`}
                        >
                          {formatted.direction}
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-secondary">
                          {formatted.leverage}x
                        </span>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-lg font-bold ${
                            formatted.isProfitable
                              ? "text-success"
                              : "text-destructive"
                          }`}
                        >
                          {formatted.pnl}
                        </span>
                        <p
                          className={`text-xs ${
                            formatted.isProfitable
                              ? "text-success"
                              : "text-destructive"
                          }`}
                        >
                          {formatted.pnlPercent}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                      <div>
                        <p className="text-muted-foreground mb-0.5">Entry</p>
                        <p className="font-medium">{formatted.entryPrice}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Value</p>
                        <p className="font-medium">{formatted.currentValue}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Margin</p>
                        <p className="font-medium">{formatted.marginUsed}</p>
                      </div>
                    </div>

                    {/* TP/SL Display */}
                    <div className="flex items-center justify-between pt-3 border-t border-border/50">
                      <div className="flex items-center gap-3 text-xs">
                        {position.takeProfit ? (
                          <div className="flex items-center gap-1 text-success">
                            <TrendingUp className="w-3 h-3" />
                            <span>
                              TP:{" "}
                              {position.takeProfit.type === "PERCENTAGE"
                                ? `${position.takeProfit.value}%`
                                : `$${position.takeProfit.value}`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No TP</span>
                        )}
                        {position.stopLoss ? (
                          <div className="flex items-center gap-1 text-destructive">
                            <TrendingDown className="w-3 h-3" />
                            <span>
                              SL:{" "}
                              {position.stopLoss.type === "PERCENTAGE"
                                ? `${position.stopLoss.value}%`
                                : `$${position.stopLoss.value}`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No SL</span>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRiskModalPosition(position);
                        }}
                        className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary tap-scale transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )
        ) : historyLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : tradeHistory.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No trade history yet</p>
          </div>
        ) : (
          tradeHistory.map((trade) => {
            // Try to get asset names from different possible fields
            const longAsset =
              trade.closedLongAssets?.[0]?.coin ??
              trade.positionLongAssets?.[0] ??
              trade.longAssets?.[0]?.coin ??
              "UNKNOWN";
            const shortAsset =
              trade.closedShortAssets?.[0]?.coin ??
              trade.positionShortAssets?.[0] ??
              trade.shortAssets?.[0]?.coin ??
              "USDC";
            const pair = `${longAsset}/${shortAsset}`;

            return (
              <div
                key={trade.tradeHistoryId || trade.tradeId || trade.positionId}
                className="bg-card border border-border rounded-xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{pair}</span>
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
        )}
      </div>

      {/* Stats Section */}
      <div className="px-4 mt-4">
        <h2 className="text-lg font-bold mb-4">Performance Stats</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-1">Total P&L</p>
            <p
              className={`text-xl font-bold ${
                stats.totalPnl.startsWith("+")
                  ? "text-success"
                  : "text-destructive"
              }`}
            >
              {stats.totalPnl}
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-1">Win Rate</p>
            <p className="text-xl font-bold text-success">{stats.winRate}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-1">Total Trades</p>
            <p className="text-xl font-bold">{stats.totalTrades}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-1">Open Interest</p>
            <p className="text-xl font-bold">
              ${stats.openInterest.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Risk Parameters Modal */}
      <RiskParametersModal
        position={riskModalPosition}
        isOpen={!!riskModalPosition}
        onClose={() => setRiskModalPosition(null)}
        onSuccess={() => {
          refetchPositions();
          refetchAccount();
        }}
      />
    </div>
  );
}
