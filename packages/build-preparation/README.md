# @zoeskoul/build-preparation

Pure, provider-neutral preparation planning for ZoeBuild source versions.

## Responsibilities

- Resolve the registered stack/template pair for a saved project.
- Inspect dependency-lock state without running a package manager.
- Allow generate-once lock bootstrap only while the dependency manifest still
  matches the controlled registered template.
- Derive the trusted install/build commands and publishable artifact location
  from the stack registry.
- Fail closed for malformed workspaces, unsupported dependency manifests, or
  inconsistent stack/template contracts.

## Non-responsibilities

This package never executes commands, installs packages, starts containers,
talks to cloud providers, publishes artifacts, or mutates CodeProject source.
