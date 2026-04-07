#!/usr/bin/env python3
"""Parse PRD markdown user stories into runnable build-loop tasks."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class Story:
    id: str
    number: int
    title: str
    slug: str
    output_relpath: str
    description: str
    acceptance_criteria: list[str]
    dependencies: str
    body_markdown: str
    directus_sensitive: bool


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def slugify(text: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return value or "story"


def parse_story_block(number: int, title: str, body: str) -> Story:
    description_lines: list[str] = []
    acceptance: list[str] = []
    dependencies = "None"

    lines = body.strip().splitlines()
    in_acceptance = False

    for line in lines:
        stripped = line.strip()

        if stripped == "**Acceptance Criteria:**":
            in_acceptance = True
            continue

        if stripped.startswith("**Task Breakdown Hint:**"):
            in_acceptance = False
            continue

        if stripped.startswith("**Dependencies:**"):
            in_acceptance = False
            dependencies = stripped.replace("**Dependencies:**", "", 1).strip() or "None"
            continue

        if in_acceptance and stripped.startswith("- [ ] "):
            acceptance.append(stripped[6:].strip())
            continue

        if not in_acceptance and stripped and not stripped.startswith("**"):
            description_lines.append(stripped)

    slug = slugify(title)
    directus_sensitive = bool(
        re.search(r"\b(directus|schema|collection|permission|flow|endpoint|module|lookup)\b", body, re.IGNORECASE)
    )
    return Story(
        id=f"STORY-{number:03d}",
        number=number,
        title=title.strip(),
        slug=slug,
        output_relpath=f"ralph-audit/results/{number:02d}-{slug}.md",
        description=" ".join(description_lines[:3]).strip(),
        acceptance_criteria=acceptance,
        dependencies=dependencies,
        body_markdown=body.strip(),
        directus_sensitive=directus_sensitive,
    )


def parse_prd(prd_path: Path) -> list[Story]:
    text = prd_path.read_text(encoding="utf-8")

    start = text.find("## User Stories")
    end = text.find("## Functional Requirements")
    if start == -1 or end == -1 or end <= start:
        raise SystemExit("Could not locate '## User Stories' and '## Functional Requirements' in PRD.")

    section = text[start:end]
    pattern = re.compile(
        r"^### Story (\d+): (.+?)\n(.*?)(?=^### Story \d+: |\Z)",
        re.MULTILINE | re.DOTALL,
    )

    stories = [
        parse_story_block(int(number), title, body)
        for number, title, body in pattern.findall(section)
    ]

    if not stories:
        raise SystemExit("No PRD stories found in the User Stories section.")

    return sorted(stories, key=lambda story: story.number)


def read_state(state_path: Path) -> dict[str, Any]:
    if not state_path.exists():
        return {"generated_at": utc_now(), "stories": {}}
    return json.loads(state_path.read_text(encoding="utf-8"))


def write_state(state_path: Path, state: dict[str, Any]) -> None:
    state_path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def sync_state(prd_path: Path, state_path: Path) -> dict[str, Any]:
    stories = parse_prd(prd_path)
    existing = read_state(state_path)
    existing_stories = existing.get("stories", {})

    merged: dict[str, Any] = {}
    for story in stories:
        prior = existing_stories.get(story.id, {})
        merged[story.id] = {
            **asdict(story),
            "passes": prior.get("passes", False),
            "skipped": prior.get("skipped", False),
            "note": prior.get("note", ""),
            "last_run_at": prior.get("last_run_at"),
        }

    state = {
        "generated_at": utc_now(),
        "prd_path": str(prd_path),
        "story_count": len(stories),
        "stories": merged,
    }
    write_state(state_path, state)
    return state


def sorted_story_items(state: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    return sorted(state.get("stories", {}).items(), key=lambda item: item[1]["number"])


def get_story(state: dict[str, Any], story_id: str) -> dict[str, Any]:
    story = state.get("stories", {}).get(story_id)
    if not story:
        raise SystemExit(f"Unknown story id: {story_id}")
    return story


def cmd_sync(args: argparse.Namespace) -> int:
    state = sync_state(Path(args.prd), Path(args.state))
    print(json.dumps({"ok": True, "story_count": state["story_count"]}, indent=2))
    return 0


def cmd_current_id(args: argparse.Namespace) -> int:
    state = sync_state(Path(args.prd), Path(args.state))
    for story_id, story in sorted_story_items(state):
        if not story.get("passes") and not story.get("skipped"):
            print(story_id)
            return 0
    return 0


def cmd_story_field(args: argparse.Namespace) -> int:
    state = sync_state(Path(args.prd), Path(args.state))
    story = get_story(state, args.story_id)
    value = story.get(args.field, "")
    if isinstance(value, list):
        print("\n".join(value))
    else:
        print(value)
    return 0


def cmd_story_markdown(args: argparse.Namespace) -> int:
    state = sync_state(Path(args.prd), Path(args.state))
    story = get_story(state, args.story_id)
    print(f"### Story {story['number']}: {story['title']}\n")
    print(story["body_markdown"])
    return 0


def cmd_mark(args: argparse.Namespace) -> int:
    state_path = Path(args.state)
    state = sync_state(Path(args.prd), state_path)
    story = get_story(state, args.story_id)
    story["passes"] = args.status == "passed"
    story["skipped"] = args.status == "skipped"
    story["note"] = args.note or ""
    story["last_run_at"] = utc_now()
    write_state(state_path, state)
    return 0


def cmd_progress(args: argparse.Namespace) -> int:
    state = sync_state(Path(args.prd), Path(args.state))
    output = Path(args.output)

    lines = [
        "# Ralph Build Progress Log",
        f"Generated: {utc_now()}",
        f"PRD: {args.prd}",
        "Purpose: PRD-driven implementation loop.",
        "---",
        "",
        "## Story Checklist",
    ]

    for story_id, story in sorted_story_items(state):
        marker = "x" if story.get("passes") else "-"
        if story.get("skipped"):
            marker = "!"
        prefix = {"x": "[x]", "-": "[ ]", "!": "[!]"}[marker]
        lines.append(f"- {prefix} {story_id}: {story['title']}")

    lines.append("---")
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


def cmd_status_summary(args: argparse.Namespace) -> int:
    state = sync_state(Path(args.prd), Path(args.state))
    output = Path(args.output)

    lines = [
        "# Ralph Build Status Summary",
        f"Generated: {utc_now()}",
        f"PRD: {args.prd}",
        "",
        "## Story Mapping",
    ]

    for story_id, story in sorted_story_items(state):
        status = "done" if story.get("passes") else "skipped" if story.get("skipped") else "pending"
        acceptance = story.get("acceptance_criteria", [])
        lines.append(f"### {story_id}: {story['title']}")
        lines.append(f"- Status: {status}")
        lines.append(f"- Directus Sensitive: {'yes' if story.get('directus_sensitive') else 'no'}")
        lines.append(f"- Dependencies: {story.get('dependencies', 'None')}")
        lines.append(f"- Result File: {story.get('output_relpath', '')}")
        if acceptance:
            lines.append("- Acceptance Criteria:")
            for item in acceptance:
                lines.append(f"  - {item}")
        if story.get("note"):
            lines.append(f"- Note: {story['note']}")
        lines.append("")

    output.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    def with_common(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument("--prd", required=True)
        subparser.add_argument("--state", required=True)

    sync = subparsers.add_parser("sync")
    with_common(sync)
    sync.set_defaults(func=cmd_sync)

    current_id = subparsers.add_parser("current-id")
    with_common(current_id)
    current_id.set_defaults(func=cmd_current_id)

    story_field = subparsers.add_parser("story-field")
    with_common(story_field)
    story_field.add_argument("--story-id", required=True)
    story_field.add_argument("--field", required=True)
    story_field.set_defaults(func=cmd_story_field)

    story_markdown = subparsers.add_parser("story-markdown")
    with_common(story_markdown)
    story_markdown.add_argument("--story-id", required=True)
    story_markdown.set_defaults(func=cmd_story_markdown)

    mark = subparsers.add_parser("mark")
    with_common(mark)
    mark.add_argument("--story-id", required=True)
    mark.add_argument("--status", choices=["passed", "skipped"], required=True)
    mark.add_argument("--note", default="")
    mark.set_defaults(func=cmd_mark)

    progress = subparsers.add_parser("write-progress")
    with_common(progress)
    progress.add_argument("--output", required=True)
    progress.set_defaults(func=cmd_progress)

    summary = subparsers.add_parser("write-status-summary")
    with_common(summary)
    summary.add_argument("--output", required=True)
    summary.set_defaults(func=cmd_status_summary)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
