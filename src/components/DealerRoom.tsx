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
} from "@/lib/game";
import { submitAction, usePrivateGame, usePublicGame } from "@/lib/useGameState";

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
  Orange: "var(--team-orange)",
  Yellow: "var(--team-yellow)",
  Green: "var(--team-green)",
  Blue: "var(--team-blue)",
};

const STATUS_TEXT = {
  LOBBY: "마스터가 사람을 입력하는 중입니다.",
  WAITING: "마스터가 딜러룸 입력을 시작할 때까지 대기하세요.",
  CHOOSING: "현재 차례입니다. 이동 옵션을 선택하고 제출하세요.",
  ACTION_PHASE: "이동이 완료되었습니다. 행동(교체/장애물)을 선택하세요.",
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
    const plusTeam = COLOURS[initialGame.turnIndex];
    const minusTeam = COLOURS[COLOURS.length - 1 - initialGame.turnIndex];
    const plusTeamPlayers = initialGame.players.filter((p) => p.team === plusTeam);
    const minusTeamPlayers = initialGame.players.filter((p) => p.team === minusTeam);
    const plusPlayer = plusTeamPlayers[0];
    const minusPlayer = minusTeamPlayers[1] || minusTeamPlayers[0];

    resolvedPlayerId =
      roomBus === BusType.PLUS ? plusPlayer?.id || "" : minusPlayer?.id || "";
  }

  const privateState = usePrivateGame(roomCode, resolvedPlayerId);
  
  // Simulated state for step-by-step client-side movement animation
  const [animatedGame, setAnimatedGame] = useState<GameState | null>(null);
  const [submittedPreviewGame, setSubmittedPreviewGame] = useState<GameState | null>(null);

  // Movement selections
  const [chosenBus, setChosenBus] = useState<BusType>(BusType.PLUS);
  const [moveCategory, setMoveCategory] = useState<"FORWARD" | "ROTATE">("FORWARD");
  const [selectedMoves, setSelectedMoves] = useState<CardKind[]>([]);
  
  // Action phase states
  const [selectedActionType, setSelectedActionType] = useState<"SWAP_TILE" | "PLACE_OBSTACLE" | null>(null);
  const [actionTarget, setActionTarget] = useState<{ x: number; y: number } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const isPlusController = privateState?.isPlusController ?? false;
  const isMinusController = privateState?.isMinusController ?? false;
  const isPlusSubmitted = publicState?.pendingMoves?.PLUS ?? false;
  const isMinusSubmitted = publicState?.pendingMoves?.MINUS ?? false;
  const isPlusActionSubmitted = publicState?.pendingActions?.PLUS ?? false;
  const isMinusActionSubmitted = publicState?.pendingActions?.MINUS ?? false;
  const selectedBus = roomBus ?? chosenBus;
  const isSelectedBusController =
    selectedBus === BusType.PLUS ? isPlusController : isMinusController;
  const isSelectedMoveSubmitted =
    selectedBus === BusType.PLUS ? isPlusSubmitted : isMinusSubmitted;
  const isSelectedActionSubmitted =
    selectedBus === BusType.PLUS ? isPlusActionSubmitted : isMinusActionSubmitted;

  // Auto-lock chosenBus based on role authority
  useEffect(() => {
    if (roomBus) {
      setChosenBus(roomBus);
    } else if (isPlusController && !isMinusController) {
      setChosenBus(BusType.PLUS);
    } else if (isMinusController && !isPlusController) {
      setChosenBus(BusType.MINUS);
    } else if (isPlusController && isMinusController) {
      if (publicState?.status === "CHOOSING") {
        setChosenBus(isPlusSubmitted && !isMinusSubmitted ? BusType.MINUS : BusType.PLUS);
      } else if (publicState?.status === "ACTION_PHASE") {
        setChosenBus(
          isPlusActionSubmitted && !isMinusActionSubmitted ? BusType.MINUS : BusType.PLUS
        );
      }
    }
  }, [
    roomBus,
    isPlusController,
    isMinusController,
    isPlusSubmitted,
    isMinusSubmitted,
    isPlusActionSubmitted,
    isMinusActionSubmitted,
    publicState?.status,
  ]);

  useEffect(() => {
    setSelectedMoves([]);
    setSelectedActionType(null);
    setActionTarget(null);
    setErrorMsg("");
    setAnimatedGame(null);
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
    : ((isPlusController && isPlusSubmitted) || !isPlusController) &&
      ((isMinusController && isMinusSubmitted) || !isMinusController) &&
      (isPlusController || isMinusController);

  const hasISubmittedAction = roomBus
    ? isSelectedBusController && isSelectedActionSubmitted
    : ((isPlusController && isPlusActionSubmitted) || !isPlusController) &&
      ((isMinusController && isMinusActionSubmitted) || !isMinusController) &&
      (isPlusController || isMinusController);

  const canAct =
    privateState?.isMyTurn &&
    isSelectedBusController &&
    ((status === "CHOOSING" && !isSelectedMoveSubmitted) ||
      (status === "ACTION_PHASE" && !isSelectedActionSubmitted));
  const plusBusDisabled =
    !!roomBus ||
    submitting ||
    (isMinusController && !isPlusController) ||
    (isPlusController && isMinusController && isPlusSubmitted);
  const minusBusDisabled =
    !!roomBus ||
    submitting ||
    (isPlusController && !isMinusController) ||
    (isPlusController && isMinusController && (!isPlusSubmitted || isMinusSubmitted));

  // Group hand cards and calculate remaining unused counts
  const getCardCount = (kind: CardKind) => {
    const total = hand.filter((c) => c.kind === kind).length;
    const used = selectedMoves.filter((k) => k === kind).length;
    return Math.max(0, total - used);
  };

  const handleCardClick = (kind: CardKind) => {
    const remaining = getCardCount(kind);
    if (!canAct || status !== "CHOOSING" || submitting || remaining <= 0 || selectedMoves.length >= 3) return;
    setSelectedMoves((prev) => [...prev, kind]);
  };

  const activeBusType =
    roomBus ??
    (status === "ACTION_PHASE" && isPlusController && !isMinusController
      ? BusType.PLUS
      : status === "ACTION_PHASE" && isMinusController && !isPlusController
        ? BusType.MINUS
        : chosenBus);
  const displayGame =
    animatedGame || (status === "CHOOSING" ? submittedPreviewGame : null) || game;
  const activeBusPos = displayGame.buses[activeBusType].pos;
  const roomBusLabel = selectedBus === BusType.PLUS ? "PLUS" : "MINUS";
  const roomTitle = roomBus ? `${roomBusLabel} 딜러룸` : "딜러룸";

  // Generate 3x3 cells centered at the active bus position
  const gridCells = [];
  if (status === "ACTION_PHASE") {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
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
        const kind = selectedMoves[i];
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
      const selectedWithBuses = selectedMoves.map((kind) => ({ kind, bus: activeBusType }));
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
    if (!resolvedPlayerId || status !== "ACTION_PHASE" || !selectedActionType || !actionTarget || !canAct) return;
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
    if (roomBus) return `(${roomBusLabel} 버스 전용 방)`;
    if (isPlusController && isMinusController) return "(PLUS & MINUS 버스 제어)";
    if (isPlusController) return "(PLUS 버스 제어)";
    if (isMinusController) return "(MINUS 버스 제어)";
    return "(대기 중)";
  };

  return (
    <div className="dealer-layout standalone-dealer-layout">
      <header className="header">
        <div>
          <h1 className="brand-font">{roomTitle}</h1>
          <p className="header-subtitle">
            <strong>{roomTitle}</strong> · 방 코드 <strong>{roomCode}</strong> · {STATUS_TEXT[status] || STATUS_TEXT.CHOOSING}
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
              <span style={{ color: "var(--bus-plus)", fontWeight: "bold", animation: "pulse 1.2s infinite" }}>
                🚌 버스 이동 장면 애니메이션 중...
              </span>
            ) : (
              <span>버스 위치와 격자를 확인하세요</span>
            )}
          </div>
          <Board game={displayGame} showFacing={false} />
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
                <h3 className="brand-font" style={{ color: "var(--bus-plus)" }}>이동 제출 완료!</h3>
                <p style={{ marginTop: 8 }}>상대방 플레이어의 이동 카드 제출을 기다리고 있습니다...</p>
                <div className="status-metadata" style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                  <span>PLUS 버스 제출 상태: {isPlusSubmitted ? "✅ 완료" : "⏳ 대기 중"}</span>
                  <span>MINUS 버스 제출 상태: {isMinusSubmitted ? "✅ 완료" : "⏳ 대기 중"}</span>
                </div>
              </div>
            ) : status === "ACTION_PHASE" && hasISubmittedAction ? (
              <div className="dealer-wait-card">
                <h3 className="brand-font" style={{ color: "var(--bus-minus)" }}>행동 제출 완료!</h3>
                <p style={{ marginTop: 8 }}>상대방 플레이어의 행동(교체/장애물) 제출을 기다리고 있습니다...</p>
                <div className="status-metadata" style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                  <span>PLUS 버스 행동 제출: {isPlusActionSubmitted ? "✅ 완료" : "⏳ 대기 중"}</span>
                  <span>MINUS 버스 행동 제출: {isMinusActionSubmitted ? "✅ 완료" : "⏳ 대기 중"}</span>
                </div>
              </div>
            ) : !canAct ? (
              <div className="dealer-wait-card">
                <h3 className="brand-font">{STATUS_TEXT[status] || "대기 중"}</h3>
                <p>상대방 차례이거나 마스터 대기 중입니다. 차례가 돌아오면 활성화됩니다.</p>
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
                            background: activeBusType === BusType.PLUS ? "var(--bus-plus)" : "var(--bus-minus)",
                            borderColor: activeBusType === BusType.PLUS ? "var(--bus-plus)" : "var(--bus-minus)",
                            color: "white",
                          }}
                        >
                          {activeBusType === BusType.PLUS ? "＋ PLUS 버스 전용" : "ー MINUS 버스 전용"}
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
                            className={`tile-action-btn ${chosenBus === BusType.PLUS ? "tile-action-btn-active" : ""}`}
                            style={{
                              background: chosenBus === BusType.PLUS ? "var(--bus-plus)" : undefined,
                              borderColor: chosenBus === BusType.PLUS ? "var(--bus-plus)" : undefined,
                              color: chosenBus === BusType.PLUS ? "white" : undefined,
                            }}
                            onClick={() => setChosenBus(BusType.PLUS)}
                            disabled={plusBusDisabled}
                          >
                            ＋ PLUS 버스
                          </button>
                          <button
                            type="button"
                            className={`tile-action-btn ${chosenBus === BusType.MINUS ? "tile-action-btn-active" : ""}`}
                            style={{
                              background: chosenBus === BusType.MINUS ? "var(--bus-minus)" : undefined,
                              borderColor: chosenBus === BusType.MINUS ? "var(--bus-minus)" : undefined,
                              color: chosenBus === BusType.MINUS ? "white" : undefined,
                            }}
                            onClick={() => setChosenBus(BusType.MINUS)}
                            disabled={minusBusDisabled}
                          >
                            ー MINUS 버스
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
                        selectedMoves.map((kind, i) => (
                          <div
                            key={i}
                            className="selected-chip"
                            style={{
                              background: activeBusType === BusType.PLUS ? "var(--bus-plus)" : "var(--bus-minus)",
                              boxShadow: activeBusType === BusType.PLUS ? "var(--shadow-glow-plus)" : "var(--shadow-glow-minus)",
                            }}
                          >
                            <span>
                              {CARD_ICONS[kind]} {CARD_NAMES[kind]}
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
                        disabled={submitting}
                        style={{ width: "100%" }}
                      >
                        {submitting ? "버스 이동하는 중..." : selectedMoves.length === 0 ? "이동 없이 행동 단계로" : "이동 제출 & 행동 단계로"}
                      </button>
                      <button className="btn btn-ghost" onClick={handlePass} disabled={submitting} style={{ width: "100%" }}>
                        이동 패스하기
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="tile-action-panel">
                    <div className="dealer-pane-heading" style={{ marginBottom: 12 }}>
                      <h3 className="brand-font" style={{ fontSize: "1.1rem" }}>단계 2: 행동 선택</h3>
                    </div>
                    <p className="dealer-subtitle" style={{ marginBottom: 16 }}>
                      이동이 적용되었습니다. <strong>{activeBusType === BusType.PLUS ? "PLUS" : "MINUS"} 버스</strong> 위치 (
                      {activeBusPos.x}, {activeBusPos.y}) 기준 주변 9칸 행동을 진행합니다.
                    </p>

                    <div className="tile-action-options" style={{ marginBottom: 20 }}>
                      <button
                        type="button"
                        className={`tile-action-btn ${selectedActionType === "SWAP_TILE" ? "tile-action-btn-active" : ""}`}
                        onClick={() => {
                          setSelectedActionType("SWAP_TILE");
                          setActionTarget(null);
                        }}
                      >
                        타일 색상 교체
                      </button>
                      <button
                        type="button"
                        className={`tile-action-btn ${selectedActionType === "PLACE_OBSTACLE" ? "tile-action-btn-active" : ""}`}
                        onClick={() => {
                          setSelectedActionType("PLACE_OBSTACLE");
                          setActionTarget(null);
                        }}
                      >
                        장애물 설치
                      </button>
                    </div>

                    {selectedActionType ? (
                      <div className="action-phase-section">
                        <p className="dealer-subtitle" style={{ textAlign: "center" }}>
                          {selectedActionType === "SWAP_TILE"
                            ? "아래 9칸 중 한 칸을 클릭하면 현재 버스 타일의 색상과 그 타일의 색상이 서로 맞바뀝니다."
                            : "상하좌우 4칸 중 벽(장애물)이 없는 칸을 선택하여 설치하세요."}
                        </p>

                        <div className="action-grid-3x3">
                          {gridCells.map(({ dx, dy, tx, ty, tile, inBounds }, index) => {
                            const isCenter = dx === 0 && dy === 0;
                            const isOrthogonal = Math.abs(dx) + Math.abs(dy) === 1;

                            // Hide diagonal cells for obstacle placement mode to avoid clutter
                            if (selectedActionType === "PLACE_OBSTACLE" && !isOrthogonal && !isCenter) {
                              return <div key={index} style={{ aspectRatio: 1 }} />;
                            }

                            // Check if there is already a wall between the bus and this cell
                            const hasExistingWall = (() => {
                              if (!inBounds || !isOrthogonal) return false;
                              try {
                                const segment = wallBetweenTiles(activeBusPos, { x: tx, y: ty });
                                const allWalls = [
                                  ...game.buses.PLUS.walls,
                                  ...game.buses.MINUS.walls,
                                ];
                                return allWalls.some((w: any) =>
                                  (w.from.x === segment.from.x && w.from.y === segment.from.y && w.to.x === segment.to.x && w.to.y === segment.to.y) ||
                                  (w.from.x === segment.to.x && w.from.y === segment.to.y && w.to.x === segment.from.x && w.to.y === segment.from.y)
                                );
                              } catch {
                                return false;
                              }
                            })();

                            const isSelected = actionTarget?.x === tx && actionTarget?.y === ty;
                            const isCellDisabled =
                              !inBounds ||
                              (selectedActionType === "PLACE_OBSTACLE" && (!isOrthogonal || hasExistingWall));

                            return (
                              <button
                                key={index}
                                type="button"
                                disabled={isCellDisabled}
                                className={`action-grid-cell tile tile-${tile?.colour} ${isCenter ? "center-cell" : ""} ${
                                  isSelected ? "selected" : ""
                                } ${isCellDisabled ? "disabled" : ""}`}
                                onClick={() => {
                                  setActionTarget({ x: tx, y: ty });
                                }}
                              >
                                {hasExistingWall && <span style={{ fontSize: "0.8rem" }}>🚧</span>}
                                {isCenter && <span style={{ fontSize: "0.8rem", fontWeight: "bold", color: "white", textShadow: "0 1px 2px black" }}>🚌</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-secondary)" }}>
                        행동 유형(타일 교체 또는 장애물 설치)을 선택하세요
                      </div>
                    )}

                    <div className="dealer-submit-row" style={{ marginTop: 24 }}>
                      <button
                        className="btn btn-primary"
                        onClick={handleActionSubmit}
                        disabled={submitting || !selectedActionType || !actionTarget}
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

          <section className="dealer-panel">
            <ScoreBoard game={game} showBusStatus={false} />
          </section>
        </div>
      </main>
    </div>
  );
}
