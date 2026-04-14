"""Parse Hermes config.yaml — full section parsing for settings UI."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

from .models import ConfigState
from .utils import default_hermes_dir

try:
    import yaml
except ImportError:
    yaml = None


def _parse_yaml_simple(text: str) -> dict:
    """Minimal YAML parser for flat/simple structures when PyYAML isn't available."""
    result: dict[str, Any] = {}
    current_section: Optional[str] = None
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" in stripped:
            key, _, val = stripped.partition(":")
            key = key.strip()
            val = val.strip()
            if val:
                result[key] = val
    return result


def _load_config_raw(hermes_dir: str | None = None) -> dict:
    """Load raw config.yaml dict."""
    hermes_dir = hermes_dir or default_hermes_dir()
    config_path = Path(hermes_dir) / "config.yaml"
    if not config_path.exists():
        return {}
    content = config_path.read_text(encoding="utf-8")
    if yaml:
        try:
            data = yaml.safe_load(content)
        except Exception:
            data = _parse_yaml_simple(content)
    else:
        data = _parse_yaml_simple(content)
    return data if isinstance(data, dict) else {}


def collect_config(hermes_dir: str | None = None) -> ConfigState:
    """Collect configuration state (backward-compatible, used by Dashboard etc.)."""
    data = _load_config_raw(hermes_dir)

    model_section = data.get("model", {})
    agent_section = data.get("agent", {})
    terminal_section = data.get("terminal", {})
    compression_section = data.get("compression", {})
    checkpoints_section = data.get("checkpoints", {})
    memory_section = data.get("memory", {})

    return ConfigState(
        model=model_section.get("default", "") if isinstance(model_section, dict) else str(model_section),
        provider=model_section.get("provider", "") if isinstance(model_section, dict) else "",
        toolsets=data.get("toolsets", []),
        backend=terminal_section.get("backend", "") if isinstance(terminal_section, dict) else "",
        max_turns=agent_section.get("max_turns", 0) if isinstance(agent_section, dict) else 0,
        compression_enabled=compression_section.get("enabled", False) if isinstance(compression_section, dict) else False,
        checkpoints_enabled=checkpoints_section.get("enabled", False) if isinstance(checkpoints_section, dict) else False,
        memory_char_limit=memory_section.get("memory_char_limit", 2200) if isinstance(memory_section, dict) else 2200,
        user_char_limit=memory_section.get("user_char_limit", 1375) if isinstance(memory_section, dict) else 1375,
    )


def collect_full_config(hermes_dir: str | None = None) -> dict[str, Any]:
    """Return full parsed config.yaml as nested dict (for Settings UI)."""
    return _load_config_raw(hermes_dir)
