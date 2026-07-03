import DealerRoom from "@/components/DealerRoom";

export default async function DealerRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = await params;
  return <DealerRoom roomCode={roomCode} />;
}
