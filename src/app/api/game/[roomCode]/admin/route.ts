import { NextRequest, NextResponse } from "next/server";
import {
  adminAddParticipant,
  adminNext,
  adminRemoveParticipant,
  adminRevealTurn,
  adminSetParticipantColour,
  adminStartGame,
  adminStartTurn,
} from "@/server/gameStore";
import { Colour } from "@/lib/game";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;
    const body = await request.json();
    const { action } = body as {
      action:
        | "add_player"
        | "remove_player"
        | "set_player_colour"
        | "start_game"
        | "start"
        | "reveal"
        | "next";
      name?: string;
      playerId?: string;
      colour?: Colour;
    };

    if (action === "add_player") {
      adminAddParticipant(roomCode, String(body.name ?? ""));
    } else if (action === "remove_player") {
      adminRemoveParticipant(roomCode, String(body.playerId ?? ""));
    } else if (action === "set_player_colour") {
      adminSetParticipantColour(
        roomCode,
        String(body.playerId ?? ""),
        body.colour as Colour
      );
    } else if (action === "start_game") {
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
