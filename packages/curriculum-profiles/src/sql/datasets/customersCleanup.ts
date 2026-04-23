// src/lib/subjects/sql/datasets/customersCleanup.ts
import {SqlDatasetArtifact} from "@zoeskoul/curriculum-contracts";

export const customersCleanupDataset: SqlDatasetArtifact = {
    id: "customers_cleanup",
    dialect: "sqlite",
    titleKey: "datasets.customers_cleanup.title",
    descriptionKey: "datasets.customers_cleanup.description",
    schemaSql: `
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT,
  city TEXT,
  status TEXT NOT NULL,
  signup_date TEXT NOT NULL,
  is_test INTEGER NOT NULL
);
`.trim(),
    seedSql: `
INSERT INTO customers (id, full_name, email, city, status, signup_date, is_test) VALUES
  (1, 'Mia Lopez', 'mia@example.com', 'Chicago', 'active', '2026-01-10', 0),
  (2, 'Leo Grant', NULL, 'Houston', 'inactive', '2026-01-12', 0),
  (3, ' Ava Patel ', 'ava@example.com', 'Chicago', 'active', '2026-01-15', 0),
  (4, 'Noah Kim', 'noah@test.com', NULL, 'draft', '2026-01-18', 1),
  (5, 'Emma Reed', 'emma@example.com', 'Miami', 'active', '2026-01-22', 0),
  (6, 'Liam Scott', NULL, 'Seattle', 'inactive', '2026-01-25', 0),
  (7, 'Olivia Chen', 'olivia@example.com', 'Chicago', 'active', '2026-02-01', 0),
  (8, 'Test Account', 'test@internal.dev', 'Lab', 'draft', '2026-02-03', 1);
`.trim(),
    tableSnapshots: {
        customers: {
            name: "customers",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "full_name", type: "TEXT" },
                { name: "email", type: "TEXT" },
                { name: "city", type: "TEXT" },
                { name: "status", type: "TEXT" },
                { name: "signup_date", type: "TEXT" },
                { name: "is_test", type: "INTEGER" },
            ],
            rows: [
                [1, "Mia Lopez", "mia@example.com", "Chicago", "active", "2026-01-10", 0],
                [2, "Leo Grant", null, "Houston", "inactive", "2026-01-12", 0],
                [3, " Ava Patel ", "ava@example.com", "Chicago", "active", "2026-01-15", 0],
                [4, "Noah Kim", "noah@test.com", null, "draft", "2026-01-18", 1],
                [5, "Emma Reed", "emma@example.com", "Miami", "active", "2026-01-22", 0],
                [6, "Liam Scott", null, "Seattle", "inactive", "2026-01-25", 0],
                [7, "Olivia Chen", "olivia@example.com", "Chicago", "active", "2026-02-01", 0],
                [8, "Test Account", "test@internal.dev", "Lab", "draft", "2026-02-03", 1],
            ],
            rowCount: 8,
        },
    },
} as const;