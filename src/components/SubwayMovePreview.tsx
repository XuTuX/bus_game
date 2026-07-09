import { type CardKind, type Colour } from "@/lib/game";

export type SubwayMovePreviewSubmission = {
  playerId: string;
  playerName?: string;
  team: Colour;
  cardKind?: CardKind;
  label: string;
  submittedOrder: number;
};

const MOVE_GLYPHS: Record<CardKind, { icon: string; count?: number; label: string }> = {
  STRAIGHT1: { icon: "→", count: 1, label: "직진" },
  STRAIGHT2: { icon: "→", count: 2, label: "직진" },
  STRAIGHT3: { icon: "→", count: 3, label: "직진" },
  STRAIGHT4: { icon: "→", count: 4, label: "직진" },
  LEFT: { icon: "↶", label: "좌회전" },
  RIGHT: { icon: "↷", label: "우회전" },
};

export function SubwayMoveGlyph({ cardKind }: { cardKind?: CardKind }) {
  if (!cardKind) {
    return (
      <span className="subway-move-glyph subway-move-pass" aria-label="패스">
        <span className="subway-move-icon">·</span>
        <span className="subway-move-label">패스</span>
      </span>
    );
  }

  const glyph = MOVE_GLYPHS[cardKind];
  return (
    <span
      className="subway-move-glyph"
      aria-label={glyph.count ? `${glyph.label} ${glyph.count}칸` : glyph.label}
    >
      <span className="subway-move-icon">{glyph.icon}</span>
      <span className="subway-move-label">{glyph.label}</span>
      {glyph.count ? <span className="subway-move-count">× {glyph.count}</span> : null}
    </span>
  );
}

export default function SubwayMovePreview({
  submissions,
  title = "지하철 이동 예정",
}: {
  submissions: SubwayMovePreviewSubmission[];
  title?: string;
}) {
  if (submissions.length === 0) {
    return null;
  }

  return (
    <div className="status-panel">
      <h2>{title}</h2>
      <div className="subway-move-sequence">
        {submissions.map((submission, index) => (
          <div
            className="subway-move-step"
            key={`${submission.playerId}-${submission.submittedOrder}`}
          >
            <span className="seat-number">{index + 1}</span>
            <SubwayMoveGlyph cardKind={submission.cardKind} />
          </div>
        ))}
      </div>
    </div>
  );
}
