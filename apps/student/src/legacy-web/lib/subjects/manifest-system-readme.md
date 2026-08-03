# ZoeSkoul Manifest System

This project uses a **manifest-first architecture** to define courses, lessons, and exercises.

Instead of storing curriculum in the database, we define it as structured JSON files and generate runtime registries.

## Core Idea

- **manifest = curriculum truth**
- **db = runtime/product truth**

Manifests define **what the course is**.  
The database defines **what happens in the app**.

## Architecture Layers

### 1. Content Layer (Authoring)

- `subject.manifest.json`
- `topic.bundle.json`
- `messages/*.json`

This is where all course structure and content live.

### 2. Generated Layer (Auto-built)

Generated files, which should **not** be edited by hand:

- `messages.generated.ts`
- `subjects.generated.ts`
- `<subject>/topics.generated.ts`

These are built using scripts.

### 3. Builder Layer

Transforms manifests into runtime objects:

- `defineCourseFromManifest`
- `makeSubjectGeneratorFromManifest`

### 4. Presentation Layer

Server-side merging of:

- manifest content
- DB state

Examples:
- titles → manifest
- enrollment → DB
- access state → DB
- module/topic structure → manifest

### 5. Runtime Layer (DB)

Database stores:

- enrollments
- access control
- progress
- teacher overrides
- catalog state

## Generated Files

### `messages.generated.ts`
Global i18n loader registry.

### `subjects.generated.ts`
Registry of all subjects.

### `<subject>/topics.generated.ts`
Per-subject topic registry.

## Scripts

### Generate everything
```bash
pnpm gen:manifests
```

### Generate i18n
```bash
pnpm i18n:generate
```

### Generate subjects
```bash
pnpm gen:subject-manifests
```

### Generate topics (all)
```bash
pnpm gen:topic-manifests
```

### Generate topics for one subject
```bash
pnpm gen:topic-manifests --subject sql
```

### Validate one topic while rebuilding one subject registry
```bash
pnpm gen:topic-manifests --subject sql --topic text_matching
```

## Key Rules

### 1. Never edit generated files

Do not manually edit:

- `messages.generated.ts`
- `subjects.generated.ts`
- `topics.generated.ts`

### 2. Folder names must match IDs

- subject folder = `subject.slug`
- topic folder = `topicId`

### 3. Keep responsibilities separate

| Layer | Responsibility |
|---|---|
| Manifest | curriculum structure |
| DB | runtime + user state |
| UI | presentation |

## Mental Model

```text
subject (course)
  → modules
    → sections
      → topics
        → exercises
```

## Long-term Goal

- Add courses fast via manifests
- Support catalog + teacher mode via DB overlays
- Keep runtime logic clean and scalable

## Summary

```text
messages → UI copy
manifest → structure
generated → registry
builder → runtime objects
db → user + product state
```
