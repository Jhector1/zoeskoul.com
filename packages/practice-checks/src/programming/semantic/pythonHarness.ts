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
}): string {
    const userCodeJson = JSON.stringify(args.userCode ?? "");
    const checksJson = JSON.stringify(args.semanticChecks ?? []);

    const userCodeJsonStringLiteral = JSON.stringify(userCodeJson);
    const checksJsonStringLiteral = JSON.stringify(checksJson);
    return `
import contextlib
import io
import json

_SENTINEL = ${JSON.stringify(SEMANTIC_HARNESS_SENTINEL)}
_USER_CODE = json.loads(${userCodeJsonStringLiteral})
_CHECKS = json.loads(${checksJsonStringLiteral})

_user_stdout_buffer = io.StringIO()
_env = {"__name__": "__main__"}
_errors = []
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
def _decode_value(value, kind):
    if kind == "dict_entries":
        return _decode_dict_entries(value)

    if kind == "list_of_dict_entries":
        return _decode_list_of_dict_entries(value)

    return value


def _decode_args(args, kinds):
    args = list(args or [])
    kinds = list(kinds or [])

    decoded = []

    for index, value in enumerate(args):
        kind = kinds[index] if index < len(kinds) else None
        decoded.append(_decode_value(value, kind))

    return decoded
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
def _get_function(function_name):
    value = _env.get(function_name)
    if callable(value) and not isinstance(value, type):
        return value
    return None
try:
    with contextlib.redirect_stdout(_user_stdout_buffer):
        exec(_USER_CODE, _env, _env)
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
            function_args = _decode_args(check.get("args") or [], check.get("argKinds") or [])
            expected = _decode_value(check.get("expected"), check.get("expectedKind"))

            fn = _get_function(function_name)

            if fn is None:
                _fail(check.get("message") or f"Define a function named {function_name}.")
            else:
                actual = _call_with_captured_stdout(fn, function_args)
                if actual != expected:
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
            )
            method_args = _decode_args(
                check.get("methodArgs") or [],
                check.get("methodArgKinds") or [],
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
                    if actual != expected:
                        _fail(
                            check.get("message")
                            or f"{method_name}() should return {expected!r}, but got {actual!r}."
                        )

        elif ctype == "created_instances":
            class_name = check.get("className")
            min_count = int(check.get("min") or 1)
            cls = _get_class(class_name)

            if cls is None:
                _fail(check.get("message") or f"Define a class named {class_name}.")
            else:
                count = 0
                for value in _env.values():
                    try:
                        if isinstance(value, cls):
                            count += 1
                    except Exception:
                        pass

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
