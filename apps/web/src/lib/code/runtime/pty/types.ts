export type PtyHandle = {
    write(data: string): void;
    resize?(cols: number, rows: number): void;
    kill(): void;
    onData(cb: (chunk: string) => void): void;
    onExit(cb: (code: number | null) => void): void;
};