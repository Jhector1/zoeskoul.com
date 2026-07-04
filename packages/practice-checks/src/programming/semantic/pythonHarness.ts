import type { SemanticCheck } from "../types.js";

export const SEMANTIC_HARNESS_SENTINEL = "__ZOE_SEMANTIC_RESULT__";

export type SemanticHarnessResult =
    | {
        ok: true;
        userStdout?: string;
    }
    | {
        ok: false;
        errors: string[];
        userStdout?: string;
    };

export function buildPythonSemanticHarness(args: {
    userCode: string;
    semanticChecks: SemanticCheck[];
    semanticModuleNames?: string[];
}): string {
    const userCodeJson = JSON.stringify(args.userCode ?? "");
    const checksJson = JSON.stringify(args.semanticChecks ?? []);
    const modulesJson = JSON.stringify(args.semanticModuleNames ?? []);

    const userCodeJsonStringLiteral = JSON.stringify(userCodeJson);
    const checksJsonStringLiteral = JSON.stringify(checksJson);
    const modulesJsonStringLiteral = JSON.stringify(modulesJson);
    return `
import contextlib
import importlib
import inspect
import io
import json
import re

_SENTINEL = ${JSON.stringify(SEMANTIC_HARNESS_SENTINEL)}
_USER_CODE = json.loads(${userCodeJsonStringLiteral})
_CHECKS = json.loads(${checksJsonStringLiteral})
_SEMANTIC_MODULE_NAMES = json.loads(${modulesJsonStringLiteral})

_user_stdout_buffer = io.StringIO()
_env = {"__name__": "__main__"}
_errors = []

def _semantic_public_symbols(module):
    for name, value in vars(module).items():
        if name.startswith("_"):
            continue
        if isinstance(value, type) or callable(value):
            _env.setdefault(name, value)

def _preload_semantic_modules():
    for module_name in _SEMANTIC_MODULE_NAMES:
        if not isinstance(module_name, str) or not module_name:
            continue
        try:
            _semantic_public_symbols(importlib.import_module(module_name))
        except BaseException:
            # Normal execution/checks will still report a useful failure.
            pass

def _call_with_captured_stdout(callable_value, args):
    with contextlib.redirect_stdout(_user_stdout_buffer):
        return callable_value(*list(args or []))
def _fail(message):
    _errors.append(str(message))
def _decode_dict_entries(value):
    if isinstance(value, dict):
        return value

    if not isinstance(value, list):
        raise AssertionError("Expected dictionary entries to be a list of [key, value] pairs.")

    result = {}

    for pair in value:
        if not isinstance(pair, list) or len(pair) != 2:
            raise AssertionError("Each dictionary entry must be [key, value].")
        result[pair[0]] = pair[1]

    return result

def _decode_list_of_dict_entries(value):
    if not isinstance(value, list):
        raise AssertionError("Expected a list of dictionary entries.")

    return [_decode_dict_entries(item) for item in value]

def _semantic_class_names():
    names = []

    for check in _CHECKS:
        class_name = check.get("className")

        if isinstance(class_name, str) and class_name and class_name not in names:
            names.append(class_name)

    return names

def _infer_single_semantic_class_name():
    names = _semantic_class_names()

    if len(names) == 1:
        return names[0]

    class_names = []

    for name, value in _env.items():
        if isinstance(value, type) and not name.startswith("_"):
            if name not in class_names:
                class_names.append(name)

    return class_names[0] if len(class_names) == 1 else None

def _constructor_param_names(cls):
    try:
        signature = inspect.signature(cls.__init__)
    except Exception:
        return []

    allowed_kinds = {
        inspect.Parameter.POSITIONAL_ONLY,
        inspect.Parameter.POSITIONAL_OR_KEYWORD,
        inspect.Parameter.KEYWORD_ONLY,
    }

    return [
        name
        for name, parameter in signature.parameters.items()
        if name != "self" and parameter.kind in allowed_kinds
    ]

def _pascal_case(value):
    return "".join(part[:1].upper() + part[1:] for part in re.split(r"[_\s-]+", str(value)) if part)

def _infer_class_name_from_dict(value):
    if not isinstance(value, dict):
        return None

    for key in ["class", "className", "type"]:
        raw = value.get(key)
        if isinstance(raw, str) and _get_class(raw) is not None:
            return raw

    kind = value.get("kind")
    if isinstance(kind, str):
        base = _pascal_case(kind)
        for candidate in [base, f"{base}Task", f"{base}Item"]:
            if _get_class(candidate) is not None:
                return candidate

    # Last resort for semantic fixture dictionaries that omit a discriminator:
    # choose a loaded class whose constructor parameter names are all present.
    for name, candidate in list(_env.items()):
        if not isinstance(candidate, type) or name.startswith("_"):
            continue
        params = _constructor_param_names(candidate)
        if params and all(param in value for param in params):
            return name

    return None

def _coerce_dict_to_instance(value, class_name):
    if not isinstance(value, dict):
        return value

    resolved_class_name = class_name or _infer_class_name_from_dict(value)
    if not resolved_class_name:
        return value

    cls = _get_class(resolved_class_name)

    if cls is None:
        return value

    params = _constructor_param_names(cls)

    if not params or not all(name in value for name in params):
        return value

    args = [value[name] for name in params]
    return _call_with_captured_stdout(cls, args)

def _group_repeated_dict_entries_for_plural_constructor_arg(items, cls):
    if not items:
        return items

    params = _constructor_param_names(cls)

    if not params:
        return items

    if not all(isinstance(item, dict) for item in items):
        return items

    if not all(all(param in item for param in params) for item in items):
        return items

    # Handles generated checks like:
    # [{"name": "Ava", "scores": 8}, {"name": "Ava", "scores": 9}]
    # for a constructor Student(name, scores), where the real object should be:
    # Student("Ava", [8, 9])
    candidate_list_fields = [
        param
        for param in params
        if param.endswith("s") and not isinstance(items[0].get(param), list)
    ]

    for list_field in candidate_list_fields:
        key_fields = [param for param in params if param != list_field]

        if not key_fields:
            continue

        groups = []
        by_key = {}

        for item in items:
            key = tuple(item.get(field) for field in key_fields)

            if key not in by_key:
                grouped = {field: item.get(field) for field in key_fields}
                grouped[list_field] = []
                by_key[key] = grouped
                groups.append(grouped)

            by_key[key][list_field].append(item.get(list_field))

        # Only group when grouping actually reduces repeated rows.
        # Otherwise a normal list of object dictionaries should stay one object per row.
        if len(groups) < len(items):
            return groups

    return items

def _coerce_list_of_dicts_to_instances(value, class_name):
    if not isinstance(value, list):
        return value

    cls = _get_class(class_name) if class_name else None

    grouped_value = value
    if cls is not None:
        grouped_value = _group_repeated_dict_entries_for_plural_constructor_arg(value, cls)

    return [_coerce_dict_to_instance(item, class_name) for item in grouped_value]

def _decode_value(value, kind, class_name=None):
    if kind == "dict_entries":
        decoded = _decode_dict_entries(value)
        return _coerce_dict_to_instance(decoded, class_name)

    if kind == "list_of_dict_entries":
        decoded = _decode_list_of_dict_entries(value)
        return _coerce_list_of_dicts_to_instances(decoded, class_name)

    return value


def _looks_like_key_value_entries(value):
    return (
        isinstance(value, list)
        and len(value) > 0
        and all(isinstance(item, list) and len(item) == 2 for item in value)
    )

def _looks_like_single_wrapped_primitive_list(value):
    return (
        isinstance(value, list)
        and len(value) == 1
        and isinstance(value[0], list)
        and not _looks_like_key_value_entries(value[0])
    )

def _decode_args(args, kinds, class_name=None):
    args = list(args or [])
    kinds = list(kinds or [])

    decoded = []

    for index, value in enumerate(args):
        kind = kinds[index] if index < len(kinds) else None

        # Some generated semantic checks accidentally encode a single list
        # argument with one extra array layer:
        #   args: [[["Study Report", "Completed: 2/3"]]]
        # The learner function expects:
        #   validate_report(["Study Report", "Completed: 2/3"])
        #
        # This also protects against an incorrect argKind such as dict_entries
        # on a plain list-of-lines argument.
        if _looks_like_single_wrapped_primitive_list(value):
            decoded.append(value[0])
            continue

        decoded.append(_decode_value(value, kind, class_name))

    return decoded

def _object_to_expected_dict(value, expected):
    if not isinstance(expected, dict):
        return value

    if isinstance(value, dict):
        return {
            key: value.get(key)
            for key in expected.keys()
        }

    return {
        key: getattr(value, key, None)
        for key in expected.keys()
    }

def _normalize_actual_for_expected(actual, expected):
    if isinstance(expected, dict):
        return _object_to_expected_dict(actual, expected)

    if isinstance(expected, list):
        if not isinstance(actual, (list, tuple)):
            return actual

        if len(actual) != len(expected):
            return actual

        return [
            _normalize_actual_for_expected(actual_item, expected_item)
            for actual_item, expected_item in zip(actual, expected)
        ]

    return actual

def _unwrap_singleton_primitive_expected(value):
    if (
        isinstance(value, list)
        and len(value) == 1
        and not isinstance(value[0], (dict, list, tuple, set))
    ):
        return value[0]
    return value

def _semantic_equal(actual, expected):
    expected = _unwrap_singleton_primitive_expected(expected)
    normalized_actual = _normalize_actual_for_expected(actual, expected)
    return normalized_actual == expected


def _get_class(class_name):
    value = _env.get(class_name)
    if not isinstance(value, type):
        return None
    return value

def _make_instance(class_name, args):
    cls = _get_class(class_name)
    if cls is None:
        raise AssertionError(f"Define a class named {class_name}.")
    return _call_with_captured_stdout(cls, args)

def _count_instances_in_value(value, cls, seen):
    value_id = id(value)

    if value_id in seen:
        return 0

    seen.add(value_id)

    try:
        if isinstance(value, cls):
            return 1
    except Exception:
        return 0

    if isinstance(value, dict):
        total = 0

        for item in value.values():
            total += _count_instances_in_value(item, cls, seen)

        return total

    if isinstance(value, (list, tuple, set, frozenset)):
        total = 0

        for item in value:
            total += _count_instances_in_value(item, cls, seen)

        return total

    return 0

def _get_function(function_name):
    value = _env.get(function_name)
    if callable(value) and not isinstance(value, type):
        return value
    return None
try:
    _preload_semantic_modules()
    with contextlib.redirect_stdout(_user_stdout_buffer):
        exec(_USER_CODE, _env, _env)
    _preload_semantic_modules()
except BaseException as exc:
    print(_SENTINEL + json.dumps({
        "ok": False,
        "errors": [f"Your program crashed before it could be checked: {type(exc).__name__}: {exc}"],
        "userStdout": _user_stdout_buffer.getvalue(),
    }, ensure_ascii=False))
    raise SystemExit(0)

for check in _CHECKS:
    ctype = check.get("type")

    try:
        if ctype == "function_returns":
            function_name = check.get("functionName")
            inferred_class_name = _infer_single_semantic_class_name()
            function_args = _decode_args(
                check.get("args") or [],
                check.get("argKinds") or [],
                inferred_class_name,
            )
            expected = _decode_value(check.get("expected"), check.get("expectedKind"))

            fn = _get_function(function_name)

            if fn is None:
                _fail(check.get("message") or f"Define a function named {function_name}.")
            else:
                actual = _call_with_captured_stdout(fn, function_args)
                if not _semantic_equal(actual, expected):
                    _fail(
                        check.get("message")
                        or f"{function_name}() should return {expected!r}, but got {actual!r}."
                    )

        elif ctype == "defines_class":
            class_name = check.get("className")
            if _get_class(class_name) is None:
                _fail(check.get("message") or f"Define a class named {class_name}.")
        elif ctype == "no_stdout":
            printed = _user_stdout_buffer.getvalue().strip()
            if printed:
                _fail(
                    check.get("message")
                    or "This task should return a value instead of printing output."
                )
        elif ctype == "constructible":
            class_name = check.get("className")
            constructor_args = check.get("constructorArgs") or []
            _make_instance(class_name, constructor_args)

        elif ctype == "instance_attributes":
            class_name = check.get("className")
            constructor_args = check.get("constructorArgs") or []
            attrs = check.get("attributes") or []

            instance = _make_instance(class_name, constructor_args)

            for attr in attrs:
                if not hasattr(instance, attr):
                    _fail(check.get("message") or f"Instances should have a {attr!r} attribute.")

        elif ctype == "method_returns":
            class_name = check.get("className")
            method_name = check.get("methodName")
            
            constructor_args = _decode_args(
                check.get("constructorArgs") or [],
                check.get("constructorArgKinds") or [],
                class_name,
            )
            method_args = _decode_args(
                check.get("methodArgs") or [],
                check.get("methodArgKinds") or [],
                class_name,
            )
            expected = _decode_value(check.get("expected"), check.get("expectedKind"))
            instance = _make_instance(class_name, constructor_args)

            if not hasattr(instance, method_name):
                _fail(check.get("message") or f"Add a method named {method_name}.")
            else:
                method = getattr(instance, method_name)
                if not callable(method):
                    _fail(check.get("message") or f"{method_name} should be a method.")
                else:
                    actual = _call_with_captured_stdout(method, method_args)
                    if not _semantic_equal(actual, expected):
                        _fail(
                            check.get("message")
                            or f"{method_name}() should return {expected!r}, but got {actual!r}."
                        )

        elif ctype == "method_sequence_returns":
            class_name = check.get("className")
            method_name = check.get("methodName")

            constructor_args = _decode_args(
                check.get("constructorArgs") or [],
                check.get("constructorArgKinds") or [],
                class_name,
            )
            instance = _make_instance(class_name, constructor_args)

            for call in check.get("calls") or []:
                call_method_name = call.get("methodName")
                call_args = _decode_args(
                    call.get("methodArgs") or [],
                    call.get("methodArgKinds") or [],
                    class_name,
                )

                if not hasattr(instance, call_method_name):
                    _fail(check.get("message") or f"Add a method named {call_method_name}.")
                    break

                call_method = getattr(instance, call_method_name)
                if not callable(call_method):
                    _fail(check.get("message") or f"{call_method_name} should be a method.")
                    break

                _call_with_captured_stdout(call_method, call_args)

            method_args = _decode_args(
                check.get("methodArgs") or [],
                check.get("methodArgKinds") or [],
                class_name,
            )
            expected = _decode_value(check.get("expected"), check.get("expectedKind"))

            if not hasattr(instance, method_name):
                _fail(check.get("message") or f"Add a method named {method_name}.")
            else:
                method = getattr(instance, method_name)
                if not callable(method):
                    _fail(check.get("message") or f"{method_name} should be a method.")
                else:
                    actual = _call_with_captured_stdout(method, method_args)
                    if not _semantic_equal(actual, expected):
                        _fail(
                            check.get("message")
                            or f"After the method calls, {method_name}() should return {expected!r}, but got {actual!r}."
                        )

        elif ctype == "attribute_sequence_equals":
            class_name = check.get("className")
            attribute_name = check.get("attributeName")

            constructor_args = _decode_args(
                check.get("constructorArgs") or [],
                check.get("constructorArgKinds") or [],
                class_name,
            )
            instance = _make_instance(class_name, constructor_args)

            for call in check.get("calls") or []:
                call_method_name = call.get("methodName")
                call_args = _decode_args(
                    call.get("methodArgs") or [],
                    call.get("methodArgKinds") or [],
                    class_name,
                )

                if not hasattr(instance, call_method_name):
                    _fail(check.get("message") or f"Add a method named {call_method_name}.")
                    break

                call_method = getattr(instance, call_method_name)
                if not callable(call_method):
                    _fail(check.get("message") or f"{call_method_name} should be a method.")
                    break

                _call_with_captured_stdout(call_method, call_args)

            expected = _decode_value(check.get("expected"), check.get("expectedKind"))

            if not hasattr(instance, attribute_name):
                _fail(check.get("message") or f"Instances should have a {attribute_name!r} attribute.")
            else:
                actual = getattr(instance, attribute_name)
                if not _semantic_equal(actual, expected):
                    _fail(
                        check.get("message")
                        or f"After the method calls, {attribute_name} should be {expected!r}, but got {actual!r}."
                    )

        elif ctype == "created_instances":
            class_name = check.get("className")
            min_count = int(check.get("min") or 1)
            cls = _get_class(class_name)

            if cls is None:
                _fail(check.get("message") or f"Define a class named {class_name}.")
            else:
                seen = set()
                count = 0

                for value in list(_env.values()):
                    count += _count_instances_in_value(value, cls, seen)

                if count < min_count:
                    _fail(
                        check.get("message")
                        or f"Create at least {min_count} instance(s) of {class_name}."
                    )

        elif ctype == "printed_line_count":
            min_count = int(check.get("min") or 1)
            lines = [
                line.strip()
                for line in _user_stdout_buffer.getvalue().splitlines()
                if line.strip()
            ]

            if len(lines) < min_count:
                _fail(
                    check.get("message")
                    or f"Print at least {min_count} non-empty line(s)."
                )

        else:
            _fail(f"Unsupported semantic check type: {ctype}")

    except BaseException as exc:
        _fail(check.get("message") or f"Semantic check failed: {type(exc).__name__}: {exc}")

print(_SENTINEL + json.dumps({
    "ok": len(_errors) == 0,
    "errors": _errors,
    "userStdout": _user_stdout_buffer.getvalue(),
}, ensure_ascii=False))
`.trimStart();
}

export function parseSemanticHarnessResult(stdout: string): SemanticHarnessResult | null {
    const lines = String(stdout ?? "").split(/\r?\n/);
    const line = [...lines].reverse().find((value) =>
        value.startsWith(SEMANTIC_HARNESS_SENTINEL),
    );

    if (!line) return null;

    try {
        const parsed = JSON.parse(line.slice(SEMANTIC_HARNESS_SENTINEL.length)) as unknown;
        if (!parsed || typeof parsed !== "object") return null;

        const value = parsed as {
            ok?: unknown;
            errors?: unknown;
            userStdout?: unknown;
        };

        if (value.ok === true) {
            return {
                ok: true,
                userStdout:
                    typeof value.userStdout === "string" ? value.userStdout : undefined,
            };
        }

        if (value.ok === false) {
            return {
                ok: false,
                errors: Array.isArray(value.errors)
                    ? value.errors.map((error) => String(error)).filter(Boolean)
                    : [],
                userStdout:
                    typeof value.userStdout === "string" ? value.userStdout : undefined,
            };
        }

        return null;
    } catch {
        return null;
    }
}
