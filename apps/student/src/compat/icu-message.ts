type MessageValues =
  Record<string, unknown>;

function readBalanced(
  input: string,
  start: number,
) {
  let depth = 0;

  for (
    let index = start;
    index < input.length;
    index += 1
  ) {
    const character = input[index];

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return {
          body: input.slice(
            start + 1,
            index,
          ),
          end: index + 1,
        };
      }
    }
  }

  return null;
}

function parseOptions(
  source: string,
) {
  const options =
    new Map<string, string>();
  let index = 0;

  while (index < source.length) {
    while (
      index < source.length &&
      /[\s,]/.test(
        source[index] ?? "",
      )
    ) {
      index += 1;
    }

    const keyStart = index;

    while (
      index < source.length &&
      !/[\s{]/.test(
        source[index] ?? "",
      )
    ) {
      index += 1;
    }

    const key =
      source.slice(
        keyStart,
        index,
      ).trim();

    while (
      index < source.length &&
      /\s/.test(
        source[index] ?? "",
      )
    ) {
      index += 1;
    }

    if (
      !key ||
      source[index] !== "{"
    ) {
      break;
    }

    const block =
      readBalanced(
        source,
        index,
      );

    if (!block) break;

    options.set(
      key,
      block.body,
    );
    index = block.end;
  }

  return options;
}

function formatPlurals(
  message: string,
  values: MessageValues,
  locale: string,
) {
  let output = "";
  let cursor = 0;

  while (cursor < message.length) {
    const opening =
      message.indexOf(
        "{",
        cursor,
      );

    if (opening < 0) {
      output +=
        message.slice(cursor);
      break;
    }

    output += message.slice(
      cursor,
      opening,
    );

    const block =
      readBalanced(
        message,
        opening,
      );

    if (!block) {
      output +=
        message.slice(opening);
      break;
    }

    const header =
      block.body.match(
        /^\s*([a-zA-Z0-9_]+)\s*,\s*plural\s*,([\s\S]*)$/,
      );

    if (!header) {
      output += message.slice(
        opening,
        block.end,
      );
      cursor = block.end;
      continue;
    }

    const variable = header[1];
    const count = Number(
      values[variable],
    );

    if (!Number.isFinite(count)) {
      output += message.slice(
        opening,
        block.end,
      );
      cursor = block.end;
      continue;
    }

    const options =
      parseOptions(header[2]);
    const category =
      new Intl.PluralRules(
        locale,
      ).select(count);
    const selected =
      options.get(`=${count}`) ??
      options.get(category) ??
      options.get("other") ??
      "";

    output += formatPlurals(
      selected.replace(
        /#/g,
        new Intl.NumberFormat(
          locale,
        ).format(count),
      ),
      values,
      locale,
    );
    cursor = block.end;
  }

  return output;
}

export function formatIcuMessage(
  message: string,
  values: MessageValues = {},
  locale = "en",
) {
  return formatPlurals(
    message,
    values,
    locale,
  ).replace(
    /\{([a-zA-Z0-9_]+)\}/g,
    (
      original,
      key: string,
    ) => {
      const replacement =
        values[key];

      return (
        replacement == null ||
        typeof replacement ===
          "function"
      )
        ? original
        : String(replacement);
    },
  );
}
