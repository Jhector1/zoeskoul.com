# Tool presentation policy

`ToolPresentationPolicy` controls how the learner Tools workspace opens. It is
presentation-only; it does not change the runtime, dataset, exercise contract,
or whether an answer is correct.

## Authoring hierarchy

Policies may be authored at these scopes, from broadest to most specific:

1. blueprint / subject defaults
2. course
3. module
4. section
5. topic
6. lesson/card
7. exercise

The compiler merges policies property by property. A missing child property
inherits its parent value. A child `sqlPane` object only overrides the SQL-pane
properties it contains.

The compiler resolves subject through topic inheritance before emitting a topic
bundle. Lesson and exercise policies remain sparse overrides in the bundle.
The learner runtime reads only the topic bundle and its parent subject manifest;
it does not reopen authoring files.

## Outer surface and inner SQL tab

These are separate controls:

```json
{
  "tools": {
    "defaultSurface": "results",
    "compactDefaultSurface": "results",
    "sqlPane": {
      "defaultTab": "erd",
      "compactDefaultTab": "results"
    }
  }
}
```

- `defaultSurface`: `editor` or `results` on the full layout.
- `compactDefaultSurface`: responsive override for the outer surface.
- `sqlPane.defaultTab`: `results`, `tables`, `erd`, or `chen` inside Results.
- `sqlPane.compactDefaultTab`: responsive override for the inner SQL tab.

A hands-on SQL lesson should normally use `defaultSurface: "editor"`. A theory
lesson that asks learners to inspect data or relationships can use the Results
surface with Tables or ERD selected.

## Topic with lesson and exercise overrides

```json
{
  "tools": {
    "defaultVisible": true,
    "allowOpen": true,
    "defaultSurface": "editor",
    "compactDefaultSurface": "results",
    "sqlPane": {
      "showResults": true,
      "showTables": true,
      "showErd": true,
      "showChen": false
    }
  },
  "lessonTools": {
    "sketch0": {
      "defaultSurface": "results",
      "sqlPane": {
        "defaultTab": "tables",
        "compactDefaultTab": "results"
      }
    },
    "sketch1": {
      "defaultSurface": "results",
      "sqlPane": {
        "defaultTab": "erd",
        "compactDefaultTab": "results"
      }
    }
  },
  "exerciseTools": {
    "try-inner-join": {
      "defaultSurface": "editor"
    }
  }
}
```

Lesson overrides may be keyed by the authored sketch id or emitted card id.
Exercise overrides are keyed by authored exercise id.

## Runtime behavior

- Opening, refreshing, or changing lesson/exercise identity applies its resolved
  default once.
- A learner's manual Editor/Results and SQL-tab choices remain stable during the
  same lesson or exercise.
- Running SQL may bring Results forward to show the new output.
- Compact defaults do not remove Tables or ERD; they only select the initial tab.
- Older bundles that authored only `sqlPane.defaultTab` remain compatible, but
  new authoring should always set `defaultSurface` explicitly.
