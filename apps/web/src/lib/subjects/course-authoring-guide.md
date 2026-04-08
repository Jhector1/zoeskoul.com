# Course Authoring Guide

This guide explains how to create a new course, module, and topic in the manifest system.

## 1. Create a New Course (Subject)

### Step 1: Create the folder

```text
src/lib/subjects/python/
```

### Step 2: Create `subject.manifest.json`

```json
{
  "subject": {
    "slug": "python",
    "genKey": "python_for_beginners",
    "order": 30,
    "accessPolicy": "free",
    "status": "active",
    "titleKey": "subjects.python.title",
    "descriptionKey": "subjects.python.description"
  },
  "modules": []
}
```

## 2. Add a Module

Inside `subject.manifest.json`:

```json
{
  "slug": "python_module_0",
  "prefix": "py0",
  "order": 0,
  "titleKey": "modules.python.python_module_0.title",
  "descriptionKey": "modules.python.python_module_0.description",
  "weekStart": 1,
  "weekEnd": 1,
  "accessOverride": "free",
  "meta": {
    "estimatedMinutes": 45,
    "prereqKeys": [],
    "outcomeKeys": [],
    "whyKeys": []
  },
  "sections": []
}
```

## 3. Add a Section

```json
{
  "slug": "section_0_1",
  "order": 1,
  "titleKey": "sections.python.python_module_0.section_0_1.title",
  "descriptionKey": "sections.python.python_module_0.section_0_1.description",
  "meta": {
    "module": 0,
    "weeksKey": "sections.python.python_module_0.section_0_1.weeks",
    "bulletKeys": []
  },
  "topics": ["what_python_is"]
}
```

## 4. Add a Topic

### Folder

```text
modules/module0/topics/what_python_is/
```

### `topic.bundle.json`

```json
{
  "topicId": "what_python_is",
  "minutes": 8,
  "topic": {
    "labelKey": "topics.python.python_module_0.what_python_is.label",
    "summaryKey": "topics.python.python_module_0.what_python_is.summary"
  },
  "cards": [],
  "sketches": [],
  "exercises": []
}
```

## 5. Add Content

Add message files such as:

```text
src/i18n/messages/en/topics/python/...
```

You will usually add keys for:

- subject title/description
- module title/description
- section title/description
- topic label/summary
- sketch titles and body markdown
- exercise prompts and hints

## 6. Add Exercises

Example single-choice exercise:

```json
{
  "id": "basic_question",
  "kind": "single_choice",
  "purpose": "quiz",
  "weight": 1,
  "messageBase": "quiz.python.q1",
  "optionIds": ["a", "b", "c"],
  "expected": {
    "kind": "single_choice",
    "optionId": "a"
  }
}
```

## 7. Add a Sketch

```json
{
  "id": "intro",
  "archetype": "paragraph",
  "titleKey": "sketches.python.python_module_0.what_python_is.intro.title",
  "bodyKey": "sketches.python.python_module_0.what_python_is.intro.bodyMarkdown"
}
```

## 8. Generate Registries

```bash
pnpm gen:manifests
```

## 9. Hook into the Subject Generator

Create a subject engine such as:

```ts
import type { TopicContext } from "../../generatorTypes";
import type { SubjectModuleGenerator } from "@/lib/practice/generator/engines/utils";

import subjectManifest from "@/lib/subjects/python/subject.manifest.json";
import { TOPIC_MANIFESTS } from "@/lib/subjects/python/topics.generated";
import { makeSubjectGeneratorFromManifest } from "@/lib/practice/generator/engines/json/makeSubjectGeneratorFromManifest";

export function makeGenPythonForBeginners(
  ctx: TopicContext,
): SubjectModuleGenerator {
  return makeSubjectGeneratorFromManifest({
    manifest: subjectManifest,
    topicManifests: TOPIC_MANIFESTS,
    ctx,
  });
}
```

Then register that generator under the same `genKey` used by the subject manifest.

## 10. Add Messages

Define i18n keys for:

- `subjects.*`
- `modules.*`
- `sections.*`
- `topics.*`
- `sketches.*`
- `quiz.*`

## 11. Run the App

```bash
pnpm dev
```

## Rules

### Keep manifests clean

Do not put these into manifests:

- DB data
- user state
- access logic
- enrollment state
- progress

### Keep copy in message files

Do not hardcode large user-facing strings in manifests.

### IDs must be stable

Changing any of these can break routing, registries, and generator resolution:

- `subject.slug`
- `module.slug`
- `section.slug`
- `topicId`
- `prefix`

## Workflow

### Add a topic
```bash
pnpm gen:topic-manifests --subject python
```

### Add a subject
```bash
pnpm gen:subject-manifests
```

### Not sure
```bash
pnpm gen:manifests
```

## Advanced

### Teacher Mode

Teacher mode should live in the DB as an overlay layer.  
It should not replace the manifest system.

### Catalog

Catalog should also live in the DB and reference `subjectSlug`.  
It should not redefine course structure.

## Summary

```text
Create subject → add modules → add sections → add topics → add messages → generate → done
```

You now have a full course system ready to scale.
