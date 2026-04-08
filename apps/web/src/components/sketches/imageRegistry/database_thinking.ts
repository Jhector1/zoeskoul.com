import {cloudinaryImageUrl} from "@/lib/cloudinary/url";

const optimizer = (imagePublicId: string) => cloudinaryImageUrl(imagePublicId, {});
export const DATABASE_THINKING_IMAGES = {

    intro_to_keys: {
        primary_key_simple_example: {
            src: optimizer("primary_key_simple_example_l209sb"),
            alt: "",
            // caption: "",
        },

    },
    thinking_in_questions_and_answers: {
        question_to_table_answer: {
            src: optimizer("question_to_table_answer_ssu8dv"),
            alt: "",
            // caption: "",
        },

    },
    one_table_vs_multiple_tables: {
        table_vs_multiple_tables: {
            src: optimizer("table_vs_multiple_tables_miecdx"),
            alt: "",
            // caption: "",
        },

    },


} as const;