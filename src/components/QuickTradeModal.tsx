// Quick Trade Modal - Side-Split Aware Min Size Logic
import { useState, useEffect } from "react";
import {
  X,
  Zap,
  Loader2,
  Wallet,
  Info,
  ShieldCheck,
  AlertCircle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type { Market, TPSLType } from "@/types/pear";
import { usePearAuthContext } from "@/contexts/PearAuthContext";
import { pearClient } from "@/lib/pearClient";
import { hyperliquidClient, type AssetMeta } from "@/lib/hyperliquidClient";
import { useAccount, useSignTypedData } from "wagmi";
import { useToast } from "@/hooks/use-toast";

const PEAR_BUILDER_ADDRESS = "0xA47D4d99191db54A4829cdf3de2417E527c3b042";
const HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/exchange";
const HYPERLIQUID_CHAIN_ID = 42161;
const LEG_MIN_NOTIONAL = 11;

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

  const [isTradingEnabled, setIsTradingEnabled] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  // Min Notional Size
  const [minNotionalReq, setMinNotionalReq] =
    useState<number>(LEG_MIN_NOTIONAL);
  const [effectiveMaxLeverage, setEffectiveMaxLeverage] = useState<number>(40);
  const [basketEffectiveLeverage, setBasketEffectiveLeverage] =
    useState<number>(1);
  const [meta, setMeta] = useState<AssetMeta[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});

  // TP/SL State
  const [tpEnabled, setTpEnabled] = useState(false);
  const [slEnabled, setSlEnabled] = useState(false);
  const [tpType, setTpType] = useState<TPSLType>("PERCENTAGE");
  const [slType, setSlType] = useState<TPSLType>("PERCENTAGE");
  const [tpValue, setTpValue] = useState("");
  const [slValue, setSlValue] = useState("");

  // Reset state on open
  useEffect(() => {
    if (isOpen && address) {
      setAmount("");
      setLeverage(1);
      setTpEnabled(false);
      setSlEnabled(false);
      setTpValue("");
      setSlValue("");
      setTpType("PERCENTAGE");
      setSlType("PERCENTAGE");
      fetchBalance();
      checkTradingStatus();
      fetchMarketData();
    }
  }, [isOpen, address]);

  useEffect(() => {
    if (!market || meta.length === 0 || Object.keys(prices).length === 0)
      return;
    calculateMinNotional();
  }, [market, meta, prices, leverage]);

  const isStable = (asset: string) =>
    ["USDC", "USDT", "DAI"].includes(asset?.toUpperCase());

  const calculateMinNotional = () => {
    if (!market) return;

    const longs = market.longAssets?.filter((a) => !isStable(a.asset)) || [];
    const shorts = market.shortAssets?.filter((a) => !isStable(a.asset)) || [];

    const hasLongs = longs.length > 0;
    const hasShorts = shorts.length > 0;

    // If we have both sides (e.g. BTC/ETH), capital is split 50/50.
    // If one side (e.g. BTC/USDC), capital is 100% on active side.
    const sideFactor = hasLongs && hasShorts ? 0.5 : 1.0;

    let globalRequiredMin = 0;

    const processSide = (assets: { asset: string; weight?: number }[]) => {
      if (!assets || assets.length === 0) return;
      const totalRawWeight = assets.reduce(
        (sum, a) => sum + (a.weight || 0),
        0,
      );

      assets.forEach((assetItem) => {
        if (isStable(assetItem.asset)) return; // Skip USDC checks

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
          // e.g. 0.5 * 1.0 = 0.5 (for Pair Trade leg)
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

  const fetchMarketData = async () => {
    const [m, p] = await Promise.all([
      hyperliquidClient.getMeta(),
      hyperliquidClient.getAllMids(),
    ]);
    setMeta(m);
    setPrices(p);
  };

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
        variant: "destructive",
        title: "Activation Failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsEnabling(false);
    }
  };

  const handleExecute = async () => {
    if (!isAuthenticated || !agentWallet) return;
    if (!amount || parseFloat(amount) <= 0) return;

    // Check Margin against Min Notional / Leverage
    const marginAmount = parseFloat(amount);
    const minMarginReq = minNotionalReq / basketEffectiveLeverage;

    // Allow small float error
    if (marginAmount < minMarginReq - 0.01) {
      toast({
        title: "Invalid Amount",
        description: `Minimum margin for ${leverage}x is $${minMarginReq.toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }

    // Check if user has sufficient balance
    if (marginAmount > availableBalance) {
      toast({
        title: "Insufficient Balance",
        description: `You have $${availableBalance.toFixed(2)} available. Need $${marginAmount.toFixed(2)}.`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
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

      // Build TP/SL thresholds
      const takeProfit =
        tpEnabled && tpValue && parseFloat(tpValue) > 0
          ? { type: tpType, value: parseFloat(tpValue) }
          : undefined;

      const stopLoss =
        slEnabled && slValue && parseFloat(slValue) > 0
          ? { type: slType, value: parseFloat(slValue) }
          : undefined;

      // Send Notional Value (Margin * Leverage)
      await pearClient.createPosition({
        executionType: "MARKET",
        usdValue: marginAmount * leverage,
        leverage: leverage,
        longAssets: cleanLongs,
        shortAssets: cleanShorts,
        slippage: 0.1,
        takeProfit,
        stopLoss,
      });

      toast({
        title: "Trade Executed!",
        description: `Successfully opened position${takeProfit || stopLoss ? " with risk parameters" : ""}.`,
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

  const displayMinReq = minNotionalReq / basketEffectiveLeverage;

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

            {/* Min Size Req Indicator */}
            <div className="flex items-center gap-1.5 mt-2 text-xs">
              <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Min Required: </span>
              <span className="font-semibold text-primary">
                ${displayMinReq.toFixed(2)}
              </span>
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
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium flex items-center gap-2">
                Leverage
                <Info className="w-3 h-3 text-muted-foreground" />
              </label>
              <span className="text-lg font-bold text-primary">
                {leverage}x
              </span>
            </div>

            <input
              type="range"
              min={1}
              max={effectiveMaxLeverage}
              value={leverage}
              onChange={(e) => setLeverage(parseInt(e.target.value))}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>1x</span>
              {effectiveMaxLeverage < 40 && (
                <span className="text-yellow-500">
                  Max {effectiveMaxLeverage}x
                </span>
              )}
              <span>{effectiveMaxLeverage}x</span>
            </div>
          </div>

          {/* Take Profit / Stop Loss */}
          <div className="space-y-4">
            {/* Take Profit */}
            <div className="border border-border/50 rounded-xl p-4 bg-secondary/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-success" />
                  <label className="text-sm font-medium">Take Profit</label>
                </div>
                <button
                  onClick={() => setTpEnabled(!tpEnabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    tpEnabled ? "bg-success" : "bg-muted"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      tpEnabled ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>

              {tpEnabled && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {(["PERCENTAGE", "DOLLAR", "POSITION_VALUE"] as const).map(
                      (type) => (
                        <button
                          key={type}
                          onClick={() => setTpType(type)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all tap-scale ${
                            tpType === type
                              ? "bg-success text-white"
                              : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          {type === "PERCENTAGE"
                            ? "%"
                            : type === "DOLLAR"
                              ? "$"
                              : "PV"}
                        </button>
                      ),
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={tpValue}
                      onChange={(e) => setTpValue(e.target.value)}
                      placeholder={
                        tpType === "PERCENTAGE"
                          ? "e.g. 20 (for 20%)"
                          : tpType === "DOLLAR"
                            ? "e.g. 100"
                            : "e.g. 1200"
                      }
                      className="w-full px-3 py-2 rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-success/50 transition-all"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {tpType === "PERCENTAGE"
                        ? "%"
                        : tpType === "DOLLAR"
                          ? "USD"
                          : "USD"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Stop Loss */}
            <div className="border border-border/50 rounded-xl p-4 bg-secondary/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-destructive" />
                  <label className="text-sm font-medium">Stop Loss</label>
                </div>
                <button
                  onClick={() => setSlEnabled(!slEnabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    slEnabled ? "bg-destructive" : "bg-muted"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      slEnabled ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>

              {slEnabled && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {(["PERCENTAGE", "DOLLAR", "POSITION_VALUE"] as const).map(
                      (type) => (
                        <button
                          key={type}
                          onClick={() => setSlType(type)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all tap-scale ${
                            slType === type
                              ? "bg-destructive text-white"
                              : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          {type === "PERCENTAGE"
                            ? "%"
                            : type === "DOLLAR"
                              ? "$"
                              : "PV"}
                        </button>
                      ),
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={slValue}
                      onChange={(e) => setSlValue(e.target.value)}
                      placeholder={
                        slType === "PERCENTAGE"
                          ? "e.g. 10 (for 10%)"
                          : slType === "DOLLAR"
                            ? "e.g. 50"
                            : "e.g. 800"
                      }
                      className="w-full px-3 py-2 rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-destructive/50 transition-all"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {slType === "PERCENTAGE"
                        ? "%"
                        : slType === "DOLLAR"
                          ? "USD"
                          : "USD"}
                    </span>
                  </div>
                </div>
              )}
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
              disabled={
                isLoading ||
                !amount ||
                parseFloat(amount) < displayMinReq - 0.01 ||
                parseFloat(amount) > availableBalance
              }
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
