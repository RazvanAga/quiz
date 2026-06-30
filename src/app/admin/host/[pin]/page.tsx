import { HostLobby } from "./host-lobby";

// The live Host screen for one Game (PRD `/admin/host/[pin]`). The Game itself
// lives in the custom server's in-memory store; this page just attaches to it
// over Socket.IO by PIN and renders the Lobby. nginx Basic Auth gates /admin
// (#13). The Questions/Reveal/Leaderboard phases land in #6+.
export const dynamic = "force-dynamic";

export default async function HostPage({
  params,
}: {
  params: Promise<{ pin: string }>;
}) {
  const { pin } = await params;
  return <HostLobby pin={pin} />;
}
