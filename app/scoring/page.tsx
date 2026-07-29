import type { Metadata } from "next";
import { ScoringConsole } from "../ui/ScoringConsole";

export const metadata: Metadata = {
  title: "Scoreboard control",
  description: "Mobile cricket scoring controls for the paired displays.",
};

export default function ScoringPage() {
  return <ScoringConsole />;
}
