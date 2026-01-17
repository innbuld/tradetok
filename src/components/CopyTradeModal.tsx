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
import { useState } from "react";
import type { Trade } from "@/data/mockData";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { pearClient } from "@/lib/pearClient";
import { PEAR_CONFIG } from "@/lib/pearConfig";
import { usePearAuthContext } from "@/contexts/PearAuthContext";
import { AgentWalletSetupModal } from "@/components/AgentWalletSetupModal";
import type { CreatePositionRequest, TPSLThreshold } from "@/types/pear";
import { useToast } from "@/hooks/use-toast";

interface CopyTradeModalProps {
  trade: Trade;
  isOpen: boolean;
  onClose: () => void;
}

const amounts = [100, 500, 1000];

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

  const [selectedAmount, setSelectedAmount] = useState<number | "custom">(500);
  const [customAmount, setCustomAmount] = useState("");
  const [riskAdjustment, setRiskAdjustment] = useState([50]);
  const [stopLossEnabled, setStopLossEnabled] = useState(true);
  const [stopLoss, setStopLoss] = useState("5");
  const [takeProfitEnabled, setTakeProfitEnabled] = useState(true);
  const [takeProfit, setTakeProfit] = useState("15");
  const [leverage, setLeverage] = useState(5);
  const [executionStatus, setExecutionStatus] =
    useState<ExecutionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [showAgentSetup, setShowAgentSetup] = useState(false);

  const actualAmount =
    selectedAmount === "custom" ? Number(customAmount) || 0 : selectedAmount;
  const estimatedFee = (actualAmount * 0.001).toFixed(2);

  // Adjust leverage based on risk slider (50 = match exactly, 0 = 50% less)
  const adjustedLeverage = Math.max(
    1,
    Math.round(leverage * (riskAdjustment[0] / 50)),
  );

  // Parse pair to get long and short assets
  const parsePair = (
    pair: string,
  ): { longAsset: string; shortAsset: string } => {
    // Handle pairs like "SOL/USDT", "ETH/BTC", etc.
    const [asset1, asset2] = pair.split("/");

    if (trade.direction === "LONG") {
      return { longAsset: asset1, shortAsset: asset2 };
    } else {
      return { longAsset: asset2, shortAsset: asset1 };
    }
  };

  const handleExecute = async () => {
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

    // Validate amount
    if (actualAmount < PEAR_CONFIG.MIN_TRADE_SIZE * 2) {
      toast({
        title: "Amount Too Low",
        description: `Minimum trade size is $${PEAR_CONFIG.MIN_TRADE_SIZE * 2}`,
        variant: "destructive",
      });
      return;
    }

    setExecutionStatus("confirming");
    setErrorMessage(null);

    try {
      const { longAsset, shortAsset } = parsePair(trade.pair);

      // Build stop loss config
      const stopLossConfig: TPSLThreshold | undefined = stopLossEnabled
        ? { type: "PERCENTAGE", value: parseFloat(stopLoss) }
        : undefined;

      // Build take profit config
      const takeProfitConfig: TPSLThreshold | undefined = takeProfitEnabled
        ? { type: "PERCENTAGE", value: parseFloat(takeProfit) }
        : undefined;

      // Build position request
      const request: CreatePositionRequest = {
        executionType: "MARKET",
        leverage: adjustedLeverage,
        usdValue: actualAmount,
        slippage: PEAR_CONFIG.DEFAULT_SLIPPAGE,
        longAssets: [{ asset: longAsset, weight: 1 }],
        shortAssets: [{ asset: shortAsset, weight: 1 }],
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
      setErrorMessage(message);
      setExecutionStatus("error");

      toast({
        title: "Execution Failed",
        description: message,
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
                <label className="block text-sm font-medium text-muted-foreground mb-3">
                  Investment Amount
                </label>
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
                  <label className="text-sm font-medium text-muted-foreground">
                    Leverage
                  </label>
                  <span className="text-sm font-bold text-primary">
                    {adjustedLeverage}x
                  </span>
                </div>
                <Slider
                  value={[leverage]}
                  onValueChange={(v) => setLeverage(v[0])}
                  min={1}
                  max={20}
                  step={1}
                  className="mb-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1x (Safe)</span>
                  <span>20x (Risky)</span>
                </div>
              </div>

              {/* Risk Adjustment */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-muted-foreground mb-3">
                  Risk Adjustment
                </label>
                <Slider
                  value={riskAdjustment}
                  onValueChange={setRiskAdjustment}
                  max={100}
                  step={10}
                  className="mb-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>50% less risky</span>
                  <span className="text-primary font-medium">
                    {riskAdjustment[0] === 50
                      ? "Match exactly"
                      : `${100 - riskAdjustment[0]}% less risky`}
                  </span>
                  <span>Match exactly</span>
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
                onClick={handleExecute}
                disabled={actualAmount <= 0 || !isAuthenticated}
                className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-bold text-lg tap-scale disabled:opacity-50 disabled:pointer-events-none mb-3"
              >
                {isAuthenticated && !agentWallet
                  ? "Setup Wallet"
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
