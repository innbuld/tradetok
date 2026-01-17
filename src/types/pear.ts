// Pear Protocol Type Definitions

// ============================================
// EXECUTION TYPES
// ============================================

export type ExecutionType = "MARKET" | "TRIGGER" | "TWAP" | "LADDER";

export type TriggerType =
  | "PRICE"
  | "PRICE_RATIO"
  | "WEIGHTED_RATIO"
  | "BTC_DOM"
  | "CROSS_ASSET_PRICE"
  | "PREDICTION_MARKET_OUTCOME";

export type TriggerDirection = "MORE_THAN" | "LESS_THAN";

export type TPSLType =
  | "PERCENTAGE"
  | "DOLLAR"
  | "POSITION_VALUE"
  | "PRICE"
  | "PRICE_RATIO"
  | "WEIGHTED_RATIO";

// ============================================
// ASSET TYPES
// ============================================

export interface PairAsset {
  asset: string;
  weight?: number; // 0.0001 to 1.0
}

export interface PositionAsset {
  coin: string;
  entryPrice: number;
  actualSize: number;
  leverage: number;
  marginUsed: number;
  positionValue: number;
  unrealizedPnl: number;
  entryPositionValue: number;
  initialWeight: number;
  fundingPaid?: number;
}

// ============================================
// TP/SL TYPES
// ============================================

export interface TPSLThreshold {
  type: TPSLType;
  value: number;
  isTrailing?: boolean;
  trailingDeltaValue?: number;
  trailingActivationValue?: number;
}

// ============================================
// POSITION TYPES
// ============================================

export interface OpenPosition {
  positionId: string;
  address: string;
  pearExecutionFlag: string;
  stopLoss?: TPSLThreshold;
  takeProfit?: TPSLThreshold;
  entryRatio: number;
  markRatio: number;
  entryPositionValue: number;
  positionValue: number;
  marginUsed: number;
  unrealizedPnl: number;
  unrealizedPnlPercentage: number;
  longAssets: PositionAsset[];
  shortAssets: PositionAsset[];
  createdAt: string;
  updatedAt: string;
}

// ============================================
// ORDER TYPES
// ============================================

export interface CreatePositionRequest {
  executionType: ExecutionType;
  leverage: number; // 1-100
  usdValue: number;
  slippage: number; // 0.001-0.1 (default 0.08)
  longAssets: PairAsset[];
  shortAssets: PairAsset[];
  stopLoss?: TPSLThreshold;
  takeProfit?: TPSLThreshold;
  // Trigger order fields
  triggerType?: TriggerType;
  triggerValue?: string;
  direction?: TriggerDirection;
  // TWAP fields
  twapDuration?: number; // minutes
  twapIntervalSeconds?: number; // default 30
  randomizeExecution?: boolean;
  // Ladder fields
  ladderConfig?: {
    ratioStart: number;
    ratioEnd: number;
    numberOfLevels: number;
  };
}

export interface CreatePositionResponse {
  orderId: string;
  fills?: Array<{
    price: number;
    size: number;
    fee: number;
  }>;
}

export interface ClosePositionRequest {
  executionType: "MARKET" | "TWAP";
  twapDuration?: number;
  twapIntervalSeconds?: number;
  randomizeExecution?: boolean;
}

export interface ClosePositionResponse {
  orderId: string;
  executionTime: string;
  chunksScheduled?: number;
}

export interface AdjustPositionRequest {
  adjustmentType: "REDUCE" | "INCREASE";
  adjustmentSize: number; // percentage
  executionType: "MARKET" | "LIMIT";
  limitRatio?: number;
}

export interface AdjustPositionResponse {
  orderId: string;
  status: string;
  adjustmentType: string;
  adjustmentSize: number;
  newSize: number;
  executedAt: string;
}

// ============================================
// MARKET DATA TYPES
// ============================================

export interface Market {
  longAssets: PairAsset[];
  shortAssets: PairAsset[];
  openInterest: string;
  volume: string;
  ratio: string;
  prevRatio: string;
  change24h: string;
  weightedRatio: string;
  weightedPrevRatio: string;
  weightedChange24h: string;
  netFunding: string;
}

export interface ActiveMarketsResponse {
  active: Market[];
  topGainers: Market[];
  topLosers: Market[];
  highlighted: Market[];
  watchlist: Market[];
}

export interface MarketsResponse {
  markets: Market[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MarketsQueryParams {
  offset?: string;
  page?: string;
  pageSize?: string;
  engine?: string;
  minVolume?: string;
  change24h?: string;
  netFunding?: string;
  searchText?: string;
  sort?: string;
  excludeText?: string;
  active?: string;
}

// ============================================
// AUTHENTICATION TYPES
// ============================================

export interface EIP712Message {
  domain: {
    name: string;
    version: string;
    chainId: number;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
  timestamp: number;
}

export interface LoginRequest {
  method: "eip712";
  address: string;
  clientId: string;
  details: {
    signature: string;
    timestamp: number;
  };
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  address: string;
  clientId: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// ============================================
// AGENT WALLET TYPES
// ============================================

export interface AgentWalletResponse {
  agentWalletAddress: string;
  message?: string;
}

// ============================================
// ACCOUNT TYPES
// ============================================

export interface AccountSummary {
  address: string;
  accountValue: number;
  marginUsed: number;
  freeCollateral: number;
  unrealizedPnl: number;
  leverage: number;
}

export interface PortfolioMetrics {
  intervals: {
    oneDay: unknown[];
    oneWeek: unknown[];
    oneMonth: unknown[];
    oneYear: unknown[];
    all: unknown[];
  };
  overall: {
    totalWinningTradesCount: number;
    totalLosingTradesCount: number;
    totalWinningUsd: number;
    totalLosingUsd: number;
    currentOpenInterest: number;
    currentTotalVolume: number;
    unrealizedPnl: number;
    totalTrades: number;
  };
}

// ============================================
// ORDER HISTORY TYPES
// ============================================

export interface OpenOrder {
  orderId: string;
  executionType: ExecutionType;
  status: string;
  longAssets: PairAsset[];
  shortAssets: PairAsset[];
  triggerType?: TriggerType;
  triggerValue?: string;
  direction?: TriggerDirection;
  createdAt: string;
}

export interface TradeHistoryItem {
  tradeHistoryId?: string;
  tradeId?: string;
  positionId: string;
  executionType?: ExecutionType;
  address?: string;
  // Closed assets (actual API response)
  closedLongAssets?: Array<{
    coin: string;
    entryPrice: number;
    entryWeight: number;
    limitPrice?: number;
    leverage: number;
    size: number;
    externalFeePaid?: number;
    builderFeePaid?: number;
    realizedPnl?: number;
  }>;
  closedShortAssets?: Array<{
    coin: string;
    entryPrice: number;
    entryWeight: number;
    limitPrice?: number;
    leverage: number;
    size: number;
    externalFeePaid?: number;
    builderFeePaid?: number;
    realizedPnl?: number;
  }>;
  // Legacy fields (for backwards compatibility)
  longAssets?: PositionAsset[];
  shortAssets?: PositionAsset[];
  positionLongAssets?: string[];
  positionShortAssets?: string[];
  entryRatio?: number;
  exitRatio?: number;
  realizedPnl?: number;
  realizedPnlPercentage?: number;
  totalValue?: number;
  totalEntryValue?: number;
  externalFeePaid?: number;
  builderFeePaid?: number;
  status?: "OPEN" | "CLOSED" | "LIQUIDATED";
  openedAt?: string;
  closedAt?: string;
  createdAt?: string;
}

// ============================================
// NOTIFICATION TYPES
// ============================================

export interface Notification {
  id: string;
  type:
    | "ORDER_EXECUTED"
    | "TP_TRIGGERED"
    | "SL_TRIGGERED"
    | "LIQUIDATION_WARNING"
    | "NEW_FOLLOWER"
    | "TRADE_COPIED";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

// ============================================
// WEBSOCKET TYPES
// ============================================

export type WebSocketChannel =
  | "open-orders"
  | "trade-histories"
  | "positions"
  | "twap-details"
  | "notifications"
  | "account-summary"
  | "market-data";

export interface WebSocketSubscribeMessage {
  action: "subscribe" | "unsubscribe";
  address: string;
  channels: WebSocketChannel[];
}

export interface WebSocketMessage {
  channel: WebSocketChannel;
  data: unknown;
  timestamp: number;
}

// ============================================
// ERROR TYPES
// ============================================

export interface PearApiError {
  statusCode: number;
  message: string;
  error?: string;
}
