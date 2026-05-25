import type { WorkspaceProfile } from "@zoeskoul/curriculum-contracts";

export const WORKSPACE_PROFILES: Record<string, WorkspaceProfile> = {
    "browser-code-runner": {
        id: "browser-code-runner",
        name: "Browser code runner",
        ui: {
            editorLabel: "code editor",
            runButtonLabel: "Run",
            outputPanelLabel: "output panel",
            feedbackPanelLabel: "feedback area",
            terminalPanelLabel: null,
            filesPanelLabel: null,
        },
        capabilities: {
            singleFileCodeInput: { enabled: true },
            multiFileProjects: { enabled: false },
            terminal: { enabled: false },
            filesystem: { enabled: false },
            stdinStdout: { enabled: true },
            packageInstall: { enabled: false },
            externalNetwork: { enabled: false },
            uploads: { enabled: false },
        },
        preferredActionLanguage: [
            "Type code in the code editor.",
            "Click Run.",
            "Check the output panel.",
            "Compare the output with the expected output."
        ],
        forbiddenActionLanguage: [
            "Create a file",
            "Save this as",
            "Open a terminal",
            "Use the command line",
            "Run python file.py",
            "Install a package",
            "Use pip",
            "Create multiple files"
        ],
    },

    "browser-python-files-runner": {
        id: "browser-python-files-runner",
        name: "Browser Python files runner",
        ui: {
            editorLabel: "code editor",
            runButtonLabel: "Run",
            outputPanelLabel: "output panel",
            feedbackPanelLabel: "feedback area",
            terminalPanelLabel: null,
            filesPanelLabel: "files panel",
        },
        capabilities: {
            singleFileCodeInput: { enabled: true },
            multiFileProjects: { enabled: true },
            terminal: { enabled: false },
            filesystem: { enabled: true },
            stdinStdout: { enabled: true },
            packageInstall: { enabled: false },
            externalNetwork: { enabled: false },
            uploads: { enabled: false },
        },
        preferredActionLanguage: [
            "Open the provided file in the files panel.",
            "Edit Python code in the code editor.",
            "Click Run.",
            "Check the output panel.",
        ],
        forbiddenActionLanguage: [
            "Open a terminal",
            "Use the command line",
            "Install a package",
            "Use pip",
            "Use external files not provided by the lesson",
        ],
    },

    "browser-sql-runner": {
        id: "browser-sql-runner",
        name: "Browser SQL runner",
        ui: {
            editorLabel: "SQL editor",
            runButtonLabel: "Run query",
            resultsTableLabel: "results table",
            outputPanelLabel: "results panel",
            feedbackPanelLabel: "feedback area",
            terminalPanelLabel: null,
            filesPanelLabel: null,
        },
        capabilities: {
            singleFileCodeInput: { enabled: true },
            multiFileProjects: { enabled: false },
            terminal: { enabled: false },
            filesystem: { enabled: false },
            stdinStdout: { enabled: false },
            packageInstall: { enabled: false },
            externalNetwork: { enabled: false },
            uploads: { enabled: false },
            sql: {
                queryRunner: { enabled: true },
                resultsTable: { enabled: true },
                schemaBrowser: { enabled: true },
                erdDiagram: { enabled: true },
                chenDiagram: { enabled: true },
            },
        },
        preferredActionLanguage: [
            "Write the query in the SQL editor.",
            "Click Run query.",
            "Check the results table.",
            "Use the schema, ERD, or Chen diagram when the lesson asks you to inspect relationships."
        ],
        forbiddenActionLanguage: [
            "Open a terminal",
            "Use the command line",
            "Install a database",
            "Create a local SQL file",
            "Run a shell command"
        ],
    },

    "full-ide": {
        id: "full-ide",
        name: "Full IDE workspace",
        ui: {
            editorLabel: "editor",
            runButtonLabel: "Run",
            outputPanelLabel: "output panel",
            terminalPanelLabel: "terminal",
            filesPanelLabel: "file explorer",
        },
        capabilities: {
            singleFileCodeInput: { enabled: true },
            multiFileProjects: { enabled: true },
            terminal: { enabled: true },
            filesystem: { enabled: true },
            stdinStdout: { enabled: true },
            packageInstall: { enabled: true },
            externalNetwork: { enabled: false },
            uploads: { enabled: true },
        },
        preferredActionLanguage: [
            "Open the file in the file explorer.",
            "Edit the code in the editor.",
            "Click Run or use the terminal if the lesson asks for it.",
            "Check the output panel or terminal output."
        ],
        forbiddenActionLanguage: [],
    },
};
