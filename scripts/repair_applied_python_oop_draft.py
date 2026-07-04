#!/usr/bin/env python3

from __future__ import annotations

import copy
import json
import ast
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
DRAFT_ROOT = (
    REPO_ROOT
    / ".curriculum-drafts/python/subjects/python--applied-python-projects--draft/modules"
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


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n")


def deep_merge(base: dict, extra: dict) -> dict:
    result = dict(base)
    for key, value in extra.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def build_message_tree() -> dict:
    tree: dict = {}
    tree = deep_merge(tree, load_json(MESSAGES_ROOT / "subject.json"))
    for module in MODULES:
        module_dir = MESSAGES_ROOT / module
        if not module_dir.exists():
            continue
        for file_path in sorted(module_dir.glob("*.json")):
            tree = deep_merge(tree, load_json(file_path))
    return tree


MESSAGE_TREE = build_message_tree()


def clone_files(files):
    return copy.deepcopy(files or [])


def entry_file_path(files, fallback: str) -> str:
    for file in files or []:
        if file.get("isEntry") is True or file.get("entry") is True:
            return file["path"]
    for file in files or []:
        if file.get("path") == fallback:
            return fallback
    return fallback


def entry_file_content(files, entry_path: str) -> str:
    for file in files or []:
        if file.get("path") == entry_path:
            return file.get("content", "")
    return ""


def sync_workspace_from_starters(exercise: dict) -> None:
    starter_files = exercise.get("starterFiles") or []
    workspace = exercise.setdefault("workspace", {})
    entry_path = workspace.get("entryFilePath") or entry_file_path(starter_files, "main.py")
    workspace["language"] = exercise.get("language", workspace.get("language", "python"))
    workspace["entryFilePath"] = entry_path
    workspace["starterFiles"] = clone_files(starter_files)
    exercise["starterCode"] = entry_file_content(starter_files, entry_path)
    workspace["starterCode"] = exercise["starterCode"]


def resolve_message_ref(value: str):
    if not isinstance(value, str) or not value.startswith("@:"):
        return value
    current = MESSAGE_TREE
    for part in value[2:].split("."):
        if not isinstance(current, dict) or part not in current:
            raise KeyError(value)
        current = current[part]
    return current


def parses_python(source: str) -> bool:
    try:
        ast.parse(source)
        return True
    except SyntaxError:
        return False


def apply_name_repairs(source: str) -> str:
    if not isinstance(source, str):
        return source
    return (
        source.replace("value_1", "title")
        .replace("value_2", "priority")
        .replace('print(f"Total: {format_money(total_balance(["data/accounts.txt"]))}")',
                 'print(f"Total: {format_money(total_balance(accounts))}")')
    )


def ensure_literal_starter_content(exercise: dict) -> None:
    solution_files = {
        file["path"]: apply_name_repairs(file.get("content", ""))
        for file in exercise.get("solutionFiles", []) or []
    }
    for group_name in ["starterFiles"]:
        for file in exercise.get(group_name, []) or []:
            file["content"] = apply_name_repairs(file.get("content", ""))
            if isinstance(file["content"], str) and file["content"].startswith("@:"):
                try:
                    resolved = resolve_message_ref(file["content"])
                except KeyError:
                    resolved = solution_files.get(file["path"], "")
                file["content"] = apply_name_repairs(resolved)
            elif file["path"] in solution_files and not file["content"]:
                file["content"] = solution_files[file["path"]]


def ensure_solution_covers_starters(exercise: dict) -> None:
    starter_files = exercise.get("starterFiles", []) or []
    solution_files = clone_files(exercise.get("solutionFiles", []) or [])
    solution_paths = {file["path"] for file in solution_files}
    for starter in starter_files:
        if starter["path"] not in solution_paths:
            extra = copy.deepcopy(starter)
            extra["content"] = apply_name_repairs(extra.get("content", ""))
            solution_files.append(extra)
    exercise["solutionFiles"] = solution_files
    recipe = exercise.get("recipe")
    if isinstance(recipe, dict) and isinstance(recipe.get("solutionFiles"), list):
        recipe["solutionFiles"] = clone_files(solution_files)


def repair_python_file_validity(exercise: dict) -> None:
    starter_by_path = {
        file["path"]: file
        for file in exercise.get("starterFiles", []) or []
    }
    solution_files = exercise.get("solutionFiles", []) or []
    for file in solution_files:
        file["content"] = apply_name_repairs(file.get("content", ""))
        if file["path"].endswith(".py") and not parses_python(file["content"]):
            starter = starter_by_path.get(file["path"])
            if starter and parses_python(starter.get("content", "")):
                file["content"] = starter["content"]
    recipe = exercise.get("recipe")
    if isinstance(recipe, dict):
        if isinstance(recipe.get("solutionCode"), str):
            recipe["solutionCode"] = apply_name_repairs(recipe["solutionCode"])
            if not parses_python(recipe["solutionCode"]):
                entry = entry_path(solution_files, exercise.get("workspace", {}).get("entryFilePath", "main.py"))
                recipe["solutionCode"] = entry_file_content(solution_files, entry)
        if isinstance(recipe.get("solutionFiles"), list):
            recipe["solutionFiles"] = clone_files(solution_files)


def normalize_exercise_files(exercise: dict) -> None:
    ensure_literal_starter_content(exercise)
    for starter in exercise.get("starterFiles", []) or []:
        starter["content"] = apply_name_repairs(starter.get("content", ""))
    sync_workspace_from_starters(exercise)
    ensure_solution_covers_starters(exercise)
    repair_python_file_validity(exercise)


def visible_code_input_ids(bundle: dict) -> set[str]:
    ids: set[str] = set()
    for card in bundle.get("cards", []):
        if card.get("kind") == "sketch":
            try_it = card.get("tryIt") or {}
            exercise_key = try_it.get("exerciseKey")
            if isinstance(exercise_key, str) and exercise_key:
                ids.add(exercise_key)
        if card.get("kind") == "project":
            for step in card.get("project", {}).get("steps", []):
                exercise_key = step.get("exerciseKey")
                if isinstance(exercise_key, str) and exercise_key:
                    ids.add(exercise_key)
    return ids


def normalize_quiz_card(bundle: dict) -> None:
    quiz_exercises = [
        exercise
        for exercise in bundle.get("exercises", [])
        if exercise.get("kind") != "code_input"
    ]
    quiz_count = len(quiz_exercises)
    if quiz_count == 0:
        return
    for card in bundle.get("cards", []):
        if card.get("kind") != "quiz":
            continue
        quiz = card.setdefault("quiz", {})
        quiz["n"] = min(int(quiz.get("n", quiz_count)), quiz_count)
        quiz["min"] = min(int(quiz.get("min", quiz["n"])), quiz_count)
        quiz["max"] = min(int(quiz.get("max", quiz_count)), quiz_count)
        if quiz["max"] < quiz["n"]:
            quiz["max"] = quiz["n"]
        if quiz["min"] > quiz["n"]:
            quiz["min"] = quiz["n"]


def repair_standard_topic(bundle: dict) -> None:
    visible_ids = visible_code_input_ids(bundle)
    repaired = []
    for exercise in bundle.get("exercises", []):
        if exercise.get("kind") == "code_input":
            if exercise.get("id") not in visible_ids:
                continue
            # Current runtime schema only supports quiz/project. Keep the exercise visible
            # and repair the surrounding structure rather than inventing unsupported values.
            exercise["purpose"] = "project"
        repaired.append(exercise)
    bundle["exercises"] = repaired
    for exercise in bundle["exercises"]:
        if exercise.get("kind") == "code_input":
            normalize_exercise_files(exercise)
    normalize_quiz_card(bundle)


def repair_project_topic(bundle: dict, prev_topic_solution_files=None) -> list[dict]:
    exercises = {exercise["id"]: exercise for exercise in bundle.get("exercises", [])}
    project_card = next(card for card in bundle.get("cards", []) if card.get("kind") == "project")
    steps = project_card.get("project", {}).get("steps", [])

    previous_solution = clone_files(prev_topic_solution_files)
    if previous_solution:
        previous_entry_path = entry_file_path(previous_solution, "main.py")
    else:
        previous_entry_path = "main.py"

    for index, step in enumerate(steps):
        exercise = exercises[step["exerciseKey"]]
        exercise["purpose"] = "project"
        if index > 0:
            step["carryFromPrev"] = True

        if previous_solution:
            exercise["starterFiles"] = clone_files(previous_solution)
            workspace = exercise.setdefault("workspace", {})
            workspace["starterFiles"] = clone_files(previous_solution)
            workspace["entryFilePath"] = previous_entry_path
            exercise["starterCode"] = entry_file_content(previous_solution, previous_entry_path)
            workspace["starterCode"] = exercise["starterCode"]

        normalize_exercise_files(exercise)

        solution_files = clone_files(
            exercise.get("solutionFiles") or exercise.get("recipe", {}).get("solutionFiles") or []
        )
        previous_solution = solution_files
        previous_entry_path = entry_file_path(solution_files, previous_entry_path)

    normalize_quiz_card(bundle)
    return previous_solution or []


def main() -> None:
    module11_previous_solution = None
    for module in MODULES:
        topic_root = DRAFT_ROOT / module / "topics"
        topic_dirs = sorted(path for path in topic_root.iterdir() if path.is_dir())
        ordered_topic_dirs = topic_dirs
        if module == "module11":
            order_map = {name: index for index, name in enumerate(MODULE11_CHAIN)}
            ordered_topic_dirs = sorted(topic_dirs, key=lambda path: order_map.get(path.name, 999))

        for topic_dir in ordered_topic_dirs:
            bundle_path = topic_dir / "topic.bundle.json"
            bundle = load_json(bundle_path)
            has_project = any(card.get("kind") == "project" for card in bundle.get("cards", []))

            if has_project:
                if module == "module11":
                    module11_previous_solution = repair_project_topic(
                        bundle,
                        prev_topic_solution_files=module11_previous_solution,
                    )
                else:
                    repair_project_topic(bundle)
            else:
                repair_standard_topic(bundle)

            write_json(bundle_path, bundle)


if __name__ == "__main__":
    main()
