import { NextRequest, NextResponse } from "next/server";
import { choosePlayerColour, getPrivateState } from "@/server/gameStore";
import { Colour } from "@/lib/game";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string; playerId: string }> }
) {
  const { roomCode, playerId } = await params;
  const state = getPrivateState(roomCode, playerId);
  if (!state.team) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  return NextResponse.json(state);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string; playerId: string }> }
) {
  try {
    const { roomCode, playerId } = await params;
    const body = await request.json();
    const participant = choosePlayerColour(roomCode, playerId, body.colour as Colour);

    return NextResponse.json({ participant });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
