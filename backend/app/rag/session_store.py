"""
Disk-backed persistence for session state, so a backend restart doesn't lose it.

Only state that can't be rebuilt is saved: chat history, summary cache, and
starter questions. Processed video indexes are not saved here — they already
persist in Chroma and are reloaded on demand by process_video().

The interface (load / save / delete) is deliberately small so this module can
be swapped for a shared store like Redis when running more than one server.
"""

import json
import logging
import os
import re
import time
from typing import Optional

from langchain_core.messages import messages_from_dict, messages_to_dict

logger = logging.getLogger(__name__)

SESSION_DIR = os.getenv(
    "SESSION_STORE_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".session_store")),
)
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", str(7 * 24 * 3600)))

# session_id comes from the client and becomes a filename, so only allow
# UUID-like ids — never path separators or "..".
_SAFE_ID = re.compile(r"^[A-Za-z0-9-]{1,64}$")


def _session_path(session_id: str) -> Optional[str]:
    if not session_id or not _SAFE_ID.match(session_id):
        return None
    return os.path.join(SESSION_DIR, f"{session_id}.json")


def load_session_state(session_id: str) -> Optional[dict]:
    """Return the saved durable state for a session, or None if missing/expired."""
    path = _session_path(session_id)
    if not path or not os.path.exists(path):
        return None
    try:
        if time.time() - os.path.getmtime(path) > SESSION_TTL_SECONDS:
            os.remove(path)
            return None
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        return {
            "messages": messages_from_dict(raw.get("messages", [])),
            "summary_cache": raw.get("summary_cache", {}),
            "starter_questions_cache": raw.get("starter_questions_cache", {}),
        }
    except Exception as e:
        logger.warning("Could not load session %s: %s", session_id, e)
        return None


def save_session_state(session_id: str, session: dict) -> None:
    """Write the durable parts of a session to disk (atomically)."""
    path = _session_path(session_id)
    if not path:
        return
    try:
        os.makedirs(SESSION_DIR, exist_ok=True)
        payload = {
            "messages": messages_to_dict(session["history"].messages),
            "summary_cache": session.get("summary_cache", {}),
            "starter_questions_cache": session.get("starter_questions_cache", {}),
        }
        tmp_path = path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        os.replace(tmp_path, path)  # atomic: never leaves a half-written file
    except Exception as e:
        logger.warning("Could not save session %s: %s", session_id, e)


def delete_session_state(session_id: str) -> None:
    path = _session_path(session_id)
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except Exception as e:
            logger.warning("Could not delete session %s: %s", session_id, e)


def prune_expired_sessions() -> int:
    """Delete session files older than the TTL. Returns how many were removed."""
    if not os.path.isdir(SESSION_DIR):
        return 0
    removed = 0
    cutoff = time.time() - SESSION_TTL_SECONDS
    for name in os.listdir(SESSION_DIR):
        path = os.path.join(SESSION_DIR, name)
        try:
            if name.endswith(".json") and os.path.getmtime(path) < cutoff:
                os.remove(path)
                removed += 1
        except Exception:
            continue
    return removed
