"use client";

import { useCallback, useEffect, useState } from "react";
import { idleState, type ScoreboardState } from "../lib/matches";

export function useScoreboard(pollInterval = 1000) {
  const [state, setState] = useState<ScoreboardState>(idleState);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) return;
      setState((await response.json()) as ScoreboardState);
      setLoaded(true);
    } catch {
      // Keep the last confirmed score on screen during a temporary outage.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), pollInterval);
    return () => window.clearInterval(timer);
  }, [pollInterval, refresh]);

  return { state, setState, loaded, refresh };
}
