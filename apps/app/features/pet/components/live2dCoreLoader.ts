declare global {
  interface Window {
    PIXI?: typeof import("pixi.js");
    Live2DCubismCore?: unknown;
  }
}

const coreScriptId = "live2d-cubism-core";
const coreLoadTimeoutMs = 8000;
let cubismCorePromise: Promise<void> | null = null;

export function ensureCubismCore(src: string) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window_unavailable"));
  }
  if (window.Live2DCubismCore) {
    return Promise.resolve();
  }
  if (cubismCorePromise) {
    return cubismCorePromise;
  }
  const existing = document.getElementById(coreScriptId) as HTMLScriptElement | null;
  cubismCorePromise = new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (window.Live2DCubismCore) {
        resolve();
        return;
      }
      reject(new Error("cubism_core_unavailable"));
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cubismCorePromise = null;
      reject(new Error("cubism_core_load_failed"));
    };
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cubismCorePromise = null;
      reject(new Error("cubism_core_load_timeout"));
    }, coreLoadTimeoutMs);

    if (existing && window.Live2DCubismCore) {
      finish();
      return;
    }

    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", fail, { once: true });
    if (existing) {
      return;
    }
    script.id = coreScriptId;
    script.src = src;
    script.async = true;
    document.head.appendChild(script);
  });
  return cubismCorePromise;
}

