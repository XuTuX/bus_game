"use client";

import { useEffect, useState } from "react";
import type { LogEntry } from "@/server/gameStore";
import { BusType, BOARD_SIZE, type GameState } from "@/lib/game";

const TILE_SIZE = 56;
const TILE_GAP = 3;
const STEP = TILE_SIZE + TILE_GAP;
const BOARD_PAD = 12;

interface ScorePopup {
  id: number;
  label: string;
  score: number;
  applied: boolean;
  x: number; // pixel position
  y: number; // pixel position
  bus: BusType;
  category: "bus1" | "bus2" | "subway" | "bonus";
}

function tileCenter(tileX: number, tileY: number) {
  return {
    x: BOARD_PAD + tileX * STEP + TILE_SIZE / 2,
    y: BOARD_PAD + tileY * STEP + TILE_SIZE / 2,
  };
}

export default function BoardScorePopups({
  logs,
  game,
}: {
  logs: LogEntry[];
  game: GameState;
}) {
  const [visibleCount, setVisibleCount] = useState(0);

  const moveActions = logs
    .filter((log) => log.phase === "MOVE" || !log.phase)
    .flatMap((log) => log.actions);
  const actionPhaseActions = logs
    .filter((log) => log.phase === "ACTION")
    .flatMap((log) => log.actions);

  const bus1Pos = game.buses[BusType.BUS1]?.pos ?? { x: 4, y: 4 };
  const bus2Pos = game.buses[BusType.BUS2]?.pos ?? { x: 4, y: 4 };
  const subwayPos = game.subways?.[BusType.BUS1]?.pos?.[0] ?? { x: 5, y: 0 };

  const popups: ScorePopup[] = [];
  let idCounter = 0;
  let bus1StackOffset = 0;
  let bus2StackOffset = 0;
  let subwayStackOffset = 0;

  // 1번 버스 이동
  moveActions
    .filter((a) => a.bus === BusType.BUS1 && !a.actionLabel.includes("보너스"))
    .forEach((a) => {
      const center = tileCenter(bus1Pos.x, bus1Pos.y);
      popups.push({
        id: idCounter++,
        label: a.actionLabel,
        score: a.scoreGained,
        applied: a.applied,
        x: center.x - 30,
        y: center.y - 50 - bus1StackOffset * 36,
        bus: a.bus,
        category: "bus1",
      });
      if (a.scoreGained !== 0) bus1StackOffset++;
    });

  // 2번 버스 이동
  moveActions
    .filter((a) => a.bus === BusType.BUS2)
    .forEach((a) => {
      const center = tileCenter(bus2Pos.x, bus2Pos.y);
      popups.push({
        id: idCounter++,
        label: a.actionLabel,
        score: a.scoreGained,
        applied: a.applied,
        x: center.x + 10,
        y: center.y - 50 - bus2StackOffset * 36,
        bus: a.bus,
        category: "bus2",
      });
      if (a.scoreGained !== 0) bus2StackOffset++;
    });

  // 보너스 점수 (두 버스 같은 색 도착 등)
  moveActions
    .filter((a) => a.actionLabel.includes("보너스"))
    .forEach((a) => {
      const center = tileCenter(Math.floor(BOARD_SIZE / 2), Math.floor(BOARD_SIZE / 2));
      popups.push({
        id: idCounter++,
        label: a.actionLabel,
        score: a.scoreGained,
        applied: a.applied,
        x: center.x - 40,
        y: center.y - 20,
        bus: a.bus,
        category: "bonus",
      });
    });

  // 1번 버스 행동
  actionPhaseActions
    .filter(
      (a) =>
        a.bus === BusType.BUS1 &&
        !a.actionLabel.startsWith("지하철") &&
        !a.actionLabel.includes("점수")
    )
    .forEach((a) => {
      const center = tileCenter(bus1Pos.x, bus1Pos.y);
      popups.push({
        id: idCounter++,
        label: a.actionLabel,
        score: a.scoreGained,
        applied: a.applied,
        x: center.x - 30,
        y: center.y - 50 - bus1StackOffset * 36,
        bus: a.bus,
        category: "bus1",
      });
      if (a.scoreGained !== 0) bus1StackOffset++;
    });

  // 2번 버스 행동
  actionPhaseActions
    .filter(
      (a) =>
        a.bus === BusType.BUS2 &&
        !a.actionLabel.startsWith("지하철") &&
        !a.actionLabel.includes("점수")
    )
    .forEach((a) => {
      const center = tileCenter(bus2Pos.x, bus2Pos.y);
      popups.push({
        id: idCounter++,
        label: a.actionLabel,
        score: a.scoreGained,
        applied: a.applied,
        x: center.x + 10,
        y: center.y - 50 - bus2StackOffset * 36,
        bus: a.bus,
        category: "bus2",
      });
      if (a.scoreGained !== 0) bus2StackOffset++;
    });

  // 지하철
  actionPhaseActions
    .filter((a) => a.actionLabel.startsWith("지하철") && !a.actionLabel.includes("점수"))
    .forEach((a) => {
      const center = tileCenter(subwayPos.x, subwayPos.y);
      popups.push({
        id: idCounter++,
        label: a.actionLabel,
        score: a.scoreGained,
        applied: a.applied,
        x: center.x - 20,
        y: center.y - 50 - subwayStackOffset * 36,
        bus: a.bus,
        category: "subway",
      });
      if (a.scoreGained !== 0) subwayStackOffset++;
    });

  // 영역 점수
  actionPhaseActions
    .filter((a) => a.actionLabel.includes("점수"))
    .forEach((a) => {
      const center = tileCenter(Math.floor(BOARD_SIZE / 2), Math.floor(BOARD_SIZE / 2));
      popups.push({
        id: idCounter++,
        label: a.actionLabel,
        score: a.scoreGained,
        applied: a.applied,
        x: center.x - 40,
        y: center.y + 10,
        bus: a.bus,
        category: "bonus",
      });
    });

  // Only show popups that have score changes or important info
  const scoringPopups = popups.filter(
    (p) => p.score !== 0 || p.category === "bonus"
  );

  const totalItems = scoringPopups.length;

  useEffect(() => {
    setVisibleCount(0);
    if (totalItems === 0) return;

    let count = 0;
    const interval = setInterval(() => {
      count++;
      setVisibleCount(count);
      if (count >= totalItems) clearInterval(interval);
    }, 500);

    return () => clearInterval(interval);
  }, [totalItems, logs.length]);

  if (totalItems === 0) return null;

  return (
    <div className="board-score-popups-overlay">
      {scoringPopups.slice(0, visibleCount).map((popup, idx) => {
        const isLatest = idx === visibleCount - 1;
        const scoreText =
          popup.score > 0
            ? `+${popup.score}점`
            : popup.score < 0
              ? `${popup.score}점`
              : "";

        return (
          <div
            key={popup.id}
            className={`board-score-popup board-score-popup-${popup.category} ${
              isLatest ? "board-score-popup-enter" : "board-score-popup-settled"
            } ${popup.score > 0 ? "board-score-popup-plus" : popup.score < 0 ? "board-score-popup-minus" : ""}`}
            style={{
              left: popup.x,
              top: popup.y,
            }}
          >
            <span className="board-score-popup-score">{scoreText}</span>
          </div>
        );
      })}
    </div>
  );
}
