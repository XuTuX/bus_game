"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Board from "@/components/Board";
import ScoreBoard from "@/components/ScoreBoard";
import {
  BusType,
  COLOURS,
  type CardKind,
  type Colour,
  type MoveTurnAction,
  type TurnAction,
  rotate,
  wallBetweenTiles,
  stepCoord,
  wallConflicts,
  type GameState,
  type Coord,
  getRoundColourOrder,
} from "@/lib/game";
import {
  submitAction,
  usePhaseTimeLabel,
  usePrivateGame,
  usePublicGame,
} from "@/lib/useGameState";

const CARD_ICONS: Record<CardKind, string> = {
  STRAIGHT1: "➡️",
  STRAIGHT2: "⏩",
  STRAIGHT3: "⏭️",
  LEFT: "↩️",
  RIGHT: "↪️",
};

const CARD_NAMES: Record<CardKind, string> = {
  STRAIGHT1: "1칸 직진",
  STRAIGHT2: "2칸 직진",
  STRAIGHT3: "3칸 직진",
  LEFT: "좌회전",
  RIGHT: "우회전",
};

const TEAM_COLOUR_VARS: Record<Colour, string> = {
  Red: "var(--team-red)",
  Purple: "var(--team-purple)",
  Yellow: "var(--team-yellow)",
  Green: "var(--team-green)",
  Blue: "var(--team-blue)",
};

const STATUS_TEXT = {
  LOBBY: "마스터가 사람을 입력하는 중입니다.",
  WAITING: "마스터가 딜러룸 입력을 시작할 때까지 대기하세요.",
  CHOOSING: "현재 차례입니다. 이동 옵션을 선택하고 제출하세요.",
  ACTION_PHASE: "이동이 완료되었습니다. 행동(타일 위치 교환)을 선택하세요.",
  RESULT_PHASE: "이번 턴 결과 확인 중입니다. 마스터가 다음 턴을 시작할 때까지 대기하세요.",
  SUBMITTED: "제출 처리 중입니다.",
  REVEALED: "결과가 공개되었습니다.",
  GAME_OVER: "게임이 종료되었습니다.",
} as const;

// Convert chosen kinds into server-compatible relative indices
function getMovesWithIndices(
  hand: { kind: CardKind }[],
  selected: { kind: CardKind; bus: BusType }[]
): MoveTurnAction[] {
  const actions: MoveTurnAction[] = [];
  const remainingHand = [...hand];

  for (const sel of selected) {
    const idx = remainingHand.findIndex((c) => c.kind === sel.kind);
    if (idx === -1) {
      throw new Error(`Card of type ${sel.kind} not found in hand.`);
    }
    actions.push({ type: "MOVE", bus: sel.bus, cardIndex: idx });
    remainingHand.splice(idx, 1);
  }
  return actions;
}

export default function DealerRoom({
  roomCode,
  playerId,
  roomBus,
}: {
  roomCode: string;
  playerId?: string;
  roomBus?: BusType;
}) {
  const publicState = usePublicGame(roomCode);
  const initialGame = publicState?.game as GameState | undefined;

  let resolvedPlayerId = playerId || "";

  if (roomBus && initialGame && publicState?.status !== "LOBBY") {
    const roundColourOrder = getRoundColourOrder(initialGame.roundIndex);
    const bus1Team = roundColourOrder[initialGame.turnIndex];
    const bus1TeamPlayers = initialGame.players.filter((p) => p.team === bus1Team);
    const bus1Player = bus1TeamPlayers[0];
    const bus2Player = bus1TeamPlayers[1] || bus1TeamPlayers[0];

    resolvedPlayerId =
      roomBus === BusType.BUS1 ? bus1Player?.id || "" : bus2Player?.id || "";
  }

  const privateState = usePrivateGame(roomCode, resolvedPlayerId);
  const phaseTimeLabel = usePhaseTimeLabel(publicState);
  
  // Simulated state for step-by-step client-side movement animation
  const [animatedGame, setAnimatedGame] = useState<GameState | null>(null);
  const [submittedPreviewGame, setSubmittedPreviewGame] = useState<GameState | null>(null);

  // Movement selections
  const [chosenBus, setChosenBus] = useState<BusType>(BusType.BUS1);
  const [moveCategory, setMoveCategory] = useState<"FORWARD" | "ROTATE">("FORWARD");
  type SelectedMove = { kind: CardKind };
  const [selectedMoves, setSelectedMoves] = useState<SelectedMove[]>([]);

  // Action phase states
  const [selectedActionType, setSelectedActionType] = useState<"SWAP_TILE" | null>(null);
  const [actionTarget, setActionTarget] = useState<{ x: number; y: number } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const isBus1Controller = privateState?.isBus1Controller ?? false;
  const isBus2Controller = privateState?.isBus2Controller ?? false;
  const isBus1Submitted = publicState?.pendingMoves?.BUS1 ?? false;
  const isBus2Submitted = publicState?.pendingMoves?.BUS2 ?? false;
  const isBus1ActionSubmitted = publicState?.pendingActions?.BUS1 ?? false;
  const isBus2ActionSubmitted = publicState?.pendingActions?.BUS2 ?? false;
  const selectedBus = roomBus ?? chosenBus;
  const isSelectedBusController =
    selectedBus === BusType.BUS1 ? isBus1Controller : isBus2Controller;
  const isSelectedMoveSubmitted =
    selectedBus === BusType.BUS1 ? isBus1Submitted : isBus2Submitted;
  const isSelectedActionSubmitted =
    selectedBus === BusType.BUS1 ? isBus1ActionSubmitted : isBus2ActionSubmitted;

  // Auto-lock chosenBus based on role authority
  useEffect(() => {
    if (roomBus) {
      setChosenBus(roomBus);
    } else if (isBus1Controller && !isBus2Controller) {
      setChosenBus(BusType.BUS1);
    } else if (isBus2Controller && !isBus1Controller) {
      setChosenBus(BusType.BUS2);
    } else if (isBus1Controller && isBus2Controller) {
      if (publicState?.status === "CHOOSING") {
        setChosenBus(isBus1Submitted && !isBus2Submitted ? BusType.BUS2 : BusType.BUS1);
      } else if (publicState?.status === "ACTION_PHASE") {
        setChosenBus(
          isBus1ActionSubmitted && !isBus2ActionSubmitted ? BusType.BUS2 : BusType.BUS1
        );
      }
    }
  }, [
    roomBus,
    isBus1Controller,
    isBus2Controller,
    isBus1Submitted,
    isBus2Submitted,
    isBus1ActionSubmitted,
    isBus2ActionSubmitted,
    publicState?.status,
  ]);

  useEffect(() => {
    setSelectedMoves([]);
    setActionTarget(null);
    setErrorMsg("");
    setAnimatedGame(null);
    if (publicState?.status === "ACTION_PHASE") {
      setSelectedActionType("SWAP_TILE");
    } else {
      setSelectedActionType(null);
    }
    if (publicState?.status !== "CHOOSING") {
      setSubmittedPreviewGame(null);
    }
  }, [resolvedPlayerId, publicState?.status]);

  if (!publicState || !publicState.game) {
    return (
      <div className="dealer-layout">
        <div className="dealer-main" style={{ justifyContent: "center" }}>
          <h2>딜러룸 접속 중...</h2>
        </div>
      </div>
    );
  }

  const game = publicState.game as GameState;
  const { status } = publicState;
  const activePlayer = game.players.find((player) => player.id === resolvedPlayerId);
  const hand = privateState?.hand ?? [];
  const activeTeam = privateState?.team ?? activePlayer?.team;
  const playerName = privateState?.playerName ?? activePlayer?.name ?? resolvedPlayerId;
  const teamCssName = (activeTeam ?? "Blue").toLowerCase();

  // Check if I have already submitted my moves/action for this turn
  const hasISubmittedMoves = roomBus
    ? isSelectedBusController && isSelectedMoveSubmitted
    : ((isBus1Controller && isBus1Submitted) || !isBus1Controller) &&
      ((isBus2Controller && isBus2Submitted) || !isBus2Controller) &&
      (isBus1Controller || isBus2Controller);

  const hasISubmittedAction = roomBus
    ? isSelectedBusController && isSelectedActionSubmitted
    : ((isBus1Controller && isBus1ActionSubmitted) || !isBus1Controller) &&
      ((isBus2Controller && isBus2ActionSubmitted) || !isBus2Controller) &&
      (isBus1Controller || isBus2Controller);

  const canAct =
    privateState?.isMyTurn &&
    isSelectedBusController &&
    ((status === "CHOOSING" && !isSelectedMoveSubmitted) ||
      (status === "ACTION_PHASE" && !isSelectedActionSubmitted));
  const bus1Disabled =
    !!roomBus ||
    submitting ||
    (isBus2Controller && !isBus1Controller) ||
    (isBus1Controller && isBus2Controller && isBus1Submitted);
  const bus2Disabled =
    !!roomBus ||
    submitting ||
    (isBus1Controller && !isBus2Controller) ||
    (isBus1Controller && isBus2Controller && (!isBus1Submitted || isBus2Submitted));

  // Group hand cards and calculate remaining unused counts
  const getCardCount = (kind: CardKind) => {
    const total = hand.filter((c) => c.kind === kind).length;
    const used = selectedMoves.filter((m) => m.kind === kind).length;
    return Math.max(0, total - used);
  };

  const handleCardClick = (kind: CardKind) => {
    const remaining = getCardCount(kind);
    if (!canAct || status !== "CHOOSING" || submitting || remaining <= 0 || selectedMoves.length >= 3) return;
    setSelectedMoves((prev) => [...prev, { kind }]);
  };

  const activeBusType =
    roomBus ??
    (status === "ACTION_PHASE" && isBus1Controller && !isBus2Controller
      ? BusType.BUS1
      : status === "ACTION_PHASE" && isBus2Controller && !isBus1Controller
        ? BusType.BUS2
        : chosenBus);
  const displayGame =
    animatedGame || (status === "CHOOSING" ? submittedPreviewGame : null) || game;
  const activeBusPos = displayGame.buses[activeBusType].pos;
  const roomBusLabel = selectedBus === BusType.BUS1 ? "1번 버스" : "2번 버스";
  const roomTitle = roomBus ? `${roomBusLabel} 딜러룸` : "딜러룸";

  // Generate cells centered at the active bus position
  const gridCells = [];
  if (status === "ACTION_PHASE") {
    const radius = 1;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = activeBusPos.x + dx;
        const ty = activeBusPos.y + dy;
        const inBounds = tx >= 0 && tx < game.board.length && ty >= 0 && ty < game.board.length;
        const tile = inBounds ? game.board[ty][tx] : null;
        gridCells.push({ dx, dy, tx, ty, tile, inBounds });
      }
    }
  }



  // Handle Movement submission (transitions status to ACTION_PHASE)
  const handleMoveSubmit = async () => {
    if (!resolvedPlayerId || status !== "CHOOSING" || !canAct) return;
    setSubmitting(true);
    setErrorMsg("");

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      // 1. Play step-by-step local movement animation in the Dealer Room
      const animClone = JSON.parse(JSON.stringify(game)) as GameState;
      setAnimatedGame(animClone);

      for (let i = 0; i < selectedMoves.length; i++) {
        const move = selectedMoves[i];

        const kind = move.kind;
        const bus = animClone.buses[activeBusType];
        const otherWalls = Object.entries(animClone.buses)
          .filter(([type]) => type !== activeBusType)
          .flatMap(([, state]: any) => state.walls);

        if (kind === "LEFT" || kind === "RIGHT") {
          bus.facing = rotate(bus.facing, kind === "LEFT" ? "L" : "R");
          setAnimatedGame({ ...animClone });
          await delay(600); // Wait for turn rotation visual
        } else {
          const distance = kind === "STRAIGHT1" ? 1 : kind === "STRAIGHT2" ? 2 : 3;

          for (let stepIdx = 0; stepIdx < distance; stepIdx++) {
            const next = stepCoord(bus.pos, bus.facing);

            if (next.x < 0 || next.x >= animClone.board.length || next.y < 0 || next.y >= animClone.board.length) {
              break;
            }

            const segment = wallBetweenTiles(bus.pos, next);
            const existing = [...bus.walls, ...otherWalls];
            if (wallConflicts(segment, existing)) {
              break;
            }

            bus.pos = next;
            setAnimatedGame({ ...animClone });
            await delay(600); // 600ms per tile step
          }
        }
      }

      // 2. Submit the actual moves to the server
      const selectedWithBuses = selectedMoves.map((m) => ({ kind: m.kind, bus: activeBusType }));
      const moveActions = getMovesWithIndices(hand, selectedWithBuses);
      await submitAction(roomCode, resolvedPlayerId, moveActions, activeBusType);
      setSubmittedPreviewGame(JSON.parse(JSON.stringify(animClone)) as GameState);
      setSelectedMoves([]);
    } catch (e: any) {
      setErrorMsg(e.message || "이동 제출에 실패했습니다.");
    } finally {
      setAnimatedGame(null);
      setSubmitting(false);
    }
  };

  // Handle Action submission (transitions turn to next player)
  const handleActionSubmit = async () => {
    if (!resolvedPlayerId || status !== "ACTION_PHASE" || !selectedActionType || !canAct) return;
    if (selectedActionType === "SWAP_TILE" && !actionTarget) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      const action = {
        type: selectedActionType,
        bus: activeBusType,
        target: actionTarget,
      } as TurnAction;
      await submitAction(roomCode, resolvedPlayerId, [action], activeBusType);
      setSelectedActionType(null);
      setActionTarget(null);
    } catch (e: any) {
      setErrorMsg(e.message || "행동 제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Skipping Action
  const handleActionPass = async () => {
    if (!resolvedPlayerId || status !== "ACTION_PHASE" || !canAct) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      await submitAction(roomCode, resolvedPlayerId, [], activeBusType);
      setSelectedActionType(null);
      setActionTarget(null);
    } catch (e: any) {
      setErrorMsg(e.message || "행동 패스에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePass = async () => {
    if (!resolvedPlayerId || status !== "CHOOSING" || !canAct) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      await submitAction(roomCode, resolvedPlayerId, [], activeBusType);
      setSelectedMoves([]);
    } catch (e: any) {
      setErrorMsg(e.message || "이동 패스에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  // Role subtitle text
  const getRoleSubtitle = () => {
    if (roomBus) return `(${roomBusLabel} 전용 방)`;
    if (isBus1Controller && isBus2Controller) return "(1번 버스 & 2번 버스 제어)";
    if (isBus1Controller) return "(1번 버스 제어)";
    if (isBus2Controller) return "(2번 버스 제어)";
    return "(대기 중)";
  };

  return (
    <div className="dealer-layout standalone-dealer-layout">
      <header className="header">
        <div>
          <h1 className="brand-font">{roomTitle}</h1>
          <p className="header-subtitle">
            <strong>{roomTitle}</strong> · 방 코드 <strong>{roomCode}</strong> · {STATUS_TEXT[status] || STATUS_TEXT.CHOOSING}
            {phaseTimeLabel ? ` · 남은 시간 ${phaseTimeLabel}` : ""}
          </p>
        </div>
        <Link href={`/game/${roomCode}`} className="btn btn-ghost" target="_blank" rel="noopener noreferrer">
          공개판
        </Link>
      </header>

      <main className="dealer-station-main">
        <section className="dealer-board-pane">
          <div className="dealer-pane-heading">
            <h2 className="brand-font">보드판</h2>
            {animatedGame ? (
              <span style={{ color: "var(--bus1-color)", fontWeight: "bold", animation: "pulse 1.2s infinite" }}>
                🚌 버스 이동 장면 애니메이션 중...
              </span>
            ) : (
              <span>버스 위치와 격자를 확인하세요</span>
            )}
          </div>
          <Board
            game={displayGame}
            showFacing={!!animatedGame}
            showFacingFor={activeBusType}
            visibleBuses={roomBus ? [activeBusType] : undefined}
          />
          <div className="dealer-scoreboard-wrapper">
            <ScoreBoard game={game} showBusStatus={false} />
          </div>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
          <section className="dealer-panel dealer-hand-pane">
            <div className="active-player-card">
              <span>현재 차례</span>
              <h2 className="dealer-title" style={{ color: `var(--team-${teamCssName})` }}>
                {playerName ?? "대기 중"}
              </h2>
              <div style={{ fontSize: "0.85rem", fontWeight: "bold", color: "var(--text-secondary)", marginTop: 4 }}>
                {getRoleSubtitle()}
              </div>
              {activeTeam && (
                <div className="team-pill" style={{ marginTop: 8 }}>
                  <span className="score-dot" style={{ background: TEAM_COLOUR_VARS[activeTeam] }} />
                  <span className="brand-font">{activeTeam}</span>
                </div>
              )}
            </div>

            {errorMsg && <div className="error-box">{errorMsg}</div>}

            {!resolvedPlayerId || status === "LOBBY" ? (
              <div className="dealer-wait-card">
                <h3 className="brand-font">딜러룸 대기</h3>
                <p>마스터 페이지에서 사람을 입력하고 게임을 시작하면 현재 차례의 카드패가 여기에 표시됩니다.</p>
              </div>
            ) : status === "CHOOSING" && hasISubmittedMoves ? (
              <div className="dealer-wait-card">
                <h3 className="brand-font" style={{ color: "var(--bus1-color)" }}>이동 제출 완료!</h3>
                <p style={{ marginTop: 8 }}>상대방 플레이어의 이동 카드 제출을 기다리고 있습니다...</p>
                <div className="status-metadata" style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                  <span>1번 버스 제출 상태: {isBus1Submitted ? "✅ 완료" : "⏳ 대기 중"}</span>
                  <span>2번 버스 제출 상태: {isBus2Submitted ? "✅ 완료" : "⏳ 대기 중"}</span>
                </div>
              </div>
            ) : status === "ACTION_PHASE" && hasISubmittedAction ? (
              <div className="dealer-wait-card">
                <h3 className="brand-font" style={{ color: "var(--bus2-color)" }}>행동 제출 완료!</h3>
                <p style={{ marginTop: 8 }}>
                  {isBus1ActionSubmitted && isBus2ActionSubmitted
                    ? "마스터가 직접 이번 턴 종료를 눌러야 결과 단계로 넘어가도록 변경했습니다."
                    : "상대방 플레이어의 행동(교환/장애물) 제출을 기다리고 있습니다..."}
                </p>
                <div className="status-metadata" style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                  <span>1번 버스 행동 제출: {isBus1ActionSubmitted ? "✅ 완료" : "⏳ 대기 중"}</span>
                  <span>2번 버스 행동 제출: {isBus2ActionSubmitted ? "✅ 완료" : "⏳ 대기 중"}</span>
                </div>
              </div>
            ) : !canAct ? (
              <div className="dealer-wait-card">
                <h3 className="brand-font">{STATUS_TEXT[status] || "대기 중"}</h3>
                <p>
                  {status === "ACTION_PHASE" && isBus1ActionSubmitted && isBus2ActionSubmitted
                    ? "마스터가 직접 이번 턴 종료를 눌러야 결과 단계로 넘어가도록 변경했습니다."
                    : "상대방 차례이거나 마스터 대기 중입니다. 차례가 돌아오면 활성화됩니다."}
                </p>
              </div>
            ) : (
              <>
                {status === "CHOOSING" ? (
                  <>
                    <div className="dealer-pane-heading" style={{ marginBottom: 16 }}>
                      <h3 className="brand-font" style={{ fontSize: "1.1rem" }}>단계 1: 이동 카드 선택</h3>
                    </div>

                    {roomBus ? (
                      <div className="tile-action-options" style={{ marginBottom: 20 }}>
                        <div
                          className="tile-action-btn tile-action-btn-active"
                          style={{
                            background: activeBusType === BusType.BUS1 ? "var(--bus1-color)" : "var(--bus2-color)",
                            borderColor: activeBusType === BusType.BUS1 ? "var(--bus1-color)" : "var(--bus2-color)",
                            color: "white",
                          }}
                        >
                          {activeBusType === BusType.BUS1 ? "🚌 1번 버스 전용" : "🚌 2번 버스 전용"}
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginBottom: 20 }}>
                        <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: 8, color: "var(--text-secondary)" }}>
                          움직일 버스 선택
                        </label>
                        <div className="tile-action-options">
                          <button
                            type="button"
                            className={`tile-action-btn ${chosenBus === BusType.BUS2 ? "tile-action-btn-active" : ""}`}
                            style={{
                              background: chosenBus === BusType.BUS2 ? "var(--bus2-color)" : undefined,
                              borderColor: chosenBus === BusType.BUS2 ? "var(--bus2-color)" : undefined,
                              color: chosenBus === BusType.BUS2 ? "white" : undefined,
                            }}
                            onClick={() => setChosenBus(BusType.BUS2)}
                            disabled={bus2Disabled}
                          >
                            🚌 2번 버스
                          </button>
                          <button
                            type="button"
                            className={`tile-action-btn ${chosenBus === BusType.BUS1 ? "tile-action-btn-active" : ""}`}
                            style={{
                              background: chosenBus === BusType.BUS1 ? "var(--bus1-color)" : undefined,
                              borderColor: chosenBus === BusType.BUS1 ? "var(--bus1-color)" : undefined,
                              color: chosenBus === BusType.BUS1 ? "white" : undefined,
                            }}
                            onClick={() => setChosenBus(BusType.BUS1)}
                            disabled={bus1Disabled}
                          >
                            🚌 1번 버스
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 2. Move Category Tab */}
                    <div className="action-mode-tabs" style={{ marginBottom: 20 }}>
                      <button
                        className={`mode-tab ${moveCategory === "FORWARD" ? "mode-tab-active" : ""}`}
                        type="button"
                        onClick={() => setMoveCategory("FORWARD")}
                        disabled={submitting}
                      >
                        직진 (Move Forward)
                      </button>
                      <button
                        className={`mode-tab ${moveCategory === "ROTATE" ? "mode-tab-active" : ""}`}
                        type="button"
                        onClick={() => setMoveCategory("ROTATE")}
                        disabled={submitting}
                      >
                        회전 (Rotate)
                      </button>
                    </div>

                    {/* 3. Card Sub-options */}
                    <div className="grouped-cards-container" style={{ marginBottom: 20 }}>
                      {moveCategory === "FORWARD" ? (
                        <>
                          {(["STRAIGHT1", "STRAIGHT2", "STRAIGHT3"] as const).map((kind) => {
                            const count = getCardCount(kind);
                            const isDisabled = count <= 0 || selectedMoves.length >= 3 || submitting;
                            return (
                              <div
                                key={kind}
                                className={`grouped-card-row ${isDisabled ? "disabled" : ""}`}
                                onClick={() => handleCardClick(kind)}
                              >
                                <div className="grouped-card-info">
                                  <span style={{ fontSize: "1.3rem" }}>{CARD_ICONS[kind]}</span>
                                  <div>
                                    <strong style={{ fontSize: "0.95rem" }}>{CARD_NAMES[kind]}</strong>
                                  </div>
                                </div>
                                <span className="grouped-card-badge">{count}장 남음</span>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <>
                          {(["LEFT", "RIGHT"] as const).map((kind) => {
                            const count = getCardCount(kind);
                            const isDisabled = count <= 0 || selectedMoves.length >= 3 || submitting;
                            return (
                              <div
                                key={kind}
                                className={`grouped-card-row ${isDisabled ? "disabled" : ""}`}
                                onClick={() => handleCardClick(kind)}
                              >
                                <div className="grouped-card-info">
                                  <span style={{ fontSize: "1.3rem" }}>{CARD_ICONS[kind]}</span>
                                  <div>
                                    <strong style={{ fontSize: "0.95rem" }}>{CARD_NAMES[kind]}</strong>
                                  </div>
                                </div>
                                <span className="grouped-card-badge">{count}장 남음</span>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>

                    {/* 4. Selection Tray */}
                    <div className="selected-tray" style={{ marginTop: 8 }}>
                      {selectedMoves.length === 0 ? (
                        <div className="selected-empty">이동 방식(직진/회전)을 누르고 카드를 골라 선택하세요 (최대 3장)</div>
                      ) : (
                        selectedMoves.map((m, i) => (
                          <div
                            key={i}
                            className="selected-chip"
                            style={{
                              background: activeBusType === BusType.BUS1 ? "var(--bus1-color)" : "var(--bus2-color)",
                              boxShadow: activeBusType === BusType.BUS1 ? "var(--shadow-glow-bus1)" : "var(--shadow-glow-bus2)",
                            }}
                          >
                            <span>
                              🚌 {CARD_ICONS[m.kind]} {CARD_NAMES[m.kind]}
                            </span>
                            <button
                              className="chip-remove"
                              onClick={() => setSelectedMoves((prev) => prev.filter((_, idx) => idx !== i))}
                              disabled={submitting}
                              type="button"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="dealer-submit-row" style={{ marginTop: 24 }}>
                      <button
                        className="btn btn-primary"
                        onClick={handleMoveSubmit}
                        disabled={submitting || selectedMoves.length === 0}
                        style={{ width: "100%" }}
                      >
                        {submitting ? "버스 이동하는 중..." : "이동 제출 & 행동 단계로"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="tile-action-panel">
                    <div className="dealer-pane-heading" style={{ marginBottom: 12 }}>
                      <h3 className="brand-font" style={{ fontSize: "1.1rem" }}>단계 2: 행동 선택</h3>
                    </div>
                    <p className="dealer-subtitle" style={{ marginBottom: 16 }}>
                      이동이 적용되었습니다. <strong>{activeBusType === BusType.BUS1 ? "1번 버스" : "2번 버스"}</strong> 위치 (
                      {activeBusPos.x}, {activeBusPos.y}) 기준 주변 9칸 행동을 진행합니다.
                    </p>

                    <div className="action-phase-section" style={{ marginTop: 12 }}>
                      <p className="dealer-subtitle" style={{ textAlign: "center", marginBottom: 16 }}>
                        아래 9칸 중 한 칸을 클릭하면 현재 버스 타일과 선택한 타일의 위치가 서로 바뀝니다.
                      </p>

                      <div className="action-grid-3x3">
                        {gridCells.map(({ dx, dy, tx, ty, tile, inBounds }, index) => {
                          const isCenter = dx === 0 && dy === 0;
                          const isSelected = actionTarget?.x === tx && actionTarget?.y === ty;

                          return (
                            <button
                              key={index}
                              type="button"
                              disabled={!inBounds}
                              className={`action-grid-cell tile tile-${tile?.colour} ${isCenter ? "center-cell" : ""} ${
                                isSelected ? "selected" : ""
                              } ${!inBounds ? "disabled" : ""}`}
                              onClick={() => {
                                setActionTarget({ x: tx, y: ty });
                              }}
                            >
                              {isCenter && (
                                <span className="bus-cell-label">
                                  {activeBusType === BusType.BUS1 ? "1번 버스" : "2번 버스"}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="dealer-submit-row" style={{ marginTop: 24 }}>
                      <button
                        className="btn btn-primary"
                        onClick={handleActionSubmit}
                        disabled={
                          submitting ||
                          !selectedActionType ||
                          (selectedActionType === "SWAP_TILE" && !actionTarget)
                        }
                        style={{ flex: 2 }}
                      >
                        {submitting ? "제출 중..." : "행동 제출 & 차례 마치기"}
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={handleActionPass}
                        disabled={submitting}
                        style={{ flex: 1 }}
                      >
                        행동 패스
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
