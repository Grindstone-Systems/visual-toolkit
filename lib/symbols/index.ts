import type { Generator, ParamValues, Recipe, VtObject } from "../types.ts";
import { centrifugalPump } from "./pump.ts";
import { processValve } from "./valve.ts";
import { inductionMotor } from "./motor.ts";
import { processTank } from "./tank.ts";
import { beltConveyor } from "./conveyor.ts";
import { shellTubeExchanger } from "./exchanger.ts";
import { centrifugalBlower } from "./blower.ts";
import { airCompressor } from "./compressor.ts";

export { defaultParams, sanitizeParams } from "./params.ts";
export { centrifugalPump, processValve, inductionMotor, processTank, beltConveyor };
export { shellTubeExchanger, centrifugalBlower, airCompressor };

/** Every generator version ever published stays registered (share links depend on it). */
export const GENERATORS: Generator[] = [
  centrifugalPump,
  processValve,
  inductionMotor,
  processTank,
  beltConveyor,
  shellTubeExchanger,
  centrifugalBlower,
  airCompressor,
];

/** Families shown in the builder, including ones on the roadmap. */
export const FAMILIES: { family: string; name: string; generator?: string }[] = [
  { family: "pump", name: "Pump", generator: "pump.centrifugal" },
  { family: "valve", name: "Valve", generator: "valve.two-way" },
  { family: "motor", name: "Motor", generator: "motor.induction" },
  { family: "tank", name: "Tank", generator: "tank.process" },
  { family: "conveyor", name: "Conveyor", generator: "conveyor.belt" },
  { family: "exchanger", name: "Heat exchanger", generator: "exchanger.shell-tube" },
  { family: "blower", name: "Blower", generator: "blower.centrifugal" },
  { family: "compressor", name: "Compressor", generator: "compressor.air" },
];

export function getGenerator(id: string, version?: number): Generator | undefined {
  const matches = GENERATORS.filter((g) => g.id === id && (version === undefined || g.version === version));
  return matches.sort((a, b) => b.version - a.version)[0];
}

export function generate(id: string, params: ParamValues, version?: number): VtObject {
  const gen = getGenerator(id, version);
  if (!gen) throw new Error(`Unknown generator ${id}${version !== undefined ? `@${version}` : ""}`);
  return gen.generate(params);
}

export function generateFromRecipe(r: Recipe): VtObject {
  return generate(r.generator, r.params, r.version);
}
