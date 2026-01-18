# AI Trading Agent Specification: "Intent-Based Trading"

## 1. Overview

The **AI Trading Agent** is a feature for TradeTok that translates user intent (natural language prompts or preset commands) into executable on-chain trades. Instead of manually searching, filtering, and clicking, users delegate the "Find & Execute" loop to the agent.

This implementation focuses on two primary strategies:

1.  **Social Signal**: "Copy the best trader."
2.  **Market Signal**: "Long the top gainer."

---

## 2. Architecture

### The "Brain" (Agent Service)

A lightweight service (`src/lib/agent.ts`) that acts as the orchestrator.

- **Input**: User Command (Text or Button Click).
- **Processing**: Resolves the command to a specific **Strategy**.
- **Data Fetching**: Queries existing services (`db.users`, `hyperliquidClient`).
- **Output**: A structured `TradeParams` object ready for `pearClient`.

### Workflow Visualization

```mermaid
graph TD
    A[User Prompt] --> B{Agent Router}
    B -->|Strategy A| C[Social Analysis]
    B -->|Strategy B| D[Market Analysis]
    C --> C1[Fetch Top Traders DB]
    D --> D1[Fetch Top Gainers API]
    C1 --> E[Select Target Trader]
    D1 --> F[Select Target Asset]
    E --> G[Formulate Copy Trade]
    F --> H[Formulate Long/Short]
    G --> I[Execution (PearClient)]
    H --> I
```

---

## 3. Strategies

### Strategy A: Social "Copy Trader"

- **User Intent**: "Copy trade the most profitable user."
- **Logic**:
  1.  Call `db.users.getTopTraders(limit=1)` to find the user with the highest Win Rate/PnL.
  2.  Fetch that user's _most recent_ active position via `db.posts.getByUser()`.
  3.  **Action**: Open a position with the **Same Direction** and **Same Pair**.
  4.  **Sizing**: Use a safe default (e.g., 10% of wallet) or user-specified amount.

### Strategy B: Market "Long Top Gainer" (Priority)

- **User Intent**: "Long the best performing asset right now."
- **Data Source**: Pear Protocol / Hyperliquid "Top Movers" list (already used in `DiscoverScreen`).
- **Logic**:
  1.  **Fetch**: Retrieve the 24h ticker data for all assets.
  2.  **Sort**: Order by `24h Change %` (Descending).
  3.  **Select**: Pick `index[0]` (The #1 Gainer).
  4.  **Action**: Open a **LONG** position on that asset.
  5.  **Sizing**: User-defined or safe default.

---

## 4. Implementation Details (The "Long Top Gainer" Flow)

This is the most immediate feature to build, leveraging existing data.

### Step 1: Data Source

We reuse the `hyperliquidClient` or the specific Pear Protocol search logic found in `DiscoverScreen`.

```typescript
// Pseudo-code for Agent Logic
const getTopGainer = async () => {
  const allAssets = await hyperliquidClient.getAllTickers();
  // Filter for valid pairs (USDC)
  const sorted = allAssets.sort((a, b) => b.priceChange24h - a.priceChange24h);
  return sorted[0]; // e.g. { symbol: "PEPE", change: +15.2% }
};
```

### Step 2: Execution Construction

Once we have the symbol (e.g., `PEPE`), the agent constructs the trade parameters via `pearClient`.

```typescript
const executeAutoLong = async (amount: number) => {
  const topAsset = await getTopGainer();

  await pearClient.createPosition({
    pair: `${topAsset.symbol}/USDC`,
    side: "LONG",
    leverage: 1, // Safe default
    marginAmount: amount,
    // ...
  });
};
```

---

## 5. User Interface (UI)

### Option 1: The "Agent Chat"

A text input field at the top of the feed:

> 💬 _Tell the AI to trade..._
> [ "Long the top gainer with $100" ]

### Option 2: "One-Click Strategies" (MVP)

A simplified "AI Assistant" card on the Dashboard/Discover screen with preset buttons:

- **[ 🚀 Auto-Long Top Gainer ]**
  - _Caption: "Automatically buys the highest 24h mover."_
- **[ 👥 Copy Top Trader ]**
  - _Caption: "Mirrors the #1 ranked trader's latest move."_

## 6. Safety & Confirmation

To prevent accidental draining of wallets:

1.  **Analysis Step**: The Agent strictly _analyzes_ first.
2.  **Confirmation Modal**: The Agent presents its finding to the user.
    > "I found **SOL** is up **12%**. Ready to Long with **100 USDC**?"
3.  **Execution**: User clicks "Confirm" to sign the transaction.
