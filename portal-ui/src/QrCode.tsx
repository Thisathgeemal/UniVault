import QRCode from 'qrcode';
import { useMemo } from 'react';
import { cn } from './cn.js';

/** Error correction M (about 15 % of the code can be damaged), as the offer screen needs. */
export const QR_ERROR_CORRECTION = 'M';
/** Quiet zone in modules: ISO/IEC 18004 asks for at least 4. */
export const QR_QUIET_ZONE = 4;

export interface QrMatrix {
  /** Modules per side, without the quiet zone. */
  size: number;
  /** Row-major: true = dark module. */
  dark: (row: number, column: number) => boolean;
}

/** Encodes text locally (no network), error correction M. */
export function qrMatrix(value: string): QrMatrix {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: QR_ERROR_CORRECTION });
  return { size: modules.size, dark: (row, column) => Boolean(modules.get(row, column)) };
}

/** One SVG path for all dark modules, offset by the quiet zone (one unit = one module). */
export function qrPath(matrix: QrMatrix, quietZone = QR_QUIET_ZONE): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.dark(row, column)) {
        parts.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
      }
    }
  }
  return parts.join('');
}

export interface QrCodeProps {
  /** The exact text to encode. */
  value: string;
  /** Accessible name (alt text). Describe the purpose; never repeat the encoded value. */
  label: string;
  /**
   * Minimum width and height in CSS pixels (default 288). The code is drawn at a whole number
   * of pixels per module (the next multiple at or above this), so every module is equally
   * sharp: uneven modules from fractional scaling make codes harder to scan.
   */
  size?: number;
  className?: string;
}

/**
 * A QR code drawn as SVG from the encoder's module matrix: generated in the browser, black on
 * white with a 4-module quiet zone, crisp edges. No inline styles (the portal CSP forbids
 * them) and no data URI, so nothing but the drawing reaches the DOM.
 */
export function QrCode({ value, label, size = 288, className }: QrCodeProps) {
  const { side, path } = useMemo(() => {
    const matrix = qrMatrix(value);
    return { side: matrix.size + 2 * QR_QUIET_ZONE, path: qrPath(matrix) };
  }, [value]);
  const pixels = Math.max(1, Math.ceil(size / side)) * side;
  return (
    <svg
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${side} ${side}`}
      width={pixels}
      height={pixels}
      shapeRendering="crispEdges"
      className={cn('block h-auto max-w-full', className)}
      data-qr-modules={side}
    >
      <rect width={side} height={side} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
