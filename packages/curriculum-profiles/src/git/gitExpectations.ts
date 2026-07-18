import {
    type HiddenShellCheck,
    normalizeGitExpectations,
} from "@zoeskoul/curriculum-contracts";

function shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function failLine(message: string): string {
    return `fail ${shellQuote(message)}`;
}

function messageOr(defaultMessage: string, message?: string): string {
    return message?.trim() || defaultMessage;
}

export function buildGitExpectationsHiddenShellCheck(
    value: unknown,
): HiddenShellCheck | undefined {
    const expectations = normalizeGitExpectations(
        value,
        "Invalid Git gitExpectations",
    );
    if (!expectations) return undefined;

    const repo = expectations.repositoryPath ?? ".";
    const lines: string[] = [
        "set -eu",
        `repo=${shellQuote(repo)}`,
        'fail() { printf "%s\\n" "$1" >&2; exit 1; }',
        'command -v git >/dev/null 2>&1 || fail "Git is not available in this workspace."',
    ];

    if (expectations.repositoryInitialized === false) {
        lines.push(
            'if git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then',
            `  ${failLine(`Expected ${repo} not to be a Git repository yet.`)}`,
            "fi",
        );

        return {
            script: lines.join("\n"),
            timeoutMs: 15_000,
        };
    }

    lines.push(
        'git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1 || ' +
            failLine(`Initialize a Git repository in ${repo}.`),
    );

    if (expectations.currentBranch) {
        lines.push(
            'actual_branch=$(git -C "$repo" branch --show-current 2>/dev/null || true)',
            `[ "$actual_branch" = ${shellQuote(expectations.currentBranch)} ] || ${failLine(
                `Switch to the ${expectations.currentBranch} branch.`,
            )}`,
        );
    }

    if (typeof expectations.cleanWorkingTree === "boolean") {
        lines.push(
            'status_output=$(git -C "$repo" status --porcelain --untracked-files=all)',
        );
        if (expectations.cleanWorkingTree) {
            lines.push(
                `[ -z "$status_output" ] || ${failLine(
                    "Commit, restore, or remove the remaining workspace changes so the working tree is clean.",
                )}`,
            );
        } else {
            lines.push(
                `[ -n "$status_output" ] || ${failLine(
                    "Make the requested repository change before checking the task.",
                )}`,
            );
        }
    }

    if (
        typeof expectations.minimumCommitCount === "number" ||
        typeof expectations.exactCommitCount === "number"
    ) {
        lines.push(
            'if git -C "$repo" rev-parse --verify HEAD >/dev/null 2>&1; then',
            '  commit_count=$(git -C "$repo" rev-list --count HEAD)',
            "else",
            "  commit_count=0",
            "fi",
        );
    }

    if (typeof expectations.minimumCommitCount === "number") {
        lines.push(
            `[ "$commit_count" -ge ${expectations.minimumCommitCount} ] || ${failLine(
                `Create at least ${expectations.minimumCommitCount} commit(s).`,
            )}`,
        );
    }

    if (typeof expectations.exactCommitCount === "number") {
        lines.push(
            `[ "$commit_count" -eq ${expectations.exactCommitCount} ] || ${failLine(
                `The repository must contain exactly ${expectations.exactCommitCount} commit(s).`,
            )}`,
        );
    }

    for (const path of expectations.trackedFiles ?? []) {
        lines.push(
            `git -C "$repo" ls-files --error-unmatch -- ${shellQuote(path)} >/dev/null 2>&1 || ${failLine(
                `Track ${path} with Git.`,
            )}`,
        );
    }

    for (const path of expectations.untrackedFiles ?? []) {
        lines.push(
            `git -C "$repo" ls-files --others --exclude-standard -- ${shellQuote(path)} | grep -Fxq -- ${shellQuote(path)} || ${failLine(
                `Leave ${path} untracked.`,
            )}`,
        );
    }

    for (const path of expectations.ignoredFiles ?? []) {
        lines.push(
            `git -C "$repo" check-ignore -q -- ${shellQuote(path)} || ${failLine(
                `Configure .gitignore so Git ignores ${path}.`,
            )}`,
        );
    }

    for (const path of expectations.forbiddenTrackedFiles ?? []) {
        lines.push(
            `if git -C "$repo" ls-files --error-unmatch -- ${shellQuote(path)} >/dev/null 2>&1; then`,
            `  ${failLine(`Do not track ${path}.`)}`,
            "fi",
        );
    }

    for (const branch of expectations.requiredBranches ?? []) {
        lines.push(
            `git -C "$repo" show-ref --verify --quiet ${shellQuote(`refs/heads/${branch}`)} || ${failLine(
                `Create the ${branch} branch.`,
            )}`,
        );
    }

    for (const branch of expectations.forbiddenBranches ?? []) {
        lines.push(
            `if git -C "$repo" show-ref --verify --quiet ${shellQuote(`refs/heads/${branch}`)}; then`,
            `  ${failLine(`Remove the ${branch} branch.`)}`,
            "fi",
        );
    }

    for (const expectation of expectations.commitMessages ?? []) {
        const position = expectation.position ?? 0;
        const commitLabel =
            position === 0 ? "HEAD" : `the commit at position ${position}`;
        lines.push(
            `git -C "$repo" rev-parse --verify ${shellQuote(`HEAD~${position}^{commit}`)} >/dev/null 2>&1 || ${failLine(
                messageOr(
                    `Create ${commitLabel} before checking its message.`,
                    expectation.message,
                ),
            )}`,
            `commit_subject=$(git -C "$repo" log -1 --skip=${position} --pretty=%s)`,
            `printf '%s\\n' "$commit_subject" | grep -Eq -- ${shellQuote(expectation.matches)} || ${failLine(
                messageOr(
                    `Commit ${position === 0 ? "HEAD" : `at position ${position}`} must have the expected message.`,
                    expectation.message,
                ),
            )}`,
        );
    }

    if ((expectations.headFiles ?? []).length > 0) {
        lines.push(
            "tmp_dir=$(mktemp -d)",
            'trap \'rm -rf "$tmp_dir"\' EXIT HUP INT TERM',
        );
    }

    (expectations.headFiles ?? []).forEach((expectation, index) => {
        const actualPath = `$tmp_dir/head-file-${index}.actual`;
        lines.push(
            `git -C "$repo" show ${shellQuote(`HEAD:${expectation.path}`)} > "${actualPath}" 2>/dev/null || ${failLine(
                messageOr(
                    `Commit ${expectation.path} before checking the task.`,
                    expectation.message,
                ),
            )}`,
        );

        if (typeof expectation.equals === "string") {
            const expectedPath = `$tmp_dir/head-file-${index}.expected`;
            lines.push(
                `printf '%s' ${shellQuote(expectation.equals)} > "${expectedPath}"`,
                `cmp -s "${actualPath}" "${expectedPath}" || ${failLine(
                    messageOr(
                        `${expectation.path} at HEAD does not match the required content.`,
                        expectation.message,
                    ),
                )}`,
            );
        } else if (expectation.contains) {
            lines.push(
                `grep -Fq -- ${shellQuote(expectation.contains)} "${actualPath}" || ${failLine(
                    messageOr(
                        `${expectation.path} at HEAD is missing required content.`,
                        expectation.message,
                    ),
                )}`,
            );
        }
    });

    for (const remote of expectations.remotes ?? []) {
        lines.push(
            `remote_url=$(git -C "$repo" remote get-url -- ${shellQuote(remote.name)} 2>/dev/null || true)`,
            `[ -n "$remote_url" ] || ${failLine(
                messageOr(
                    `Add the ${remote.name} remote.`,
                    remote.message,
                ),
            )}`,
        );

        if (remote.urlContains) {
            lines.push(
                `printf '%s\\n' "$remote_url" | grep -Fq -- ${shellQuote(remote.urlContains)} || ${failLine(
                    messageOr(
                        `The ${remote.name} remote must point to the expected repository.`,
                        remote.message,
                    ),
                )}`,
            );
        }

        for (const branch of remote.requiredBranches ?? []) {
            lines.push(
                `git -C "$repo" ls-remote --exit-code --heads -- ${shellQuote(remote.name)} ${shellQuote(`refs/heads/${branch}`)} >/dev/null 2>&1 || ${failLine(
                    messageOr(
                        `Push the ${branch} branch to ${remote.name}.`,
                        remote.message,
                    ),
                )}`,
            );
        }
    }

    return {
        script: lines.join("\n"),
        timeoutMs: 15_000,
    };
}
