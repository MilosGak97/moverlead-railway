// src/utils/run-node-script.ts
import { spawn } from 'child_process';
import * as path from 'path';

export function runNodeScript(
    scriptPath: string,
    env: Record<string, string | undefined> = {},
    args: string[] = [],
): Promise<void> {
    return new Promise((resolve, reject) => {
        const abs = path.isAbsolute(scriptPath) ? scriptPath : path.resolve(process.cwd(), scriptPath);

        const child = spawn(process.execPath, [abs, ...args], {
            env: { ...process.env, ...env },
            stdio: 'inherit', // pipe logs to your Nest console
        });

        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${scriptPath} exited with code ${code}`));
        });
    });
}