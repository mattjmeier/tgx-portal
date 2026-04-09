#!/usr/bin/env python3
"""State helper for the TGX Portal Ralph loop."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def sorted_tasks(plan: dict[str, Any]) -> list[dict[str, Any]]:
    return sorted(plan.get("userStories", []), key=lambda item: (item.get("priority", 9999), item.get("id", "")))


def sync_state(plan_path: Path, state_path: Path) -> dict[str, Any]:
    plan = read_json(plan_path, {})
    state = read_json(state_path, {"generated_at": utc_now(), "tasks": {}})
    prior_tasks = state.get("tasks", {})

    merged: dict[str, Any] = {}
    for task in sorted_tasks(plan):
        task_id = task["id"]
        prior = prior_tasks.get(task_id, {})
        merged[task_id] = {
            **task,
            "passes": prior.get("passes", task.get("passes", False)),
            "skipped": prior.get("skipped", False),
            "note": prior.get("note", ""),
            "last_run_at": prior.get("last_run_at"),
        }

    next_state = {
        "generated_at": utc_now(),
        "project": plan.get("project"),
        "description": plan.get("description"),
        "tasks": merged,
    }
    write_json(state_path, next_state)
    return next_state


def task_by_id(state: dict[str, Any], task_id: str) -> dict[str, Any]:
    task = state.get("tasks", {}).get(task_id)
    if not task:
        raise SystemExit(f"Unknown task id: {task_id}")
    return task


def cmd_sync(args: argparse.Namespace) -> int:
    state = sync_state(Path(args.plan), Path(args.state))
    print(json.dumps({"ok": True, "task_count": len(state["tasks"])}, indent=2))
    return 0


def cmd_current_id(args: argparse.Namespace) -> int:
    state = sync_state(Path(args.plan), Path(args.state))
    for task in sorted(state["tasks"].values(), key=lambda item: (item.get("priority", 9999), item.get("id", ""))):
        if not task.get("passes") and not task.get("skipped"):
            print(task["id"])
            return 0
    return 0


def cmd_task_field(args: argparse.Namespace) -> int:
    state = sync_state(Path(args.plan), Path(args.state))
    task = task_by_id(state, args.task_id)
    print(task.get(args.field, ""))
    return 0


def cmd_mark(args: argparse.Namespace) -> int:
    state_path = Path(args.state)
    state = sync_state(Path(args.plan), state_path)
    task = task_by_id(state, args.task_id)
    task["passes"] = args.status == "passed"
    task["skipped"] = args.status == "skipped"
    task["note"] = args.note or ""
    task["last_run_at"] = utc_now()
    write_json(state_path, state)
    return 0


def cmd_progress(args: argparse.Namespace) -> int:
    state = sync_state(Path(args.plan), Path(args.state))
    output = Path(args.output)
    lines = [
        "# Ralph Loop Progress",
        f"Generated: {utc_now()}",
        f"Plan: {args.plan}",
        f"Project: {state.get('project', '')}",
        "---",
        "",
        "## Task Checklist",
    ]

    tasks = sorted(state["tasks"].values(), key=lambda item: (item.get("priority", 9999), item.get("id", "")))
    for task in tasks:
        prefix = "[!]" if task.get("skipped") else "[x]" if task.get("passes") else "[ ]"
        lines.append(f"- {prefix} {task['id']}: {task['title']}")

    lines.append("---")
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


def cmd_status_summary(args: argparse.Namespace) -> int:
    state = sync_state(Path(args.plan), Path(args.state))
    output = Path(args.output)

    tasks = sorted(state["tasks"].values(), key=lambda item: (item.get("priority", 9999), item.get("id", "")))
    lines = [
        "# Ralph Status Summary",
        f"Generated: {utc_now()}",
        "",
        "## PRD Mapping",
    ]

    for task in tasks:
        status = "done" if task.get("passes") else "skipped" if task.get("skipped") else "pending"
        lines.append(f"### {task['id']}: {task['title']}")
        lines.append(f"- PRD Section: {task.get('prd_section', '')}")
        lines.append(f"- Acceptance Target: {task.get('acceptance', '')}")
        lines.append(f"- Status: {status}")
        lines.append(f"- Result File: {task.get('output', '')}")
        if task.get("note"):
            lines.append(f"- Note: {task['note']}")
        lines.append("")

    output.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_common(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument("--plan", required=True)
        subparser.add_argument("--state", required=True)

    sync = subparsers.add_parser("sync")
    add_common(sync)
    sync.set_defaults(func=cmd_sync)

    current = subparsers.add_parser("current-id")
    add_common(current)
    current.set_defaults(func=cmd_current_id)

    field = subparsers.add_parser("task-field")
    add_common(field)
    field.add_argument("--task-id", required=True)
    field.add_argument("--field", required=True)
    field.set_defaults(func=cmd_task_field)

    mark = subparsers.add_parser("mark")
    add_common(mark)
    mark.add_argument("--task-id", required=True)
    mark.add_argument("--status", choices=["passed", "skipped"], required=True)
    mark.add_argument("--note", default="")
    mark.set_defaults(func=cmd_mark)

    progress = subparsers.add_parser("write-progress")
    add_common(progress)
    progress.add_argument("--output", required=True)
    progress.set_defaults(func=cmd_progress)

    summary = subparsers.add_parser("write-status-summary")
    add_common(summary)
    summary.add_argument("--output", required=True)
    summary.set_defaults(func=cmd_status_summary)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
