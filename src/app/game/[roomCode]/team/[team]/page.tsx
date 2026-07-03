import { redirect } from "next/navigation";

export default async function TeamDealerRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string; team: string }>;
}) {
  const { roomCode } = await params;
  redirect(`/dealer/${roomCode}`);
}
