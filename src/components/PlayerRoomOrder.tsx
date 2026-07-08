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
  Purple: "var(--team-purple)",
  Yellow: "var(--team-yellow)",
  Green: "var(--team-green)",
  Blue: "var(--team-blue)",
};

const DEFAULT_TEAM_LABELS: Record<Colour, string> = {
  Red: "Red",
  Purple: "Purple",
  Yellow: "Yellow",
  Green: "Green",
  Blue: "Blue",
};

import { useState, useEffect } from "react";

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
  onNameSave?: (playerId: string, name: string) => void;
  onPlayerClick?: (playerId: string) => void;
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

function LobbyPlayerNameInput({
  participant,
  onSave,
  placeholder,
}: {
  participant: LobbyParticipant;
  onSave: (playerId: string, name: string) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState(participant.name);

  useEffect(() => {
    setValue(participant.name);
  }, [participant.name]);

  return (
    <input
      type="text"
      className="player-name-input"
      value={value}
      maxLength={16}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => {
        if (value.trim() !== participant.name) {
          onSave(participant.id, value.trim());
        }
      }}
      style={{
        background: "white",
        border: "1px solid var(--border-light)",
        borderRadius: "6px",
        padding: "4px 8px",
        fontSize: "0.95rem",
        fontWeight: "bold",
        width: "140px",
        color: "var(--text-primary)",
      }}
    />
  );
}

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
  onNameSave,
  onPlayerClick,
}: PlayerRoomOrderProps) {
  if (participants.length === 0) {
    return <div className="empty-state">{emptyText}</div>;
  }

  const sources = getOrderSources(status, participants, game);
  const roundColourOrder = getRoundColourOrder(game.roundIndex);
  const bus1Entries = buildRoomEntries(sources, BusType.BUS1, roundColourOrder);
  const bus2Entries = buildRoomEntries(sources, BusType.BUS2, roundColourOrder);

  return (
    <div className="player-room-order">
      <RoomSection
        activePlayerNames={activePlayerNames}
        busType={BusType.BUS2}
        entries={bus2Entries}
        renderActions={renderActions}
        renderColourPicker={renderColourPicker}
        rowClassName={rowClassName}
        teamLabels={teamLabels}
        status={status}
        onNameSave={onNameSave}
        onPlayerClick={onPlayerClick}
      />
      <RoomSection
        activePlayerNames={activePlayerNames}
        busType={BusType.BUS1}
        entries={bus1Entries}
        renderActions={renderActions}
        renderColourPicker={renderColourPicker}
        rowClassName={rowClassName}
        teamLabels={teamLabels}
        status={status}
        onNameSave={onNameSave}
        onPlayerClick={onPlayerClick}
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
  status,
  onNameSave,
  onPlayerClick,
}: {
  activePlayerNames?: string | null;
  busType: BusType;
  entries: RoomOrderEntry[];
  renderActions?: (participant: LobbyParticipant) => ReactNode;
  renderColourPicker?: (participant: LobbyParticipant) => ReactNode;
  rowClassName?: string;
  teamLabels: Record<Colour, string>;
  status: RoomStatus;
  onNameSave?: (playerId: string, name: string) => void;
  onPlayerClick?: (playerId: string) => void;
}) {
  const roomName = busType === BusType.BUS1 ? "1번 버스 방" : "2번 버스 방";
  const roomSymbol = busType === BusType.BUS1 ? "1번" : "2번";

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
                onPlayerClick ? "player-row-clickable" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={`${busType}-${entry.id}`}
              onClick={() => onPlayerClick?.(entry.id)}
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
                  {status === "LOBBY" && participant && onNameSave ? (
                    <LobbyPlayerNameInput
                      participant={participant}
                      onSave={onNameSave}
                      placeholder={`${entry.colour ? teamLabels[entry.colour] : ""} ${entry.roomIndex}번 이름`}
                    />
                  ) : (
                    <strong>{entry.name || `${entry.colour ? teamLabels[entry.colour] : ""} ${entry.roomIndex}번`}</strong>
                  )}
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

  const roomColours = roundColourOrder;

  return roomColours.flatMap((colour) => {
    const players = grouped.get(colour) ?? [];
    const source = busType === BusType.BUS1 ? players[0] : players[1] ?? players[0];
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
