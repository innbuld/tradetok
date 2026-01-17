// Pear Protocol React Hooks

import { useState, useEffect, useCallback, useRef } from 'react';
import { pearClient } from '@/lib/pearClient';
import { pearWebSocket } from '@/lib/pearWebSocket';
import { 
  getEIP712Message, 
  login, 
  logout, 
  isAuthenticated, 
  getUserAddress,
  clearTokens 
} from '@/lib/pearAuth';
import type {
  OpenPosition,
  ActiveMarketsResponse,
  AccountSummary,
  PortfolioMetrics,
  TradeHistoryItem,
  CreatePositionRequest,
  CreatePositionResponse,
  WebSocketChannel,
} from '@/types/pear';

// ============================================
// AUTH HOOK
// ============================================

export interface UsePearAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  address: string | null;
  error: string | null;
  login: (address: string, signTypedData: (params: unknown) => Promise<string>) => Promise<void>;
  logout: () => Promise<void>;
}

export function usePearAuth(): UsePearAuthReturn {
  const [authState, setAuthState] = useState({
    isAuthenticated: isAuthenticated(),
    isLoading: false,
    address: getUserAddress(),
    error: null as string | null,
  });

  const handleLogin = useCallback(async (
    address: string,
    signTypedData: (params: unknown) => Promise<string>
  ) => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Get EIP-712 message
      const eip712Message = await getEIP712Message(address);

      // Sign the message using wallet
      const signature = await signTypedData({
        domain: eip712Message.domain,
        types: eip712Message.types,
        primaryType: eip712Message.primaryType,
        message: eip712Message.message,
      });

      // Login with signature
      await login(address, signature, eip712Message.timestamp);

      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        address,
        error: null,
      });

      // Connect WebSocket
      pearWebSocket.connect(address);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
      throw error;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setAuthState(prev => ({ ...prev, isLoading: true }));

    try {
      await logout();
      pearWebSocket.disconnect();
    } catch (error) {
      console.error('Logout error:', error);
    }

    setAuthState({
      isAuthenticated: false,
      isLoading: false,
      address: null,
      error: null,
    });
  }, []);

  // Check auth status on mount
  useEffect(() => {
    const address = getUserAddress();
    if (address && isAuthenticated()) {
      pearWebSocket.connect(address);
    }
  }, []);

  return {
    ...authState,
    login: handleLogin,
    logout: handleLogout,
  };
}

// ============================================
// POSITIONS HOOK
// ============================================

export interface UsePearPositionsReturn {
  positions: OpenPosition[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePearPositions(): UsePearPositionsReturn {
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!isAuthenticated()) {
      setPositions([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await pearClient.getOpenPositions();
      setPositions(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch positions';
      setError(message);
      console.error('Error fetching positions:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  // WebSocket updates
  useEffect(() => {
    const unsubscribe = pearWebSocket.addHandler('positions', (data) => {
      if (Array.isArray(data)) {
        setPositions(data as OpenPosition[]);
      }
    });

    // Subscribe to positions channel
    pearWebSocket.subscribe(['positions']);

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    positions,
    isLoading,
    error,
    refetch: fetchPositions,
  };
}

// ============================================
// MARKETS HOOK
// ============================================

export interface UsePearMarketsReturn {
  markets: ActiveMarketsResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePearMarkets(): UsePearMarketsReturn {
  const [markets, setMarkets] = useState<ActiveMarketsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await pearClient.getActiveMarkets();
      setMarkets(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch markets';
      setError(message);
      console.error('Error fetching markets:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  // WebSocket updates for market data
  useEffect(() => {
    const unsubscribe = pearWebSocket.addHandler('market-data', (data) => {
      // Handle market data updates
      console.log('Market data update:', data);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    markets,
    isLoading,
    error,
    refetch: fetchMarkets,
  };
}

// ============================================
// ACCOUNT HOOK
// ============================================

export interface UsePearAccountReturn {
  account: AccountSummary | null;
  portfolio: PortfolioMetrics | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePearAccount(): UsePearAccountReturn {
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAccount = useCallback(async () => {
    if (!isAuthenticated()) {
      setAccount(null);
      setPortfolio(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [accountData, portfolioData] = await Promise.all([
        pearClient.getAccountSummary(),
        pearClient.getPortfolioMetrics(),
      ]);
      
      setAccount(accountData);
      setPortfolio(portfolioData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch account';
      setError(message);
      console.error('Error fetching account:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  // WebSocket updates
  useEffect(() => {
    const unsubscribe = pearWebSocket.addHandler('account-summary', (data) => {
      if (data && typeof data === 'object') {
        setAccount(data as AccountSummary);
      }
    });

    pearWebSocket.subscribe(['account-summary']);

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    account,
    portfolio,
    isLoading,
    error,
    refetch: fetchAccount,
  };
}

// ============================================
// TRADE HISTORY HOOK
// ============================================

export interface UsePearTradeHistoryReturn {
  trades: TradeHistoryItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePearTradeHistory(): UsePearTradeHistoryReturn {
  const [trades, setTrades] = useState<TradeHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = useCallback(async () => {
    if (!isAuthenticated()) {
      setTrades([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await pearClient.getTradeHistory();
      setTrades(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch trade history';
      setError(message);
      console.error('Error fetching trade history:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  return {
    trades,
    isLoading,
    error,
    refetch: fetchTrades,
  };
}

// ============================================
// EXECUTE TRADE HOOK
// ============================================

export interface UseExecuteTradeReturn {
  execute: (request: CreatePositionRequest) => Promise<CreatePositionResponse>;
  isExecuting: boolean;
  error: string | null;
  reset: () => void;
}

export function useExecuteTrade(): UseExecuteTradeReturn {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (request: CreatePositionRequest): Promise<CreatePositionResponse> => {
    setIsExecuting(true);
    setError(null);

    try {
      const response = await pearClient.createPosition(request);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Trade execution failed';
      setError(message);
      throw err;
    } finally {
      setIsExecuting(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
  }, []);

  return {
    execute,
    isExecuting,
    error,
    reset,
  };
}

// ============================================
// AGENT WALLET HOOK
// ============================================

export interface UseAgentWalletReturn {
  agentWallet: string | null;
  isLoading: boolean;
  error: string | null;
  checkWallet: () => Promise<string | null>;
  createWallet: () => Promise<string>;
}

export function useAgentWallet(): UseAgentWalletReturn {
  const [agentWallet, setAgentWallet] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkWallet = useCallback(async (): Promise<string | null> => {
    if (!isAuthenticated()) {
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const wallet = await pearClient.getAgentWallet();
      const address = wallet?.agentWalletAddress ?? null;
      setAgentWallet(address);
      return address;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check agent wallet';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createWallet = useCallback(async (): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      const wallet = await pearClient.createAgentWallet();
      setAgentWallet(wallet.agentWalletAddress);
      return wallet.agentWalletAddress;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create agent wallet';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check wallet on mount
  useEffect(() => {
    checkWallet();
  }, [checkWallet]);

  return {
    agentWallet,
    isLoading,
    error,
    checkWallet,
    createWallet,
  };
}

// ============================================
// WEBSOCKET HOOK
// ============================================

export interface UsePearWebSocketReturn {
  isConnected: boolean;
  subscribe: (channels: WebSocketChannel[]) => void;
  unsubscribe: (channels: WebSocketChannel[]) => void;
  addHandler: (channel: WebSocketChannel, handler: (data: unknown) => void) => () => void;
}

export function usePearWebSocket(userAddress?: string): UsePearWebSocketReturn {
  const [isConnected, setIsConnected] = useState(pearWebSocket.isConnected());

  useEffect(() => {
    if (userAddress) {
      pearWebSocket.connect(userAddress);
    }

    // Poll connection state
    const interval = setInterval(() => {
      setIsConnected(pearWebSocket.isConnected());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [userAddress]);

  return {
    isConnected,
    subscribe: pearWebSocket.subscribe.bind(pearWebSocket),
    unsubscribe: pearWebSocket.unsubscribe.bind(pearWebSocket),
    addHandler: pearWebSocket.addHandler.bind(pearWebSocket),
  };
}
