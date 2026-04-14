"""Collect project data from state.db projects table."""

from __future__ import annotations

import logging
import os
import sqlite3
import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..cache import get_cached_or_compute
from .utils import default_hermes_dir

logger = logging.getLogger(__name__)


@dataclass
class ProjectInfo:
    name: str
    path: Optional[str] = None
    description: Optional[str] = None
    session_count: int = 0
    created_at: Optional[float] = None
    updated_at: Optional[float] = None
    # Git info (populated if path is set and is a git repo)
    is_git: bool = False
    branch: Optional[str] = None
    last_commit_msg: Optional[str] = None
    last_commit_ago: Optional[str] = None
    last_commit_ts: Optional[float] = None
    dirty_files: int = 0
    total_commits: int = 0
    last_modified: Optional[datetime] = None
    has_readme: bool = False
    has_package_json: bool = False
    has_requirements: bool = False
    has_pyproject: bool = False
    languages: list[str] = field(default_factory=list)

    @property
    def status_label(self) -> str:
        if not self.path:
            return "logical"
        if not self.is_git:
            return "no git"
        if self.dirty_files > 0:
            return f"{self.dirty_files} dirty"
        return "clean"

    @property
    def activity_level(self) -> str:
        """Rough activity bucket based on last commit time."""
        if not self.path:
            return "logical"
        if not self.last_commit_ago:
            return "unknown"
        ago = self.last_commit_ago.lower()
        if any(x in ago for x in ["minute", "hour", "second"]):
            return "active"
        if "day" in ago:
            try:
                days = int(ago.split()[0])
                if days <= 3:
                    return "active"
                elif days <= 14:
                    return "recent"
            except (ValueError, IndexError):
                pass
            return "recent"
        if "week" in ago:
            try:
                weeks = int(ago.split()[0])
                if weeks <= 2:
                    return "recent"
            except (ValueError, IndexError):
                pass
            return "stale"
        if any(x in ago for x in ["month", "year"]):
            return "stale"
        return "unknown"


@dataclass
class ProjectsState:
    projects: list[ProjectInfo] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.projects)

    @property
    def git_repos(self) -> int:
        return sum(1 for p in self.projects if p.is_git)

    @property
    def active_count(self) -> int:
        return sum(1 for p in self.projects if p.activity_level == "active")

    @property
    def dirty_count(self) -> int:
        return sum(1 for p in self.projects if p.dirty_files > 0)


# ── Git helpers ─────────────────────────────────────────────────────────────

def _run_git(repo_path: str, args: list[str]) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", repo_path] + args,
            capture_output=True, text=True, timeout=5,
        )
        return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return ""


def _detect_languages(path: Path) -> list[str]:
    langs = set()
    ext_map = {
        ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript",
        ".jsx": "React", ".tsx": "React/TS", ".rs": "Rust",
        ".go": "Go", ".java": "Java", ".cpp": "C++", ".c": "C",
        ".rb": "Ruby", ".sh": "Shell", ".html": "HTML", ".css": "CSS",
        ".vue": "Vue", ".svelte": "Svelte",
    }
    try:
        for item in path.iterdir():
            if item.is_file():
                ext = item.suffix.lower()
                if ext in ext_map:
                    langs.add(ext_map[ext])
            elif item.is_dir() and item.name == "src":
                for sub in item.iterdir():
                    if sub.is_file():
                        ext = sub.suffix.lower()
                        if ext in ext_map:
                            langs.add(ext_map[ext])
    except (PermissionError, OSError):
        pass
    return sorted(langs)[:5]


def _enrich_with_git(proj: ProjectInfo) -> None:
    """Populate git/file metadata on a ProjectInfo that has a path."""
    item = Path(proj.path)
    if not item.exists():
        return

    proj.is_git = (item / ".git").is_dir()
    proj.has_readme = (item / "README.md").exists() or (item / "readme.md").exists()
    proj.has_package_json = (item / "package.json").exists()
    proj.has_requirements = (item / "requirements.txt").exists()
    proj.has_pyproject = (item / "pyproject.toml").exists()
    proj.languages = _detect_languages(item)

    try:
        proj.last_modified = datetime.fromtimestamp(item.stat().st_mtime)
    except OSError:
        pass

    if proj.is_git:
        proj.branch = _run_git(str(item), ["branch", "--show-current"]) or "HEAD"

        log_output = _run_git(str(item), ["log", "-1", "--format=%ar|%s|%ct"])
        if log_output and "|" in log_output:
            parts = log_output.split("|", 2)
            proj.last_commit_ago = parts[0]
            proj.last_commit_msg = parts[1] if len(parts) > 1 else None
            try:
                proj.last_commit_ts = float(parts[2]) if len(parts) > 2 else None
            except ValueError:
                pass

        status = _run_git(str(item), ["status", "--porcelain"])
        proj.dirty_files = len([l for l in status.split("\n") if l.strip()]) if status else 0

        count = _run_git(str(item), ["rev-list", "--count", "HEAD"])
        try:
            proj.total_commits = int(count)
        except ValueError:
            pass


# ── DB read ─────────────────────────────────────────────────────────────────

def _read_projects_from_db(db_path: str) -> list[ProjectInfo]:
    """Read projects from state.db and enrich with git info."""
    projects: list[ProjectInfo] = []
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Check if projects table exists (schema v7+)
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
        )
        if not cursor.fetchone():
            conn.close()
            return projects

        cursor.execute("SELECT * FROM projects ORDER BY updated_at DESC")
        rows = cursor.fetchall()

        for row in rows:
            proj = ProjectInfo(
                name=row["name"],
                path=row["path"],
                description=row["description"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

            # Session count
            cursor.execute(
                "SELECT COUNT(*) FROM sessions WHERE project_id = ?",
                (proj.name,),
            )
            proj.session_count = cursor.fetchone()[0]

            # Enrich with git/file info if path exists
            if proj.path:
                _enrich_with_git(proj)

            projects.append(proj)

        conn.close()
    except Exception:
        logger.warning("Error reading projects from state.db", exc_info=True)

    return projects


def collect_projects() -> ProjectsState:
    """Collect project data from state.db (cached, invalidates on db change)."""
    hermes_dir = default_hermes_dir()
    db_path = Path(hermes_dir) / "state.db"
    if not db_path.exists():
        return ProjectsState()

    def _compute():
        return ProjectsState(projects=_read_projects_from_db(str(db_path)))

    return get_cached_or_compute("projects", _compute, str(db_path))
