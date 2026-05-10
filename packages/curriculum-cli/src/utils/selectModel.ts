import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const MODELS = [

    "gpt-4o-mini",
    "gpt-4o",
    "gpt-5.4-mini",
    "gpt-5.4",
    "gpt-5.5",
];

export async function selectModelFromConsole() {
    if (process.env.OPENAI_MODEL?.trim()) {
        console.log(`Using model from OPENAI_MODEL: ${process.env.OPENAI_MODEL}`);
        return process.env.OPENAI_MODEL;
    }

    if (!process.stdin.isTTY) {
        throw new Error(
            "OPENAI_MODEL is missing and interactive model selection is not available.",
        );
    }

    console.log("");
    console.log("Select OpenAI model:");
    console.log("");

    MODELS.forEach((model, index) => {
        console.log(`${index + 1}. ${model}`);
    });

    console.log("");

    const rl = readline.createInterface({ input, output });

    try {
        while (true) {
            const answer = await rl.question("Choose model number: ");
            const index = Number(answer.trim()) - 1;
            const model = MODELS[index];

            if (model) {
                process.env.OPENAI_MODEL = model;
                console.log(`Selected model: ${model}`);
                console.log("");
                return model;
            }

            console.log("Invalid choice. Please choose a number from the list.");
        }
    } finally {
        rl.close();
    }
}