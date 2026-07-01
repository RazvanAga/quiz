import { HostGame } from "./host-lobby";
import { quizRepository } from "@/lib/quiz-repo";

// The live Host screen for one Game (PRD `/admin/host/[pin]`). The Game itself
// lives in the custom server's in-memory store; this page attaches to it over
// Socket.IO by PIN. It also loads the Quiz's Questions (by the quizId carried in
// the URL from "Start game") and hands them to the client, which sends them to
// the server when the Host starts the Questions. nginx Basic Auth gates /admin
// (#13). Leaderboard/Podium land in #7.
export const dynamic = "force-dynamic";

export default async function HostPage({
  params,
  searchParams,
}: {
  params: Promise<{ pin: string }>;
  searchParams: Promise<{ quizId?: string }>;
}) {
  const { pin } = await params;
  const { quizId } = await searchParams;
  const quiz = quizId ? quizRepository().getQuiz(quizId) : null;
  return <HostGame pin={pin} questions={quiz?.questions ?? []} />;
}
