// LLM-Powered Intent Parser using Google Gemini
// Provides intelligent natural language understanding for trading commands

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// ============================================
// TYPES
// ============================================

export type IntentAction = 
  | 'long_top_gainer'
  | 'short_top_loser'
  | 'copy_top_trader'
  | 'long_asset'
  | 'short_asset'
  | 'pair_trade'  // Long one asset, short another
  | 'basket_trade' // NEW: Multiple assets (Long [A,B], Short [C,D])
  | 'search_trades'
  | 'view_portfolio'
  | 'check_balance'
  | 'close_position'
  | 'adjust_position'
  | 'set_risk_params'
  | 'navigate'
  | 'explain'
  | 'market_analysis'
  | 'greeting'
  | 'help'
  | 'unknown';

export interface ParsedIntent {
  action: IntentAction;
  params: {
    asset?: string;
    shortAsset?: string;
    longAssets?: string[];  // NEW: For basket trades
    shortAssets?: string[]; // NEW: For basket trades
    amount?: number;
    leverage?: number;
    direction?: 'LONG' | 'SHORT';
    stopLoss?: number;
    takeProfit?: number;
    positionId?: string;
    query?: string;
    screen?: string;
  };
  confidence: number; // 0-1
  requiresConfirmation: boolean;
  response: string; // Friendly message to show user
}

export interface ChatContext {
  currentScreen: 'feed' | 'portfolio' | 'discover' | 'profile';
  selectedTradeId?: string;
  selectedTradePair?: string;
  selectedPositionId?: string;
  userBalance?: number;
  openPositionsCount?: number;
}

// ============================================
// SYSTEM PROMPT
// ============================================

const SYSTEM_PROMPT = `You are TradeTok AI, a friendly and intelligent trading assistant. You help users trade cryptocurrencies, check their portfolio, and understand the market.

IMPORTANT: You MUST respond with ONLY a valid JSON object. No markdown, no explanations, just pure JSON.

AVAILABLE ACTIONS:
1. long_top_gainer - Long the crypto with highest 24h gains
2. short_top_loser - Short the crypto with worst 24h performance  
3. copy_top_trader - Copy the best trader's latest trade
4. long_asset - Long a specific crypto (e.g. "long BTC")
5. short_asset - Short a specific crypto (e.g. "short ETH")
6. pair_trade - Long one asset while shorting another (e.g. "pair trade BTC/SOL")
7. basket_trade - Long multiple assets and/or short multiple assets (e.g. "Long BTC, ETH and short SOL")
8. view_portfolio - Show portfolio, positions, or P&L
9. check_balance - Check account balance or available funds
10. close_position - Close a trading position
10. search_trades - Find or filter trades

PARAMETER RULES:
- Extract 'takeProfit' (TP) and 'stopLoss' (SL) as percentages (numbers).
- Example: "tp 50%"Or "take profit 50" -> takeProfit: 50
- Example: "sl 10%" or "stop loss 10" -> stopLoss: 10
11. market_analysis - Analyze market conditions or trending coins
12. explain - Explain trading concepts
13. greeting - Respond to greetings (hi, hello, hey)
14. help - Show what you can do
15. unknown - Cannot understand (avoid this - try to help!)

JSON FORMAT (always use this exact structure):
{
  "action": "action_name",
  "params": {},
  "confidence": 0.9,
  "requiresConfirmation": false,
  "response": "Your friendly message here"
}

EXAMPLES:

User: "whats my balance"
{"action":"check_balance","params":{},"confidence":0.95,"requiresConfirmation":false,"response":"💰 Let me check your balance! Head to the Portfolio tab to see your full account details, or I can show you trending trades to invest in."}

User: "hi" or "hello" or "hey"
{"action":"greeting","params":{},"confidence":0.99,"requiresConfirmation":false,"response":"Hey there! 👋 I'm your AI trading assistant. I can help you long the top gainer, copy successful traders, or analyze the market. What would you like to do?"}

User: "what can you do" or "help"
{"action":"help","params":{},"confidence":0.95,"requiresConfirmation":false,"response":"I can help you:\\n• 🚀 Long the top gainer - 'Long the best performer'\\n• 📉 Short losers - 'Short SOL'\\n• 👥 Copy traders - 'Copy the top trader'\\n• 📊 Check portfolio - 'Show my positions'\\n• 💡 Explain concepts - 'What is leverage?'\\nJust ask!"}

User: "long btc with $200"
{"action":"long_asset","params":{"asset":"BTC","amount":200,"leverage":1},"confidence":0.95,"requiresConfirmation":false,"response":"🚀 Setting up a $200 long position on BTC..."}

User: "whats trending" or "top gainers"
{"action":"market_analysis","params":{"query":"trending"},"confidence":0.9,"requiresConfirmation":false,"response":"📈 Let me find today's hottest movers! Check the Discover tab for real-time top gainers and losers."}

User: "show my portfolio" or "my positions"
{"action":"view_portfolio","params":{},"confidence":0.95,"requiresConfirmation":false,"response":"� Navigating to your Portfolio to show your open positions and P&L..."}

User: "how much money do I have"
{"action":"check_balance","params":{},"confidence":0.95,"requiresConfirmation":false,"response":"💰 Your balance is shown in the Portfolio tab. Connect your wallet first if you haven't already!"}

User: "long the top gainer with $100"
{"action":"long_top_gainer","params":{"amount":100,"leverage":1},"confidence":0.95,"requiresConfirmation":false,"response":"� Finding today's top gainer to long with $100..."}

User: "what is leverage"
{"action":"explain","params":{"query":"leverage"},"confidence":0.95,"requiresConfirmation":false,"response":"⚡ Leverage lets you control a larger position with less capital. 2x leverage means $50 controls $100 worth of crypto. Higher leverage = higher risk and reward. I recommend starting with 1-2x!"}

User: "copy the best trader"
{"action":"copy_top_trader","params":{"amount":50,"leverage":1},"confidence":0.9,"requiresConfirmation":false,"response":"👥 Finding the top performing trader to copy their latest trade..."}

User: "pair trade BTC/SOL" or "pair trade btc and sol"
{"action":"pair_trade","params":{"asset":"BTC","shortAsset":"SOL"},"confidence":0.95,"requiresConfirmation":false,"response":"📊 Setting up a pair trade: Long BTC / Short SOL..."}

User: "long BTC short ETH" or "long btc and short eth"
{"action":"pair_trade","params":{"asset":"BTC","shortAsset":"ETH"},"confidence":0.95,"requiresConfirmation":false,"response":"📊 Setting up a pair trade: Long BTC / Short ETH..."}

User: "pair BTC/SOL with $50"
{"action":"pair_trade","params":{"asset":"BTC","shortAsset":"SOL","amount":50},"confidence":0.95,"requiresConfirmation":false,"response":"📊 Setting up a $50 pair trade: Long BTC / Short SOL..."}

User: "pair BTC/ETH tp 50% sl 10%"
{"action":"pair_trade","params":{"asset":"BTC","shortAsset":"ETH","takeProfit":50,"stopLoss":10},"confidence":0.95,"requiresConfirmation":false,"response":"📊 Pair trade BTC/ETH with TP 50% and SL 10%."}

User: "trade BTC against SOL" or "bet BTC vs SOL"
{"action":"pair_trade","params":{"asset":"BTC","shortAsset":"SOL"},"confidence":0.9,"requiresConfirmation":false,"response":"📊 Creating a pair trade: Long BTC / Short SOL - betting BTC outperforms SOL!"}

User: "long BTC and ETH, short SOL"
{"action":"basket_trade","params":{"longAssets":["BTC","ETH"],"shortAssets":["SOL"]},"confidence":0.95,"requiresConfirmation":false,"response":"🧺 Setting up a basket trade: Long [BTC, ETH] / Short [SOL]..."}

User: "basket trade: long AI tokens (TAO, FET) and short memecoins (PEPE)"
{"action":"basket_trade","params":{"longAssets":["TAO","FET"],"shortAssets":["PEPE"]},"confidence":0.9,"requiresConfirmation":false,"response":"🧺 Creating a custom basket: Longing AI tokens, Shorting memecoins..."}

User: "long SOL, AVAX and short ETH, BTC"
{"action":"basket_trade","params":{"longAssets":["SOL","AVAX"],"shortAssets":["ETH","BTC"]},"confidence":0.95,"requiresConfirmation":false,"response":"🧺 Setting up a diversified basket trade..."}

BE HELPFUL: If someone asks something unclear, make your best guess and provide a helpful response. Never say you don't understand - always try to help!`;

// ============================================
// LLM PARSER CLASS
// ============================================

class GeminiParser {
  private apiKey: string;
  private conversationHistory: Array<{ role: 'user' | 'model'; text: string }> = [];
  private maxHistoryLength = 10;
  // Use gemini-2.5-flash (updated model name)
  private readonly MODEL_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  constructor() {
    this.apiKey = GEMINI_API_KEY || '';
    console.log('[GeminiParser] API key loaded:', this.apiKey ? 'Yes' : 'No');
  }

  /**
   * Check if LLM parsing is available
   */
  isAvailable(): boolean {
    return !!this.apiKey && this.apiKey.length > 10;
  }

  /**
   * Parse user input using Gemini
   */
  async parse(userInput: string, context?: ChatContext): Promise<ParsedIntent | null> {
    if (!this.isAvailable()) {
      console.log('[GeminiParser] API key not available, skipping LLM');
      return null;
    }

    console.log('[GeminiParser] Processing:', userInput);

    try {
      // Build context string
      const contextStr = context ? `
CURRENT CONTEXT:
- Screen: ${context.currentScreen}
- Viewing trade: ${context.selectedTradePair || 'none'}
- User balance: $${context.userBalance?.toFixed(2) || 'unknown'}
- Open positions: ${context.openPositionsCount ?? 'unknown'}
` : '';

      // Build the full prompt
      const fullPrompt = `${SYSTEM_PROMPT}

${contextStr}

User message: "${userInput}"

RESPOND WITH ONLY A JSON OBJECT, nothing else:`;

      const requestBody = {
        contents: [{
          parts: [{ text: fullPrompt }]
        }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 500,
        }
      };

      console.log('[GeminiParser] Calling API...');
      
      const response = await fetch(`${this.MODEL_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GeminiParser] API error:', response.status, errorText);
        return null;
      }

      const data = await response.json();
      console.log('[GeminiParser] Raw response:', JSON.stringify(data).slice(0, 500));
      
      // Extract text from response
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        console.error('[GeminiParser] No response text from Gemini');
        return null;
      }

      console.log('[GeminiParser] Response text:', responseText);

      // Parse JSON from response (handle potential markdown wrapping)
      let jsonStr = responseText.trim();
      
      // Remove markdown code blocks if present
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\s*/gi, '').replace(/```\s*$/gi, '').trim();
      }
      
      // Try to find JSON object in the response
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      console.log('[GeminiParser] Parsing JSON:', jsonStr);
      const parsed: ParsedIntent = JSON.parse(jsonStr);

      // Validate required fields
      if (!parsed.action || !parsed.response) {
        console.error('[GeminiParser] Invalid parsed response:', parsed);
        return null;
      }

      // Add to conversation history
      this.addToHistory('user', userInput);
      this.addToHistory('model', parsed.response);

      console.log('[GeminiParser] Successfully parsed:', parsed.action);
      return parsed;
    } catch (error) {
      console.error('[GeminiParser] Error:', error);
      return null;
    }
  }

  /**
   * Add message to conversation history
   */
  private addToHistory(role: 'user' | 'model', text: string) {
    this.conversationHistory.push({ role, text });
    
    // Keep history limited
    if (this.conversationHistory.length > this.maxHistoryLength * 2) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength * 2);
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Get a conversational response for general queries
   */
  async chat(userInput: string, context?: ChatContext): Promise<string> {
    const intent = await this.parse(userInput, context);
    
    if (intent) {
      return intent.response;
    }
    
    return "I'm not sure what you mean. Try commands like 'Long the top gainer' or 'Show my portfolio'.";
  }
}

// ============================================
// RULE-BASED FALLBACK PARSER
// ============================================

export function parseWithRules(input: string): ParsedIntent | null {
  const lower = input.toLowerCase().trim();

  // Long top gainer patterns
  if (lower.includes('long') && (lower.includes('top gainer') || lower.includes('best performer') || lower.includes('top mover'))) {
    return {
      action: 'long_top_gainer',
      params: {
        amount: extractAmount(lower),
        leverage: extractLeverage(lower),
      },
      confidence: 0.8,
      requiresConfirmation: false,
      response: "🚀 Finding today's top gainer to long...",
    };
  }

  // Short top loser patterns
  if (lower.includes('short') && (lower.includes('top loser') || lower.includes('worst') || lower.includes('biggest loser'))) {
    return {
      action: 'short_top_loser',
      params: {
        amount: extractAmount(lower),
        leverage: extractLeverage(lower),
      },
      confidence: 0.8,
      requiresConfirmation: false,
      response: "📉 Finding today's biggest loser to short...",
    };
  }

  // Copy trader patterns
  if (lower.includes('copy') && (lower.includes('trader') || lower.includes('top') || lower.includes('best'))) {
    return {
      action: 'copy_top_trader',
      params: {
        amount: extractAmount(lower),
        leverage: extractLeverage(lower),
      },
      confidence: 0.8,
      requiresConfirmation: false,
      response: "👥 Finding the top trader to copy...",
    };
  }

  // Long specific asset
  const longMatch = lower.match(/long\s+(\w+)/);
  if (longMatch) {
    const asset = longMatch[1].toUpperCase();
    if (asset !== 'THE' && asset !== 'TOP' && asset !== 'A') {
      return {
        action: 'long_asset',
        params: {
          asset,
          direction: 'LONG',
          amount: extractAmount(lower),
          leverage: extractLeverage(lower),
        },
        confidence: 0.85,
        requiresConfirmation: false,
        response: `🚀 Preparing to long ${asset}...`,
      };
    }
  }

  // Short specific asset
  const shortMatch = lower.match(/short\s+(\w+)/);
  if (shortMatch) {
    const asset = shortMatch[1].toUpperCase();
    if (asset !== 'THE' && asset !== 'TOP' && asset !== 'A') {
      return {
        action: 'short_asset',
        params: {
          asset,
          direction: 'SHORT',
          amount: extractAmount(lower),
          leverage: extractLeverage(lower),
        },
        confidence: 0.85,
        requiresConfirmation: false,
        response: `📉 Preparing to short ${asset}...`,
      };
    }
  }

  // Portfolio commands
  if (lower.includes('portfolio') || lower.includes('my position') || lower.includes('my trades') || lower.includes('my pnl')) {
    return {
      action: 'view_portfolio',
      params: {},
      confidence: 0.9,
      requiresConfirmation: false,
      response: "📊 Loading your portfolio...",
    };
  }

  // Help command
  if (lower.includes('help') || lower.includes('what can you do') || lower.includes('commands')) {
    return {
      action: 'help',
      params: {},
      confidence: 0.95,
      requiresConfirmation: false,
      response: `Here's what I can do:
• "Long the top gainer" - Long today's best performer
• "Short SOL with $100" - Short a specific asset
• "Copy the top trader" - Mirror the best trader
• "Show my portfolio" - View your positions
• "Close my BTC position" - Close a trade`,
    };
  }

  return null;
}

// Helper functions
function extractAmount(text: string): number {
  const patterns = [
    /\$(\d+(?:\.\d+)?)/,
    /(\d+(?:\.\d+)?)\s*(?:usd|dollars?)/i,
    /(?:with|using)\s+(\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1]);
    }
  }

  return 50; // Default $50
}

function extractLeverage(text: string): number {
  const match = text.match(/(\d+)x\s*(?:leverage)?/i);
  if (match) {
    const leverage = parseInt(match[1], 10);
    return Math.min(leverage, 5); // Max 5x for safety
  }
  return 1; // Default 1x
}

// ============================================
// HYBRID PARSER (LLM + Rules)
// ============================================

class HybridParser {
  private gemini: GeminiParser;

  constructor() {
    this.gemini = new GeminiParser();
  }

  /**
   * Parse using hybrid approach: rules first, then LLM
   */
  async parse(input: string, context?: ChatContext): Promise<ParsedIntent> {
    // First try rule-based parsing (fast path)
    const ruleResult = parseWithRules(input);
    if (ruleResult && ruleResult.confidence >= 0.8) {
      console.log('Using rule-based parsing:', ruleResult.action);
      return ruleResult;
    }

    // Fall back to LLM for complex queries
    if (this.gemini.isAvailable()) {
      console.log('Falling back to Gemini LLM...');
      const llmResult = await this.gemini.parse(input, context);
      if (llmResult) {
        console.log('LLM parsed:', llmResult.action);
        return llmResult;
      }
    }

    // If both fail, return unknown with help message
    return {
      action: 'unknown',
      params: {},
      confidence: 0,
      requiresConfirmation: false,
      response: "I'm not sure what you mean. Try saying \"Long the top gainer\" or \"Help\" to see available commands.",
    };
  }

  /**
   * Check if LLM is available
   */
  isLLMAvailable(): boolean {
    return this.gemini.isAvailable();
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.gemini.clearHistory();
  }
}

// Export singleton
export const hybridParser = new HybridParser();
export const geminiParser = new GeminiParser();
