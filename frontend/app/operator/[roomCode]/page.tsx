import { redirect } from "next/navigation";

export default function OperatorRedirect({ params }: { params: { roomCode: string } }) {
  redirect(`/game/monopoly/${params.roomCode}/operator`);
}
