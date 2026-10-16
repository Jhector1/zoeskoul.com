import {
  describe,
  expect,
  it,
} from "vitest";

import {
  BUILD_CAPABILITIES,
  BUILD_COMMERCE_JSON_SCHEMA,
  BUILD_DEPLOYMENT_PREFERENCES,
  BUILD_PROJECT_TYPES,
  BUILD_STOREFRONT_RUNTIMES,
  BUILD_SPEC_LIMITS,
  BUILD_SPEC_VERSION,
  BUILD_TARGETS,
  PROJECT_SPECIFICATION_JSON_SCHEMA,
} from "./index";

describe("ProjectSpecification JSON Schema ownership", () => {
  it("stays aligned with canonical Build contract constants", () => {
    const schema =
      PROJECT_SPECIFICATION_JSON_SCHEMA;

    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);

    expect(
      schema.properties.version.enum,
    ).toEqual([BUILD_SPEC_VERSION]);

    expect(
      schema.properties.projectType.enum,
    ).toEqual([...BUILD_PROJECT_TYPES]);

    expect(
      schema.properties.targets.items.enum,
    ).toEqual([...BUILD_TARGETS]);

    expect(
      schema.properties.targets.minItems,
    ).toBe(1);

    expect(
      schema.properties.targets.maxItems,
    ).toBe(BUILD_TARGETS.length);

    expect(
      schema.properties.requirements.required,
    ).toEqual([...BUILD_CAPABILITIES]);

    expect(
      Object.keys(
        schema.properties.requirements.properties,
      ),
    ).toEqual([...BUILD_CAPABILITIES]);

    expect(
      schema.properties.pages.maxItems,
    ).toBe(BUILD_SPEC_LIMITS.pages);

    expect(
      schema.properties.deployment.properties
        .preference.enum,
    ).toEqual([...BUILD_DEPLOYMENT_PREFERENCES]);

    expect(
      schema.properties.commerce,
    ).toEqual({
      anyOf: [
        BUILD_COMMERCE_JSON_SCHEMA,
        {
          type: "null",
        },
      ],
    });

    expect(
      Object.keys(
        BUILD_COMMERCE_JSON_SCHEMA
          .properties,
      ),
    ).toEqual([
      "storefrontRuntime",
    ]);

    expect(
      BUILD_COMMERCE_JSON_SCHEMA
        .required,
    ).toEqual([
      "storefrontRuntime",
    ]);

    expect(
      BUILD_COMMERCE_JSON_SCHEMA
        .properties.storefrontRuntime.enum,
    ).toEqual([
      ...BUILD_STOREFRONT_RUNTIMES,
    ]);

    expect(schema.required).toEqual([
      "version",
      "name",
      "projectType",
      "targets",
      "requirements",
      "pages",
      "stackId",
      "deployment",
    ]);
  });
});
