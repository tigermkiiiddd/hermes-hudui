"""Gateway-based chat engine using Hermes API Server."""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime
from typing import Optional

import httpx

from .models import (
    ChatSession,
    ComposerState,
    StreamingEvent,
)
from .streamer import ChatStreamer

# Gateway instances: name -> (host, port)
GATEWAY_INSTANCES = {
    "stable": {
        "host": "127.0.0.1",
        "port": 8642,
        "label": "Hermes (Stable)",
    },
    "dev": {
        "host": "127.0.0.1",
        "port": 8643,
        "label": "Hermes (Dev)",
    },
}

DEFAULT_INSTANCE = "stable"


class ChatNotAvailableError(Exception):
    """Raised when chat functionality is not available."""

    pass


class ChatEngine:
    """Chat engine using Hermes Gateway API Server (/v1/chat/completions)."""

    _instance: Optional["ChatEngine"] = None
    _lock = threading.Lock()

    def __new__(cls) -> "ChatEngine":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._sessions: dict[str, ChatSession] = {}
        self._streamers: dict[str, ChatStreamer] = {}
        self._cancel_events: dict[str, threading.Event] = {}
        # Per-session conversation history (sent to gateway each turn)
        self._conversation_history: dict[str, list[dict]] = {}
        # Gateway session IDs returned via X-Hermes-Session-Id header
        self._gateway_session_ids: dict[str, str] = {}
        self._initialized = True

        # Active gateway instance
        self._active_instance: str = os.getenv("GATEWAY_INSTANCE", DEFAULT_INSTANCE)
        self._gateway_host: str = ""
        self._gateway_port: int = 0
        self._gateway_url: str = ""
        self._apply_instance(self._active_instance)

    def _apply_instance(self, name: str) -> None:
        """Apply gateway instance config by name."""
        inst = GATEWAY_INSTANCES.get(name)
        if inst:
            self._active_instance = name
            self._gateway_host = inst["host"]
            self._gateway_port = inst["port"]
            self._gateway_url = f"http://{inst['host']}:{inst['port']}"

    @property
    def active_instance(self) -> str:
        return self._active_instance

    def get_gateway_info(self) -> dict:
        """Get info about all gateway instances and their availability."""
        result = {}
        for name, inst in GATEWAY_INSTANCES.items():
            url = f"http://{inst['host']}:{inst['port']}"
            alive = False
            try:
                resp = httpx.get(f"{url}/health", timeout=2.0)
                alive = resp.status_code == 200
            except Exception:
                pass
            result[name] = {
                "label": inst["label"],
                "host": inst["host"],
                "port": inst["port"],
                "url": url,
                "alive": alive,
                "active": name == self._active_instance,
            }
        return result

    def switch_instance(self, name: str) -> bool:
        """Switch active gateway instance. Returns True if switched."""
        if name not in GATEWAY_INSTANCES:
            return False
        self._apply_instance(name)
        # Clear gateway session IDs since they belong to the old instance
        self._gateway_session_ids.clear()
        return True

    def is_available(self) -> bool:
        """Check if active gateway API server is running."""
        try:
            resp = httpx.get(f"{self._gateway_url}/health", timeout=3.0)
            return resp.status_code == 200
        except Exception:
            return False

    def create_session(
        self, profile: Optional[str] = None, model: Optional[str] = None
    ) -> ChatSession:
        """Create a new chat session."""
        session_id = str(uuid.uuid4())[:8]

        session = ChatSession(
            id=session_id,
            profile=profile,
            model=model,
            title=f"Chat {session_id}",
            backend_type="gateway",
        )
        self._sessions[session_id] = session
        self._conversation_history[session_id] = []

        return session

    def get_session(self, session_id: str) -> Optional[ChatSession]:
        """Get session by ID."""
        return self._sessions.get(session_id)

    def list_sessions(self) -> list[ChatSession]:
        """List all active sessions."""
        return list(self._sessions.values())

    def end_session(self, session_id: str) -> bool:
        """End a chat session."""
        if session_id in self._sessions:
            self._sessions[session_id].is_active = False

            # Signal cancel
            if session_id in self._cancel_events:
                self._cancel_events[session_id].set()

            # Cleanup streamer
            if session_id in self._streamers:
                self._streamers[session_id].stop()
                del self._streamers[session_id]

            return True
        return False

    def send_message(
        self,
        session_id: str,
        content: str,
    ) -> ChatStreamer:
        """Send a message via gateway /v1/chat/completions (SSE stream)."""
        session = self._sessions.get(session_id)
        if not session:
            raise ChatNotAvailableError(f"Session {session_id} not found")

        if not session.is_active:
            raise ChatNotAvailableError(f"Session {session_id} is inactive")

        # Clean up previous streamer/cancel
        if session_id in self._streamers:
            self._streamers[session_id].stop()
        if session_id in self._cancel_events:
            self._cancel_events[session_id].set()

        streamer = ChatStreamer()
        self._streamers[session_id] = streamer
        cancel_event = threading.Event()
        self._cancel_events[session_id] = cancel_event

        # Update session stats
        session.message_count += 1
        session.last_activity = datetime.now()

        # Append user message to history
        history = self._conversation_history.setdefault(session_id, [])
        history.append({"role": "user", "content": content})

        # Capture current gateway URL for this request (in case user switches mid-stream)
        gateway_url = self._gateway_url

        def run_gateway_stream():
            try:
                messages = list(history)
                payload = {
                    "model": session.model or "hermes-agent",
                    "messages": messages,
                    "stream": True,
                }

                headers = {"Content-Type": "application/json"}
                # If we have a gateway session ID, pass it for continuity
                gw_session = self._gateway_session_ids.get(session_id)
                if gw_session:
                    headers["X-Hermes-Session-Id"] = gw_session

                with httpx.stream(
                    "POST",
                    f"{gateway_url}/v1/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=httpx.Timeout(600.0, connect=10.0),
                ) as resp:
                    if resp.status_code != 200:
                        body = ""
                        for chunk in resp.iter_text():
                            body += chunk
                        streamer.emit_error(
                            f"Gateway error {resp.status_code}: {body[:300]}"
                        )
                        return

                    # Capture gateway session ID
                    gw_sid = resp.headers.get("x-hermes-session-id")
                    if gw_sid:
                        self._gateway_session_ids[session_id] = gw_sid

                    full_response = ""
                    current_event_type = None  # Track SSE event: type

                    for line in resp.iter_lines():
                        if cancel_event.is_set() or streamer._stopped.is_set():
                            break

                        if not line:
                            # Blank line = end of SSE event
                            current_event_type = None
                            continue

                        # SSE comment (keepalive)
                        if line.startswith(":"):
                            continue

                        # SSE event type
                        if line.startswith("event:"):
                            current_event_type = line[6:].strip()
                            continue

                        # SSE data line
                        if line.startswith("data: "):
                            data_str = line[6:]
                        elif line.startswith("data:"):
                            data_str = line[5:]
                        else:
                            continue

                        if data_str == "[DONE]":
                            break

                        # Handle custom hermes events
                        if current_event_type == "hermes.tool.progress":
                            try:
                                progress = json.loads(data_str)
                                tool_name = progress.get("tool", "unknown")
                                tool_id = f"tp-{uuid.uuid4().hex[:6]}"
                                label = progress.get("label", tool_name)
                                emoji = progress.get("emoji", "🔧")
                                streamer.emit_tool_start(
                                    tool_id,
                                    tool_name,
                                    {"_progress_label": f"{emoji} {label}"},
                                )
                                streamer.emit_tool_end(tool_id)
                            except Exception:
                                pass
                            continue

                        # Parse OpenAI chunk
                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        choices = chunk.get("choices", [])
                        if not choices:
                            continue

                        choice = choices[0]
                        delta = choice.get("delta", {})

                        # Content token
                        content_delta = delta.get("content")
                        if content_delta:
                            full_response += content_delta
                            streamer.emit_token(content_delta)

                        # Reasoning (if present)
                        reasoning = delta.get("reasoning")
                        if reasoning:
                            streamer.emit_reasoning(reasoning)

                    # Store assistant response in history
                    if full_response:
                        history.append({"role": "assistant", "content": full_response})

                    streamer.emit_done()

            except httpx.ConnectError:
                inst = GATEWAY_INSTANCES.get(self._active_instance, {})
                streamer.emit_error(
                    f"Cannot connect to {inst.get('label', 'gateway')}. "
                    f"Is it running on {self._gateway_host}:{self._gateway_port}?"
                )
            except httpx.TimeoutException:
                streamer.emit_error("Gateway request timed out")
            except Exception as e:
                streamer.emit_error(f"Gateway request failed: {e}")
            finally:
                self._cancel_events.pop(session_id, None)

        threading.Thread(target=run_gateway_stream, daemon=True).start()

        return streamer

    def cancel_stream(self, session_id: str) -> None:
        """Cancel the active stream for a session."""
        if session_id in self._cancel_events:
            self._cancel_events[session_id].set()

        if session_id in self._streamers:
            self._streamers[session_id].stop()

    def get_composer_state(self, session_id: str) -> ComposerState:
        """Get current composer state for UI."""
        session = self._sessions.get(session_id)
        if not session:
            return ComposerState(model="unknown")

        return ComposerState(
            model=session.model or "hermes-agent",
            is_streaming=session_id in self._streamers and not self._streamers[session_id]._stopped.is_set(),
            context_tokens=0,
        )

    def cleanup_all(self) -> None:
        """Clean up all sessions."""
        for session_id in list(self._sessions.keys()):
            self.end_session(session_id)


# Global engine instance
chat_engine = ChatEngine()
