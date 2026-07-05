import { NextRequest, NextResponse } from "next/server";
import { getPublicState } from "@/server/gameStore";
import { jsonError } from "@/server/apiError";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const state = await getPublicState(roomCode);
    if (!state) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    return NextResponse.json(state);
  } catch (error) {
    return jsonError(error);
  }
}
