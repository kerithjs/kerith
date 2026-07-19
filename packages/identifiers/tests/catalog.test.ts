// tests/catalog.test.ts
import { describe, it, expect } from "vitest";
import { IDENTIFIER_CATALOG } from "../src/catalog/metadata.js";

describe("Identifier Catalog", () => {
  it("contains exactly 98 entries", () => {
    expect(IDENTIFIER_CATALOG).toHaveLength(98);
  });
});
