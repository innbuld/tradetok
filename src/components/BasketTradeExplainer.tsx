// Basket Trade Explainer Component
// An educational overlay that explains what basket trading is before opening the modal

import { useState } from "react";
import {
  X,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Layers,
  PieChart,
  Sparkles,
} from "lucide-react";

interface BasketTradeExplainerProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
}

const FEATURES = [
  {
    icon: Layers,
    title: "Multi-Asset Positions",
    description: "Trade multiple assets simultaneously in a single position",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    icon: PieChart,
    title: "Custom Weights",
    description: "Control how much capital goes to each asset in your basket",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  {
    icon: ShieldCheck,
    title: "Diversified Risk",
    description: "Spread exposure across assets to reduce single-point failure",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
];

const EXAMPLE_BASKETS = [
  {
    name: "AI Basket",
    long: ["FET", "RENDER", "TAO"],
    short: ["USDC"],
    description: "Long on AI tokens",
  },
  {
    name: "L1 vs L2",
    long: ["ETH", "SOL"],
    short: ["ARB", "OP"],
    description: "Bet on L1s over L2s",
  },
  {
    name: "Meme vs Blue Chip",
    long: ["BTC", "ETH"],
    short: ["DOGE", "SHIB"],
    description: "Quality over hype",
  },
];

export function BasketTradeExplainer({
  isOpen,
  onClose,
  onContinue,
}: BasketTradeExplainerProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleContinue = () => {
    if (currentStep < 1) {
      setCurrentStep(1);
    } else {
      setCurrentStep(0);
      onContinue();
    }
  };

  const handleClose = () => {
    setCurrentStep(0);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-card rounded-3xl shadow-2xl animate-slide-up overflow-hidden border border-border">
        {/* Header with gradient */}
        <div className="relative bg-gradient-to-br from-primary/20 via-purple-500/10 to-pink-500/10 p-6 pb-8">
          {/* Decorative elements */}
          <div className="absolute top-4 right-4 w-20 h-20 bg-primary/10 rounded-full blur-2xl" />
          <div className="absolute bottom-0 left-1/2 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />

          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                <Sparkles className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Basket Trading</h2>
                <p className="text-sm text-muted-foreground">
                  Advanced multi-asset positions
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {currentStep === 0 ? (
            <>
              {/* What is it */}
              <div>
                <h3 className="text-lg font-bold mb-3">
                  What is Basket Trading?
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Instead of trading just one pair like{" "}
                  <span className="text-primary font-medium">BTC/USDC</span>,
                  basket trading lets you create positions with{" "}
                  <span className="text-primary font-medium">
                    multiple assets
                  </span>{" "}
                  on each side.
                </p>
              </div>

              {/* Visual Example */}
              <div className="bg-secondary/50 rounded-2xl p-4 border border-border/50">
                <p className="text-xs text-muted-foreground mb-3 font-medium">
                  EXAMPLE POSITION
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-success" />
                      <span className="text-xs font-bold text-success">
                        LONG
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {["BTC", "ETH", "SOL"].map((asset) => (
                        <span
                          key={asset}
                          className="px-2 py-1 rounded-lg bg-success/10 text-success text-xs font-bold"
                        >
                          {asset}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="px-4">
                    <span className="text-2xl text-muted-foreground">/</span>
                  </div>
                  <div className="flex-1 text-right">
                    <div className="flex items-center justify-end gap-2 mb-2">
                      <span className="text-xs font-bold text-destructive">
                        SHORT
                      </span>
                      <TrendingDown className="w-4 h-4 text-destructive" />
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {["DOGE", "SHIB"].map((asset) => (
                        <span
                          key={asset}
                          className="px-2 py-1 rounded-lg bg-destructive/10 text-destructive text-xs font-bold"
                        >
                          {asset}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-3">
                {FEATURES.map((feature, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 p-3 rounded-xl ${feature.bgColor}`}
                  >
                    <div
                      className={`p-2 rounded-lg bg-background/50 ${feature.color}`}
                    >
                      <feature.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{feature.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Popular Baskets */}
              <div>
                <h3 className="text-lg font-bold mb-3">Popular Basket Ideas</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Get inspired by these common basket strategies:
                </p>
              </div>

              <div className="space-y-3">
                {EXAMPLE_BASKETS.map((basket, idx) => (
                  <div
                    key={idx}
                    className="bg-secondary/50 rounded-xl p-4 border border-border/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold">{basket.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {basket.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-success font-medium">
                        Long: {basket.long.join(" + ")}
                      </span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-destructive font-medium">
                        Short: {basket.short.join(" + ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pro tip */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                <p className="text-sm">
                  <span className="text-amber-400 font-bold">💡 Pro Tip:</span>
                  <span className="text-muted-foreground ml-2">
                    Start with 2-3 assets per side. More assets = more
                    complexity!
                  </span>
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-0">
          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-4">
            {[0, 1].map((step) => (
              <button
                key={step}
                onClick={() => setCurrentStep(step)}
                className={`w-2 h-2 rounded-full transition-all ${
                  currentStep === step
                    ? "w-6 bg-primary"
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleContinue}
            className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold text-lg shadow-lg shadow-primary/20 flex items-center justify-center gap-2 tap-scale hover:bg-primary/90 transition-colors"
          >
            {currentStep < 1 ? (
              <>
                Next
                <ArrowRight className="w-5 h-5" />
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Create Basket Trade
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
