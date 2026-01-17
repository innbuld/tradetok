import { useState, useEffect } from "react";
import {
  X,
  Zap,
  Loader2,
  Wallet,
  Info,
  ShieldCheck,
  AlertCircle,
  Plus,
  Trash2,
  Search,
  MessageSquare,
} from "lucide-react";
import { db } from "@/lib/db";
import { usePearAuthContext } from "@/contexts/PearAuthContext";
import { pearClient } from "@/lib/pearClient";
import { hyperliquidClient, type AssetMeta } from "@/lib/hyperliquidClient";
import { useAccount, useSignTypedData } from "wagmi";
import { useToast } from "@/hooks/use-toast";

const PEAR_BUILDER_ADDRESS = "0xA47D4d99191db54A4829cdf3de2417E527c3b042";
const HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/exchange";
const HYPERLIQUID_CHAIN_ID = 42161;
const LEG_MIN_NOTIONAL = 10;

interface AssetWeight {
  asset: string;
  weight: number; // 0-100
}

interface BasketTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BasketTradeModal({ isOpen, onClose }: BasketTradeModalProps) {
  const { isAuthenticated, agentWallet } = usePearAuthContext();
  const { address } = useAccount();
  const { toast } = useToast();
  const { signTypedDataAsync } = useSignTypedData();

  // Basket State
  const [longAssets, setLongAssets] = useState<AssetWeight[]>([]);
  const [shortAssets, setShortAssets] = useState<AssetWeight[]>([]);

  // Trade Params
  const [amount, setAmount] = useState("");
  const [leverage, setLeverage] = useState(1);

  // App State
  const [isLoading, setIsLoading] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [availableBalance, setAvailableBalance] = useState<number>(0);
  const [isTradingEnabled, setIsTradingEnabled] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  // Market Data
  const [minNotionalReq, setMinNotionalReq] =
    useState<number>(LEG_MIN_NOTIONAL);
  const [effectiveMaxLeverage, setEffectiveMaxLeverage] = useState<number>(40);
  const [basketEffectiveLeverage, setBasketEffectiveLeverage] =
    useState<number>(1);
  const [meta, setMeta] = useState<AssetMeta[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});

  // Selector State
  const [isSelectingFor, setIsSelectingFor] = useState<"LONG" | "SHORT" | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Additional Fields
  const [thesis, setThesis] = useState("");
  const [takeProfit, setTakeProfit] = useState(""); // Percentage
  const [stopLoss, setStopLoss] = useState(""); // Percentage
  const [tpEnabled, setTpEnabled] = useState(false);
  const [slEnabled, setSlEnabled] = useState(false);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      if (address) {
        setAmount("");
        setLeverage(1);
        setLongAssets([]);
        setShortAssets([]);
        fetchBalance();
        checkTradingStatus();
        fetchMarketData();
      }
    }
  }, [isOpen, address]);

  // Calculations
  useEffect(() => {
    if (meta.length === 0 || Object.keys(prices).length === 0) return;
    calculateMinNotional();
  }, [longAssets, shortAssets, meta, prices, leverage]);

  const isStable = (asset: string) =>
    ["USDC", "USDT", "DAI"].includes(asset?.toUpperCase());

  const calculateMinNotional = () => {
    const hasLongs = longAssets.length > 0;
    const hasShorts = shortAssets.length > 0;

    if (!hasLongs && !hasShorts) {
      setMinNotionalReq(LEG_MIN_NOTIONAL);
      setEffectiveMaxLeverage(40);
      return;
    }

    // Allow slider to go up to 40x (Pear Default)
    // We don't cap global leverage by the lowest asset anymore.
    // Instead, we respect individual caps during margin calculation.
    setEffectiveMaxLeverage(40);

    // Side factor: if both sides, capital is split 50/50
    const sideFactor = hasLongs && hasShorts ? 0.5 : 1.0;
    let globalRequiredMin = 0;

    const processSide = (assets: AssetWeight[]) => {
      if (assets.length === 0) return;
      const totalWeight = assets.reduce((sum, a) => sum + (a.weight || 0), 0);

      assets.forEach((item) => {
        if (isStable(item.asset)) return;

        const assetMeta = meta.find((m) => m.name === item.asset);
        const price = prices[item.asset];

        if (assetMeta && price) {
          // Get the EFFECTIVE leverage for this asset (capped by its max)
          const assetMaxLev = assetMeta.maxLeverage || 40;
          // We use the effective leverage to determine margin requirements
          const effectiveLev = Math.min(leverage, assetMaxLev);

          // 1. Technical Min based on size decimals
          const minUnitSize = Math.pow(10, -assetMeta.szDecimals);
          const minTechnicalNotional = minUnitSize * price;

          // 2. Protocol Min ($10 per leg)
          const minLegNotional = Math.max(
            minTechnicalNotional,
            LEG_MIN_NOTIONAL,
          );

          // 3. Weight Fraction
          const weightFraction =
            totalWeight > 0 ? item.weight / totalWeight : 1 / assets.length;

          // 4. Effective Global Weight
          const effectiveGlobalWeight = weightFraction * sideFactor;

          if (effectiveGlobalWeight > 0) {
            // The required total is affected by the asset's effective leverage
            const reqTotal = minLegNotional / effectiveGlobalWeight;
            if (reqTotal > globalRequiredMin) globalRequiredMin = reqTotal;
          }
        }
      });
    };

    processSide(longAssets);
    processSide(shortAssets);

    setMinNotionalReq(globalRequiredMin);

    // Calculate Effective Basket Leverage (Harmonic Mean)
    const allAssets = [...longAssets, ...shortAssets];
    const totalW = allAssets.reduce((s, a) => s + (a.weight || 0), 0);

    if (totalW === 0) {
      setEffectiveMaxLeverage(40); // Default if no assets
      return;
    }

    let sumInverseLev = 0;

    allAssets.forEach((item) => {
      if (isStable(item.asset)) return;
      const assetMeta = meta.find((m) => m.name === item.asset);
      // Default to slider leverage if meta not found, or asset max if strict
      const assetMax = assetMeta?.maxLeverage || 40;
      const actualAssetLev = Math.min(leverage, assetMax);

      // Normalize weight to 1.0 total for this calc
      const w = (item.weight || 0) / totalW;
      sumInverseLev += w / actualAssetLev;
    });

    // If stablecoins take up weight, they have effectively 1x leverage (no lev),
    // but usually we trade perp vs perp. Assuming perp-only basket for leverage calc:
    // If sumInverseLev is 0 (all stables?), avoid Infinity.
    const effectiveBasketLev = sumInverseLev > 0 ? 1 / sumInverseLev : leverage;

    // We update a state or simply use this for validation?
    // Better to store it so UI can use it.
    // Re-using 'effectiveMaxLeverage' variable name is confusing since that was for the slider cap.
    // Let's create a new Ref or State, or just update the variable used for Min Margin display.
    // For now, I will repurpose setEffectiveMaxLeverage to store this ACTUAL effective leverage
    // used for margin calc, OR I can just save it to a new state.
    // Actually, existing code uses `effectiveMaxLeverage` for the slider max/warning.
    // Since I removed the slider cap, `effectiveMaxLeverage` is 40.

    // Let's introduce a new state variable `basketEffectiveLeverage`
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

  const handleCreate = async () => {
    if (!isAuthenticated || !agentWallet) return;
    const val = parseFloat(amount);
    if (!val || val <= 0) return;

    // Check min size
    if (val < minNotionalReq / leverage - 0.01) {
      toast({
        title: "Amount Too Small",
        description: `Minimum required is $${(minNotionalReq / leverage).toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }

    if (val > availableBalance) {
      toast({
        title: "Insufficient Balance",
        description: `You have $${availableBalance.toFixed(2)} available.`,
        variant: "destructive",
      });
      return;
    }

    if (longAssets.length === 0 && shortAssets.length === 0) {
      toast({
        title: "Empty Basket",
        description: "Add at least one asset.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Pear Protocol expects ALL weights (long + short combined) to sum to 1.0
      // Our UI shows weights per side, so we need to normalize globally

      const allAssets = [...longAssets, ...shortAssets];
      const totalWeight = allAssets.reduce((sum, a) => sum + a.weight, 0);

      // Normalize so total across all assets = 1.0
      const normalizeGlobal = (assets: AssetWeight[]) => {
        if (totalWeight === 0) return [];
        return assets.map((a) => ({
          asset: a.asset,
          weight: a.weight / totalWeight,
        }));
      };

      let finalLongs = normalizeGlobal(longAssets);
      let finalShorts = normalizeGlobal(shortAssets);

      // Handle single-side baskets by adding USDT with 50% allocation
      if (longAssets.length === 0 && shortAssets.length > 0) {
        const shortTotal = shortAssets.reduce((s, a) => s + a.weight, 0);
        finalLongs = [{ asset: "USDT", weight: 0.5 }];
        finalShorts = shortAssets.map((a) => ({
          asset: a.asset,
          weight: (a.weight / shortTotal) * 0.5,
        }));
      }

      if (shortAssets.length === 0 && longAssets.length > 0) {
        const longTotal = longAssets.reduce((s, a) => s + a.weight, 0);
        finalShorts = [{ asset: "USDT", weight: 0.5 }];
        finalLongs = longAssets.map((a) => ({
          asset: a.asset,
          weight: (a.weight / longTotal) * 0.5,
        }));
      }

      console.log("Submitting basket trade:", {
        longAssets: finalLongs,
        shortAssets: finalShorts,
        usdValue: Math.floor(val * leverage),
        leverage,
        takeProfit:
          tpEnabled && takeProfit
            ? { type: "PERCENTAGE", value: parseFloat(takeProfit) }
            : undefined,
        stopLoss:
          slEnabled && stopLoss
            ? { type: "PERCENTAGE", value: parseFloat(stopLoss) }
            : undefined,
        totalWeight:
          finalLongs.reduce((s, a) => s + a.weight, 0) +
          finalShorts.reduce((s, a) => s + a.weight, 0),
      });

      // Execute Trade
      await pearClient.createPosition({
        executionType: "MARKET",
        usdValue: Math.floor(val * leverage),
        leverage: leverage,
        longAssets: finalLongs,
        shortAssets: finalShorts,
        slippage: 0.001,
        takeProfit:
          tpEnabled && takeProfit
            ? { type: "PERCENTAGE", value: parseFloat(takeProfit) }
            : undefined,
        stopLoss:
          slEnabled && stopLoss
            ? { type: "PERCENTAGE", value: parseFloat(stopLoss) }
            : undefined,
      });

      // Create Post in Supabase
      const user = await db.users.getOrCreate(address);
      if (user) {
        // Construct pair string: "BTC+ETH/USDC"
        const longStr = longAssets.map((a) => a.asset).join("+") || "USDC";
        const shortStr = shortAssets.map((a) => a.asset).join("+") || "USDC";
        const pairStr = `${longStr}/${shortStr}`;

        await db.posts.create({
          creator_id: user.id,
          pair: pairStr,
          direction: "LONG", // Baskets are always treated as "Buy" of the structure
          entry_price: 1.0, // Arbitrary for baskets
          current_price: 1.0,
          leverage: leverage,
          size_usd: val * leverage,
          take_profit: tpEnabled && takeProfit ? parseFloat(takeProfit) : null,
          stop_loss: slEnabled && stopLoss ? parseFloat(stopLoss) : null,
          thesis_text: thesis,
          pnl_percentage: 0,
          pnl_usd: 0,
          is_open: true,
          long_assets: longAssets as any,
          short_assets: shortAssets as any,
        });
      }

      toast({
        title: "Basket Created!",
        description: "Position opened and shared to feed.",
      });
      onClose();
    } catch (err) {
      console.error(err);
      toast({
        title: "Trade Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to re-distribute weights equally
  const redistribute = (items: AssetWeight[], targetTotal: number) => {
    if (items.length === 0) return [];
    const split = parseFloat((targetTotal / items.length).toFixed(2));
    // Handle rounding diff on last item
    const remainder = targetTotal - split * (items.length - 1);

    return items.map((item, idx) => ({
      ...item,
      weight:
        idx === items.length - 1 ? parseFloat(remainder.toFixed(2)) : split,
    }));
  };

  const addAsset = (asset: string) => {
    let newLongs = [...longAssets];
    let newShorts = [...shortAssets];

    if (isSelectingFor === "LONG") {
      if (!newLongs.find((a) => a.asset === asset)) {
        newLongs.push({ asset, weight: 0 }); // Weight will be fixed by redistribute
      }
    } else {
      if (!newShorts.find((a) => a.asset === asset)) {
        newShorts.push({ asset, weight: 0 });
      }
    }

    // Determine target weights
    const hasLongs = newLongs.length > 0;
    const hasShorts = newShorts.length > 0;

    // If we have both sides, each side gets 50%. If only one, it gets 100%.
    const longTarget = hasShorts ? 50 : 100;
    const shortTarget = hasLongs ? 50 : 100;

    if (hasLongs) setLongAssets(redistribute(newLongs, longTarget));
    if (hasShorts) setShortAssets(redistribute(newShorts, shortTarget));

    setIsSelectingFor(null);
    setSearchQuery("");
  };

  const removeAsset = (side: "LONG" | "SHORT", asset: string) => {
    let newLongs = [...longAssets];
    let newShorts = [...shortAssets];

    if (side === "LONG") {
      newLongs = newLongs.filter((a) => a.asset !== asset);
    } else {
      newShorts = newShorts.filter((a) => a.asset !== asset);
    }

    // Determine target weights
    const hasLongs = newLongs.length > 0;
    const hasShorts = newShorts.length > 0;

    // If we have both sides, each side gets 50%. If only one, it gets 100%.
    const longTarget = hasShorts ? 50 : 100;
    const shortTarget = hasLongs ? 50 : 100;

    if (hasLongs) setLongAssets(redistribute(newLongs, longTarget));
    else setLongAssets([]); // Explicit clear

    if (hasShorts) setShortAssets(redistribute(newShorts, shortTarget));
    else setShortAssets([]); // Explicit clear
  };

  const updateWeight = (
    side: "LONG" | "SHORT",
    asset: string,
    weight: number,
  ) => {
    if (side === "LONG") {
      setLongAssets(
        longAssets.map((a) => (a.asset === asset ? { ...a, weight } : a)),
      );
    } else {
      setShortAssets(
        shortAssets.map((a) => (a.asset === asset ? { ...a, weight } : a)),
      );
    }
  };

  // Filter assets for search
  const filteredAssets = meta
    .filter((a) => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice(0, 50); // Limit results

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      {/* Search Modal Overlay */}
      {isSelectingFor && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl border border-border flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Search className="w-5 h-5 text-muted-foreground" />
              <input
                autoFocus
                placeholder="Search assets..."
                className="flex-1 bg-transparent border-none outline-none text-lg"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button onClick={() => setIsSelectingFor(null)} className="p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredAssets.map((asset) => (
                <button
                  key={asset.name}
                  onClick={() => addAsset(asset.name)}
                  className="w-full text-left px-4 py-3 hover:bg-secondary rounded-lg font-medium transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={`https://assets.coincap.io/assets/icons/${asset.name.toLowerCase()}@2x.png`}
                      onError={(e) => {
                        e.currentTarget.src = `https://ui-avatars.com/api/?name=${asset.name}&background=random&color=fff&size=32`;
                      }}
                      alt={asset.name}
                      className="w-6 h-6 rounded-full"
                    />
                    <span>{asset.name}</span>
                  </div>
                  {prices[asset.name] && (
                    <span className="text-sm text-muted-foreground">
                      ${prices[asset.name].toFixed(2)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Modal */}
      <div className="w-full max-w-md bg-card rounded-3xl shadow-2xl border border-border/50 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-xl font-bold">Create Basket</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Longs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-success flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success" /> LONG ASSETS
              </h3>
              <button
                onClick={() => setIsSelectingFor("LONG")}
                className="text-xs font-semibold px-2 py-1 rounded bg-secondary hover:bg-secondary/80 text-primary transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>

            {longAssets.length === 0 ? (
              <div className="text-center py-4 border-2 border-dashed border-border/50 rounded-xl text-sm text-muted-foreground bg-secondary/10">
                No long assets selected
              </div>
            ) : (
              <div className="space-y-2">
                {longAssets.map((item) => (
                  <div
                    key={item.asset}
                    className="flex items-center gap-2 p-2 bg-secondary/30 rounded-xl border border-border/50"
                  >
                    <div className="flex items-center gap-2 w-24">
                      <img
                        src={`https://assets.coincap.io/assets/icons/${item.asset.toLowerCase()}@2x.png`}
                        onError={(e) => {
                          e.currentTarget.src = `https://ui-avatars.com/api/?name=${item.asset}&background=random&color=fff&size=32`;
                        }}
                        alt={item.asset}
                        className="w-6 h-6 rounded-full bg-secondary"
                      />
                      <span className="font-bold">{item.asset}</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={item.weight}
                        onChange={(e) =>
                          updateWeight(
                            "LONG",
                            item.asset,
                            parseInt(e.target.value),
                          )
                        }
                        className="flex-1 h-1.5 bg-secondary rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                      />
                      <span className="text-xs font-mono w-8 text-right">
                        {item.weight}%
                      </span>
                    </div>
                    <button
                      onClick={() => removeAsset("LONG", item.asset)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr className="border-border/50" />

          {/* Shorts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-destructive flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-destructive" /> SHORT
                ASSETS
              </h3>
              <button
                onClick={() => setIsSelectingFor("SHORT")}
                className="text-xs font-semibold px-2 py-1 rounded bg-secondary hover:bg-secondary/80 text-primary transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>

            {shortAssets.length === 0 ? (
              <div className="text-center py-4 border-2 border-dashed border-border/50 rounded-xl text-sm text-muted-foreground bg-secondary/10">
                No short assets selected
              </div>
            ) : (
              <div className="space-y-2">
                {shortAssets.map((item) => (
                  <div
                    key={item.asset}
                    className="flex items-center gap-2 p-2 bg-secondary/30 rounded-xl border border-border/50"
                  >
                    <div className="flex items-center gap-2 w-24">
                      <img
                        src={`https://assets.coincap.io/assets/icons/${item.asset.toLowerCase()}@2x.png`}
                        onError={(e) => {
                          e.currentTarget.src = `https://ui-avatars.com/api/?name=${item.asset}&background=random&color=fff&size=32`;
                        }}
                        alt={item.asset}
                        className="w-6 h-6 rounded-full bg-secondary"
                      />
                      <span className="font-bold">{item.asset}</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={item.weight}
                        onChange={(e) =>
                          updateWeight(
                            "SHORT",
                            item.asset,
                            parseInt(e.target.value),
                          )
                        }
                        className="flex-1 h-1.5 bg-secondary rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-destructive"
                      />
                      <span className="text-xs font-mono w-8 text-right">
                        {item.weight}%
                      </span>
                    </div>
                    <button
                      onClick={() => removeAsset("SHORT", item.asset)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr className="border-border/50" />

          {/* Config */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Amount (USDC)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-4 py-2.5 rounded-xl bg-secondary font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> ${availableBalance.toFixed(2)}
                </div>
                {minNotionalReq && (
                  <span className="text-primary font-medium">
                    Min: $
                    {(minNotionalReq / basketEffectiveLeverage).toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Leverage
                </label>
                <span className="text-sm font-bold text-primary">
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
          </div>

          <hr className="border-border/50 my-4" />

          {/* Thesis & Risk */}
          <div className="space-y-4">
            {/* Thesis Input */}
            <div>
              <label className="text-sm font-medium mb-2 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Your Thesis
              </label>
              <textarea
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                placeholder="Why are you opening this basket trade? (bullish/bearish thesis)..."
                className="w-full p-4 rounded-xl bg-secondary min-h-[100px] text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-medium placeholder:text-muted-foreground/50"
              />
            </div>

            {/* TP/SL Toggles */}
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
                      value={takeProfit}
                      onChange={(e) => setTakeProfit(e.target.value)}
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
                      value={stopLoss}
                      onChange={(e) => setStopLoss(e.target.value)}
                      placeholder="e.g. 10"
                      className="w-full px-3 py-2 rounded-lg bg-secondary text-sm focus:ring-2 focus:ring-destructive/50"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 pt-0">
          {!isAuthenticated ? (
            <button
              disabled
              className="w-full py-4 rounded-xl bg-secondary text-muted-foreground font-bold"
            >
              Connect Wallet
            </button>
          ) : isCheckingStatus ? (
            <button
              disabled
              className="w-full py-4 rounded-xl bg-secondary text-muted-foreground font-bold flex items-center justify-center gap-2"
            >
              <Loader2 className="w-4 h-4 animate-spin" /> Checking...
            </button>
          ) : !isTradingEnabled ? (
            <button
              onClick={handleEnableTrading}
              disabled={isEnabling}
              className="w-full py-4 rounded-xl border-2 border-primary text-primary font-bold flex items-center justify-center gap-2"
            >
              {isEnabling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              Enable Trading
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={
                isLoading ||
                !amount ||
                parseFloat(amount) < minNotionalReq / leverage - 0.01
              }
              className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-bold text-lg tap-scale shadow-xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Zap className="w-5 h-5 fill-current" />
              )}
              Execute Basket
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
