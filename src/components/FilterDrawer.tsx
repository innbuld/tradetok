import { X } from 'lucide-react';
import { useState } from 'react';
import { Slider } from '@/components/ui/slider';

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const timeframes = ['1h', '24h', '7d', '30d'];

export function FilterDrawer({ isOpen, onClose }: FilterDrawerProps) {
  const [riskFilters, setRiskFilters] = useState({
    low: true,
    medium: true,
    high: false,
  });
  const [minWinRate, setMinWinRate] = useState([60]);
  const [positionSize, setPositionSize] = useState([500, 5000]);
  const [selectedTimeframe, setSelectedTimeframe] = useState('24h');

  const handleReset = () => {
    setRiskFilters({ low: true, medium: true, high: false });
    setMinWinRate([60]);
    setPositionSize([500, 5000]);
    setSelectedTimeframe('24h');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="relative w-80 max-w-[85vw] bg-card h-full animate-slide-in-right overflow-y-auto hide-scrollbar">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold">Filters</h2>
            <button onClick={onClose} className="p-2 rounded-full bg-secondary tap-scale">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Risk Level */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-muted-foreground mb-4">
              Risk Level
            </label>
            <div className="flex flex-wrap gap-2">
              {(['low', 'medium', 'high'] as const).map((level) => {
                const isActive = riskFilters[level];
                const colors = {
                  low: 'bg-success/20 text-success border-success',
                  medium: 'bg-warning/20 text-warning border-warning',
                  high: 'bg-destructive/20 text-destructive border-destructive',
                };
                return (
                  <button
                    key={level}
                    onClick={() => setRiskFilters({ ...riskFilters, [level]: !isActive })}
                    className={`px-4 py-2 rounded-xl border capitalize font-medium transition-all tap-scale ${
                      isActive 
                        ? colors[level] 
                        : 'bg-secondary border-transparent text-muted-foreground'
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Min Win Rate */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-muted-foreground">
                Minimum Win Rate
              </label>
              <span className="text-primary font-semibold">{minWinRate[0]}%</span>
            </div>
            <Slider
              value={minWinRate}
              onValueChange={setMinWinRate}
              min={50}
              max={90}
              step={5}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>50%</span>
              <span>90%</span>
            </div>
          </div>

          {/* Position Size */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-muted-foreground">
                Position Size
              </label>
              <span className="text-primary font-semibold">
                ${positionSize[0].toLocaleString()} - ${positionSize[1].toLocaleString()}
              </span>
            </div>
            <Slider
              value={positionSize}
              onValueChange={setPositionSize}
              min={100}
              max={10000}
              step={100}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>$100</span>
              <span>$10,000</span>
            </div>
          </div>

          {/* Timeframe */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-muted-foreground mb-4">
              Timeframe
            </label>
            <div className="grid grid-cols-4 gap-2">
              {timeframes.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setSelectedTimeframe(tf)}
                  className={`py-2 rounded-xl font-medium transition-colors tap-scale ${
                    selectedTimeframe === tf
                      ? 'gradient-primary text-primary-foreground'
                      : 'bg-secondary hover:bg-secondary/80'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={onClose}
              className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-bold tap-scale"
            >
              Apply Filters
            </button>
            <button
              onClick={handleReset}
              className="w-full py-4 rounded-xl bg-secondary font-semibold tap-scale hover:bg-secondary/80 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
