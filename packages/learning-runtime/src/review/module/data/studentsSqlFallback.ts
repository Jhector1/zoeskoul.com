export const STUDENTS_INITIAL_TABLE_SNAPSHOTS = {
    students: {
        name: "students",
        columns: [
            { name: "id", type: "INTEGER" },
            { name: "name", type: "TEXT" },
            { name: "grade", type: "INTEGER" },
        ],
        rows: [
            [1, "Ana", 90],
            [2, "Leo", 85],
            [3, "Mina", 95],
        ],
        rowCount: 3,
    },
};

export const STUDENTS_SQL_SCHEMA = `
CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  grade INTEGER
);
`;

export const STUDENTS_SQL_SEED = `
INSERT INTO students (id, name, grade) VALUES
  (1, 'Ana', 90),
  (2, 'Leo', 85),
  (3, 'Mina', 95);
`;