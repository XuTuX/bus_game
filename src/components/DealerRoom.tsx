"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Board from "@/components/Board";
import {
  BusType,
  cardLabel,
  type CardKind,
  type Colour,
  type MoveTurnAction,
  type TileTurnAction,
  type TurnAction,
} from "@/lib/game";
import { submitAction, usePrivateGame, usePublicGame } from "@/lib/useGameState";

const CARD_ICONS: Record<CardKind, string> = {
  STRAIGHT1: "➡️",
  STRAIGHT2: "⏩",
  STRAIGHT3: "⏭️",
  LEFT: "↩️",
  RIGHT: "↪️",
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
  CHOOSING: "현재 차례입니다. 카드와 버스를 선택하세요.",
  SUBMITTED: "제출 처리 중입니다.",
  REVEALED: "결과가 공개되었습니다.",
  GAME_OVER: "게임이 종료되었습니다.",
} as const;

export default function DealerRoom({ roomCode }: { roomCode: string }) {
  const publicState = usePublicGame(roomCode);
  const activePlayerId = publicState?.activePlayerId ?? "";
  const privateState = usePrivateGame(roomCode, activePlayerId);
  const [mode, setMode] = useState<"MOVE" | "ACTION">("MOVE");
  const [selectedActions, setSelectedActions] = useState<MoveTurnAction[]>([]);
  const [tileAction, setTileAction] = useState<TileTurnAction["type"] | null>(null);
  const [tileBus, setTileBus] = useState<BusType | null>(null);
  const [pendingCardIndex, setPendingCardIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    setSelectedActions([]);
    setTileAction(null);
    setTileBus(null);
    setPendingCardIndex(null);
    setErrorMsg("");
  }, [activePlayerId, publicState?.status]);

  if (!publicState) {
    return (
      <div className="dealer-layout">
        <div className="dealer-main" style={{ justifyContent: "center" }}>
          <h2>딜러룸 접속 중...</h2>
        </div>
      </div>
    );
  }

  const { game, status } = publicState;
  const activePlayer = game.players.find((player) => player.id === activePlayerId);
  const hand = privateState?.hand ?? [];
  const isMyTurn = Boolean(privateState?.isMyTurn && activePlayerId);
  const team = privateState?.team ?? activePlayer?.team;
  const playerName = privateState?.playerName ?? activePlayer?.name ?? activePlayer?.id;
  const canAct = isMyTurn && status === "CHOOSING";
  const canChooseCards = canAct && hand.length > 0;
  const teamCssName = (team ?? "Blue").toLowerCase();

  const usedOriginalIndices = new Set<number>();
  for (const sel of selectedActions) {
    let adjustedIndex = sel.cardIndex;
    const sortedUsed = [...usedOriginalIndices].sort((a, b) => a - b);
    for (const used of sortedUsed) {
      if (used <= adjustedIndex) {
        adjustedIndex += 1;
      }
    }
    usedOriginalIndices.add(adjustedIndex);
  }

  const handleCardClick = (index: number) => {
    if (!canChooseCards || submitting) return;
    if (usedOriginalIndices.has(index) || selectedActions.length >= 3) return;
    setPendingCardIndex(index);
  };

  const handleBusSelect = (bus: BusType) => {
    if (pendingCardIndex === null) return;

    let adjustedIndex = pendingCardIndex;
    const sortedUsed = [...usedOriginalIndices].sort((a, b) => a - b);
    for (const used of sortedUsed) {
      if (used < pendingCardIndex) {
        adjustedIndex -= 1;
      }
    }
    setSelectedActions((prev) => [...prev, { bus, cardIndex: adjustedIndex }]);
    setPendingCardIndex(null);
  };

  const handleSubmit = async () => {
    if (!activePlayerId) return;
    const actions: TurnAction[] =
      mode === "MOVE"
        ? selectedActions
        : tileAction && tileBus
        ? [{ type: tileAction, bus: tileBus }]
        : [];
    if (actions.length === 0) return;

    setSubmitting(true);
    setErrorMsg("");
    try {
      await submitAction(roomCode, activePlayerId, actions);
      setSelectedActions([]);
      setTileAction(null);
      setTileBus(null);
    } catch (e: any) {
      setErrorMsg(e.message || "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePass = async () => {
    if (!activePlayerId || !canAct) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      await submitAction(roomCode, activePlayerId, []);
      setSelectedActions([]);
    } catch (e: any) {
      setErrorMsg(e.message || "패스에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dealer-layout standalone-dealer-layout">
      <header className="header">
        <div>
          <h1 className="brand-font">딜러룸</h1>
          <p className="header-subtitle">
            방 코드 <strong>{roomCode}</strong> · {STATUS_TEXT[status]}
          </p>
        </div>
        <Link href={`/game/${roomCode}`} className="btn btn-ghost">
          공개판
        </Link>
      </header>

      <main className="dealer-station-main">
        <section className="dealer-board-pane">
          <div className="dealer-pane-heading">
            <h2 className="brand-font">보드판</h2>
            <span>버스 위치와 벽을 확인하세요</span>
          </div>
          <Board game={game} />
        </section>

        <section className="dealer-panel dealer-hand-pane">
          <div className="active-player-card">
            <span>현재 차례</span>
            <h2 className="dealer-title" style={{ color: `var(--team-${teamCssName})` }}>
              {playerName ?? "대기 중"}
            </h2>
            {team && (
              <div className="team-pill">
                <span className="score-dot" style={{ background: TEAM_COLOUR_VARS[team] }} />
                <span className="brand-font">{team}</span>
              </div>
            )}
          </div>

          {errorMsg && <div className="error-box">{errorMsg}</div>}

          {!activePlayerId || status === "LOBBY" ? (
            <div className="dealer-wait-card">
              <h3 className="brand-font">딜러룸 대기</h3>
              <p>마스터 페이지에서 사람을 입력하고 게임을 시작하면 현재 차례의 카드패가 여기에 표시됩니다.</p>
            </div>
          ) : !canAct ? (
            <div className="dealer-wait-card">
              <h3 className="brand-font">{STATUS_TEXT[status]}</h3>
              <p>마스터가 입력을 시작하면 이 화면에서 현재 차례 사람이 카드를 선택합니다.</p>
            </div>
          ) : (
            <>
              <div className="action-mode-tabs">
                <button
                  className={`mode-tab ${mode === "MOVE" ? "mode-tab-active" : ""}`}
                  type="button"
                  onClick={() => setMode("MOVE")}
                >
                  이동
                </button>
                <button
                  className={`mode-tab ${mode === "ACTION" ? "mode-tab-active" : ""}`}
                  type="button"
                  onClick={() => setMode("ACTION")}
                >
                  행동
                </button>
              </div>

              {mode === "MOVE" ? (
                <>
                  <p className="dealer-subtitle">
                    지나간 타일은 PLUS 버스면 +1, MINUS 버스면 -1입니다. 버프된 칸은 +2, +3처럼 커집니다.
                  </p>
                  <div className="card-list dealer-card-list">
                    {hand.map((card, index) => {
                      const isUsed = usedOriginalIndices.has(index);
                      return (
                        <button
                          key={index}
                          className={`card ${isUsed ? "card-used" : ""}`}
                          onClick={() => handleCardClick(index)}
                          type="button"
                        >
                          <span className="card-icon">{CARD_ICONS[card.kind as CardKind]}</span>
                          <span className="card-label">{cardLabel(card)}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="selected-tray">
                    {selectedActions.length === 0 ? (
                      <div className="selected-empty">
                        카드를 클릭하여 이동을 선택하세요 (최대 3장)
                      </div>
                    ) : (
                      selectedActions.map((sel, i) => (
                        <div
                          key={i}
                          className="selected-chip"
                          style={{
                            background:
                              sel.bus === BusType.PLUS ? "var(--bus-plus)" : "var(--bus-minus)",
                            boxShadow:
                              sel.bus === BusType.PLUS
                                ? "var(--shadow-glow-plus)"
                                : "var(--shadow-glow-minus)",
                          }}
                        >
                          <span>{sel.bus === BusType.PLUS ? "＋" : "ー"} 이동 {i + 1}</span>
                          <button
                            className="chip-remove"
                            onClick={() =>
                              setSelectedActions((prev) => prev.filter((_, idx) => idx !== i))
                            }
                            disabled={submitting}
                            type="button"
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="tile-action-panel">
                  <p className="dealer-subtitle">
                    버프는 내 색상 칸의 점수를 +2, +3처럼 키웁니다. 교체는 선택한 버스 위치의 타일을 내 색상으로 바꿉니다.
                  </p>
                  <div className="tile-action-options">
                    <button
                      type="button"
                      className={`tile-action-btn ${
                        tileAction === "BUFF_TILE" ? "tile-action-btn-active" : ""
                      }`}
                      onClick={() => setTileAction("BUFF_TILE")}
                    >
                      내 칸 버프
                    </button>
                    <button
                      type="button"
                      className={`tile-action-btn ${
                        tileAction === "SWAP_TILE" ? "tile-action-btn-active" : ""
                      }`}
                      onClick={() => setTileAction("SWAP_TILE")}
                    >
                      타일 교체
                    </button>
                  </div>
                  <div className="bus-choice-row">
                    <button
                      type="button"
                      className={`bus-choice bus-choice-plus ${
                        tileBus === BusType.PLUS ? "bus-choice-active" : ""
                      }`}
                      onClick={() => setTileBus(BusType.PLUS)}
                    >
                      PLUS 버스 위치
                    </button>
                    <button
                      type="button"
                      className={`bus-choice bus-choice-minus ${
                        tileBus === BusType.MINUS ? "bus-choice-active" : ""
                      }`}
                      onClick={() => setTileBus(BusType.MINUS)}
                    >
                      MINUS 버스 위치
                    </button>
                  </div>
                </div>
              )}

              <div className="dealer-submit-row">
                <button
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={
                    submitting ||
                    (mode === "MOVE"
                      ? selectedActions.length === 0
                      : !tileAction || !tileBus)
                  }
                >
                  {submitting ? "제출 중..." : "제출하고 다음 차례"}
                </button>
                <button className="btn btn-ghost" onClick={handlePass} disabled={submitting}>
                  패스
                </button>
              </div>
            </>
          )}
        </section>
      </main>

      {pendingCardIndex !== null && (
        <div className="modal-overlay" onClick={() => setPendingCardIndex(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="brand-font" style={{ marginBottom: 8 }}>어느 버스에 적용할까요?</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
              {CARD_ICONS[hand[pendingCardIndex].kind as CardKind]}{" "}
              {cardLabel(hand[pendingCardIndex])}
            </p>
            <div className="bus-buttons">
              <button className="bus-btn bus-btn-plus" onClick={() => handleBusSelect(BusType.PLUS)}>
                ＋ PLUS 버스
              </button>
              <button
                className="bus-btn bus-btn-minus"
                onClick={() => handleBusSelect(BusType.MINUS)}
              >
                ー MINUS 버스
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
