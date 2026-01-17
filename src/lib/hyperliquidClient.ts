// Hyperliquid Direct Client
// Used for direct data fetching bypassing Pear backend for accuracy

const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

export interface HyperliquidPortfolio {
  accountValue: number;
  totalMarginUsed: number;
  withdrawable: number;
}

export interface AssetMeta {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated: boolean;
}

export interface HyperliquidPosition {
  coin: string;
  size: number;
  entryPrice: number;
  unrealizedPnl: number;
  leverage: number;
}

export const hyperliquidClient = {
  async getPortfolio(address: string): Promise<HyperliquidPortfolio> {
    try {
      const response = await fetch(HYPERLIQUID_INFO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "clearinghouseState",
          user: address,
        }),
      });

      if (!response.ok) {
        throw new Error(`Hyperliquid API Error: ${response.status}`);
      }

      const data = await response.json();
      
      // Handle case where account might not exist or be empty
      if (!data || !data.marginSummary) {
          return {
              accountValue: 0,
              totalMarginUsed: 0,
              withdrawable: 0
          };
      }

      return {
        accountValue: parseFloat(data.marginSummary.accountValue || "0"),
        totalMarginUsed: parseFloat(data.marginSummary.totalMarginUsed || "0"),
        withdrawable: parseFloat(data.withdrawable || data.marginSummary.accountValue || "0"), // approximate
      };
    } catch (err) {
      console.error("Hyperliquid fetch error:", err);
      // Return zero on error to prevent crashes
      return {
        accountValue: 0,
        totalMarginUsed: 0,
        withdrawable: 0
      };
    }
  },

  async getMaxBuilderFee(user: string, builder: string): Promise<number> {
      try {
          const response = await fetch(HYPERLIQUID_INFO_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  type: "maxBuilderFee",
                  user: user,
                  builder: builder
              })
          });
          
          if (!response.ok) return 0;
          
          const data = await response.json();
          // Hyperliquid returns the max fee rate allowed as a number (e.g. 1 is 0.001% or similar scale)
          // If null or undefined, not approved.
          return typeof data === 'number' ? data : 0;
      } catch (err) {
          console.error("Failed to check builder fee:", err);
          return 0;
      }
  },

  // Fetch Asset Metadata (szDecimals, etc)
  async getMeta(): Promise<AssetMeta[]> {
      try {
          const response = await fetch(HYPERLIQUID_INFO_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "meta" })
          });
          
          if (!response.ok) throw new Error("Failed to fetch meta");
          
          const data = await response.json();
          return data.universe || [];
      } catch (err) {
          console.error("Failed to fetch asset meta:", err);
          return [];
      }
  },

  // Fetch Current Prices (allMids)
  async getAllMids(): Promise<Record<string, number>> {
      try {
        const response = await fetch(HYPERLIQUID_INFO_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "allMids" })
        });
        
        if (!response.ok) return {};
        const rawData = await response.json();
        
        // Convert string prices to numbers
        const prices: Record<string, number> = {};
        for (const [key, value] of Object.entries(rawData)) {
            prices[key] = parseFloat(value as string);
        }
        return prices;
      } catch (err) {
          console.error("Failed to fetch mids:", err);
          return {};
      }
  },

  // Fetch open positions for an address
  async getPositions(address: string): Promise<HyperliquidPosition[]> {
    try {
      const response = await fetch(HYPERLIQUID_INFO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "clearinghouseState",
          user: address,
        }),
      });
      
      if (!response.ok) return [];
      
      const data = await response.json();
      
      if (!data || !data.assetPositions) return [];
      
      // Map to a simpler structure
      return data.assetPositions.map((pos: { position: { coin: string; szi: string; entryPx: string; unrealizedPnl: string; leverage: { value: string } } }) => ({
        coin: pos.position.coin,
        size: parseFloat(pos.position.szi || "0"),
        entryPrice: parseFloat(pos.position.entryPx || "0"),
        unrealizedPnl: parseFloat(pos.position.unrealizedPnl || "0"),
        leverage: parseFloat(pos.position.leverage?.value || "1"),
      })).filter((p: HyperliquidPosition) => p.size !== 0); // Only return positions with non-zero size
    } catch (err) {
      console.error("Failed to fetch positions:", err);
      return [];
    }
  }
};
