// src/lib/subjects/sql/datasets/schoolRelationsIntro.ts
export const schoolRelationsIntroDataset = {
    id: "school_relations_intro",
    dialect: "sqlite",
    titleKey: "datasets.school_relations_intro.title",
    descriptionKey: "datasets.school_relations_intro.description",
    schemaSql: `
DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS students;

CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  grade_level INTEGER NOT NULL
);

CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE courses (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  department_id INTEGER NOT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE enrollments (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  term TEXT NOT NULL,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (course_id) REFERENCES courses(id)
);
`.trim(),
    seedSql: `
INSERT INTO students (id, name, grade_level) VALUES
  (1, 'Mia', 9),
  (2, 'Leo', 10),
  (3, 'Ava', 10),
  (4, 'Noah', 11),
  (5, 'Emma', 12),
  (6, 'Liam', 11);

INSERT INTO departments (id, name) VALUES
  (1, 'Science'),
  (2, 'Math'),
  (3, 'Humanities'),
  (4, 'Technology'),
  (5, 'Arts');

INSERT INTO courses (id, title, department_id) VALUES
  (1, 'Biology', 1),
  (2, 'Algebra II', 2),
  (3, 'World History', 3),
  (4, 'Computer Basics', 4),
  (5, 'Creative Writing', 3);

INSERT INTO enrollments (id, student_id, course_id, term) VALUES
  (1, 1, 1, 'Spring 2026'),
  (2, 1, 2, 'Spring 2026'),
  (3, 2, 2, 'Spring 2026'),
  (4, 2, 3, 'Spring 2026'),
  (5, 3, 4, 'Spring 2026'),
  (6, 4, 1, 'Spring 2026'),
  (7, 4, 4, 'Spring 2026'),
  (8, 5, 3, 'Spring 2026');
`.trim(),
    tableSnapshots: {
        students: {
            name: "students",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "name", type: "TEXT" },
                { name: "grade_level", type: "INTEGER" }
            ],
            rows: [
                [1, "Mia", 9],
                [2, "Leo", 10],
                [3, "Ava", 10],
                [4, "Noah", 11],
                [5, "Emma", 12],
                [6, "Liam", 11]
            ],
            rowCount: 6
        },
        departments: {
            name: "departments",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "name", type: "TEXT" }
            ],
            rows: [
                [1, "Science"],
                [2, "Math"],
                [3, "Humanities"],
                [4, "Technology"],
                [5, "Arts"]
            ],
            rowCount: 5
        },
        courses: {
            name: "courses",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "title", type: "TEXT" },
                { name: "department_id", type: "INTEGER" }
            ],
            rows: [
                [1, "Biology", 1],
                [2, "Algebra II", 2],
                [3, "World History", 3],
                [4, "Computer Basics", 4],
                [5, "Creative Writing", 3]
            ],
            rowCount: 5
        },
        enrollments: {
            name: "enrollments",
            columns: [
                { name: "id", type: "INTEGER" },
                { name: "student_id", type: "INTEGER" },
                { name: "course_id", type: "INTEGER" },
                { name: "term", type: "TEXT" }
            ],
            rows: [
                [1, 1, 1, "Spring 2026"],
                [2, 1, 2, "Spring 2026"],
                [3, 2, 2, "Spring 2026"],
                [4, 2, 3, "Spring 2026"],
                [5, 3, 4, "Spring 2026"],
                [6, 4, 1, "Spring 2026"],
                [7, 4, 4, "Spring 2026"],
                [8, 5, 3, "Spring 2026"]
            ],
            rowCount: 8
        }
    }
} as const;