import * as z from "zod";
import arg from "./data/names/arg.json";
import bel from "./data/names/bel.json";
import bra from "./data/names/bra.json";
import civ from "./data/names/civ.json";
import cro from "./data/names/cro.json";
import eng from "./data/names/eng.json";
import esp from "./data/names/esp.json";
import fra from "./data/names/fra.json";
import ger from "./data/names/ger.json";
import ita from "./data/names/ita.json";
import mar from "./data/names/mar.json";
import ned from "./data/names/ned.json";
import por from "./data/names/por.json";
import sen from "./data/names/sen.json";

const namesSchema = z
  .array(z.string().min(1))
  .min(20)
  .refine((names) => new Set(names).size === names.length, "Names must be unique");

const nameListSchema = z.object({
  nationality: z.string().min(1), // same label as Club.country
  firstNames: namesSchema,
  lastNames: namesSchema,
});

export type NameList = z.infer<typeof nameListSchema>;

/** Name lists keyed by nationality. */
export type NameBank = ReadonlyMap<string, NameList>;

// Imported statically so the lists ship with the code. The order is the file name order: generation
// draws from it, so changing it changes the world.
const FILES: Readonly<Record<string, unknown>> = { arg, bel, bra, civ, cro, eng, esp, fra, ger, ita, mar, ned, por, sen };

function buildNameBank(files: Readonly<Record<string, unknown>>): NameBank {
  const bank = new Map<string, NameList>();
  for (const [file, content] of Object.entries(files)) {
    const result = nameListSchema.safeParse(content);
    if (!result.success) {
      throw new Error(`Invalid name list ${file}.json:\n${z.prettifyError(result.error)}`);
    }
    if (bank.has(result.data.nationality)) {
      throw new Error(`Nationality "${result.data.nationality}" is defined twice (${file}.json)`);
    }
    bank.set(result.data.nationality, result.data);
  }
  return bank;
}

/** Every name list, validated when the module loads: used by the seed and by youth arrivals. */
export const NAME_BANK: NameBank = buildNameBank(FILES);
