import type {
  WorkspaceStateV2,
} from "@zoeskoul/learner-workspace/ide/types";

type WorkspaceNode =
  WorkspaceStateV2["nodes"][number];

export type PublishedStaticFile =
  Readonly<{
    path: string;
    body:
      | string
      | Uint8Array;
    contentType: string;
  }>;

function safeName(
  value: unknown,
): string {
  if (
    typeof value !==
      "string" ||
    !value ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    throw new Error(
      "Published workspace contains an unsafe node name.",
    );
  }

  return value;
}

export function publishedStaticContentType(
  path: string,
): string {
  const extension =
    path
      .toLowerCase()
      .split(".")
      .at(-1) ?? "";

  switch (extension) {
    case "html":
    case "htm":
      return "text/html; charset=utf-8";

    case "css":
      return "text/css; charset=utf-8";

    case "js":
    case "mjs":
      return "text/javascript; charset=utf-8";

    case "json":
    case "map":
      return "application/json; charset=utf-8";

    case "svg":
      return "image/svg+xml";

    case "png":
      return "image/png";

    case "jpg":
    case "jpeg":
      return "image/jpeg";

    case "gif":
      return "image/gif";

    case "webp":
      return "image/webp";

    case "avif":
      return "image/avif";

    case "ico":
      return "image/x-icon";

    case "woff":
      return "font/woff";

    case "woff2":
      return "font/woff2";

    case "ttf":
      return "font/ttf";

    case "otf":
      return "font/otf";

    case "xml":
      return "application/xml; charset=utf-8";

    case "webmanifest":
      return "application/manifest+json; charset=utf-8";

    case "pdf":
      return "application/pdf";

    case "mp4":
      return "video/mp4";

    case "webm":
      return "video/webm";

    case "mp3":
      return "audio/mpeg";

    case "wav":
      return "audio/wav";

    case "ogg":
      return "audio/ogg";

    case "txt":
    default:
      return "text/plain; charset=utf-8";
  }
}

function binaryBody(
  node: WorkspaceNode,
): Uint8Array | null {
  if (
    node.kind !== "file"
  ) {
    return null;
  }

  const binary =
    (
      node as unknown as {
        binary?: {
          encoding?: unknown;
          data?: unknown;
        } | null;
      }
    ).binary;

  if (!binary) {
    return null;
  }

  if (
    binary.encoding !==
      "base64" ||
    typeof binary.data !==
      "string"
  ) {
    throw new Error(
      "Published binary workspace files must use base64 encoding.",
    );
  }

  return Uint8Array.from(
    Buffer.from(
      binary.data,
      "base64",
    ),
  );
}

export function buildPublishedStaticFileMap(
  value: unknown,
): ReadonlyMap<
  string,
  PublishedStaticFile
> {
  const workspace =
    value as
      | WorkspaceStateV2
      | null;

  if (
    !workspace ||
    workspace.version !== 2 ||
    !Array.isArray(
      workspace.nodes,
    )
  ) {
    throw new Error(
      "Published deployment revision does not contain a valid WorkspaceStateV2 snapshot.",
    );
  }

  const byId =
    new Map<
      string,
      WorkspaceNode
    >();

  for (
    const node of
    workspace.nodes
  ) {
    if (
      !node ||
      typeof node.id !==
        "string" ||
      !node.id ||
      byId.has(node.id)
    ) {
      throw new Error(
        "Published workspace contains invalid or duplicate node ids.",
      );
    }

    safeName(
      node.name,
    );

    byId.set(
      node.id,
      node,
    );
  }

  const pathCache =
    new Map<
      string,
      string
    >();

  const visiting =
    new Set<string>();

  const resolvePath = (
    id: string,
  ): string => {
    const cached =
      pathCache.get(id);

    if (cached) {
      return cached;
    }

    if (
      visiting.has(id)
    ) {
      throw new Error(
        "Published workspace contains a parent cycle.",
      );
    }

    const node =
      byId.get(id);

    if (!node) {
      throw new Error(
        "Published workspace references a missing node.",
      );
    }

    visiting.add(id);

    let path =
      safeName(
        node.name,
      );

    if (
      node.parentId
    ) {
      const parent =
        byId.get(
          node.parentId,
        );

      if (
        !parent ||
        parent.kind !==
          "folder"
      ) {
        throw new Error(
          "Published workspace contains an invalid parent relation.",
        );
      }

      path =
        `${resolvePath(
          parent.id,
        )}/${path}`;
    }

    visiting.delete(id);

    pathCache.set(
      id,
      path,
    );

    return path;
  };

  const files =
    new Map<
      string,
      PublishedStaticFile
    >();

  for (
    const node of
    workspace.nodes
  ) {
    if (
      node.kind !==
      "file"
    ) {
      continue;
    }

    const path =
      resolvePath(
        node.id,
      );

    if (
      files.has(path)
    ) {
      throw new Error(
        `Duplicate published workspace path: ${path}.`,
      );
    }

    const binary =
      binaryBody(node);

    if (
      !binary &&
      typeof node.content !==
        "string"
    ) {
      throw new Error(
        `Published workspace file ${path} does not contain text or supported binary content.`,
      );
    }

    files.set(
      path,
      {
        path,
        body:
          binary ??
          node.content,
        contentType:
          publishedStaticContentType(
            path,
          ),
      },
    );
  }

  return files;
}

function safeRequestPath(
  path: string,
): string {
  const normalized =
    path
      .replace(
        /^\/+/,
        "",
      )
      .replace(
        /\/+$/,
        "",
      );

  if (!normalized) {
    return "";
  }

  const segments =
    normalized.split("/");

  for (
    const segment of
    segments
  ) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("\\") ||
      segment.includes("\0")
    ) {
      throw new Error(
        "Unsafe published-site path.",
      );
    }
  }

  return segments.join("/");
}

export function resolvePublishedStaticFile(
  files:
    ReadonlyMap<
      string,
      PublishedStaticFile
    >,
  requestedPath: string,
  acceptsHtml: boolean,
): PublishedStaticFile | null {
  const path =
    safeRequestPath(
      requestedPath,
    );

  const candidates:
    string[] =
      path
        ? [path]
        : ["index.html"];

  if (
    path &&
    !path
      .split("/")
      .at(-1)
      ?.includes(".")
  ) {
    candidates.push(
      `${path}.html`,
      `${path}/index.html`,
    );
  }

  for (
    const candidate of
    candidates
  ) {
    const file =
      files.get(
        candidate,
      );

    if (file) {
      return file;
    }
  }

  if (
    acceptsHtml
  ) {
    return (
      files.get(
        "index.html",
      ) ?? null
    );
  }

  return null;
}
