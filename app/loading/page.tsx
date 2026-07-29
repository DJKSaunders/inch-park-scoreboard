"use client";

import { useEffect } from "react";

export default function LoadingPage() {
  useEffect(() => {
    const minimumDisplayTime = 3000;
    const displayedAt = Date.now();
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function waitForScoreboard() {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) throw new Error("Scoreboard unavailable");
        const remaining = Math.max(
          0,
          minimumDisplayTime - (Date.now() - displayedAt),
        );
        timer = setTimeout(() => {
          if (active) window.location.replace("/score/");
        }, remaining);
      } catch {
        timer = setTimeout(waitForScoreboard, 1000);
      }
    }

    void waitForScoreboard();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <main className="startup-page" aria-live="polite">
      <img
        className="startup-logo"
        src="/club-logo.png"
        alt="Edinburgh South Cricket Club"
      />
      <h1>Welcome to Inch Park</h1>
      <div className="startup-progress" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>Starting scoreboard</p>
    </main>
  );
}
