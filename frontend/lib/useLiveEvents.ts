"use client";
import { useEffect, useRef, useState } from "react";

export type NexusEvent = {
  type: "hello" | "incident.created" | "agent.step" | "dispatch.created" | "notification";
  ts?: string;
  data: Record<string, unknown>;
};

/**
 * Subscribe to the backend realtime stream.
 *
 * INTEGRATION POINT: the bundled dashboard ships with a self-contained
 * simulation so it demos with zero backend. To drive it from live data,
 * replace the internal generator with events from this hook:
 *
 *   const events = useLiveEvents();
 *   // map events -> incidents / reasoning log / stats
 */
export function useLiveEvents(url = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws") {
  const [events, setEvents] = useState<NexusEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        retry = setTimeout(connect, 2000); // auto-reconnect
      };
      ws.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data) as NexusEvent;
          setEvents((prev) => [...prev.slice(-300), evt]);
        } catch {
          /* ignore malformed frames */
        }
      };
    };
    connect();
    return () => {
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [url]);

  return { events, connected };
}
