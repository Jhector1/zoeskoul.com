import {cloudinaryImageUrl} from "@/lib/cloudinary/url";

const optimizer = (imagePublicId: string) => cloudinaryImageUrl(imagePublicId, {});
export const UNDERSTANDING_TABLES_IMAGES = {

    rows_and_columns: {
        table_row_column_labels: {
            src: optimizer("Screenshot_2026-04-04_at_12.48.41_AM_iixkie"),
            alt: "",
            // caption: "",
        },

    },
    records_and_fields: {
        row_records_fields: {
            src: optimizer("row_records_fields_ofvu9f"),
            alt: "",
            // caption: "",
        },

    },
    reading_data_like_a_spreadsheet: {
        reading_table_flow: {
            src: optimizer("Screenshot_2026-04-04_at_12.25.04_AM_toyto1"),
            alt: "",
            // caption: "",
        },

    },

} as const;