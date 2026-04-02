#!/usr/bin/env python3
import json
import os
from datetime import datetime, timezone
from pathlib import Path


def ensure_header(path: Path) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "# Hook Updates\n\n"
        "Automatic updates written by Claude Code hook after file edits.\n\n",
        encoding="utf-8",
    )


def main() -> int:
    try:
        payload = json.load(os.fdopen(0))
    except Exception:
        # Never block tool use because of hook parse errors.
        return 0

    tool_name = payload.get("tool_name", "")
    if tool_name not in ("Edit", "Write"):
        return 0

    tool_input = payload.get("tool_input", {}) or {}
    file_path = tool_input.get("file_path")
    if not file_path:
        return 0

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or "."
    project_root = Path(project_dir).resolve()
    changed = Path(file_path).resolve()

    # Avoid self-referential churn when editing .claude metadata.
    try:
        rel = changed.relative_to(project_root)
        rel_str = rel.as_posix()
    except Exception:
        rel_str = str(changed)

    if rel_str.startswith(".claude/"):
        return 0

    updates_path = project_root / ".claude" / "memory-bank" / "hook-updates.md"
    ensure_header(updates_path)

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    line = f"- {ts} | `{rel_str}`\n"
    with updates_path.open("a", encoding="utf-8") as f:
        f.write(line)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
