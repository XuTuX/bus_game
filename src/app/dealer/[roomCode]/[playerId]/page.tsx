import { redirect } from "next/navigation";

export default async function LegacyDealerRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string; playerId: string }>;
}) {
  const { roomCode } = await params;
  redirect(`/dealer/${roomCode}`);
}
