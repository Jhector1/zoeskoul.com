import {SqlDatasetArtifact} from "@zoeskoul/curriculum-contracts";

export const capstoneSandboxDataset: SqlDatasetArtifact = {
    id: "capstone_sandbox",
    dialect: "sqlite",
    titleKey: "datasets.capstone_sandbox.title",
    descriptionKey: "datasets.capstone_sandbox.description",
    schemaSql: `
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  city TEXT NOT NULL
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  order_date TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
`.trim(),
    seedSql: `
INSERT INTO customers (id, full_name, city) VALUES
  (1, 'Mia Lopez', 'Chicago'),
  (2, 'Leo Grant', 'Houston'),
  (3, 'Ava Patel', 'Seattle'),
  (4, 'Noah Kim', 'Chicago');

INSERT INTO products (id, name, category, price) VALUES
  (1, 'Sketchbook', 'Art', 12.99),
  (2, 'Desk Lamp', 'Home', 39.99),
  (3, 'Notebook', 'Stationery', 6.75),
  (4, 'Water Bottle', 'Accessories', 15.00);

INSERT INTO orders (id, customer_id, order_date, status) VALUES
  (1, 1, '2026-03-01', 'paid'),
  (2, 2, '2026-03-03', 'paid'),
  (3, 1, '2026-03-05', 'pending'),
  (4, 4, '2026-03-06', 'paid');

INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES
  (1, 1, 1, 2, 12.99),
  (2, 1, 3, 4, 6.75),
  (3, 2, 2, 1, 39.99),
  (4, 2, 4, 2, 15.00),
  (5, 3, 3, 10, 6.75),
  (6, 4, 1, 1, 12.99),
  (7, 4, 2, 1, 39.99);
`.trim(),
    tableSnapshots: {
        customers: {
            name: "customers",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "full_name", type: "TEXT" },
                { name: "city", type: "TEXT" },
            ],
            rows: [
                [1, "Mia Lopez", "Chicago"],
                [2, "Leo Grant", "Houston"],
                [3, "Ava Patel", "Seattle"],
                [4, "Noah Kim", "Chicago"],
            ],
            rowCount: 4,
        },
        products: {
            name: "products",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "name", type: "TEXT" },
                { name: "category", type: "TEXT" },
                { name: "price", type: "REAL" },
            ],
            rows: [
                [1, "Sketchbook", "Art", 12.99],
                [2, "Desk Lamp", "Home", 39.99],
                [3, "Notebook", "Stationery", 6.75],
                [4, "Water Bottle", "Accessories", 15.0],
            ],
            rowCount: 4,
        },
        orders: {
            name: "orders",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "customer_id", type: "INTEGER" },
                { name: "order_date", type: "TEXT" },
                { name: "status", type: "TEXT" },
            ],
            rows: [
                [1, 1, "2026-03-01", "paid"],
                [2, 2, "2026-03-03", "paid"],
                [3, 1, "2026-03-05", "pending"],
                [4, 4, "2026-03-06", "paid"],
            ],
            rowCount: 4,
        },
        order_items: {
            name: "order_items",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "order_id", type: "INTEGER" },
                { name: "product_id", type: "INTEGER" },
                { name: "quantity", type: "INTEGER" },
                { name: "unit_price", type: "REAL" },
            ],
            rows: [
                [1, 1, 1, 2, 12.99],
                [2, 1, 3, 4, 6.75],
                [3, 2, 2, 1, 39.99],
                [4, 2, 4, 2, 15.0],
                [5, 3, 3, 10, 6.75],
                [6, 4, 1, 1, 12.99],
                [7, 4, 2, 1, 39.99],
            ],
            rowCount: 7,
        },
    },
};
