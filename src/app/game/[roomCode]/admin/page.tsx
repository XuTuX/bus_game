"use client";

import Link from "next/link";
import { FormEvent, use, useEffect, useState } from "react";
import Board from "@/components/Board";
import PlayerRoomOrder from "@/components/PlayerRoomOrder";
import RoomPageLinks from "@/components/RoomPageLinks";
import ScoreBoard from "@/components/ScoreBoard";
import ActionLog from "@/components/ActionLog";
import {
  adminAction,
  adminGiveCards,
  adminSetTimers,
  adminUpdatePlayerName,
  usePhaseTimeLabel,
  usePublicGame,
} from "@/lib/useGameState";
import { COLOURS, MAX_PLAYERS, type CardKind, type Colour } from "@/lib/game";

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

const CARD_LABELS: Record<CardKind, string> = {
  STRAIGHT1: "1칸 직진",
  STRAIGHT2: "2칸 직진",
  STRAIGHT3: "3칸 직진",
  LEFT: "좌회전",
  RIGHT: "우회전",
};

const CARD_KINDS = Object.keys(CARD_LABELS) as CardKind[];

export default function AdminPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = use(params);
  const state = usePublicGame(roomCode);
  const phaseTimeLabel = usePhaseTimeLabel(state);
  const [editingPlayers, setEditingPlayers] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [savingTimers, setSavingTimers] = useState(false);
  const [givingCards, setGivingCards] = useState(false);
  const [timerDirty, setTimerDirty] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState("3");
  const [cardPlayerId, setCardPlayerId] = useState("");
  const [cardKind, setCardKind] = useState<CardKind>("STRAIGHT1");
  const [cardCount, setCardCount] = useState("1");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!state?.timerSettings || timerDirty) return;
    setTimerMinutes(String(Math.round(state.timerSettings.movePhaseSeconds / 60)));
  }, [
    state?.timerSettings?.movePhaseSeconds,
    timerDirty,
  ]);

  if (!state) {
    return (
      <div className="dealer-layout loading-screen">
        <h2>마스터 페이지를 불러오는 중...</h2>
      </div>
    );
  }

  const { status, game, participants, logs, activePlayerNames } = state;
  const subwayMoveTeams = state.subwayMoveTeams ?? [];
  const pendingSubwayMoves = state.pendingSubwayMoves ?? {};
  const playerOptions = game.players.length > 0
    ? game.players
    : participants
        .filter((participant) => participant.colour)
        .map((participant) => ({
          id: participant.id,
          name: participant.name,
          team: participant.colour as Colour,
          hand: [],
        }));
  const canStartGame = participants.length > 0;
  const timerButtonLabel =
    status === "WAITING"
      ? "입력 시작"
      : status === "CHOOSING" || status === "ACTION_PHASE"
        ? "타이머 시작"
        : "시간 저장";
  const runAdminAction = async (
    action: "start_game" | "start"
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

  const handleTimerStart = async () => {
    if (savingTimers) return;

    const timerValue = Number(timerMinutes);
    if (!Number.isFinite(timerValue) || timerValue < 1) {
      setErrorMsg("타이머는 1분 이상으로 입력하세요.");
      return;
    }

    setSavingTimers(true);
    setErrorMsg("");
    try {
      await adminSetTimers(roomCode, {
        movePhaseSeconds: Math.round(timerValue * 60),
        actionPhaseSeconds: Math.round(timerValue * 60),
      });
      setTimerDirty(false);
      if (status === "WAITING") {
        await adminAction(roomCode, "start");
      } else if (status === "CHOOSING" || status === "ACTION_PHASE") {
        await adminAction(roomCode, "start_timer");
      }
    } catch (error: any) {
      setErrorMsg(error.message || "타이머 시작에 실패했습니다.");
    } finally {
      setSavingTimers(false);
    }
  };

  const handleUpdatePlayerName = async (playerId: string, name: string) => {
    try {
      await adminUpdatePlayerName(roomCode, playerId, name);
    } catch (error: any) {
      setErrorMsg(error.message || "이름 변경에 실패했습니다.");
    }
  };

  const handleGiveCards = async (event: FormEvent) => {
    event.preventDefault();
    if (givingCards) return;
    const targetPlayerId = cardPlayerId || playerOptions[0]?.id || "";
    const count = Number(cardCount);
    if (!targetPlayerId) {
      setErrorMsg("카드를 지급할 플레이어를 선택하세요.");
      return;
    }
    if (!Number.isFinite(count) || count < 1) {
      setErrorMsg("카드 수량은 1장 이상으로 입력하세요.");
      return;
    }

    setGivingCards(true);
    setErrorMsg("");
    try {
      await adminGiveCards(roomCode, targetPlayerId, cardKind, Math.floor(count));
      setCardCount("1");
    } catch (error: any) {
      setErrorMsg(error.message || "카드 지급에 실패했습니다.");
    } finally {
      setGivingCards(false);
    }
  };

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
          {status !== "LOBBY" && (
            <>
              <Link
                href={`/dealer/${roomCode}/bus1`}
                className="btn btn-primary"
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: "var(--bus1-color)", borderColor: "var(--bus1-color)" }}
              >
                버스 1 딜러룸 열기
              </Link>
              <Link
                href={`/dealer/${roomCode}/bus2`}
                className="btn btn-primary"
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: "var(--bus2-color)", borderColor: "var(--bus2-color)" }}
              >
                버스 2 딜러룸 열기
              </Link>
              <Link
                href={`/dealer/${roomCode}/subway`}
                className="btn btn-primary"
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: "var(--text-primary)", borderColor: "var(--text-primary)" }}
              >
                지하철 조작 창 열기
              </Link>
            </>
          )}
          {status === "LOBBY" && (
            <Link href={`/dealer/${roomCode}`} className="btn btn-primary" target="_blank" rel="noopener noreferrer">
              딜러룸 선택
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
              <span>상태</span>
              <strong>{STATUS_LABELS[status]}</strong>
            </div>
            <div>
              <span>남은 시간</span>
              <strong>{phaseTimeLabel || "-"}</strong>
            </div>
            <div className="admin-summary-current">
              <span>현재 차례</span>
              <strong>{activePlayerNames || "-"}</strong>
            </div>
          </div>

          <div className="timer-settings-form">
            <label>
              <span>타이머</span>
              <input
                type="number"
                min="1"
                max="180"
                value={timerMinutes}
                disabled={savingTimers}
                onChange={(event) => {
                  setTimerDirty(true);
                  setTimerMinutes(event.target.value);
                }}
              />
              <small>분</small>
            </label>
            <div className="timer-save-state">
              {timerDirty ? "변경됨" : "저장됨"}
            </div>
            <button
              className="btn btn-primary timer-start-btn"
              disabled={savingTimers}
              onClick={handleTimerStart}
              type="button"
            >
              {savingTimers ? "처리 중" : timerButtonLabel}
            </button>
          </div>

          {errorMsg && <div className="error-box">{errorMsg}</div>}

          {status === "LOBBY" && (
            <div className="master-section">
              <h2 className="brand-font">이름 입력 완료 후 게임 시작</h2>
              <p className="section-copy">
                참가자 10명의 이름을 모두 입력한 후 아래 버튼을 눌러 게임을 시작하세요.
              </p>

              <button
                className="btn btn-primary master-action"
                disabled={busyAction}
                onClick={() => runAdminAction("start_game")}
                style={{ width: "100%", marginTop: 12 }}
              >
                게임 시작
              </button>
            </div>
          )}

          {status === "WAITING" && (
            <div className="master-waiting">
              <h2 className="brand-font">입력 시작 대기</h2>
              <p>타이머 시간을 확인한 뒤 위의 입력 시작 버튼을 누르면 딜러룸 입력과 타이머가 함께 시작됩니다.</p>
            </div>
          )}

          {(status === "CHOOSING" || status === "ACTION_PHASE") && (
            <div className="master-waiting">
              <h2 className="brand-font">
                {status === "CHOOSING" ? "딜러룸 이동 입력 중" : "딜러룸 행동 입력 중"}
              </h2>
              <p>
                {activePlayerNames} 님이 제출하면 바로 공개판에 반영됩니다.
              </p>
              {(status === "CHOOSING" || status === "ACTION_PHASE") && subwayMoveTeams.length > 0 && (
                <div className="status-metadata" style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {subwayMoveTeams.map((team) => {
                    const teamPlayers = game.players.filter((player) => player.team === team);
                    const submittedCount = teamPlayers.filter((player) => pendingSubwayMoves[player.id]).length;
                    return (
                      <span key={team} className="team-pill">
                        <span className={`score-dot score-dot-${team}`} />
                        {team} 지하철: {submittedCount}/{teamPlayers.length}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {status !== "LOBBY" && (
            <form className="master-card-form" onSubmit={handleGiveCards}>
              <h2 className="brand-font">추가 카드 지급</h2>
              <select
                value={cardPlayerId || playerOptions[0]?.id || ""}
                onChange={(event) => setCardPlayerId(event.target.value)}
                disabled={givingCards}
              >
                {playerOptions.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name || player.id} · {TEAM_LABELS[player.team]}
                  </option>
                ))}
              </select>
              <div className="master-card-grid">
                <select
                  value={cardKind}
                  onChange={(event) => setCardKind(event.target.value as CardKind)}
                  disabled={givingCards}
                >
                  {CARD_KINDS.map((kind) => (
                    <option key={kind} value={kind}>{CARD_LABELS[kind]}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={cardCount}
                  onChange={(event) => setCardCount(event.target.value)}
                  disabled={givingCards}
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={givingCards}>
                {givingCards ? "지급 중" : "카드 지급"}
              </button>
            </form>
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
          <PlayerRoomOrder
            activePlayerNames={activePlayerNames}
            emptyText="아직 입력된 참가자가 없습니다."
            game={game}
            participants={participants}
            rowClassName="admin-player-row"
            status={status}
            teamLabels={TEAM_LABELS}
            onNameSave={handleUpdatePlayerName}
          />
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
