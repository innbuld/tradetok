import { Mic } from 'lucide-react';

interface VoiceButtonProps {
  onPress: () => void;
  onRelease: () => void;
  isActive: boolean;
}

export function VoiceButton({ onPress, onRelease, isActive }: VoiceButtonProps) {
  return (
    <button
      onMouseDown={onPress}
      onMouseUp={onRelease}
      onMouseLeave={onRelease}
      onTouchStart={onPress}
      onTouchEnd={onRelease}
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-16 h-16 rounded-full gradient-primary flex items-center justify-center tap-scale shadow-lg ${
        isActive ? '' : 'voice-pulse'
      }`}
    >
      <Mic className="w-7 h-7 text-primary-foreground" />
    </button>
  );
}
