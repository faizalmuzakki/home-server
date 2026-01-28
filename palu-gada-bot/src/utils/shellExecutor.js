import { exec } from 'child_process';
import config from '../config.js';

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_TIMEOUT = 120000; // 2 minutes

/**
 * Execute a shell command and return the result
 * @param {string} command - The shell command to execute
 * @param {object} options - Execution options
 * @param {number} options.timeout - Timeout in ms (default: 30s, max: 120s)
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number, duration: number}>}
 */
export function executeCommand(command, options = {}) {
    const timeout = Math.min(options.timeout || DEFAULT_TIMEOUT, MAX_TIMEOUT);

    return new Promise((resolve) => {
        const startTime = Date.now();

        const proc = exec(command, {
            encoding: 'utf-8',
            timeout,
            maxBuffer: 1024 * 1024, // 1MB output buffer
            shell: '/bin/bash',
            cwd: options.cwd || '/host-repo',
            env: {
                ...process.env,
                PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                HOME: '/tmp',
            },
        }, (error, stdout, stderr) => {
            const duration = Date.now() - startTime;

            if (error && error.killed) {
                resolve({
                    stdout: stdout || '',
                    stderr: `Command timed out after ${timeout / 1000}s`,
                    exitCode: 124,
                    duration,
                });
                return;
            }

            resolve({
                stdout: stdout || '',
                stderr: stderr || '',
                exitCode: error ? error.code || 1 : 0,
                duration,
            });
        });
    });
}

/**
 * Format command output for Discord (respects 2000 char limit)
 * Returns an array of message strings
 */
export function formatOutput(result) {
    const messages = [];
    const { stdout, stderr, exitCode, duration } = result;

    // Status line
    const status = exitCode === 0 ? '**Exit: 0**' : `**Exit: ${exitCode}**`;
    const time = `${(duration / 1000).toFixed(1)}s`;
    const header = `${status} | ${time}`;

    // Combine output
    let output = '';
    if (stdout) output += stdout;
    if (stderr) {
        if (output) output += '\n';
        output += stderr;
    }

    if (!output.trim()) {
        messages.push(`${header}\n*(no output)*`);
        return messages;
    }

    // Split into chunks that fit in Discord messages
    // Reserve space for header + code block markers
    const maxChunkSize = 1900;
    const lines = output.split('\n');
    let currentChunk = '';

    for (const line of lines) {
        const lineToAdd = currentChunk ? '\n' + line : line;
        if ((currentChunk + lineToAdd).length > maxChunkSize) {
            if (currentChunk) {
                messages.push(currentChunk);
                currentChunk = line;
            } else {
                // Single line exceeds max, truncate it
                messages.push(line.slice(0, maxChunkSize));
                currentChunk = '';
            }
        } else {
            currentChunk += lineToAdd;
        }
    }
    if (currentChunk) {
        messages.push(currentChunk);
    }

    // Format with code blocks and add header to first message
    return messages.map((chunk, i) => {
        const prefix = i === 0 ? `${header}\n` : '';
        return `${prefix}\`\`\`\n${chunk}\n\`\`\``;
    });
}

/**
 * Check if a user is allowed to run shell commands
 */
export function isShellAllowed(userId) {
    // Must have OWNER_ID configured
    if (!config.ownerId) return false;

    // Check owner
    if (userId === config.ownerId) return true;

    // Check additional allowed users
    const allowedUsers = config.shellAllowedUsers || [];
    return allowedUsers.includes(userId);
}
