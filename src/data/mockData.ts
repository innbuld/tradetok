export type RiskLevel = 'low' | 'medium' | 'high';
export type Direction = 'LONG' | 'SHORT';

export interface Trader {
  id: string;
  username: string;
  avatar: string;
  verified: boolean;
  followers: string;
  bio: string;
  winRate: string;
  totalPnl: string;
  avgReturn: string;
}

export interface Trade {
  id: string;
  trader: Trader;
  timestamp: string;
  thesis: string;
  pair: string;
  direction: Direction;
  entry: string;
  current: string;
  pnl: string;
  pnlValue: number;
  size: string;
  winRate: string;
  riskLevel: RiskLevel;
  likes: number;
  comments: number;
  copies: number;
  voiceDuration: string;
  leverage: number;
}

export interface Position {
  id: string;
  pair: string;
  direction: Direction;
  entry: string;
  current: string;
  pnl: string;
  pnlValue: number;
  size: string;
  openedAt: string;
}

export const traders: Trader[] = [
  {
    id: '1',
    username: 'cryptojake',
    avatar: '🧑‍💼',
    verified: true,
    followers: '12.3K',
    bio: 'Full-time trader | 3 years in crypto | Focus on momentum plays',
    winRate: '68%',
    totalPnl: '+$124.5K',
    avgReturn: '+8.2%',
  },
  {
    id: '2',
    username: 'defi_queen',
    avatar: '👸',
    verified: true,
    followers: '45.2K',
    bio: 'DeFi researcher & trader | Finding alpha in the noise',
    winRate: '72%',
    totalPnl: '+$892.3K',
    avgReturn: '+12.4%',
  },
  {
    id: '3',
    username: 'whale_watcher',
    avatar: '🐋',
    verified: true,
    followers: '28.9K',
    bio: 'On-chain analyst | Following the smart money',
    winRate: '65%',
    totalPnl: '+$234.1K',
    avgReturn: '+6.8%',
  },
  {
    id: '4',
    username: 'sol_maxi',
    avatar: '☀️',
    verified: false,
    followers: '8.7K',
    bio: 'Solana ecosystem specialist | High conviction plays only',
    winRate: '58%',
    totalPnl: '+$45.2K',
    avgReturn: '+15.3%',
  },
  {
    id: '5',
    username: 'risk_manager',
    avatar: '🛡️',
    verified: true,
    followers: '19.4K',
    bio: 'Conservative trader | Capital preservation first',
    winRate: '78%',
    totalPnl: '+$156.8K',
    avgReturn: '+4.2%',
  },
  {
    id: '6',
    username: 'moonshot_mike',
    avatar: '🚀',
    verified: false,
    followers: '34.1K',
    bio: 'High risk, high reward | DYOR, NFA',
    winRate: '42%',
    totalPnl: '+$567.9K',
    avgReturn: '+45.6%',
  },
  {
    id: '7',
    username: 'eth_maxi_anna',
    avatar: '💎',
    verified: true,
    followers: '52.8K',
    bio: 'ETH believer | Layer 2 specialist | Building the future',
    winRate: '71%',
    totalPnl: '+$1.2M',
    avgReturn: '+9.8%',
  },
  {
    id: '8',
    username: 'swing_trader_pro',
    avatar: '📊',
    verified: true,
    followers: '15.6K',
    bio: 'Technical analysis | Multi-day holds | No day trading',
    winRate: '69%',
    totalPnl: '+$78.4K',
    avgReturn: '+7.1%',
  },
];

export const trades: Trade[] = [
  {
    id: '1',
    trader: traders[0],
    timestamp: '2h ago',
    thesis: 'Solana narrative heating up with major ecosystem developments. Entry looks solid here with clear support at $95. Targeting $120 by end of month.',
    pair: 'SOL/USDC',
    direction: 'LONG',
    entry: '98.45',
    current: '101.67',
    pnl: '+3.2%',
    pnlValue: 3.2,
    size: '$2.5K',
    winRate: '68%',
    riskLevel: 'medium',
    likes: 234,
    comments: 18,
    copies: 89,
    voiceDuration: '0:18',
  },
  {
    id: '2',
    trader: traders[1],
    timestamp: '4h ago',
    thesis: 'ETH showing weakness against BTC. Ratio breakdown imminent. Taking a short position here with tight stops above recent highs.',
    pair: 'ETH/BTC',
    direction: 'SHORT',
    entry: '0.0456',
    current: '0.0442',
    pnl: '+3.1%',
    pnlValue: 3.1,
    size: '$5.0K',
    winRate: '72%',
    riskLevel: 'low',
    likes: 567,
    comments: 42,
    copies: 156,
    voiceDuration: '0:24',
  },
  {
    id: '3',
    trader: traders[2],
    timestamp: '6h ago',
    thesis: 'Whale accumulation detected on AVAX. Multiple wallets moving in. This could run hard once retail catches on.',
    pair: 'AVAX/USDC',
    direction: 'LONG',
    entry: '34.20',
    current: '35.89',
    pnl: '+4.9%',
    pnlValue: 4.9,
    size: '$3.2K',
    winRate: '65%',
    riskLevel: 'medium',
    likes: 312,
    comments: 28,
    copies: 94,
    voiceDuration: '0:31',
  },
  {
    id: '4',
    trader: traders[3],
    timestamp: '8h ago',
    thesis: 'JTO looking primed for a breakout. Solana airdrop momentum still strong. High conviction play with 3x potential.',
    pair: 'JTO/USDC',
    direction: 'LONG',
    entry: '2.85',
    current: '2.72',
    pnl: '-4.6%',
    pnlValue: -4.6,
    size: '$1.8K',
    winRate: '58%',
    riskLevel: 'high',
    likes: 145,
    comments: 56,
    copies: 34,
    voiceDuration: '0:22',
  },
  {
    id: '5',
    trader: traders[4],
    timestamp: '12h ago',
    thesis: 'BTC consolidating nicely above $42K. Low risk entry with clear invalidation. Perfect R:R setup for a swing trade.',
    pair: 'BTC/USDC',
    direction: 'LONG',
    entry: '42,150',
    current: '43,280',
    pnl: '+2.7%',
    pnlValue: 2.7,
    size: '$10.0K',
    winRate: '78%',
    riskLevel: 'low',
    likes: 892,
    comments: 67,
    copies: 312,
    voiceDuration: '0:15',
  },
  {
    id: '6',
    trader: traders[5],
    timestamp: '1d ago',
    thesis: 'PEPE showing signs of life. Meme season incoming? Taking a small position for potential 10x. Pure degen play.',
    pair: 'PEPE/USDC',
    direction: 'LONG',
    entry: '0.00000112',
    current: '0.00000145',
    pnl: '+29.5%',
    pnlValue: 29.5,
    size: '$500',
    winRate: '42%',
    riskLevel: 'high',
    likes: 1245,
    comments: 234,
    copies: 567,
    voiceDuration: '0:28',
  },
  {
    id: '7',
    trader: traders[6],
    timestamp: '1d ago',
    thesis: 'ARB accumulation zone. Layer 2 narrative coming back strong. Building position here for Q1 catalyst.',
    pair: 'ARB/USDC',
    direction: 'LONG',
    entry: '1.12',
    current: '1.18',
    pnl: '+5.4%',
    pnlValue: 5.4,
    size: '$4.5K',
    winRate: '71%',
    riskLevel: 'low',
    likes: 678,
    comments: 45,
    copies: 189,
    voiceDuration: '0:19',
  },
  {
    id: '8',
    trader: traders[7],
    timestamp: '2d ago',
    thesis: 'LINK breaking out of 6-month range. Oracle narrative + real world assets. This is a multi-week hold.',
    pair: 'LINK/USDC',
    direction: 'LONG',
    entry: '14.50',
    current: '15.82',
    pnl: '+9.1%',
    pnlValue: 9.1,
    size: '$6.0K',
    winRate: '69%',
    riskLevel: 'medium',
    likes: 534,
    comments: 38,
    copies: 145,
    voiceDuration: '0:26',
  },
];

export const positions: Position[] = [
  {
    id: '1',
    pair: 'SOL/USDC',
    direction: 'LONG',
    entry: '98.45',
    current: '101.67',
    pnl: '+3.2%',
    pnlValue: 3.2,
    size: '$2,500',
    openedAt: '2h ago',
  },
  {
    id: '2',
    pair: 'BTC/USDC',
    direction: 'LONG',
    entry: '42,150',
    current: '43,280',
    pnl: '+2.7%',
    pnlValue: 2.7,
    size: '$5,000',
    openedAt: '12h ago',
  },
  {
    id: '3',
    pair: 'ETH/BTC',
    direction: 'SHORT',
    entry: '0.0456',
    current: '0.0442',
    pnl: '+3.1%',
    pnlValue: 3.1,
    size: '$3,200',
    openedAt: '4h ago',
  },
  {
    id: '4',
    pair: 'AVAX/USDC',
    direction: 'LONG',
    entry: '34.20',
    current: '33.45',
    pnl: '-2.2%',
    pnlValue: -2.2,
    size: '$1,800',
    openedAt: '1d ago',
  },
];

export const trendingPairs = [
  { pair: 'SOL/USDC', change: '+5.2%', volume: '$2.4B' },
  { pair: 'BTC/USDC', change: '+1.8%', volume: '$12.8B' },
  { pair: 'ETH/USDC', change: '+2.4%', volume: '$6.2B' },
  { pair: 'AVAX/USDC', change: '+8.1%', volume: '$890M' },
  { pair: 'LINK/USDC', change: '+6.7%', volume: '$1.1B' },
];

export const hotPairs = ['SOL', 'AVAX', 'JTO', 'LINK', 'ARB', 'OP', 'INJ', 'TIA'];
