


import type { HandlerArgs, AnyGenOut } from "@/lib/practice/generator/engines/utils";
import {ManifestCodeInput, ManifestRecipe} from "@zoeskoul/curriculum-contracts";

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