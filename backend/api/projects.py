"""Projects endpoint — CRUD backed by state.db projects table."""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.collectors.projects import collect_projects
from .serialize import to_dict

router = APIRouter()


def _db_path() -> Path:
    hermes_dir = os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes"))
    return Path(hermes_dir) / "state.db"


def _connect():
    p = _db_path()
    if not p.exists():
        raise HTTPException(500, "state.db not found")
    conn = sqlite3.connect(str(p))
    conn.row_factory = sqlite3.Row
    return conn


# ── Read ────────────────────────────────────────────────────────────────────

@router.get("/projects")
async def get_projects():
    """List all projects with git enrichment."""
    return to_dict(collect_projects())


# ── Create ──────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    path: Optional[str] = None
    description: Optional[str] = None


@router.post("/projects")
async def create_project(body: ProjectCreate):
    conn = _connect()
    try:
        # Check exists
        row = conn.execute("SELECT name FROM projects WHERE name = ?", (body.name,)).fetchone()
        if row:
            raise HTTPException(409, f"Project '{body.name}' already exists")
        resolved = str(Path(body.path).expanduser().resolve()) if body.path else None
        now = datetime.now().timestamp()
        conn.execute(
            "INSERT INTO projects (name, path, description, config, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)",
            (body.name, resolved, body.description, now, now),
        )
        conn.commit()
        proj = dict(conn.execute("SELECT * FROM projects WHERE name = ?", (body.name,)).fetchone())
        return {"ok": True, "project": proj}
    finally:
        conn.close()


# ── Update ──────────────────────────────────────────────────────────────────

class ProjectUpdate(BaseModel):
    path: Optional[str] = None
    description: Optional[str] = None


@router.patch("/projects/{name}")
async def update_project(name: str, body: ProjectUpdate):
    conn = _connect()
    try:
        row = conn.execute("SELECT name FROM projects WHERE name = ?", (name,)).fetchone()
        if not row:
            raise HTTPException(404, f"Project '{name}' not found")
        sets, params = [], []
        if body.path is not None:
            sets.append("path = ?")
            params.append(str(Path(body.path).expanduser().resolve()))
        if body.description is not None:
            sets.append("description = ?")
            params.append(body.description)
        if sets:
            sets.append("updated_at = ?")
            params.append(datetime.now().timestamp())
            params.append(name)
            conn.execute(f"UPDATE projects SET {', '.join(sets)} WHERE name = ?", params)
            conn.commit()
        proj = dict(conn.execute("SELECT * FROM projects WHERE name = ?", (name,)).fetchone())
        return {"ok": True, "project": proj}
    finally:
        conn.close()


# ── Delete ──────────────────────────────────────────────────────────────────

@router.delete("/projects/{name}")
async def delete_project(name: str):
    conn = _connect()
    try:
        row = conn.execute("SELECT name FROM projects WHERE name = ?", (name,)).fetchone()
        if not row:
            raise HTTPException(404, f"Project '{name}' not found")
        # Unlink sessions first
        conn.execute("UPDATE sessions SET project_id = NULL WHERE project_id = ?", (name,))
        conn.execute("DELETE FROM projects WHERE name = ?", (name,))
        conn.commit()
        return {"ok": True, "deleted": name}
    finally:
        conn.close()


# ── Set/Unset session project ───────────────────────────────────────────────

class SessionProject(BaseModel):
    session_id: str
    project_name: Optional[str] = None


@router.post("/projects/set-session")
async def set_session_project(body: SessionProject):
    conn = _connect()
    try:
        if body.project_name:
            row = conn.execute("SELECT name FROM projects WHERE name = ?", (body.project_name,)).fetchone()
            if not row:
                raise HTTPException(404, f"Project '{body.project_name}' not found")
        conn.execute(
            "UPDATE sessions SET project_id = ? WHERE id = ?",
            (body.project_name, body.session_id),
        )
        conn.commit()
        return {"ok": True, "session_id": body.session_id, "project": body.project_name}
    finally:
        conn.close()
