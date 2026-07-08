"use client";

import { useEffect, useState, useRef } from "react";
import type { LogEntry } from "@/server/gameStore";
import { BusType } from "@/lib/game";

interface AnimatedAction {
  id: number;
  label: string;
  score: number;
  applied: boolean;
  reason?: string;
  bus: BusType;
  category: "bus1-move" | "bus2-move" | "bus1-action" | "bus2-action" | "subway" | "score";
}

export default function TurnResultOverlay({ logs }: { logs: LogEntry[] }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [phase, setPhase] = useState<"animating" | "done">("animating");
  const containerRef = useRef<HTMLDivElement>(null);

  const moveActions = logs
    .filter((log) => log.phase === "MOVE" || !log.phase)
    .flatMap((log) => log.actions);
  const actionPhaseActions = logs
    .filter((log) => log.phase === "ACTION")
    .flatMap((log) => log.actions);

  const allAnimated: AnimatedAction[] = [];
  let idCounter = 0;

  // 1번 버스 이동
  moveActions
    .filter((a) => a.bus === BusType.BUS1 && !a.actionLabel.includes("보너스"))
    .forEach((a) => {
      allAnimated.push({
        id: idCounter++,
        label: `🚌1 ${a.actionLabel}`,
        score: a.scoreGained,
        applied: a.applied,
        reason: a.reason,
        bus: a.bus,
        category: "bus1-move",
      });
    });

  // 2번 버스 이동
  moveActions
    .filter((a) => a.bus === BusType.BUS2)
    .forEach((a) => {
      allAnimated.push({
        id: idCounter++,
        label: `🚌2 ${a.actionLabel}`,
        score: a.scoreGained,
        applied: a.applied,
        reason: a.reason,
        bus: a.bus,
        category: "bus2-move",
      });
    });

  // 보너스 점수
  moveActions
    .filter((a) => a.actionLabel.includes("보너스"))
    .forEach((a) => {
      allAnimated.push({
        id: idCounter++,
        label: `🎯 ${a.actionLabel}`,
        score: a.scoreGained,
        applied: a.applied,
        bus: a.bus,
        category: "score",
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
      allAnimated.push({
        id: idCounter++,
        label: `🔧1 ${a.actionLabel}`,
        score: a.scoreGained,
        applied: a.applied,
        reason: a.reason,
        bus: a.bus,
        category: "bus1-action",
      });
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
      allAnimated.push({
        id: idCounter++,
        label: `🔧2 ${a.actionLabel}`,
        score: a.scoreGained,
        applied: a.applied,
        reason: a.reason,
        bus: a.bus,
        category: "bus2-action",
      });
    });

  // 지하철
  actionPhaseActions
    .filter((a) => a.actionLabel.startsWith("지하철"))
    .forEach((a) => {
      allAnimated.push({
        id: idCounter++,
        label: `🚇 ${a.actionLabel}`,
        score: a.scoreGained,
        applied: a.applied,
        bus: a.bus,
        category: "subway",
      });
    });

  // 점수 판정
  actionPhaseActions
    .filter((a) => a.actionLabel.includes("점수"))
    .forEach((a) => {
      allAnimated.push({
        id: idCounter++,
        label: `⭐ ${a.actionLabel}`,
        score: a.scoreGained,
        applied: a.applied,
        bus: a.bus,
        category: "score",
      });
    });

  const totalItems = allAnimated.length;

  useEffect(() => {
    setVisibleCount(0);
    setPhase("animating");

    if (totalItems === 0) {
      setPhase("done");
      return;
    }

    let count = 0;
    const interval = setInterval(() => {
      count++;
      setVisibleCount(count);
      if (count >= totalItems) {
        clearInterval(interval);
        setTimeout(() => setPhase("done"), 600);
      }
    }, 400);

    return () => clearInterval(interval);
  }, [totalItems, logs.length]);

  if (totalItems === 0) return null;

  return (
    <div className="turn-result-overlay" ref={containerRef}>
      <div className="turn-result-overlay-header">
        <h3 className="brand-font">⚡ 턴 결과</h3>
      </div>
      <div className="turn-result-feed">
        {allAnimated.slice(0, visibleCount).map((item, idx) => {
          const isLatest = idx === visibleCount - 1 && phase === "animating";
          return (
            <div
              key={item.id}
              className={`turn-result-feed-item ${
                isLatest ? "turn-result-feed-item-enter" : ""
              } ${!item.applied ? "turn-result-feed-item-fail" : ""} ${
                item.category
              }`}
            >
              <span className="turn-result-feed-label">{item.label}</span>
              <span className="turn-result-feed-status">
                {item.applied ? (
                  item.score !== 0 ? (
                    <span
                      className={`turn-result-score ${
                        item.score > 0
                          ? "turn-result-score-plus"
                          : "turn-result-score-minus"
                      }`}
                    >
                      {item.score > 0 ? "+" : ""}
                      {item.score}점
                    </span>
                  ) : (
                    <span className="turn-result-ok">✓</span>
                  )
                ) : (
                  <span className="turn-result-fail">
                    ✕ {item.reason ?? "실패"}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {phase === "done" && (
        <div className="turn-result-summary-line turn-result-feed-item-enter">
          ✅ 모든 행동 처리 완료
        </div>
      )}
    </div>
  );
}
