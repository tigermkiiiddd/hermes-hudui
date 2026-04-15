"""Settings endpoint — full GUI settings for Hermes Agent."""

from __future__ import annotations

import json
import os
import fcntl
import tempfile
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# ── Paths ──────────────────────────────────────────────────────────────────

def _hermes_dir() -> str:
    return os.environ.get("HERMES_HOME") or os.path.expanduser("~/.hermes")

def _config_path() -> Path:
    return Path(_hermes_dir()) / "config.yaml"

def _env_path() -> Path:
    return Path(_hermes_dir()) / ".env"

def _auth_path() -> Path:
    return Path(_hermes_dir()) / "auth.json"

# ── Config YAML ────────────────────────────────────────────────────────────

def _load_yaml() -> dict:
    import yaml
    p = _config_path()
    if not p.exists():
        return {}
    with open(p, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data if isinstance(data, dict) else {}

def _atomic_write_yaml(data: dict):
    import yaml
    p = _config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(p.parent), suffix=".yaml")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
            os.replace(tmp, str(p))
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise

# ── .env ───────────────────────────────────────────────────────────────────

def _load_env() -> dict[str, str]:
    p = _env_path()
    result = {}
    if not p.exists():
        return result
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            result[k.strip()] = v.strip()
    return result

def _save_env_value(key: str, value: str):
    p = _env_path()
    lines = []
    if p.exists():
        lines = p.read_text(encoding="utf-8").splitlines()
    upper = key.upper()
    found = False
    for i, line in enumerate(lines):
        if line.strip().startswith(f"{upper}="):
            lines[i] = f"{upper}={value}"
            found = True
            break
    if not found:
        lines.append(f"{upper}={value}")
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")

def _delete_env_value(key: str):
    p = _env_path()
    if not p.exists():
        return
    upper = key.upper()
    lines = p.read_text(encoding="utf-8").splitlines()
    lines = [l for l in lines if not l.strip().startswith(f"{upper}=")]
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")

# ── Auth / Credential Pool ────────────────────────────────────────────────

def _load_auth() -> dict:
    p = _auth_path()
    if not p.exists():
        return {"version": 1, "providers": {}, "credential_pool": {}}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {"version": 1, "providers": {}, "credential_pool": {}}
    except Exception:
        return {"version": 1, "providers": {}, "credential_pool": {}}

def _atomic_write_auth(data: dict):
    p = _auth_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(p.parent), suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            json.dump(data, f, indent=2, ensure_ascii=False)
            os.replace(tmp, str(p))
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise

# ── Provider Registry (mirrors hermes_cli/auth.py PROVIDER_REGISTRY) ─────

PROVIDER_REGISTRY = {
    "nous": {"name": "Nous Portal", "auth_type": "oauth_device_code", "base_url": "https://inference-api.nousresearch.com/v1"},
    "openai-codex": {"name": "OpenAI Codex", "auth_type": "oauth_external", "base_url": "https://chatgpt.com/backend-api/codex"},
    "qwen-oauth": {"name": "Qwen OAuth", "auth_type": "oauth_external", "base_url": "https://portal.qwen.ai/v1"},
    "copilot": {"name": "GitHub Copilot", "auth_type": "api_key", "base_url": "https://api.githubcopilot.com", "env_vars": ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"]},
    "gemini": {"name": "Google AI Studio", "auth_type": "api_key", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "env_vars": ["GOOGLE_API_KEY", "GEMINI_API_KEY"], "base_url_env": "GEMINI_BASE_URL"},
    "zai": {"name": "Z.AI / GLM", "auth_type": "api_key", "base_url": "https://api.z.ai/api/paas/v4", "env_vars": ["GLM_API_KEY", "ZAI_API_KEY"], "base_url_env": "GLM_BASE_URL"},
    "kimi-coding": {"name": "Kimi / Moonshot", "auth_type": "api_key", "base_url": "https://api.moonshot.ai/v1", "env_vars": ["KIMI_API_KEY"], "base_url_env": "KIMI_BASE_URL"},
    "minimax": {"name": "MiniMax", "auth_type": "api_key", "base_url": "https://api.minimax.io/anthropic", "env_vars": ["MINIMAX_API_KEY"], "base_url_env": "MINIMAX_BASE_URL"},
    "minimax-cn": {"name": "MiniMax (China)", "auth_type": "api_key", "base_url": "https://api.minimaxi.com/anthropic", "env_vars": ["MINIMAX_CN_API_KEY"], "base_url_env": "MINIMAX_CN_BASE_URL"},
    "anthropic": {"name": "Anthropic", "auth_type": "api_key", "base_url": "https://api.anthropic.com", "env_vars": ["ANTHROPIC_API_KEY", "ANTHROPIC_TOKEN"]},
    "alibaba": {"name": "Alibaba Cloud (DashScope)", "auth_type": "api_key", "base_url": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", "env_vars": ["DASHSCOPE_API_KEY"], "base_url_env": "DASHSCOPE_BASE_URL"},
    "deepseek": {"name": "DeepSeek", "auth_type": "api_key", "base_url": "https://api.deepseek.com/v1", "env_vars": ["DEEPSEEK_API_KEY"], "base_url_env": "DEEPSEEK_BASE_URL"},
    "xai": {"name": "xAI", "auth_type": "api_key", "base_url": "https://api.x.ai/v1", "env_vars": ["XAI_API_KEY"]},
    "ai-gateway": {"name": "AI Gateway", "auth_type": "api_key", "base_url": "https://ai-gateway.vercel.sh/v1", "env_vars": ["AI_GATEWAY_API_KEY"]},
    "opencode-zen": {"name": "OpenCode Zen", "auth_type": "api_key", "base_url": "https://opencode.ai/zen/v1", "env_vars": ["OPENCODE_ZEN_API_KEY"], "base_url_env": "OPENCODE_ZEN_BASE_URL"},
    "opencode-go": {"name": "OpenCode Go", "auth_type": "api_key", "base_url": "https://opencode.ai/zen/go/v1", "env_vars": ["OPENCODE_GO_API_KEY"], "base_url_env": "OPENCODE_GO_BASE_URL"},
    "kilocode": {"name": "Kilo Code", "auth_type": "api_key", "base_url": "https://api.kilo.ai/api/gateway", "env_vars": ["KILOCODE_API_KEY"]},
    "huggingface": {"name": "Hugging Face", "auth_type": "api_key", "base_url": "https://router.huggingface.co/v1", "env_vars": ["HF_TOKEN"], "base_url_env": "HF_BASE_URL"},
    "xiaomi": {"name": "Xiaomi MiMo", "auth_type": "api_key", "base_url": "https://api.xiaomimimo.com/v1", "env_vars": ["XIAOMI_API_KEY"], "base_url_env": "XIAOMI_BASE_URL"},
    "openrouter": {"name": "OpenRouter", "auth_type": "api_key", "base_url": "https://openrouter.ai/api/v1", "env_vars": ["OPENROUTER_API_KEY"]},
    "custom": {"name": "Custom Endpoint", "auth_type": "api_key", "base_url": "", "env_vars": ["OPENAI_API_KEY"]},
}

# ── Env var metadata (from hermes_cli/config.py OPTIONAL_ENV_VARS) ────────

ENV_VAR_GROUPS = {
    "provider": {
        "label": "Provider Keys",
        "icon": "🔑",
        "vars": [
            {"key": "OPENROUTER_API_KEY", "label": "OpenRouter", "password": True, "url": "https://openrouter.ai/keys"},
            {"key": "GOOGLE_API_KEY", "label": "Google AI Studio", "password": True, "url": "https://aistudio.google.com/app/apikey"},
            {"key": "GEMINI_API_KEY", "label": "Gemini (alias)", "password": True, "url": "https://aistudio.google.com/app/apikey"},
            {"key": "GLM_API_KEY", "label": "Z.AI / GLM", "password": True, "url": "https://z.ai/"},
            {"key": "KIMI_API_KEY", "label": "Kimi / Moonshot", "password": True, "url": "https://platform.moonshot.cn/"},
            {"key": "MINIMAX_API_KEY", "label": "MiniMax", "password": True, "url": "https://www.minimax.io/"},
            {"key": "MINIMAX_CN_API_KEY", "label": "MiniMax (China)", "password": True, "url": "https://www.minimaxi.com/"},
            {"key": "ANTHROPIC_API_KEY", "label": "Anthropic", "password": True, "url": "https://console.anthropic.com/"},
            {"key": "DASHSCOPE_API_KEY", "label": "DashScope (Qwen)", "password": True, "url": "https://modelstudio.console.alibabacloud.com/"},
            {"key": "DEEPSEEK_API_KEY", "label": "DeepSeek", "password": True, "url": "https://platform.deepseek.com/api_keys"},
            {"key": "XAI_API_KEY", "label": "xAI", "password": True, "url": "https://console.x.ai/"},
            {"key": "HF_TOKEN", "label": "Hugging Face", "password": True, "url": "https://huggingface.co/settings/tokens"},
            {"key": "XIAOMI_API_KEY", "label": "Xiaomi MiMo", "password": True, "url": "https://platform.xiaomimimo.com"},
            {"key": "OPENCODE_ZEN_API_KEY", "label": "OpenCode Zen", "password": True, "url": "https://opencode.ai/auth"},
            {"key": "OPENCODE_GO_API_KEY", "label": "OpenCode Go", "password": True, "url": "https://opencode.ai/auth"},
            {"key": "KILOCODE_API_KEY", "label": "Kilo Code", "password": True, "url": "https://kilo.ai/"},
            {"key": "AI_GATEWAY_API_KEY", "label": "AI Gateway", "password": True, "url": "https://ai-gateway.vercel.sh/"},
            {"key": "COPILOT_GITHUB_TOKEN", "label": "GitHub Copilot", "password": True, "url": "https://github.com/settings/tokens"},
        ],
    },
    "tool": {
        "label": "Tool Keys",
        "icon": "🔧",
        "vars": [
            {"key": "EXA_API_KEY", "label": "Exa Search", "password": True, "url": "https://exa.ai/"},
            {"key": "PARALLEL_API_KEY", "label": "Parallel", "password": True, "url": "https://parallel.ai/"},
            {"key": "FIRECRAWL_API_KEY", "label": "Firecrawl", "password": True, "url": "https://firecrawl.dev/"},
            {"key": "TAVILY_API_KEY", "label": "Tavily", "password": True, "url": "https://app.tavily.com/home"},
            {"key": "BROWSERBASE_API_KEY", "label": "Browserbase", "password": True, "url": "https://browserbase.com/"},
            {"key": "BROWSER_USE_API_KEY", "label": "Browser Use", "password": True, "url": "https://browser-use.com/"},
            {"key": "FAL_KEY", "label": "FAL (Image Gen)", "password": True, "url": "https://fal.ai/"},
            {"key": "VOICE_TOOLS_OPENAI_KEY", "label": "OpenAI (Voice/TTS)", "password": True, "url": "https://platform.openai.com/api-keys"},
            {"key": "ELEVENLABS_API_KEY", "label": "ElevenLabs", "password": True, "url": "https://elevenlabs.io/"},
            {"key": "MISTRAL_API_KEY", "label": "Mistral", "password": True, "url": "https://console.mistral.ai/"},
            {"key": "GITHUB_TOKEN", "label": "GitHub (Skills Hub)", "password": True, "url": "https://github.com/settings/tokens"},
            {"key": "WANDB_API_KEY", "label": "Weights & Biases", "password": True, "url": "https://wandb.ai/authorize"},
            {"key": "TINKER_API_KEY", "label": "Tinker (RL)", "password": True, "url": "https://tinker-console.thinkingmachines.ai/keys"},
            {"key": "HONCHO_API_KEY", "label": "Honcho (Memory)", "password": True, "url": "https://app.honcho.dev"},
        ],
    },
    "messaging": {
        "label": "Messaging Platforms",
        "icon": "💬",
        "vars": [
            {"key": "TELEGRAM_BOT_TOKEN", "label": "Telegram Bot Token", "password": True, "url": "https://t.me/BotFather"},
            {"key": "TELEGRAM_ALLOWED_USERS", "label": "Telegram Allowed Users", "password": False},
            {"key": "DISCORD_BOT_TOKEN", "label": "Discord Bot Token", "password": True, "url": "https://discord.com/developers/applications"},
            {"key": "DISCORD_ALLOWED_USERS", "label": "Discord Allowed Users", "password": False},
            {"key": "SLACK_BOT_TOKEN", "label": "Slack Bot Token", "password": True, "url": "https://api.slack.com/apps"},
            {"key": "SLACK_APP_TOKEN", "label": "Slack App Token", "password": True},
            {"key": "MATTERMOST_URL", "label": "Mattermost URL", "password": False},
            {"key": "MATTERMOST_TOKEN", "label": "Mattermost Token", "password": True},
            {"key": "MATRIX_HOMESERVER", "label": "Matrix Homeserver", "password": False},
            {"key": "MATRIX_ACCESS_TOKEN", "label": "Matrix Access Token", "password": True},
            {"key": "MATRIX_USER_ID", "label": "Matrix User ID", "password": False},
            {"key": "BLUEBUBBLES_SERVER_URL", "label": "BlueBubbles URL (iMessage)", "password": False},
            {"key": "BLUEBUBBLES_PASSWORD", "label": "BlueBubbles Password", "password": True},
            {"key": "FEISHU_APP_ID", "label": "Feishu/Lark App ID", "password": False},
            {"key": "FEISHU_APP_SECRET", "label": "Feishu/Lark App Secret", "password": True},
            {"key": "API_SERVER_ENABLED", "label": "API Server Enabled", "password": False},
            {"key": "API_SERVER_PORT", "label": "API Server Port", "password": False},
            {"key": "API_SERVER_HOST", "label": "API Server Host", "password": False},
            {"key": "API_SERVER_KEY", "label": "API Server Auth Key", "password": True},
            {"key": "WEBHOOK_ENABLED", "label": "Webhooks Enabled", "password": False},
            {"key": "WEBHOOK_PORT", "label": "Webhook Port", "password": False},
            {"key": "WEBHOOK_SECRET", "label": "Webhook Secret", "password": True},
        ],
    },
    "setting": {
        "label": "Agent Settings",
        "icon": "⚙️",
        "vars": [
            {"key": "MESSAGING_CWD", "label": "Messaging Working Dir", "password": False},
            {"key": "SUDO_PASSWORD", "label": "Sudo Password", "password": True},
            {"key": "HERMES_MAX_ITERATIONS", "label": "Max Iterations", "password": False},
            {"key": "BROWSERBASE_PROJECT_ID", "label": "Browserbase Project ID", "password": False},
        ],
    },
}

# ── Coerce ─────────────────────────────────────────────────────────────────

def _coerce_value(value: Any) -> Any:
    if isinstance(value, str):
        if value.lower() in ("true", "yes", "on"):
            return True
        if value.lower() in ("false", "no", "off"):
            return False
        if value.isdigit():
            return int(value)
        try:
            return float(value)
        except (ValueError, TypeError):
            pass
    return value

# ── SETTINGS_SCHEMA (full) ────────────────────────────────────────────────

SETTINGS_SCHEMA: dict[str, dict[str, Any]] = {
    "model": {
        "label": "Model",
        "icon": "🤖",
        "fields": {
            "model_context_length": {"type": "integer", "label": "Context Length Override", "min": 0, "max": 2000000, "description": "0=use model default"},
            "fallback_providers": {"type": "list", "label": "Fallback Providers", "description": "Ordered list of fallback provider names"},
        },
    },
    "display": {
        "label": "Display",
        "icon": "🎨",
        "fields": {
            "display.personality": {
                "type": "string", "label": "Personality",
                "enum": ["helpful", "concise", "technical", "creative", "teacher", "kawaii", "catgirl", "pirate", "shakespeare", "surfer", "noir", "uwu", "philosopher", "hype"],
            },
            "display.skin": {
                "type": "string", "label": "Skin",
                "enum": ["default"],
            },
            "display.compact": {"type": "boolean", "label": "Compact Mode"},
            "display.streaming": {"type": "boolean", "label": "Streaming"},
            "display.show_reasoning": {"type": "boolean", "label": "Show Reasoning"},
            "display.show_cost": {"type": "boolean", "label": "Show Cost"},
            "display.inline_diffs": {"type": "boolean", "label": "Inline Diffs"},
            "display.bell_on_complete": {"type": "boolean", "label": "Bell on Complete"},
            "display.tool_preview_length": {"type": "integer", "label": "Tool Preview Length", "min": 0, "max": 10000, "description": "Max chars for tool previews (0=unlimited)"},
            "display.resume_display": {"type": "string", "label": "Resume Display", "enum": ["minimal", "full", "off"], "description": "How to display resumed sessions"},
            "display.busy_input_mode": {"type": "string", "label": "Busy Input Mode", "enum": ["queue", "interrupt", "block"], "description": "Behavior when user sends input while agent is busy"},
            "display.interim_assistant_messages": {"type": "boolean", "label": "Interim Assistant Messages"},
            "display.tool_progress_command": {"type": "boolean", "label": "Tool Progress Command"},
        },
    },
    "agent": {
        "label": "Agent",
        "icon": "⚡",
        "fields": {
            "agent.max_turns": {"type": "integer", "label": "Max Turns", "min": 1, "max": 500},
            "agent.gateway_timeout": {"type": "integer", "label": "Gateway Timeout (s)", "min": 0, "max": 7200, "description": "0=unlimited"},
            "agent.gateway_timeout_warning": {"type": "integer", "label": "Timeout Warning (s)", "min": 0, "max": 3600},
            "agent.restart_drain_timeout": {"type": "integer", "label": "Restart Drain Timeout (s)", "min": 0, "max": 600},
            "agent.tool_use_enforcement": {"type": "string", "label": "Tool Use Enforcement", "description": "auto, true, false, or model substrings list"},
            "agent.service_tier": {"type": "string", "label": "Service Tier"},
            "agent.gateway_notify_interval": {"type": "integer", "label": "Gateway Notify Interval (s)", "min": 1, "max": 300},
            "skills.external_dirs": {"type": "list", "label": "External Skill Directories", "description": "Additional directories to scan for skills"},
            "timezone": {"type": "string", "label": "Timezone", "description": "e.g. Asia/Shanghai, America/New_York"},
            "prefill_messages_file": {"type": "string", "label": "Prefill Messages File", "description": "Path to YAML file with pre-fill messages"},
            "command_allowlist": {"type": "list", "label": "Command Allowlist", "description": "Restrict terminal commands to these patterns"},
        },
    },
    "memory": {
        "label": "Memory",
        "icon": "🧠",
        "fields": {
            "memory.memory_enabled": {"type": "boolean", "label": "Memory Enabled"},
            "memory.user_profile_enabled": {"type": "boolean", "label": "User Profile Enabled"},
            "memory.memory_char_limit": {"type": "integer", "label": "Memory Char Limit", "min": 500, "max": 50000},
            "memory.user_char_limit": {"type": "integer", "label": "User Profile Char Limit", "min": 200, "max": 10000},
            "memory.provider": {"type": "string", "label": "External Memory Provider", "description": "openviking, mem0, hindsight, holographic, retaindb, byterover"},
        },
    },
    "compression": {
        "label": "Compression",
        "icon": "🗜️",
        "fields": {
            "compression.enabled": {"type": "boolean", "label": "Enabled"},
            "compression.threshold": {"type": "float", "label": "Threshold", "min": 0.1, "max": 1.0, "step": 0.05},
            "compression.target_ratio": {"type": "float", "label": "Target Ratio", "min": 0.05, "max": 0.9, "step": 0.05},
            "compression.protect_last_n": {"type": "integer", "label": "Protect Last N Messages", "min": 1, "max": 100},
            "compression.summary_model": {"type": "string", "label": "Summary Model"},
            "compression.summary_provider": {"type": "string", "label": "Summary Provider"},
            "compression.summary_base_url": {"type": "string", "label": "Summary Base URL"},
        },
    },
    "terminal": {
        "label": "Terminal",
        "icon": "💻",
        "fields": {
            "terminal.backend": {"type": "string", "label": "Backend", "enum": ["local", "docker", "modal", "ssh", "daytona", "singularity"]},
            "terminal.timeout": {"type": "integer", "label": "Timeout (s)", "min": 5, "max": 3600},
            "terminal.persistent_shell": {"type": "boolean", "label": "Persistent Shell"},
            "terminal.cwd": {"type": "string", "label": "Working Directory"},
            "terminal.docker_image": {"type": "string", "label": "Docker Image"},
            "terminal.container_cpu": {"type": "integer", "label": "Container CPU", "min": 1, "max": 16},
            "terminal.container_memory": {"type": "integer", "label": "Container Memory (MB)", "min": 512, "max": 32768},
            "terminal.container_disk": {"type": "integer", "label": "Container Disk (MB)", "min": 1024, "max": 512000},
            "terminal.container_persistent": {"type": "boolean", "label": "Persistent Container"},
            "terminal.modal_mode": {"type": "string", "label": "Modal Mode", "enum": ["sandbox", "function"], "description": "Modal execution mode"},
            "terminal.env_passthrough": {"type": "list", "label": "Env Passthrough", "description": "Environment variables to pass to container"},
            "terminal.docker_forward_env": {"type": "list", "label": "Docker Forward Env"},
            "terminal.singularity_image": {"type": "string", "label": "Singularity Image"},
            "terminal.modal_image": {"type": "string", "label": "Modal Image"},
            "terminal.daytona_image": {"type": "string", "label": "Daytona Image"},
            "terminal.docker_volumes": {"type": "list", "label": "Docker Volumes"},
            "terminal.docker_mount_cwd_to_workspace": {"type": "boolean", "label": "Mount CWD to Workspace"},
        },
    },
    "browser": {
        "label": "Browser",
        "icon": "🌐",
        "fields": {
            "browser.inactivity_timeout": {"type": "integer", "label": "Inactivity Timeout (s)", "min": 10, "max": 600},
            "browser.command_timeout": {"type": "integer", "label": "Command Timeout (s)", "min": 5, "max": 120},
            "browser.record_sessions": {"type": "boolean", "label": "Record Sessions"},
            "browser.allow_private_urls": {"type": "boolean", "label": "Allow Private URLs"},
            "browser.camofox.managed_persistence": {"type": "boolean", "label": "Camofox Managed Persistence"},
        },
    },
    "checkpoints": {
        "label": "Checkpoints",
        "icon": "📸",
        "fields": {
            "checkpoints.enabled": {"type": "boolean", "label": "Enabled"},
            "checkpoints.max_snapshots": {"type": "integer", "label": "Max Snapshots", "min": 1, "max": 200},
        },
    },
    "tts": {
        "label": "TTS",
        "icon": "🔊",
        "fields": {
            "tts.provider": {"type": "string", "label": "TTS Provider", "enum": ["edge", "elevenlabs", "openai", "minimax", "mistral", "neutts"]},
            "tts.edge.voice": {"type": "string", "label": "Edge Voice"},
            "tts.elevenlabs.voice_id": {"type": "string", "label": "ElevenLabs Voice ID"},
            "tts.elevenlabs.model_id": {"type": "string", "label": "ElevenLabs Model"},
            "tts.openai.model": {"type": "string", "label": "OpenAI TTS Model"},
            "tts.openai.voice": {"type": "string", "label": "OpenAI Voice", "enum": ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]},
            "tts.mistral.model": {"type": "string", "label": "Mistral TTS Model"},
            "tts.mistral.voice_id": {"type": "string", "label": "Mistral Voice ID"},
            "tts.neutts.ref_audio": {"type": "string", "label": "NeuTTS Ref Audio"},
            "tts.neutts.ref_text": {"type": "string", "label": "NeuTTS Ref Text"},
            "tts.neutts.model": {"type": "string", "label": "NeuTTS Model"},
            "tts.neutts.device": {"type": "string", "label": "NeuTTS Device", "description": "cpu or cuda"},
        },
    },
    "stt": {
        "label": "STT",
        "icon": "🎙️",
        "fields": {
            "stt.enabled": {"type": "boolean", "label": "STT Enabled"},
            "stt.provider": {"type": "string", "label": "STT Provider", "enum": ["local", "groq", "openai", "mistral"]},
            "stt.local.model": {"type": "string", "label": "Whisper Model", "enum": ["tiny", "base", "small", "medium", "large-v3"]},
            "stt.openai.model": {"type": "string", "label": "OpenAI STT Model"},
            "stt.local.language": {"type": "string", "label": "Whisper Language", "description": "e.g. en, zh, ja"},
            "stt.mistral.model": {"type": "string", "label": "Mistral STT Model"},
        },
    },
    "voice": {
        "label": "Voice",
        "icon": "🎤",
        "fields": {
            "voice.record_key": {"type": "string", "label": "Record Key"},
            "voice.max_recording_seconds": {"type": "integer", "label": "Max Recording (s)", "min": 5, "max": 600},
            "voice.auto_tts": {"type": "boolean", "label": "Auto TTS"},
            "voice.silence_threshold": {"type": "integer", "label": "Silence Threshold", "min": 0, "max": 32767},
            "voice.silence_duration": {"type": "float", "label": "Silence Duration (s)", "min": 0.5, "max": 30, "step": 0.5},
        },
    },
    "approvals": {
        "label": "Approvals",
        "icon": "🛡️",
        "fields": {
            "approvals.mode": {"type": "string", "label": "Approval Mode", "enum": ["manual", "smart", "off"]},
            "approvals.timeout": {"type": "integer", "label": "Timeout (s)", "min": 5, "max": 300},
        },
    },
    "delegation": {
        "label": "Delegation",
        "icon": "🔀",
        "fields": {
            "delegation.model": {"type": "string", "label": "Subagent Model"},
            "delegation.provider": {"type": "string", "label": "Subagent Provider"},
            "delegation.base_url": {"type": "string", "label": "Subagent Base URL"},
            "delegation.max_iterations": {"type": "integer", "label": "Max Iterations", "min": 5, "max": 200},
            "delegation.reasoning_effort": {"type": "string", "label": "Reasoning Effort", "enum": ["xhigh", "high", "medium", "low", "minimal", "none"]},
            "delegation.api_key": {"type": "string", "label": "Subagent API Key", "description": "API key for subagent model (leave empty to inherit)"},
        },
    },
    "smart_routing": {
        "label": "Smart Routing",
        "icon": "🧭",
        "fields": {
            "smart_model_routing.enabled": {"type": "boolean", "label": "Enabled"},
            "smart_model_routing.max_simple_chars": {"type": "integer", "label": "Max Simple Chars", "min": 10, "max": 1000},
            "smart_model_routing.max_simple_words": {"type": "integer", "label": "Max Simple Words", "min": 5, "max": 200},
        },
    },
    "security": {
        "label": "Security",
        "icon": "🔒",
        "fields": {
            "security.redact_secrets": {"type": "boolean", "label": "Redact Secrets"},
            "security.tirith_enabled": {"type": "boolean", "label": "Tirith Security Scan"},
            "security.tirith_timeout": {"type": "integer", "label": "Tirith Timeout (s)", "min": 1, "max": 30},
            "security.tirith_fail_open": {"type": "boolean", "label": "Tirith Fail Open"},
            "security.tirith_path": {"type": "string", "label": "Tirith Path", "description": "Path to tirith executable"},
            "security.website_blocklist.enabled": {"type": "boolean", "label": "Website Blocklist Enabled"},
            "security.website_blocklist.domains": {"type": "list", "label": "Blocked Domains"},
            "security.website_blocklist.shared_files": {"type": "list", "label": "Blocked Shared Files"},
        },
    },
    "privacy": {
        "label": "Privacy",
        "icon": "🕵️",
        "fields": {
            "privacy.redact_pii": {"type": "boolean", "label": "Redact PII"},
        },
    },
    "logging": {
        "label": "Logging",
        "icon": "📋",
        "fields": {
            "logging.level": {"type": "string", "label": "Level", "enum": ["DEBUG", "INFO", "WARNING", "ERROR"]},
            "logging.max_size_mb": {"type": "integer", "label": "Max Size (MB)", "min": 1, "max": 100},
            "logging.backup_count": {"type": "integer", "label": "Backup Count", "min": 0, "max": 20},
        },
    },
    "network": {
        "label": "Network",
        "icon": "🌐",
        "fields": {
            "network.force_ipv4": {"type": "boolean", "label": "Force IPv4"},
        },
    },
    "cron_settings": {
        "label": "Cron",
        "icon": "⏰",
        "fields": {
            "cron.wrap_response": {"type": "boolean", "label": "Wrap Response"},
        },
    },
    "human_delay": {
        "label": "Human Delay",
        "icon": "⏳",
        "fields": {
            "human_delay.mode": {"type": "string", "label": "Mode", "enum": ["off", "random"]},
            "human_delay.min_ms": {"type": "integer", "label": "Min Delay (ms)", "min": 0, "max": 10000},
            "human_delay.max_ms": {"type": "integer", "label": "Max Delay (ms)", "min": 0, "max": 10000},
        },
    },
    "context": {
        "label": "Context Engine",
        "icon": "🧩",
        "fields": {
            "context.engine": {"type": "string", "label": "Engine", "description": "compressor (default) or plugin name"},
        },
    },
    "toolsets": {
        "label": "Toolsets",
        "icon": "🔧",
        "fields": {
            "toolsets": {"type": "list", "label": "Enabled Toolsets"},
        },
    },
    "discord": {
        "label": "Discord",
        "icon": "💬",
        "fields": {
            "discord.require_mention": {"type": "boolean", "label": "Require Mention"},
            "discord.free_response_channels": {"type": "string", "label": "Free Response Channels", "description": "Channel IDs where bot responds without mention"},
            "discord.allowed_channels": {"type": "string", "label": "Allowed Channels", "description": "Channel IDs where bot is allowed (empty=all)"},
            "discord.auto_thread": {"type": "boolean", "label": "Auto Thread"},
            "discord.reactions": {"type": "boolean", "label": "Reactions"},
        },
    },
    "auxiliary": {
        "label": "Auxiliary Services",
        "icon": "🔌",
        "fields": {
            "auxiliary.vision.provider": {"type": "string", "label": "Vision Provider"},
            "auxiliary.vision.model": {"type": "string", "label": "Vision Model"},
            "auxiliary.vision.base_url": {"type": "string", "label": "Vision Base URL"},
            "auxiliary.web_extract.provider": {"type": "string", "label": "Web Extract Provider"},
            "auxiliary.web_extract.model": {"type": "string", "label": "Web Extract Model"},
            "auxiliary.compression.provider": {"type": "string", "label": "Compression Provider"},
            "auxiliary.compression.model": {"type": "string", "label": "Compression Model"},
            "auxiliary.session_search.provider": {"type": "string", "label": "Session Search Provider"},
            "auxiliary.session_search.model": {"type": "string", "label": "Session Search Model"},
            "auxiliary.skills_hub.provider": {"type": "string", "label": "Skills Hub Provider"},
            "auxiliary.skills_hub.model": {"type": "string", "label": "Skills Hub Model"},
            "auxiliary.approval.provider": {"type": "string", "label": "Approval Provider"},
            "auxiliary.approval.model": {"type": "string", "label": "Approval Model"},
            "auxiliary.mcp.provider": {"type": "string", "label": "MCP Provider"},
            "auxiliary.mcp.model": {"type": "string", "label": "MCP Model"},
            "auxiliary.flush_memories.provider": {"type": "string", "label": "Flush Memories Provider"},
            "auxiliary.flush_memories.model": {"type": "string", "label": "Flush Memories Model"},
        },
    },
}

# ── Routes: Config YAML ───────────────────────────────────────────────────

# ── Routes ────────────────────────────────────────────────────────────────
# Order matters: specific paths BEFORE /settings/{section} catch-all

@router.get("/settings")
async def get_settings():
    data = _load_yaml()
    # Backfill auxiliary.{task}.api_key with a boolean indicator so the UI
    # knows whether a key is configured (via env/credential-pool) without
    # exposing the actual secret value.
    env = _load_env()
    aux = data.get("auxiliary", {})
    if isinstance(aux, dict):
        for task_key, task_cfg in aux.items():
            if not isinstance(task_cfg, dict):
                continue
            if task_cfg.get("api_key"):
                continue
            provider = str(task_cfg.get("provider", "")).strip()
            if provider and provider not in ("auto", "custom", ""):
                env_key = _PROVIDER_ENV_KEYS.get(provider)
                if env_key and env.get(env_key):
                    task_cfg["api_key"] = "***configured***"
    return data

@router.get("/settings/schema")
async def get_settings_schema():
    return SETTINGS_SCHEMA

@router.get("/settings/sections")
async def get_settings_sections():
    return list(SETTINGS_SCHEMA.keys())

@router.get("/settings/env")
async def get_env_vars():
    env = _load_env()
    all_vars = []
    for group_key, group in ENV_VAR_GROUPS.items():
        for v in group["vars"]:
            val = env.get(v["key"], "")
            all_vars.append({
                "key": v["key"],
                "label": v["label"],
                "group": group_key,
                "password": v["password"],
                "url": v.get("url", ""),
                "has_value": bool(val),
                "value": val if not v["password"] else "",
            })
    return all_vars

@router.get("/settings/env-groups")
async def get_env_groups():
    return {k: {"label": v["label"], "icon": v["icon"], "count": len(v["vars"])} for k, v in ENV_VAR_GROUPS.items()}

@router.get("/settings/providers")
async def get_providers():
    config = _load_yaml()
    env = _load_env()
    current_provider = ""
    current_model = ""
    model_cfg = config.get("model")
    if isinstance(model_cfg, dict):
        current_provider = model_cfg.get("provider", "")
        current_model = model_cfg.get("default", "")

    providers = []
    # Build a lookup: env_var_key -> url from ENV_VAR_GROUPS
    env_url_map: dict[str, str] = {}
    for _gk, _ginfo in ENV_VAR_GROUPS.items():
        for _v in _ginfo.get("vars", []):
            if _v.get("url"):
                env_url_map[_v["key"]] = _v["url"]

    for pid, pinfo in PROVIDER_REGISTRY.items():
        env_vars = pinfo.get("env_vars", [])
        has_key = any(env.get(ev, "") for ev in env_vars)
        base_url_env = pinfo.get("base_url_env", "")
        custom_base = env.get(base_url_env, "") if base_url_env else ""
        # Get per-provider context_length from model.context_lengths
        provider_ctx = 0
        if isinstance(model_cfg, dict):
            provider_ctx = model_cfg.get("context_lengths", {}).get(pid, 0)
        # Map env vars to {key, has_value, url}
        key_info = []
        for ev in env_vars:
            key_info.append({
                "env_key": ev,
                "has_value": bool(env.get(ev, "")),
                "url": env_url_map.get(ev, ""),
            })
        providers.append({
            "id": pid,
            "name": pinfo["name"],
            "auth_type": pinfo["auth_type"],
            "default_base_url": pinfo["base_url"],
            "custom_base_url": custom_base,
            "base_url_env": base_url_env,
            "has_key": has_key,
            "is_active": pid == current_provider,
            "keys": key_info,
            "context_length": provider_ctx,
        })
    return {"current_provider": current_provider, "current_model": current_model, "providers": providers}

@router.get("/settings/credential-pool")
async def get_credential_pool():
    auth = _load_auth()
    pool = auth.get("credential_pool", {})
    strategies = _load_yaml().get("credential_pool_strategies", {})
    result = {}
    for prov, creds in pool.items():
        masked = []
        for c in creds:
            entry = {
                "id": c.get("id", ""),
                "label": c.get("label", ""),
                "auth_type": c.get("auth_type", ""),
                "priority": c.get("priority", 0),
                "source": c.get("source", ""),
                "last_status": c.get("last_status", ""),
                "request_count": c.get("request_count", 0),
                "has_key": bool(c.get("access_token") or c.get("api_key", "")),
            }
            if c.get("base_url"):
                entry["base_url"] = c["base_url"]
            masked.append(entry)
        result[prov] = {"credentials": masked, "strategy": strategies.get(prov, "fill_first")}
    return {"strategies_available": ["fill_first", "round_robin", "random", "least_used"], "pools": result}

# ── Catch-all (MUST be last GET route) ─────────────────────────────────

@router.get("/settings/{section}")
async def get_settings_section(section: str):
    data = _load_yaml()
    return data.get(section, {})

# ── Write routes ───────────────────────────────────────────────────────

class SettingUpdate(BaseModel):
    key: str
    value: Any

class BatchSettingUpdate(BaseModel):
    updates: list[SettingUpdate]

@router.patch("/settings")
async def update_setting(body: SettingUpdate):
    key = body.key
    value = _coerce_value(body.value)
    upper = key.upper()
    if upper.endswith(("_API_KEY", "_TOKEN")) or upper in ("GLM_API_KEY", "ZAI_API_KEY"):
        _save_env_value(key, str(body.value))
        return {"ok": True, "key": key, "target": "env"}
    config = _load_yaml()
    parts = key.split(".")
    current = config
    for part in parts[:-1]:
        if part not in current or not isinstance(current.get(part), dict):
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value
    _atomic_write_yaml(config)
    return {"ok": True, "key": key, "target": "config"}

_PROVIDER_ENV_KEYS = {
    "openrouter": "OPENROUTER_API_KEY",
    "zai": "GLM_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GOOGLE_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "kimi-coding": "KIMI_API_KEY",
    "minimax": "MINIMAX_API_KEY",
    "minimax-cn": "MINIMAX_CN_API_KEY",
    "xai": "XAI_API_KEY",
    "alibaba": "DASHSCOPE_API_KEY",
    "opencode-zen": "OPENCODE_ZEN_API_KEY",
    "opencode-go": "OPENCODE_GO_API_KEY",
    "kilocode": "KILOCODE_API_KEY",
    "huggingface": "HF_TOKEN",
    "xiaomi": "XIAOMI_API_KEY",
    "ai-gateway": "AI_GATEWAY_API_KEY",
    "copilot": "COPILOT_GITHUB_TOKEN",
}


@router.patch("/settings/batch")
async def update_settings_batch(body: BatchSettingUpdate):
    config = _load_yaml()
    env_writes = []
    for item in body.updates:
        key = item.key
        value = _coerce_value(item.value)
        upper = key.upper()
        # Detect auxiliary.{task}.api_key — route to correct provider env var
        if key.startswith("auxiliary.") and key.endswith(".api_key"):
            parts = key.split(".")
            if len(parts) == 3 and parts[0] == "auxiliary":
                task = parts[1]
                aux_section = config.get("auxiliary", {}).get(task, {})
                # Check dirty values first, fall back to existing config
                provider = None
                for u in body.updates:
                    if u.key == f"auxiliary.{task}.provider":
                        provider = str(u.value).strip()
                if not provider:
                    provider = str(aux_section.get("provider", "")).strip()
                # Only write to env for known providers (not auto/custom/empty)
                raw_val = str(item.value).strip()
                if provider and provider not in ("auto", "custom", ""):
                    env_key = _PROVIDER_ENV_KEYS.get(provider)
                    if env_key and raw_val and raw_val != "***configured***":
                        env_writes.append((env_key, raw_val))
                # For custom base_url, keep api_key in config.yaml
                if provider == "custom" or not provider:
                    parts_path = key.split(".")
                    current = config
                    for part in parts_path[:-1]:
                        if part not in current or not isinstance(current.get(part), dict):
                            current[part] = {}
                        current = current[part]
                    current[parts_path[-1]] = value
            continue
        if upper.endswith(("_API_KEY", "_TOKEN")) or upper in ("GLM_API_KEY", "ZAI_API_KEY"):
            env_writes.append((key, str(item.value)))
            continue
        parts = key.split(".")
        current = config
        for part in parts[:-1]:
            if part not in current or not isinstance(current.get(part), dict):
                current[part] = {}
            current = current[part]
        current[parts[-1]] = value
    _atomic_write_yaml(config)
    for ek, ev in env_writes:
        _save_env_value(ek, ev)
    return {"ok": True, "updated": len(body.updates)}

@router.post("/settings/reset-section/{section}")
async def reset_settings_section(section: str):
    config = _load_yaml()
    if section in config:
        del config[section]
        _atomic_write_yaml(config)
    return {"ok": True, "reset": section}

class EnvUpdate(BaseModel):
    key: str
    value: str

@router.patch("/settings/env")
async def update_env_var(body: EnvUpdate):
    _save_env_value(body.key, body.value)
    return {"ok": True, "key": body.key}

@router.delete("/settings/env/{key}")
async def delete_env_var(key: str):
    _delete_env_value(key)
    return {"ok": True, "deleted": key}

class ProviderSwitch(BaseModel):
    provider: str
    model: str = ""
    base_url: str = ""
    context_length: int = 0

@router.post("/settings/switch-provider")
async def switch_provider(body: ProviderSwitch):
    pid = body.provider
    if pid not in PROVIDER_REGISTRY:
        raise HTTPException(400, f"Unknown provider: {pid}")
    config = _load_yaml()
    if "model" not in config or not isinstance(config.get("model"), dict):
        config["model"] = {}
    config["model"]["provider"] = pid
    if body.model:
        config["model"]["default"] = body.model
    if body.base_url:
        config["model"]["base_url"] = body.base_url
    elif "base_url" in config.get("model", {}):
        del config["model"]["base_url"]
    # Store context_length per provider under model.context_lengths
    if body.context_length:
        cl = config["model"].setdefault("context_lengths", {})
        cl[pid] = body.context_length
        config["model_context_length"] = body.context_length
    elif config["model"].get("context_lengths", {}).get(pid):
        # Switching to a provider that has a saved context_length
        config["model_context_length"] = config["model"]["context_lengths"][pid]
    elif "model_context_length" in config:
        del config["model_context_length"]
    _atomic_write_yaml(config)
    return {"ok": True, "provider": pid}

class CredentialAdd(BaseModel):
    provider: str
    label: str = ""
    api_key: str = ""
    base_url: str = ""

@router.post("/settings/credential-pool/add")
async def add_credential(body: CredentialAdd):
    import hashlib
    auth = _load_auth()
    pool = auth.setdefault("credential_pool", {})
    prov = body.provider
    if prov not in pool:
        pool[prov] = []
    cred_id = hashlib.sha256(f"{prov}:{body.api_key[:8]}".encode()).hexdigest()[:6]
    new_cred = {
        "id": cred_id,
        "label": body.label or f"{prov}-{len(pool[prov])+1}",
        "auth_type": "api_key",
        "priority": len(pool[prov]),
        "source": "hudui",
        "access_token": body.api_key,
        "last_status": "unknown",
    }
    if body.base_url:
        new_cred["base_url"] = body.base_url
    pool[prov].append(new_cred)
    _atomic_write_auth(auth)
    return {"ok": True, "id": cred_id}

class CredentialDelete(BaseModel):
    provider: str
    credential_id: str

@router.post("/settings/credential-pool/remove")
async def remove_credential(body: CredentialDelete):
    auth = _load_auth()
    pool = auth.get("credential_pool", {})
    if body.provider not in pool:
        raise HTTPException(404, f"No pool for provider: {body.provider}")
    pool[body.provider] = [c for c in pool[body.provider] if c.get("id") != body.credential_id]
    if not pool[body.provider]:
        del pool[body.provider]
    _atomic_write_auth(auth)
    return {"ok": True}

class StrategyUpdate(BaseModel):
    provider: str
    strategy: str

@router.patch("/settings/credential-pool/strategy")
async def update_strategy(body: StrategyUpdate):
    if body.strategy not in ("fill_first", "round_robin", "random", "least_used"):
        raise HTTPException(400, f"Invalid strategy: {body.strategy}")
    config = _load_yaml()
    config.setdefault("credential_pool_strategies", {})[body.provider] = body.strategy
    _atomic_write_yaml(config)
    return {"ok": True}
