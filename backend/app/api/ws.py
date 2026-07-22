"""Realtime layer.

A tiny in-process pub/sub over WebSockets. The dashboard subscribes here and
receives: `incident.created`, `agent.step`, `dispatch.created` and
`notification` events as they happen. For multi-replica deploys, back this
with Redis pub/sub (the `broadcast` signature stays identical).
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


class ConnectionManager:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)

    async def broadcast(self, event_type: str, payload: dict) -> None:
        message = json.dumps({
            "type": event_type,
            "ts": datetime.now(timezone.utc).isoformat(),
            "data": payload,
        }, default=str)
        async with self._lock:
            dead = []
            for ws in self._clients:
                try:
                    await ws.send_text(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self._clients.discard(ws)


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await manager.connect(ws)
    try:
        await ws.send_text(json.dumps({"type": "hello", "data": {"msg": "NEXUS realtime online"}}))
        while True:
            # keep-alive; clients may send ping frames
            await ws.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(ws)
    except Exception:
        await manager.disconnect(ws)
