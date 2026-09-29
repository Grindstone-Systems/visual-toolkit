import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { REGION_ROLES, STATES, recipeSchema, objectSchema } from "./index.ts";

describe("schemas", () => {
  const ajv = new Ajv2020({ strict: false });
  it("compile", () => {
    expect(() => ajv.compile(objectSchema)).not.toThrow();
    expect(() => ajv.compile(recipeSchema)).not.toThrow();
  });
  it("stay in sync with the TypeScript vocabularies", () => {
    const defs = (objectSchema as { $defs: Record<string, { enum?: string[]; properties?: Record<string, { enum?: string[] }> }> }).$defs;
    expect(defs.state!.enum).toEqual([...STATES]);
    expect(defs.region!.properties!.role!.enum).toEqual([...REGION_ROLES]);
  });
});
