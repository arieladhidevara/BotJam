const encoder = new TextEncoder();

type Client = {
  id: number;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

type SseMessage = {
  event: string;
  data: unknown;
};

class LiveHub {
  private clients = new Map<number, Client>();
  private nextId = 1;

  addClient(controller: ReadableStreamDefaultController<Uint8Array>): number {
    const id = this.nextId++;
    this.clients.set(id, { id, controller });
    return id;
  }

  removeClient(id: number): void {
    this.clients.delete(id);
  }

  send(id: number, message: SseMessage): void {
    const client = this.clients.get(id);
    if (!client) return;
    if (!this.enqueue(client, formatMessage(message))) {
      this.clients.delete(id);
    }
  }

  sendKeepAlive(id: number): void {
    const client = this.clients.get(id);
    if (!client) return;
    if (!this.enqueue(client, ": keep-alive\n\n")) {
      this.clients.delete(id);
    }
  }

  broadcast(message: SseMessage): void {
    const payload = formatMessage(message);
    for (const client of this.clients.values()) {
      if (!this.enqueue(client, payload)) {
        this.clients.delete(client.id);
      }
    }
  }

  private enqueue(client: Client, payload: string): boolean {
    try {
      client.controller.enqueue(encoder.encode(payload));
      return true;
    } catch {
      return false;
    }
  }
}

function formatMessage(message: SseMessage): string {
  return `event: ${message.event}\ndata: ${JSON.stringify(message.data)}\n\n`;
}

declare global {
  // eslint-disable-next-line no-var
  var botjamLiveHub: LiveHub | undefined;
}

export const liveHub = globalThis.botjamLiveHub ?? new LiveHub();
if (!globalThis.botjamLiveHub) {
  globalThis.botjamLiveHub = liveHub;
}
