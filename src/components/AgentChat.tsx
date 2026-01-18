// AI Trading Agent Chat Component
// A gorgeous chat interface for intent-based trading with Gemini LLM

import { useState, useRef, useEffect } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { useToast } from "@/hooks/use-toast";
import { hyperliquidClient } from "@/lib/hyperliquidClient";
import {
  Bot,
  Send,
  Loader2,
  TrendingUp,
  TrendingDown,
  Users,
  Sparkles,
  Check,
  X,
  Zap,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  AlertCircle,
  Brain,
  Wallet,
  DollarSign,
  Lock,
  PieChart,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { usePearAuthContext } from "@/contexts/PearAuthContext";
import {
  tradingAgent,
  type AgentAnalysis,
  type ChatContext,
  type AgentRichData,
  type BalanceData,
  type PortfolioData,
  type MarketData,
} from "@/lib/agent";
import { Button } from "@/components/ui/button";
import { AgentWalletSetupModal } from "@/components/AgentWalletSetupModal";

const PEAR_BUILDER_ADDRESS = "0xA47D4d99191db54A4829cdf3de2417E527c3b042";
const HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/exchange";
const HYPERLIQUID_CHAIN_ID = 42161;

interface ChatMessage {
  id: string;
  type: "user" | "agent" | "analysis" | "execution" | "error" | "richData";
  content: string;
  timestamp: Date;
  analysis?: AgentAnalysis;
  richData?: AgentRichData;
  isExecuting?: boolean;
  executionResult?: {
    success: boolean;
    orderId?: string;
    error?: string;
  };
}

interface AgentChatProps {
  onClose?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function AgentChat({
  onClose,
  isExpanded = true,
  onToggleExpand,
}: AgentChatProps) {
  const { isAuthenticated, agentWallet } = usePearAuthContext();
  const { address } = useAccount(); // Get wallet address for data fetching

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      type: "agent",
      content:
        "Hey! I'm your AI trading assistant. Tell me what you want to trade, or use the quick actions below.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<AgentAnalysis | null>(
    null,
  );
  const [showAgentSetup, setShowAgentSetup] = useState(false);
  const [isLLMAvailable, setIsLLMAvailable] = useState(false);

  // Trading Access State
  const [isTradingEnabled, setIsTradingEnabled] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const { signTypedDataAsync } = useSignTypedData();
  const { toast } = useToast();

  // Check LLM availability on mount
  useEffect(() => {
    setIsLLMAvailable(tradingAgent.isLLMAvailable());
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Smart auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 150; // Increased threshold

      if (isNearBottom || messages.length <= 1) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages, pendingAnalysis, isProcessing, isTradingEnabled]);

  // Check trading status (Builder Fee Approval)
  useEffect(() => {
    const checkStatus = async () => {
      if (!address || !isAuthenticated) return;
      setIsCheckingStatus(true);
      try {
        // If no agent wallet, definitely not enabled
        if (!agentWallet) {
          setIsTradingEnabled(false);
          return;
        }

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
    checkStatus();
  }, [address, isAuthenticated, agentWallet]);

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

      // 1. Approve Agent (Idempotent - harmless if already done, ensures freshness)
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

      // Ensure separate nonces
      const nonce2 = now + 1;

      const builderMessage = {
        hyperliquidChain: "Mainnet",
        maxFeeRate: "0.06%",
        builder: PEAR_BUILDER_ADDRESS as `0x${string}`,
        nonce: BigInt(nonce2),
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
          nonce: nonce2,
        },
        nonce: nonce2,
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
        description: "You can now trade with the AI agent.",
      });
      setIsTradingEnabled(true);

      // Auto-execute pending if it exists
      if (pendingAnalysis) {
        // Could auto-trigger execute here or let user click confirm
      }
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

  // Generate unique message ID
  const generateId = () =>
    `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Add message helper
  const addMessage = (message: Omit<ChatMessage, "id" | "timestamp">) => {
    setMessages((prev) => [
      ...prev,
      { ...message, id: generateId(), timestamp: new Date() },
    ]);
  };

  // Handle command submission
  const handleSubmit = async (commandText?: string) => {
    const text = commandText || input.trim();
    if (!text || isProcessing) return;

    // Check auth
    if (!isAuthenticated) {
      addMessage({
        type: "error",
        content: "Please connect your wallet first to use the AI agent.",
      });
      return;
    }

    if (!agentWallet) {
      addMessage({
        type: "error",
        content:
          "You need to set up your agent wallet before trading. Tap below to set up.",
      });
      setShowAgentSetup(true);
      return;
    }

    // Add user message
    addMessage({ type: "user", content: text });
    setInput("");
    setIsProcessing(true);

    try {
      // Build context for LLM
      const context: ChatContext = {
        currentScreen: "feed",
        userBalance: undefined,
      };

      // Use LLM-powered processing with wallet address for data fetching
      const result = await tradingAgent.processCommandWithLLM(
        text,
        context,
        address, // Pass address so agent can fetch balance/portfolio
      );

      if (result.error) {
        addMessage({ type: "error", content: result.error });
      } else if (result.richData) {
        // Rich data response (balance, portfolio, market)
        addMessage({
          type: "richData",
          content: "",
          richData: result.richData,
        });
      } else if (result.llmResponse && !result.analysis) {
        // LLM-only response (help, explain, etc.)
        addMessage({ type: "agent", content: result.llmResponse });
      } else if (result.analysis) {
        // Show analysis for confirmation
        setPendingAnalysis(result.analysis);

        // Add LLM's friendly response first if available
        if (result.llmResponse) {
          addMessage({ type: "agent", content: result.llmResponse });
        }

        addMessage({
          type: "analysis",
          content: formatAnalysisMessage(result.analysis),
          analysis: result.analysis,
        });
      }
    } catch (err) {
      addMessage({
        type: "error",
        content:
          err instanceof Error
            ? err.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Format analysis into readable message
  const formatAnalysisMessage = (analysis: AgentAnalysis): string => {
    const lines: string[] = [];

    if (analysis.strategy === "COPY_TOP_TRADER" && analysis.trader) {
      lines.push(`📋 Copying @${analysis.trader.username}'s trade`);
      lines.push(`Win Rate: ${analysis.trader.winRate}%`);
    } else {
      lines.push(`Found: ${analysis.asset}`);
      if (analysis.change24h) lines.push(`24h Change: ${analysis.change24h}`);
    }

    lines.push(`Direction: ${analysis.direction}`);
    lines.push(`Amount: $${analysis.suggestedAmount}`);
    lines.push(`Leverage: ${analysis.suggestedLeverage}x`);

    return lines.join("\n");
  };

  // Execute pending trade
  const handleExecute = async () => {
    // Check for trading enabling first
    if (!isTradingEnabled) {
      addMessage({
        type: "error",
        content:
          "You need to enable trading access (Builder Fee) before executing trades.",
      });
      return;
    }

    if (!pendingAnalysis || isProcessing) return;

    setIsProcessing(true);

    // Update the last analysis message to show executing state
    setMessages((prev) => {
      const newMessages = [...prev];
      const lastAnalysis = newMessages.findIndex(
        (m) => m.type === "analysis" && m.analysis === pendingAnalysis,
      );
      if (lastAnalysis >= 0) {
        newMessages[lastAnalysis] = {
          ...newMessages[lastAnalysis],
          isExecuting: true,
        };
      }
      return newMessages;
    });

    try {
      const result = await tradingAgent.execute(pendingAnalysis);

      // Add execution result message
      addMessage({
        type: "execution",
        content: result.success
          ? `✅ Trade executed successfully! Order ID: ${result.orderId}`
          : `❌ Trade failed: ${result.error}`,
      });

      if (result.success) {
        addMessage({
          type: "agent",
          content: `Great! Your ${pendingAnalysis.direction} position on ${pendingAnalysis.asset} is now live. Track it in your Portfolio.`,
        });
      }
    } catch (err) {
      addMessage({
        type: "error",
        content:
          err instanceof Error ? err.message : "Execution failed. Try again.",
      });
    } finally {
      setIsProcessing(false);
      setPendingAnalysis(null);
    }
  };

  // Cancel pending trade
  const handleCancel = () => {
    setPendingAnalysis(null);
    addMessage({
      type: "agent",
      content: "Trade cancelled. What else would you like to do?",
    });
  };

  // Quick action handlers
  const quickActions = [
    {
      icon: TrendingUp,
      label: "Long Top Gainer",
      color: "text-emerald-400",
      bgColor:
        "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30",
      command: "Long the top gainer with $50",
    },
    {
      icon: TrendingDown,
      label: "Short Top Loser",
      color: "text-rose-400",
      bgColor: "bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30",
      command: "Short the top loser with $50",
    },
    {
      icon: Users,
      label: "Copy Top Trader",
      color: "text-blue-400",
      bgColor: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30",
      command: "Copy the top trader with $50",
    },
  ];

  return (
    <>
      <div className="flex flex-col bg-gradient-to-b from-card via-card to-background border border-border rounded-2xl overflow-hidden shadow-2xl shadow-primary/5">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 via-purple-500/10 to-primary/10 border-b border-border cursor-pointer"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/30">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-card" />
            </div>
            <div>
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                AI Trading Agent
                <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              </h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {isLLMAvailable ? <></> : "Ready to trade"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isProcessing && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/20 text-primary text-xs">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Thinking...</span>
              </div>
            )}
            <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {isExpanded && (
          <>
            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[400px] min-h-[200px]"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      message.type === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : message.type === "error"
                          ? "bg-destructive/10 text-destructive border border-destructive/20 rounded-bl-md"
                          : message.type === "analysis"
                            ? "bg-gradient-to-br from-secondary to-secondary/50 border border-border rounded-bl-md"
                            : message.type === "execution"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-bl-md"
                              : "bg-secondary/80 rounded-bl-md"
                    }`}
                  >
                    {message.type === "error" && (
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="font-semibold text-sm">Error</span>
                      </div>
                    )}

                    {message.type === "analysis" && message.analysis && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-yellow-400" />
                          <span className="font-semibold text-sm">
                            Trade Found
                          </span>
                        </div>

                        <div className="bg-background/50 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-bold">
                              {message.analysis.pair}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                message.analysis.direction === "LONG"
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : "bg-rose-500/20 text-rose-400"
                              }`}
                            >
                              {message.analysis.direction}
                            </span>
                          </div>

                          {message.analysis.change24h && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">
                                24h:
                              </span>
                              <span
                                className={
                                  message.analysis.change24h.startsWith("+")
                                    ? "text-emerald-400"
                                    : "text-rose-400"
                                }
                              >
                                {message.analysis.change24h}
                              </span>
                            </div>
                          )}

                          {message.analysis.trader && (
                            <div className="text-sm text-muted-foreground">
                              Copying @{message.analysis.trader.username} (
                              {message.analysis.trader.winRate}% win rate)
                            </div>
                          )}

                          <div className="flex items-center justify-between text-sm pt-2 border-t border-border/50">
                            <span className="text-muted-foreground">
                              Amount
                            </span>
                            <span className="font-mono font-bold">
                              ${message.analysis.suggestedAmount}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Leverage
                            </span>
                            <span className="font-mono">
                              {message.analysis.suggestedLeverage}x
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground italic">
                          {message.analysis.reason}
                        </p>
                      </div>
                    )}

                    {/* Rich Data Rendering with Icons */}
                    {message.type === "richData" && message.richData && (
                      <div className="space-y-3">
                        {message.richData.type === "balance" && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Wallet className="w-5 h-5 text-primary" />
                              <span className="font-bold">Your Balance</span>
                            </div>
                            <div className="bg-background/50 rounded-xl p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <BarChart3 className="w-4 h-4" />
                                  <span className="text-sm">Account Value</span>
                                </div>
                                <span className="font-mono font-bold text-lg">
                                  ${message.richData.accountValue.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <DollarSign className="w-4 h-4 text-emerald-400" />
                                  <span className="text-sm">Available</span>
                                </div>
                                <span className="font-mono text-emerald-400">
                                  ${message.richData.available.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Lock className="w-4 h-4 text-amber-400" />
                                  <span className="text-sm">In Positions</span>
                                </div>
                                <span className="font-mono text-amber-400">
                                  ${message.richData.inPositions.toFixed(2)}
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Try "Long the top gainer" or "Short SOL" to trade!
                            </p>
                          </div>
                        )}

                        {message.richData.type === "portfolio" && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <PieChart className="w-5 h-5 text-primary" />
                              <span className="font-bold">Your Portfolio</span>
                            </div>
                            <div className="bg-background/50 rounded-xl p-4 space-y-3">
                              <div className="flex items-center justify-between pb-2 border-b border-border/50">
                                <span className="text-sm text-muted-foreground">
                                  Account Value
                                </span>
                                <span className="font-mono font-bold">
                                  ${message.richData.accountValue.toFixed(2)}
                                </span>
                              </div>
                              {message.richData.positions.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2">
                                  No open positions yet.
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {message.richData.positions.map(
                                    (pos, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-center justify-between"
                                      >
                                        <div className="flex items-center gap-2">
                                          {pos.direction === "LONG" ? (
                                            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                                          ) : (
                                            <ArrowDownRight className="w-4 h-4 text-rose-400" />
                                          )}
                                          <span className="font-medium">
                                            {pos.coin}
                                          </span>
                                          <span
                                            className={`text-xs px-1.5 py-0.5 rounded ${
                                              pos.direction === "LONG"
                                                ? "bg-emerald-500/20 text-emerald-400"
                                                : "bg-rose-500/20 text-rose-400"
                                            }`}
                                          >
                                            {pos.direction}
                                          </span>
                                        </div>
                                        <span
                                          className={`font-mono text-sm ${
                                            pos.pnl >= 0
                                              ? "text-emerald-400"
                                              : "text-rose-400"
                                          }`}
                                        >
                                          {pos.pnl >= 0 ? "+" : ""}$
                                          {pos.pnl.toFixed(2)}
                                        </span>
                                      </div>
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {message.richData.type === "market" && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <BarChart3 className="w-5 h-5 text-primary" />
                              <span className="font-bold">Market Analysis</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-emerald-500/10 rounded-xl p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                                  <span className="text-sm font-medium text-emerald-400">
                                    Top Gainers
                                  </span>
                                </div>
                                {message.richData.gainers.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    No data
                                  </p>
                                ) : (
                                  <div className="space-y-1">
                                    {message.richData.gainers.map((g, idx) => (
                                      <div
                                        key={idx}
                                        className="flex justify-between text-sm"
                                      >
                                        <span>{g.asset}</span>
                                        <span className="text-emerald-400">
                                          +{g.change.toFixed(1)}%
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="bg-rose-500/10 rounded-xl p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <TrendingDown className="w-4 h-4 text-rose-400" />
                                  <span className="text-sm font-medium text-rose-400">
                                    Top Losers
                                  </span>
                                </div>
                                {message.richData.losers.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    No data
                                  </p>
                                ) : (
                                  <div className="space-y-1">
                                    {message.richData.losers.map((l, idx) => (
                                      <div
                                        key={idx}
                                        className="flex justify-between text-sm"
                                      >
                                        <span>{l.asset}</span>
                                        <span className="text-rose-400">
                                          {l.change.toFixed(1)}%
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Try "Long the top gainer" to trade!
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {message.type !== "analysis" &&
                      message.type !== "richData" && (
                        <p className="text-sm whitespace-pre-line">
                          {message.content}
                        </p>
                      )}

                    <p className="text-[10px] text-muted-foreground mt-2 opacity-60">
                      {message.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}

              {isProcessing && !pendingAnalysis && (
                <div className="flex justify-start mb-4 animate-in fade-in duration-300">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shrink-0 mr-2 shadow-sm">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="max-w-[80%] p-3 rounded-2xl bg-secondary/80 rounded-tl-none border border-border/50">
                    <div className="flex gap-1 items-center h-6 px-1">
                      <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce"></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Pending Confirmation */}
            {/* Pending Analysis or Trading Enable Confirmation */}
            {(pendingAnalysis || (!isTradingEnabled && pendingAnalysis)) &&
              !isProcessing && (
                <div className="px-4 py-3 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-y border-yellow-500/20">
                  {!isTradingEnabled ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-yellow-400 font-medium text-sm">
                        <AlertCircle className="w-4 h-4" />
                        <span>Trading Access Required</span>
                      </div>
                      <p className="text-xs text-muted-foreground/80">
                        You need to approve the builder fee to trade.
                      </p>
                      <Button
                        size="sm"
                        onClick={handleEnableTrading}
                        disabled={isEnabling}
                        className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/50"
                      >
                        {isEnabling && (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        )}
                        Enable Trading Access
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-yellow-300 mb-3 font-medium">
                        Ready to execute this trade?
                      </p>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleExecute}
                          className="flex-1 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-lg shadow-emerald-500/20"
                        >
                          <Check className="w-4 h-4 mr-2" />
                          Confirm Trade
                        </Button>
                        <Button
                          onClick={handleCancel}
                          variant="outline"
                          className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

            {/* Quick Actions */}
            {!pendingAnalysis && (
              <div className="px-4 py-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-2">
                  Quick Actions
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                  {quickActions.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => handleSubmit(action.command)}
                      disabled={isProcessing}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all whitespace-nowrap disabled:opacity-50 ${action.bgColor}`}
                    >
                      <action.icon className={`w-4 h-4 ${action.color}`} />
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="px-4 py-3 border-t border-border bg-secondary/30">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit();
                }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Tell me what to trade..."
                  disabled={isProcessing || !!pendingAnalysis}
                  className="flex-1 bg-background/50 border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isProcessing || !!pendingAnalysis}
                  className="p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                >
                  {isProcessing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </form>

              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Try: "Long BTC with $100" or "Short SOL 2x leverage"
              </p>
            </div>
          </>
        )}
      </div>

      {/* Agent Wallet Setup Modal */}
      <AgentWalletSetupModal
        isOpen={showAgentSetup}
        onClose={() => setShowAgentSetup(false)}
      />
    </>
  );
}
