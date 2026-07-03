import Link from "next/link";

const ROOM_PAGES = [
  {
    href: (roomCode: string) => `/game/${roomCode}/admin`,
    title: "마스터",
    description: "사람 입력, 색상 변경, 게임 진행",
  },
  {
    href: (roomCode: string) => `/game/${roomCode}`,
    title: "공개판",
    description: "보드판, 버스 위치, 점수 확인",
  },
] as const;

export default function RoomPageLinks({ roomCode }: { roomCode: string }) {
  return (
    <nav className="room-page-links" aria-label="입장 가능한 화면">
      {ROOM_PAGES.map((page) => {
        const isNewTab = page.title === "공개판";
        return (
          <Link
            className="room-page-link"
            href={page.href(roomCode)}
            key={page.title}
            target={isNewTab ? "_blank" : undefined}
            rel={isNewTab ? "noopener noreferrer" : undefined}
          >
            <strong>{page.title}</strong>
            <span>{page.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}
