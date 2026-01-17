// Pear Protocol - Main Export File

// Configuration
export { PEAR_CONFIG, STORAGE_KEYS } from './pearConfig';

// Authentication
export {
  getAccessToken,
  getRefreshToken,
  getTokenExpiry,
  getUserAddress,
  setTokens,
  clearTokens,
  isTokenExpired,
  isAuthenticated,
  getEIP712Message,
  login,
  logout,
  refreshAccessToken,
  getValidAccessToken,
} from './pearAuth';

// API Client
export { pearClient } from './pearClient';

// WebSocket
export { pearWebSocket } from './pearWebSocket';
