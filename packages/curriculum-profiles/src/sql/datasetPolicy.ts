const SQL_MODULE_DATASET_POLICY: Record<number, string> = {
    0: "students_intro",
    1: "products_catalog",
    2: "products_catalog",
    3: "products_catalog",
    4: "customers_cleanup",
    5: "sales_kpi",
    6: "school_relations_intro",
    7: "inventory_ops",
};

export function getSqlModuleDataset(moduleOrder: number): string {
    return SQL_MODULE_DATASET_POLICY[moduleOrder] ?? "products_catalog";
}