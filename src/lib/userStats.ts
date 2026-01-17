import { pearClient } from "@/lib/pearClient";
import { db } from "@/lib/db";

/**
 * Calculates user statistics (Win Rate, Total PnL, Total Trades) based on Pear Protocol trade history
 * and updates the user's record in Supabase.
 */
export async function calculateAndUpdateUserStats(userId: string, walletAddress: string) {
  try {
    // Fetch complete history (for the authenticated user)
    const history = await pearClient.getTradeHistory();
    
    if (!history || history.length === 0) return;

    // Filter for closed trades that have PnL data
    // We consider a trade "closed" for stats if it has a realized PnL percentage
    const closedTrades = history.filter(t => t.realizedPnlPercentage !== undefined);

    if (closedTrades.length === 0) return;

    const totalTrades = closedTrades.length;
    let winCount = 0;
    let totalPnl = 0;

    closedTrades.forEach(trade => {
      const pnl = trade.realizedPnl || 0;
      const pnlPercent = trade.realizedPnlPercentage || 0;
      
      totalPnl += pnl;
      
      // Win = Positive PnL Percentage (strict positive or >= 0? Usually > 0 for "Win")
      if (pnlPercent > 0) {
        winCount++;
      }
    });

    const winRate = (winCount / totalTrades) * 100;

    // Update the user record
    await db.users.update(userId, {
      total_trades: totalTrades,
      win_rate: winRate,
      total_pnl: totalPnl,
    });
    
    console.log(`Updated stats for ${userId}: ${totalTrades} trades, ${winRate.toFixed(1)}% WR, $${totalPnl.toFixed(2)} PnL`);

  } catch (error) {
    console.error("Failed to calculate and update user stats:", error);
  }
}
