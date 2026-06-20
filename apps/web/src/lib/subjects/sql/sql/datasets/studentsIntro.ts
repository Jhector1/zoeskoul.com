// src/lib/subjects/sql/datasets/studentsIntro.ts
export const studentsIntroDataset = {
    id: "students_intro",
    dialect: "sqlite",
    titleKey: "datasets.students_intro.title",
    descriptionKey: "datasets.students_intro.description",
    schemaSql: `
DROP TABLE IF EXISTS students;

CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  grade TEXT NOT NULL,
  age INTEGER NOT NULL,
  city TEXT NOT NULL
);
`.trim(),
    seedSql: `
INSERT INTO students (id, name, grade, age, city) VALUES
  (1, 'Noor', 'A', 15, 'Chicago'),
  (2, 'Mia', 'A', 14, 'Evanston'),
  (3, 'Leo', 'B', 15, 'Chicago'),
  (4, 'Ava', 'C', 14, 'Oak Park'),
  (5, 'Zane', 'B', 16, 'Naperville');
`.trim(),
    tableSnapshots: {
        students: {
            name: "students",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "name", type: "TEXT" },
                { name: "grade", type: "TEXT" },
                { name: "age", type: "INTEGER" },
                { name: "city", type: "TEXT" },
            ],
            rows: [
                [1, "Noor", "A", 15, "Chicago"],
                [2, "Mia", "A", 14, "Evanston"],
                [3, "Leo", "B", 15, "Chicago"],
                [4, "Ava", "C", 14, "Oak Park"],
                [5, "Zane", "B", 16, "Naperville"],
            ],
            rowCount: 5,
        },
    },
} as const;