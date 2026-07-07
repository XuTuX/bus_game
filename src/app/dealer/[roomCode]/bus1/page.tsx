import DealerRoom from "@/components/DealerRoom";
import { BusType } from "@/lib/game";

export default async function Bus1DealerRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = await params;
  return <DealerRoom roomCode={roomCode} roomBus={BusType.BUS1} />;
}
