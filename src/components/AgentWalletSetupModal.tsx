// Agent Wallet Setup Modal
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Wallet,
  Coins,
  RefreshCw,
} from "lucide-react";
import { usePearAuthContext } from "@/contexts/PearAuthContext";
import { useSignTypedData, useAccount, useBalance } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { DepositModal } from "./DepositModal";

interface AgentWalletSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Hyperliquid API Constants
const HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/exchange";
const HYPERLIQUID_CHAIN_ID = 42161; // Arbitrum One
const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

export function AgentWalletSetupModal({
  isOpen,
  onClose,
}: AgentWalletSetupModalProps) {
  const { agentWallet, setupAgentWallet, refreshAccount } =
    usePearAuthContext();
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { open } = useWeb3Modal();

  const [step, setStep] = useState<
    | "CREATE"
    | "APPROVE"
    | "SUCCESS"
    | "DEPOSIT_NEEDED"
    | "INSUFFICIENT_FUNDS"
    | "CHECKING"
  >("CHECKING");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAddress, setCreatedAddress] = useState<string | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [hlBalance, setHlBalance] = useState<number | null>(null);

  // CHECK USDC BALANCE LOGIC (for Arbitrum wallet)
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address,
    token: USDC_ADDRESS,
    chainId: HYPERLIQUID_CHAIN_ID,
  });

  // Determine initial step based on state
  useEffect(() => {
    const determineStep = async () => {
      if (!isOpen || !address || !isConnected) return;

      // If agent wallet already exists, we can skip CREATE
      if (agentWallet) {
        setCreatedAddress(agentWallet);

        // Check if user has Hyperliquid balance
        try {
          const { hyperliquidClient } = await import("@/lib/hyperliquidClient");
          const portfolio = await hyperliquidClient.getPortfolio(address);
          const balance = portfolio.accountValue || 0;
          setHlBalance(balance);
          console.log(
            "[AgentSetup] HL balance:",
            balance,
            "Agent wallet:",
            agentWallet,
          );

          if (balance > 0) {
            // Has deposit, go to approve
            setStep("APPROVE");
          } else {
            // No deposit yet, need to deposit first
            setStep("DEPOSIT_NEEDED");
          }
        } catch (err) {
          console.error("[AgentSetup] Error checking HL balance:", err);
          setStep("DEPOSIT_NEEDED");
        }
      } else {
        // No agent wallet yet, need to create one first
        setStep("CREATE");
      }
    };

    if (isOpen && step === "CHECKING") {
      determineStep();
    }
  }, [isOpen, address, isConnected, agentWallet, step]);

  // Reset to CHECKING when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep("CHECKING");
      setError(null);
      setCreatedAddress(null);
    }
  }, [isOpen]);

  // After CREATE, check if deposit is needed
  const handleCreateWallet = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const walletAddress = await setupAgentWallet();
      setCreatedAddress(walletAddress);

      // Now check if user has Hyperliquid balance
      try {
        const { hyperliquidClient } = await import("@/lib/hyperliquidClient");
        const portfolio = await hyperliquidClient.getPortfolio(address!);
        const balance = portfolio.accountValue || 0;
        setHlBalance(balance);

        if (balance > 0) {
          // Already has deposit, go to approve
          setStep("APPROVE");
        } else {
          // Need to deposit first
          setStep("DEPOSIT_NEEDED");
        }
      } catch {
        // Assume no deposit
        setStep("DEPOSIT_NEEDED");
      }
    } catch (err) {
      console.error("Failed to create agent wallet:", err);
      // If fails, check if we already have one
      if (agentWallet) {
        setCreatedAddress(agentWallet);
        setStep("DEPOSIT_NEEDED");
        return;
      }
      setError("Failed to create agent wallet. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveWallet = async () => {
    if (!createdAddress) {
      setError("No agent wallet address found.");
      return;
    }

    // Proactive Wallet Connection
    if (!address || !isConnected) {
      setError("Wallet not connected. Opening connection modal...");
      await open();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const now = Date.now();
      const nonce = now;

      const domain = {
        name: "HyperliquidSignTransaction",
        version: "1",
        chainId: HYPERLIQUID_CHAIN_ID,
        verifyingContract:
          "0x0000000000000000000000000000000000000000" as `0x${string}`,
      };

      const types = {
        "HyperliquidTransaction:ApproveAgent": [
          { name: "hyperliquidChain", type: "string" },
          { name: "agentAddress", type: "address" },
          { name: "agentName", type: "string" },
          { name: "nonce", type: "uint64" },
        ],
      };

      const message = {
        hyperliquidChain: "Mainnet",
        agentAddress: createdAddress as `0x${string}`,
        agentName: "TradeTok",
        nonce: BigInt(nonce),
      };

      const signature = await signTypedDataAsync({
        account: address,
        domain,
        types,
        primaryType: "HyperliquidTransaction:ApproveAgent",
        message,
      });

      // Submit to Hyperliquid
      const payload = {
        action: {
          type: "approveAgent",
          hyperliquidChain: "Mainnet",
          signatureChainId: "0xa4b1",
          agentAddress: createdAddress,
          agentName: "TradeTok",
          nonce: nonce,
        },
        nonce: nonce,
        signature: {
          r: signature.slice(0, 66),
          s: "0x" + signature.slice(66, 130),
          v:
            parseInt(signature.slice(130, 132), 16) >= 27
              ? parseInt(signature.slice(130, 132), 16)
              : parseInt(signature.slice(130, 132), 16) + 27,
        },
      };

      const response = await fetch(HYPERLIQUID_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(await response.text());

      const result = await response.json();
      if (result.status === "err") {
        if (result.response?.includes("Must deposit")) {
          setStep("DEPOSIT_NEEDED");
          // Don't throw, just transition state
          return;
        }
        throw new Error(result.response || "Hyperliquid approval failed");
      }

      setStep("SUCCESS");
      // Mark locally as approved to prevent re-opening on refresh
      if (address) {
        localStorage.setItem(`pear_agent_approved_${address}`, "true");
      }
      refreshAccount();
    } catch (err) {
      console.error("Approval failed:", err);
      setError(
        err instanceof Error ? err.message : "Failed to approve agent wallet",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Setup Trading Wallet</DialogTitle>
            <DialogDescription>
              To trade on TradeTok, you need to create and approve an Agent
              Wallet.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
            {step === "CHECKING" && (
              <>
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <h3 className="font-semibold text-lg">Checking Account...</h3>
                <p className="text-sm text-muted-foreground">
                  Verifying your Hyperliquid account status.
                </p>
              </>
            )}

            {step === "CREATE" && (
              <>
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <ShieldCheck className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">Create Agent Wallet</h3>
                <p className="text-sm text-muted-foreground">
                  Secured by Pear Protocol.
                </p>
              </>
            )}

            {step === "APPROVE" && (
              <>
                <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-2 animate-pulse">
                  <AlertCircle className="w-8 h-8 text-yellow-500" />
                </div>
                <h3 className="font-semibold text-lg">
                  Approve on Hyperliquid
                </h3>
                <p className="text-sm text-muted-foreground">
                  Sign with your wallet to authorize trading.
                </p>
                <div className="p-3 bg-secondary rounded-lg text-xs font-mono break-all opacity-70">
                  {createdAddress}
                </div>
              </>
            )}

            {step === "DEPOSIT_NEEDED" && (
              <>
                <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-2">
                  <Coins className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="font-semibold text-lg">
                  Account Activation Required
                </h3>
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mx-2">
                  Hyperliquid requires a first-time deposit to activate your
                  account.
                </div>
                <p className="text-sm text-muted-foreground">
                  Please deposit at least 5 USDC to continue.
                </p>
              </>
            )}

            {step === "SUCCESS" && (
              <>
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="font-semibold text-lg">
                  Wallet Setup Complete!
                </h3>
                <p className="text-sm text-muted-foreground">
                  You are now ready to execute trades.
                </p>
              </>
            )}

            {error && step !== "DEPOSIT_NEEDED" && (
              <p className="text-sm text-destructive mt-2 bg-destructive/10 p-2 rounded max-w-full text-left">
                Error: {error}
              </p>
            )}

            {step === "INSUFFICIENT_FUNDS" && (
              <>
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
                  <AlertCircle className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="font-semibold text-lg">Insufficient USDC</h3>
                <p className="text-sm text-muted-foreground">
                  You need at least 6 USDC on Arbitrum to activate your trading
                  account.
                </p>
                <div className="bg-secondary/50 p-3 rounded-lg text-sm w-full">
                  Your Balance:{" "}
                  <span className="font-mono font-bold">
                    {balanceData?.formatted
                      ? parseFloat(balanceData.formatted).toFixed(2)
                      : "0.00"}{" "}
                    USDC
                  </span>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="sm:justify-center flex-col sm:flex-col gap-2">
            {step === "CREATE" && (
              <Button
                onClick={handleCreateWallet}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Wallet
              </Button>
            )}

            {step === "APPROVE" && (
              <Button
                onClick={handleApproveWallet}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Sign Approval
              </Button>
            )}

            {step === "DEPOSIT_NEEDED" && (
              <>
                <Button
                  onClick={() => setShowDepositModal(true)}
                  variant="default"
                  className="w-full"
                >
                  <Coins className="w-4 h-4 mr-2" />
                  Deposit Funds
                </Button>
                {createdAddress && (
                  <Button
                    onClick={() => setStep("APPROVE")}
                    variant="outline"
                    className="w-full"
                  >
                    I've Already Deposited → Approve Wallet
                  </Button>
                )}
              </>
            )}

            {step === "SUCCESS" && (
              <Button onClick={onClose} className="w-full">
                Start Trading
              </Button>
            )}

            {step === "INSUFFICIENT_FUNDS" && (
              <div className="w-full flex flex-col gap-2">
                <Button
                  onClick={() =>
                    window.open(
                      "https://app.uniswap.org/swap?chain=arbitrum",
                      "_blank",
                    )
                  }
                  variant="outline"
                  className="w-full"
                >
                  Get USDC
                </Button>
                <Button
                  onClick={() => refetchBalance().then(() => setStep("CREATE"))}
                  className="w-full"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Check Balance Again
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DepositModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        onSuccess={() => {
          setShowDepositModal(false);
          setStep("APPROVE");
        }}
      />
    </>
  );
}
