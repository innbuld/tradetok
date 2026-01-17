// Pear Protocol Configuration

export const PEAR_CONFIG = {
  // API Base URL
  API_BASE_URL: 'https://hl-v2.pearprotocol.io',
  
  // WebSocket URL
  WS_URL: 'wss://hl-v2.pearprotocol.io/ws',
  
  // Client ID provided for the hackathon
  CLIENT_ID: 'HLHackathon1',
  
  // Builder address for fee approval
  BUILDER_ADDRESS: '0xA47D4d99191db54A4829cdf3de2417E527c3b042',
  
  // Default slippage (8%)
  DEFAULT_SLIPPAGE: 0.08,
  
  // Token lifetimes
  ACCESS_TOKEN_LIFETIME: 15 * 60 * 1000, // 15 minutes in ms
  REFRESH_TOKEN_LIFETIME: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  
  // Token refresh buffer (refresh 1 minute before expiry)
  TOKEN_REFRESH_BUFFER: 60 * 1000, // 1 minute in ms
  
  // Minimum trade size
  MIN_TRADE_SIZE: 11, // $11 minimum per asset
  
  // Leverage range
  MIN_LEVERAGE: 1,
  MAX_LEVERAGE: 100,
} as const;

// Local storage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'pear_access_token',
  REFRESH_TOKEN: 'pear_refresh_token',
  TOKEN_EXPIRY: 'pear_token_expiry',
  USER_ADDRESS: 'pear_user_address',
  AGENT_WALLET: 'pear_agent_wallet',
} as const;
