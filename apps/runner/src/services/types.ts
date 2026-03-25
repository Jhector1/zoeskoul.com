export type NodeJSStream = NodeJS.ReadWriteStream & {
    write: (chunk: string | Uint8Array) => boolean;
};