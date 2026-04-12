


import type { HandlerArgs, AnyGenOut } from "@/lib/practice/generator/engines/utils";
import type { ManifestCodeInput, ManifestRecipe } from "@/lib/subjects/_core/manifestTypes";

export type RecipeHandler<T extends ManifestRecipe = ManifestRecipe> = (
    def: ManifestCodeInput & { recipe: T },
    args: HandlerArgs,
    resolved: {
            title: string;
            prompt: string;
            hint?: string;
            starterCode: string;
            help?: any;
            expectedExampleMeta?: string;
            maybeT?: (key: string) => string | undefined;
    },
) => AnyGenOut;