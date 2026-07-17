import type { SqlDatasetArtifact } from "@zoeskoul/curriculum-contracts";

/**
 * Legacy SQL V2 order-summary dataset.
 *
 * Keep this artifact intentionally limited to the `orders` table. The
 * reporting course uses the dedicated `sales_reporting` dataset so learner
 * workspaces, compiler goldens, and cached browser databases cannot collide.
 */
export const salesKpiDataset: SqlDatasetArtifact = {
    id: "sales_kpi",
    dialect: "sqlite",
    titleKey: "datasets.sales_kpi.title",
    descriptionKey: "datasets.sales_kpi.description",
    schemaSql: `
DROP TABLE IF EXISTS orders;

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_name TEXT NOT NULL,
  region TEXT NOT NULL,
  category TEXT NOT NULL,
  order_date TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  status TEXT NOT NULL
);
`.trim(),
    seedSql: `
INSERT INTO orders (id, customer_name, region, category, order_date, quantity, unit_price, status) VALUES
  (1, 'Mia', 'North', 'Art', '2026-01-05', 2, 24.50, 'paid'),
  (2, 'Leo', 'North', 'Stationery', '2026-01-06', 10, 6.75, 'paid'),
  (3, 'Ava', 'South', 'Home', '2026-01-09', 1, 129.00, 'paid'),
  (4, 'Noor', 'North', 'Art', '2026-01-11', 3, 12.99, 'refunded'),
  (5, 'Zane', 'West', 'Home', '2026-01-13', 2, 39.99, 'paid'),
  (6, 'Mia', 'North', 'Stationery', '2026-01-16', 4, 18.00, 'paid'),
  (7, 'Elena', 'South', 'Art', '2026-01-18', 1, 24.50, 'paid'),
  (8, 'Daniel', 'West', 'Stationery', '2026-01-20', 12, 6.75, 'pending');
`.trim(),
    tableSnapshots: {
        orders: {
            name: "orders",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "customer_name", type: "TEXT" },
                { name: "region", type: "TEXT" },
                { name: "category", type: "TEXT" },
                { name: "order_date", type: "TEXT" },
                { name: "quantity", type: "INTEGER" },
                { name: "unit_price", type: "REAL" },
                { name: "status", type: "TEXT" },
            ],
            rows: [
                [1, "Mia", "North", "Art", "2026-01-05", 2, 24.5, "paid"],
                [2, "Leo", "North", "Stationery", "2026-01-06", 10, 6.75, "paid"],
                [3, "Ava", "South", "Home", "2026-01-09", 1, 129.0, "paid"],
                [4, "Noor", "North", "Art", "2026-01-11", 3, 12.99, "refunded"],
                [5, "Zane", "West", "Home", "2026-01-13", 2, 39.99, "paid"],
                [6, "Mia", "North", "Stationery", "2026-01-16", 4, 18.0, "paid"],
                [7, "Elena", "South", "Art", "2026-01-18", 1, 24.5, "paid"],
                [8, "Daniel", "West", "Stationery", "2026-01-20", 12, 6.75, "pending"],
            ],
            rowCount: 8,
        },
    },
};
