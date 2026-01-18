# TradeTok 🚀

**The Social Layer for Sophisticated Trading**

TradeTok democratizes hedge-fund strategies by combining the viral discovery of TikTok with institutional-grade portfolio management. It allows users to create, share, and instantly copy complex "Pair" and "Basket" trades with a single click.

## Key Features

- **📱 Viral Finance Feed**: Discover trade ideas not just through charts, but through narratives and social proof. A vertical feed of trade theses, live PnL, and performance stats.
- **🧺 Basket Trading**: Create your own "indices" or themes.
  - _Example_: "Long L1 Killer" (Long SOL + AVAX / Short ETH).
  - Users can construct weighted portfolios of multiple long and short assets that act as a single instrument.
- **⚡ One-Click Execution**: Instantly copy entire strategies. No need to manually open 5 different positions. One click executes the entire basket atomically.
- **🔒 Non-Custodial & Secure**: All trades are executed directly from your wallet via EIP-712 signatures. You maintain full control of your funds on Hyperliquid.

## What You Can Do with TradeTok

- **Copy Trade Whales**: See a profitable trade in your feed? Mirror it instantly with your own size using the Pear Engine.
- **Build & Share Custom Baskets**: Don't just trade SOL. Create a "Solana Ecosystem" basket (Long SOL, JUP, WIF) and share it with your followers.
- **Execute Pair Trades**: Bet on relative performance (e.g., "Long BTC / Short ETH") to profit even in chop, handled automatically as a single entity.
- **Track Live Performance**: View real-time PnL of every trade in the feed to verify who is actually winning before you copy.
- **Manage Portfolio**: Close sophisticated multi-leg positions with a single click or swipe.
- **Chat to Trade**: Use our AI Agent to execute trades with natural language (e.g., "Long the top gainer with $50").

## Powered by Pear Protocol 🍐

TradeTok is built on top of the **Pear Protocol API**. We leverage Pear's advanced execution engine to handle the complexity of multi-leg trades.

- **Atomic Execution**: Pear allows us to bundle multiple Long and Short positions into a single transaction.
- **Simplified Collateral**: Manage margin for the entire basket rather than individual positions.
- **Real-Time Data**: Fast, websocket-based pricing and order updates.

## Tech Stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS
- **Execution**: Pear Protocol SDK/API
- **Underlying Exchange**: Hyperliquid (Arbitrum L3)
- **Backend/Data**: Supabase

## Getting Started

1.  **Clone the repository**

    ```bash
    git clone https://github.com/yourusername/tradetok.git
    cd tradetok
    ```

2.  **Install dependencies**

    ```bash
    npm install
    ```

3.  **Environment Setup**
    Copy the example env file and add your configuration (if necessary).

    ```bash
    cp .env.example .env
    ```

4.  **Run the development server**
    ```bash
    npm run dev
    ```

## How It Works

1.  **Connect Wallet**: Login with your Arbitrum/Hyperliquid wallet.
2.  **Discover**: Scroll through the feed to find profitable traders and interesting narratives.
3.  **Copy**: Click "Copy Trade" on any post.
4.  **Execute**: The app constructs the payload and sends it to Pear Protocol, which executes all legs of the trade instantly.

---

_Built for the PearProtocol Hackathon_
