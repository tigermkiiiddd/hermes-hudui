"""Sessions endpoints."""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.collectors.utils import default_hermes_dir
from backend.collectors.sessions import collect_sessions
from backend.cache import clear_cache
from .serialize import to_dict

router = APIRouter()


def _db_path() -> Path:
    return Path(default_hermes_dir()) / "state.db"


@router.get("/sessions")
async def get_sessions():
    return to_dict(collect_sessions())


@router.get("/sessions/search")
async def search_sessions(q: str = Query(..., min_length=1)):
    """Search sessions by title or message content using FTS."""
    db = _db_path()
    if not db.exists():
        return []

    results: list[dict] = []
    try:
        conn = sqlite3.connect(str(db))
        conn.row_factory = sqlite3.Row

        # Search sessions table by title
        title_rows = conn.execute(
            """
            SELECT id, source, title, started_at, message_count, tool_call_count
            FROM sessions
            WHERE title LIKE ? AND source != 'tool'
              AND parent_session_id IS NULL
            ORDER BY started_at DESC
            LIMIT 20
            """,
            (f"%{q}%",),
        ).fetchall()

        seen_ids = set()
        for row in title_rows:
            seen_ids.add(row["id"])
            results.append({
                "session_id": row["id"],
                "source": row["source"],
                "title": row["title"] or row["id"][:8],
                "started_at": row["started_at"],
                "message_count": row["message_count"],
                "match_type": "title",
                "snippet": None,
            })

        # Search message content via FTS
        try:
            fts_rows = conn.execute(
                """
                SELECT m.session_id, m.content, m.timestamp,
                       s.title, s.source, s.started_at, s.message_count
                FROM messages_fts
                JOIN messages m ON messages_fts.rowid = m.rowid
                JOIN sessions s ON m.session_id = s.id
                WHERE messages_fts MATCH ? AND s.source != 'tool'
                  AND s.parent_session_id IS NULL
                ORDER BY m.timestamp DESC
                LIMIT 30
                """,
                (q,),
            ).fetchall()

            for row in fts_rows:
                sid = row["session_id"]
                if sid in seen_ids:
                    continue
                seen_ids.add(sid)
                # Build a short snippet around the match
                content = row["content"] or ""
                idx = content.lower().find(q.lower())
                if idx >= 0:
                    start = max(0, idx - 40)
                    end = min(len(content), idx + len(q) + 60)
                    snippet = ("…" if start > 0 else "") + content[start:end] + ("…" if end < len(content) else "")
                else:
                    snippet = content[:100]

                results.append({
                    "session_id": sid,
                    "source": row["source"],
                    "title": row["title"] or sid[:8],
                    "started_at": row["started_at"],
                    "message_count": row["message_count"],
                    "match_type": "content",
                    "snippet": snippet,
                })
        except Exception:
            pass  # FTS may not be available

        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return results[:25]


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: str, limit: int = 200):
    """Fetch full message transcript for a session."""
    db = _db_path()
    if not db.exists():
        raise HTTPException(status_code=404, detail="Database not found")

    conn = sqlite3.connect(str(db))
    conn.row_factory = sqlite3.Row
    try:
        # Verify session exists
        session = conn.execute(
            "SELECT id, title, source, started_at FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        messages = conn.execute(
            """
            SELECT id, role, content, timestamp, tool_calls, reasoning, token_count
            FROM messages
            WHERE session_id = ?
            ORDER BY timestamp ASC
            LIMIT ?
            """,
            (session_id, limit),
        ).fetchall()

        return {
            "session_id": session_id,
            "title": session["title"] or session_id[:8],
            "source": session["source"],
            "started_at": session["started_at"],
            "messages": [
                {
                    "id": row["id"],
                    "role": row["role"],
                    "content": row["content"] or "",
                    "timestamp": row["timestamp"],
                    "tool_calls": row["tool_calls"],
                    "reasoning": row["reasoning"],
                    "token_count": row["token_count"] or 0,
                }
                for row in messages
                if row["role"] in ("user", "assistant")  # skip system/tool noise
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ── Write operations ───────────────────────────────────────────────────────

@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session and its messages."""
    db = _db_path()
    if not db.exists():
        raise HTTPException(status_code=404, detail="Database not found")

    conn = sqlite3.connect(str(db))
    conn.row_factory = sqlite3.Row
    try:
        session = conn.execute("SELECT id FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        conn.commit()
        clear_cache()  # invalidate sessions list cache
        return {"ok": True, "deleted": session_id}
    finally:
        conn.close()


class SessionUpdate(BaseModel):
    title: Optional[str] = None


@router.patch("/sessions/{session_id}")
async def update_session(session_id: str, body: SessionUpdate):
    """Update session metadata (e.g. rename title)."""
    db = _db_path()
    if not db.exists():
        raise HTTPException(status_code=404, detail="Database not found")

    conn = sqlite3.connect(str(db))
    conn.row_factory = sqlite3.Row
    try:
        session = conn.execute("SELECT id FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if body.title is not None:
            conn.execute("UPDATE sessions SET title = ? WHERE id = ?", (body.title, session_id))
            conn.commit()
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        return {"ok": True, "session": dict(row)}
    finally:
        conn.close()


class CleanupRequest(BaseModel):
    older_than_days: Optional[int] = None  # delete sessions older than N days
    keep_last: Optional[int] = None        # keep last N sessions, delete rest
    source: Optional[str] = None           # filter by source (cli, telegram, tool)


@router.post("/sessions/cleanup")
async def cleanup_sessions(body: CleanupRequest):
    """Batch delete old sessions."""
    db = _db_path()
    if not db.exists():
        raise HTTPException(status_code=404, detail="Database not found")

    conn = sqlite3.connect(str(db))
    conn.row_factory = sqlite3.Row
    try:
        ids_to_delete: list[str] = []

        if body.older_than_days is not None:
            cutoff = datetime.now().timestamp() - (body.older_than_days * 86400)
            rows = conn.execute(
                "SELECT id FROM sessions WHERE started_at < ? AND parent_session_id IS NULL",
                (cutoff,),
            ).fetchall()
            ids_to_delete.extend(r["id"] for r in rows)

        elif body.keep_last is not None:
            rows = conn.execute(
                "SELECT id FROM sessions WHERE parent_session_id IS NULL ORDER BY started_at DESC"
            ).fetchall()
            ids_to_delete.extend(r["id"] for r in rows[body.keep_last:])

        # Filter by source if specified
        if body.source and ids_to_delete:
            rows = conn.execute(
                "SELECT id FROM sessions WHERE id IN ({}) AND source = ?".format(
                    ",".join("?" * len(ids_to_delete))
                ),
                (*ids_to_delete, body.source),
            ).fetchall()
            ids_to_delete = [r["id"] for r in rows]

        if ids_to_delete:
            placeholders = ",".join("?" * len(ids_to_delete))
            conn.execute(f"DELETE FROM messages WHERE session_id IN ({placeholders})", ids_to_delete)
            conn.execute(f"DELETE FROM sessions WHERE id IN ({placeholders})", ids_to_delete)
            conn.commit()
            clear_cache()  # invalidate sessions list cache

        return {"ok": True, "deleted_count": len(ids_to_delete)}
    finally:
        conn.close()
