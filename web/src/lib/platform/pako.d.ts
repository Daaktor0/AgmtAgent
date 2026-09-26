declare module "pako" {
  export class Inflate {
    constructor(options?: { raw?: boolean; chunkSize?: number });
    onData: (chunk: Uint8Array) => void;
    err: number;
    push(data: Uint8Array, last?: boolean): boolean;
  }
  const pako: { Inflate: typeof Inflate };
  export default pako;
}
