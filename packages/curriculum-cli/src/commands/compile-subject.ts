import { loadBlueprint, compileSubject } from "@zoeskoul/curriculum-compiler";
import { openAiProvider } from "@zoeskoul/curriculum-ai";
import {
  finishProgressBar,
  renderProgressBar,
} from "../utils/renderProgressBar.js";
import {selectModelFromConsole} from "../utils/selectModel.js";

function makeProgressLabel(info: {
  stage: string;
  moduleSlug?: string;
  topicId?: string;
}) {
  const location =
      info.moduleSlug && info.topicId
          ? `${info.moduleSlug} / ${info.topicId}`
          : info.moduleSlug
              ? info.moduleSlug
              : info.topicId
                  ? info.topicId
                  : "";

  return location ? `${info.stage} - ${location}` : info.stage;
}

export async function runCompileSubject(blueprintPath: string, args: string[] = []) {
  await selectModelFromConsole();
  const blueprint = await loadBlueprint(blueprintPath);
  let sawProgress = false;
  const resume = args.includes("--resume");

  console.log(
      resume
          ? `Compiling subject ${blueprint.subjectSlug} with resume...`
          : `Compiling subject ${blueprint.subjectSlug}...`,
  );
  try {
    const out = await compileSubject({
      blueprint,
      provider: openAiProvider,
      resume,
      onProgress: (info) => {
        sawProgress = true;
        renderProgressBar({
          current: info.current,
          total: info.total,
          label: makeProgressLabel(info),
        });
      },
    });

    if (sawProgress) {
      finishProgressBar(
          `✔ Compiled draft for subject ${out.subjectManifest.subject.slug}`,
      );
    } else {
      console.log(`Compiled draft for subject ${out.subjectManifest.subject.slug}`);
    }
  } catch (error) {
    if (sawProgress) {
      finishProgressBar("✖ Compile failed");
    }
    throw error;
  }
}