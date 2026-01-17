import { useState } from "react";
import { Filter } from "lucide-react";
import { TradePost } from "@/components/TradePost";
import { CopyTradeModal } from "@/components/CopyTradeModal";
import { FilterDrawer } from "@/components/FilterDrawer";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { trades, type Trade } from "@/data/mockData";

export function FeedScreen() {
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  return (
    <div className="min-h-screen pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">TradeTok</h1>
          <div className="flex items-center gap-2">
            <WalletConnectButton compact />
            <button
              onClick={() => setIsFilterOpen(true)}
              className="p-2 rounded-full bg-secondary tap-scale"
            >
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="snap-y snap-mandatory">
        {trades.map((trade) => (
          <div key={trade.id} className="snap-start">
            <TradePost
              trade={trade}
              onCopyTrade={() => setSelectedTrade(trade)}
            />
          </div>
        ))}
      </div>

      {/* Modals */}
      {selectedTrade && (
        <CopyTradeModal
          trade={selectedTrade}
          isOpen={!!selectedTrade}
          onClose={() => setSelectedTrade(null)}
        />
      )}

      <FilterDrawer
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
      />
    </div>
  );
}
