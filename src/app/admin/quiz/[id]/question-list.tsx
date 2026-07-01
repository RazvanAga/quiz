"use client";

import { useState, useTransition, type ReactNode } from "react";
import { reorderQuestionsAction } from "./actions";

// Client wrapper that adds drag-to-reorder around the server-rendered
// QuestionCards. Each card is grabbed by its handle (native HTML5 DnD); on drop
// the new order is persisted through the reorder Server Action, which
// revalidates the page. `cards` is keyed by Question id so we can render them in
// whatever local order the drag produces.
export function QuestionList({
  quizId,
  ids,
  cards,
}: {
  quizId: string;
  ids: string[];
  cards: Record<string, ReactNode>;
}) {
  const [order, setOrder] = useState(ids);
  const [grabbedId, setGrabbedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Re-sync to the server's order when the set of Questions changes (a Question
  // was added or deleted). A pure reorder leaves the id set identical, so this
  // does not clobber an optimistic drag result.
  const idsKey = ids.join(",");
  const [syncedKey, setSyncedKey] = useState(idsKey);
  if (idsKey !== syncedKey) {
    setOrder(ids);
    setSyncedKey(idsKey);
  }

  function handleDragEnter(targetId: string): void {
    if (!draggingId || draggingId === targetId) return;
    setOrder((current) => {
      const next = current.filter((id) => id !== draggingId);
      next.splice(next.indexOf(targetId), 0, draggingId);
      return next;
    });
  }

  function handleDragEnd(): void {
    setGrabbedId(null);
    setDraggingId(null);
    // `order` is current here: each dragEnter re-renders before drag ends.
    if (order.join(",") !== ids.join(",")) {
      startTransition(() => reorderQuestionsAction(quizId, order));
    }
  }

  return (
    <ul className="space-y-6">
      {order.map((id) => (
        <li
          key={id}
          draggable={grabbedId === id}
          onDragStart={() => setDraggingId(id)}
          onDragEnter={() => handleDragEnter(id)}
          onDragOver={(e) => e.preventDefault()}
          onDragEnd={handleDragEnd}
          className={`flex gap-2 ${draggingId === id ? "opacity-50" : ""}`}
        >
          <button
            type="button"
            aria-label="Drag to reorder Question"
            onMouseDown={() => setGrabbedId(id)}
            onMouseUp={() => setGrabbedId(null)}
            className="mt-5 flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded text-ink-500 hover:bg-ink-800 hover:text-ink-200 active:cursor-grabbing"
          >
            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden>
              <circle cx="2" cy="3" r="1.5" />
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="2" cy="8" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="2" cy="13" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
          <div className="flex-1">{cards[id]}</div>
        </li>
      ))}
    </ul>
  );
}
