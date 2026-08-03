// src/lib/subjects/sql/datasets/inventoryOps.ts
export const inventoryOpsDataset = {
    id: "inventory_ops",
    dialect: "sqlite",
    titleKey: "datasets.inventory_ops.title",
    descriptionKey: "datasets.inventory_ops.description",
    schemaSql: `
DROP TABLE IF EXISTS inventory_items;

CREATE TABLE inventory_items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  is_test INTEGER NOT NULL DEFAULT 0,
  notes TEXT NULL,
  last_updated TEXT NOT NULL DEFAULT '2026-02-01'
);
`.trim(),
    seedSql: `
INSERT INTO inventory_items (id, name, category, price, status, is_test, notes, last_updated) VALUES
  (1, 'Sticker Pack', 'Accessories', 4.99, 'active', 0, NULL, '2026-02-01'),
  (2, 'Test Mug', 'Kitchen', 7.50, 'draft', 1, 'Internal sample', '2026-02-03'),
  (3, 'Canvas Print', 'Decor', 45.00, 'active', 0, NULL, '2026-02-02'),
  (4, 'Sample Poster', 'Decor', 12.00, 'inactive', 1, 'Archived test item', '2026-01-29'),
  (5, 'Water Bottle', 'Kitchen', 15.00, 'active', 0, NULL, '2026-02-05'),
  (6, 'Trial Tote', 'Accessories', 9.00, 'draft', 1, 'Trial inventory', '2026-02-06');
`.trim(),
    tableSnapshots: {
        inventory_items: {
            name: "inventory_items",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "name", type: "TEXT" },
                { name: "category", type: "TEXT" },
                { name: "price", type: "REAL" },
                { name: "status", type: "TEXT" },
                { name: "is_test", type: "INTEGER" },
                { name: "notes", type: "TEXT" },
                { name: "last_updated", type: "TEXT" }
            ],
            rows: [
                [1, "Sticker Pack", "Accessories", 4.99, "active", 0, null, "2026-02-01"],
                [2, "Test Mug", "Kitchen", 7.5, "draft", 1, "Internal sample", "2026-02-03"],
                [3, "Canvas Print", "Decor", 45.0, "active", 0, null, "2026-02-02"],
                [4, "Sample Poster", "Decor", 12.0, "inactive", 1, "Archived test item", "2026-01-29"],
                [5, "Water Bottle", "Kitchen", 15.0, "active", 0, null, "2026-02-05"],
                [6, "Trial Tote", "Accessories", 9.0, "draft", 1, "Trial inventory", "2026-02-06"]
            ],
            rowCount: 6
        }
    }
} as const;