"use client";

import Link from "next/link";
import { FormEvent, use, useEffect, useState } from "react";
import Board from "@/components/Board";
import PlayerRoomOrder from "@/components/PlayerRoomOrder";
import RoomPageLinks from "@/components/RoomPageLinks";
import ScoreBoard from "@/components/ScoreBoard";
import TurnResultOverlay from "@/components/TurnResultOverlay";
import {
  adminAction,
  adminGiveCards,
  adminSetTimers,
  adminUpdatePlayerName,
  usePhaseTimeLabel,
  usePublicGame,
  type PublicStateResult,
} from "@/lib/useGameState";
import { COLOURS, MAX_PLAYERS, getRoundColourOrder, type CardKind, type Colour, type Card } from "@/lib/game";

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
  RESULT_PHASE: "결과 확인",
  GAME_OVER: "게임 종료",
} as const;

const CARD_LABELS: Record<CardKind, string> = {
  STRAIGHT1: "1칸 직진",
  STRAIGHT2: "2칸 직진",
  STRAIGHT3: "3칸 직진",
  LEFT: "좌회전",
  RIGHT: "우회전",
};

const CARD_ICONS: Record<CardKind, string> = {
  STRAIGHT1: "➡️",
  STRAIGHT2: "⏩",
  STRAIGHT3: "⏭️",
  LEFT: "↩️",
  RIGHT: "↪️",
};

const CARD_KINDS = Object.keys(CARD_LABELS) as CardKind[];

type SubmissionState = "done" | "pending";

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
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedPlayerHand, setSelectedPlayerHand] = useState<Card[] | null>(null);
  const [loadingHand, setLoadingHand] = useState(false);

  useEffect(() => {
    if (!selectedPlayerId) {
      setSelectedPlayerHand(null);
      return;
    }
    const fetchHand = async () => {
      setLoadingHand(true);
      try {
        const res = await fetch(`/api/game/${roomCode}/player/${selectedPlayerId}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedPlayerHand(data.hand || []);
        }
      } catch (e) {
        // ignore errors
      } finally {
        setLoadingHand(false);
      }
    };
    fetchHand();
  }, [selectedPlayerId, roomCode]);

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

  const { status, game, participants, activePlayerNames, logs } = state;
  const latestTurnLog = logs?.[0];
  const latestTurnLogs = latestTurnLog
    ? (logs ?? [])
        .filter((log) => log.round === latestTurnLog.round && log.turn === latestTurnLog.turn)
        .reverse()
    : [];
  const selectedPlayer = game.players.find((p) => p.id === selectedPlayerId);
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
  const subwaySubmissionValues = Object.values(state.pendingSubwayMoves ?? {});
  const areSubwaysSubmitted =
    subwaySubmissionValues.length === 0 || subwaySubmissionValues.every(Boolean);
  const canEndTurn =
    status === "ACTION_PHASE" &&
    !!state.pendingActions?.BUS1 &&
    !!state.pendingActions?.BUS2;
  const timerButtonLabel =
    status === "RESULT_PHASE"
      ? "다음 턴 시작"
      : canEndTurn
        ? "이번 턴 종료"
        : status === "WAITING"
      ? "입력 시작"
      : status === "CHOOSING" || status === "ACTION_PHASE"
        ? "타이머 시작"
        : "시간 저장";
  const turnPhaseLabel =
    status === "CHOOSING"
      ? "이동 제출"
      : status === "ACTION_PHASE"
        ? "행동 제출"
        : STATUS_LABELS[status];
  const currentTeamLabel = state.busTeam ? `${TEAM_LABELS[state.busTeam]} 팀` : "-";
  const runAdminAction = async (
    action: "start_game" | "start" | "end_turn"
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
      if (status === "RESULT_PHASE") {
        await adminAction(roomCode, "start");
      } else if (canEndTurn) {
        await adminAction(roomCode, "end_turn");
      } else if (status === "WAITING") {
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
                버스 1
              </Link>
              <Link
                href={`/dealer/${roomCode}/bus2`}
                className="btn btn-primary"
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: "var(--bus2-color)", borderColor: "var(--bus2-color)" }}
              >
                버스 2
              </Link>
              <Link
                href={`/dealer/${roomCode}/subway`}
                className="btn btn-primary"
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: "var(--text-primary)", borderColor: "var(--text-primary)" }}
              >
                지하철
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
          {status === "RESULT_PHASE" && latestTurnLogs.length > 0 && (
            <TurnResultOverlay logs={latestTurnLogs} />
          )}
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
              <strong>{status === "CHOOSING" || status === "ACTION_PHASE" ? `${currentTeamLabel} · ${turnPhaseLabel}` : "-"}</strong>
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
            <MasterTurnStatus state={state} />
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
            onPlayerClick={status !== "LOBBY" ? setSelectedPlayerId : undefined}
          />
          {status !== "LOBBY" && (
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 24 }}>
              <hr style={{ border: "none", borderTop: "1px solid var(--border-light)" }} />
              <ScoreBoard game={game} showBusStatus={false} />
            </div>
          )}
        </section>
      </main>

      {selectedPlayer && (
        <div className="hand-modal-overlay" onClick={() => setSelectedPlayerId(null)}>
          <div className="hand-modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="hand-modal-header">
              <h2 className="brand-font">
                <span className={`score-dot score-dot-${selectedPlayer.team}`} />
                {selectedPlayer.name || selectedPlayer.id}의 카드 패
              </h2>
              <button className="btn btn-ghost" onClick={() => setSelectedPlayerId(null)} style={{ padding: 4, minWidth: 32, height: 32, fontSize: "1.1rem" }}>✕</button>
            </header>
            <div className="hand-modal-body">
              {loadingHand ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <p className="empty-hand">불러오는 중...</p>
                </div>
              ) : selectedPlayerHand === null ? (
                <p className="empty-hand">카드 패 정보를 불러오지 못했습니다.</p>
              ) : selectedPlayerHand.length === 0 ? (
                <p className="empty-hand">보유한 카드가 없습니다.</p>
              ) : (
                <div className="hand-cards-grid">
                  {CARD_KINDS.map((kind) => {
                    const count = selectedPlayerHand.filter((c) => c.kind === kind).length;
                    if (count === 0) return null;

                    return (
                      <div key={kind} className="hand-card">
                        <span className="hand-card-count-badge">{count}</span>
                        <span className="hand-card-icon">{CARD_ICONS[kind]}</span>
                        <span className="hand-card-label">{CARD_LABELS[kind]}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MasterTurnStatus({ state }: { state: PublicStateResult }) {
  const { game, status } = state;
  const currentTeam = state.busTeam ?? getRoundColourOrder(game.roundIndex)[game.turnIndex];
  const busPlayers = game.players.filter((player) => player.team === currentTeam);
  const bus1Player = busPlayers[0];
  const bus2Player = busPlayers[1] ?? busPlayers[0];
  const isMovePhase = status === "CHOOSING";
  const phaseLabel = isMovePhase ? "이동 제출" : "행동 제출";
  const busRows = [
    {
      key: "BUS1",
      label: "1번 버스",
      playerName: bus1Player?.name || bus1Player?.id || "-",
      state: getBusSubmissionState(state, "BUS1"),
    },
    {
      key: "BUS2",
      label: "2번 버스",
      playerName: bus2Player?.name || bus2Player?.id || "-",
      state: getBusSubmissionState(state, "BUS2"),
    },
  ].filter((row, index, rows) => index === 0 || row.playerName !== rows[0].playerName || row.label !== rows[0].label);

  return (
    <div className="master-turn-card">
      <div className="master-turn-header">
        <div>
          <span className="tiny-label">현재 차례</span>
          <h2 className="brand-font">
            <span className={`score-dot score-dot-${currentTeam}`} />
            {TEAM_LABELS[currentTeam]} 팀
          </h2>
        </div>
        <strong className="phase-chip">{phaseLabel}</strong>
      </div>

      <div className="submission-grid">
        {busRows.map((row) => (
          <SubmissionPill
            key={row.key}
            accentClass={row.key === "BUS1" ? "submission-pill-bus1" : "submission-pill-bus2"}
            label={`${row.label} · ${row.playerName}`}
            state={row.state}
          />
        ))}
      </div>

      <SubwaySubmissionStatus state={state} />
    </div>
  );
}

function SubwaySubmissionStatus({ state }: { state: PublicStateResult }) {
  const subwayTeams = state.subwayMoveTeams ?? [];
  const pendingSubwayMoves = state.pendingSubwayMoves ?? {};
  const submissions = new Map(
    (state.subwayPreview?.submissions ?? []).map((submission) => [
      submission.playerId,
      submission,
    ])
  );

  if (subwayTeams.length === 0) {
    return null;
  }

  return (
    <div className="subway-status-card">
      <div className="subway-status-heading">
        <span className="tiny-label">지하철 제출</span>
        <strong>
          {state.subwayPreview?.submissions.length ?? 0}명 제출
        </strong>
      </div>
      <div className="subway-team-status-list">
        {subwayTeams.map((team) => {
          const players =
            state.subwayTeamPlayers?.[team] ??
            state.game.players
              .filter((player) => player.team === team)
              .map((player) => ({
                playerId: player.id,
                playerName: player.name,
                team,
                roomIndex: 0,
              }));
          const submittedCount = players.filter((player) => pendingSubwayMoves[player.playerId]).length;

          return (
            <div className="subway-team-status" key={team}>
              <div className="subway-team-title">
                <span className={`score-dot score-dot-${team}`} />
                <strong>{TEAM_LABELS[team]} 팀</strong>
                <span>{submittedCount}/{players.length}</span>
              </div>
              <div className="subway-player-submissions">
                {players.map((player) => {
                  const submission = submissions.get(player.playerId);
                  return (
                    <span
                      className={`subway-player-submission ${submission ? "subway-player-submission-done" : ""}`}
                      key={player.playerId}
                    >
                      <strong>{player.playerName || player.playerId}</strong>
                      <span>{submission?.label ?? "대기"}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SubmissionPill({
  accentClass,
  label,
  state,
}: {
  accentClass: string;
  label: string;
  state: SubmissionState;
}) {
  return (
    <div className={`submission-pill ${accentClass} ${state === "done" ? "submission-pill-done" : ""}`}>
      <span>{label}</span>
      <strong>{state === "done" ? "완료" : "대기"}</strong>
    </div>
  );
}

function getBusSubmissionState(
  state: PublicStateResult,
  bus: "BUS1" | "BUS2"
): SubmissionState {
  if (state.status === "CHOOSING") {
    return state.pendingMoves?.[bus] ? "done" : "pending";
  }

  if (state.status === "ACTION_PHASE") {
    return state.pendingActions?.[bus] ? "done" : "pending";
  }

  return "pending";
}
