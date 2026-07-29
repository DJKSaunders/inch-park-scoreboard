import { NextResponse } from "next/server";
import {
  clearScoreboard,
  getScoreboardState,
  resetScore,
  scoreDelivery,
  selectMatch,
  startManualScoreboard,
  startSecondInnings,
  undoLastScore,
  updateScore,
} from "../../lib/scoreboard-db";

export const dynamic = "force-dynamic";

const allowedOrigins = new Set([
  "https://djksaunders.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  return {
    ...(origin && allowedOrigins.has(origin)
      ? { "access-control-allow-origin": origin }
      : {}),
    "access-control-allow-headers": "content-type,x-scoreboard-password",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...corsHeaders(request),
      "cache-control": "no-store",
    },
  });
}

function isAuthorised(request: Request) {
  const expected = process.env.SCORER_PASSWORD;
  const supplied = request.headers.get("x-scoreboard-password");
  return Boolean(expected && supplied && supplied === expected);
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  return json(request, await getScoreboardState());
}

export async function POST(request: Request) {
  if (!isAuthorised(request)) {
    return json(request, { error: "Incorrect scoring password." }, 401);
  }

  try {
    const body = (await request.json()) as {
      action?:
        | "authenticate"
        | "start"
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

    if (body.action === "authenticate") {
      return json(request, await getScoreboardState());
    }

    if (body.action === "start") {
      return json(request, await startManualScoreboard());
    }

    if (body.action === "select" && body.matchId) {
      return json(request, await selectMatch(body.matchId));
    }

    if (body.action === "update") {
      return json(
        request,
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
      return json(
        request,
        await scoreDelivery({
          runsAdded: body.runsAdded,
          wicketAdded: body.wicketAdded ?? false,
          legalBall: body.legalBall,
        }),
      );
    }

    if (body.action === "undo") {
      return json(request, await undoLastScore());
    }

    if (body.action === "reset") {
      if (body.confirmation !== "RESET") {
        return json(request, { error: "Type RESET to confirm." }, 400);
      }
      return json(request, await resetScore());
    }

    if (body.action === "next_innings") {
      return json(request, await startSecondInnings());
    }

    if (body.action === "clear") {
      return json(request, await clearScoreboard());
    }

    return json(request, { error: "Invalid action." }, 400);
  } catch (error) {
    return json(
      request,
      { error: error instanceof Error ? error.message : "Request failed." },
      400,
    );
  }
}
