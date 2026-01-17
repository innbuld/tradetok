import { BadgeCheck, Play, Pause, Heart, MessageCircle, Share2, Copy } from 'lucide-react';
import { useState } from 'react';
import type { Trade, RiskLevel } from '@/data/mockData';

interface TradePostProps {
  trade: Trade;
  onCopyTrade: () => void;
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const styles = {
    low: 'bg-success/20 text-success',
    medium: 'bg-warning/20 text-warning',
    high: 'bg-destructive/20 text-destructive',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${styles[level]}`}>
      {level}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: 'LONG' | 'SHORT' }) {
  const isLong = direction === 'LONG';
  return (
    <span
      className={`px-3 py-1 rounded-lg text-sm font-bold ${
        isLong ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
      }`}
    >
      {direction}
    </span>
  );
}

function VoiceNoteCard({ duration, isPlaying, onToggle }: { duration: string; isPlaying: boolean; onToggle: () => void }) {
  return (
    <div className="bg-secondary rounded-xl p-3 flex items-center gap-3">
      <button
        onClick={onToggle}
        className="w-10 h-10 rounded-full bg-primary flex items-center justify-center tap-scale"
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 text-primary-foreground" />
        ) : (
          <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
        )}
      </button>
      
      <div className="flex-1 flex items-center gap-0.5 h-8">
        {[...Array(24)].map((_, i) => (
          <div
            key={i}
            className={`flex-1 rounded-full ${isPlaying ? 'bg-primary waveform-bar' : 'bg-muted-foreground/40'}`}
            style={{
              height: `${Math.random() * 60 + 40}%`,
              animationDelay: isPlaying ? `${i * 0.05}s` : undefined,
            }}
          />
        ))}
      </div>
      
      <span className="text-sm text-muted-foreground font-medium">{duration}</span>
    </div>
  );
}

export function TradePost({ trade, onCopyTrade }: TradePostProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(trade.likes);

  const handleLike = () => {
    setIsLiked(!isLiked);
    setLikeCount(isLiked ? likeCount - 1 : likeCount + 1);
  };

  const isProfitable = trade.pnlValue > 0;

  return (
    <div className="min-h-[85vh] flex flex-col p-4 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-2xl">
          {trade.trader.avatar}
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{trade.trader.username}</span>
            {trade.trader.verified && (
              <BadgeCheck className="w-4 h-4 text-primary" />
            )}
            <RiskBadge level={trade.riskLevel} />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{trade.trader.followers} followers</span>
            <span>•</span>
            <span>{trade.timestamp}</span>
          </div>
        </div>
        
        <button className="px-4 py-1.5 rounded-full border border-primary text-primary text-sm font-semibold tap-scale hover:bg-primary hover:text-primary-foreground transition-colors">
          Follow
        </button>
      </div>

      {/* Voice Note */}
      <VoiceNoteCard
        duration={trade.voiceDuration}
        isPlaying={isPlaying}
        onToggle={() => setIsPlaying(!isPlaying)}
      />

      {/* Thesis */}
      <p className="my-4 text-foreground/90 leading-relaxed line-clamp-3">
        {trade.thesis}
      </p>

      {/* Trade Card */}
      <div className="trade-card-gradient rounded-2xl p-4 border border-border flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <span className="text-2xl font-bold">{trade.pair}</span>
          <DirectionBadge direction={trade.direction} />
        </div>

        <div className={`text-4xl font-bold mb-4 ${isProfitable ? 'text-success' : 'text-destructive'}`}>
          {trade.pnl}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Entry Price</p>
            <p className="font-semibold">${trade.entry}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Current Price</p>
            <p className="font-semibold">${trade.current}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Position Size</p>
            <p className="font-semibold">{trade.size}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Win Rate</p>
            <p className="font-semibold text-success">{trade.winRate}</p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-6">
          <button 
            onClick={handleLike}
            className="flex items-center gap-2 tap-scale"
          >
            <Heart className={`w-6 h-6 ${isLiked ? 'fill-destructive text-destructive' : ''}`} />
            <span className="text-sm font-medium">{likeCount}</span>
          </button>
          
          <button className="flex items-center gap-2 tap-scale">
            <MessageCircle className="w-6 h-6" />
            <span className="text-sm font-medium">{trade.comments}</span>
          </button>
          
          <button className="tap-scale">
            <Share2 className="w-6 h-6" />
          </button>
        </div>

        <button
          onClick={onCopyTrade}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-primary-foreground font-semibold tap-scale"
        >
          <Copy className="w-5 h-5" />
          <span>Copy Trade ({trade.copies})</span>
        </button>
      </div>
    </div>
  );
}
