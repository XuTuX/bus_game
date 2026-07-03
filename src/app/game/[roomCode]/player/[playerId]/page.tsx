import DealerRoom from "@/components/DealerRoom";

export default async function PlayerDealerRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string; playerId: string }>;
}) {
  const { roomCode, playerId } = await params;
  return <DealerRoom roomCode={roomCode} playerId={playerId} />;
}
