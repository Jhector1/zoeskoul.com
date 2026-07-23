export const BOARD_DOCUMENT_VERSION = 1 as const;

export type BoardPoint = { x: number; y: number };
export type BoardElementType = "stroke" | "text" | "rectangle" | "ellipse" | "arrow";
export type BoardTool = "select" | "pen" | "text" | "rectangle" | "ellipse" | "arrow" | "eraser";

export type BoardElementBase = {
  id: string;
  type: BoardElementType;
  color: string;
  strokeWidth: number;
};

export type BoardStrokeElement = BoardElementBase & {
  type: "stroke";
  points: BoardPoint[];
};

export type BoardTextElement = BoardElementBase & {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
};

export type BoardBoxElement = BoardElementBase & {
  type: "rectangle" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BoardArrowElement = BoardElementBase & {
  type: "arrow";
  start: BoardPoint;
  end: BoardPoint;
};

export type BoardElement =
  | BoardStrokeElement
  | BoardTextElement
  | BoardBoxElement
  | BoardArrowElement;

export type BoardDocument = {
  version: typeof BOARD_DOCUMENT_VERSION;
  elements: BoardElement[];
};
