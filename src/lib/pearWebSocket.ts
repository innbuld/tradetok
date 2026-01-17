// Pear Protocol WebSocket Manager

import { PEAR_CONFIG } from './pearConfig';
import type { WebSocketChannel, WebSocketSubscribeMessage, WebSocketMessage } from '@/types/pear';

type MessageHandler = (data: unknown) => void;

class PearWebSocketManager {
  private ws: WebSocket | null = null;
  private userAddress: string | null = null;
  private subscribedChannels: WebSocketChannel[] = [];
  private messageHandlers: Map<WebSocketChannel, Set<MessageHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Connect to WebSocket with user address
   */
  connect(userAddress: string): void {
    if (this.isConnecting || (this.ws?.readyState === WebSocket.OPEN && this.userAddress === userAddress)) {
      return;
    }

    this.userAddress = userAddress;
    this.isConnecting = true;

    try {
      this.ws = new WebSocket(PEAR_CONFIG.WS_URL);

      this.ws.onopen = () => {
        console.log('[PearWS] Connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Resubscribe to channels
        if (this.subscribedChannels.length > 0) {
          this.subscribe(this.subscribedChannels);
        }

        // Start heartbeat
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[PearWS] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[PearWS] Error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        console.log('[PearWS] Disconnected');
        this.isConnecting = false;
        this.stopHeartbeat();
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('[PearWS] Connection error:', error);
      this.isConnecting = false;
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    this.stopHeartbeat();
    this.subscribedChannels = [];
    this.messageHandlers.clear();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.userAddress = null;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
  }

  /**
   * Subscribe to channels
   */
  subscribe(channels: WebSocketChannel[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.userAddress) {
      // Store channels for later subscription
      this.subscribedChannels = [...new Set([...this.subscribedChannels, ...channels])];
      return;
    }

    const message: WebSocketSubscribeMessage = {
      action: 'subscribe',
      address: this.userAddress,
      channels,
    };

    this.ws.send(JSON.stringify(message));
    this.subscribedChannels = [...new Set([...this.subscribedChannels, ...channels])];
    console.log('[PearWS] Subscribed to:', channels);
  }

  /**
   * Unsubscribe from channels
   */
  unsubscribe(channels: WebSocketChannel[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.userAddress) {
      return;
    }

    const message: WebSocketSubscribeMessage = {
      action: 'unsubscribe',
      address: this.userAddress,
      channels,
    };

    this.ws.send(JSON.stringify(message));
    this.subscribedChannels = this.subscribedChannels.filter(c => !channels.includes(c));
    console.log('[PearWS] Unsubscribed from:', channels);
  }

  /**
   * Add message handler for a channel
   */
  addHandler(channel: WebSocketChannel, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(channel)) {
      this.messageHandlers.set(channel, new Set());
    }
    
    this.messageHandlers.get(channel)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.messageHandlers.get(channel)?.delete(handler);
    };
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: WebSocketMessage): void {
    const handlers = this.messageHandlers.get(message.channel);
    
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message.data);
        } catch (error) {
          console.error(`[PearWS] Handler error for ${message.channel}:`, error);
        }
      });
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts || !this.userAddress) {
      console.log('[PearWS] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`[PearWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      if (this.userAddress) {
        this.connect(this.userAddress);
      }
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state
   */
  getState(): 'connecting' | 'open' | 'closing' | 'closed' {
    if (!this.ws) return 'closed';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'open';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'closed';
      default: return 'closed';
    }
  }
}

// Export singleton instance
export const pearWebSocket = new PearWebSocketManager();
