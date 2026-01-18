// Updated Copy Trade Modal with Real Pear Protocol Integration

import {
  X,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  CheckCircle,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { useState, useEffect } from "react";
import type { Trade } from "@/data/mockData";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { pearClient } from "@/lib/pearClient";
import { PEAR_CONFIG } from "@/lib/pearConfig";
import { usePearAuthContext } from "@/contexts/PearAuthContext";
import { AgentWalletSetupModal } from "@/components/AgentWalletSetupModal";
import type {
  CreatePositionRequest,
  TPSLThreshold,
  PairAsset,
} from "@/types/pear";
import { useToast } from "@/hooks/use-toast";
import { hyperliquidClient, type AssetMeta } from "@/lib/hyperliquidClient";
import { useAccount, useSignTypedData } from "wagmi";

interface CopyTradeModalProps {
  trade: Trade;
  isOpen: boolean;
  onClose: () => void;
}

const amounts = [100, 500, 1000];
const LEG_MIN_NOTIONAL = 11;
const PEAR_BUILDER_ADDRESS = "0xA47D4d99191db54A4829cdf3de2417E527c3b042";
const HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/exchange";
const HYPERLIQUID_CHAIN_ID = 42161; // $10 per leg minimum

type ExecutionStatus =
  | "idle"
  | "confirming"
  | "executing"
  | "success"
  | "error";

export function CopyTradeModal({
  trade,
  isOpen,
  onClose,
}: CopyTradeModalProps) {
  const { toast } = useToast();
  const { isAuthenticated, agentWallet } = usePearAuthContext();
  const { address } = useAccount();

  const { signTypedDataAsync } = useSignTypedData();

  const [selectedAmount, setSelectedAmount] = useState<number | "custom">(500);
  const [customAmount, setCustomAmount] = useState("");
  // const [riskAdjustment, setRiskAdjustment] = useState([50]); // Removed
  const [stopLossEnabled, setStopLossEnabled] = useState(true);
  const [stopLoss, setStopLoss] = useState("5");
  const [takeProfitEnabled, setTakeProfitEnabled] = useState(true);
  const [takeProfit, setTakeProfit] = useState("15");
  const [leverage, setLeverage] = useState(trade.leverage || 5);
  const [executionStatus, setExecutionStatus] =
    useState<ExecutionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [showAgentSetup, setShowAgentSetup] = useState(false);

  // Trading Enable State
  const [isTradingEnabled, setIsTradingEnabled] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [isEnabling, setIsEnabling] = useState(false);

  // Min Size Calculation State
  const [minNotionalReq, setMinNotionalReq] =
    useState<number>(LEG_MIN_NOTIONAL);
  const [effectiveMaxLeverage, setEffectiveMaxLeverage] = useState<number>(40);
  const [basketEffectiveLeverage, setBasketEffectiveLeverage] =
    useState<number>(1);
  const [isMarketValid, setIsMarketValid] = useState(true);
  const [meta, setMeta] = useState<AssetMeta[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [availableBalance, setAvailableBalance] = useState<number>(0);

  const actualAmount =
    selectedAmount === "custom" ? Number(customAmount) || 0 : selectedAmount;
  const estimatedFee = (actualAmount * 0.001).toFixed(2);

  // Check trading status on load
  useEffect(() => {
    if (isOpen && address) {
      checkTradingStatus();
    }
  }, [isOpen, address]);

  const checkTradingStatus = async () => {
    if (!address) return;
    setIsCheckingStatus(true);
    try {
      const fee = await hyperliquidClient.getMaxBuilderFee(
        address,
        PEAR_BUILDER_ADDRESS,
      );
      setIsTradingEnabled(fee > 0);
    } catch (e) {
      console.error("Failed to check status", e);
      setIsTradingEnabled(false);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMarketData();
    }
  }, [isOpen]);

  const fetchMarketData = async () => {
    try {
      const [m, p] = await Promise.all([
        hyperliquidClient.getMeta(),
        hyperliquidClient.getAllMids(),
      ]);
      setMeta(m);
      setPrices(p);
    } catch (error) {
      console.error("Failed to fetch market data", error);
    }
  };

  useEffect(() => {
    if (isOpen && address && isAuthenticated) {
      fetchBalance();
    }
  }, [isOpen, address, isAuthenticated]);

  const fetchBalance = async () => {
    if (address && isAuthenticated) {
      try {
        const portfolio = await hyperliquidClient.getPortfolio(address);
        setAvailableBalance(portfolio.withdrawable || portfolio.accountValue);
      } catch (e) {
        console.error("Failed to fetch balance", e);
      }
    }
  };

  useEffect(() => {
    if (!trade || meta.length === 0 || Object.keys(prices).length === 0) return;
    calculateMinNotional();
  }, [trade, meta, prices, leverage]);

  const isStable = (asset: string) =>
    ["USDC", "USDT", "DAI"].includes(asset?.toUpperCase());

  const calculateMinNotional = () => {
    const { longAssets, shortAssets } = parsePair(trade.pair);

    // Validate if all assets exist in meta
    const allAssetsExist = [...longAssets, ...shortAssets].every(
      (pairAsset) => {
        const asset = pairAsset.asset;
        return isStable(asset) || meta.some((m) => m.name === asset);
      },
    );

    if (!allAssetsExist) {
      setIsMarketValid(false);
      setMinNotionalReq(LEG_MIN_NOTIONAL);
      return;
    }

    setIsMarketValid(true);

    // Filter out stablecoins from the asset arrays
    const longs = longAssets.filter((pa) => !isStable(pa.asset));
    const shorts = shortAssets.filter((pa) => !isStable(pa.asset));

    const hasLongs = longs.length > 0;
    const hasShorts = shorts.length > 0;
    // If we have both sides (e.g. BTC/ETH), capital is split 50/50.
    // If one side (e.g. BTC/USDC), capital is 100% on active side.
    const sideFactor = hasLongs && hasShorts ? 0.5 : 1.0;

    let globalRequiredMin = 0;

    const processSide = (assets: PairAsset[]) => {
      if (!assets || assets.length === 0) return;

      const totalRawWeight = assets.reduce(
        (sum, a) => sum + (a.weight || 0),
        0,
      );

      assets.forEach((assetItem) => {
        if (isStable(assetItem.asset)) return;

        const assetMeta = meta.find((m) => m.name === assetItem.asset);
        const price = prices[assetItem.asset];

        if (assetMeta && price) {
          // 1. Technical Min
          const minUnitSize = Math.pow(10, -assetMeta.szDecimals);
          const minTechnicalNotional = minUnitSize * price;

          // 2. Protocol Min ($10 per leg)
          const minLegNotional = Math.max(
            minTechnicalNotional,
            LEG_MIN_NOTIONAL,
          );

          // 3. Normalized Weight within Side
          let normalizedWeightInSide = 1;
          if (totalRawWeight > 0) {
            normalizedWeightInSide = (assetItem.weight || 0) / totalRawWeight;
          } else {
            normalizedWeightInSide = 1 / assets.length;
          }

          // 4. Effective Global Weight (Side Factor * InSide Weight)
          const effectiveGlobalWeight = normalizedWeightInSide * sideFactor;

          if (effectiveGlobalWeight > 0) {
            const reqTotal = minLegNotional / effectiveGlobalWeight;
            if (reqTotal > globalRequiredMin) globalRequiredMin = reqTotal;
          }
        }
      });
    };

    processSide(longs);
    processSide(shorts);

    // ALLOWED SLIDER MAX: Highest max leverage among all selected assets.
    let highestMaxLev = 0;
    const allAssetItems = [...longs, ...shorts];

    if (allAssetItems.length === 0) {
      highestMaxLev = 40;
    } else {
      allAssetItems.forEach((assetItem) => {
        if (isStable(assetItem.asset)) return;
        const assetMeta = meta.find((m) => m.name === assetItem.asset);
        if (assetMeta && assetMeta.maxLeverage) {
          highestMaxLev = Math.max(highestMaxLev, assetMeta.maxLeverage);
        }
      });
    }

    if (highestMaxLev === 0) highestMaxLev = 40;
    setEffectiveMaxLeverage(highestMaxLev);

    if (leverage > highestMaxLev) {
      setLeverage(highestMaxLev);
    }

    setMinNotionalReq(globalRequiredMin);

    // Calculate Effective Basket Leverage (Harmonic Mean)
    const allAssets = [...longs, ...shorts];
    const totalW = allAssets.reduce((s, a) => s + (a.weight || 0), 0);

    if (totalW === 0) {
      setBasketEffectiveLeverage(leverage);
      return;
    }

    let sumInverseLev = 0;

    allAssets.forEach((item) => {
      if (isStable(item.asset)) return;
      const assetMeta = meta.find((m) => m.name === item.asset);
      const assetMax = assetMeta?.maxLeverage || 40;
      const actualAssetLev = Math.min(leverage, assetMax);

      const w = (item.weight || 0) / totalW;
      sumInverseLev += w / actualAssetLev;
    });

    const effectiveBasketLev = sumInverseLev > 0 ? 1 / sumInverseLev : leverage;
    setBasketEffectiveLeverage(effectiveBasketLev);
  };

  // Use the selected leverage directly
  const adjustedLeverage = leverage;

  // Parse pair to get long and short assets (supports basket trades)
  const parsePair = (
    pair: string,
  ): { longAssets: PairAsset[]; shortAssets: PairAsset[] } => {
    // Handle pairs like "SOL/USDT", "BTC+ETH/DOGE+SHIB", etc.
    const [side1, side2] = pair.split("/");

    // Split by "+" to get multiple assets in a basket
    const assets1 = side1.split("+").map((a) => a.trim());
    const assets2 = side2.split("+").map((a) => a.trim());

    // Equal weight distribution for each asset in the basket
    const weight1 = 1 / assets1.length;
    const weight2 = 1 / assets2.length;

    const pairAssets1: PairAsset[] = assets1.map((asset) => ({
      asset,
      weight: weight1,
    }));

    const pairAssets2: PairAsset[] = assets2.map((asset) => ({
      asset,
      weight: weight2,
    }));

    if (trade.direction === "LONG") {
      return { longAssets: pairAssets1, shortAssets: pairAssets2 };
    } else {
      return { longAssets: pairAssets2, shortAssets: pairAssets1 };
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
      await fetch(HYPERLIQUID_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentPayload),
      });

      // 2. Approve Builder Fee
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
        maxFeeRate: "0.06%",
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
          maxFeeRate: "0.06%",
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
        description: "You can now execute your trade.",
      });
      setIsTradingEnabled(true);
    } catch (err) {
      console.error("Enable Trading Failed", err);
      toast({
        variant: "destructive",
        title: "Activation Failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsEnabling(false);
    }
  };

  const handleExecute = async () => {
    // Check market validity
    if (!isMarketValid) {
      toast({
        title: "Market Unavailable",
        description:
          "One or more assets in this pair are not supported for trading.",
        variant: "destructive",
      });
      return;
    }

    // Check authentication
    if (!isAuthenticated) {
      toast({
        title: "Not Connected",
        description: "Please connect your wallet to execute trades",
        variant: "destructive",
      });
      return;
    }

    // Check agent wallet
    if (!agentWallet) {
      setShowAgentSetup(true);
      return;
    }

    // Validate amount against calculated minimum (accounting for leverage)
    const minMarginReq = minNotionalReq / basketEffectiveLeverage;
    if (actualAmount < minMarginReq - 0.01) {
      toast({
        title: "Amount Too Low",
        description: `Minimum margin for ${adjustedLeverage}x is $${minMarginReq.toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }

    // Check if user has sufficient balance
    if (actualAmount > availableBalance) {
      toast({
        title: "Insufficient Balance",
        description: `You have $${availableBalance.toFixed(2)} available. Need $${actualAmount.toFixed(2)}.`,
        variant: "destructive",
      });
      return;
    }

    setExecutionStatus("confirming");
    setErrorMessage(null);

    try {
      const { longAssets, shortAssets } = parsePair(trade.pair);

      // Build stop loss config
      const stopLossConfig: TPSLThreshold | undefined = stopLossEnabled
        ? { type: "PERCENTAGE", value: parseFloat(stopLoss) }
        : undefined;

      // Build take profit config
      const takeProfitConfig: TPSLThreshold | undefined = takeProfitEnabled
        ? { type: "PERCENTAGE", value: parseFloat(takeProfit) }
        : undefined;

      // Build position request (usdValue = margin * leverage for notional)
      const request: CreatePositionRequest = {
        executionType: "MARKET",
        leverage: adjustedLeverage,
        usdValue: actualAmount * adjustedLeverage,
        slippage: PEAR_CONFIG.DEFAULT_SLIPPAGE,
        longAssets,
        shortAssets,
        stopLoss: stopLossConfig,
        takeProfit: takeProfitConfig,
      };

      setExecutionStatus("executing");

      // Execute the trade
      const response = await pearClient.createPosition(request);

      setOrderId(response.orderId);
      setExecutionStatus("success");

      toast({
        title: "Trade Executed! 🎉",
        description: `Successfully copied ${trade.pair} ${trade.direction} with $${actualAmount}`,
      });

      // Close modal after success
      setTimeout(() => {
        onClose();
        // Reset state
        setExecutionStatus("idle");
        setOrderId(null);
      }, 2000);
    } catch (error) {
      console.error("Trade execution error:", error);
      const message =
        error instanceof Error ? error.message : "Trade execution failed";

      const friendlyMessage = message.includes("Entity not found")
        ? "One of the assets is not available for trading."
        : message;

      setErrorMessage(friendlyMessage);
      setExecutionStatus("error");

      toast({
        title: "Execution Failed",
        description: friendlyMessage,
        variant: "destructive",
      });
    }
  };

  const handleRetry = () => {
    setExecutionStatus("idle");
    setErrorMessage(null);
  };

  if (!isOpen) return null;

  const renderExecutionState = () => {
    switch (executionStatus) {
      case "confirming":
      case "executing":
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
            <p className="text-lg font-semibold">
              {executionStatus === "confirming"
                ? "Preparing Trade..."
                : "Executing Trade..."}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Please wait while we process your order
            </p>
          </div>
        );

      case "success":
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 text-success" />
            </div>
            <p className="text-lg font-semibold text-success">
              Trade Executed!
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Order ID: {orderId?.slice(0, 8)}...
            </p>
          </div>
        );

      case "error":
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mb-4">
              <X className="w-10 h-10 text-destructive" />
            </div>
            <p className="text-lg font-semibold text-destructive">
              Execution Failed
            </p>
            <p className="text-sm text-muted-foreground mt-2 text-center px-4">
              {errorMessage}
            </p>
            <button
              onClick={handleRetry}
              className="mt-4 px-6 py-2 rounded-lg bg-secondary font-semibold tap-scale"
            >
              Try Again
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={executionStatus === "idle" ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative w-full max-w-mobile bg-card rounded-t-3xl animate-slide-up max-h-[90vh] overflow-y-auto hide-scrollbar">
        {/* Handle */}
        <div className="sticky top-0 bg-card pt-3 pb-2 flex justify-center">
          <div className="w-12 h-1 rounded-full bg-muted" />
        </div>

        <div className="px-5 pb-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Copy Trade</h2>
            {executionStatus === "idle" && (
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-secondary tap-scale"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Show execution state or form */}
          {executionStatus !== "idle" ? (
            renderExecutionState()
          ) : (
            <>
              {/* Trade Summary */}
              <div className="bg-secondary rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-bold">{trade.pair}</span>
                  <span
                    className={`px-3 py-1 rounded-lg text-sm font-bold ${
                      trade.direction === "LONG"
                        ? "bg-success/20 text-success"
                        : "bg-destructive/20 text-destructive"
                    }`}
                  >
                    {trade.direction}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>by @{trade.trader.username}</span>
                  <span>•</span>
                  <span className="text-success">
                    {trade.trader.winRate} win rate
                  </span>
                </div>
              </div>

              {/* Amount Selection */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-muted-foreground">
                    Investment Amount (Margin)
                  </label>
                  <div className="flex flex-col items-end gap-0.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <AlertCircle className="w-3 h-3" />
                      <span>
                        Min: $
                        {(minNotionalReq / basketEffectiveLeverage).toFixed(2)}
                      </span>
                    </div>
                    {isAuthenticated && availableBalance > 0 && (
                      <span className="text-xs text-muted-foreground">
                        Available: ${availableBalance.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {amounts.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setSelectedAmount(amount)}
                      className={`py-3 rounded-xl font-semibold transition-colors tap-scale ${
                        selectedAmount === amount
                          ? "gradient-primary text-primary-foreground"
                          : "bg-secondary hover:bg-secondary/80"
                      }`}
                    >
                      ${amount}
                    </button>
                  ))}
                  <button
                    onClick={() => setSelectedAmount("custom")}
                    className={`py-3 rounded-xl font-semibold transition-colors tap-scale ${
                      selectedAmount === "custom"
                        ? "gradient-primary text-primary-foreground"
                        : "bg-secondary hover:bg-secondary/80"
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {selectedAmount === "custom" && (
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full mt-3 px-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary focus:outline-none transition-colors"
                  />
                )}
              </div>

              {/* Leverage */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Leverage
                    </label>
                    <span className="text-xs bg-secondary px-2 py-0.5 rounded-md text-muted-foreground">
                      Original: {trade.leverage}x
                    </span>
                  </div>
                  <span className="text-sm font-bold text-primary">
                    {leverage}x
                  </span>
                </div>
                <Slider
                  value={[leverage]}
                  onValueChange={(v) => setLeverage(v[0])}
                  min={1}
                  max={effectiveMaxLeverage}
                  step={1}
                  className="mb-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1x (Safe)</span>
                  {effectiveMaxLeverage < 40 && (
                    <span className="text-yellow-500">
                      Max {effectiveMaxLeverage}x
                    </span>
                  )}
                  <span>{effectiveMaxLeverage}x</span>
                </div>
              </div>

              {/* Stop Loss */}
              <div className="flex items-center justify-between p-4 bg-secondary rounded-xl mb-3">
                <div className="flex items-center gap-3">
                  <TrendingDown className="w-5 h-5 text-destructive" />
                  <span className="font-medium">Stop Loss</span>
                </div>
                <div className="flex items-center gap-3">
                  {stopLossEnabled && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={stopLoss}
                        onChange={(e) => setStopLoss(e.target.value)}
                        className="w-12 px-2 py-1 text-center rounded-lg bg-background border border-border text-sm"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  )}
                  <Switch
                    checked={stopLossEnabled}
                    onCheckedChange={setStopLossEnabled}
                  />
                </div>
              </div>

              {/* Take Profit */}
              <div className="flex items-center justify-between p-4 bg-secondary rounded-xl mb-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-success" />
                  <span className="font-medium">Take Profit</span>
                </div>
                <div className="flex items-center gap-3">
                  {takeProfitEnabled && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={takeProfit}
                        onChange={(e) => setTakeProfit(e.target.value)}
                        className="w-12 px-2 py-1 text-center rounded-lg bg-background border border-border text-sm"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  )}
                  <Switch
                    checked={takeProfitEnabled}
                    onCheckedChange={setTakeProfitEnabled}
                  />
                </div>
              </div>

              {/* Trade Summary */}
              <div className="bg-secondary/50 rounded-xl p-4 mb-6 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Position Size</span>
                  <span className="font-medium">
                    ${actualAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Effective Leverage
                  </span>
                  <span className="font-medium">{adjustedLeverage}x</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Slippage</span>
                  <span className="font-medium">
                    {PEAR_CONFIG.DEFAULT_SLIPPAGE * 100}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estimated Fees</span>
                  <span className="font-medium text-warning">
                    ${estimatedFee}
                  </span>
                </div>
              </div>

              {/* Market Invalid Warning */}
              {!isMarketValid && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl mb-4">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                  <span className="text-sm text-destructive font-medium">
                    This market pair is currently unavailable for trading.
                  </span>
                </div>
              )}

              {/* Agent Wallet Warning */}
              {isAuthenticated && !agentWallet && (
                <div
                  onClick={() => setShowAgentSetup(true)}
                  className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl mb-4 cursor-pointer"
                >
                  <ShieldAlert className="w-5 h-5 text-yellow-500" />
                  <span className="text-sm text-yellow-500 font-medium">
                    Setup Trading Wallet to continue
                  </span>
                </div>
              )}

              {/* Not authenticated warning */}
              {!isAuthenticated && (
                <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/20 rounded-xl mb-4">
                  <AlertCircle className="w-5 h-5 text-warning" />
                  <span className="text-sm text-warning">
                    Connect wallet to execute trades
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <button
                onClick={() => {
                  if (isAuthenticated && !agentWallet) {
                    setShowAgentSetup(true);
                  } else if (isAuthenticated && !isTradingEnabled) {
                    handleEnableTrading();
                  } else {
                    handleExecute();
                  }
                }}
                disabled={
                  isCheckingStatus ||
                  isEnabling ||
                  (!isAuthenticated && true) ||
                  (isAuthenticated &&
                    agentWallet &&
                    isTradingEnabled &&
                    (!isMarketValid ||
                      actualAmount <= 0 ||
                      actualAmount > availableBalance ||
                      actualAmount < minNotionalReq / adjustedLeverage - 0.01))
                }
                className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-bold text-lg tap-scale disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none mb-3"
              >
                {!isAuthenticated
                  ? "Connect Wallet"
                  : !agentWallet
                    ? "Setup Wallet"
                    : isCheckingStatus
                      ? "Loading..."
                      : !isTradingEnabled
                        ? isEnabling
                          ? "Enabling..."
                          : "One-Click Enable Trading"
                        : !isMarketValid
                          ? "Market Unavailable"
                          : actualAmount > availableBalance
                            ? "Insufficient Balance"
                            : actualAmount <
                                minNotionalReq / adjustedLeverage - 0.01
                              ? "Amount Too Low"
                              : "Execute Trade"}
              </button>

              <button
                onClick={onClose}
                className="w-full py-4 rounded-xl bg-secondary font-semibold tap-scale hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Agent & Wallet Setup Modal */}
      <AgentWalletSetupModal
        isOpen={showAgentSetup}
        onClose={() => setShowAgentSetup(false)}
      />
    </div>
  );
}
