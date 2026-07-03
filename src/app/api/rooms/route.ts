import { NextRequest, NextResponse } from "next/server";
import { createRoom, hasRoom } from "@/server/gameStore";

function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function POST(request: NextRequest) {
  let roomCode = generateRoomCode();
  while (!(await createRoom(roomCode))) {
    roomCode = generateRoomCode();
  }

  return NextResponse.json({ roomCode });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.toUpperCase();

  if (!code) {
    return NextResponse.json({ error: "Code is required" }, { status: 400 });
  }

  if (await hasRoom(code)) {
    return NextResponse.json({ exists: true });
  } else {
    return NextResponse.json({ exists: false }, { status: 404 });
  }
}
