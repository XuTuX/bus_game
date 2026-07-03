"use client";

import Link from "next/link";
import { FormEvent, use, useState } from "react";
import Board from "@/components/Board";
import RoomPageLinks from "@/components/RoomPageLinks";
import ScoreBoard from "@/components/ScoreBoard";
import ActionLog from "@/components/ActionLog";
import {
  adminAction,
  adminAddPlayer,
  adminRemovePlayer,
  adminSetPlayerColour,
  usePublicGame,
} from "@/lib/useGameState";
import { COLOURS, MAX_PLAYERS, type Colour } from "@/lib/game";

const TEAM_COLOUR_VARS: Record<Colour, string> = {
  Red: "var(--team-red)",
  Orange: "var(--team-orange)",
  Yellow: "var(--team-yellow)",
  Green: "var(--team-green)",
  Blue: "var(--team-blue)",
};

const TEAM_LABELS: Record<Colour, string> = {
  Red: "레드",
  Orange: "오렌지",
  Yellow: "옐로",
  Green: "그린",
  Blue: "블루",
};

const STATUS_LABELS = {
  LOBBY: "참가자 입력",
  WAITING: "턴 시작 대기",
  CHOOSING: "이동 카드 선택 중",
  ACTION_PHASE: "행동 선택 중",
  GAME_OVER: "게임 종료",
} as const;

export default function AdminPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = use(params);
  const state = usePublicGame(roomCode);
  const [playerName, setPlayerName] = useState("");
  const [editingPlayers, setEditingPlayers] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!state) {
    return (
      <div className="dealer-layout loading-screen">
        <h2>마스터 페이지를 불러오는 중...</h2>
      </div>
    );
  }

  const { status, game, participants, logs, activePlayerNames } = state;
  const canStartGame = participants.length > 0;
  const runAdminAction = async (
    action: "start_game" | "start" | "reveal" | "next"
  ) => {
    if (busyAction) return;

    setBusyAction(true);
    setErrorMsg("");
    try {
      await adminAction(roomCode, action);
    } catch (error: any) {
      setErrorMsg(error.message || "진행 작업에 실패했습니다.");
    } finally {
      setBusyAction(false);
    }
  };

  const handleAddPlayer = async (event: FormEvent) => {
    event.preventDefault();
    if (editingPlayers || participants.length >= MAX_PLAYERS) return;

    setEditingPlayers(true);
    setErrorMsg("");
    try {
      await adminAddPlayer(roomCode, playerName);
      setPlayerName("");
    } catch (error: any) {
      setErrorMsg(error.message || "참가자 추가에 실패했습니다.");
    } finally {
      setEditingPlayers(false);
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    if (editingPlayers) return;

    setEditingPlayers(true);
    setErrorMsg("");
    try {
      await adminRemovePlayer(roomCode, playerId);
    } catch (error: any) {
      setErrorMsg(error.message || "참가자 삭제에 실패했습니다.");
    } finally {
      setEditingPlayers(false);
    }
  };

  const handleSetColour = async (playerId: string, colour: Colour) => {
    if (editingPlayers) return;

    setEditingPlayers(true);
    setErrorMsg("");
    try {
      await adminSetPlayerColour(roomCode, playerId, colour);
    } catch (error: any) {
      setErrorMsg(error.message || "색상 변경에 실패했습니다.");
    } finally {
      setEditingPlayers(false);
    }
  };

  const plusTeamColor = status !== "LOBBY" ? COLOURS[game.turnIndex] : null;
  const minusTeamColor = status !== "LOBBY" ? COLOURS[game.turnIndex] : null;

  const teamPlayersPlus = plusTeamColor ? game.players.filter((p) => p.team === plusTeamColor) : [];
  const teamPlayersMinus = minusTeamColor ? game.players.filter((p) => p.team === minusTeamColor) : [];

  const plusPlayer = teamPlayersPlus[0];
  const minusPlayer = teamPlayersMinus[1] || teamPlayersMinus[0];

  return (
    <div className="dealer-layout">
      <header className="header">
        <div>
          <h1 className="brand-font">마스터 페이지</h1>
          <p className="header-subtitle">
            방 코드 <strong>{roomCode}</strong> · {STATUS_LABELS[status]}
          </p>
        </div>
        <div className="header-actions" style={{ gap: 8 }}>
          {plusPlayer && (
            <Link href={`/game/${roomCode}/player/${plusPlayer.id}`} className="btn btn-primary" target="_blank" rel="noopener noreferrer" style={{ background: "var(--bus-plus)", borderColor: "var(--bus-plus)", color: "white" }}>
              딜러룸 ＋ ({plusPlayer.name})
            </Link>
          )}
          {minusPlayer && (
            <Link href={`/game/${roomCode}/player/${minusPlayer.id}`} className="btn btn-primary" target="_blank" rel="noopener noreferrer" style={{ background: "var(--bus-minus)", borderColor: "var(--bus-minus)", color: "white" }}>
              딜러룸 ー ({minusPlayer.name})
            </Link>
          )}
          <Link href={`/game/${roomCode}`} className="btn btn-ghost" target="_blank" rel="noopener noreferrer">
            공개판
          </Link>
        </div>
      </header>

      <main className="admin-main">
        <section className="dealer-board-pane">
          <div className="dealer-pane-heading">
            <h2 className="brand-font">마스터 보드판</h2>
            <span>버스의 머리 방향이 표시됩니다</span>
          </div>
          <Board game={game} showFacing={true} />
        </section>

        <section className="dealer-panel admin-control-panel">
          <div className="admin-summary">
            <div>
              <span>라운드</span>
              <strong>{Math.min(game.roundIndex + 1, 5)} / 5</strong>
            </div>
            <div>
              <span>현재 차례</span>
              <strong>{activePlayerNames || "-"}</strong>
            </div>
            <div>
              <span>상태</span>
              <strong>{STATUS_LABELS[status]}</strong>
            </div>
          </div>

          {errorMsg && <div className="error-box">{errorMsg}</div>}

          {status === "LOBBY" && (
            <div className="master-section">
              <h2 className="brand-font">사람 입력</h2>
              <p className="section-copy">
                참가자 이름을 실제 플레이 순서대로 입력하세요. 색상은 아래 참가자 목록에서 바꿀 수 있습니다.
              </p>

              <form onSubmit={handleAddPlayer} className="player-add-form">
                <input
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  placeholder={`참가자 이름 (${participants.length}/${MAX_PLAYERS})`}
                  maxLength={16}
                  disabled={editingPlayers || participants.length >= MAX_PLAYERS}
                />
                <button
                  className="btn btn-primary"
                  disabled={editingPlayers || participants.length >= MAX_PLAYERS}
                  type="submit"
                >
                  추가
                </button>
              </form>

              <button
                className="btn btn-primary master-action"
                disabled={!canStartGame || busyAction}
                onClick={() => runAdminAction("start_game")}
              >
                게임 시작
              </button>
              {!canStartGame && (
                <p className="muted-copy">게임 시작 전 참가자를 1명 이상 입력해야 합니다.</p>
              )}
            </div>
          )}

          {status === "WAITING" && (
            <button
              className="btn btn-primary master-action"
              onClick={() => runAdminAction("start")}
              disabled={busyAction}
            >
              딜러룸 입력 시작
            </button>
          )}

          {(status === "CHOOSING" || status === "ACTION_PHASE") && (
            <div className="master-waiting">
              <h2 className="brand-font">
                {status === "CHOOSING" ? "딜러룸 이동 입력 중" : "딜러룸 행동 입력 중"}
              </h2>
              <p>
                {activePlayerNames} 님이 제출하면 바로 공개판에 반영됩니다.
              </p>
            </div>
          )}


          {status === "GAME_OVER" && (
            <div className="master-waiting">
              <h2 className="brand-font">게임 종료</h2>
              <p>공개판에서 최종 점수를 확인하세요.</p>
            </div>
          )}
        </section>

        <section className="dealer-panel admin-player-panel">
          <div className="panel-title-row">
            <h2 className="brand-font">입장 화면</h2>
          </div>
          <RoomPageLinks roomCode={roomCode} />

          <div className="panel-title-row">
            <h2 className="brand-font">참가자</h2>
            <span>{participants.length} / {MAX_PLAYERS}</span>
          </div>
          <div className="players-list">
            {participants.length === 0 ? (
              <div className="empty-state">아직 입력된 참가자가 없습니다.</div>
            ) : (
              participants.map((participant, index) => (
                <div className="player-row admin-player-row" key={participant.id}>
                  <div className="player-identity">
                    <span className="seat-number">{index + 1}</span>
                    <span
                      className="score-dot"
                      style={{
                        background: participant.colour
                          ? TEAM_COLOUR_VARS[participant.colour]
                          : "var(--text-muted)",
                      }}
                    />
                    <div>
                      <strong>{participant.name}</strong>
                      <small>{participant.colour ? TEAM_LABELS[participant.colour] : "색상 미배정"}</small>
                    </div>
                  </div>
                  {status === "LOBBY" && (
                    <div className="colour-picker" aria-label={`${participant.name} 색상 선택`}>
                      {COLOURS.map((colour) => (
                        <button
                          key={colour}
                          className={`colour-swatch ${
                            participant.colour === colour ? "colour-swatch-active" : ""
                          }`}
                          style={{ background: TEAM_COLOUR_VARS[colour] }}
                          title={TEAM_LABELS[colour]}
                          aria-label={TEAM_LABELS[colour]}
                          disabled={editingPlayers}
                          onClick={() => handleSetColour(participant.id, colour)}
                        />
                      ))}
                    </div>
                  )}
                  {status === "LOBBY" && (
                    <div className="player-row-actions">
                      <button
                        className="btn btn-ghost compact-btn danger-btn"
                        disabled={editingPlayers}
                        onClick={() => handleRemovePlayer(participant.id)}
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          {status !== "LOBBY" && (
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 24 }}>
              <hr style={{ border: "none", borderTop: "1px solid var(--border-light)" }} />
              <ScoreBoard game={game} showBusStatus={true} />
              <hr style={{ border: "none", borderTop: "1px solid var(--border-light)" }} />
              <ActionLog logs={logs} />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
