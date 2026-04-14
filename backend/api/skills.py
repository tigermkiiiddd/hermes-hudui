"""Skills endpoints."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.collectors.skills import (
    collect_skills,
    _load_disabled_skills,
    _save_disabled_skills,
)
from backend.cache import clear_cache
from backend.collectors.utils import default_hermes_dir
from .serialize import to_dict

router = APIRouter()


@router.get("/skills")
async def get_skills():
    state = collect_skills()
    result = to_dict(state)
    # These are methods, not properties, so they're not auto-serialized
    result["by_category"] = to_dict(state.by_category())
    result["category_counts"] = to_dict(state.category_counts())
    result["recently_modified"] = to_dict(state.recently_modified(10))
    return result


class SkillToggle(BaseModel):
    enabled: bool


@router.patch("/skills/{skill_name}")
async def toggle_skill(skill_name: str, body: SkillToggle):
    """Enable or disable a skill by name."""
    hermes_dir = Path(default_hermes_dir())

    # Verify skill exists
    state = collect_skills()
    found = any(s.name == skill_name for s in state.skills)
    if not found:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")

    # Update disabled list
    disabled = _load_disabled_skills(hermes_dir)
    if body.enabled:
        disabled.discard(skill_name)
    else:
        disabled.add(skill_name)
    _save_disabled_skills(hermes_dir, disabled)

    # Invalidate cache so next GET reflects the change
    clear_cache()

    return {"ok": True, "skill": skill_name, "enabled": body.enabled}
