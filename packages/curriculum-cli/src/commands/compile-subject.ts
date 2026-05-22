import { loadBlueprint, compileSubject } from "@zoeskoul/curriculum-compiler";
import { openAiProvider } from "@zoeskoul/curriculum-ai";
import {
  finishProgressBar,
  renderProgressBar,
} from "../utils/renderProgressBar.js";
import {selectModelFromConsole} from "../utils/selectModel.js";

function looksLikeBlueprintPath(value: string) {
  return value.endsWith(".json") || value.includes("/") || value.includes("\\");
}

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

export async function runCompileSubject(input: string, args: string[] = []) {
  await selectModelFromConsole();
  const blueprint = looksLikeBlueprintPath(input) ? await loadBlueprint(input) : null;
  const subjectSlug = blueprint?.subjectSlug ?? input;
  let sawProgress = false;
  const resume = args.includes("--resume");

  console.log(
      resume
          ? `Compiling subject ${subjectSlug} with resume...`
          : `Compiling subject ${subjectSlug}...`,
  );
  try {
    const out = await compileSubject({
      ...(blueprint ? { blueprint } : { subjectSlug }),
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
