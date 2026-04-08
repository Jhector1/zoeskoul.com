import {cloudinaryImageUrl} from "@/lib/cloudinary/url";

const optimizer = (imagePublicId: string) => cloudinaryImageUrl(imagePublicId, {});
export const SQL_SECTION_0_1_IMAGES = {
    what_sql_means: {
        sql_language_overview: {
            src: optimizer("sql-language-overview_mieyho"),
            alt: "@:sketches.sql.images.sql_language_overview.alt",
            caption: "@:sketches.sql.images.sql_language_overview.caption",
            maxWidthClassName: "max-w-sm",
        },
        sql_question_to_data_flow: {
            src: optimizer("sql-question-to-data-flow_kbqjeo"),
            alt: "@:sketches.sql.images.sql_question_to_data_flow.alt",
            caption: "@:sketches.sql.images.sql_question_to_data_flow.caption",
        },
        students_table_example: {
            src: optimizer("students-table-example_csvnzg"),
            alt: "@:sketches.sql.images.students_table_example.alt",
            caption: "@:sketches.sql.images.students_table_example.caption",
        },
        select_from_breakdown: {
            src: optimizer("select-from-breakdown_yuoi2u"),
            alt: "@:sketches.sql.images.select_from_breakdown.alt",
            caption: "@:sketches.sql.images.select_from_breakdown.caption",
        },
        sql_result_focus: {
            src: optimizer("sql-result-focus_b6zdyw"),
            alt: "@:sketches.sql.images.sql_result_focus.alt",
            caption: "@:sketches.sql.images.sql_result_focus.caption",
        },
    },

    what_a_database_is: {
        database_overview: {
            src: optimizer("database_overview_wmy9lo"),
            alt: "A database icon containing multiple organized tables.",
            // caption: "A database stores organized information.",
        },

        messy_vs_structured_data: {
            src: optimizer("messy_vs_structured_data_tvktv9"),
            alt: "A comparison between messy scattered data and structured database tables.",
            // caption: "Databases organize information so it is easier to search and reuse.",
        },

        database_real_examples: {
            src: optimizer("database_real_examples_plvl3a"),
            alt: "Several examples of real data categories such as students, customers, products, and employees.",
            // caption: "Many kinds of real-world information can be stored in a database.",
        },

        database_contains_tables: {
            src: optimizer("database_container_model_eqjc9x"),
            alt: "A simple diagram showing one database containing several tables.",
            // caption: "A helpful beginner model: a database holds tables.",
        },

        // table_row_column_labels: {
        //     src:optimizer("sql-result-focus_b6zdyw"),
        //     alt: "A table diagram with labels pointing to rows and columns.",
        //     // caption: "Rows and columns are the basic shape of table data.",
        // },

        row_vs_column_highlight: {
            src:optimizer("row_vs_column_highlight_m2ofu8"),
            alt: "A table where one full row and one full column are highlighted for comparison.",
            // caption: "A row is one record, and a column is one type of information.",
        },

        // database_container_model: {
        //     src:optimizer("sql-result-focus_b6zdyw"),
        //     alt: "A visual model showing database to tables to rows as nested levels.",
        //     // caption: "Think of the database as the larger container.",
        // }
    },

    data_everywhere: {
        src: "/images/sql/section_0_1/data-everywhere.png",
        alt: "Icons for apps, stores, schools, and websites to show that data is everywhere.",
        caption: "SQL matters because many systems store data.",
    },

    sql_actions_overview: {
        src: "/images/sql/section_0_1/sql-actions-overview.png",
        alt: "A visual overview of SQL actions such as read, filter, sort, summarize, and update.",
        caption: "SQL helps you do useful things with stored information.",
    },

    sql_questions_and_answers: {
        src: "/images/sql/section_0_1/sql-questions-and-answers.png",
        alt: "Example questions about products and students connected to result tables.",
        caption: "SQL helps turn business or school questions into answers.",
    },

    ask_run_result_cycle: {
        src: "/images/sql/section_0_1/ask-run-result-cycle.png",
        alt: "A simple three-step cycle showing ask a question, run a query, and see the result.",
        caption: "That quick feedback is one reason SQL feels practical so early.",
    },

    databases_in_daily_life: {
        src: "/images/sql/section_0_1/databases-in-daily-life.png",
        alt: "Everyday software systems shown as examples of places where databases appear.",
        caption: "Databases show up in many everyday systems.",
    },

    school_database_example: {
        src: "/images/sql/section_0_1/school-database-example.png",
        alt: "A school database example with students, teachers, courses, and grades.",
        caption: "Schools often need databases to track related records.",
    },

    store_database_example: {
        src: "/images/sql/section_0_1/store-database-example.png",
        alt: "An online store database example with products, customers, orders, and inventory.",
        caption: "Online stores rely on databases to manage products and orders.",
    },

    media_database_example: {
        src: "/images/sql/section_0_1/media-database-example.png",
        alt: "A media app database example with users, songs or movies, playlists, and favorites.",
        caption: "Media apps store content and user activity in organized data structures.",
    },

    hospital_database_example: {
        src: "/images/sql/section_0_1/hospital-database-example.png",
        alt: "A hospital or clinic database example with patients, doctors, appointments, and prescriptions.",
        caption: "Healthcare systems use databases to manage important records.",
    },

    shared_database_pattern: {
        src: "/images/sql/section_0_1/shared-database-pattern.png",
        alt: "A summary diagram showing that different systems all store information in tables and use SQL to ask questions.",
        caption: "Different systems share the same big pattern: store, organize, query.",
    },
} as const;