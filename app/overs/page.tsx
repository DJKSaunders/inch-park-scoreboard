import type { Metadata } from "next";
import { OversDisplay } from "../ui/OversDisplay";

export const metadata: Metadata = {
  title: "Overs",
  description: "Full-screen cricket overs display.",
};

export default function OversPage() {
  return <OversDisplay />;
}
