"""Cron jobs endpoints — full CRUD via direct jobs.json access."""

from __future__ import annotations

import fcntl
import json
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.collectors.cron import collect_cron
from backend.cache import clear_cache
from .serialize import to_dict

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hermes_dir() -> Path:
    from backend.collectors.utils import default_hermes_dir
    return Path(default_hermes_dir())


def _jobs_file() -> Path:
    return _hermes_dir() / "cron" / "jobs.json"


def _load_jobs_raw() -> List[Dict[str, Any]]:
    p = _jobs_file()
    if not p.exists():
        return []
    return json.loads(p.read_text(encoding="utf-8")).get("jobs", [])


def _save_jobs_raw(jobs: List[Dict[str, Any]]) -> None:
    p = _jobs_file()
    p.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "jobs": jobs,
        "updated_at": datetime.now().isoformat(),
    }
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(p)


def _find_job(jobs: List[Dict], job_id: str) -> Optional[Dict]:
    for j in jobs:
        if j.get("id") == job_id:
            return j
    return None


def _parse_schedule(schedule: str) -> Dict[str, Any]:
    """Parse schedule string. Supports: '30m', 'every 2h', '0 9 * * *', ISO timestamp."""
    import re
    schedule = schedule.strip()
    original = schedule
    schedule_lower = schedule.lower()

    def _parse_duration(s: str) -> int:
        s = s.strip().lower()
        m = re.match(r'^(\d+(?:\.\d+)?)\s*(m|min|minutes?|h|hr|hours?|d|days?)$', s)
        if not m:
            raise ValueError(f"Invalid duration: {s}")
        val = float(m.group(1))
        unit = m.group(2)
        if unit.startswith("m"):
            return int(val)
        if unit.startswith("h"):
            return int(val * 60)
        if unit.startswith("d"):
            return int(val * 1440)
        raise ValueError(f"Unknown unit: {unit}")

    # "every X" → recurring interval
    if schedule_lower.startswith("every "):
        minutes = _parse_duration(schedule[6:])
        return {"kind": "interval", "minutes": minutes, "display": f"every {minutes}m"}

    # Cron expression (5+ fields with digits/*/-,/)
    parts = schedule.split()
    if len(parts) >= 5 and all(re.match(r'^[\d\*\-,/]+$', p) for p in parts[:5]):
        try:
            from croniter import croniter
            croniter(schedule)
        except ImportError:
            pass  # trust the user
        except Exception as e:
            raise ValueError(f"Invalid cron: {e}")
        return {"kind": "cron", "expr": schedule, "display": schedule}

    # ISO timestamp
    if 'T' in schedule or re.match(r'^\d{4}-\d{2}-\d{2}', schedule):
        try:
            dt = datetime.fromisoformat(schedule.replace('Z', '+00:00'))
            if dt.tzinfo is None:
                dt = dt.astimezone()
            return {"kind": "once", "run_at": dt.isoformat(), "display": f"once at {dt.strftime('%Y-%m-%d %H:%M')}"}
        except ValueError as e:
            raise ValueError(f"Invalid timestamp: {e}")

    # Duration → one-shot
    try:
        minutes = _parse_duration(schedule)
        run_at = datetime.now().astimezone() + timedelta(minutes=minutes)
        return {"kind": "once", "run_at": run_at.isoformat(), "display": f"once in {original}"}
    except ValueError:
        pass

    raise ValueError(
        f"Invalid schedule '{original}'. Use: '30m', 'every 2h', '0 9 * * *', or '2026-02-03T14:00'"
    )


def _compute_next_run(schedule: Dict[str, Any]) -> Optional[str]:
    """Compute next run time from parsed schedule."""
    kind = schedule.get("kind", "")
    try:
        if kind == "once":
            return schedule.get("run_at")
        if kind == "interval":
            minutes = schedule.get("minutes", 60)
            return (datetime.now().astimezone() + timedelta(minutes=minutes)).isoformat()
        if kind == "cron":
            from croniter import croniter
            expr = schedule.get("expr", "")
            base = datetime.now()
            cron = croniter(expr, base)
            return cron.get_next(datetime).isoformat()
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateJobRequest(BaseModel):
    name: Optional[str] = None
    prompt: str = Field(..., min_length=1)
    schedule: str = Field(..., min_length=1)
    repeat: Optional[int] = None
    deliver: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    model: Optional[str] = None
    provider: Optional[str] = None
    script: Optional[str] = None


class UpdateJobRequest(BaseModel):
    name: Optional[str] = None
    prompt: Optional[str] = None
    schedule: Optional[str] = None
    repeat: Optional[int] = None
    deliver: Optional[str] = None
    skills: Optional[List[str]] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    script: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/cron")
async def get_cron():
    return to_dict(collect_cron())


@router.post("/cron")
def create_job(req: CreateJobRequest):
    """Create a new cron job."""
    try:
        parsed = _parse_schedule(req.schedule)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    repeat = req.repeat
    if repeat is not None and repeat <= 0:
        repeat = None
    if parsed.get("kind") == "once" and repeat is None:
        repeat = 1

    job_id = uuid.uuid4().hex[:12]
    now = datetime.now().astimezone().isoformat()

    label_source = req.prompt[:50].strip() or "cron job"
    jobs = _load_jobs_raw()
    job: Dict[str, Any] = {
        "id": job_id,
        "name": req.name or label_source,
        "prompt": req.prompt,
        "skills": req.skills,
        "skill": req.skills[0] if req.skills else None,
        "model": req.model or None,
        "provider": req.provider or None,
        "base_url": None,
        "script": req.script or None,
        "schedule": parsed,
        "schedule_display": parsed.get("display", req.schedule),
        "repeat": {"times": repeat, "completed": 0},
        "enabled": True,
        "state": "scheduled",
        "paused_at": None,
        "paused_reason": None,
        "created_at": now,
        "next_run_at": _compute_next_run(parsed),
        "last_run_at": None,
        "last_status": None,
        "last_error": None,
        "last_delivery_error": None,
        "deliver": req.deliver or "local",
        "origin": None,
    }
    jobs.append(job)
    _save_jobs_raw(jobs)
    clear_cache()
    return job


@router.patch("/cron/{job_id}")
def update_job(job_id: str, req: UpdateJobRequest):
    """Update an existing cron job."""
    jobs = _load_jobs_raw()
    job = _find_job(jobs, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    updates = req.model_dump(exclude_unset=True)

    # Handle schedule change
    if "schedule" in updates:
        try:
            parsed = _parse_schedule(updates["schedule"])
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        updates["schedule"] = parsed
        updates["schedule_display"] = parsed.get("display", updates["schedule"])
        if job.get("state") != "paused":
            updates["next_run_at"] = _compute_next_run(parsed)

    # Handle skills
    if "skills" in updates:
        updates["skill"] = updates["skills"][0] if updates["skills"] else None

    # Handle repeat
    if "repeat" in updates:
        r = updates.pop("repeat")
        job_repeat = job.get("repeat", {})
        updates["repeat"] = {"times": r if r and r > 0 else None, "completed": job_repeat.get("completed", 0)}

    # Handle None string fields
    for key in ("model", "provider", "script"):
        if key in updates and updates[key] is not None:
            updates[key] = updates[key].strip() or None

    job.update(updates)
    _save_jobs_raw(jobs)
    clear_cache()
    return job


@router.post("/cron/{job_id}/pause")
def pause_job(job_id: str):
    jobs = _load_jobs_raw()
    job = _find_job(jobs, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.update({
        "enabled": False,
        "state": "paused",
        "paused_at": datetime.now().astimezone().isoformat(),
        "paused_reason": "Paused via HUD",
    })
    _save_jobs_raw(jobs)
    clear_cache()
    return {"status": "ok"}


@router.post("/cron/{job_id}/resume")
def resume_job(job_id: str):
    jobs = _load_jobs_raw()
    job = _find_job(jobs, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    next_run = _compute_next_run(job.get("schedule", {}))
    job.update({
        "enabled": True,
        "state": "scheduled",
        "paused_at": None,
        "paused_reason": None,
        "next_run_at": next_run,
    })
    _save_jobs_raw(jobs)
    clear_cache()
    return {"status": "ok"}


@router.post("/cron/{job_id}/run")
def trigger_job(job_id: str):
    jobs = _load_jobs_raw()
    job = _find_job(jobs, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.update({
        "enabled": True,
        "state": "scheduled",
        "paused_at": None,
        "paused_reason": None,
        "next_run_at": datetime.now().astimezone().isoformat(),
    })
    _save_jobs_raw(jobs)
    clear_cache()
    return {"status": "ok"}


@router.delete("/cron/{job_id}")
def delete_job(job_id: str):
    jobs = _load_jobs_raw()
    original = len(jobs)
    jobs = [j for j in jobs if j.get("id") != job_id]
    if len(jobs) == original:
        raise HTTPException(status_code=404, detail="Job not found")
    _save_jobs_raw(jobs)
    clear_cache()
    return {"status": "ok"}
