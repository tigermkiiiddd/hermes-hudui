"""API routes for Agent Chat feature."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..chat import (
    ChatNotAvailableError,
    chat_engine,
)
from ..chat.models import ChatSession

router = APIRouter(prefix="/chat", tags=["chat"])


# Request/Response Models
class CreateSessionRequest(BaseModel):
    profile: str | None = None
    model: str | None = None


class SendMessageRequest(BaseModel):
    content: str
    lang: str | None = None


class SessionResponse(BaseModel):
    id: str
    profile: str | None
    model: str | None
    title: str
    backend_type: str
    is_active: bool
    message_count: int


class ComposerStateResponse(BaseModel):
    model: str
    is_streaming: bool
    context_tokens: int


def _session_to_response(session: ChatSession) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        profile=session.profile,
        model=session.model,
        title=session.title,
        backend_type=session.backend_type,
        is_active=session.is_active,
        message_count=session.message_count,
    )


@router.post("/sessions", response_model=SessionResponse)
async def create_session(request: CreateSessionRequest) -> SessionResponse:
    """Create a new chat session."""
    try:
        session = chat_engine.create_session(
            profile=request.profile, model=request.model
        )
        return _session_to_response(session)
    except ChatNotAvailableError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions() -> list[SessionResponse]:
    """List all active chat sessions."""
    return [_session_to_response(s) for s in chat_engine.list_sessions()]


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str) -> SessionResponse:
    """Get a specific session."""
    session = chat_engine.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_to_response(session)


@router.delete("/sessions/{session_id}")
async def end_session(session_id: str) -> dict[str, str]:
    """End a chat session."""
    if chat_engine.end_session(session_id):
        return {"status": "ended", "session_id": session_id}
    raise HTTPException(status_code=404, detail="Session not found")


@router.post("/sessions/{session_id}/send")
async def send_message(session_id: str, request: SendMessageRequest) -> dict[str, str]:
    """Send a message to a session (starts gateway SSE stream in background)."""
    session = chat_engine.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.is_active:
        raise HTTPException(status_code=409, detail="Session is inactive")

    message = request.content
    if request.lang and request.lang != "en":
        lang_names = {"zh": "Chinese", "ja": "Japanese", "ko": "Korean", "es": "Spanish", "fr": "French", "de": "German"}
        lang_name = lang_names.get(request.lang, request.lang)
        message = f"[Respond in {lang_name}] {message}"

    # Send message - this creates the streamer
    try:
        chat_engine.send_message(session_id, message)
        return {"status": "accepted", "session_id": session_id}
    except ChatNotAvailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}/stream")
async def stream_response(session_id: str) -> StreamingResponse:
    """Stream chat response via SSE (reads from ChatStreamer queue)."""
    session = chat_engine.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.is_active:
        raise HTTPException(status_code=409, detail="Session is inactive")

    streamer = chat_engine._streamers.get(session_id)

    if not streamer:
        raise HTTPException(
            status_code=400, detail="No active message stream. Send message first."
        )

    def event_generator():
        for event in streamer.iter_events():
            yield streamer.to_sse(event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/sessions/{session_id}/cancel")
async def cancel_stream(session_id: str) -> dict[str, str]:
    """Cancel an active streaming response."""
    session = chat_engine.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    chat_engine.cancel_stream(session_id)
    return {"status": "cancelled", "session_id": session_id}


@router.get("/sessions/{session_id}/history")
async def get_history(session_id: str, limit: int = 50) -> list[dict[str, Any]]:
    """Get message history for a session (from in-memory conversation history)."""
    history = chat_engine._conversation_history.get(session_id, [])
    return [
        {"role": msg.get("role"), "content": msg.get("content")}
        for msg in history[-limit:]
    ]


@router.get("/sessions/{session_id}/composer", response_model=ComposerStateResponse)
async def get_composer_state(session_id: str) -> ComposerStateResponse:
    """Get composer state for UI footer."""
    try:
        state = chat_engine.get_composer_state(session_id)
        return ComposerStateResponse(
            model=state.model,
            is_streaming=state.is_streaming,
            context_tokens=state.context_tokens,
        )
    except Exception:
        return ComposerStateResponse(
            model="unknown",
            is_streaming=False,
            context_tokens=0,
        )


@router.get("/available")
async def check_availability() -> dict[str, Any]:
    """Check if chat functionality is available (gateway API server)."""
    gateway_available = chat_engine.is_available()
    return {
        "available": gateway_available,
        "gateway_available": gateway_available,
        "gateway_url": chat_engine._gateway_url,
        "active_instance": chat_engine.active_instance,
    }


@router.get("/gateways")
async def list_gateways() -> dict[str, Any]:
    """List all gateway instances with their availability status."""
    return {
        "gateways": chat_engine.get_gateway_info(),
        "active": chat_engine.active_instance,
    }


class SwitchGatewayRequest(BaseModel):
    instance: str


@router.post("/gateways/switch")
async def switch_gateway(request: SwitchGatewayRequest) -> dict[str, Any]:
    """Switch active gateway instance."""
    if chat_engine.switch_instance(request.instance):
        return {
            "status": "switched",
            "active_instance": chat_engine.active_instance,
            "gateway_url": chat_engine._gateway_url,
            "available": chat_engine.is_available(),
        }
    raise HTTPException(
        status_code=400,
        detail=f"Unknown instance: {request.instance}. Available: {list(chat_engine.get_gateway_info().keys())}",
    )


# ── Direct Gateway Proxy ──────────────────────────────────────────────────

import json
import httpx


class CompletionsRequest(BaseModel):
    """OpenAI-compatible chat completion request proxied to gateway."""
    session_id: str | None = None
    messages: list[dict[str, Any]] | None = None
    model: str | None = None
    stream: bool = True


@router.post("/completions")
async def completions(request: CompletionsRequest) -> StreamingResponse:
    """Proxy chat completions directly to the active gateway, streaming SSE back."""
    gateway_url = chat_engine._gateway_url
    if not gateway_url:
        raise HTTPException(status_code=503, detail="No active gateway")

    # Build payload for gateway
    payload: dict[str, Any] = {
        "model": request.model or "hermes-agent",
        "messages": request.messages or [],
        "stream": True,
    }

    # NOTE: We do NOT send X-Hermes-Session-Id.  Session resumption requires
    # API_SERVER_KEY which may not be configured.  Instead, the frontend sends
    # the full conversation history so the gateway's _derive_chat_session_id()
    # (hash of system_prompt + first user message) produces a stable session ID.
    headers: dict[str, str] = {"Content-Type": "application/json"}

    def event_generator():
        try:
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
                    yield f"data: {json.dumps({'error': {'message': f'Gateway {resp.status_code}: {body[:300]}'}})}\n\n"
                    return

                for line in resp.iter_lines():
                    if not line:
                        yield "\n"
                        continue
                    yield f"{line}\n"

        except httpx.ConnectError:
            yield f"data: {json.dumps({'error': {'message': 'Cannot connect to gateway'}})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': {'message': str(e)}})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
