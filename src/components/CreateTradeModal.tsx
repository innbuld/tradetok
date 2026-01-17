// Create Trade Modal - Users select a pair, direction, position size, and add a thesis to create a post
import { useState, useEffect, useMemo } from "react";
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
  Search,
  MessageSquare,
  ArrowRightLeft,
} from "lucide-react";
import type { TPSLType, Market } from "@/types/pear";
import { usePearAuthContext } from "@/contexts/PearAuthContext";
import { pearClient } from "@/lib/pearClient";
import { hyperliquidClient, type AssetMeta } from "@/lib/hyperliquidClient";
import { useAccount, useSignTypedData } from "wagmi";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/db";

const PEAR_BUILDER_ADDRESS = "0xA47D4d99191db54A4829cdf3de2417E527c3b042";
const HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/exchange";
const HYPERLIQUID_CHAIN_ID = 42161;
const LEG_MIN_NOTIONAL = 10;

// Hardcoded popular markets for now
const POPULAR_MARKETS = [
  { pair: "BTC/USDC", long: "BTC", short: "USDC" },
  { pair: "ETH/USDC", long: "ETH", short: "USDC" },
  { pair: "SOL/USDC", long: "SOL", short: "USDC" },
  { pair: "AVAX/USDC", long: "AVAX", short: "USDC" },
  { pair: "ETH/BTC", long: "ETH", short: "BTC" },
  { pair: "SOL/ETH", long: "SOL", short: "ETH" },
];

interface CreateTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTradeCreated: () => void;
  onSwitchToBasket?: () => void;
}

export function CreateTradeModal({
  isOpen,
  onClose,
  onTradeCreated,
  onSwitchToBasket,
}: CreateTradeModalProps) {
  // ... existing hooks ...
  const { isAuthenticated, agentWallet } = usePearAuthContext();
  const { address } = useAccount();
  const { toast } = useToast();
  const { signTypedDataAsync } = useSignTypedData();

  // Trade State
  const [allMarkets, setAllMarkets] = useState<Market[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [amount, setAmount] = useState("");
  const [leverage, setLeverage] = useState(1);
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [availableBalance, setAvailableBalance] = useState<number>(0);

  // Thesis State
  const [thesisText, setThesisText] = useState("");

  // App State
  const [isLoading, setIsLoading] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [isTradingEnabled, setIsTradingEnabled] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [isFetchingMarkets, setIsFetchingMarkets] = useState(false);

  // Min Notional Size Logic
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

  // Filter markets based on search and deduplicate
  const filteredMarkets = useMemo(() => {
    const uniqueMap = new Map();

    allMarkets.forEach((m) => {
      const longAsset = m.longAssets?.[0]?.asset || "";
      const shortAsset = m.shortAssets?.[0]?.asset || "";
      // Skip invalid markets
      if (!longAsset || !shortAsset) return;

      const pair = `${longAsset}/${shortAsset}`;

      if (pair.toLowerCase().includes(searchQuery.toLowerCase())) {
        // Only keep the first occurrence of each pair
        if (!uniqueMap.has(pair)) {
          uniqueMap.set(pair, m);
        }
      }
    });

    const results = Array.from(uniqueMap.values());

    // If no results and we have a query, allow custom pair creation (BASE/QUOTE)
    if (results.length === 0 && searchQuery.trim().length > 0) {
      const cleanQuery = searchQuery.toUpperCase().replace(/\s+/g, "");
      let baseAsset = cleanQuery;
      let quoteAsset = "USDC"; // Default quote

      // Handle slash input (e.g. "LINK/KAITO")
      if (cleanQuery.includes("/")) {
        const parts = cleanQuery.split("/");
        if (parts[0]) baseAsset = parts[0];
        if (parts[1]) quoteAsset = parts[1];
      }

      if (baseAsset.length > 0 && quoteAsset.length > 0) {
        // Create synthetic market
        const customMarket: Market = {
          longAssets: [{ asset: baseAsset, weight: 1 }],
          shortAssets: [{ asset: quoteAsset, weight: 1 }],
          openInterest: "0",
          volume: "0",
          ratio: "0",
          prevRatio: "0",
          change24h: "0",
          weightedRatio: "0",
          weightedPrevRatio: "0",
          weightedChange24h: "0",
          netFunding: "0",
        };
        return [customMarket];
      }
    }

    return results;
  }, [allMarkets, searchQuery]);

  // fetch data on open
  useEffect(() => {
    if (isOpen && address) {
      setAmount("");
      setLeverage(1);
      setThesisText("");
      setTpEnabled(false);
      setSlEnabled(false);
      setTpValue("");
      setSlValue("");
      setTpType("PERCENTAGE");
      setSlType("PERCENTAGE");
      fetchBalance();
      checkTradingStatus();
      fetchMarketData();
      fetchMarkets();
    }
  }, [isOpen, address]);

  const fetchMarkets = async () => {
    setIsFetchingMarkets(true);
    try {
      const active = await pearClient.getActiveMarkets();
      const markets = active.active || [];
      setAllMarkets(markets);
      if (markets.length > 0 && !selectedMarket) {
        setSelectedMarket(markets[0]);
      }
    } catch (error) {
      console.error("Failed to fetch markets:", error);
    } finally {
      setIsFetchingMarkets(false);
    }
  };

  // Recalculate mins when market/meta/prices change
  useEffect(() => {
    if (
      !selectedMarket ||
      meta.length === 0 ||
      Object.keys(prices).length === 0
    )
      return;
    calculateMinNotional();
  }, [selectedMarket, meta, prices, leverage]);

  const isStable = (asset: string) =>
    ["USDC", "USDT", "DAI"].includes(asset?.toUpperCase());

  const calculateMinNotional = () => {
    if (
      !selectedMarket ||
      meta.length === 0 ||
      Object.keys(prices).length === 0
    )
      return;

    const longAssets = (selectedMarket.longAssets || []).map((a) => ({
      ...a,
      weight: a.weight || 1,
    }));
    const shortAssets = (selectedMarket.shortAssets || []).map((a) => ({
      ...a,
      weight: a.weight || 1,
    }));

    const hasLongs = longAssets.length > 0;
    const hasShorts = shortAssets.length > 0;
    const sideFactor = hasLongs && hasShorts ? 0.5 : 1.0;

    let globalRequiredMin = 0;

    const processSide = (assets: { asset: string; weight: number }[]) => {
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

          // 3. Normalized Weight
          let normalizedWeightInSide = 1;
          if (totalRawWeight > 0) {
            normalizedWeightInSide = (assetItem.weight || 0) / totalRawWeight;
          } else {
            normalizedWeightInSide = 1 / assets.length;
          }

          // 4. Effective Global Weight
          const effectiveGlobalWeight = normalizedWeightInSide * sideFactor;

          if (effectiveGlobalWeight > 0) {
            const reqTotal = minLegNotional / effectiveGlobalWeight;
            if (reqTotal > globalRequiredMin) globalRequiredMin = reqTotal;
          }
        } else {
          // Fallback if meta/price missing but asset is not stable
          // Assume at least LEG_MIN_NOTIONAL per expected leg share
          // This is a safety fallback
          const safeLegNotional = LEG_MIN_NOTIONAL;
          // If we don't know weight, assume 1
          const effective = sideFactor;
          const req = safeLegNotional / effective;
          if (req > globalRequiredMin) globalRequiredMin = req;
        }
      });
    };

    processSide(shortAssets);

    // Calculate effective max leverage (Slider Max limits)
    // We set the slider max to the HIGHEST max leverage among all assets.
    // e.g. BTC(40x) + LIT(5x) -> Slider Max 40x.
    // e.g. LINK(20x) + KAITO(3x) -> Slider Max 20x.
    let highestMaxLev = 0;
    const allAssetItems = [...longAssets, ...shortAssets];

    if (allAssetItems.length === 0) {
      highestMaxLev = 40;
    } else {
      allAssetItems.forEach((assetItem) => {
        if (isStable(assetItem.asset)) return;
        const assetMeta = meta.find((m) => m.name === assetItem.asset);
        // If asset found, consider its max. If not found (maybe custom?), ignore or default?
        // Safest is to rely on known meta.
        if (assetMeta && assetMeta.maxLeverage) {
          highestMaxLev = Math.max(highestMaxLev, assetMeta.maxLeverage);
        }
      });
    }

    // Fallback if we found no valid assets (e.g. only stables or unknown assets)
    if (highestMaxLev === 0) highestMaxLev = 40;

    setEffectiveMaxLeverage(highestMaxLev);

    // If current leverage is higher than the computed max, clamp it.
    if (leverage > highestMaxLev && highestMaxLev > 0) {
      // We only auto-clamp downwards.
      setLeverage(highestMaxLev);
    }

    // If result is still 0 (e.g. only stablecoins?), default to LEG_MIN_NOTIONAL
    if (globalRequiredMin === 0) globalRequiredMin = LEG_MIN_NOTIONAL;

    setMinNotionalReq(globalRequiredMin);

    // Calculate Effective Basket Leverage (Harmonic Mean)
    const allAssets = [...longAssets, ...shortAssets];
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
      // Reusing logic from QuickTradeModal - ideally this should be a hook or shared util
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

      // Builder Fee approval
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

    if (marginAmount < minMarginReq - 0.01) {
      toast({
        title: "Invalid Amount",
        description: `Minimum margin for ${leverage}x is $${minMarginReq.toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }

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
      if (!selectedMarket) {
        toast({ title: "No market selected", variant: "destructive" });
        return;
      }

      // 1. Prepare assets for Pearl
      const longAsset = {
        asset: selectedMarket.longAssets?.[0]?.asset || "",
        weight: 1.0,
      };
      const shortAsset = {
        asset: selectedMarket.shortAssets?.[0]?.asset || "",
        weight: 1.0,
      };

      // If we're SHORTing the view, we swap. Pear logic: Longs = Bought, Shorts = Sold
      // A standard "Long BTC/USDC" means Long BTC, Short USDC.
      // A standard "Short BTC/USDC" involves selling BTC. But in pair trading, it's relative.
      // For simplicity in this UI:
      // Direction LONG: Keep as is (Long Base, Short Quote)
      // Direction SHORT: Swap them (Long Quote, Short Base) - effectively shorting the ratio

      const finalLongs = direction === "LONG" ? [longAsset] : [shortAsset];
      const finalShorts = direction === "LONG" ? [shortAsset] : [longAsset];

      // Build TP/SL
      const takeProfit =
        tpEnabled && tpValue && parseFloat(tpValue) > 0
          ? { type: tpType, value: parseFloat(tpValue) }
          : undefined;

      const stopLoss =
        slEnabled && slValue && parseFloat(slValue) > 0
          ? { type: slType, value: parseFloat(slValue) }
          : undefined;

      // 2. Execute Trade via Pear
      // Note: In a real app we'd get the txn hash or position ID back
      await pearClient.createPosition({
        executionType: "MARKET",
        usdValue: marginAmount * leverage,
        leverage: leverage,
        longAssets: finalLongs,
        shortAssets: finalShorts,
        slippage: 0.1,
        takeProfit,
        stopLoss,
      });

      // 3. Create Post in Supabase
      const user = await db.users.getOrCreate(address);
      if (user) {
        // Calculate entry price (current mid price of the pair)
        const longAssetName = longAsset.asset;
        const shortAssetName = shortAsset.asset;
        const longPrice = prices[longAssetName] || 0;
        const shortPrice = prices[shortAssetName] || 1; // USDC ~ 1

        let entryPrice = 0;
        if (shortAssetName === "USDC" || shortAssetName === "USDT") {
          entryPrice = longPrice;
        } else {
          // Ratio price
          entryPrice = shortPrice > 0 ? longPrice / shortPrice : 0;
        }

        await db.posts.create({
          creator_id: user.id,
          pair: `${longAssetName}/${shortAssetName}`,
          direction: direction,
          entry_price: entryPrice,
          current_price: entryPrice, // Starts at entry
          leverage: leverage,
          size_usd: marginAmount * leverage,
          take_profit: takeProfit?.value,
          stop_loss: stopLoss?.value,
          thesis_text: thesisText,
          pnl_percentage: 0,
          pnl_usd: 0,
          is_open: true,
        });
      }

      toast({
        title: "Trade & Post Created!",
        description: "Your position is open and shared to the feed.",
        variant: "default",
      });

      onTradeCreated();
    } catch (err) {
      console.error("Trade failed:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Trade Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fillAmount = (percent: number) => {
    if (availableBalance > 0) {
      setAmount((availableBalance * percent).toFixed(2));
    }
  };

  const displayMinReq = minNotionalReq / basketEffectiveLeverage;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-mobile sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl animate-slide-up p-0 border-t sm:border border-border/50 shadow-2xl h-[95dvh] sm:h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-bold">New Trade</h2>
          <div className="flex items-center gap-2">
            {onSwitchToBasket && (
              <button
                onClick={onSwitchToBasket}
                className="text-xs font-bold bg-primary/10 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors"
                title="Switch to Basket Trading"
              >
                🧺 Basket Mode
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-secondary"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Pair Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block text-muted-foreground">
              Select Market
            </label>

            {/* Search Input */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search markets..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {filteredMarkets.map((m) => {
                const pair = `${m.longAssets?.[0]?.asset || ""}/${m.shortAssets?.[0]?.asset || ""}`;
                const isSelected =
                  selectedMarket &&
                  selectedMarket.longAssets?.[0]?.asset ===
                    m.longAssets?.[0]?.asset &&
                  selectedMarket.shortAssets?.[0]?.asset ===
                    m.shortAssets?.[0]?.asset;

                return (
                  <button
                    key={pair}
                    onClick={() => setSelectedMarket(m)}
                    className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-bold transition-all ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {pair}
                  </button>
                );
              })}
              {filteredMarkets.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">
                  No markets found
                </p>
              )}
            </div>
          </div>

          {/* Direction */}
          {/* Asset Swapper Direction Control */}
          <div className="bg-secondary/50 rounded-xl p-4 border border-border/50">
            <div className="flex items-center justify-between gap-4">
              {/* Asset A (Being Longed) */}
              <div className="flex flex-col items-center flex-1">
                <span className="text-xs font-bold text-success mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> LONG
                </span>
                <div className="w-full bg-card border border-success/30 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-lg shadow-success/5 tap-scale">
                  <span className="text-lg font-bold">
                    {direction === "LONG"
                      ? selectedMarket?.longAssets?.[0]?.asset || "A"
                      : selectedMarket?.shortAssets?.[0]?.asset || "B"}
                  </span>
                </div>
              </div>

              {/* Swap Button */}
              <button
                onClick={() =>
                  setDirection((prev) => (prev === "LONG" ? "SHORT" : "LONG"))
                }
                className="p-3 rounded-full bg-secondary border border-border hover:bg-primary/10 hover:border-primary/50 hover:text-primary transition-all tap-scale shadow-sm"
              >
                <ArrowRightLeft className="w-5 h-5" />
              </button>

              {/* Asset B (Being Shorted) */}
              <div className="flex flex-col items-center flex-1">
                <span className="text-xs font-bold text-destructive mb-2 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" /> SHORT
                </span>
                <div className="w-full bg-card border border-destructive/30 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-lg shadow-destructive/5 tap-scale">
                  <span className="text-lg font-bold">
                    {direction === "LONG"
                      ? selectedMarket?.shortAssets?.[0]?.asset || "B"
                      : selectedMarket?.longAssets?.[0]?.asset || "A"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Invest Amount</label>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Min: ${displayMinReq.toFixed(2)}
                </span>
                <div className="flex items-center gap-1">
                  <Wallet className="w-3 h-3" />
                  <span>
                    $
                    {availableBalance.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
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
                  className="flex-1 py-1.5 rounded-lg bg-secondary/50 text-xs font-medium hover:bg-secondary transition-colors"
                >
                  {pct * 100}%
                </button>
              ))}
            </div>
          </div>

          {/* Leverage */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium flex items-center gap-2">
                Leverage <Info className="w-3 h-3 text-muted-foreground" />
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

          {/* Thesis Input */}
          <div>
            <label className="text-sm font-medium mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Your Thesis
            </label>
            <textarea
              value={thesisText}
              onChange={(e) => setThesisText(e.target.value)}
              placeholder="Why are you taking this trade? (bullish/bearish thesis)..."
              className="w-full p-4 rounded-xl bg-secondary min-h-[100px] text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-medium placeholder:text-muted-foreground/50"
            />
          </div>

          {/* TP/SL Toggles (Optional UI simplification: keep them collapsed or simple) */}
          <div className="flex gap-4">
            <button
              onClick={() => setTpEnabled(!tpEnabled)}
              className={`flex-1 py-3 rounded-xl border-2 transition-all font-semibold text-sm ${
                tpEnabled
                  ? "border-success bg-success/10 text-success"
                  : "border-transparent bg-secondary text-muted-foreground"
              }`}
            >
              {tpEnabled ? "TP Active" : "+ Take Profit"}
            </button>
            <button
              onClick={() => setSlEnabled(!slEnabled)}
              className={`flex-1 py-3 rounded-xl border-2 transition-all font-semibold text-sm ${
                slEnabled
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-transparent bg-secondary text-muted-foreground"
              }`}
            >
              {slEnabled ? "SL Active" : "+ Stop Loss"}
            </button>
          </div>

          {(tpEnabled || slEnabled) && (
            <div className="grid grid-cols-2 gap-4">
              {tpEnabled && (
                <div>
                  <label className="text-xs font-medium text-success mb-1 block">
                    Take Profit (%)
                  </label>
                  <input
                    type="number"
                    value={tpValue}
                    onChange={(e) => setTpValue(e.target.value)}
                    placeholder="e.g. 20"
                    className="w-full px-3 py-2 rounded-lg bg-secondary text-sm focus:ring-2 focus:ring-success/50"
                  />
                </div>
              )}
              {slEnabled && (
                <div>
                  <label className="text-xs font-medium text-destructive mb-1 block">
                    Stop Loss (%)
                  </label>
                  <input
                    type="number"
                    value={slValue}
                    onChange={(e) => setSlValue(e.target.value)}
                    // Force percentage for simplicity here
                    placeholder="e.g. 10"
                    className="w-full px-3 py-2 rounded-lg bg-secondary text-sm focus:ring-2 focus:ring-destructive/50"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="p-4 pb-8 sm:pb-4 border-t border-border bg-card">
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
              className="w-full py-4 rounded-xl bg-secondary text-muted-foreground font-bold flex items-center justify-center gap-2"
            >
              <Loader2 className="w-5 h-5 animate-spin" /> Checking Access...
            </button>
          ) : !isTradingEnabled ? (
            <button
              onClick={handleEnableTrading}
              disabled={isEnabling}
              className="w-full py-4 rounded-xl border-2 border-primary text-primary font-bold text-lg hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
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
              className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-bold text-lg shadow-xl shadow-primary/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Zap className="w-5 h-5 fill-current" />
              )}
              {isLoading ? "Executing..." : "Post Trade"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
