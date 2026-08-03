const MODEL_ROOT =
  "inmemory://zoeskoul-controlled-editor";

function safeSegment(value: string): string {
  return (
    String(value ?? "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/*/, "")
      .replace(/\.\./g, "")
      .replace(/[^a-zA-Z0-9._/-]/g, "-")
      .replace(/\/+/g, "/") ||
    "untitled"
  );
}

export function normalizeControlledEditorLanguage(
  value: string,
): string {
  switch (
    String(value ?? "")
      .trim()
      .toLowerCase()
  ) {
    case "python":
      return "python";
    case "javascript":
    case "js":
      return "javascript";
    case "typescript":
    case "ts":
      return "typescript";
    case "java":
      return "java";
    case "c":
      return "c";
    case "cpp":
    case "c++":
      return "cpp";
    case "bash":
    case "shell":
    case "sh":
      return "shell";
    case "html":
    case "htm":
    case "web":
      return "html";
    case "css":
      return "css";
    case "json":
      return "json";
    case "sql":
      return "sql";
    default:
      return "plaintext";
  }
}

function extensionForLanguage(
  language: string,
): string {
  switch (
    normalizeControlledEditorLanguage(
      language,
    )
  ) {
    case "python":
      return "py";
    case "javascript":
      return "js";
    case "typescript":
      return "ts";
    case "java":
      return "java";
    case "c":
      return "c";
    case "cpp":
      return "cpp";
    case "shell":
      return "sh";
    case "html":
      return "html";
    case "css":
      return "css";
    case "json":
      return "json";
    case "sql":
      return "sql";
    default:
      return "txt";
  }
}

export function buildControlledEditorModelPath(
  args: {
    modelKey: string;
    language: string;
    fileName?: string;
  },
): string {
  const modelKey =
    safeSegment(args.modelKey);
  const fileName =
    safeSegment(
      args.fileName ??
        `main.${extensionForLanguage(
          args.language,
        )}`,
    );

  return (
    `${MODEL_ROOT}/${modelKey}/` +
    fileName
  );
}
