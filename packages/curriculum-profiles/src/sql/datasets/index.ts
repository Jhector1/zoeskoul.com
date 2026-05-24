import {studentsIntroDataset} from "./studentsIntro.js";
import {productsCatalogDataset} from "./productsCatalog.js";
import {salesKpiDataset} from "./salesKpi.js";
import {inventoryOpsDataset} from "./inventoryOps.js";
import {schoolRelationsIntroDataset} from "./schoolRelationsIntro.js";
import {customersCleanupDataset} from "./customersCleanup.js";
import {ddlBlankDataset} from "./ddlBlankDataset.js";
import {designSandboxDataset} from "./designSandbox.js";
import {capstoneSandboxDataset} from "./capstoneSandbox.js";
import {SqlDatasetArtifact} from "@zoeskoul/curriculum-contracts";

const SQL_DATASETS: Record<string, SqlDatasetArtifact> = {
    [studentsIntroDataset.id]: studentsIntroDataset,
    [productsCatalogDataset.id]: productsCatalogDataset,
    [salesKpiDataset.id]: salesKpiDataset,
    [inventoryOpsDataset.id]: inventoryOpsDataset,
    [schoolRelationsIntroDataset.id]: schoolRelationsIntroDataset,
    [customersCleanupDataset.id]: customersCleanupDataset,
    [ddlBlankDataset.id]: ddlBlankDataset,
    [designSandboxDataset.id]: designSandboxDataset,
    [capstoneSandboxDataset.id]: capstoneSandboxDataset,
};

export type SqlDatasetId = keyof typeof SQL_DATASETS;

export function getSqlDataset(datasetId: string | null | undefined) {
    if (!datasetId) return null;
    return SQL_DATASETS[datasetId as SqlDatasetId] ?? null;
}

export function getSqlDatasetById(datasetId: string): SqlDatasetArtifact | null {
    return getSqlDataset(datasetId);
}

export function listSqlDatasetIds(): string[] {
    return Object.keys(SQL_DATASETS);
}
