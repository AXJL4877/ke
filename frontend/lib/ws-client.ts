type MessageHandler = (data: unknown) => void;

/**
 * WebSocket / SSE 单例连接管理。
 * 优先 WebSocket；失败时可扩展为 EventSource。
 */
class WsClient {
  private socket: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url?: string) {
    this.url =
      url ||
      process.env.NEXT_PUBLIC_WS_URL ||
      "ws://localhost:8000/ws";
  }

  connect() {
    if (typeof window === "undefined") return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.socket = new WebSocket(this.url);
    this.socket.onmessage = (ev) => {
      let data: unknown = ev.data;
      try {
        data = JSON.parse(String(ev.data));
      } catch {
        /* raw */
      }
      this.handlers.forEach((h) => h(data));
    };
    this.socket.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };
  }

  subscribe(handler: MessageHandler) {
    this.handlers.add(handler);
    this.connect();
    return () => {
      this.handlers.delete(handler);
    };
  }

  send(payload: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(typeof payload === "string" ? payload : JSON.stringify(payload));
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }
}

export const wsClient = new WsClient();
