"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Board from "@/components/Board";
import ScoreBoard from "@/components/ScoreBoard";
import {
  BusType,
  type CardKind,
  type Colour,
  type GameState,
  type MoveTurnAction,
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
  Orange: "var(--team-orange)",
  Yellow: "var(--team-yellow)",
  Green: "var(--team-green)",
  Blue: "var(--team-blue)",
};

const CARD_ORDER: CardKind[] = [
  "STRAIGHT1",
  "STRAIGHT2",
  "STRAIGHT3",
  "LEFT",
  "RIGHT",
];

const STATUS_TEXT = {
  LOBBY: "마스터가 사람을 입력하는 중입니다.",
  WAITING: "마스터가 딜러룸 입력을 시작할 때까지 대기하세요.",
  CHOOSING: "각 지하철 담당자가 카드를 제출하거나 패스할 수 있습니다.",
  ACTION_PHASE: "버스 행동 단계가 끝나기 전까지 지하철을 제출할 수 있습니다.",
  GAME_OVER: "게임이 종료되었습니다.",
} as const;

export default function SubwayRoom({ roomCode }: { roomCode: string }) {
  const publicState = usePublicGame(roomCode);
  const game = publicState?.game as GameState | undefined;
  const phaseTimeLabel = usePhaseTimeLabel(publicState);
  const pendingSubwayMoves = useMemo(
    () => publicState?.pendingSubwayMoves ?? { BUS1: false, BUS2: false },
    [publicState?.pendingSubwayMoves]
  );
  const subwayControllers = publicState?.subwayControllers;

  const [selectedSubway, setSelectedSubway] = useState<BusType>(BusType.BUS1);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedKind, setSelectedKind] = useState<CardKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const selectedController =
    selectedSubway === BusType.BUS1
      ? subwayControllers?.BUS1
      : subwayControllers?.BUS2;
  const selectedPrivateState = usePrivateGame(roomCode, selectedPlayerId);
  const hand = selectedPrivateState?.hand ?? [];
  const isSelectedSubwaySubmitted = !!pendingSubwayMoves[selectedSubway];
  const canSubwaySubmitPhase =
    publicState?.status === "CHOOSING" || publicState?.status === "ACTION_PHASE";
  const canSubmit =
    canSubwaySubmitPhase &&
    !!selectedController &&
    !isSelectedSubwaySubmitted &&
    !!selectedPlayerId &&
    !submitting;

  useEffect(() => {
    setSelectedPlayerId(selectedController?.playerId ?? "");
    setErrorMsg("");
  }, [selectedController?.playerId]);

  useEffect(() => {
    setSelectedKind(null);
  }, [selectedPlayerId, selectedSubway]);

  const getCardCount = (kind: CardKind) =>
    hand.filter((card) => card.kind === kind).length;

  const handleSubmitCard = async () => {
    if (!canSubmit || !selectedKind) return;
    const cardIndex = hand.findIndex((card) => card.kind === selectedKind);
    if (cardIndex < 0) {
      setErrorMsg("선택한 카드가 손패에 없습니다.");
      return;
    }

    const actions: MoveTurnAction[] = [
      {
        type: "MOVE",
        bus: selectedSubway,
        subway: true,
        cardIndex,
      },
    ];

    await submitSubway(actions);
  };

  const handlePass = async () => {
    if (!canSubmit) return;
    await submitSubway([]);
  };

  const submitSubway = async (actions: MoveTurnAction[]) => {
    if (!selectedPlayerId) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      await submitAction(
        roomCode,
        selectedPlayerId,
        actions,
        selectedSubway,
        "SUBWAY"
      );
      setSelectedKind(null);
    } catch (e: any) {
      setErrorMsg(e.message || "지하철 제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!publicState || !game) {
    return (
      <div className="dealer-layout">
        <div className="dealer-main" style={{ justifyContent: "center" }}>
          <h2>지하철 조작 창 접속 중...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="dealer-layout standalone-dealer-layout">
      <header className="header">
        <div>
          <h1 className="brand-font">지하철 조작 창</h1>
          <p className="header-subtitle">
            방 코드 <strong>{roomCode}</strong> · {STATUS_TEXT[publicState.status] ?? STATUS_TEXT.CHOOSING}
            {phaseTimeLabel ? ` · 남은 시간 ${phaseTimeLabel}` : ""}
          </p>
        </div>
        <div className="header-actions">
          <Link href={`/game/${roomCode}`} className="btn btn-ghost" target="_blank" rel="noopener noreferrer">
            공개판
          </Link>
        </div>
      </header>

      <main className="dealer-station-main">
        <section className="dealer-board-pane">
          <div className="dealer-pane-heading">
            <h2 className="brand-font">보드판</h2>
            <span>{selectedSubway === BusType.BUS1 ? "1호선" : "2호선"} 위치를 확인하세요</span>
          </div>
          <Board game={game} showFacing={false} showFacingFor={selectedSubway} />
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
          <section className="dealer-panel dealer-hand-pane">
            <div className="dealer-pane-heading" style={{ marginBottom: 16 }}>
              <h2 className="brand-font">지하철 입력</h2>
              <span>지하철당 카드 최대 1장</span>
            </div>

            {errorMsg && <div className="error-box">{errorMsg}</div>}

            <div style={{ marginBottom: 18 }}>
              <label className="subway-control-label">움직일 지하철</label>
              <div className="tile-action-options">
                {([BusType.BUS1, BusType.BUS2] as const).map((subway) => {
                  const controller =
                    subway === BusType.BUS1
                      ? subwayControllers?.BUS1
                      : subwayControllers?.BUS2;
                  const submitted = !!pendingSubwayMoves[subway];
                  return (
                    <button
                      key={subway}
                      type="button"
                      className={`tile-action-btn ${selectedSubway === subway ? "tile-action-btn-active" : ""}`}
                      onClick={() => setSelectedSubway(subway)}
                      disabled={submitting || !controller}
                    >
                      <strong>{subway === BusType.BUS1 ? "1호선" : "2호선"}</strong>
                      <span style={{ display: "block", fontSize: "0.82rem", marginTop: 4 }}>
                        {controller
                          ? `${controller.playerName ?? controller.playerId} · ${controller.team}`
                          : "담당자 없음"}
                        {" · "}
                        {submitted ? "제출 완료" : "입력 대기"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label className="subway-control-label">제출 담당자</label>
              <div className="dealer-wait-card" style={{ padding: 16 }}>
                {selectedController ? (
                  <div className="team-pill" style={{ justifyContent: "center" }}>
                    <span className="score-dot" style={{ background: TEAM_COLOUR_VARS[selectedController.team] }} />
                    <span>
                      {selectedController.playerName ?? selectedController.playerId}
                      {" · "}
                      {selectedController.team}
                    </span>
                  </div>
                ) : (
                  <p>선택한 지하철 담당자가 없습니다.</p>
                )}
              </div>
            </div>

            {!canSubwaySubmitPhase ? (
              <div className="dealer-wait-card">
                <h3 className="brand-font">{STATUS_TEXT[publicState.status] ?? "대기 중"}</h3>
                <p>이동 단계가 시작되면 행동 단계가 끝나기 전까지 지하철 카드를 제출할 수 있습니다.</p>
              </div>
            ) : isSelectedSubwaySubmitted ? (
              <div className="dealer-wait-card">
                <h3 className="brand-font">제출 완료</h3>
                <p>{selectedSubway === BusType.BUS1 ? "1호선" : "2호선"} 지하철 입력이 이미 접수되었습니다.</p>
              </div>
            ) : (
              <>
                <div className="grouped-cards-container" style={{ marginBottom: 20 }}>
                  {CARD_ORDER.map((kind) => {
                    const count = getCardCount(kind);
                    const isDisabled = !canSubmit || count <= 0;
                    return (
                      <div
                        key={kind}
                        className={`grouped-card-row ${isDisabled ? "disabled" : ""} ${
                          selectedKind === kind ? "tile-scored" : ""
                        }`}
                        onClick={() => {
                          if (!isDisabled) setSelectedKind(kind);
                        }}
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
                </div>

                <div className="dealer-submit-row">
                  <button
                    className="btn btn-primary"
                    onClick={handleSubmitCard}
                    disabled={!canSubmit || !selectedKind}
                    style={{ flex: 2 }}
                  >
                    {submitting ? "제출 중..." : "카드 1장 제출"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={handlePass}
                    disabled={!canSubmit}
                    style={{ flex: 1 }}
                  >
                    패스
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="dealer-panel">
            <ScoreBoard game={game} showBusStatus={true} />
          </section>
        </div>
      </main>
    </div>
  );
}
