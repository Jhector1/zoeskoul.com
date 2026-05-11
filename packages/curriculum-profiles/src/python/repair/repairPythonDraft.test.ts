import { describe, expect, it } from "vitest";
import { repairPythonDraft } from "./repairPythonDraft.js";

describe("repairPythonDraft", () => {
    it("rewrites stock SQL-flavored hints into Python guidance", async () => {
        const result = await repairPythonDraft({
            seed: { topicId: "python-topic" } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Write Python code.",
                        hint: "Focus on the SQL task being asked for, not on copying final query text.",
                        help: {
                            concept: "Build the query from the operation the exercise is testing.",
                            hint_1: "Think about which clauses or functions are required for the task.",
                            hint_2: "Construct the query based on what result the exercise expects, not by repeating exact solution wording.",
                        },
                        starterCode: "print('hi')\n",
                        solutionCode: "print('hi')\n",
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.hint).toContain("programming task");
        expect(exercise.help.concept).toContain("Build the program");
        expect(exercise.help.hint_1).toContain("Python statements");
        expect(exercise.help.hint_2).toContain("Construct the code");
        expect(result.report.repairs.length).toBe(5);
    });

    it("adds a fallback fill_blank_choice when the planned mix requires one", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "if-elif-else",
                title: "If, Elif, and Else",
                summary: "Control which code runs based on conditions.",
                plannedExerciseCounts: {
                    total: 5,
                    dominantKind: "code_input",
                    counts: {
                        single_choice: 1,
                        multi_choice: 1,
                        drag_reorder: 0,
                        fill_blank_choice: 1,
                        code_input: 2,
                    },
                },
            } as any,
            draft: {
                title: "If, Elif, and Else",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "q1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Write Python code.",
                        hint: "Use if statements.",
                        help: {
                            concept: "Use conditionals.",
                            hint_1: "Compare values.",
                            hint_2: "Return a result.",
                        },
                        starterCode: "def f(x):\n    pass\n",
                        solutionCode: "def f(x):\n    return x\n",
                    },
                    {
                        id: "q2",
                        kind: "code_input",
                        title: "Code 2",
                        prompt: "Write more Python code.",
                        hint: "Use elif.",
                        help: {
                            concept: "Use branches.",
                            hint_1: "Check another condition.",
                            hint_2: "Return a result.",
                        },
                        starterCode: "def g(x):\n    pass\n",
                        solutionCode: "def g(x):\n    return x\n",
                    },
                    {
                        id: "q3",
                        kind: "single_choice",
                        title: "Single",
                        prompt: "Question",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["a", "b", "c"],
                        correctOptionIds: ["a"],
                    },
                    {
                        id: "q4",
                        kind: "multi_choice",
                        title: "Multi",
                        prompt: "Question",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["a", "b", "c"],
                        correctOptionIds: ["a", "b"],
                    },
                ],
            } as any,
        });

        expect(result.draft.quizDraft).toHaveLength(5);
        expect(
            result.draft.quizDraft.some(
                (exercise: any) =>
                    exercise.kind === "fill_blank_choice" &&
                    exercise.correctValue === "elif",
            ),
        ).toBe(true);
    });

    it("adds a fallback code_input when the planned mix requires another one", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "truthiness-and-empty-values",
                title: "Truthiness and Empty Values",
                summary: "Understand falsy values.",
                plannedExerciseCounts: {
                    total: 5,
                    dominantKind: "code_input",
                    counts: {
                        single_choice: 1,
                        multi_choice: 1,
                        drag_reorder: 0,
                        fill_blank_choice: 1,
                        code_input: 2,
                    },
                },
            } as any,
            draft: {
                title: "Truthiness",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "q1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Write Python code.",
                        hint: "Use bool.",
                        help: {
                            concept: "Truthy or falsy.",
                            hint_1: "Check the value.",
                            hint_2: "Return a result.",
                        },
                        starterCode: "def f(x):\n    pass\n",
                        solutionCode: "def f(x):\n    return bool(x)\n",
                    },
                    {
                        id: "q2",
                        kind: "fill_blank_choice",
                        title: "Fill",
                        prompt: "Question",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        template: "___",
                        choices: ["''", "1", "True"],
                        correctValue: "''",
                    },
                    {
                        id: "q3",
                        kind: "single_choice",
                        title: "Single",
                        prompt: "Question",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["0", "1", "2"],
                        correctOptionIds: ["a"],
                    },
                    {
                        id: "q4",
                        kind: "multi_choice",
                        title: "Multi",
                        prompt: "Question",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["''", "0", "1"],
                        correctOptionIds: ["a", "b"],
                    },
                ],
            } as any,
        });

        expect(result.draft.quizDraft).toHaveLength(5);
        expect(
            result.draft.quizDraft.filter((exercise: any) => exercise.kind === "code_input"),
        ).toHaveLength(2);
        expect(
            result.draft.quizDraft.some(
                (exercise: any) =>
                    exercise.kind === "code_input" &&
                    Array.isArray(exercise.tests) &&
                    exercise.tests.length > 0 &&
                    typeof exercise.solutionCode === "string" &&
                    exercise.solutionCode.includes("print("),
            ),
        ).toBe(true);
    });

    it("rewrites function-return tasks into runnable stdin/stdout programs", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "comparisons-and-truth-values",
                title: "Comparisons and Truth Values",
                summary: "Use comparisons and truthiness.",
            } as any,
            draft: {
                title: "Comparisons and Truth Values",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-input-1",
                        kind: "code_input",
                        title: "Check if a number is greater than ten",
                        prompt:
                            "Write a function `is_greater_than_ten(num)` that returns True if `num` is greater than 10, otherwise returns False.",
                        hint: "Use a comparison.",
                        help: {
                            concept: "Return the comparison result.",
                            hint_1: "Compare the number with 10.",
                            hint_2: "Return True or False.",
                        },
                        starterCode:
                            "def is_greater_than_ten(num):\n    # Your code here\n    pass\n",
                        solutionCode:
                            "def is_greater_than_ten(num):\n    return num > 10\n",
                        tests: [
                            { stdin: "15\n", stdout: "True\n" },
                            { stdin: "5\n", stdout: "False\n" },
                        ],
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.prompt).toContain("print the returned result");
        expect(exercise.starterCode).toContain("import ast");
        expect(exercise.starterCode).toContain("print(is_greater_than_ten(num))");
        expect(exercise.solutionCode).toContain("return num > 10");
        expect(exercise.solutionCode).toContain("print(is_greater_than_ten(num))");
        expect(
            result.report.repairs.some(
                (repair) =>
                    repair.code === "PYTHON_FUNCTION_STDOUT_TASK_REPAIRED" ||
                    repair.code === "PYTHON_HARDCODED_FUNCTION_EXAMPLE_REPAIRED",
            ),
        ).toBe(true);
    });

    it("synthesizes tests for a missing positive-negative-zero beginner exercise", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "guard-clauses",
                title: "Guard Clauses",
                summary: "Use early returns with conditionals.",
            } as any,
            draft: {
                title: "Guard Clauses",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "guard-clauses-quiz-1",
                        kind: "code_input",
                        title: "Implement Guard Clauses",
                        prompt:
                            "Write a function that checks if a number is positive, negative, or zero using guard clauses.",
                        hint: "Use guard clauses.",
                        help: {
                            concept: "Return the right label.",
                            hint_1: "Check positive, negative, and zero cases.",
                            hint_2: "Return the matching result.",
                        },
                        starterCode: "def check_number(num):\n    # Your code here\n",
                        solutionCode:
                            "def check_number(num):\n    if num > 0:\n        return 'Positive'\n    if num < 0:\n        return 'Negative'\n    return 'Zero'\n",
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.tests).toEqual([
            { stdin: "5\n", stdout: "Positive\n", match: "exact" },
            { stdin: "-2\n", stdout: "Negative\n", match: "exact" },
            { stdin: "0\n", stdout: "Zero\n", match: "exact" },
        ]);
        expect(exercise.solutionCode).toContain("print(check_number(num))");
        expect(
            result.report.repairs.some((repair) => repair.code === "PYTHON_TESTS_SYNTHESIZED"),
        ).toBe(true);
    });

    it("repairs placeholder boolean tests when the prompt expects string outputs", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "if-elif-else",
                title: "If, Elif, and Else",
                summary: "Control which code runs based on conditions.",
            } as any,
            draft: {
                title: "If, Elif, and Else",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "eligibility",
                        kind: "code_input",
                        title: "Eligibility Checker",
                        prompt:
                            "Create a program that checks if a person is eligible to vote. A person must be at least 18 years old and a citizen. Print 'Eligible' if both conditions are met, otherwise print 'Not eligible'.",
                        hint: "Use and.",
                        help: {
                            concept: "Check both conditions.",
                            hint_1: "Read age and citizenship.",
                            hint_2: "Print the matching message.",
                        },
                        starterCode: "age = 20\nis_citizen = True\n# Your code here\n",
                        solutionCode:
                            "age = 20\nis_citizen = True\nif age >= 18 and is_citizen:\n    print('Eligible')\nelse:\n    print('Not eligible')\n",
                        tests: [{ stdin: "1\n", stdout: "True\n", match: "exact" }],
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.starterCode).toContain("age = int(input())");
        expect(exercise.starterCode).toContain("is_citizen = input().strip().lower() == 'true'");
        expect(exercise.tests).toEqual([
            { stdin: "20\ntrue\n", stdout: "Eligible\n", match: "exact" },
            { stdin: "16\ntrue\n", stdout: "Not eligible\n", match: "exact" },
            { stdin: "20\nfalse\n", stdout: "Not eligible\n", match: "exact" },
        ]);
        expect(
            result.report.repairs.some(
                (repair) => repair.code === "PYTHON_PLACEHOLDER_TESTS_REPAIRED",
            ),
        ).toBe(true);
    });

    it("replaces placeholder boolean tests for no-input class exercises with real solution stdout", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "attributes-and-init",
                title: "Attributes and __init__",
                summary: "Initialize object state with constructor parameters.",
            } as any,
            draft: {
                title: "Attributes and __init__",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "1",
                        kind: "code_input",
                        title: "Create a Class with Attributes",
                        prompt:
                            "Define a class called `Car` that has attributes for `make`, `model`, and `year`. Implement the `__init__` method to initialize these attributes.",
                        hint: "Use __init__.",
                        help: {
                            concept: "Initialize attributes in the constructor.",
                            hint_1: "Assign each parameter to self.",
                            hint_2: "Print the values after creating the object.",
                        },
                        starterCode:
                            "class Car:\n    def __init__(self, make, model, year):\n        pass\n\nmy_car = Car('Toyota', 'Corolla', 2020)\nprint(my_car.make)\nprint(my_car.model)\nprint(my_car.year)\n",
                        solutionCode:
                            "class Car:\n    def __init__(self, make, model, year):\n        self.make = make\n        self.model = model\n        self.year = year\n\nmy_car = Car('Toyota', 'Corolla', 2020)\nprint(my_car.make)\nprint(my_car.model)\nprint(my_car.year)\n",
                        tests: [{ stdin: "1\n", stdout: "True\n", match: "exact" }],
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.tests).toEqual([
            { stdin: "", stdout: "Toyota\nCorolla\n2020\n", match: "exact" },
        ]);
        expect(
            result.report.repairs.some(
                (repair) =>
                    repair.code === "PYTHON_PLACEHOLDER_TESTS_EXECUTION_REPAIRED",
            ),
        ).toBe(true);
    });

    it("converts embedded python harness text in tests.stdin into runnable starter and solution code", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "encapsulation-and-responsibility",
                title: "Encapsulation and Responsibility",
                summary: "Keep related data and behavior together in a class.",
            } as any,
            draft: {
                title: "Encapsulation and Responsibility",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "1",
                        kind: "code_input",
                        title: "Create a Simple Class",
                        prompt:
                            "Define a class called `Car` with attributes for `make`, `model`, and `year`. Include a method `get_info` that returns a string with the car's details.",
                        hint: "Use a class.",
                        help: {
                            concept: "Keep data and behavior together.",
                            hint_1: "Store values in __init__.",
                            hint_2: "Return the description from the method.",
                        },
                        starterCode:
                            "class Car:\n    def __init__(self, make, model, year):\n        # Initialize attributes\n        pass\n\n    def get_info(self):\n        # Return car details\n        pass",
                        solutionCode:
                            "class Car:\n    def __init__(self, make, model, year):\n        self.make = make\n        self.model = model\n        self.year = year\n\n    def get_info(self):\n        return f'{self.year} {self.make} {self.model}'",
                        tests: [
                            {
                                stdin: "my_car = Car('Toyota', 'Corolla', 2020)\nmy_car.get_info()",
                                stdout: "2020 Toyota Corolla",
                            },
                        ],
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.prompt).toContain("print the final result");
        expect(exercise.starterCode).toContain("my_car = Car('Toyota', 'Corolla', 2020)");
        expect(exercise.starterCode).toContain("print(my_car.get_info())");
        expect(exercise.solutionCode).toContain("print(my_car.get_info())");
        expect(exercise.tests).toEqual([
            { stdin: "", stdout: "2020 Toyota Corolla\n", match: "exact" },
        ]);
        expect(
            result.report.repairs.some(
                (repair) => repair.code === "PYTHON_EMBEDDED_HARNESS_REPAIRED",
            ),
        ).toBe(true);
    });

    it("does not print bare class constructor harness lines because object reprs are nondeterministic", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "class-debugging-patterns",
                title: "Class Debugging Patterns",
                summary: "Fix common class mistakes.",
            } as any,
            draft: {
                title: "Class Debugging Patterns",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "debugging-attributes",
                        kind: "code_input",
                        title: "Fix the Dog Class",
                        prompt:
                            "The following Dog class has an error in its constructor. Fix it so that the name attribute is correctly initialized.",
                        hint: "Use self.name.",
                        help: {
                            concept: "Store constructor values on self.",
                            hint_1: "Assign name to self.name.",
                            hint_2: "Print the stable attribute value.",
                        },
                        starterCode:
                            "class Dog:\n    def __init__(self, name):\n        name = name\n\nmy_dog = Dog('Buddy')\nprint(my_dog.name)",
                        solutionCode:
                            "class Dog:\n    def __init__(self, name):\n        self.name = name\n\nmy_dog = Dog('Buddy')\nprint(my_dog.name)",
                        tests: [
                            {
                                stdin: "Dog('Buddy')",
                                stdout: "Buddy",
                                match: "exact",
                            },
                        ],
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.solutionCode).toContain("Dog('Buddy')");
        expect(exercise.solutionCode).not.toContain("print(Dog('Buddy'))");
        expect(exercise.tests).toEqual([
            { stdin: "", stdout: "Buddy\n", match: "exact" },
        ]);
    });

    it("does not duplicate existing example harness code and normalizes expected stdout from execution", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "methods-and-self",
                title: "Methods and self",
                summary: "Add behavior to classes with instance methods.",
            } as any,
            draft: {
                title: "Methods and self",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "q1",
                        kind: "code_input",
                        title: "Create a Simple Class",
                        prompt:
                            "Define a class `Book` with an instance method `get_title` that returns the title of the book.",
                        hint: "Use self.",
                        help: {
                            concept: "Instance methods use self.",
                            hint_1: "Store the title.",
                            hint_2: "Return the title.",
                        },
                        starterCode:
                            "class Book:\n    def __init__(self, title):\n        # Initialize the title attribute\n        pass\n\n    def get_title(self):\n        # Return the title of the book\n        pass\n\n# Example usage:\nmy_book = Book('1984')\nprint(my_book.get_title())  # Should print '1984'",
                        solutionCode:
                            "class Book:\n    def __init__(self, title):\n        self.title = title\n\n    def get_title(self):\n        return self.title\n\n# Example usage:\nmy_book = Book('1984')\nprint(my_book.get_title())  # Should print '1984'",
                        tests: [
                            {
                                stdin: "my_book = Book('1984')\nmy_book.get_title()",
                                stdout: "'1984'",
                                match: "exact",
                            },
                        ],
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.solutionCode.match(/my_book = Book\('1984'\)/g)).toHaveLength(1);
        expect(exercise.solutionCode.match(/print\(my_book\.get_title\(\)\)/g)).toHaveLength(1);
        expect(exercise.tests).toEqual([
            { stdin: "", stdout: "1984\n", match: "exact" },
        ]);
    });

    it("makes class-dependent project steps self-contained by merging sibling class methods", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "classes-and-instances",
                title: "Classes and Instances",
                summary: "Define classes and create individual objects.",
            } as any,
            draft: {
                title: "Classes and Instances",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "1",
                        kind: "code_input",
                        title: "Create a Simple Class",
                        prompt: "Define a class named `Book` with a `get_info()` method.",
                        hint: "Use a class.",
                        help: {
                            concept: "Define attributes and a method.",
                            hint_1: "Store title and author.",
                            hint_2: "Return book info.",
                        },
                        starterCode: "",
                        solutionCode:
                            "class Book:\n    def __init__(self, title, author):\n        self.title = title\n        self.author = author\n\n    def get_info(self):\n        return f'Title: {self.title}, Author: {self.author}'\n",
                        tests: [{ stdin: "", stdout: "", match: "exact" }],
                    },
                    {
                        id: "2",
                        kind: "code_input",
                        title: "Add a Method to Your Class",
                        prompt: "Add an `is_long()` method.",
                        hint: "Use len.",
                        help: {
                            concept: "Methods can inspect attributes.",
                            hint_1: "Use the title length.",
                            hint_2: "Return a boolean.",
                        },
                        starterCode: "",
                        solutionCode:
                            "class Book:\n    def __init__(self, title, author):\n        self.title = title\n        self.author = author\n\n    def is_long(self):\n        return len(self.title) > 10\n",
                    },
                    {
                        id: "3",
                        kind: "code_input",
                        title: "Instantiate and Use Your Class",
                        prompt:
                            "Create an instance of the `Book` class with the title 'To Kill a Mockingbird' and author 'Harper Lee'. Print the book info and check if it's long.",
                        hint: "Create the object.",
                        help: {
                            concept: "Use the class after defining it.",
                            hint_1: "Instantiate Book.",
                            hint_2: "Call both methods.",
                        },
                        starterCode:
                            "book = Book('To Kill a Mockingbird', 'Harper Lee')\n# Print book info\n# Check if the book title is long",
                        solutionCode:
                            "book = Book('To Kill a Mockingbird', 'Harper Lee')\nprint(book.get_info())\nprint(book.is_long())",
                        tests: [{ stdin: "1\n", stdout: "True\n", match: "exact" }],
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[2] as any;
        expect(exercise.solutionCode).toContain("class Book:");
        expect(exercise.solutionCode).toContain("def get_info(self):");
        expect(exercise.solutionCode).toContain("def is_long(self):");
        expect(exercise.tests).toEqual([
            {
                stdin: "",
                stdout: "Title: To Kill a Mockingbird, Author: Harper Lee\nTrue\n",
                match: "exact",
            },
        ]);
        expect(
            result.report.repairs.some(
                (repair) =>
                    repair.code === "PYTHON_CROSS_EXERCISE_CLASS_CONTEXT_REPAIRED",
            ),
        ).toBe(true);
        expect(
            result.report.repairs.some(
                (repair) => repair.code === "PYTHON_CROSS_EXERCISE_TESTS_REPAIRED",
            ),
        ).toBe(true);
    });

    it("adds missing oop support getters used by a generated solution", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "encapsulation-and-responsibility",
                title: "Encapsulation and Responsibility",
                summary: "Keep related data and behavior together in a class.",
            } as any,
            draft: {
                title: "Encapsulation and Responsibility",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "3",
                        kind: "code_input",
                        title: "Create a Private Attribute",
                        prompt:
                            "Modify the `BankAccount` class to include a method `withdraw` that decreases the balance by a specified amount, ensuring that the balance does not go negative. Use the provided object creation code to print the final result.",
                        hint: "Use a method.",
                        help: {
                            concept: "Private attributes should be read through methods.",
                            hint_1: "Subtract only when enough balance exists.",
                            hint_2: "Print the balance after withdrawing.",
                        },
                        starterCode:
                            "class BankAccount:\n    def __init__(self, balance):\n        self.__balance = balance\n\n    def deposit(self, amount):\n        self.__balance += amount\n\n    # Add withdraw method here\n\naccount = BankAccount(100)\naccount.withdraw(50)\nprint(account.get_balance())",
                        solutionCode:
                            "class BankAccount:\n    def __init__(self, balance):\n        self.__balance = balance\n\n    def deposit(self, amount):\n        self.__balance += amount\n\n    def withdraw(self, amount):\n        if amount <= self.__balance:\n            self.__balance -= amount\n        else:\n            return 'Insufficient funds'\n\naccount = BankAccount(100)\naccount.withdraw(50)\nprint(account.get_balance())",
                        tests: [{ stdin: "", stdout: "50", match: "exact" }],
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.starterCode).toContain("def get_balance(self):");
        expect(exercise.solutionCode).toContain("def get_balance(self):");
        expect(exercise.tests).toEqual([
            { stdin: "", stdout: "50\n", match: "exact" },
        ]);
        expect(
            result.report.repairs.some(
                (repair) =>
                    repair.code === "PYTHON_MISSING_OOP_SUPPORT_METHOD_REPAIRED",
            ),
        ).toBe(true);
    });

    it("makes no-output list construction exercises observable", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "lists-of-objects",
                title: "Lists of Objects",
                summary: "Manage multiple instances and summarize their data.",
            } as any,
            draft: {
                title: "Lists of Objects",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "1",
                        kind: "code_input",
                        title: "Create a List of Objects",
                        prompt:
                            "Define a class `Book` with attributes `title` and `author`. Create a list of at least three `Book` instances.",
                        hint: "Create several objects.",
                        help: {
                            concept: "Lists can hold object instances.",
                            hint_1: "Instantiate the class more than once.",
                            hint_2: "Store the objects in a list.",
                        },
                        starterCode:
                            "class Book:\n    def __init__(self, title, author):\n        self.title = title\n        self.author = author\n\n# Create your list of Book instances here\nbooks = []",
                        solutionCode:
                            "class Book:\n    def __init__(self, title, author):\n        self.title = title\n        self.author = author\n\nbook1 = Book('1984', 'George Orwell')\nbook2 = Book('To Kill a Mockingbird', 'Harper Lee')\nbook3 = Book('The Great Gatsby', 'F. Scott Fitzgerald')\nbooks = [book1, book2, book3]",
                        tests: [{ stdin: "1\n", stdout: "True\n", match: "exact" }],
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.prompt).toContain("print the number of items");
        expect(exercise.starterCode).toContain("print(len(books))");
        expect(exercise.solutionCode).toContain("print(len(books))");
        expect(exercise.tests).toEqual([
            { stdin: "", stdout: "3\n", match: "exact" },
        ]);
        expect(
            result.report.repairs.some(
                (repair) => repair.code === "PYTHON_NO_OUTPUT_LIST_TASK_REPAIRED",
            ),
        ).toBe(true);
    });

    it("repairs narrative placeholder tests and shared list setup across object-list steps", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "lists-of-objects",
                title: "Lists of Objects",
                summary: "Manage multiple instances and summarize their data.",
            } as any,
            draft: {
                title: "Lists of Objects",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "1",
                        kind: "code_input",
                        title: "Create a List of Objects",
                        prompt:
                            "Define a class `Book` with attributes `title` and `author`. Create at least three instances of `Book` and store them in a list.",
                        hint: "Create several objects.",
                        help: {
                            concept: "Lists can hold object instances.",
                            hint_1: "Instantiate the class more than once.",
                            hint_2: "Store the objects in a list.",
                        },
                        starterCode: "",
                        solutionCode:
                            "class Book:\n    def __init__(self, title, author):\n        self.title = title\n        self.author = author\n\nbook1 = Book('1984', 'George Orwell')\nbook2 = Book('To Kill a Mockingbird', 'Harper Lee')\nbook3 = Book('The Great Gatsby', 'F. Scott Fitzgerald')\nbooks = [book1, book2, book3]",
                        tests: [
                            {
                                stdin: "",
                                stdout: "books should contain 3 Book instances.",
                            },
                        ],
                    },
                    {
                        id: "2",
                        kind: "code_input",
                        title: "Print Books",
                        prompt:
                            "Using the list of `Book` objects you created, write a function that prints the title and author of each book.",
                        hint: "Loop over books.",
                        help: {
                            concept: "Use objects stored in a list.",
                            hint_1: "Read each object's attributes.",
                            hint_2: "Print stable values.",
                        },
                        starterCode: "",
                        solutionCode:
                            "def print_books(books):\n    for book in books:\n        print(f'Title: {book.title}, Author: {book.author}')\n\nprint_books(books)",
                        tests: [
                            {
                                stdin: "",
                                stdout: "Should print the title and author of each book.",
                            },
                        ],
                    },
                    {
                        id: "3",
                        kind: "code_input",
                        title: "Count Books by Author",
                        prompt:
                            "Write a function that counts how many books are written by a specific author from the list of `Book` objects.",
                        hint: "Compare the author.",
                        help: {
                            concept: "Functions can summarize a list of objects.",
                            hint_1: "Loop over books.",
                            hint_2: "Return the count.",
                        },
                        starterCode: "",
                        solutionCode:
                            "def count_books_by_author(books, author):\n    count = 0\n    for book in books:\n        if book.author == author:\n            count += 1\n    return count\n\ncount_books_by_author(books, 'George Orwell')",
                        tests: [
                            {
                                stdin: "",
                                stdout: "Should return the count of books by the specified author.",
                            },
                        ],
                    },
                ],
            } as any,
        });

        const createList = result.draft.quizDraft[0] as any;
        const printBooks = result.draft.quizDraft[1] as any;
        const countBooks = result.draft.quizDraft[2] as any;

        expect(createList.tests).toEqual([
            { stdin: "", stdout: "3\n", match: "exact" },
        ]);
        expect(printBooks.solutionCode).toContain("books = [book1, book2, book3]");
        expect(printBooks.tests[0].stdout).toContain("Title: 1984, Author: George Orwell");
        expect(countBooks.solutionCode).toContain(
            "print(count_books_by_author(books, 'George Orwell'))",
        );
        expect(countBooks.tests).toEqual([
            { stdin: "", stdout: "1\n", match: "exact" },
        ]);
    });

    it("rewrites hardcoded function example usage into stdin stdout execution", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "operators-and-expressions",
                title: "Operators and Expressions",
                summary: "Use operators to calculate values.",
            } as any,
            draft: {
                title: "Operators and Expressions",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "q5",
                        kind: "code_input",
                        title: "Calculate the area of a rectangle.",
                        prompt:
                            "Write a Python function that calculates the area of a rectangle given its width and height.",
                        hint: "Multiply width and height.",
                        help: {
                            concept: "Area comes from multiplication.",
                            hint_1: "Return width times height.",
                            hint_2: "Read the tested values from input and print the result.",
                        },
                        starterCode:
                            "def calculate_area(width, height):\n    # Your code here\n    pass",
                        solutionCode:
                            "def calculate_area(width, height):\n    area = width * height\n    return area\n\n# Example usage:\nprint(calculate_area(5, 10))",
                        tests: [
                            { stdin: "5\n10\n", stdout: "50\n", match: "exact" },
                            { stdin: "7\n3\n", stdout: "21\n", match: "exact" },
                        ],
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.solutionCode).toContain("import ast");
        expect(exercise.solutionCode).toContain("print(calculate_area(width, height))");
        expect(exercise.solutionCode).not.toContain("# Example usage:");
        expect(
            result.report.repairs.some(
                (repair) =>
                    repair.code === "PYTHON_HARDCODED_FUNCTION_EXAMPLE_REPAIRED",
            ),
        ).toBe(true);
    });

    it("removes input prompt text from fixed-test python programs", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "if-statements",
                title: "If Statements",
                summary: "Branch on conditions.",
            } as any,
            draft: {
                title: "If Statements",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "5",
                        kind: "code_input",
                        title: "Implement an If Statement",
                        prompt:
                            "Write a program that checks if a number is positive, negative, or zero.",
                        hint: "Use if elif else.",
                        help: {
                            concept: "Check each case in order.",
                            hint_1: "Compare the number with zero.",
                            hint_2: "Print one matching label.",
                        },
                        starterCode:
                            "number = int(input('Enter a number: '))\n# Your code here",
                        solutionCode:
                            "number = int(input('Enter a number: '))\nif number > 0:\n    print('Positive')\nelif number < 0:\n    print('Negative')\nelse:\n    print('Zero')",
                        tests: [
                            { stdin: "5\n", stdout: "Positive\n", match: "exact" },
                        ],
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.starterCode).toContain("input()");
        expect(exercise.solutionCode).toContain("input()");
        expect(exercise.solutionCode).not.toContain("Enter a number:");
        expect(
            result.report.repairs.some(
                (repair) => repair.code === "PYTHON_INPUT_PROMPT_REMOVED",
            ),
        ).toBe(true);
    });

    it("makes no-output class method exercises observable", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "methods-and-self",
                title: "Methods and self",
                summary: "Add behavior to classes with instance methods.",
            } as any,
            draft: {
                title: "Methods and self",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "create-method",
                        kind: "code_input",
                        title: "Create a Method",
                        prompt:
                            "Define a class `Car` with a method `drive` that returns a string indicating the car is driving.",
                        hint: "Use self.",
                        help: {
                            concept: "Methods belong inside classes.",
                            hint_1: "Create the method with self.",
                            hint_2: "Return a string from the method.",
                        },
                        starterCode:
                            "class Car:\n    def __init__(self, model):\n        self.model = model\n\n    # Define the drive method here",
                        solutionCode:
                            "class Car:\n    def __init__(self, model):\n        self.model = model\n\n    def drive(self):\n        return f'The {self.model} is driving!'",
                        tests: [{ stdin: "1\n", stdout: "True\n", match: "exact" }],
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.prompt).toContain("print the method result");
        expect(exercise.starterCode).toContain("car = Car('Corolla')");
        expect(exercise.starterCode).toContain("print(car.drive())");
        expect(exercise.solutionCode).toContain("car = Car('Corolla')");
        expect(exercise.solutionCode).toContain("print(car.drive())");
        expect(exercise.tests).toEqual([
            { stdin: "", stdout: "The Corolla is driving!\n", match: "exact" },
        ]);
        expect(
            result.report.repairs.some(
                (repair) =>
                    repair.code === "PYTHON_NO_OUTPUT_CLASS_METHOD_TASK_REPAIRED",
            ),
        ).toBe(true);
    });

    it("makes no-test class method exercises observable before publishing fixed tests", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "methods-and-self",
                title: "Methods and self",
                summary: "Add behavior to classes with instance methods.",
            } as any,
            draft: {
                title: "Methods and self",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "create-method",
                        kind: "code_input",
                        title: "Create a Method",
                        prompt:
                            "Create a Car class with a drive method that returns a message.",
                        hint: "Use self.",
                        help: {
                            concept: "Methods define object behavior.",
                            hint_1: "Define the method inside the class.",
                            hint_2: "Return a string from the method.",
                        },
                        starterCode:
                            "class Car:\n    def __init__(self, model):\n        self.model = model\n\n    def drive(self):\n        pass",
                        solutionCode:
                            "class Car:\n    def __init__(self, model):\n        self.model = model\n\n    def drive(self):\n        return f'The {self.model} is driving!'",
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.solutionCode).toContain("car = Car('Corolla')");
        expect(exercise.solutionCode).toContain("print(car.drive())");
        expect(exercise.tests).toEqual([
            {
                stdin: "",
                stdout: "The Corolla is driving!\n",
                match: "exact",
            },
        ]);
    });
    it("adds missing stdin values for wrapped multi-parameter function exercises", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "reading-error-messages",
                title: "Reading Error Messages",
                summary: "Practice fixing common Python errors.",
            } as any,
            draft: {
                title: "Reading Error Messages",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "quiz11",
                        kind: "code_input",
                        title: "Correcting a Type Error",
                        prompt: "Fix the function so it adds the values.",
                        starterCode: "def add_numbers(a, b):\n    return a + b",
                        solutionCode: "def add_numbers(a, b):\n    return a + int(b)",
                        tests: [
                            {
                                stdin: "12\n",
                                stdout: "13",
                                match: "includes",
                            },
                        ],
                        hint: "Use int conversion.",
                        help: {
                            concept: "Convert text before arithmetic.",
                            hint_1: "One value may be a string.",
                            hint_2: "Use int() before adding.",
                        },
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;

        expect(exercise.tests[0].stdin).toBe("12\n1\n");
        expect(exercise.tests[0].stdout.trim()).toBe("13");
    });

    it("normalizes repaired drafts to the planned exercise policy mix", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "running-python-code",
                title: "Running Python Code",
                summary: "Run Python programs and understand printed output.",
                plannedExerciseCounts: {
                    total: 11,
                    dominantKind: "code_input",
                    counts: {
                        single_choice: 2,
                        multi_choice: 2,
                        drag_reorder: 2,
                        fill_blank_choice: 2,
                        code_input: 3,
                    },
                },
            } as any,
            draft: {
                title: "Running Python Code",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "q1",
                        kind: "single_choice",
                        title: "Choose the output",
                        prompt: "What does print('Hi') do?",
                        options: ["Shows Hi", "Deletes Hi", "Installs Python"],
                        correctOptionIds: ["a"],
                        hint: "Think about output.",
                        help: {
                            concept: "print() displays output.",
                            hint_1: "It writes to the console.",
                            hint_2: "The text appears when the program runs.",
                        },
                    },
                    {
                        id: "q2",
                        kind: "multi_choice",
                        title: "Choose valid print calls",
                        prompt: "Which are valid Python print calls?",
                        options: ["print('Hi')", "print(42)", "print Hi"],
                        correctOptionIds: ["a", "b"],
                        hint: "Function calls use parentheses.",
                        help: {
                            concept: "print() is called with parentheses.",
                            hint_1: "Strings can be printed.",
                            hint_2: "Numbers can be printed too.",
                        },
                    },
                    {
                        id: "q3",
                        kind: "fill_blank_choice",
                        title: "Fill the function name",
                        prompt: "Choose the function that displays output.",
                        template: "___('Hello')",
                        choices: ["print", "input", "int", "str"],
                        correctValue: "print",
                        hint: "Use the output function.",
                        help: {
                            concept: "print() displays values.",
                            hint_1: "It sends text to output.",
                            hint_2: "It is commonly used in first programs.",
                        },
                    },
                    {
                        id: "q4",
                        kind: "fill_blank_choice",
                        title: "Fill the string",
                        prompt: "Choose the text that gets printed.",
                        template: "print(___)",
                        choices: ["'Hello'", "Hello", "print", "input"],
                        correctValue: "'Hello'",
                        hint: "A string literal needs quotes.",
                        help: {
                            concept: "Strings are written with quotes.",
                            hint_1: "The quoted text is printed.",
                            hint_2: "Unquoted words are treated like names.",
                        },
                    },
                    {
                        id: "q5",
                        kind: "drag_reorder",
                        title: "Order the program steps",
                        prompt: "Put the steps in order to run a simple program.",
                        items: [
                            "Write a print statement",
                            "Run the program",
                            "Read the output",
                        ],
                        correctOrder: [
                            "Write a print statement",
                            "Run the program",
                            "Read the output",
                        ],
                        hint: "Code is written before it runs.",
                        help: {
                            concept: "Programs run after you write code.",
                            hint_1: "Start by writing the statement.",
                            hint_2: "Then run it and inspect output.",
                        },
                    },
                    {
                        id: "q6",
                        kind: "drag_reorder",
                        title: "Order a simple Python file",
                        prompt: "Put these lines in a sensible order.",
                        items: [
                            "name = input()",
                            "message = 'Hello, ' + name",
                            "print(message)",
                        ],
                        correctOrder: [
                            "name = input()",
                            "message = 'Hello, ' + name",
                            "print(message)",
                        ],
                        hint: "Read input before using it.",
                        help: {
                            concept: "A program can read, transform, then print.",
                            hint_1: "Create the value before printing it.",
                            hint_2: "The final line displays the result.",
                        },
                    },
                    {
                        id: "q7",
                        kind: "code_input",
                        title: "Print Hello",
                        prompt: "Print Hello.",
                        starterCode: "# Write your code below\n",
                        solutionCode: "print('Hello')\n",
                        tests: [{ stdin: "", stdout: "Hello\n", match: "exact" }],
                        hint: "Use print().",
                        help: {
                            concept: "print() displays text.",
                            hint_1: "Put the text in quotes.",
                            hint_2: "Call print with parentheses.",
                        },
                    },
                    {
                        id: "q8",
                        kind: "code_input",
                        title: "Print a number",
                        prompt: "Print 42.",
                        starterCode: "# Write your code below\n",
                        solutionCode: "print(42)\n",
                        tests: [{ stdin: "", stdout: "42\n", match: "exact" }],
                        hint: "Use print().",
                        help: {
                            concept: "print() can display numbers.",
                            hint_1: "Numbers do not need quotes.",
                            hint_2: "Place the number inside print().",
                        },
                    },
                    {
                        id: "q9",
                        kind: "code_input",
                        title: "Read and print text",
                        prompt: "Read one line and print it.",
                        starterCode: "text = input()\n# Write your code below\n",
                        solutionCode: "text = input()\nprint(text)\n",
                        tests: [{ stdin: "Python\n", stdout: "Python\n", match: "exact" }],
                        hint: "Print the value you read.",
                        help: {
                            concept: "input() reads text and print() displays it.",
                            hint_1: "Store the input in a variable.",
                            hint_2: "Pass that variable to print().",
                        },
                    },
                    {
                        id: "q10",
                        kind: "code_input",
                        title: "Extra code exercise 1",
                        prompt: "This extra code exercise should be dropped.",
                        starterCode: "# Write your code below\n",
                        solutionCode: "print('extra 1')\n",
                        tests: [{ stdin: "", stdout: "extra 1\n", match: "exact" }],
                        hint: "Extra.",
                        help: {
                            concept: "Extra code input.",
                            hint_1: "This should not remain.",
                            hint_2: "The policy only allows three code_input exercises.",
                        },
                    },
                    {
                        id: "q11",
                        kind: "code_input",
                        title: "Extra code exercise 2",
                        prompt: "This extra code exercise should also be dropped.",
                        starterCode: "# Write your code below\n",
                        solutionCode: "print('extra 2')\n",
                        tests: [{ stdin: "", stdout: "extra 2\n", match: "exact" }],
                        hint: "Extra.",
                        help: {
                            concept: "Extra code input.",
                            hint_1: "This should not remain.",
                            hint_2: "The policy only allows three code_input exercises.",
                        },
                    },
                ],
            } as any,
        });

        type ExerciseKind =
            | "single_choice"
            | "multi_choice"
            | "drag_reorder"
            | "fill_blank_choice"
            | "code_input";

        const counts = result.draft.quizDraft.reduce<Record<ExerciseKind, number>>(
            (acc, exercise) => {
                const kind = exercise.kind as ExerciseKind;
                acc[kind] += 1;
                return acc;
            },
            {
                single_choice: 0,
                multi_choice: 0,
                drag_reorder: 0,
                fill_blank_choice: 0,
                code_input: 0,
            },
        );

        expect(result.draft.quizDraft).toHaveLength(11);
        expect(counts).toEqual({
            single_choice: 2,
            multi_choice: 2,
            drag_reorder: 2,
            fill_blank_choice: 2,
            code_input: 3,
        });

        expect(result.draft.quizDraft.some((exercise: any) => exercise.id === "q10")).toBe(false);
        expect(result.draft.quizDraft.some((exercise: any) => exercise.id === "q11")).toBe(false);

        expect(
            result.draft.quizDraft.filter((exercise: any) => exercise.kind === "single_choice"),
        ).toHaveLength(2);

        expect(
            result.draft.quizDraft.filter((exercise: any) => exercise.kind === "multi_choice"),
        ).toHaveLength(2);
    });});
