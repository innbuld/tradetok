import { useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { VoiceButton } from "@/components/VoiceButton";
import { VoiceOverlay } from "@/components/VoiceOverlay";
import { FeedScreen } from "@/screens/FeedScreen";
import { DiscoverScreen } from "@/screens/DiscoverScreen";
import { PortfolioScreen } from "@/screens/PortfolioScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";

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

      {/* Voice Button */}
      {/* Voice Button - Disabled for now
      <VoiceButton
        onPress={handleVoiceStart}
        onRelease={handleVoiceEnd}
        isActive={isVoiceActive}
      />
      */}

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
