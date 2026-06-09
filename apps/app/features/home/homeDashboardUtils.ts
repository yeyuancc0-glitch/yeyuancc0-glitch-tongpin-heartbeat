export type QueryResult<T> = { data: T | null; error: { message?: string } | null };

export function waitForIdle(timeoutMs = 650) {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      setTimeout(resolve, 0);
      return;
    }

    const webWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
    };
    if (typeof webWindow.requestIdleCallback === "function") {
      webWindow.requestIdleCallback(resolve, { timeout: timeoutMs });
      return;
    }

    window.setTimeout(resolve, timeoutMs);
  });
}

export function queryDataOrFallback<T>(label: string, result: QueryResult<T>, errorFallback: T, emptyFallback: T) {
  if (result.error) {
    console.warn(`Couple dashboard ${label} load failed:`, result.error.message ?? result.error);
    return errorFallback;
  }

  return result.data ?? emptyFallback;
}
