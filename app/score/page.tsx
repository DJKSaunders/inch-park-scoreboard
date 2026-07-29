import type { Metadata } from "next";
import { ScoreDisplay } from "../ui/ScoreDisplay";

export const metadata: Metadata = {
  title: "Runs and wickets",
  description: "Full-screen cricket score display.",
};

export default function ScorePage() {
  return <ScoreDisplay />;
}
