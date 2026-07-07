import { NextRequest, NextResponse } from "next/server";
import {
  adminAddParticipant,
  adminRemoveParticipant,
  adminSetRoomTimers,
  adminSetParticipantColour,
  adminUpdateParticipantName,
  adminStartGame,
  adminStartRoomTimer,
  adminStartTurn,
} from "@/server/gameStore";
import { Colour } from "@/lib/game";
import { getErrorMessage } from "@/server/apiError";

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
        | "update_player_name"
        | "set_timers"
        | "start_game"
        | "start"
        | "start_timer";
      name?: string;
      playerId?: string;
      colour?: Colour;
      movePhaseSeconds?: number;
      actionPhaseSeconds?: number;
    };

    if (action === "add_player") {
      await adminAddParticipant(roomCode, String(body.name ?? ""));
    } else if (action === "remove_player") {
      await adminRemoveParticipant(roomCode, String(body.playerId ?? ""));
    } else if (action === "set_player_colour") {
      await adminSetParticipantColour(
        roomCode,
        String(body.playerId ?? ""),
        body.colour as Colour
      );
    } else if (action === "update_player_name") {
      await adminUpdateParticipantName(
        roomCode,
        String(body.playerId ?? ""),
        String(body.name ?? "")
      );
    } else if (action === "set_timers") {
      await adminSetRoomTimers(roomCode, {
        movePhaseSeconds: Number(body.movePhaseSeconds),
        actionPhaseSeconds: Number(body.actionPhaseSeconds),
      });
    } else if (action === "start_game") {
      await adminStartGame(roomCode);
    } else if (action === "start") {
      await adminStartTurn(roomCode);
    } else if (action === "start_timer") {
      await adminStartRoomTimer(roomCode);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
