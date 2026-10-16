# @zoeskoul/build-executor-contracts

Provider-neutral, shell-free contracts for trusted ZoeBuild executor jobs.

Security invariants:
- callers select an operation name, never argv/shell/cwd/env/image/network;
- V300I supports only `dependency-lock-bootstrap`;
- the runner owns the exact command and allowed outputs;
- V300I validates contracts only and executes nothing.
