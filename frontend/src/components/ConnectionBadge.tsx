import { useEffect, useState } from "react";
import clsx from "clsx";
import { useChainStore, type WsStatus } from "../lib/ws";

const LABEL: Record<WsStatus, string> = {
  connected: "Connected",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected",
};

const DOT: Record<WsStatus, string> = {
  connected: "bg-green",
  reconnecting: "bg-yellow-400",
  disconnected: "bg-red",
};

/**
 * WS connection indicator for the top bar (Phase 5 §2). State + last-message
 * timestamp are sourced from the ws.ts Zustand store (one socket, RAF flush
 * stamps `lastMessageAt`). The tooltip shows the last-message age in seconds.
 */
export default function ConnectionBadge(): JSX.Element {
  const status = useChainStore((s) => s.status);
  const lastMessageAt = useChainStore((s) => s.lastMessageAt);

  // Re-render once per second so the tooltip age stays fresh while connected.
  const [, setNow] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setNow((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const ageSec =
    lastMessageAt === null
      ? null
      : Math.max(0, Math.round((Date.now() - lastMessageAt) / 1000));
  const tooltip =
    ageSec === null
      ? `${LABEL[status]} · no messages yet`
      : `${LABEL[status]} · last message ${ageSec}s ago`;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2 py-1 text-xs text-text"
      data-testid="connection-badge"
      data-status={status}
      title={tooltip}
    >
      <span className={clsx("h-2 w-2 rounded-full", DOT[status])} />
      <span>{LABEL[status]}</span>
    </span>
  );
}
