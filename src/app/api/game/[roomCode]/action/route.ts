import { NextRequest, NextResponse } from "next/server";
import { submitTurn } from "@/server/gameStore";
import { type TurnAction } from "@/lib/game";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const body = await request.json();
    const { playerId, actions } = body as {
      playerId: string;
      actions: TurnAction[];
    };

    if (!playerId) {
      return NextResponse.json(
        { error: "playerId is required" },
        { status: 400 }
      );
    }

    submitTurn(roomCode, playerId, actions || []);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
