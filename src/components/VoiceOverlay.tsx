import { Mic, X } from 'lucide-react';

interface VoiceOverlayProps {
  isOpen: boolean;
  isProcessing: boolean;
  onClose: () => void;
}

const suggestions = [
  'Copy this with $500',
  'Show me low risk trades',
  "What's my portfolio?",
  'Find SOL trades',
];

export function VoiceOverlay({ isOpen, isProcessing, onClose }: VoiceOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-xl animate-fade-in">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-secondary tap-scale"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="flex flex-col items-center justify-center h-full px-6">
        {/* Pulsing Mic */}
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full bg-primary/20 listening-pulse" />
          <div className="relative w-24 h-24 rounded-full gradient-primary flex items-center justify-center">
            <Mic className="w-10 h-10 text-primary-foreground" />
          </div>
        </div>

        {/* Waveform */}
        <div className="flex items-center gap-1 h-12 mb-6">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-primary rounded-full waveform-bar"
              style={{
                height: '100%',
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>

        {/* Status Text */}
        <p className="text-xl font-medium mb-8">
          {isProcessing ? 'Processing...' : 'Listening...'}
        </p>

        {/* Suggestion Chips */}
        {!isProcessing && (
          <div className="flex flex-wrap justify-center gap-2 max-w-sm">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={onClose}
                className="px-4 py-2 rounded-full bg-secondary text-sm font-medium tap-scale hover:bg-secondary/80 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* Processing Confirmation */}
        {isProcessing && (
          <div className="mt-4 p-4 rounded-xl bg-card border border-border animate-fade-in-up">
            <p className="text-sm text-muted-foreground mb-2">Executing command:</p>
            <p className="font-medium">"Copy this trade with $500"</p>
          </div>
        )}
      </div>
    </div>
  );
}
