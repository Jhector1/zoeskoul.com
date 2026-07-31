import type {
    SqlPaneTab,
    ToolSqlPanePolicy,
} from "@zoeskoul/curriculum-contracts";

export type TabKey = SqlPaneTab;
export type SqlPaneOptions = ToolSqlPanePolicy;

export type Cardinality = "1" | "0..1" | "many" | "0..many";

export type ColumnModel = {
    name: string;
    type: string;
    nullable: boolean;
    isPk: boolean;
    isFk: boolean;
    isUnique: boolean;
    references?: {
        table: string;
        column: string;
    };
};

export type TableModel = {
    id: string;
    name: string;
    columns: ColumnModel[];
};

export type RelationModel = {
    id: string;
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    fromCardinality: Cardinality;
    toCardinality: Cardinality;
    label: string;
};

export type SchemaModel = {
    tables: TableModel[];
    relations: RelationModel[];
};

export type SqlTableSnapshot = {
    name: string;
    columns: Array<{
        name: string;
        type?: string | null;
    }>;
    rows: unknown[][];
    rowCount: number;
};

export type SqlTableSnapshots = Record<string, SqlTableSnapshot>;

export type Box = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
};

export type DiagramTabKey = "tables" | "erd" | "chen";
export type DiagramMode = DiagramTabKey;
export type DiagramPositions = Record<string, { x: number; y: number }>;

export type DiagramBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type DiagramScene = {
    width: number;
    height: number;
    boxes: Box[];
    fitBounds: DiagramBounds;
};

export type DiagramConfig = {
    minWidth: number;
    minHeight: number;
    leftPad: number;
    topPad: number;
    rightPad: number;
    bottomPad: number;
    extraRight: number;
    extraBottom: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};
