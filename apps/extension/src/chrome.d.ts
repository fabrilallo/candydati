/**
 * The few Chrome extension APIs the service worker uses (MV3), declared here instead of pulling in a types package.
 * See https://developer.chrome.com/docs/extensions/reference/api.
 */
declare namespace chrome {
  namespace runtime {
    interface MessageSender {
      readonly id?: string;
      readonly origin?: string;
      readonly url?: string;
    }
    const id: string;
    function sendMessage(message: unknown): Promise<unknown>;
    const onMessage: {
      addListener(callback: (message: unknown, sender: MessageSender, sendResponse: (response: unknown) => void) => boolean | undefined): void;
    };
    const onMessageExternal: {
      addListener(callback: (message: unknown, sender: MessageSender, sendResponse: (response: unknown) => void) => boolean | undefined): void;
    };
  }
  namespace tabs {
    interface Tab {
      readonly id?: number;
      readonly url?: string;
      readonly status?: string;
      readonly windowId: number;
    }
    function create(properties: { url: string; active?: boolean }): Promise<Tab>;
    function update(tabId: number, properties: { url?: string; active?: boolean }): Promise<Tab>;
    function get(tabId: number): Promise<Tab>;
    function remove(tabId: number): Promise<void>;
    function group(options: { tabIds: number | number[] }): Promise<number>;
    const onUpdated: {
      addListener(callback: (tabId: number, change: { status?: string; url?: string }, tab: Tab) => void): void;
      removeListener(callback: (tabId: number, change: { status?: string; url?: string }, tab: Tab) => void): void;
    };
  }
  namespace tabGroups {
    function update(groupId: number, properties: { title?: string; color?: 'blue' | 'yellow' | 'grey'; collapsed?: boolean }): Promise<unknown>;
  }
  namespace windows {
    function update(windowId: number, properties: { focused?: boolean }): Promise<unknown>;
  }
  namespace storage {
    interface StorageArea {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(key: string): Promise<void>;
    }
    const session: StorageArea;
    const local: StorageArea;
  }
  namespace scripting {
    function executeScript<R>(injection: { target: { tabId: number }; func: () => R | Promise<R> }): Promise<{ result?: Awaited<R> }[]>;
  }
}
