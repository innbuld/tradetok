// Quick Trade Modal for Discover Screen

import { X, TrendingUp, TrendingDown, Zap } from "lucide-react";
import type { Market } from "@/types/pear";
import { usePearAuthContext } from "@/contexts/PearAuthContext";

interface QuickTradeModalProps {
  market: Market | null;
  isOpen: boolean;
  onClose: () => void;
}

export function QuickTradeModal({
  market,
  isOpen,
  onClose,
}: QuickTradeModalProps) {
  const { isAuthenticated } = usePearAuthContext();

  if (!isOpen || !market) return null;

  const longAsset = market.longAssets?.[0]?.asset ?? "UNKNOWN";
  const shortAsset = market.shortAssets?.[0]?.asset ?? "USDT";
  const pair = `${longAsset}/${shortAsset}`;
  const change = parseFloat(market.change24h || "0") * 100;
  const isPositive = change >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-mobile bg-card rounded-t-3xl animate-slide-up p-6">
        {/* Handle */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-muted" />

        {/* Header */}
        <div className="flex items-center justify-between mb-6 mt-4">
          <div>
            <h2 className="text-2xl font-bold">{pair}</h2>
            <p className="text-sm text-muted-foreground">Pair Trade</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-secondary tap-scale"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Market Info */}
        <div className="bg-secondary rounded-xl p-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Long Position
              </p>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-success" />
                <p className="font-bold text-success">{longAsset}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Short Position
              </p>
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-destructive" />
                <p className="font-bold text-destructive">{shortAsset}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">24h Change</span>
              <span
                className={`font-semibold ${isPositive ? "text-success" : "text-destructive"}`}
              >
                {isPositive ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <Zap className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">What is this trade?</p>
              <p className="text-sm text-muted-foreground">
                This pair trade goes{" "}
                <span className="text-success font-medium">
                  LONG {longAsset}
                </span>{" "}
                while simultaneously going{" "}
                <span className="text-destructive font-medium">
                  SHORT {shortAsset}
                </span>
                . You profit if {longAsset} outperforms {shortAsset}.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {isAuthenticated ? (
          <button
            onClick={onClose}
            className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-bold text-lg tap-scale mb-3"
          >
            Coming Soon: Quick Trade
          </button>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">
              Connect your wallet to trade this pair
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-xl bg-secondary font-semibold tap-scale"
            >
              Close
            </button>
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground">
          Tip: Look for this pair in the Feed to copy trades from top traders
        </p>
      </div>
    </div>
  );
}
