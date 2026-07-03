import { NextRequest, NextResponse } from "next/server";
import { adminStartGame, adminStartTurn, adminRevealTurn, adminNext } from "@/server/gameStore";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const body = await request.json();
    const { action } = body as { action: "start_game" | "start" | "reveal" | "next" };

    if (action === "start_game") {
      adminStartGame(roomCode);
    } else if (action === "start") {
      adminStartTurn(roomCode);
    } else if (action === "reveal") {
      adminRevealTurn(roomCode);
    } else if (action === "next") {
      adminNext(roomCode);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
