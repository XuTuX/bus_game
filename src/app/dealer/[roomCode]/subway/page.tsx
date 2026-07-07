import SubwayRoom from "@/components/SubwayRoom";

export default async function SubwayDealerRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = await params;
  return <SubwayRoom roomCode={roomCode} />;
}
