/**
 * Starts the real server (src/server.ts) as a separate process, exactly as
 * `npm run dev` does, and checks start-up, a live request, configuration
 * errors and shutdown.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const backendDir = fileURLToPath(new URL('..', import.meta.url));
const children: ChildProcess[] = [];

function startServer(env: Record<string, string>) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: backendDir,
    // Clean environment: only what the test passes (plus PATH for Node itself).
    // DOTENV_CONFIG_PATH points nowhere so the developer's real backend/.env is not read.
    env: {
      PATH: process.env.PATH ?? '',
      SystemRoot: process.env.SystemRoot ?? '',
      DOTENV_CONFIG_PATH: 'test/does-not-exist.env',
      DATABASE_URL: 'pglite://memory', // never touch the developer's .data folder
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout?.on('data', (d) => (output += String(d)));
  child.stderr?.on('data', (d) => (output += String(d)));
  const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  const waitFor = async (text: string, timeoutMs = 60_000) => {
    const start = Date.now();
    while (!output.includes(text)) {
      if (Date.now() - start > timeoutMs)
        throw new Error(`Timed out waiting for "${text}". Output:\n${output}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  return { child, exited, waitFor, output: () => output };
}

afterEach(() => {
  for (const c of children.splice(0)) if (c.exitCode === null) c.kill();
});

describe('server process', () => {
  it('starts, serves a request and shuts down', async () => {
    const port = String(4500 + Math.floor(Math.random() * 400));
    const server = startServer({ NODE_ENV: 'test', LOG_LEVEL: 'info', PORT: port });
    await server.waitFor('UniVault backend listening');
    expect(server.output()).toContain('Database migrations applied');

    const res = await fetch(`http://localhost:${port}/api/v1/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'up' });

    server.child.kill('SIGTERM');
    const code = await server.exited;
    // POSIX: graceful shutdown exits 0. Windows has no SIGTERM, so the process is just terminated.
    if (process.platform !== 'win32') {
      expect(code).toBe(0);
      expect(server.output()).toContain('Server stopped');
    }
  }, 90_000);

  it('refuses to start with invalid configuration and explains why', async () => {
    const server = startServer({ NODE_ENV: 'test', PORT: 'not-a-port' });
    const code = await server.exited;
    expect(code).toBe(1);
    expect(server.output()).toContain('Invalid environment configuration');
    expect(server.output()).toContain('PORT');
  }, 90_000);
});
