import { NextRequest, NextResponse } from "next/server";
import { submitTurn } from "@/server/gameStore";
import { type TurnAction } from "@/lib/game";
import { getErrorMessage } from "@/server/apiError";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const body = await request.json();
    const { playerId, actions, bus, mode } = body as {
      playerId: string;
      actions: TurnAction[];
      bus?: any;
      mode?: "BUS" | "SUBWAY" | "CANCEL" | "CANCEL_SUBWAY";
    };

    if (!playerId) {
      return NextResponse.json(
        { error: "playerId is required" },
        { status: 400 }
      );
    }

    await submitTurn(roomCode, playerId, actions || [], bus, mode);

    return NextResponse.json(
      { success: true },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
