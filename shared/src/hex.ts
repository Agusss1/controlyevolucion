/**
 * Malla hexagonal "pointy-top" con desplazamiento odd-r (las filas impares se desplazan
 * media celda a la derecha). Compartida por el generador, el motor y el renderizador.
 */
export const SQRT3 = Math.sqrt(3);

const EVEN_ROW: [number, number][] = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const ODD_ROW: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];

export function neighborsOf(idx: number, width: number, height: number, out: number[] = []): number[] {
  out.length = 0;
  const col = idx % width, row = (idx - col) / width;
  const dirs = row & 1 ? ODD_ROW : EVEN_ROW;
  for (const [dc, dr] of dirs) {
    const c = col + dc, r = row + dr;
    if (c >= 0 && c < width && r >= 0 && r < height) out.push(r * width + c);
  }
  return out;
}

/** Centro de una celda en unidades de "tamaño de hex = 1". */
export function cellCenter(idx: number, width: number): [number, number] {
  const col = idx % width, row = (idx - col) / width;
  return [SQRT3 * (col + 0.5 * (row & 1)), 1.5 * row];
}

/** Convierte un punto en el plano (unidades de tamaño de hex) a índice de celda, o -1. */
export function pointToCell(x: number, y: number, width: number, height: number): number {
  const q = (SQRT3 / 3 * x - y / 3);
  const r = (2 / 3) * y;
  // redondeo cúbico
  let cx = q, cz = r, cy = -cx - cz;
  let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
  const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  const row = rz;
  const col = rx + (rz - (rz & 1)) / 2;
  if (col < 0 || col >= width || row < 0 || row >= height) return -1;
  return row * width + col;
}

/** Vértices de un hexágono pointy-top centrado en (x,y). */
export function hexCorners(x: number, y: number, size = 1): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push([x + size * Math.cos(a), y + size * Math.sin(a)]);
  }
  return pts;
}

/**
 * Índice de esquina compartida para la arista entre una celda y su vecino en la dirección d.
 * Devuelve los dos vértices del borde (para dibujar fronteras).
 */
export function edgeBetween(idx: number, nIdx: number, width: number): [[number, number], [number, number]] | null {
  const [x, y] = cellCenter(idx, width);
  const [nx, ny] = cellCenter(nIdx, width);
  const corners = hexCorners(x, y);
  const mx = (x + nx) / 2, my = (y + ny) / 2;
  // los dos vértices más cercanos al punto medio
  const sorted = corners.map((c, i) => ({ i, d: (c[0] - mx) ** 2 + (c[1] - my) ** 2 })).sort((a, b) => a.d - b.d);
  if (sorted.length < 2) return null;
  return [corners[sorted[0].i], corners[sorted[1].i]];
}

export function hexDistance(a: number, b: number, width: number): number {
  const toCube = (idx: number) => {
    const col = idx % width, row = (idx - col) / width;
    const x = col - (row - (row & 1)) / 2;
    const z = row;
    return [x, -x - z, z];
  };
  const [ax, ay, az] = toCube(a), [bx, by, bz] = toCube(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

// --- Codificación compacta de arrays por celda (sin depender de Buffer) ---
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

export function base64ToBytes(str: string): Uint8Array {
  const lookup = new Uint8Array(128);
  for (let i = 0; i < B64.length; i++) lookup[B64.charCodeAt(i)] = i;
  let len = (str.length / 4) * 3;
  if (str.endsWith('==')) len -= 2; else if (str.endsWith('=')) len -= 1;
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < str.length; i += 4) {
    const n = (lookup[str.charCodeAt(i)] << 18) | (lookup[str.charCodeAt(i + 1)] << 12) |
      (lookup[str.charCodeAt(i + 2)] << 6) | lookup[str.charCodeAt(i + 3)];
    if (o < len) out[o++] = (n >> 16) & 255;
    if (o < len) out[o++] = (n >> 8) & 255;
    if (o < len) out[o++] = n & 255;
  }
  return out;
}

export function encodeU16(arr: ArrayLike<number>): string {
  const bytes = new Uint8Array(arr.length * 2);
  for (let i = 0; i < arr.length; i++) { bytes[i * 2] = arr[i] & 255; bytes[i * 2 + 1] = (arr[i] >> 8) & 255; }
  return bytesToBase64(bytes);
}
export function decodeU16(str: string): Uint16Array {
  const bytes = base64ToBytes(str);
  const out = new Uint16Array(bytes.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
  return out;
}
export function encodeU8(arr: ArrayLike<number>): string { return bytesToBase64(Uint8Array.from(arr as ArrayLike<number>)); }
export function decodeU8(str: string): Uint8Array { return base64ToBytes(str); }
