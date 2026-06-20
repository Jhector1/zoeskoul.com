// src/lib/subjects/sql/datasets/index.ts

import { studentsIntroDataset } from "./studentsIntro";
import {productsCatalogDataset} from "@/lib/subjects/sql/sql/datasets/productsCatalog";
import {salesKpiDataset} from "@/lib/subjects/sql/sql/datasets/salesKpi";
import {inventoryOpsDataset} from "@/lib/subjects/sql/sql/datasets/inventoryOps";
import {schoolRelationsIntroDataset} from "@/lib/subjects/sql/sql/datasets/schoolRelationsIntro";
import {customersCleanupDataset} from "@/lib/subjects/sql/sql/datasets/customersCleanup";
import {ddlBlankDataset} from "@/lib/subjects/sql/sql/datasets/ddlBlankDataset";
// import { productsCatalogDataset } from "./productsCatalog";
// import { salesKpiDataset } from "./salesKpi";

export const SQL_DATASETS = {
    [studentsIntroDataset.id]: studentsIntroDataset,
    [productsCatalogDataset.id]: productsCatalogDataset,
    [salesKpiDataset.id]: salesKpiDataset,
    [inventoryOpsDataset.id]: inventoryOpsDataset,
    [schoolRelationsIntroDataset.id]: schoolRelationsIntroDataset,
    [customersCleanupDataset.id]: customersCleanupDataset,
    [ddlBlankDataset.id]: ddlBlankDataset,




} as const;

export type SqlDatasetId = keyof typeof SQL_DATASETS;

export function getSqlDataset(datasetId: string | null | undefined) {

    if (!datasetId) return null;
    return SQL_DATASETS[datasetId as SqlDatasetId] ?? null;
}
