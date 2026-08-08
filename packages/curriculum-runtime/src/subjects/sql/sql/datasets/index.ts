/**
 * Browser/runtime bridge to the canonical SQL dataset registry.
 *
 * Do not maintain a second dataset map in the web app. Compiler goldens,
 * authoring validation, grading, and the learner SQL workspace must all resolve
 * datasets from the same registry or a dataset can pass goldens while rendering
 * with no schema in the browser.
 */
export {
    getSqlDataset,
    getSqlDatasetById,
    listSqlDatasetIds,
} from "@zoeskoul/curriculum-profiles/sql-datasets";

export type {
    SqlDatasetId,
} from "@zoeskoul/curriculum-profiles/sql-datasets";
