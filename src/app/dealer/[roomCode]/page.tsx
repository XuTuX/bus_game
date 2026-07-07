import Link from "next/link";

export default async function DealerRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = await params;
  return (
    <div className="dealer-layout home-layout">
      <div className="dealer-panel home-panel">
        <h1 className="brand-font home-title">딜러룸 선택</h1>
        <p className="home-subtitle">
          방 코드 <strong>{roomCode}</strong> · 오프라인 진행 방에 맞춰 입장하세요.
        </p>

        <div className="home-actions">
          <section className="home-section">
            <h2 className="brand-font">버스 1 딜러룸</h2>
            <p>버스 1 이동 카드와 행동을 제출합니다.</p>
            <Link
              className="btn btn-primary"
              href={`/dealer/${roomCode}/bus1`}
              style={{ background: "var(--bus1-color)", borderColor: "var(--bus1-color)" }}
            >
              버스 1 딜러룸 열기
            </Link>
          </section>

          <section className="home-section">
            <h2 className="brand-font">버스 2 딜러룸</h2>
            <p>버스 2 이동 카드와 행동을 제출합니다.</p>
            <Link
              className="btn btn-primary"
              href={`/dealer/${roomCode}/bus2`}
              style={{ background: "var(--bus2-color)", borderColor: "var(--bus2-color)" }}
            >
              버스 2 딜러룸 열기
            </Link>
          </section>
        </div>

        <div className="home-page-buttons" style={{ marginTop: 24 }}>
          <Link className="btn btn-ghost" href={`/game/${roomCode}`} target="_blank" rel="noopener noreferrer">
            공개판 열기
          </Link>
          <Link className="btn btn-ghost" href={`/game/${roomCode}/admin`}>
            마스터 페이지
          </Link>
        </div>
      </div>
    </div>
  );
}
