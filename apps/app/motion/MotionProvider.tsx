import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { AccessibilityInfo, Platform } from "react-native";

import { MotionLayer, type MotionFlightRequest, type MotionRect } from "@/motion/MotionLayer";

type MotionContextValue = {
  reducedMotion: boolean;
  playQuickInteractionFlight: (request: MotionFlightRequest) => void;
};

const MotionContext = createContext<MotionContextValue | undefined>(undefined);

export function MotionProvider({ children }: PropsWithChildren) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [flights, setFlights] = useState<MotionFlightRequest[]>([]);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setReducedMotion(enabled);
        }
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);

    if (Platform.OS === "web" && typeof window !== "undefined" && window.matchMedia) {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(query.matches);
      const update = () => setReducedMotion(query.matches);
      query.addEventListener?.("change", update);
      return () => {
        mounted = false;
        subscription.remove();
        query.removeEventListener?.("change", update);
      };
    }

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const value = useMemo<MotionContextValue>(
    () => ({
      reducedMotion,
      playQuickInteractionFlight: (request) => {
        setFlights((items) => [...items.slice(-3), { ...request, id: request.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}` }]);
      },
    }),
    [reducedMotion],
  );

  return (
    <MotionContext.Provider value={value}>
      {children}
      <MotionLayer reducedMotion={reducedMotion} flights={flights} onFlightDone={(id) => setFlights((items) => items.filter((item) => item.id !== id))} />
    </MotionContext.Provider>
  );
}

export function useMotion() {
  const context = useContext(MotionContext);
  if (!context) {
    throw new Error("useMotion must be used inside MotionProvider");
  }
  return context;
}

export type { MotionFlightRequest, MotionRect };
