import { NextResponse } from "next/server";
import {
  clearScoreboard,
  getScoreboardState,
  resetScore,
  scoreDelivery,
  selectMatch,
  startSecondInnings,
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
      action?:
        | "select"
        | "update"
        | "score"
        | "undo"
        | "reset"
        | "next_innings"
        | "clear";
      matchId?: string;
      runs?: number;
      wickets?: number;
      completedOvers?: number;
      balls?: number;
      innings?: number;
      runsAdded?: number;
      wicketAdded?: boolean;
      legalBall?: boolean;
      confirmation?: string;
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
          innings: body.innings,
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

    if (body.action === "reset") {
      if (body.confirmation !== "RESET") {
        return NextResponse.json(
          { error: "Type RESET to confirm." },
          { status: 400 },
        );
      }
      return NextResponse.json(await resetScore());
    }

    if (body.action === "next_innings") {
      return NextResponse.json(await startSecondInnings());
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
