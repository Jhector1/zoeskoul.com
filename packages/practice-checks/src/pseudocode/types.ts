export const PSEUDOCODE_MODES = [
    "complete",
    "fill_blanks",
    "reorder",
    "trace",
    "write",
] as const;

export type PseudocodeMode = (typeof PSEUDOCODE_MODES)[number];
export type PseudocodeDialect = "zoeskoul-v1";

export const PSEUDOCODE_STRUCTURES = [
    "procedure",
    "if",
    "else_if",
    "else",
    "while",
    "for",
    "return",
    "assignment",
    "call",
    "create",
    "swap",
    "break",
    "continue",
] as const;

export type PseudocodeStructure = (typeof PSEUDOCODE_STRUCTURES)[number];

export const PSEUDOCODE_OPERATIONS = [
    "compare_equal",
    "compare_less",
    "compare_greater",
    "move_left",
    "move_right",
    "link_left",
    "link_right",
    "return_null",
    "return_value",
    "create_node",
    "recursive_call",
    "swap",
    "loop",
    "enqueue",
    "dequeue",
    "push",
    "pop",
    "visit",
    "increment",
    "decrement",
    "midpoint",
] as const;

export type PseudocodeOperation = (typeof PSEUDOCODE_OPERATIONS)[number];

export type PseudocodeValidationRule =
    | {
          id: string;
          kind: "structure";
          structure: PseudocodeStructure;
          min?: number;
          max?: number;
          message?: string;
      }
    | {
          id: string;
          kind: "operation";
          operation: PseudocodeOperation;
          min?: number;
          max?: number;
          message?: string;
      }
    | {
          id: string;
          kind: "pattern";
          pattern: string;
          flags?: string;
          min?: number;
          message?: string;
      }
    | {
          id: string;
          kind: "forbidden_pattern";
          pattern: string;
          flags?: string;
          message?: string;
      }
    | {
          id: string;
          kind: "ordered_operations";
          operations: PseudocodeOperation[];
          message?: string;
      };

export type PseudocodeTraceScenario = {
    id: string;
    expectedLines: string[];
    match?: "exact" | "contains";
    message?: string;
};

export type PseudocodeExpected = {
    kind: "pseudocode_input";
    dialect: PseudocodeDialect;
    mode: PseudocodeMode;
    strategy:
        | "required_structure"
        | "semantic_rules"
        | "trace_output"
        | "hybrid";
    solution: string;
    rules: PseudocodeValidationRule[];
    scenarios?: PseudocodeTraceScenario[];
    ignoreFormatting?: boolean;
    allowEquivalentNames?: boolean;
};

export type PseudocodeValidationFailure = {
    id: string;
    message: string;
};

export type PseudocodeValidationResult = {
    ok: boolean;
    normalized: string;
    passedRuleIds: string[];
    failures: PseudocodeValidationFailure[];
};
