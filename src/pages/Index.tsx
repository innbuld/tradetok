import { useState, useEffect } from "react";
import { BottomNav } from "@/components/BottomNav";
import { VoiceButton } from "@/components/VoiceButton";
import { VoiceOverlay } from "@/components/VoiceOverlay";
import { FeedScreen } from "@/screens/FeedScreen";
import { DiscoverScreen } from "@/screens/DiscoverScreen";
import { PortfolioScreen } from "@/screens/PortfolioScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { usePearAuthContext } from "@/contexts/PearAuthContext";
import { AgentWalletSetupModal } from "@/components/AgentWalletSetupModal";

type Tab = "feed" | "discover" | "portfolio" | "profile";

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleVoiceStart = () => {
    setIsVoiceActive(true);
    setIsProcessing(false);
  };

  const handleVoiceEnd = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsVoiceActive(false);
      setIsProcessing(false);
    }, 1500);
  };

  const handleVoiceClose = () => {
    setIsVoiceActive(false);
    setIsProcessing(false);
  };

  const { isAuthenticated, agentWallet, address, account } =
    usePearAuthContext();
  const [showAgentSetup, setShowAgentSetup] = useState(false);

  // Check for incomplete agent setup on mount/update
  useEffect(() => {
    if (isAuthenticated && agentWallet && address) {
      const storageKey = `pear_agent_approved_${address}`;
      const isApproved = localStorage.getItem(storageKey);

      if (isApproved) return;

      // Heuristic: If user has significant balance (> $5), they are likely already setup
      if (account && account.accountValue > 5) {
        localStorage.setItem(storageKey, "true");
        return;
      }

      // If balance is 0 or low, and not approved, assume stuck setup
      // Small delay to ensure data is loaded
      const timer = setTimeout(() => {
        // Double check balance here in case it loaded late
        if (!account || account.accountValue <= 5) {
          setShowAgentSetup(true);
        }
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, agentWallet, address, account]);

  const renderScreen = () => {
    switch (activeTab) {
      case "feed":
        return <FeedScreen />;
      case "discover":
        return <DiscoverScreen />;
      case "portfolio":
        return <PortfolioScreen />;
      case "profile":
        return <ProfileScreen />;
      default:
        return <FeedScreen />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground max-w-mobile mx-auto relative overflow-hidden">
      {/* Main Content */}
      <main className="h-screen pb-20 overflow-y-auto">{renderScreen()}</main>

      {/* Global Agent Setup Modal */}
      <AgentWalletSetupModal
        isOpen={showAgentSetup}
        onClose={() => setShowAgentSetup(false)}
      />

      {/* Bottom Navigation */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Voice Overlay */}
      <VoiceOverlay
        isOpen={isVoiceActive}
        isProcessing={isProcessing}
        onClose={handleVoiceClose}
      />
    </div>
  );
};

export default Index;
