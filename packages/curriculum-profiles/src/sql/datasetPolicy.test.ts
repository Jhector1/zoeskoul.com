import { describe, expect, it } from "vitest";
import {
    getSqlModuleDataset,
    getSqlModuleDatasetPolicy,
} from "./datasetPolicy.js";

describe("SQL course-aware dataset policy", () => {
    it("preserves the legacy SQL V2 module 5 orders dataset", () => {
        expect(
            getSqlModuleDatasetPolicy({
                courseSlug: "sql-v2",
                moduleOrder: 5,
            }),
        ).toEqual({
            datasetId: "sales_kpi",
            preferredTeachingTable: "orders",
            preferredLabelColumn: "customer_name",
            preferredNumericColumns: ["quantity", "unit_price"],
        });
    });

    it("resolves every SQL Analysis & Reporting module to its dedicated table", () => {
        for (let moduleOrder = 0; moduleOrder <= 5; moduleOrder += 1) {
            expect(
                getSqlModuleDatasetPolicy({
                    courseSlug: "sql-analysis-reporting",
                    moduleOrder,
                }),
            ).toEqual({
                datasetId: "sales_reporting",
                preferredTeachingTable: "sales_reporting",
                preferredLabelColumn: "product_name",
                preferredNumericColumns: [
                    "quantity",
                    "unit_price",
                    "discount_pct",
                    "customer_rating",
                ],
            });
        }
    });

    it("resolves every Multi-Table SQL module to the relationship dataset", () => {
        for (let moduleOrder = 0; moduleOrder <= 3; moduleOrder += 1) {
            expect(
                getSqlModuleDatasetPolicy({
                    courseSlug: "multi-table-sql",
                    moduleOrder,
                }),
            ).toEqual({
                datasetId: "school_relations_intro",
                preferredTeachingTable: "students",
                preferredLabelColumn: "name",
                preferredNumericColumns: ["grade_level"],
            });
        }
    });

    it("uses inventory data for mutation modules and a blank database for DDL modules", () => {
        for (const moduleOrder of [0, 1]) {
            expect(
                getSqlModuleDatasetPolicy({
                    courseSlug: "sql-data-management",
                    moduleOrder,
                }),
            ).toEqual({
                datasetId: "inventory_ops",
                preferredTeachingTable: "inventory_items",
                preferredLabelColumn: "name",
                preferredNumericColumns: ["price"],
            });
        }

        for (const moduleOrder of [2, 3]) {
            expect(
                getSqlModuleDatasetPolicy({
                    courseSlug: "sql-data-management",
                    moduleOrder,
                }),
            ).toEqual({
                datasetId: "ddl_blank",
            });
        }
    });

    it("keeps the numeric API backward compatible", () => {
        expect(getSqlModuleDataset(5)).toBe("sales_kpi");
    });
});
