import { useState, useCallback } from "react";
import { usePearAuthContext } from "@/contexts/PearAuthContext";
import { pearClient } from "@/lib/pearClient";

export type AgentWalletStatus = "IDLE" | "CREATING" | "WAITING_APPROVAL" | "ACTIVE" | "ERROR";

export function useAgentWallet() {
  const { agentWallet, setupAgentWallet: contextSetup, refreshAccount } = usePearAuthContext();
  const [status, setStatus] = useState<AgentWalletStatus>("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [createdAddress, setCreatedAddress] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      await refreshAccount();
      if (agentWallet) {
        setStatus("ACTIVE");
      }
    } catch (err) {
      console.error("Failed to check agent wallet status:", err);
    }
  }, [agentWallet, refreshAccount]);

  const setupWallet = useCallback(async () => {
    setStatus("CREATING");
    setError(null);
    try {
      // 1. Create Agent Wallet on Pear
      const address = await contextSetup();
      setCreatedAddress(address);
      
      // 2. Guide user to approve
      setStatus("WAITING_APPROVAL");
      
      return address;
    } catch (err) {
      console.error("Agent wallet setup error:", err);
      // Check if it was actually just "active" already
      if (err instanceof Error && err.message.includes("active")) {
        setStatus("ACTIVE");
      } else {
        setStatus("ERROR");
        setError(err instanceof Error ? err.message : "Failed to create agent wallet");
      }
      throw err;
    }
  }, [contextSetup]);

  const verifyApproval = useCallback(async () => {
    // Poll or check if it's active now
    // Actually, in Hyperliquid standard flow, once approved on HL, 
    // Pear needs to see that approval.
    // We can try calling getAgentWallet or refreshing account.
    try {
      const wallet = await pearClient.getAgentWallet();
      if (wallet && wallet.agentWalletAddress) {
        setStatus("ACTIVE");
        refreshAccount();
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  }, [refreshAccount]);

  return {
    agentWallet,
    createdAddress,
    status,
    error,
    setupWallet,
    checkStatus,
    verifyApproval
  };
}
