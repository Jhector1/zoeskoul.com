import type { SqlDatasetArtifact } from "@zoeskoul/curriculum-contracts";

/**
 * Dedicated single-table dataset for SQL Analysis & Reporting.
 *
 * The stable dataset id deliberately differs from `sales_kpi`. This gives the
 * browser runtime a new persistence/cache key and guarantees that reporting
 * exercises receive the same schema used by compiler semantic and golden
 * validation.
 */
export const salesReportingDataset: SqlDatasetArtifact = {
    id: "sales_reporting",
    dialect: "sqlite",
    titleKey: "datasets.sales_reporting.title",
    descriptionKey: "datasets.sales_reporting.description",
    schemaSql: `
DROP TABLE IF EXISTS sales_reporting;

CREATE TABLE sales_reporting (
  order_id INTEGER PRIMARY KEY,
  order_date TEXT NOT NULL,
  region TEXT NOT NULL,
  category TEXT NOT NULL,
  product_name TEXT NOT NULL,
  sales_rep TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  discount_pct REAL,
  order_status TEXT NOT NULL,
  customer_rating REAL
);
`.trim(),
    seedSql: `
INSERT INTO sales_reporting (
  order_id,
  order_date,
  region,
  category,
  product_name,
  sales_rep,
  quantity,
  unit_price,
  discount_pct,
  order_status,
  customer_rating
) VALUES
  (101, '2026-01-03', 'North', 'Art', 'Watercolor Set', 'Maya', 3, 28.00, 10.0, 'Completed', 4.8),
  (102, '2026-01-07', 'North', 'Art', 'Canvas Pack', 'Maya', 5, 12.00, NULL, 'Pending', NULL),
  (103, '2026-01-09', 'North', 'Stationery', 'Notebook Bundle', 'Jon', 8, 9.50, 5.0, 'Completed', 4.4),
  (104, '2026-01-12', 'North', 'Stationery', 'Desk Planner', 'Jon', 4, 18.00, 0.0, 'Completed', 4.4),
  (105, '2026-01-15', 'North', 'Tech', 'Wireless Mouse', 'Maya', 2, 34.00, 15.0, 'Cancelled', 3.2),
  (106, '2026-01-18', 'North', 'Tech', 'USB-C Hub', 'Jon', 3, 45.00, NULL, 'Completed', 4.7),
  (107, '2026-01-04', 'South', 'Home', 'Storage Basket', 'Priya', 6, 16.00, 10.0, 'Completed', 4.5),
  (108, '2026-01-08', 'South', 'Home', 'Table Lamp', 'Priya', 2, 52.00, 5.0, 'Pending', NULL),
  (109, '2026-01-11', 'South', 'Art', 'Marker Set', 'Luis', 4, 21.00, 0.0, 'Completed', 4.1),
  (110, '2026-01-14', 'South', 'Art', 'Sketchbook', 'Luis', 7, 11.00, NULL, 'Completed', 4.6),
  (111, '2026-01-19', 'South', 'Tech', 'Laptop Stand', 'Priya', 2, 48.00, 20.0, 'Cancelled', 2.9),
  (112, '2026-01-23', 'South', 'Tech', 'Webcam', 'Luis', 3, 62.00, 10.0, 'Completed', 4.9),
  (113, '2026-01-05', 'East', 'Stationery', 'Pen Pack', 'Avery', 10, 6.00, 5.0, 'Completed', 4.0),
  (114, '2026-01-10', 'East', 'Stationery', 'Folder Set', 'Avery', 5, 8.00, NULL, 'Pending', NULL),
  (115, '2026-01-13', 'East', 'Home', 'Wall Clock', 'Nora', 2, 36.00, 0.0, 'Completed', 4.3),
  (116, '2026-01-17', 'East', 'Home', 'Throw Pillow', 'Nora', 4, 24.00, 10.0, 'Completed', 4.3),
  (117, '2026-01-21', 'East', 'Tech', 'Keyboard', 'Avery', 3, 40.00, 5.0, 'Completed', 4.6),
  (118, '2026-01-25', 'East', 'Tech', 'Portable Charger', 'Nora', 4, 30.00, NULL, 'Pending', 3.8),
  (119, '2026-01-06', 'West', 'Art', 'Acrylic Paint Set', 'Owen', 3, 32.00, 10.0, 'Completed', 4.7),
  (120, '2026-01-16', 'West', 'Art', 'Brush Set', 'Owen', 6, 14.00, 0.0, 'Completed', 4.2),
  (121, '2026-01-20', 'West', 'Home', 'Kitchen Organizer', 'Sofia', 3, 27.00, 15.0, 'Cancelled', 3.0),
  (122, '2026-01-24', 'West', 'Home', 'Bath Towel Set', 'Sofia', 5, 22.00, NULL, 'Completed', 4.5),
  (123, '2026-01-27', 'West', 'Stationery', 'Label Pack', 'Owen', 9, 7.00, 5.0, 'Completed', 4.1),
  (124, '2026-01-30', 'West', 'Stationery', 'Weekly Planner', 'Sofia', 4, 19.00, 10.0, 'Pending', NULL);
`.trim(),
    tableSnapshots: {
        sales_reporting: {
            name: "sales_reporting",
            columns: [
                { name: "order_id", type: "INTEGER" },
                { name: "order_date", type: "TEXT" },
                { name: "region", type: "TEXT" },
                { name: "category", type: "TEXT" },
                { name: "product_name", type: "TEXT" },
                { name: "sales_rep", type: "TEXT" },
                { name: "quantity", type: "INTEGER" },
                { name: "unit_price", type: "REAL" },
                { name: "discount_pct", type: "REAL" },
                { name: "order_status", type: "TEXT" },
                { name: "customer_rating", type: "REAL" },
            ],
            rows: [
                [101, "2026-01-03", "North", "Art", "Watercolor Set", "Maya", 3, 28.0, 10.0, "Completed", 4.8],
                [102, "2026-01-07", "North", "Art", "Canvas Pack", "Maya", 5, 12.0, null, "Pending", null],
                [103, "2026-01-09", "North", "Stationery", "Notebook Bundle", "Jon", 8, 9.5, 5.0, "Completed", 4.4],
                [104, "2026-01-12", "North", "Stationery", "Desk Planner", "Jon", 4, 18.0, 0.0, "Completed", 4.4],
                [105, "2026-01-15", "North", "Tech", "Wireless Mouse", "Maya", 2, 34.0, 15.0, "Cancelled", 3.2],
                [106, "2026-01-18", "North", "Tech", "USB-C Hub", "Jon", 3, 45.0, null, "Completed", 4.7],
                [107, "2026-01-04", "South", "Home", "Storage Basket", "Priya", 6, 16.0, 10.0, "Completed", 4.5],
                [108, "2026-01-08", "South", "Home", "Table Lamp", "Priya", 2, 52.0, 5.0, "Pending", null],
                [109, "2026-01-11", "South", "Art", "Marker Set", "Luis", 4, 21.0, 0.0, "Completed", 4.1],
                [110, "2026-01-14", "South", "Art", "Sketchbook", "Luis", 7, 11.0, null, "Completed", 4.6],
                [111, "2026-01-19", "South", "Tech", "Laptop Stand", "Priya", 2, 48.0, 20.0, "Cancelled", 2.9],
                [112, "2026-01-23", "South", "Tech", "Webcam", "Luis", 3, 62.0, 10.0, "Completed", 4.9],
                [113, "2026-01-05", "East", "Stationery", "Pen Pack", "Avery", 10, 6.0, 5.0, "Completed", 4.0],
                [114, "2026-01-10", "East", "Stationery", "Folder Set", "Avery", 5, 8.0, null, "Pending", null],
                [115, "2026-01-13", "East", "Home", "Wall Clock", "Nora", 2, 36.0, 0.0, "Completed", 4.3],
                [116, "2026-01-17", "East", "Home", "Throw Pillow", "Nora", 4, 24.0, 10.0, "Completed", 4.3],
                [117, "2026-01-21", "East", "Tech", "Keyboard", "Avery", 3, 40.0, 5.0, "Completed", 4.6],
                [118, "2026-01-25", "East", "Tech", "Portable Charger", "Nora", 4, 30.0, null, "Pending", 3.8],
                [119, "2026-01-06", "West", "Art", "Acrylic Paint Set", "Owen", 3, 32.0, 10.0, "Completed", 4.7],
                [120, "2026-01-16", "West", "Art", "Brush Set", "Owen", 6, 14.0, 0.0, "Completed", 4.2],
                [121, "2026-01-20", "West", "Home", "Kitchen Organizer", "Sofia", 3, 27.0, 15.0, "Cancelled", 3.0],
                [122, "2026-01-24", "West", "Home", "Bath Towel Set", "Sofia", 5, 22.0, null, "Completed", 4.5],
                [123, "2026-01-27", "West", "Stationery", "Label Pack", "Owen", 9, 7.0, 5.0, "Completed", 4.1],
                [124, "2026-01-30", "West", "Stationery", "Weekly Planner", "Sofia", 4, 19.0, 10.0, "Pending", null],
            ],
            rowCount: 24,
        },
    },
};
