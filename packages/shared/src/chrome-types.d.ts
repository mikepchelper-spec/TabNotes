declare const chrome: {
  storage: {
    local: {
      get(keys: string, callback: (result: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
      remove(keys: string, callback?: () => void): void;
    };
  };
  tabs: {
    query(queryInfo: object, callback: (tabs: chrome.tabs.Tab[]) => void): void;
  };
  runtime: {
    openOptionsPage(): void;
  };
  action: {
    openPopup(): void;
  };
} | undefined;

declare namespace chrome {
  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
    }
  }
}
