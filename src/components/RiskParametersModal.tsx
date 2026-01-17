import { useState } from "react";
import { X, TrendingUp, TrendingDown, Loader2, Save } from "lucide-react";
import type { OpenPosition, TPSLType, TPSLThreshold } from "@/types/pear";
import { pearClient } from "@/lib/pearClient";
import { useToast } from "@/hooks/use-toast";

interface RiskParametersModalProps {
  position: OpenPosition | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RiskParametersModal({
  position,
  isOpen,
  onClose,
  onSuccess,
}: RiskParametersModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // TP State
  const [tpEnabled, setTpEnabled] = useState(!!position?.takeProfit);
  const [tpType, setTpType] = useState<TPSLType>(
    position?.takeProfit?.type || "PERCENTAGE",
  );
  const [tpValue, setTpValue] = useState(
    position?.takeProfit?.value?.toString() || "",
  );

  // SL State
  const [slEnabled, setSlEnabled] = useState(!!position?.stopLoss);
  const [slType, setSlType] = useState<TPSLType>(
    position?.stopLoss?.type || "PERCENTAGE",
  );
  const [slValue, setSlValue] = useState(
    position?.stopLoss?.value?.toString() || "",
  );

  const handleSave = async () => {
    if (!position) return;

    setIsLoading(true);

    try {
      const takeProfit: TPSLThreshold | null =
        tpEnabled && tpValue && parseFloat(tpValue) > 0
          ? { type: tpType, value: parseFloat(tpValue) }
          : null;

      const stopLoss: TPSLThreshold | null =
        slEnabled && slValue && parseFloat(slValue) > 0
          ? { type: slType, value: parseFloat(slValue) }
          : null;

      await pearClient.updateRiskParameters(
        position.positionId,
        stopLoss,
        takeProfit,
      );

      toast({
        title: "Risk Parameters Updated",
        description: "TP/SL settings have been saved successfully",
      });

      onSuccess();
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update parameters";
      toast({
        title: "Update Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !position) return null;

  const longAsset = position.longAssets[0]?.coin ?? "UNKNOWN";
  const shortAsset = position.shortAssets[0]?.coin ?? "USDT";
  const pair = `${longAsset}/${shortAsset}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-mobile sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl animate-slide-up p-6 border-t sm:border border-border/50 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-muted sm:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between mb-6 mt-2">
          <div>
            <h2 className="text-2xl font-bold mb-1">Risk Parameters</h2>
            <p className="text-sm text-muted-foreground">{pair}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-secondary tap-scale hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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

          {/* Info Box */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
            <p className="text-xs text-muted-foreground">
              <strong className="text-primary">Percentage:</strong> %
              profit/loss vs entry
              <br />
              <strong className="text-primary">Dollar:</strong> Fixed USD
              profit/loss amount
              <br />
              <strong className="text-primary">Position Value:</strong> % change
              of position value
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-3 rounded-xl bg-secondary text-foreground font-medium tap-scale disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="flex-1 py-3 rounded-xl gradient-primary text-primary-foreground font-bold tap-scale shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
