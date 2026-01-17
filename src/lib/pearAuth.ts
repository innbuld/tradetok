// Pear Protocol Authentication Utilities

import { PEAR_CONFIG, STORAGE_KEYS } from './pearConfig';
import type { 
  EIP712Message, 
  AuthResponse, 
  LoginRequest 
} from '@/types/pear';

// ============================================
// TOKEN STORAGE
// ============================================

export const getAccessToken = (): string | null => {
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
};

export const getRefreshToken = (): string | null => {
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
};

export const getTokenExpiry = (): number | null => {
  const expiry = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);
  return expiry ? parseInt(expiry, 10) : null;
};

export const getUserAddress = (): string | null => {
  return localStorage.getItem(STORAGE_KEYS.USER_ADDRESS);
};

export const setTokens = (
  accessToken: string, 
  refreshToken: string, 
  expiresIn: number,
  address: string
): void => {
  const expiryTime = Date.now() + (expiresIn * 1000);
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
  localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
  localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, expiryTime.toString());
  localStorage.setItem(STORAGE_KEYS.USER_ADDRESS, address);
};

export const clearTokens = (): void => {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
  localStorage.removeItem(STORAGE_KEYS.USER_ADDRESS);
  localStorage.removeItem(STORAGE_KEYS.AGENT_WALLET);
};

export const isTokenExpired = (): boolean => {
  const expiry = getTokenExpiry();
  if (!expiry) return true;
  return Date.now() >= expiry - PEAR_CONFIG.TOKEN_REFRESH_BUFFER;
};

export const isAuthenticated = (): boolean => {
  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();
  return !!(accessToken && refreshToken);
};

// ============================================
// AUTHENTICATION API CALLS
// ============================================

/**
 * Get EIP-712 message to sign for authentication
 */
export const getEIP712Message = async (address: string): Promise<EIP712Message> => {
  const url = new URL(`${PEAR_CONFIG.API_BASE_URL}/auth/eip712-message`);
  url.searchParams.set('address', address);
  url.searchParams.set('clientId', PEAR_CONFIG.CLIENT_ID);

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to get EIP-712 message' }));
    throw new Error(error.message || 'Failed to get EIP-712 message');
  }

  return response.json();
};

/**
 * Authenticate with signed EIP-712 message
 */
export const login = async (
  address: string, 
  signature: string, 
  timestamp: number
): Promise<AuthResponse> => {
  const loginRequest: LoginRequest = {
    method: 'eip712',
    address,
    clientId: PEAR_CONFIG.CLIENT_ID,
    details: {
      signature,
      timestamp,
    },
  };

  const response = await fetch(`${PEAR_CONFIG.API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(loginRequest),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Authentication failed' }));
    throw new Error(error.message || 'Authentication failed');
  }

  const authResponse: AuthResponse = await response.json();
  
  // Store tokens
  setTokens(
    authResponse.accessToken, 
    authResponse.refreshToken, 
    authResponse.expiresIn,
    authResponse.address
  );

  return authResponse;
};

/**
 * Refresh access token using refresh token
 */
export const refreshAccessToken = async (): Promise<string> => {
  const refreshToken = getRefreshToken();
  
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await fetch(`${PEAR_CONFIG.API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    // Clear tokens on refresh failure
    clearTokens();
    throw new Error('Token refresh failed. Please login again.');
  }

  const authResponse: AuthResponse = await response.json();
  
  // Store new tokens
  setTokens(
    authResponse.accessToken, 
    authResponse.refreshToken, 
    authResponse.expiresIn,
    authResponse.address
  );

  return authResponse.accessToken;
};

/**
 * Logout and invalidate refresh token
 */
export const logout = async (): Promise<void> => {
  const refreshToken = getRefreshToken();
  
  if (refreshToken) {
    try {
      await fetch(`${PEAR_CONFIG.API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });
    } catch (error) {
      // Ignore logout errors, just clear local tokens
      console.error('Logout API error:', error);
    }
  }

  clearTokens();
};

/**
 * Get valid access token (auto-refresh if expired)
 */
export const getValidAccessToken = async (): Promise<string> => {
  let accessToken = getAccessToken();

  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  if (isTokenExpired()) {
    accessToken = await refreshAccessToken();
  }

  return accessToken;
};
