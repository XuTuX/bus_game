import { NextRequest, NextResponse } from "next/server";
import { getPublicState } from "@/server/gameStore";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params;
  const state = await getPublicState(roomCode);
  return NextResponse.json(state);
}
