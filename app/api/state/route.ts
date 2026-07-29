import { NextResponse } from "next/server";
import {
  clearScoreboard,
  getScoreboardState,
  selectMatch,
  updateScore,
} from "../../lib/scoreboard-db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getScoreboardState(), {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "select" | "update" | "clear";
      matchId?: string;
      runs?: number;
      wickets?: number;
      completedOvers?: number;
      balls?: number;
    };

    if (body.action === "select" && body.matchId) {
      return NextResponse.json(await selectMatch(body.matchId));
    }

    if (body.action === "update") {
      return NextResponse.json(
        await updateScore({
          runs: body.runs,
          wickets: body.wickets,
          completedOvers: body.completedOvers,
          balls: body.balls,
        }),
      );
    }

    if (body.action === "clear") {
      return NextResponse.json(await clearScoreboard());
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed." },
      { status: 400 },
    );
  }
}
