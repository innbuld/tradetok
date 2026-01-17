// Trade Execution Service
// Handles all trade execution logic for TradeTok

import { pearClient } from '@/lib/pearClient';
import { PEAR_CONFIG } from '@/lib/pearConfig';
import type { 
  CreatePositionRequest, 
  CreatePositionResponse,
  TPSLThreshold,
  ExecutionType 
} from '@/types/pear';
import type { Trade } from '@/data/mockData';

// ============================================
// TYPES
// ============================================

export interface CopyTradeParams {
  trade: Trade;
  amount: number;
  leverage: number;
  stopLoss?: number; // percentage
  takeProfit?: number; // percentage
  slippage?: number;
  executionType?: ExecutionType;
}

export interface TradeResult {
  success: boolean;
  orderId?: string;
  error?: string;
  executionTime?: string;
}

// ============================================
// PAIR PARSING
// ============================================

/**
 * Parse a trading pair string into long and short assets
 * Examples:
 * - "SOL/USDT" LONG -> long: SOL, short: USDT
 * - "SOL/USDT" SHORT -> long: USDT, short: SOL
 * - "SOL/ETH" LONG -> long: SOL, short: ETH (pair trade)
 */
export function parseTradePair(pair: string, direction: 'LONG' | 'SHORT'): {
  longAsset: string;
  shortAsset: string;
  isPairTrade: boolean;
} {
  const [asset1, asset2] = pair.split('/').map(s => s.trim().toUpperCase());
  
  const stablecoins = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD'];
  const isAsset2Stable = stablecoins.includes(asset2);
  
  if (direction === 'LONG') {
    return {
      longAsset: asset1,
      shortAsset: asset2,
      isPairTrade: !isAsset2Stable,
    };
  } else {
    return {
      longAsset: asset2,
      shortAsset: asset1,
      isPairTrade: !isAsset2Stable,
    };
  }
}

// ============================================
// COPY TRADE EXECUTION
// ============================================

/**
 * Execute a copy trade from the feed
 */
export async function executeCopyTrade(params: CopyTradeParams): Promise<TradeResult> {
  try {
    const { trade, amount, leverage, stopLoss, takeProfit, slippage, executionType = 'MARKET' } = params;
    
    // Validate minimum trade size
    if (amount < PEAR_CONFIG.MIN_TRADE_SIZE * 2) {
      return {
        success: false,
        error: `Minimum trade size is $${PEAR_CONFIG.MIN_TRADE_SIZE * 2}`,
      };
    }

    // Validate leverage
    if (leverage < PEAR_CONFIG.MIN_LEVERAGE || leverage > PEAR_CONFIG.MAX_LEVERAGE) {
      return {
        success: false,
        error: `Leverage must be between ${PEAR_CONFIG.MIN_LEVERAGE}x and ${PEAR_CONFIG.MAX_LEVERAGE}x`,
      };
    }

    // Parse the trading pair
    const { longAsset, shortAsset } = parseTradePair(trade.pair, trade.direction);

    // Build stop loss config
    const stopLossConfig: TPSLThreshold | undefined = stopLoss 
      ? { type: 'PERCENTAGE', value: stopLoss }
      : undefined;

    // Build take profit config
    const takeProfitConfig: TPSLThreshold | undefined = takeProfit
      ? { type: 'PERCENTAGE', value: takeProfit }
      : undefined;

    // Build position request
    const request: CreatePositionRequest = {
      executionType,
      leverage,
      usdValue: amount,
      slippage: slippage ?? PEAR_CONFIG.DEFAULT_SLIPPAGE,
      longAssets: [{ asset: longAsset, weight: 1 }],
      shortAssets: [{ asset: shortAsset, weight: 1 }],
      stopLoss: stopLossConfig,
      takeProfit: takeProfitConfig,
    };

    // Execute the trade
    const response = await pearClient.createPosition(request);

    return {
      success: true,
      orderId: response.orderId,
      executionTime: new Date().toISOString(),
    };

  } catch (error) {
    console.error('Copy trade execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Trade execution failed',
    };
  }
}

// ============================================
// BASKET TRADE EXECUTION
// ============================================

export interface BasketTradeParams {
  longAssets: Array<{ asset: string; weight?: number }>;
  shortAssets: Array<{ asset: string; weight?: number }>;
  amount: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  slippage?: number;
}

/**
 * Execute a basket trade (multiple longs and shorts)
 */
export async function executeBasketTrade(params: BasketTradeParams): Promise<TradeResult> {
  try {
    const { longAssets, shortAssets, amount, leverage, stopLoss, takeProfit, slippage } = params;

    // Normalize weights
    const normalizeWeights = (assets: Array<{ asset: string; weight?: number }>) => {
      const totalWeight = assets.reduce((sum, a) => sum + (a.weight ?? 1), 0);
      return assets.map(a => ({
        asset: a.asset.toUpperCase(),
        weight: (a.weight ?? 1) / totalWeight,
      }));
    };

    const request: CreatePositionRequest = {
      executionType: 'MARKET',
      leverage,
      usdValue: amount,
      slippage: slippage ?? PEAR_CONFIG.DEFAULT_SLIPPAGE,
      longAssets: normalizeWeights(longAssets),
      shortAssets: normalizeWeights(shortAssets),
      stopLoss: stopLoss ? { type: 'PERCENTAGE', value: stopLoss } : undefined,
      takeProfit: takeProfit ? { type: 'PERCENTAGE', value: takeProfit } : undefined,
    };

    const response = await pearClient.createPosition(request);

    return {
      success: true,
      orderId: response.orderId,
      executionTime: new Date().toISOString(),
    };

  } catch (error) {
    console.error('Basket trade execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Basket trade failed',
    };
  }
}

// ============================================
// TWAP EXECUTION
// ============================================

export interface TWAPTradeParams extends CopyTradeParams {
  durationMinutes: number;
  intervalSeconds?: number;
  randomize?: boolean;
}

/**
 * Execute a TWAP (Time-Weighted Average Price) order
 */
export async function executeTWAPTrade(params: TWAPTradeParams): Promise<TradeResult> {
  try {
    const { 
      trade, 
      amount, 
      leverage, 
      stopLoss, 
      takeProfit, 
      durationMinutes,
      intervalSeconds = 30,
      randomize = false 
    } = params;

    const { longAsset, shortAsset } = parseTradePair(trade.pair, trade.direction);

    const request: CreatePositionRequest = {
      executionType: 'TWAP',
      leverage,
      usdValue: amount,
      slippage: PEAR_CONFIG.DEFAULT_SLIPPAGE,
      longAssets: [{ asset: longAsset, weight: 1 }],
      shortAssets: [{ asset: shortAsset, weight: 1 }],
      stopLoss: stopLoss ? { type: 'PERCENTAGE', value: stopLoss } : undefined,
      takeProfit: takeProfit ? { type: 'PERCENTAGE', value: takeProfit } : undefined,
      twapDuration: durationMinutes,
      twapIntervalSeconds: intervalSeconds,
      randomizeExecution: randomize,
    };

    const response = await pearClient.createPosition(request);

    return {
      success: true,
      orderId: response.orderId,
      executionTime: new Date().toISOString(),
    };

  } catch (error) {
    console.error('TWAP trade execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'TWAP order failed',
    };
  }
}

// ============================================
// LIMIT ORDER EXECUTION
// ============================================

export interface LimitOrderParams extends CopyTradeParams {
  triggerRatio: number;
  direction: 'MORE_THAN' | 'LESS_THAN';
}

/**
 * Execute a limit order (trigger order)
 */
export async function executeLimitOrder(params: LimitOrderParams): Promise<TradeResult> {
  try {
    const { 
      trade, 
      amount, 
      leverage, 
      stopLoss, 
      takeProfit,
      triggerRatio,
      direction 
    } = params;

    const { longAsset, shortAsset } = parseTradePair(trade.pair, trade.direction);

    const request: CreatePositionRequest = {
      executionType: 'TRIGGER',
      leverage,
      usdValue: amount,
      slippage: PEAR_CONFIG.DEFAULT_SLIPPAGE,
      longAssets: [{ asset: longAsset, weight: 1 }],
      shortAssets: [{ asset: shortAsset, weight: 1 }],
      stopLoss: stopLoss ? { type: 'PERCENTAGE', value: stopLoss } : undefined,
      takeProfit: takeProfit ? { type: 'PERCENTAGE', value: takeProfit } : undefined,
      triggerType: 'PRICE_RATIO',
      triggerValue: triggerRatio.toString(),
      direction,
    };

    const response = await pearClient.createPosition(request);

    return {
      success: true,
      orderId: response.orderId,
      executionTime: new Date().toISOString(),
    };

  } catch (error) {
    console.error('Limit order execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Limit order failed',
    };
  }
}

// ============================================
// POSITION MANAGEMENT
// ============================================

/**
 * Close a position
 */
export async function closePosition(
  positionId: string, 
  useTWAP: boolean = false,
  twapDuration: number = 30
): Promise<TradeResult> {
  try {
    if (useTWAP) {
      await pearClient.closePosition(positionId, {
        executionType: 'TWAP',
        twapDuration,
        twapIntervalSeconds: 30,
        randomizeExecution: true,
      });
    } else {
      await pearClient.closePosition(positionId, {
        executionType: 'MARKET',
      });
    }

    return {
      success: true,
      executionTime: new Date().toISOString(),
    };

  } catch (error) {
    console.error('Close position error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close position',
    };
  }
}

/**
 * Close all positions
 */
export async function closeAllPositions(): Promise<TradeResult> {
  try {
    const results = await pearClient.closeAllPositions('MARKET');
    
    const failedCount = results.filter(r => !r.success).length;
    
    if (failedCount > 0) {
      return {
        success: false,
        error: `${failedCount} of ${results.length} positions failed to close`,
      };
    }

    return {
      success: true,
      executionTime: new Date().toISOString(),
    };

  } catch (error) {
    console.error('Close all positions error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close positions',
    };
  }
}

/**
 * Update stop loss and take profit
 */
export async function updateRiskParams(
  positionId: string,
  stopLoss?: number | null,
  takeProfit?: number | null
): Promise<TradeResult> {
  try {
    await pearClient.updateRiskParameters(
      positionId,
      stopLoss !== undefined 
        ? (stopLoss === null ? null : { type: 'PERCENTAGE', value: stopLoss })
        : undefined,
      takeProfit !== undefined 
        ? (takeProfit === null ? null : { type: 'PERCENTAGE', value: takeProfit })
        : undefined
    );

    return {
      success: true,
      executionTime: new Date().toISOString(),
    };

  } catch (error) {
    console.error('Update risk params error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update risk parameters',
    };
  }
}
