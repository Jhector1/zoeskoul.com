export type SqlModuleDatasetPolicy = {
    datasetId: string;
    preferredTeachingTable?: string;
    preferredLabelColumn?: string;
    preferredNumericColumns?: string[];
};

/**
 * `moduleOrder` is the zero-based module index used by the legacy policy.
 * `courseSlug` makes the fallback unambiguous when multiple SQL courses each
 * start at module 0.
 */
export type SqlDatasetPolicyContext = {
    courseSlug?: string;
    moduleOrder: number;
};

const DEFAULT_POLICY: SqlModuleDatasetPolicy = {
    datasetId: "products_catalog",
    preferredTeachingTable: "products_catalog",
    preferredLabelColumn: "product_name",
    preferredNumericColumns: ["price"],
};

const SQL_V2_MODULE_DATASET_POLICY: Record<number, SqlModuleDatasetPolicy> = {
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
    12: {
        datasetId: "ddl_blank",
    },
    13: {
        datasetId: "ddl_blank",
    },
};


const MULTI_TABLE_SQL_POLICY: SqlModuleDatasetPolicy = {
    datasetId: "school_relations_intro",
    preferredTeachingTable: "students",
    preferredLabelColumn: "name",
    preferredNumericColumns: ["grade_level"],
};

const SALES_REPORTING_POLICY: SqlModuleDatasetPolicy = {
    datasetId: "sales_reporting",
    preferredTeachingTable: "sales_reporting",
    preferredLabelColumn: "product_name",
    preferredNumericColumns: [
        "quantity",
        "unit_price",
        "discount_pct",
        "customer_rating",
    ],
};

const SQL_DATA_MANAGEMENT_POLICY: Record<number, SqlModuleDatasetPolicy> = {
    0: {
        datasetId: "inventory_ops",
        preferredTeachingTable: "inventory_items",
        preferredLabelColumn: "name",
        preferredNumericColumns: ["price"],
    },
    1: {
        datasetId: "inventory_ops",
        preferredTeachingTable: "inventory_items",
        preferredLabelColumn: "name",
        preferredNumericColumns: ["price"],
    },
    2: {
        datasetId: "ddl_blank",
    },
    3: {
        datasetId: "ddl_blank",
    },
};

function normalizeCourseSlug(value: string | undefined): string {
    return String(value ?? "").trim().toLowerCase();
}

function normalizeInput(
    input: number | SqlDatasetPolicyContext,
): Required<Pick<SqlDatasetPolicyContext, "moduleOrder">> & {
    courseSlug?: string;
} {
    if (typeof input === "number") {
        return { moduleOrder: Math.max(0, input) };
    }

    return {
        courseSlug: normalizeCourseSlug(input.courseSlug) || undefined,
        moduleOrder: Math.max(0, input.moduleOrder),
    };
}

export function getSqlModuleDatasetPolicy(
    input: number | SqlDatasetPolicyContext,
): SqlModuleDatasetPolicy {
    const { courseSlug, moduleOrder } = normalizeInput(input);

    if (courseSlug === "sql-analysis-reporting") {
        return SALES_REPORTING_POLICY;
    }

    if (courseSlug === "multi-table-sql") {
        return MULTI_TABLE_SQL_POLICY;
    }

    if (courseSlug === "sql-data-management") {
        return SQL_DATA_MANAGEMENT_POLICY[moduleOrder] ?? SQL_DATA_MANAGEMENT_POLICY[0];
    }

    // Preserve the original numeric API and all SQL V2 behavior. Unknown or
    // absent course slugs intentionally fall back to the established SQL V2
    // module map rather than changing existing courses.
    return SQL_V2_MODULE_DATASET_POLICY[moduleOrder] ?? DEFAULT_POLICY;
}

export function getSqlModuleDataset(
    input: number | SqlDatasetPolicyContext,
): string {
    return getSqlModuleDatasetPolicy(input).datasetId;
}
