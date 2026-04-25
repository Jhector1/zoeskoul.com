export type SqlModuleDatasetPolicy = {
    datasetId: string;
    preferredTeachingTable?: string;
    preferredLabelColumn?: string;
    preferredNumericColumns?: string[];
};

const SQL_MODULE_DATASET_POLICY: Record<number, SqlModuleDatasetPolicy> = {
    0: {
        datasetId: "students_intro",
        preferredTeachingTable: "students",
        preferredLabelColumn: "name",
    },
    1: {
        datasetId: "products_catalog",
        preferredTeachingTable: "products_catalog",
        preferredLabelColumn: "product_name",
        preferredNumericColumns: ["price", "stock_quantity"],
    },
    2: {
        datasetId: "products_catalog",
        preferredTeachingTable: "products_catalog",
        preferredLabelColumn: "product_name",
        preferredNumericColumns: ["price", "stock_quantity"],
    },
    3: {
        datasetId: "products_catalog",
        preferredTeachingTable: "products_catalog",
        preferredLabelColumn: "product_name",
        preferredNumericColumns: ["price", "stock_quantity"],
    },
    4: {
        datasetId: "customers_cleanup",
        preferredTeachingTable: "customers_cleanup",
        preferredLabelColumn: "customer_name",
    },
    5: {
        datasetId: "sales_kpi",
        preferredTeachingTable: "orders",
        preferredLabelColumn: "customer_name",
        preferredNumericColumns: ["quantity", "unit_price"],
    },
    6: {
        datasetId: "school_relations_intro",
        preferredTeachingTable: "students",
        preferredLabelColumn: "student_name",
    },
    7: {
        datasetId: "inventory_ops",
        preferredTeachingTable: "inventory_items",
        preferredLabelColumn: "item_name",
        preferredNumericColumns: ["quantity_on_hand", "reorder_level"],
    },
};

export function getSqlModuleDatasetPolicy(
    moduleOrder: number,
): SqlModuleDatasetPolicy {
    return (
        SQL_MODULE_DATASET_POLICY[moduleOrder] ?? {
            datasetId: "products_catalog",
            preferredTeachingTable: "products_catalog",
            preferredLabelColumn: "product_name",
            preferredNumericColumns: ["price"],
        }
    );
}

export function getSqlModuleDataset(moduleOrder: number): string {
    return getSqlModuleDatasetPolicy(moduleOrder).datasetId;
}