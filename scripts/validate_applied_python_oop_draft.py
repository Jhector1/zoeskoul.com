#!/usr/bin/env python3

from __future__ import annotations

import ast
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SUBJECT_ROOT = (
    REPO_ROOT
    / ".curriculum-drafts/python/subjects/python--applied-python-projects--draft"
)
MESSAGES_ROOT = (
    REPO_ROOT
    / ".curriculum-drafts/python/messages/en/subjects/python--applied-python-projects--draft"
)

MODULES = ["module8", "module9", "module10", "module11"]
MODULE11_CHAIN = [
    "capstone-scope-and-architecture",
    "capstone-domain-model",
    "capstone-storage-and-reports",
    "capstone-tests-and-polish",
    "module-11-final-oop-capstone",
]


def load_json(path: Path):
    return json.loads(path.read_text())


def deep_merge(base: dict, extra: dict) -> dict:
    result = dict(base)
    for key, value in extra.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def build_message_tree() -> dict:
    tree = {}
    tree = deep_merge(tree, load_json(MESSAGES_ROOT / "subject.json"))
    for module in MODULES:
        module_dir = MESSAGES_ROOT / module
        if not module_dir.exists():
            continue
        for file_path in sorted(module_dir.glob("*.json")):
            tree = deep_merge(tree, load_json(file_path))
    return tree


MESSAGE_TREE = build_message_tree()


def resolve_message_ref(value: str):
    if not isinstance(value, str) or not value.startswith("@:"):
        return value
    current = MESSAGE_TREE
    for part in value[2:].split("."):
        if not isinstance(current, dict) or part not in current:
            raise KeyError(value)
        current = current[part]
    return current


def entry_path(files: list[dict], fallback: str) -> str:
    for file in files:
        if file.get("isEntry") is True or file.get("entry") is True:
            return file["path"]
    return fallback


def files_signature(files: list[dict]) -> list[tuple[str, str]]:
    return [(file["path"], file.get("content", "")) for file in files]


def collect_topic_paths() -> list[Path]:
    paths: list[Path] = []
    for module in MODULES:
        paths.extend(sorted((SUBJECT_ROOT / "modules" / module / "topics").glob("*/topic.bundle.json")))
    return paths


def validate_bundle(bundle_path: Path, errors: list[str]) -> None:
    bundle = load_json(bundle_path)
    cards = bundle.get("cards", [])
    exercises = bundle.get("exercises", [])
    exercise_map = {exercise["id"]: exercise for exercise in exercises}

    visible_code_refs: dict[str, int] = {}

    for card in cards:
        kind = card.get("kind")
        if kind == "sketch":
            try_it = card.get("tryIt") or {}
            exercise_id = try_it.get("exerciseKey")
            if exercise_id:
                visible_code_refs[exercise_id] = visible_code_refs.get(exercise_id, 0) + 1
        elif kind == "project":
            for step in card.get("project", {}).get("steps", []):
                exercise_id = step.get("exerciseKey")
                if exercise_id:
                    visible_code_refs[exercise_id] = visible_code_refs.get(exercise_id, 0) + 1

    for exercise in exercises:
        if exercise.get("kind") == "code_input":
            count = visible_code_refs.get(exercise["id"], 0)
            if count != 1:
                errors.append(
                    f"{bundle_path}: code_input exercise {exercise['id']} reachability count={count}"
                )

    for exercise_id, count in visible_code_refs.items():
        if count > 1:
            errors.append(f"{bundle_path}: exercise {exercise_id} is referenced {count} times")

    for exercise in exercises:
        if exercise.get("purpose") == "quiz" and exercise.get("kind") == "code_input":
            errors.append(f"{bundle_path}: quiz exercise {exercise['id']} must not be code_input")

        if exercise.get("kind") != "code_input":
            continue

        for field_name in ["starterCode"]:
            if field_name in exercise:
                try:
                    resolve_message_ref(exercise[field_name])
                except KeyError:
                    errors.append(
                        f"{bundle_path}: unresolved message ref in {exercise['id']}.{field_name}"
                    )

        for file_group_name in ["starterFiles", "solutionFiles"]:
            for file in exercise.get(file_group_name, []) or []:
                try:
                    content = resolve_message_ref(file.get("content", ""))
                except KeyError:
                    errors.append(
                        f"{bundle_path}: unresolved message ref in {exercise['id']} {file_group_name} {file['path']}"
                    )
                    continue
                if not isinstance(content, str):
                    continue
                if file["path"].endswith(".py"):
                    try:
                        ast.parse(content)
                    except SyntaxError as exc:
                        errors.append(
                            f"{bundle_path}: {exercise['id']} {file_group_name} {file['path']} syntax error: {exc.msg}"
                        )

        workspace = exercise.get("workspace") or {}
        for file in workspace.get("starterFiles", []) or []:
            try:
                content = resolve_message_ref(file.get("content", ""))
            except KeyError:
                errors.append(
                    f"{bundle_path}: unresolved workspace message ref in {exercise['id']} {file['path']}"
                )
                continue
            if isinstance(content, str) and file["path"].endswith(".py"):
                try:
                    ast.parse(content)
                except SyntaxError as exc:
                    errors.append(
                        f"{bundle_path}: {exercise['id']} workspace {file['path']} syntax error: {exc.msg}"
                    )

        solution_code = exercise.get("recipe", {}).get("solutionCode")
        if isinstance(solution_code, str):
            try:
                ast.parse(solution_code)
            except SyntaxError as exc:
                errors.append(
                    f"{bundle_path}: {exercise['id']} recipe.solutionCode syntax error: {exc.msg}"
                )

        starter_paths = {file["path"] for file in exercise.get("starterFiles", []) or []}
        solution_paths = {file["path"] for file in exercise.get("solutionFiles", []) or []}
        missing = starter_paths - solution_paths
        if missing:
            errors.append(
                f"{bundle_path}: {exercise['id']} missing solution files for starter paths {sorted(missing)}"
            )

        blob = json.dumps(exercise)
        if "value_1" in blob or "value_2" in blob:
            errors.append(f"{bundle_path}: {exercise['id']} contains placeholder value_1/value_2")
        if "is_even" in blob or "is_positive" in blob:
            errors.append(f"{bundle_path}: {exercise['id']} contains generic fallback exercise content")


def validate_carry_forward(errors: list[str]) -> None:
    for bundle_path in collect_topic_paths():
        bundle = load_json(bundle_path)
        project_cards = [card for card in bundle.get("cards", []) if card.get("kind") == "project"]
        if not project_cards:
            continue
        project_card = project_cards[0]
        exercises = {exercise["id"]: exercise for exercise in bundle.get("exercises", [])}
        previous_solution = None
        for index, step in enumerate(project_card.get("project", {}).get("steps", [])):
            exercise = exercises[step["exerciseKey"]]
            starters = exercise.get("starterFiles", []) or []
            if previous_solution is not None and files_signature(starters) != files_signature(previous_solution):
                errors.append(
                    f"{bundle_path}: step {step['exerciseKey']} starterFiles do not match previous solutionFiles"
                )
            previous_solution = exercise.get("solutionFiles", []) or []

    previous_topic_solution = None
    module11_root = SUBJECT_ROOT / "modules" / "module11" / "topics"
    for topic_name in MODULE11_CHAIN:
        bundle = load_json(module11_root / topic_name / "topic.bundle.json")
        project_card = next(card for card in bundle.get("cards", []) if card.get("kind") == "project")
        exercises = {exercise["id"]: exercise for exercise in bundle.get("exercises", [])}
        steps = project_card.get("project", {}).get("steps", [])
        first_exercise = exercises[steps[0]["exerciseKey"]]
        if previous_topic_solution is not None:
            starters = first_exercise.get("starterFiles", []) or []
            if files_signature(starters) != files_signature(previous_topic_solution):
                errors.append(
                    f"module11/{topic_name}: first step starterFiles do not match previous topic final solutionFiles"
                )
        previous_topic_solution = exercises[steps[-1]["exerciseKey"]].get("solutionFiles", []) or []


def main() -> int:
    errors: list[str] = []
    for bundle_path in collect_topic_paths():
        validate_bundle(bundle_path, errors)
    validate_carry_forward(errors)

    if errors:
        print("FAIL")
        for error in errors:
            print(error)
        return 1

    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
