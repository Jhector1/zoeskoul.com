// src/lib/subjects/sql/datasets/productsCatalog.ts
import {SqlDatasetArtifact} from "@zoeskoul/curriculum-contracts";

export const productsCatalogDataset :SqlDatasetArtifact  = {
    id: "products_catalog",
    dialect: "sqlite",
    titleKey: "datasets.products_catalog.title",
    descriptionKey: "datasets.products_catalog.description",
    schemaSql: `
DROP TABLE IF EXISTS products;

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  stock INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
`.trim(),
    seedSql: `
INSERT INTO products (id, name, category, price, stock, created_at) VALUES
  (1, 'Sketchbook', 'Art', 12.99, 25, '2026-01-10'),
  (2, 'Acrylic Paint Set', 'Art', 24.50, 10, '2026-02-02'),
  (3, 'Desk Lamp', 'Home', 39.99, 8, '2025-12-20'),
  (4, 'Notebook', 'Stationery', 6.75, 50, '2026-02-14'),
  (5, 'Fountain Pen', 'Stationery', 18.00, 15, '2026-01-25'),
  (6, 'Office Chair', 'Home', 129.00, 3, '2025-11-05');
`.trim(),
    tableSnapshots: {
        products: {
            name: "products",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "name", type: "TEXT" },
                { name: "category", type: "TEXT" },
                { name: "price", type: "REAL" },
                { name: "stock", type: "INTEGER" },
                { name: "created_at", type: "TEXT" },
            ],
            rows: [
                [1, "Sketchbook", "Art", 12.99, 25, "2026-01-10"],
                [2, "Acrylic Paint Set", "Art", 24.5, 10, "2026-02-02"],
                [3, "Desk Lamp", "Home", 39.99, 8, "2025-12-20"],
                [4, "Notebook", "Stationery", 6.75, 50, "2026-02-14"],
                [5, "Fountain Pen", "Stationery", 18.0, 15, "2026-01-25"],
                [6, "Office Chair", "Home", 129.0, 3, "2025-11-05"],
            ],
            rowCount: 6,
        },
    },
} as const;