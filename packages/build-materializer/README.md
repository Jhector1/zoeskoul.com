# @zoeskoul/build-materializer

Pure ZoeBuild template-to-workspace materialization.

This package validates stack/specification/template bindings, rejects unsafe
or ambiguous paths, and converts controlled templates into the canonical
WorkspaceStateV2 shape used by Zoéskoul projects.

It performs no persistence, package installation, AI generation, sandbox
execution, network access, or provider provisioning.
