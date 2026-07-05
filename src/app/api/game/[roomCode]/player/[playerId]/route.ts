import { NextRequest, NextResponse } from "next/server";
import { getPrivateState } from "@/server/gameStore";
import { jsonError } from "@/server/apiError";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string; playerId: string }> }
) {
  try {
    const { roomCode, playerId } = await params;
    const state = await getPrivateState(roomCode, playerId);
    if (!state || !state.playerName) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }
    return NextResponse.json(state);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string; playerId: string }> }
) {
  await request.json().catch(() => null);
  await params;

  return NextResponse.json(
    { error: "색상은 마스터 페이지에서 변경합니다." },
    { status: 400 }
  );
}
