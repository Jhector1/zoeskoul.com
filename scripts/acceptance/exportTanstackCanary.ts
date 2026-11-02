/** Export the actual staged template; never duplicate its source. */
import { TANSTACK_START_TEMPLATE_V1 } from "../../packages/build-template-registry/src/tanstackStartTemplate.ts";

if (TANSTACK_START_TEMPLATE_V1.id !== "tanstack-start-v1") throw new Error("Unexpected staged template identity.");
process.stdout.write(JSON.stringify({
  format:1, templateId:TANSTACK_START_TEMPLATE_V1.id,
  files:TANSTACK_START_TEMPLATE_V1.files.map(file=>({path:file.path,content:file.content})),
})+"\n");
