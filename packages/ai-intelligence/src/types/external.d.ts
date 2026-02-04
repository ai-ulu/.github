declare module 'pixelmatch' {
  function pixelmatch(
    img1: Uint8Array | Uint8ClampedArray,
    img2: Uint8Array | Uint8ClampedArray,
    output: Uint8Array | Uint8ClampedArray | null,
    width: number,
    height: number,
    options?: {
      threshold?: number;
      includeAA?: boolean;
      alpha?: number;
      aaColor?: [number, number, number];
      diffColor?: [number, number, number];
      diffColorAlt?: [number, number, number];
    }
  ): number;
  export = pixelmatch;
}

declare module 'pngjs' {
  export class PNG {
    width: number;
    height: number;
    data: Uint8Array;
    
    constructor(options?: { width?: number; height?: number });
    
    static sync: {
      read(buffer: Buffer): PNG;
      write(png: PNG): Buffer;
    };
  }
}