"use client";

import { useEffect, useRef } from "react";

export interface QueueEvent {
  type: "queue:join" | "queue:update";
  entry?: Record<string, unknown>;
}

interface Options {
  onJoin?: (event: QueueEvent) => void;
  onUpdate?: (event: QueueEvent) => void;
  onStopped?: (reason: "gone" | "unavailable") => void;
  enabled?: boolean;
  intervalMs?: number;
  maxFailures?: number;
}

/** Polls queue status; serverless functions cannot hold SSE connections open. */
export function useQueueEvents(shopId: string | null | undefined, options: Options = {}) {
  const { onJoin, onUpdate, onStopped, enabled = true, intervalMs = 5000, maxFailures = 3 } = options;
  const onJoinRef = useRef(onJoin);
  const onUpdateRef = useRef(onUpdate);
  const onStoppedRef = useRef(onStopped);
  onJoinRef.current = onJoin;
  onUpdateRef.current = onUpdate;
  onStoppedRef.current = onStopped;

  useEffect(() => {
    if (!shopId || !enabled) return;

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const previousEntries = new Map<string, string>();
    let failures = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/queue/status/${shopId}`, { cache: "no-store" });
        if (!response.ok) {
          failures += 1;
          if (response.status === 410 || failures >= maxFailures) {
            alive = false;
            onStoppedRef.current?.(response.status === 410 ? "gone" : "unavailable");
          }
          return;
        }
        failures = 0;
        const payload = (await response.json()) as { data?: { entries?: Array<Record<string, unknown>> } };
        const entries = payload.data?.entries ?? [];

        for (const entry of entries) {
          const entryId = typeof entry.id === "string" ? entry.id : null;
          if (!entryId) continue;
          const signature = JSON.stringify(entry);
          const previous = previousEntries.get(entryId);
          if (!previous) onJoinRef.current?.({ type: "queue:join", entry });
          else if (previous !== signature) onUpdateRef.current?.({ type: "queue:update", entry });
          previousEntries.set(entryId, signature);
        }

        const activeIds = new Set(entries.map((entry) => entry.id).filter((id): id is string => typeof id === "string"));
        for (const entryId of previousEntries.keys()) {
          if (!activeIds.has(entryId)) previousEntries.delete(entryId);
        }
      } catch {
        failures += 1;
        if (failures >= maxFailures) {
          alive = false;
          onStoppedRef.current?.("unavailable");
        }
      } finally {
        if (alive) timer = setTimeout(poll, intervalMs);
      }
    };

    void poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [shopId, enabled, intervalMs]);
}
