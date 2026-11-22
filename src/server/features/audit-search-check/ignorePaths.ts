/**
 * Path prefixes from the project's `deliberately-noindexed` Context section.
 * Every line starting with `- /` declares one: the first token after `- `.
 */
export function parseIgnorePaths(content: string | null | undefined): string[] {
  const prefixes: string[] = [];
  for (const line of (content ?? "").split(/\r?\n/)) {
    const match = /^\s*-\s+(\/\S*)/.exec(line);
    if (match?.[1]) prefixes.push(match[1]);
  }
  return prefixes;
}
