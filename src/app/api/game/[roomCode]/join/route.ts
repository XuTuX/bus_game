import { NextRequest, NextResponse } from "next/server";
import { joinRoom } from "@/server/gameStore";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const body = await request.json();
    const participant = joinRoom(roomCode, String(body.name ?? ""));

    return NextResponse.json({ participant });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
