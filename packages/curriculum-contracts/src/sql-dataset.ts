export type SqlDatasetColumn = {
    name: string;
    type: string;
};

export type SqlDatasetTableSnapshot = {
    name: string;
    columns: readonly SqlDatasetColumn[];
    rows: readonly (readonly unknown[])[];
    rowCount: number;
};

export type SqlDatasetArtifact = {
    id: string;
    dialect: "sqlite";
    titleKey: string;
    descriptionKey: string;
    schemaSql: string;
    seedSql: string;
    tableSnapshots: Readonly<Record<string, SqlDatasetTableSnapshot>>;
};