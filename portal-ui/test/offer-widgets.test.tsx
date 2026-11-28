/** QrCode (decodes to exactly its value), Countdown (mm:ss, warning, live text), FullscreenOverlay. */
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import jsQRImport from 'jsqr';
import QRCode from 'qrcode';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Countdown,
  formatCountdown,
  FullscreenOverlay,
  QR_QUIET_ZONE,
  QrCode,
  qrMatrix,
  qrPath,
} from '../src/index.js';

// jsqr is CommonJS: under NodeNext its default import types as the module object
const jsQR = ((jsQRImport as unknown as { default?: unknown }).default ??
  jsQRImport) as unknown as typeof jsQRImport.default;

const OFFER_URI =
  'openid-credential-offer://?credential_offer=' +
  encodeURIComponent(
    JSON.stringify({
      credential_issuer: 'http://192.168.1.20:4000/api/v1/issuers/employer-a',
      credential_configuration_ids: ['EmploymentCredential'],
      grants: {
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': 'q0Zl3n1bRk7yTq3e0nOaVb2d8cWm5Kx9pLhS4uF6gJA',
        },
      },
    }),
  );

/**
 * Rasterises the rendered SVG (its viewBox and path, as a browser would draw them) to RGBA
 * pixels and reads it with jsQR: proves the DOM itself carries the code, not just the matrix.
 */
function decodeSvg(svg: SVGSVGElement, pixelsPerModule = 4): string | null {
  const side = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
  const dark = new Set<string>();
  for (const [, x, y] of svg
    .querySelector('path')!
    .getAttribute('d')!
    .matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    dark.add(`${x},${y}`);
  }
  const width = side * pixelsPerModule;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let py = 0; py < width; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const on = dark.has(
        `${Math.floor(px / pixelsPerModule)},${Math.floor(py / pixelsPerModule)}`,
      );
      const i = (py * width + px) * 4;
      data[i] = data[i + 1] = data[i + 2] = on ? 0 : 255;
      data[i + 3] = 255;
    }
  }
  return jsQR(data, width, width)?.data ?? null;
}

describe('QrCode', () => {
  it('draws an SVG that decodes to exactly the value', () => {
    render(<QrCode value={OFFER_URI} label="QR code to add this credential" />);
    const svg = screen.getByRole('img', { name: 'QR code to add this credential' });
    expect(decodeSvg(svg as unknown as SVGSVGElement)).toBe(OFFER_URI);
  });

  it('has a 4-module quiet zone, a white background and the requested size', () => {
    const { container } = render(<QrCode value="hello" label="QR" size={320} />);
    const svg = container.querySelector('svg')!;
    const matrix = qrMatrix('hello');
    const side = matrix.size + 2 * QR_QUIET_ZONE;
    expect(svg).toHaveAttribute('viewBox', `0 0 ${side} ${side}`);
    // At least the requested size, at a whole number of pixels per module (29 Ã— 12 = 348)
    expect(svg).toHaveAttribute('width', String(side * 12));
    expect(svg).toHaveAttribute('height', String(side * 12));
    expect(svg).toHaveAttribute('shape-rendering', 'crispEdges');
    // token colours (no hex): text modules on a surface (white) background
    expect(svg.querySelector('rect')).toHaveClass('fill-surface');
    expect(svg.querySelector('path')).toHaveClass('fill-text');
    // No module is drawn inside the quiet zone
    const coordinates = [...qrPath(matrix).matchAll(/M(\d+) (\d+)/g)].flatMap((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(Math.min(...coordinates)).toBe(QR_QUIET_ZONE);
    expect(Math.max(...coordinates)).toBe(QR_QUIET_ZONE + matrix.size - 1);
  });

  it('never puts the value in text, a title or an attribute (only the drawing)', () => {
    const { container } = render(<QrCode value={OFFER_URI} label="QR" />);
    const html = container.innerHTML;
    expect(html).not.toContain('openid-credential-offer');
    expect(html).not.toContain('pre-authorized_code');
    expect(html).not.toContain('style=');
    expect(container.textContent).toBe('');
  });

  it('encodes locally with error correction M', () => {
    const create = vi.spyOn(QRCode, 'create');
    qrMatrix(OFFER_URI);
    expect(create).toHaveBeenCalledWith(OFFER_URI, { errorCorrectionLevel: 'M' });
    expect(create.mock.results[0]!.value.errorCorrectionLevel.bit).toBe(0); // M = 0b00
    create.mockRestore();
  });
});

describe('Countdown', () => {
  it('formats mm:ss, never below zero', () => {
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(61.9)).toBe('01:01');
    expect(formatCountdown(5)).toBe('00:05');
    expect(formatCountdown(-3)).toBe('00:00');
    expect(formatCountdown(6000)).toBe('100:00');
  });

  it('shows a timer (not live) and a separate polite announcement', () => {
    render(<Countdown seconds={125} label="Expires in" announcement="2 minutes left" />);
    const timer = screen.getByRole('timer', { name: 'Expires in 02:05' });
    expect(timer).toHaveTextContent('02:05');
    expect(timer).not.toHaveAttribute('aria-live');
    const live = screen.getByText('2 minutes left');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveClass('sr-only');
  });

  it('has a warning look on request and no live region without an announcement', () => {
    const { container, rerender } = render(<Countdown seconds={30} label="Expires in" warning />);
    expect(container.firstChild).toHaveAttribute('data-warning', 'true');
    expect(container.firstChild).toHaveClass('bg-status-expired-bg');
    expect(container.querySelector('[aria-live]')).toBeNull();
    rerender(<Countdown seconds={30} label="Expires in" size="large" />);
    expect(container.firstChild).not.toHaveAttribute('data-warning');
    expect(screen.getByRole('timer')).toHaveClass('text-display');
  });
});

describe('FullscreenOverlay', () => {
  function Harness({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Show full screen</button>
        <FullscreenOverlay
          open={open}
          title="Scan with the wallet"
          closeLabel="Close"
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
        >
          <a href="#x">Inside link</a>
        </FullscreenOverlay>
      </>
    );
  }

  it('opens as a modal dialog, focuses Close, keeps Tab inside, closes on Escape and restores focus', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Show full screen' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Scan with the wallet' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Inside link' })).toHaveFocus();
    await user.tab(); // wraps
    expect(close).toHaveFocus();
    await user.tab({ shift: true }); // wraps backwards
    expect(screen.getByRole('link', { name: 'Inside link' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes with the Close button; ignores other keys', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Show full screen' }));
    await user.keyboard('a');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
