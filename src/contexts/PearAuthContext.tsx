// Pear Protocol Auth Context

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import {
  getEIP712Message,
  login as authLogin,
  logout as authLogout,
  isAuthenticated as checkAuth,
  getUserAddress,
} from "@/lib/pearAuth";
import { pearWebSocket } from "@/lib/pearWebSocket";
import { pearClient } from "@/lib/pearClient";
import type { AccountSummary, AgentWalletResponse } from "@/types/pear";

interface PearAuthContextType {
  // Auth state
  isAuthenticated: boolean;
  isLoading: boolean;
  address: string | null;
  error: string | null;

  // Account state
  account: AccountSummary | null;
  agentWallet: string | null;

  // Actions
  login: (
    address: string,
    signTypedData: (params: unknown) => Promise<string>,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  setupAgentWallet: () => Promise<string>;
}

const PearAuthContext = createContext<PearAuthContextType | null>(null);

export function PearAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(checkAuth());
  const [isLoading, setIsLoading] = useState(false);
  const [address, setAddress] = useState<string | null>(getUserAddress());
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [agentWallet, setAgentWallet] = useState<string | null>(null);

  // Fetch account data
  const refreshAccount = useCallback(async () => {
    if (!checkAuth()) return;

    try {
      const [accountData, walletData] = await Promise.all([
        pearClient.getAccountSummary().catch(() => null),
        pearClient.getAgentWallet().catch(() => null),
      ]);

      setAccount(accountData);
      setAgentWallet(walletData?.agentWalletAddress ?? null);
    } catch (err) {
      console.error("Failed to refresh account:", err);
    }
  }, []);

  // Login handler
  const login = useCallback(
    async (
      walletAddress: string,
      signTypedData: (params: unknown) => Promise<string>,
    ) => {
      setIsLoading(true);
      setError(null);

      try {
        // Get EIP-712 message
        const eip712Message = await getEIP712Message(walletAddress);

        // Sign the message with the exact domain from Pear (includes chainId: 1)
        const signature = await signTypedData({
          domain: eip712Message.domain,
          types: eip712Message.types,
          primaryType: eip712Message.primaryType,
          message: eip712Message.message,
        });

        // Login with signature
        await authLogin(walletAddress, signature, eip712Message.timestamp);

        setIsAuthenticated(true);
        setAddress(walletAddress);

        // Connect WebSocket
        pearWebSocket.connect(walletAddress);

        // Fetch account data
        await refreshAccount();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Authentication failed";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [refreshAccount],
  );

  // Logout handler
  const logout = useCallback(async () => {
    setIsLoading(true);

    try {
      await authLogout();
      pearWebSocket.disconnect();
    } catch (err) {
      console.error("Logout error:", err);
    }

    setIsAuthenticated(false);
    setAddress(null);
    setAccount(null);
    setAgentWallet(null);
    setError(null);
    setIsLoading(false);
  }, []);

  // Setup agent wallet
  const setupAgentWallet = useCallback(async (): Promise<string> => {
    try {
      // Check if wallet exists
      const existing = await pearClient.getAgentWallet();
      if (existing?.agentWalletAddress) {
        setAgentWallet(existing.agentWalletAddress);
        return existing.agentWalletAddress;
      }

      // Create new wallet
      const newWallet = await pearClient.createAgentWallet();
      setAgentWallet(newWallet.agentWalletAddress);
      return newWallet.agentWalletAddress;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to setup agent wallet";
      setError(message);
      throw err;
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    const storedAddress = getUserAddress();
    if (storedAddress && checkAuth()) {
      setAddress(storedAddress);
      setIsAuthenticated(true);
      pearWebSocket.connect(storedAddress);
      refreshAccount();
    }
  }, [refreshAccount]);

  // Subscribe to WebSocket account updates
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = pearWebSocket.addHandler("account-summary", (data) => {
      if (data && typeof data === "object") {
        setAccount(data as AccountSummary);
      }
    });

    pearWebSocket.subscribe(["account-summary"]);

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated]);

  return (
    <PearAuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        address,
        error,
        account,
        agentWallet,
        login,
        logout,
        refreshAccount,
        setupAgentWallet,
      }}
    >
      {children}
    </PearAuthContext.Provider>
  );
}

export function usePearAuthContext(): PearAuthContextType {
  const context = useContext(PearAuthContext);
  if (!context) {
    throw new Error(
      "usePearAuthContext must be used within a PearAuthProvider",
    );
  }
  return context;
}
