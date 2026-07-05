import {
  BusType,
  COLOURS,
  getRoundColourOrder,
  type Colour,
  type GameState,
} from "@/lib/game";
import { type LobbyParticipant, type RoomStatus } from "@/server/gameStore";
import { type ReactNode } from "react";

const TEAM_COLOUR_VARS: Record<Colour, string> = {
  Red: "var(--team-red)",
  Orange: "var(--team-orange)",
  Yellow: "var(--team-yellow)",
  Green: "var(--team-green)",
  Blue: "var(--team-blue)",
};

const DEFAULT_TEAM_LABELS: Record<Colour, string> = {
  Red: "Red",
  Orange: "Orange",
  Yellow: "Yellow",
  Green: "Green",
  Blue: "Blue",
};

type PlayerRoomOrderProps = {
  activePlayerNames?: string | null;
  emptyText: string;
  game: GameState;
  participants: LobbyParticipant[];
  renderActions?: (participant: LobbyParticipant) => ReactNode;
  renderColourPicker?: (participant: LobbyParticipant) => ReactNode;
  rowClassName?: string;
  status: RoomStatus;
  teamLabels?: Record<Colour, string>;
};

type OrderSource = {
  colour?: Colour;
  id: string;
  name: string;
  originalIndex: number;
  participant?: LobbyParticipant;
};

type RoomOrderEntry = OrderSource & {
  busType: BusType;
  roomIndex: number;
};

export default function PlayerRoomOrder({
  activePlayerNames,
  emptyText,
  game,
  participants,
  renderActions,
  renderColourPicker,
  rowClassName,
  status,
  teamLabels = DEFAULT_TEAM_LABELS,
}: PlayerRoomOrderProps) {
  if (participants.length === 0) {
    return <div className="empty-state">{emptyText}</div>;
  }

  const sources = getOrderSources(status, participants, game);
  const roundColourOrder = getRoundColourOrder(game.roundIndex);
  const plusEntries = buildRoomEntries(sources, BusType.PLUS, roundColourOrder);
  const minusEntries = buildRoomEntries(sources, BusType.MINUS, roundColourOrder);

  return (
    <div className="player-room-order">
      <RoomSection
        activePlayerNames={activePlayerNames}
        busType={BusType.PLUS}
        entries={plusEntries}
        renderActions={renderActions}
        renderColourPicker={renderColourPicker}
        rowClassName={rowClassName}
        teamLabels={teamLabels}
      />
      <RoomSection
        activePlayerNames={activePlayerNames}
        busType={BusType.MINUS}
        entries={minusEntries}
        renderActions={renderActions}
        renderColourPicker={renderColourPicker}
        rowClassName={rowClassName}
        teamLabels={teamLabels}
      />
    </div>
  );
}

function RoomSection({
  activePlayerNames,
  busType,
  entries,
  renderActions,
  renderColourPicker,
  rowClassName,
  teamLabels,
}: {
  activePlayerNames?: string | null;
  busType: BusType;
  entries: RoomOrderEntry[];
  renderActions?: (participant: LobbyParticipant) => ReactNode;
  renderColourPicker?: (participant: LobbyParticipant) => ReactNode;
  rowClassName?: string;
  teamLabels: Record<Colour, string>;
}) {
  const roomName = busType === BusType.PLUS ? "PLUS 방" : "MINUS 방";
  const roomSymbol = busType === BusType.PLUS ? "+" : "-";

  return (
    <section className={`player-room-section player-room-section-${busType.toLowerCase()}`}>
      <div className="player-room-title">
        <span className="player-room-badge">{roomSymbol}</span>
        <h3 className="brand-font">{roomName}</h3>
      </div>
      <div className="players-list">
        {entries.map((entry) => {
          const participant = entry.participant;
          return (
            <div
              className={[
                "player-row",
                rowClassName,
                isActiveEntry(entry, activePlayerNames) ? "player-row-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={`${busType}-${entry.id}`}
            >
              <div className="player-identity">
                <span className="seat-number">{entry.roomIndex}</span>
                <span
                  className="score-dot"
                  style={{
                    background: entry.colour
                      ? TEAM_COLOUR_VARS[entry.colour]
                      : "var(--text-muted)",
                  }}
                />
                <div>
                  <strong>{entry.name}</strong>
                  <small>{entry.colour ? teamLabels[entry.colour] : "색상 미배정"}</small>
                </div>
              </div>
              {participant && renderColourPicker?.(participant)}
              {participant && renderActions?.(participant)}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function getOrderSources(
  status: RoomStatus,
  participants: LobbyParticipant[],
  game: GameState
): OrderSource[] {
  if (status === "LOBBY" || game.players.length === 0) {
    return participants.map((participant, index) => ({
      colour: participant.colour,
      id: participant.id,
      name: participant.name,
      originalIndex: index,
      participant,
    }));
  }

  return game.players.map((player, index) => ({
    colour: player.team,
    id: player.id,
    name: player.name ?? player.id,
    originalIndex: index,
    participant: participants.find((participant) => participant.id === player.id),
  }));
}

function buildRoomEntries(
  sources: OrderSource[],
  busType: BusType,
  roundColourOrder: Colour[]
): RoomOrderEntry[] {
  const grouped = new Map<Colour, OrderSource[]>();
  for (const colour of COLOURS) {
    grouped.set(colour, []);
  }
  for (const source of sources) {
    if (source.colour) {
      grouped.get(source.colour)?.push(source);
    }
  }

  const roomColours =
    busType === BusType.PLUS ? roundColourOrder : [...roundColourOrder].reverse();

  return roomColours.flatMap((colour) => {
    const players = grouped.get(colour) ?? [];
    const source = busType === BusType.PLUS ? players[0] : players[1] ?? players[0];
    if (!source) {
      return [];
    }

    return {
      ...source,
      busType,
      roomIndex: 0,
    };
  }).map((entry, index) => ({
    ...entry,
    roomIndex: index + 1,
  }));
}

function isActiveEntry(entry: RoomOrderEntry, activePlayerNames?: string | null) {
  if (!activePlayerNames) {
    return false;
  }

  return activePlayerNames.includes(`${entry.name}(${entry.busType})`);
}
