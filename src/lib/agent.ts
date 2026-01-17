// AI Trading Agent Service
// Translates user intent (natural language or preset commands) into executable trades

import { pearClient } from './pearClient';
import { hyperliquidClient } from './hyperliquidClient';
import { db } from './db';
import { hybridParser, type ParsedIntent, type ChatContext } from './llmParser';
import type { Market, CreatePositionResponse } from '@/types/pear';
import type { TradePost, User } from '@/types/database';

// ============================================
// TYPES
// ============================================

export type AgentStrategy = 
  | 'LONG_TOP_GAINER'
  | 'SHORT_TOP_LOSER'
  | 'COPY_TOP_TRADER'
  | 'PAIR_TRADE'  // NEW: Long one asset, short another
  | 'CUSTOM';

export interface AgentCommand {
  strategy: AgentStrategy;
  amount?: number;
  leverage?: number;
  customParams?: {
    asset?: string;
    shortAsset?: string;  // NEW: For pair trades
    direction?: 'LONG' | 'SHORT';
  };
}

export interface AgentAnalysis {
  strategy: AgentStrategy;
  asset?: string;
  shortAsset?: string;  // NEW: For pair trades
  direction: 'LONG' | 'SHORT';
  pair: string;
  reason: string;
  change24h?: string;
  volume?: string;
  trader?: {
    username: string;
    winRate: number;
    pnl: number;
  };
  suggestedAmount: number;
  suggestedLeverage: number;
}

export interface AgentExecutionResult {
  success: boolean;
  orderId?: string;
  error?: string;
  analysis: AgentAnalysis;
}

// Rich response types for structured data
export interface BalanceData {
  type: 'balance';
  accountValue: number;
  available: number;
  inPositions: number;
}

export interface PortfolioData {
  type: 'portfolio';
  accountValue: number;
  positions: Array<{
    coin: string;
    direction: 'LONG' | 'SHORT';
    pnl: number;
    size: number;
  }>;
}

export interface MarketData {
  type: 'market';
  gainers: Array<{ asset: string; change: number }>;
  losers: Array<{ asset: string; change: number }>;
}

export type AgentRichData = BalanceData | PortfolioData | MarketData;

export interface TopMover {
  symbol: string;
  change24h: number;
  volume: number;
  price: number;
  market: Market;
}

// Minimum notional value per leg (matching QuickTradeModal)
const LEG_MIN_NOTIONAL = 10; // $10 per leg

// ============================================
// AGENT SERVICE
// ============================================

class TradingAgent {
  private defaultAmount = 50; // $50 default
  private defaultLeverage = 1; // 1x (safe starting point)

  /**
   * Calculate the actual minimum notional for an asset based on its metadata
   * This matches the logic in QuickTradeModal/BasketTradeModal
   */
  private async calculateAssetMinNotional(
    asset: string,
  ): Promise<{ minNotional: number; maxLeverage: number; price: number }> {
    try {
      const [meta, prices] = await Promise.all([
        hyperliquidClient.getMeta(),
        hyperliquidClient.getAllMids(),
      ]);

      const assetMeta = meta.find((m) => m.name === asset);
      const price = prices[asset] || 0;

      if (!assetMeta || !price) {
        // Default to $10 min and 20x max if we can't find metadata
        return { minNotional: LEG_MIN_NOTIONAL, maxLeverage: 20, price };
      }

      // Technical minimum based on smallest tradeable size
      const minUnitSize = Math.pow(10, -assetMeta.szDecimals);
      const minTechnicalNotional = minUnitSize * price;

      // Take the max of technical min and protocol min ($10)
      const minNotional = Math.max(minTechnicalNotional, LEG_MIN_NOTIONAL);

      return {
        minNotional,
        maxLeverage: assetMeta.maxLeverage || 20,
        price,
      };
    } catch (err) {
      console.error('[Agent] Failed to get asset metadata:', err);
      return { minNotional: LEG_MIN_NOTIONAL, maxLeverage: 20, price: 0 };
    }
  }

  /**
   * Calculate optimal trade parameters based on user balance and actual asset requirements
   * Fetches real asset metadata to determine minimum notional and max leverage
   * For pair trades, calculates min notional for BOTH long and short assets
   * 
   * @param userBalance - User's available balance
   * @param longAsset - The asset to long (e.g., "BTC", "ETH")
   * @param shortAsset - Optional asset to short (for pair trades)
   * @param requestedAmount - Optional amount user wants to trade
   * @param requestedLeverage - Optional leverage user requested
   */
  async getOptimalTradeParamsForAsset(
    userBalance: number,
    longAsset: string,
    shortAsset?: string,  // For pair trades
    requestedAmount?: number,
    requestedLeverage?: number,
  ): Promise<{ amount: number; leverage: number; canTrade: boolean; reason?: string; minNotional: number }> {
    // Get actual asset metadata for long side
    const longAssetInfo = await this.calculateAssetMinNotional(longAsset);
    
    // For pair trades, get short asset info too
    // If short is a stable (USDC), it doesn't add to min notional
    const isStable = (asset: string) => ['USDC', 'USDT', 'DAI'].includes(asset?.toUpperCase());
    const isPairTrade = shortAsset && !isStable(shortAsset);
    
    let totalMinNotional: number;
    let maxLeverage: number;
    
    if (isPairTrade) {
      // Pair trade: need to meet min notional on BOTH sides
      // Capital is split 50/50, so each side gets half
      // Thus total min = max(longMin, shortMin) / 0.5 = max * 2
      const shortAssetInfo = await this.calculateAssetMinNotional(shortAsset);
      
      // The most restrictive asset determines the total (because 50/50 split)
      const maxSingleSideMin = Math.max(longAssetInfo.minNotional, shortAssetInfo.minNotional);
      totalMinNotional = maxSingleSideMin / 0.5; // Since each side only gets 50%
      
      // Use the lower of the two max leverages for safety
      maxLeverage = Math.min(longAssetInfo.maxLeverage, shortAssetInfo.maxLeverage);
      
      console.log(`[Agent] Pair trade ${longAsset}/${shortAsset}: longMin=$${longAssetInfo.minNotional.toFixed(2)}, shortMin=$${shortAssetInfo.minNotional.toFixed(2)}, totalMin=$${totalMinNotional.toFixed(2)}, maxLev=${maxLeverage}x`);
    } else {
      // Directional trade: only need min on active side
      totalMinNotional = longAssetInfo.minNotional;
      maxLeverage = longAssetInfo.maxLeverage;
    }

    // Determine the amount to use (user's balance or requested)
    let amount = requestedAmount || Math.min(this.defaultAmount, userBalance);
    if (amount > userBalance) {
      amount = userBalance;
    }

    // Calculate minimum margin needed at max leverage
    const minMarginNeeded = totalMinNotional / maxLeverage;
    
    if (userBalance < minMarginNeeded) {
      return {
        amount: 0,
        leverage: 1,
        canTrade: false,
        reason: `Insufficient balance. Need at least $${minMarginNeeded.toFixed(2)} (${totalMinNotional.toFixed(2)} notional ÷ ${maxLeverage}x max leverage).`,
        minNotional: totalMinNotional,
      };
    }

    // Calculate the leverage needed for the chosen amount
    let leverage = requestedLeverage || this.defaultLeverage;
    
    // If the notional (amount * leverage) is less than min, increase leverage
    const currentNotional = amount * leverage;
    if (currentNotional < totalMinNotional) {
      const neededLeverage = Math.ceil(totalMinNotional / amount);
      leverage = Math.max(leverage, neededLeverage);
    }
    
    // Cap at max leverage
    leverage = Math.min(leverage, maxLeverage);

    // Final check
    const effectiveNotional = amount * leverage;
    if (effectiveNotional < totalMinNotional) {
      return {
        amount,
        leverage: maxLeverage,
        canTrade: false,
        reason: `Even with ${maxLeverage}x leverage, notional ($${effectiveNotional.toFixed(2)}) is below minimum ($${totalMinNotional.toFixed(2)}).`,
        minNotional: totalMinNotional,
      };
    }

    console.log(`[Agent] Trade params: $${amount} @ ${leverage}x = $${effectiveNotional.toFixed(2)} notional (min: $${totalMinNotional.toFixed(2)})`);

    return {
      amount,
      leverage,
      canTrade: true,
      minNotional: totalMinNotional,
    };
  }

  /**
   * Parse natural language command to structured AgentCommand
   */
  parseCommand(input: string): AgentCommand | null {
    const lower = input.toLowerCase().trim();

    // Strategy detection patterns
    if (lower.includes('long') && (lower.includes('top gainer') || lower.includes('best performer') || lower.includes('top mover'))) {
      return {
        strategy: 'LONG_TOP_GAINER',
        amount: this.extractAmount(lower),
        leverage: this.extractLeverage(lower),
      };
    }

    if (lower.includes('short') && (lower.includes('top loser') || lower.includes('worst performer') || lower.includes('biggest loser'))) {
      return {
        strategy: 'SHORT_TOP_LOSER',
        amount: this.extractAmount(lower),
        leverage: this.extractLeverage(lower),
      };
    }

    if (lower.includes('copy') && (lower.includes('trader') || lower.includes('top') || lower.includes('best'))) {
      return {
        strategy: 'COPY_TOP_TRADER',
        amount: this.extractAmount(lower),
        leverage: this.extractLeverage(lower),
      };
    }

    // Try to extract a specific asset long/short
    const longMatch = lower.match(/long\s+(\w+)/);
    if (longMatch) {
      return {
        strategy: 'CUSTOM',
        amount: this.extractAmount(lower),
        leverage: this.extractLeverage(lower),
        customParams: {
          asset: longMatch[1].toUpperCase(),
          direction: 'LONG',
        },
      };
    }

    const shortMatch = lower.match(/short\s+(\w+)/);
    if (shortMatch) {
      return {
        strategy: 'CUSTOM',
        amount: this.extractAmount(lower),
        leverage: this.extractLeverage(lower),
        customParams: {
          asset: shortMatch[1].toUpperCase(),
          direction: 'SHORT',
        },
      };
    }

    return null;
  }

  /**
   * Extract dollar amount from text
   */
  private extractAmount(text: string): number {
    // Match patterns like "$100", "100 usd", "100 dollars", "with 100"
    const patterns = [
      /\$(\d+(?:\.\d+)?)/,
      /(\d+(?:\.\d+)?)\s*(?:usd|dollars?)/i,
      /(?:with|using)\s+(\d+(?:\.\d+)?)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return this.defaultAmount;
  }

  /**
   * Extract leverage from text
   */
  private extractLeverage(text: string): number {
    const match = text.match(/(\d+)x\s*(?:leverage)?/i);
    if (match) {
      const leverage = parseInt(match[1], 10);
      // Cap at a reasonable max for user-specified leverage
      return Math.min(leverage, 50);
    }
    return this.defaultLeverage;
  }

  /**
   * Analyze: Find the top gainer from active markets
   */
  async analyzeTopGainer(): Promise<TopMover | null> {
    try {
      const activeMarkets = await pearClient.getActiveMarkets();
      const gainers = activeMarkets.topGainers || [];

      if (gainers.length === 0) return null;

      // Get the #1 gainer
      const topMarket = gainers[0];
      const longAsset = topMarket.longAssets?.[0]?.asset || 'UNKNOWN';
      const change = parseFloat(topMarket.change24h || '0') * 100;
      const volume = parseFloat(topMarket.volume || '0');

      // Get current price
      const prices = await hyperliquidClient.getAllMids();
      const price = prices[longAsset] || 0;

      return {
        symbol: longAsset,
        change24h: change,
        volume,
        price,
        market: topMarket,
      };
    } catch (err) {
      console.error('Failed to analyze top gainer:', err);
      return null;
    }
  }

  /**
   * Analyze: Find the top loser from active markets
   */
  async analyzeTopLoser(): Promise<TopMover | null> {
    try {
      const activeMarkets = await pearClient.getActiveMarkets();
      const losers = activeMarkets.topLosers || [];

      if (losers.length === 0) return null;

      // Get the #1 loser
      const topMarket = losers[0];
      const longAsset = topMarket.longAssets?.[0]?.asset || 'UNKNOWN';
      const change = parseFloat(topMarket.change24h || '0') * 100;
      const volume = parseFloat(topMarket.volume || '0');

      // Get current price
      const prices = await hyperliquidClient.getAllMids();
      const price = prices[longAsset] || 0;

      return {
        symbol: longAsset,
        change24h: change,
        volume,
        price,
        market: topMarket,
      };
    } catch (err) {
      console.error('Failed to analyze top loser:', err);
      return null;
    }
  }

  /**
   * Analyze: Find the top trader's latest trade
   */
  async analyzeTopTrader(): Promise<{
    trader: User;
    latestTrade: TradePost;
  } | null> {
    try {
      const topTraders = await db.users.getTopTraders(1);
      if (topTraders.length === 0) return null;

      const trader = topTraders[0];
      const trades = await db.posts.getByUser(trader.id, 1);
      if (trades.length === 0) return null;

      return {
        trader,
        latestTrade: trades[0],
      };
    } catch (err) {
      console.error('Failed to analyze top trader:', err);
      return null;
    }
  }

  /**
   * Generate full analysis for a command
   * Now includes smart leverage calculation based on user balance
   */
  async analyze(
    command: AgentCommand, 
    userBalance?: number
  ): Promise<AgentAnalysis | null> {
    // Default balance if not provided
    const balance = userBalance || 100;

    switch (command.strategy) {
      case 'LONG_TOP_GAINER': {
        const topGainer = await this.analyzeTopGainer();
        if (!topGainer) return null;

        // Directional trade against USDC - fetch actual asset requirements
        const tradeParams = await this.getOptimalTradeParamsForAsset(
          balance,
          topGainer.symbol,  // Pass the actual asset for metadata lookup
          false, // Directional trade, not pair trade
          command.amount,
          command.leverage,
        );

        if (!tradeParams.canTrade) {
          console.log('[Agent] Cannot trade:', tradeParams.reason);
          return null;
        }

        return {
          strategy: 'LONG_TOP_GAINER',
          asset: topGainer.symbol,
          direction: 'LONG',
          pair: `${topGainer.symbol}/USDC`,
          reason: `${topGainer.symbol} is the top 24h gainer. Using ${tradeParams.leverage}x leverage.`,
          change24h: `${topGainer.change24h >= 0 ? '+' : ''}${topGainer.change24h.toFixed(2)}%`,
          volume: this.formatVolume(topGainer.volume),
          suggestedAmount: tradeParams.amount,
          suggestedLeverage: tradeParams.leverage,
        };
      }

      case 'SHORT_TOP_LOSER': {
        const topLoser = await this.analyzeTopLoser();
        if (!topLoser) return null;

        // Directional trade against USDC - fetch actual asset requirements
        const tradeParams = await this.getOptimalTradeParamsForAsset(
          balance,
          topLoser.symbol,  // Pass the actual asset for metadata lookup
          false, // Directional trade
          command.amount,
          command.leverage,
        );

        if (!tradeParams.canTrade) {
          console.log('[Agent] Cannot trade:', tradeParams.reason);
          return null;
        }

        return {
          strategy: 'SHORT_TOP_LOSER',
          asset: topLoser.symbol,
          direction: 'SHORT',
          pair: `${topLoser.symbol}/USDC`,
          reason: `${topLoser.symbol} is the worst 24h performer. Using ${tradeParams.leverage}x leverage.`,
          change24h: `${topLoser.change24h >= 0 ? '+' : ''}${topLoser.change24h.toFixed(2)}%`,
          volume: this.formatVolume(topLoser.volume),
          suggestedAmount: tradeParams.amount,
          suggestedLeverage: tradeParams.leverage,
        };
      }

      case 'COPY_TOP_TRADER': {
        const result = await this.analyzeTopTrader();
        if (!result) return null;

        const { trader, latestTrade } = result;
        
        // Copy trades might be pair trades, check the original trade
        // short_assets is typed as Json, so we need to safely check it
        const shortAssets = Array.isArray(latestTrade.short_assets) ? latestTrade.short_assets : [];
        const isPair = shortAssets.length > 0 &&
          !['USDC', 'USDT'].includes((shortAssets[0] as any)?.asset);

        const tradeAsset = latestTrade.pair.split('/')[0];
        const tradeParams = await this.getOptimalTradeParamsForAsset(
          balance,
          tradeAsset,  // Pass the actual asset for metadata lookup
          isPair,
          command.amount,
          command.leverage || latestTrade.leverage,
        );

        if (!tradeParams.canTrade) {
          console.log('[Agent] Cannot trade:', tradeParams.reason);
          return null;
        }

        return {
          strategy: 'COPY_TOP_TRADER',
          asset: latestTrade.pair.split('/')[0],
          direction: latestTrade.direction as 'LONG' | 'SHORT',
          pair: latestTrade.pair,
          reason: `Copying @${trader.username}'s latest trade. Using ${tradeParams.leverage}x leverage.`,
          trader: {
            username: trader.username,
            winRate: trader.win_rate,
            pnl: trader.total_pnl,
          },
          suggestedAmount: tradeParams.amount,
          suggestedLeverage: tradeParams.leverage,
        };
      }

      case 'CUSTOM': {
        if (!command.customParams?.asset) return null;

        const asset = command.customParams.asset;
        const direction = command.customParams.direction || 'LONG';

        // Validate asset exists
        const prices = await hyperliquidClient.getAllMids();
        if (!prices[asset]) {
          return null;
        }

        // Custom directional trade - fetch actual asset requirements
        const tradeParams = await this.getOptimalTradeParamsForAsset(
          balance,
          asset,  // Pass the actual asset for metadata lookup
          false, // Directional trade
          command.amount,
          command.leverage,
        );

        if (!tradeParams.canTrade) {
          console.log('[Agent] Cannot trade:', tradeParams.reason);
          return null;
        }

        return {
          strategy: 'CUSTOM',
          asset,
          direction,
          pair: `${asset}/USDC`,
          reason: `Custom ${direction.toLowerCase()} position on ${asset}. Using ${tradeParams.leverage}x leverage.`,
          suggestedAmount: tradeParams.amount,
          suggestedLeverage: tradeParams.leverage,
        };
      }

      case 'PAIR_TRADE': {
        const longAsset = command.customParams?.asset;
        const shortAsset = command.customParams?.shortAsset;
        
        if (!longAsset || !shortAsset) return null;

        // Validate both assets exist
        const prices = await hyperliquidClient.getAllMids();
        if (!prices[longAsset] || !prices[shortAsset]) {
          console.log('[Agent] One or both assets not found:', longAsset, shortAsset);
          return null;
        }

        // Pair trade - fetch requirements for the more restrictive asset
        const tradeParams = await this.getOptimalTradeParamsForAsset(
          balance,
          longAsset,  // Use long asset for metadata
          true,        // This IS a pair trade (needs 2x notional)
          command.amount,
          command.leverage,
        );

        if (!tradeParams.canTrade) {
          console.log('[Agent] Cannot trade:', tradeParams.reason);
          return null;
        }

        return {
          strategy: 'PAIR_TRADE',
          asset: longAsset,
          shortAsset: shortAsset,  // Include short asset for execution
          direction: 'LONG' as const,  // Primary direction
          pair: `${longAsset}/${shortAsset}`,
          reason: `Pair trade: Long ${longAsset} / Short ${shortAsset}. Using ${tradeParams.leverage}x leverage.`,
          suggestedAmount: tradeParams.amount,
          suggestedLeverage: tradeParams.leverage,
        };
      }

      default:
        return null;
    }
  }

  /**
   * Execute trade based on analysis
   */
  async execute(analysis: AgentAnalysis): Promise<AgentExecutionResult> {
    try {
      const asset = analysis.asset;
      if (!asset) {
        throw new Error('No asset specified in analysis');
      }

      let response: CreatePositionResponse;

      // Check if this is a pair trade
      if (analysis.strategy === 'PAIR_TRADE' && analysis.shortAsset) {
        // Pair trade: Long asset, Short shortAsset
        response = await pearClient.createPosition({
          executionType: 'MARKET',
          usdValue: analysis.suggestedAmount * analysis.suggestedLeverage, // Notional value
          leverage: analysis.suggestedLeverage,
          longAssets: [{ asset: asset, weight: 1 }],
          shortAssets: [{ asset: analysis.shortAsset, weight: 1 }],
          slippage: 0.1,
        });
      } else {
        // Directional trade
        response = await pearClient.createDirectionalTrade({
          asset,
          direction: analysis.direction,
          usdValue: analysis.suggestedAmount,
          leverage: analysis.suggestedLeverage,
          slippage: 0.01, // 1%
        });
      }

      return {
        success: true,
        orderId: response.orderId || 'executed',
        analysis,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Execution failed',
        analysis,
      };
    }
  }

  /**
   * Full flow: Parse → Analyze → (Return for confirmation)
   * Uses rule-based parsing only (legacy method)
   */
  async processCommand(input: string): Promise<{
    command: AgentCommand | null;
    analysis: AgentAnalysis | null;
    error?: string;
  }> {
    const command = this.parseCommand(input);
    if (!command) {
      return {
        command: null,
        analysis: null,
        error: 'Could not understand command. Try: "Long the top gainer with $100" or "Copy the top trader"',
      };
    }

    const analysis = await this.analyze(command);
    if (!analysis) {
      return {
        command,
        analysis: null,
        error: 'Could not find suitable trade opportunity. Try again later.',
      };
    }

    return { command, analysis };
  }

  /**
   * LLM-Powered Command Processing
   * Uses Gemini for intelligent natural language understanding
   */
  async processCommandWithLLM(
    input: string, 
    context?: ChatContext,
    userAddress?: string
  ): Promise<{
    command: AgentCommand | null;
    analysis: AgentAnalysis | null;
    llmResponse?: string;
    richData?: AgentRichData;
    requiresConfirmation?: boolean;
    error?: string;
  }> {
    try {
      // Use hybrid parser (rules + LLM)
      const intent: ParsedIntent = await hybridParser.parse(input, context);

      console.log('[TradingAgent] Intent received:', intent.action, intent.response);

      // Handle actions that fetch real data
      if (intent.action === 'check_balance' && userAddress) {
        const balanceData = await this.fetchBalanceData(userAddress);
        return {
          command: null,
          analysis: null,
          richData: balanceData,
        };
      }

      if (intent.action === 'view_portfolio' && userAddress) {
        const portfolioData = await this.fetchPortfolioData(userAddress);
        return {
          command: null,
          analysis: null,
          richData: portfolioData,
        };
      }

      if (intent.action === 'market_analysis') {
        const marketData = await this.fetchMarketData();
        return {
          command: null,
          analysis: null,
          richData: marketData,
        };
      }

      // Handle simple conversational actions (no data needed)
      const simpleActions = ['help', 'explain', 'greeting', 'navigate', 'search_trades'];
      
      if (simpleActions.includes(intent.action)) {
        return {
          command: null,
          analysis: null,
          llmResponse: intent.response,
        };
      }

      if (intent.action === 'unknown') {
        return {
          command: null,
          analysis: null,
          error: intent.response,
        };
      }

      // Map LLM intent to AgentCommand
      const command = this.mapIntentToCommand(intent);
      if (!command) {
        return {
          command: null,
          analysis: null,
          llmResponse: intent.response,
        };
      }

      // Fetch user balance for smart leverage calculation
      let userBalance = 100; // Default balance
      if (userAddress) {
        try {
          const portfolio = await hyperliquidClient.getPortfolio(userAddress);
          userBalance = portfolio.withdrawable || portfolio.accountValue || 100;
        } catch (e) {
          console.log('[TradingAgent] Could not fetch balance, using default');
        }
      }

      // Analyze and get trade details with smart leverage
      const analysis = await this.analyze(command, userBalance);
      if (!analysis) {
        return {
          command,
          analysis: null,
          error: userBalance < 4 
            ? `Insufficient balance ($${userBalance.toFixed(2)}). Minimum $4 required with 5x leverage.`
            : 'Could not find suitable trade opportunity. Try again later.',
          llmResponse: intent.response,
        };
      }

      return { 
        command, 
        analysis,
        llmResponse: intent.response,
        requiresConfirmation: intent.requiresConfirmation,
      };
    } catch (err) {
      console.error('LLM processing error:', err);
      // Fall back to rule-based parsing
      return this.processCommand(input);
    }
  }

  /**
   * Map LLM ParsedIntent to AgentCommand
   */
  private mapIntentToCommand(intent: ParsedIntent): AgentCommand | null {
    switch (intent.action) {
      case 'long_top_gainer':
        return {
          strategy: 'LONG_TOP_GAINER',
          amount: intent.params.amount,
          leverage: intent.params.leverage,
        };

      case 'short_top_loser':
        return {
          strategy: 'SHORT_TOP_LOSER',
          amount: intent.params.amount,
          leverage: intent.params.leverage,
        };

      case 'copy_top_trader':
        return {
          strategy: 'COPY_TOP_TRADER',
          amount: intent.params.amount,
          leverage: intent.params.leverage,
        };

      case 'long_asset':
        if (!intent.params.asset) return null;
        return {
          strategy: 'CUSTOM',
          amount: intent.params.amount,
          leverage: intent.params.leverage,
          customParams: {
            asset: intent.params.asset,
            direction: 'LONG',
          },
        };

      case 'short_asset':
        if (!intent.params.asset) return null;
        return {
          strategy: 'CUSTOM',
          amount: intent.params.amount,
          leverage: intent.params.leverage,
          customParams: {
            asset: intent.params.asset,
            direction: 'SHORT',
          },
        };

      case 'pair_trade':
        if (!intent.params.asset || !intent.params.shortAsset) return null;
        return {
          strategy: 'PAIR_TRADE',
          amount: intent.params.amount,
          leverage: intent.params.leverage,
          customParams: {
            asset: intent.params.asset,        // Long this
            shortAsset: intent.params.shortAsset, // Short this
          },
        };

      default:
        return null;
    }
  }

  /**
   * Check if LLM is available
   */
  isLLMAvailable(): boolean {
    return hybridParser.isLLMAvailable();
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    hybridParser.clearHistory();
  }

  /**
   * Fetch user's balance from Hyperliquid
   */
  private async fetchBalance(address: string): Promise<string> {
    try {
      const portfolio = await hyperliquidClient.getPortfolio(address);
      
      if (portfolio.accountValue === 0) {
        return `💰 Your Balance\n\nAccount Value: $0.00\n\nNo funds deposited yet. Deposit USDC to your Hyperliquid account to start trading!`;
      }

      const available = portfolio.withdrawable || portfolio.accountValue - portfolio.totalMarginUsed;
      
      return `💰 Your Balance\n\n` +
        `📊 Account Value: $${portfolio.accountValue.toFixed(2)}\n` +
        `💵 Available: $${available.toFixed(2)}\n` +
        `🔒 In Positions: $${portfolio.totalMarginUsed.toFixed(2)}\n\n` +
        `Ready to trade! Try "Long the top gainer" or "Short SOL"`;
    } catch (err) {
      console.error('Failed to fetch balance:', err);
      return `⚠️ Couldn't fetch your balance. Make sure your wallet is connected and you have funds on Hyperliquid.`;
    }
  }

  /**
   * Fetch user's open positions
   */
  private async fetchPortfolio(address: string): Promise<string> {
    try {
      const [portfolio, positions] = await Promise.all([
        hyperliquidClient.getPortfolio(address),
        hyperliquidClient.getPositions(address),
      ]);

      if (positions.length === 0) {
        return `📊 Your Portfolio\n\n` +
          `Account Value: $${portfolio.accountValue.toFixed(2)}\n\n` +
          `No open positions yet. Try "Long the top gainer" to open your first trade!`;
      }

      let response = `📊 Your Portfolio\n\n`;
      response += `Account Value: $${portfolio.accountValue.toFixed(2)}\n`;
      response += `Open Positions: ${positions.length}\n\n`;

      // List first 3 positions
      const topPositions = positions.slice(0, 3);
      for (const pos of topPositions) {
        const direction = pos.size > 0 ? '🟢 LONG' : '🔴 SHORT';
        const pnl = pos.unrealizedPnl >= 0 ? `+$${pos.unrealizedPnl.toFixed(2)}` : `-$${Math.abs(pos.unrealizedPnl).toFixed(2)}`;
        const pnlIcon = pos.unrealizedPnl >= 0 ? '✅' : '❌';
        response += `${direction} ${pos.coin} ${pnlIcon} ${pnl}\n`;
      }

      if (positions.length > 3) {
        response += `\n...and ${positions.length - 3} more positions`;
      }

      return response;
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
      return `⚠️ Couldn't fetch your portfolio. Make sure your wallet is connected.`;
    }
  }

  /**
   * Fetch market analysis - top gainers and losers
   */
  private async fetchMarketAnalysis(): Promise<string> {
    try {
      const activeMarkets = await pearClient.getActiveMarkets();
      const gainers = activeMarkets.topGainers?.slice(0, 3) || [];
      const losers = activeMarkets.topLosers?.slice(0, 3) || [];

      let response = `📈 Market Analysis\n\n`;
      
      response += `🚀 Top Gainers\n`;
      if (gainers.length === 0) {
        response += `No data available\n`;
      } else {
        for (const market of gainers) {
          const asset = market.longAssets?.[0]?.asset || 'UNKNOWN';
          const change = (parseFloat(market.change24h || '0') * 100).toFixed(2);
          response += `  • ${asset} +${change}%\n`;
        }
      }

      response += `\n📉 Top Losers\n`;
      if (losers.length === 0) {
        response += `No data available\n`;
      } else {
        for (const market of losers) {
          const asset = market.longAssets?.[0]?.asset || 'UNKNOWN';
          const change = (parseFloat(market.change24h || '0') * 100).toFixed(2);
          response += `  • ${asset} ${change}%\n`;
        }
      }

      response += `\nTry "Long the top gainer" to trade!`;
      
      return response;
    } catch (err) {
      console.error('Failed to fetch market analysis:', err);
      return `⚠️ Couldn't fetch market data. Try again in a moment.`;
    }
  }

  /**
   * Fetch user's balance as structured data
   */
  private async fetchBalanceData(address: string): Promise<BalanceData> {
    try {
      const portfolio = await hyperliquidClient.getPortfolio(address);
      const available = portfolio.withdrawable || portfolio.accountValue - portfolio.totalMarginUsed;
      
      return {
        type: 'balance',
        accountValue: portfolio.accountValue,
        available: available,
        inPositions: portfolio.totalMarginUsed,
      };
    } catch (err) {
      console.error('Failed to fetch balance:', err);
      return {
        type: 'balance',
        accountValue: 0,
        available: 0,
        inPositions: 0,
      };
    }
  }

  /**
   * Fetch user's portfolio as structured data
   */
  private async fetchPortfolioData(address: string): Promise<PortfolioData> {
    try {
      const [portfolio, positions] = await Promise.all([
        hyperliquidClient.getPortfolio(address),
        hyperliquidClient.getPositions(address),
      ]);

      return {
        type: 'portfolio',
        accountValue: portfolio.accountValue,
        positions: positions.slice(0, 5).map(pos => ({
          coin: pos.coin,
          direction: pos.size > 0 ? 'LONG' as const : 'SHORT' as const,
          pnl: pos.unrealizedPnl,
          size: Math.abs(pos.size),
        })),
      };
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
      return {
        type: 'portfolio',
        accountValue: 0,
        positions: [],
      };
    }
  }

  /**
   * Fetch market analysis as structured data
   */
  private async fetchMarketData(): Promise<MarketData> {
    try {
      const activeMarkets = await pearClient.getActiveMarkets();
      
      const gainers = (activeMarkets.topGainers?.slice(0, 3) || []).map(market => ({
        asset: market.longAssets?.[0]?.asset || 'UNKNOWN',
        change: parseFloat(market.change24h || '0') * 100,
      }));
      
      const losers = (activeMarkets.topLosers?.slice(0, 3) || []).map(market => ({
        asset: market.longAssets?.[0]?.asset || 'UNKNOWN',
        change: parseFloat(market.change24h || '0') * 100,
      }));

      return {
        type: 'market',
        gainers,
        losers,
      };
    } catch (err) {
      console.error('Failed to fetch market data:', err);
      return {
        type: 'market',
        gainers: [],
        losers: [],
      };
    }
  }

  /**
   * Format volume for display
   */
  private formatVolume(volume: number): string {
    if (volume >= 1_000_000_000) {
      return `$${(volume / 1_000_000_000).toFixed(1)}B`;
    } else if (volume >= 1_000_000) {
      return `$${(volume / 1_000_000).toFixed(1)}M`;
    } else if (volume >= 1_000) {
      return `$${(volume / 1_000).toFixed(1)}K`;
    }
    return `$${volume.toFixed(0)}`;
  }
}

// Export singleton
export const tradingAgent = new TradingAgent();

// Re-export types for convenience
export type { ChatContext, ParsedIntent };
