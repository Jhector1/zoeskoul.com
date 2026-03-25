import "dotenv/config";
import { runSeed } from "./runSeed";
import {seedPracticePresets} from "@/seed/presets";
export async function main() {
  // ✅ generate catalog every time you seed
    await runSeed();
  // await genPracticeCatalog();
  await seedPracticePresets();


  // ... your existing seeding logic ...
}
main()
  .then((r) => {

  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
