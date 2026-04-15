"""Constraint Graph API — reads from skill-graph plugin's constraints.db"""

import sqlite3
from pathlib import Path
from fastapi import APIRouter

from backend.collectors.utils import default_hermes_dir

router = APIRouter(prefix="/api/constraints", tags=["constraints"])


def _db_path() -> Path:
    return Path(default_hermes_dir()) / "plugins" / "skill-graph" / "constraints.db"


def _conn():
    p = _db_path()
    if not p.exists():
        return None
    conn = sqlite3.connect(str(p), timeout=5)
    conn.row_factory = sqlite3.Row
    return conn


@router.get("/projects")
def list_projects():
    """List all projects that have constraints."""
    conn = _conn()
    if not conn:
        return {"projects": []}
    try:
        rows = conn.execute(
            "SELECT project_name, COUNT(*) as node_count FROM sg_nodes GROUP BY project_name"
        ).fetchall()
        return {"projects": [{"name": r["project_name"], "node_count": r["node_count"]} for r in rows]}
    finally:
        conn.close()


@router.get("/graph/{project}")
def get_graph(project: str):
    """Return nodes and edges for force-directed graph visualization."""
    conn = _conn()
    if not conn:
        return {"nodes": [], "edges": []}
    try:
        # Nodes
        node_rows = conn.execute(
            "SELECT id, parent_id, key, value, type, inference_hardness, "
            "source, confidence, challenge_count, overturned, created_at "
            "FROM sg_nodes WHERE project_name = ? ORDER BY id",
            (project,),
        ).fetchall()

        # Edges: relations table
        rel_rows = conn.execute(
            "SELECT id, from_node_id, to_node_id, relation_type, note, weight "
            "FROM sg_relations WHERE project_name = ?",
            (project,),
        ).fetchall()

        # Build vis-network format
        nodes = []
        for r in node_rows:
            overturned = bool(r["overturned"])
            challenge_count = r["challenge_count"] or 0

            # Color by type
            type_colors = {
                "fact": "#4ade80",        # green
                "preference": "#facc15",   # yellow
                "rule": "#60a5fa",         # blue
                "assumption": "#a78bfa",   # purple
            }
            color = type_colors.get(r["type"], "#9ca3af")
            if overturned:
                color = "#ef4444"  # red for overturned

            # Border by verification status
            border = "#555"
            if challenge_count >= 3 and not overturned:
                border = "#22c55e"  # verified = green border
            elif challenge_count > 0:
                border = "#f59e0b"  # challenged = amber border

            # Size by confidence
            size = 15 + (r["confidence"] or 0.5) * 20

            nodes.append({
                "id": r["id"],
                "label": r["key"],
                "title": f"{r['key']}: {r['value']}\n"
                         f"type={r['type']} hardness={r['inference_hardness']}\n"
                         f"confidence={r['confidence']} challenges={challenge_count}"
                         f"{' [OVERTURNED]' if overturned else ''}"
                         f"{' [VERIFIED]' if challenge_count >= 3 and not overturned else ''}",
                "color": {"background": color, "border": border},
                "size": size,
                "font": {"color": "#e5e7eb", "size": 12},
                # Metadata for frontend
                "metadata": {
                    "key": r["key"],
                    "value": r["value"],
                    "type": r["type"],
                    "inference_hardness": r["inference_hardness"],
                    "source": r["source"],
                    "confidence": r["confidence"],
                    "challenge_count": challenge_count,
                    "overturned": overturned,
                    "parent_id": r["parent_id"],
                },
            })

        # Edges: parent-child (hierarchy)
        edges = []
        for r in node_rows:
            if r["parent_id"]:
                edges.append({
                    "id": f"hierarchy-{r['id']}",
                    "from": r["parent_id"],
                    "to": r["id"],
                    "arrows": "to",
                    "color": {"color": "#555", "highlight": "#888"},
                    "width": 1,
                    "dashes": False,
                    "_type": "hierarchy",
                })

        # Edges: cross-node relations
        rel_colors = {
            "reference": "#3b82f6",
            "dependency": "#8b5cf6",
            "conflict": "#ef4444",
        }
        for r in rel_rows:
            edges.append({
                "id": f"relation-{r['id']}",
                "from": r["from_node_id"],
                "to": r["to_node_id"],
                "arrows": "to",
                "color": {"color": rel_colors.get(r["relation_type"], "#6b7280")},
                "width": r["weight"] or 1,
                "dashes": r["relation_type"] == "conflict",
                "label": r["relation_type"],
                "title": f"{r['relation_type']}: {r['note']}" if r["note"] else r["relation_type"],
                "_type": "relation",
            })

        return {"nodes": nodes, "edges": edges}

    finally:
        conn.close()


@router.get("/stats/{project}")
def get_stats(project: str):
    """Get constraint statistics for a project."""
    conn = _conn()
    if not conn:
        return {"total_nodes": 0, "total_relations": 0, "verified": 0, "overturned": 0, "unverified": 0}
    try:
        nc = conn.execute("SELECT COUNT(*) as c FROM sg_nodes WHERE project_name = ?", (project,)).fetchone()["c"]
        rc = conn.execute("SELECT COUNT(*) as c FROM sg_relations WHERE project_name = ?", (project,)).fetchone()["c"]
        verified = conn.execute(
            "SELECT COUNT(*) as c FROM sg_nodes WHERE project_name = ? AND challenge_count >= 3 AND overturned = 0",
            (project,),
        ).fetchone()["c"]
        overturned = conn.execute(
            "SELECT COUNT(*) as c FROM sg_nodes WHERE project_name = ? AND overturned = 1",
            (project,),
        ).fetchone()["c"]
        return {
            "total_nodes": nc,
            "total_relations": rc,
            "verified": verified,
            "overturned": overturned,
            "unverified": nc - verified - overturned,
        }
    finally:
        conn.close()
