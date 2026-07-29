import { NextResponse } from "next/server";
import {
  clearScoreboard,
  getScoreboardState,
  scoreDelivery,
  selectMatch,
  undoLastScore,
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
      action?: "select" | "update" | "score" | "undo" | "clear";
      matchId?: string;
      runs?: number;
      wickets?: number;
      completedOvers?: number;
      balls?: number;
      runsAdded?: number;
      wicketAdded?: boolean;
      legalBall?: boolean;
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

    if (
      body.action === "score" &&
      typeof body.runsAdded === "number" &&
      typeof body.legalBall === "boolean"
    ) {
      return NextResponse.json(
        await scoreDelivery({
          runsAdded: body.runsAdded,
          wicketAdded: body.wicketAdded ?? false,
          legalBall: body.legalBall,
        }),
      );
    }

    if (body.action === "undo") {
      return NextResponse.json(await undoLastScore());
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
