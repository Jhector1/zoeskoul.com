import { loadDbEnv } from "../loadEnv";
import { runSeed } from "./runSeed";
import { seedPracticePresets } from "./presets";

loadDbEnv();

export async function main() {
  // Generate catalog-backed records and default practice presets.
    await runSeed();
  await seedPracticePresets();
}
main()
  .then(() => {})
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
