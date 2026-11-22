import { expect, it } from "vitest";
import { parseIgnorePaths } from "./ignorePaths";

it("takes the first token of each '- /' bullet and ignores other lines", () => {
  const content = [
    "Sections kept out of search on purpose.",
    "- /property-investment-glossary-list/ (term definitions, noindexed)",
    "- /teams/",
    "- not a path",
    "/no-bullet/",
  ].join("\n");

  expect(parseIgnorePaths(content)).toEqual([
    "/property-investment-glossary-list/",
    "/teams/",
  ]);
});

it("returns nothing when the section is missing", () => {
  expect(parseIgnorePaths(undefined)).toEqual([]);
});
