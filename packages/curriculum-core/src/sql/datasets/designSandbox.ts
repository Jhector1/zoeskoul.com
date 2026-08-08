import {SqlDatasetArtifact} from "@zoeskoul/curriculum-contracts";

export const designSandboxDataset: SqlDatasetArtifact = {
    id: "design_sandbox",
    dialect: "sqlite",
    titleKey: "datasets.design_sandbox.title",
    descriptionKey: "datasets.design_sandbox.description",
    schemaSql: `
DROP TABLE IF EXISTS store_products;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS stores;

CREATE TABLE stores (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE store_products (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  stock INTEGER NOT NULL,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
`.trim(),
    seedSql: `
INSERT INTO stores (id, name, city) VALUES
  (1, 'North Market', 'Chicago'),
  (2, 'South Studio', 'Houston'),
  (3, 'West Corner', 'Seattle');

INSERT INTO products (id, name, category) VALUES
  (1, 'Sketchbook', 'Art'),
  (2, 'Desk Lamp', 'Home'),
  (3, 'Notebook', 'Stationery'),
  (4, 'Water Bottle', 'Accessories');

INSERT INTO store_products (id, store_id, product_id, stock) VALUES
  (1, 1, 1, 18),
  (2, 1, 3, 42),
  (3, 2, 2, 7),
  (4, 2, 4, 15),
  (5, 3, 1, 9),
  (6, 3, 2, 5);
`.trim(),
    tableSnapshots: {
        stores: {
            name: "stores",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "name", type: "TEXT" },
                { name: "city", type: "TEXT" },
            ],
            rows: [
                [1, "North Market", "Chicago"],
                [2, "South Studio", "Houston"],
                [3, "West Corner", "Seattle"],
            ],
            rowCount: 3,
        },
        products: {
            name: "products",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "name", type: "TEXT" },
                { name: "category", type: "TEXT" },
            ],
            rows: [
                [1, "Sketchbook", "Art"],
                [2, "Desk Lamp", "Home"],
                [3, "Notebook", "Stationery"],
                [4, "Water Bottle", "Accessories"],
            ],
            rowCount: 4,
        },
        store_products: {
            name: "store_products",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "store_id", type: "INTEGER" },
                { name: "product_id", type: "INTEGER" },
                { name: "stock", type: "INTEGER" },
            ],
            rows: [
                [1, 1, 1, 18],
                [2, 1, 3, 42],
                [3, 2, 2, 7],
                [4, 2, 4, 15],
                [5, 3, 1, 9],
                [6, 3, 2, 5],
            ],
            rowCount: 6,
        },
    },
};
