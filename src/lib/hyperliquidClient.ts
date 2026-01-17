// Hyperliquid Direct Client
// Used for direct data fetching bypassing Pear backend for accuracy

const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

export interface HyperliquidPortfolio {
  accountValue: number;
  totalMarginUsed: number;
  withdrawable: number;
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
  }
};
