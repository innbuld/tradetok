# 🍐 Pear Protocol Integration - Implementation Summary

## Overview

TradeTok is now fully integrated with **Pear Protocol** for real trading functionality. This document summarizes all the backend integration components.

## Client ID

```
HLHackathon1
```

## API Configuration

- **API Base URL:** `https://hl-v2.pearprotocol.io`
- **WebSocket URL:** `wss://hl-v2.pearprotocol.io/ws`
- **Builder Address:** `0xA47D4d99191db54A4829cdf3de2417E527c3b042`

---

## Files Created

### Types (`src/types/pear.ts`)

Complete TypeScript definitions for all Pear Protocol entities:

- `OpenPosition`, `PositionAsset`
- `CreatePositionRequest`, `CreatePositionResponse`
- `Market`, `ActiveMarketsResponse`
- `AuthResponse`, `EIP712Message`
- `WebSocketChannel`, `WebSocketMessage`
- And more...

### Configuration (`src/lib/pearConfig.ts`)

- API URLs and endpoints
- Client ID: `HLHackathon1`
- Default slippage (8%)
- Token lifetimes
- Local storage keys

### Authentication (`src/lib/pearAuth.ts`)

- EIP-712 message fetching
- Wallet signature login
- JWT token storage (localStorage)
- Auto token refresh
- Logout functionality

### API Client (`src/lib/pearClient.ts`)

Full API client with methods for:

- **Positions:** `getOpenPositions()`, `createPosition()`, `closePosition()`, `adjustPosition()`
- **Orders:** `getOpenOrders()`, `cancelOrder()`, `getTWAPOrders()`
- **Markets:** `getActiveMarkets()`, `getMarkets()`
- **Account:** `getAccountSummary()`, `getPortfolioMetrics()`
- **Agent Wallet:** `getAgentWallet()`, `createAgentWallet()`
- **Helper Methods:** `createPairTrade()`, `createDirectionalTrade()`

### WebSocket (`src/lib/pearWebSocket.ts`)

- Real-time connection management
- Channel subscriptions (positions, market-data, notifications)
- Auto-reconnect with exponential backoff
- Heartbeat to keep connection alive

### React Hooks (`src/hooks/usePear.ts`)

- `usePearAuth()` - Authentication state
- `usePearPositions()` - User's open positions
- `usePearMarkets()` - Active markets data
- `usePearAccount()` - Account summary & portfolio
- `usePearTradeHistory()` - Trade history
- `useExecuteTrade()` - Execute trades
- `useAgentWallet()` - Agent wallet management
- `usePearWebSocket()` - WebSocket connection

### Auth Context (`src/contexts/PearAuthContext.tsx`)

- Global authentication state
- Login/logout actions
- Account data
- Agent wallet management

### Trade Service (`src/services/tradeService.ts`)

- `executeCopyTrade()` - Copy trades from feed
- `executeBasketTrade()` - Multiple longs + shorts
- `executeTWAPTrade()` - Time-weighted orders
- `executeLimitOrder()` - Trigger orders
- `closePosition()` - Close single position
- `closeAllPositions()` - Close all positions
- `updateRiskParams()` - Update TP/SL

---

## Components Updated

### WalletConnectButton (`src/components/WalletConnectButton.tsx`)

- MetaMask/Web3 wallet connection
- EIP-712 signature flow
- Connected state with dropdown menu
- Account balance display

### CopyTradeModal (`src/components/CopyTradeModal.tsx`)

- Real trade execution via Pear API
- Leverage selection (1-20x)
- Stop loss & take profit configuration
- Loading states during execution
- Success/error feedback

### FeedScreen (`src/screens/FeedScreen.tsx`)

- Added wallet connect button to header

### PortfolioScreen (`src/screens/PortfolioScreen.tsx`)

- Real positions from Pear API
- Position closing with swipe gesture
- Real-time P&L display
- Trade history tab
- Performance stats from portfolio API

### DiscoverScreen (`src/screens/DiscoverScreen.tsx`)

- Live market data from Pear API
- Top gainers/losers
- Hot pairs from highlighted markets
- Search functionality

### App.tsx

- Wrapped with `PearAuthProvider` for global auth state

---

## How It Works

### 1. Authentication Flow

```
User clicks "Connect Wallet"
    ↓
MetaMask pops up for account selection
    ↓
Get EIP-712 message from Pear API
    ↓
User signs message in MetaMask
    ↓
Send signature to Pear /auth/login
    ↓
Receive JWT tokens (access + refresh)
    ↓
Store in localStorage
    ↓
Connect WebSocket for real-time updates
```

### 2. Copy Trade Flow

```
User taps "Copy Trade" on a trade post
    ↓
CopyTradeModal opens
    ↓
User selects amount, leverage, TP/SL
    ↓
User taps "Execute Trade"
    ↓
Build CreatePositionRequest
    ↓
POST /positions
    ↓
Show success/error feedback
```

### 3. Position Management

```
Portfolio shows real positions via GET /positions
    ↓
WebSocket updates P&L in real-time
    ↓
User swipes position to close
    ↓
POST /positions/{id}/close
    ↓
Position removed from list
```

---

## Trading Capabilities

| Feature                | Status         |
| ---------------------- | -------------- |
| Market Orders          | ✅ Implemented |
| Limit Orders (Trigger) | ✅ Implemented |
| TWAP Orders            | ✅ Implemented |
| Ladder Orders          | ✅ Ready       |
| Basket Trades          | ✅ Implemented |
| Stop Loss              | ✅ Implemented |
| Take Profit            | ✅ Implemented |
| Trailing Stop          | ✅ Ready       |
| Position Close         | ✅ Implemented |
| Position Adjust        | ✅ Ready       |
| Leverage Adjust        | ✅ Ready       |

---

## Testing

To test the integration:

1. **Start the dev server:**

   ```bash
   npm run dev
   ```

2. **Connect MetaMask wallet** (ensure you're on a supported network)

3. **Try copy trading:**
   - Browse the feed
   - Tap "Copy Trade" on any trade
   - Configure your trade
   - Execute

4. **Check Portfolio:**
   - View your positions
   - Swipe to close

5. **Discover:**
   - See real market data (top gainers/losers)

---

## Notes

- **Demo Mode:** When not connected, the app shows mock data
- **Real Mode:** When connected, uses real Pear Protocol API
- **Client ID:** Using `HLHackathon1` for all API calls
- **Security:** Private keys never leave the browser; only signatures are sent

---

## Next Steps (Future Enhancements)

1. Add agent wallet approval flow for Hyperliquid
2. Implement builder fee approval check
3. Add voice command integration for trading
4. Real-time P&L charts
5. Push notifications

---

**Built for the Hackathon 🚀**
