import { PlayerJoin } from "./player-join";

// The Player landing (PRD): set a display name, pick an Avatar, enter a Game PIN
// and wait in the Lobby. (Authoring lives behind /admin, gated by nginx.)
export default function Home() {
  return <PlayerJoin />;
}
