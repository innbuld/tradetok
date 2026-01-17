// Pear Protocol API Client

import { PEAR_CONFIG, STORAGE_KEYS } from './pearConfig';
import { getValidAccessToken, refreshAccessToken, clearTokens } from './pearAuth';
import type {
  OpenPosition,
  CreatePositionRequest,
  CreatePositionResponse,
  ClosePositionRequest,
  ClosePositionResponse,
  AdjustPositionRequest,
  AdjustPositionResponse,
  TPSLThreshold,
  ActiveMarketsResponse,
  MarketsResponse,
  MarketsQueryParams,
  AgentWalletResponse,
  AccountSummary,
  PortfolioMetrics,
  OpenOrder,
  TradeHistoryItem,
  Notification,
} from '@/types/pear';

// ============================================
// API CLIENT CLASS
// ============================================

class PearClient {
  private baseURL = PEAR_CONFIG.API_BASE_URL;

  /**
   * Make authenticated API request with auto-refresh
   */
  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    let accessToken = await getValidAccessToken();

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Auto-refresh on 401
    if (response.status === 401) {
      try {
        accessToken = await refreshAccessToken();
        
        const retryResponse = await fetch(`${this.baseURL}${endpoint}`, {
          ...options,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        if (!retryResponse.ok) {
          const error = await retryResponse.json().catch(() => ({ message: 'Request failed' }));
          throw new Error(error.message || `Request failed with status ${retryResponse.status}`);
        }

        return retryResponse.json();
      } catch (error) {
        clearTokens();
        throw new Error('Session expired. Please login again.');
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `Request failed with status ${response.status}`);
    }

    // Handle empty responses
    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  /**
   * Make unauthenticated API request
   */
  private async publicRequest<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `Request failed with status ${response.status}`);
    }

    return response.json();
  }

  // ============================================
  // AGENT WALLET
  // ============================================

  /**
   * Get agent wallet status
   */
  async getAgentWallet(): Promise<AgentWalletResponse | null> {
    try {
      return await this.request<AgentWalletResponse>('/agentWallet');
    } catch (error) {
      // 404 means no agent wallet exists
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create new agent wallet
   */
  async createAgentWallet(): Promise<AgentWalletResponse> {
    return this.request<AgentWalletResponse>('/agentWallet', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // ============================================
  // POSITIONS
  // ============================================

  /**
   * Get all open positions
   */
  async getOpenPositions(): Promise<OpenPosition[]> {
    return this.request<OpenPosition[]>('/positions');
  }

  /**
   * Create new position (market, trigger, TWAP, or ladder order)
   */
  async createPosition(data: CreatePositionRequest): Promise<CreatePositionResponse> {
    const body = JSON.stringify(data);
    console.log("Pear API Request Body:", body);
    const response = await this.request<CreatePositionResponse>('/positions', {
      method: 'POST',
      body: body,
    });
    console.log("Pear API Response:", response);
    return response;
  }

  /**
   * Close position
   */
  async closePosition(
    positionId: string, 
    data: ClosePositionRequest
  ): Promise<ClosePositionResponse> {
    return this.request<ClosePositionResponse>(`/positions/${positionId}/close`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Close all positions
   */
  async closeAllPositions(
    executionType: 'MARKET' | 'TWAP' = 'MARKET'
  ): Promise<Array<{ positionId: string; success: boolean; orderId?: string; error?: string }>> {
    return this.request(`/positions/close-all`, {
      method: 'POST',
      body: JSON.stringify({ executionType }),
    });
  }

  /**
   * Adjust position size
   */
  async adjustPosition(
    positionId: string, 
    data: AdjustPositionRequest
  ): Promise<AdjustPositionResponse> {
    return this.request<AdjustPositionResponse>(`/positions/${positionId}/adjust`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update take profit / stop loss
   */
  async updateRiskParameters(
    positionId: string,
    stopLoss?: TPSLThreshold | null,
    takeProfit?: TPSLThreshold | null
  ): Promise<OpenPosition> {
    return this.request<OpenPosition>(`/positions/${positionId}/riskParameters`, {
      method: 'PUT',
      body: JSON.stringify({ stopLoss, takeProfit }),
    });
  }

  /**
   * Adjust leverage
   */
  async adjustLeverage(positionId: string, leverage: number): Promise<OpenPosition> {
    return this.request<OpenPosition>(`/positions/${positionId}/adjust-leverage`, {
      method: 'POST',
      body: JSON.stringify({ leverage }),
    });
  }

  // ============================================
  // ORDERS
  // ============================================

  /**
   * Get all open orders
   */
  async getOpenOrders(): Promise<OpenOrder[]> {
    return this.request<OpenOrder[]>('/orders/open');
  }

  /**
   * Get TWAP orders with monitoring
   */
  async getTWAPOrders(): Promise<unknown[]> {
    return this.request<unknown[]>('/orders/twap');
  }

  /**
   * Cancel pending order
   */
  async cancelOrder(orderId: string): Promise<void> {
    await this.request<void>(`/orders/${orderId}/cancel`, {
      method: 'DELETE',
    });
  }

  /**
   * Cancel TWAP order
   */
  async cancelTWAPOrder(orderId: string): Promise<void> {
    await this.request<void>(`/orders/${orderId}/twap/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // ============================================
  // MARKETS
  // ============================================

  /**
   * Get active markets (trending pairs)
   */
  async getActiveMarkets(): Promise<ActiveMarketsResponse> {
    return this.publicRequest<ActiveMarketsResponse>('/markets/active');
  }

  /**
   * Get markets with filters
   */
  async getMarkets(params?: MarketsQueryParams): Promise<MarketsResponse> {
    const url = new URL(`${this.baseURL}/markets`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, value);
        }
      });
    }

    const response = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch markets');
    }

    return response.json();
  }

  // ============================================
  // ACCOUNT
  // ============================================

  /**
   * Get account summary
   */
  async getAccountSummary(): Promise<AccountSummary> {
    return this.request<AccountSummary>('/accounts');
  }

  /**
   * Get portfolio metrics
   */
  async getPortfolioMetrics(): Promise<PortfolioMetrics> {
    return this.request<PortfolioMetrics>('/portfolio');
  }

  // ============================================
  // TRADE HISTORY
  // ============================================

  /**
   * Get trade history
   */
  async getTradeHistory(): Promise<TradeHistoryItem[]> {
    return this.request<TradeHistoryItem[]>('/trade-history');
  }

  // ============================================
  // NOTIFICATIONS
  // ============================================

  /**
   * Get notifications
   */
  async getNotifications(): Promise<Notification[]> {
    return this.request<Notification[]>('/notifications');
  }

  /**
   * Mark notifications as read
   */
  async markNotificationsRead(notificationIds: string[]): Promise<void> {
    await this.request<void>('/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ notificationIds }),
    });
  }

  // ============================================
  // WATCHLIST
  // ============================================

  /**
   * Toggle basket in watchlist
   */
  async toggleWatchlist(
    longAssets: Array<{ asset: string; weight: number }>,
    shortAssets: Array<{ asset: string; weight: number }>
  ): Promise<void> {
    await this.request<void>('/watchlist', {
      method: 'POST',
      body: JSON.stringify({ longAssets, shortAssets }),
    });
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Create a simple pair trade (one long, one short)
   */
  async createPairTrade(params: {
    longAsset: string;
    shortAsset: string;
    usdValue: number;
    leverage: number;
    stopLoss?: { type: 'PERCENTAGE'; value: number };
    takeProfit?: { type: 'PERCENTAGE'; value: number };
    slippage?: number;
  }): Promise<CreatePositionResponse> {
    const request: CreatePositionRequest = {
      executionType: 'MARKET',
      leverage: params.leverage,
      usdValue: params.usdValue,
      slippage: params.slippage ?? PEAR_CONFIG.DEFAULT_SLIPPAGE,
      longAssets: [{ asset: params.longAsset, weight: 1 }],
      shortAssets: [{ asset: params.shortAsset, weight: 1 }],
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
    };

    return this.createPosition(request);
  }

  /**
   * Create a single direction trade (long OR short vs USDT)
   */
  async createDirectionalTrade(params: {
    asset: string;
    direction: 'LONG' | 'SHORT';
    usdValue: number;
    leverage: number;
    stopLoss?: { type: 'PERCENTAGE'; value: number };
    takeProfit?: { type: 'PERCENTAGE'; value: number };
    slippage?: number;
  }): Promise<CreatePositionResponse> {
    const request: CreatePositionRequest = {
      executionType: 'MARKET',
      leverage: params.leverage,
      usdValue: params.usdValue,
      slippage: params.slippage ?? PEAR_CONFIG.DEFAULT_SLIPPAGE,
      longAssets: params.direction === 'LONG' 
        ? [{ asset: params.asset, weight: 1 }]
        : [{ asset: 'USDT', weight: 1 }],
      shortAssets: params.direction === 'SHORT'
        ? [{ asset: params.asset, weight: 1 }]
        : [{ asset: 'USDT', weight: 1 }],
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
    };

    return this.createPosition(request);
  }
}

// Export singleton instance
export const pearClient = new PearClient();
