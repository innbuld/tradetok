// Quick Trade Modal - Smart Stateful Button (Enable -> Trade)
import { useState, useEffect } from "react";
import { X, Zap, Loader2, Wallet, Info, ShieldCheck } from "lucide-react";
import type { Market } from "@/types/pear";
import { usePearAuthContext } from "@/contexts/PearAuthContext";
import { pearClient } from "@/lib/pearClient";
import { hyperliquidClient } from "@/lib/hyperliquidClient";
import { useAccount, useSignTypedData } from "wagmi";
import { useToast } from "@/hooks/use-toast";

const PEAR_BUILDER_ADDRESS = "0xA47D4d99191db54A4829cdf3de2417E527c3b042";
const HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/exchange";
const HYPERLIQUID_CHAIN_ID = 42161;

interface QuickTradeModalProps {
  market: Market | null;
  isOpen: boolean;
  onClose: () => void;
}

export function QuickTradeModal({
  market,
  isOpen,
  onClose,
}: QuickTradeModalProps) {
  const { isAuthenticated, agentWallet } = usePearAuthContext();
  const { address } = useAccount();
  const { toast } = useToast();
  const { signTypedDataAsync } = useSignTypedData();

  const [amount, setAmount] = useState("");
  const [leverage, setLeverage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [availableBalance, setAvailableBalance] = useState<number>(0);

  // State to track if trading is enabled (Builder approved)
  // Default to false to be safe, or check?
  // We'll set to false initially, then check.
  const [isTradingEnabled, setIsTradingEnabled] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  // Reset state on open
  useEffect(() => {
    if (isOpen && address) {
      setAmount("");
      setLeverage(1);
      fetchBalance();
      checkTradingStatus();
    }
  }, [isOpen, address]);

  const checkTradingStatus = async () => {
    if (!address) return;
    setIsCheckingStatus(true);
    try {
      // Check Builder Fee Approval
      const fee = await hyperliquidClient.getMaxBuilderFee(
        address,
        PEAR_BUILDER_ADDRESS,
      );
      // If fee > 0, we assume enabled.
      setIsTradingEnabled(fee > 0);
    } catch (e) {
      console.error("Failed to check status", e);
      // Default to false if check fails, forcing user to Enable
      setIsTradingEnabled(false);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const fetchBalance = async () => {
    if (address && isAuthenticated) {
      try {
        const portfolio = await hyperliquidClient.getPortfolio(address);
        setAvailableBalance(portfolio.withdrawable || portfolio.accountValue);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleEnableTrading = async () => {
    if (!agentWallet || !address) return;
    setIsEnabling(true);
    try {
      const now = Date.now();
      const domain = {
        name: "HyperliquidSignTransaction",
        version: "1",
        chainId: HYPERLIQUID_CHAIN_ID,
        verifyingContract:
          "0x0000000000000000000000000000000000000000" as `0x${string}`,
      };

      // 1. Approve Agent
      const agentTypes = {
        "HyperliquidTransaction:ApproveAgent": [
          { name: "hyperliquidChain", type: "string" },
          { name: "agentAddress", type: "address" },
          { name: "agentName", type: "string" },
          { name: "nonce", type: "uint64" },
        ],
      };

      const agentMessage = {
        hyperliquidChain: "Mainnet",
        agentAddress: agentWallet as `0x${string}`,
        agentName: "TradeTok",
        nonce: BigInt(now),
      };

      const agentSignature = await signTypedDataAsync({
        account: address as `0x${string}`,
        domain,
        types: agentTypes,
        primaryType: "HyperliquidTransaction:ApproveAgent",
        message: agentMessage,
      });

      const agentPayload = {
        action: {
          type: "approveAgent",
          hyperliquidChain: "Mainnet",
          signatureChainId: "0xa4b1",
          agentAddress: agentWallet,
          agentName: "TradeTok",
          nonce: now,
        },
        nonce: now,
        signature: {
          r: agentSignature.slice(0, 66),
          s: "0x" + agentSignature.slice(66, 130),
          v:
            parseInt(agentSignature.slice(130, 132), 16) >= 27
              ? parseInt(agentSignature.slice(130, 132), 16)
              : parseInt(agentSignature.slice(130, 132), 16) + 27,
        },
      };

      const agentRes = await fetch(HYPERLIQUID_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentPayload),
      });

      if (!agentRes.ok) throw new Error("Agent Approval Failed");

      // 2. Approve Builder
      const builderTypes = {
        "HyperliquidTransaction:ApproveBuilderFee": [
          { name: "hyperliquidChain", type: "string" },
          { name: "maxFeeRate", type: "string" },
          { name: "builder", type: "address" },
          { name: "nonce", type: "uint64" },
        ],
      };

      const builderMessage = {
        hyperliquidChain: "Mainnet",
        maxFeeRate: "0.01%",
        builder: PEAR_BUILDER_ADDRESS as `0x${string}`,
        nonce: BigInt(now + 1),
      };

      const builderSignature = await signTypedDataAsync({
        account: address as `0x${string}`,
        domain,
        types: builderTypes,
        primaryType: "HyperliquidTransaction:ApproveBuilderFee",
        message: builderMessage,
      });

      const builderPayload = {
        action: {
          type: "approveBuilderFee",
          hyperliquidChain: "Mainnet",
          signatureChainId: "0xa4b1",
          maxFeeRate: "0.01%",
          builder: PEAR_BUILDER_ADDRESS,
          nonce: now + 1,
        },
        nonce: now + 1,
        signature: {
          r: builderSignature.slice(0, 66),
          s: "0x" + builderSignature.slice(66, 130),
          v:
            parseInt(builderSignature.slice(130, 132), 16) >= 27
              ? parseInt(builderSignature.slice(130, 132), 16)
              : parseInt(builderSignature.slice(130, 132), 16) + 27,
        },
      };

      const builderRes = await fetch(HYPERLIQUID_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(builderPayload),
      });

      if (!builderRes.ok) throw new Error("Builder Approval Failed");

      toast({
        title: "Trading Enabled!",
        description: "You can now place your trade.",
      });
      setIsTradingEnabled(true);
    } catch (err) {
      console.error("Enable Trading Failed", err);
      toast({
        title: "Activation Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsEnabling(false);
    }
  };

  const handleExecute = async () => {
    if (!isAuthenticated || !agentWallet) return;
    if (!amount || parseFloat(amount) <= 0) return;

    setIsLoading(true);

    try {
      // 1. Prepare & Normalize Weights
      const prepareAssets = (assets: { asset: string; weight?: number }[]) => {
        if (!assets || assets.length === 0) return [];
        const totalWeight = assets.reduce((sum, a) => sum + (a.weight || 0), 0);
        return assets.map((a) => ({
          asset: a.asset,
          weight:
            totalWeight > 0 ? (a.weight || 0) / totalWeight : 1 / assets.length,
        }));
      };

      const cleanLongs = prepareAssets(market?.longAssets || []);
      const cleanShorts = prepareAssets(market?.shortAssets || []);

      if (cleanLongs.length === 0 && cleanShorts.length === 0)
        throw new Error("Invalid market data");

      // 2. Construct Trade Request
      await pearClient.createPosition({
        executionType: "MARKET",
        usdValue: parseFloat(amount),
        leverage: leverage,
        longAssets: cleanLongs,
        shortAssets: cleanShorts,
        slippage: 0.1,
      });

      toast({
        title: "Trade Executed!",
        description: `Successfully opened position.`,
        variant: "default",
      });

      onClose();
    } catch (err) {
      console.error("Trade failed:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Trade Failed",
        description: errorMessage.includes("500")
          ? "API Error (500). Please check console."
          : errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !market) return null;

  const longAsset = market.longAssets?.[0]?.asset ?? "UNKNOWN";
  const shortAsset = market.shortAssets?.[0]?.asset ?? "USDT";
  const pair = `${longAsset}/${shortAsset}`;

  const fillAmount = (percent: number) => {
    if (availableBalance > 0) {
      setAmount((availableBalance * percent).toFixed(2));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-mobile sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl animate-slide-up p-6 border-t sm:border border-border/50 shadow-2xl">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-muted sm:hidden" />

        <div className="flex items-start justify-between mb-6 mt-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-2xl font-bold">{pair}</h2>
              <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
                Pair Trade
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Long <span className="text-success font-medium">{longAsset}</span>{" "}
              vs Short{" "}
              <span className="text-destructive font-medium">{shortAsset}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-secondary tap-scale hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">
                Invest Amount (USDC)
              </label>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Wallet className="w-3 h-3" />
                <span>
                  $
                  {availableBalance.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{" "}
                  Available
                </span>
              </div>
            </div>

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">
                $
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-4 rounded-xl bg-secondary text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/30"
              />
              <button
                onClick={() => fillAmount(1)}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-background rounded-lg text-xs font-bold text-primary tap-scale shadow-sm"
              >
                MAX
              </button>
            </div>

            <div className="flex gap-2 mt-2">
              {[0.25, 0.5, 0.75].map((pct) => (
                <button
                  key={pct}
                  onClick={() => fillAmount(pct)}
                  className="flex-1 py-1.5 rounded-lg bg-secondary/50 text-xs font-medium tap-scale hover:bg-secondary transition-colors"
                >
                  {pct * 100}%
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium flex items-center gap-2">
                Leverage
                <Info className="w-3 h-3 text-muted-foreground" />
              </label>
              <span className="text-lg font-bold text-primary">
                {leverage}x
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 5, 10].map((lev) => (
                <button
                  key={lev}
                  onClick={() => setLeverage(lev)}
                  className={`py-2 rounded-xl text-sm font-bold transition-all tap-scale ${
                    leverage === lev
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                  }`}
                >
                  {lev}x
                </button>
              ))}
            </div>
          </div>

          {/* Smart Button */}
          {!isAuthenticated ? (
            <button
              disabled
              className="w-full py-4 rounded-xl bg-secondary text-muted-foreground font-bold"
            >
              Connect Wallet to Trade
            </button>
          ) : isCheckingStatus ? (
            <button
              disabled
              className="w-full py-4 rounded-xl bg-secondary text-muted-foreground/50 font-bold flex items-center justify-center gap-2"
            >
              <Loader2 className="w-5 h-5 animate-spin" /> Checking Access...
            </button>
          ) : !isTradingEnabled ? (
            <button
              onClick={handleEnableTrading}
              disabled={isEnabling}
              className="w-full py-4 rounded-xl border-2 border-primary text-primary font-bold text-lg tap-scale hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
            >
              {isEnabling ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
              {isEnabling ? "Activating..." : "Enable Trading Access"}
            </button>
          ) : (
            <button
              onClick={handleExecute}
              disabled={isLoading || !amount || parseFloat(amount) <= 0}
              className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-bold text-lg tap-scale shadow-xl shadow-primary/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Zap className="w-5 h-5 fill-current" />
              )}
              {isLoading ? "Executing..." : "Open Position"}
            </button>
          )}

          <p className="text-xs text-center text-muted-foreground/50">
            Powered by Pear Protocol • Arbitrum Network
          </p>
        </div>
      </div>
    </div>
  );
}
