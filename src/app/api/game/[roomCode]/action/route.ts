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
    const { playerId, actions, bus } = body as {
      playerId: string;
      actions: TurnAction[];
      bus?: any;
    };

    if (!playerId) {
      return NextResponse.json(
        { error: "playerId is required" },
        { status: 400 }
      );
    }

    await submitTurn(roomCode, playerId, actions || [], bus);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
