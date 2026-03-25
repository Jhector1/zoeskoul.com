import type { SketchEntry } from "./registryTypes";
import { ARCHETYPE_GALLERY_SKETCHES } from "@/components/sketches/gallery/registry";
import { SUBJECT_SKETCHES } from "@/lib/subjects";

const ALL: Record<string, SketchEntry> = {
    ...ARCHETYPE_GALLERY_SKETCHES,
    ...SUBJECT_SKETCHES,
};

export function getSketchEntry(sketchId: string): SketchEntry | null {
    return ALL[sketchId] ?? null;
}





// import type { SketchEntry } from "./registryTypes";
// import { AI_MOD0_SKETCHES } from "./ai/mod0/configs";
// import {ARCHETYPE_GALLERY_SKETCHES} from "@/components/sketches/gallery/registry";
// import {PY_PART1_SKETCHES} from "@/components/sketches/subjects/python/modules/module0";
// import {PY_PART2_SKETCHES} from "@/components/sketches/subjects/python/modules/module1/sections";
// import {PY_PART3_SKETCHES} from "@/components/sketches/subjects/python/modules/module2";
// import {HC_PART1_SKETCHES} from "@/components/sketches/subjects/haitian-creole/modules/module0/sections";
// import {LA_PART1_SKETCHES} from "@/components/sketches/subjects/linear_algebra";
//
// const ALL: Record<string, SketchEntry> = {
//     ...AI_MOD0_SKETCHES,
//     ...LA_PART1_SKETCHES,
//     // ...LA_SKETCHES,
//     // ...PY_SKETCHES,
//     ...HC_PART1_SKETCHES,
//     ...PY_PART1_SKETCHES,
//     ...PY_PART2_SKETCHES,
//     ...PY_PART3_SKETCHES,
//  ...ARCHETYPE_GALLERY_SKETCHES,
// };
//
// export function getSketchEntry(sketchId: string): SketchEntry | null {
//     return ALL[sketchId] ?? null;
// }
