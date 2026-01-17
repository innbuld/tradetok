import { useState } from 'react';
import { BadgeCheck, Settings, Share2 } from 'lucide-react';
import { traders, trades } from '@/data/mockData';

type Tab = 'trades' | 'history' | 'about';

export function ProfileScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('trades');
  
  // Mock current user as the first trader
  const user = traders[6]; // eth_maxi_anna
  const userTrades = trades.filter((t) => t.trader.id === user.id);

  return (
    <div className="min-h-screen pb-32">
      {/* Header */}
      <div className="relative">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-br from-primary/30 to-primary/10" />
        
        {/* Actions */}
        <div className="absolute top-4 right-4 flex gap-2">
          <button className="p-2 rounded-full bg-background/50 backdrop-blur-sm tap-scale">
            <Share2 className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-full bg-background/50 backdrop-blur-sm tap-scale">
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Avatar */}
        <div className="absolute -bottom-12 left-4">
          <div className="w-24 h-24 rounded-full bg-secondary border-4 border-background flex items-center justify-center text-4xl">
            {user.avatar}
          </div>
        </div>
      </div>

      {/* Profile Info */}
      <div className="px-4 pt-14 pb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-bold">{user.username}</h1>
          {user.verified && <BadgeCheck className="w-6 h-6 text-primary" />}
        </div>
        
        <p className="text-muted-foreground mb-4">{user.bio}</p>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-lg font-bold">{user.followers}</p>
            <p className="text-xs text-muted-foreground">Followers</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-success">{user.winRate}</p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-success">{user.totalPnl}</p>
            <p className="text-xs text-muted-foreground">Total P&L</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-success">{user.avgReturn}</p>
            <p className="text-xs text-muted-foreground">Avg Return</p>
          </div>
        </div>

        {/* Follow Button */}
        <button className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold tap-scale">
          Follow Trader
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-4">
        {(['trades', 'history', 'about'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 font-medium capitalize transition-colors ${
              activeTab === tab 
                ? 'text-primary border-b-2 border-primary' 
                : 'text-muted-foreground'
            }`}
          >
            {tab === 'trades' ? 'Active Trades' : tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="px-4 py-4">
        {activeTab === 'trades' && (
          <div className="space-y-3">
            {userTrades.length > 0 ? (
              userTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="bg-card border border-border rounded-xl p-4 tap-scale"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold">{trade.pair}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      trade.direction === 'LONG'
                        ? 'bg-success/20 text-success'
                        : 'bg-destructive/20 text-destructive'
                    }`}>
                      {trade.direction}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{trade.timestamp}</span>
                    <span className={`font-semibold ${
                      trade.pnlValue > 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {trade.pnl}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No active trades</p>
              </div>
            )}
            
            {/* Show some other trades as examples */}
            {userTrades.length === 0 && trades.slice(0, 3).map((trade) => (
              <div
                key={trade.id}
                className="bg-card border border-border rounded-xl p-4 tap-scale"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">{trade.pair}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    trade.direction === 'LONG'
                      ? 'bg-success/20 text-success'
                      : 'bg-destructive/20 text-destructive'
                  }`}>
                    {trade.direction}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{trade.timestamp}</span>
                  <span className={`font-semibold ${
                    trade.pnlValue > 0 ? 'text-success' : 'text-destructive'
                  }`}>
                    {trade.pnl}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Trade history will appear here</p>
          </div>
        )}

        {activeTab === 'about' && (
          <div className="space-y-6">
            <div>
              <h3 className="font-bold mb-2">About</h3>
              <p className="text-muted-foreground leading-relaxed">
                {user.bio} I've been trading crypto since 2019 and focus primarily on 
                Ethereum ecosystem plays. My strategy combines on-chain analysis with 
                technical setups for high-conviction entries.
              </p>
            </div>
            
            <div>
              <h3 className="font-bold mb-2">Trading Style</h3>
              <div className="flex flex-wrap gap-2">
                {['Swing Trading', 'DeFi', 'Layer 2', 'Technical Analysis'].map((tag) => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-secondary text-sm">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-bold mb-2">Preferred Pairs</h3>
              <div className="flex flex-wrap gap-2">
                {['ETH', 'ARB', 'OP', 'MATIC'].map((pair) => (
                  <span key={pair} className="px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium">
                    {pair}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
