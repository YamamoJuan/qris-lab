#!/usr/bin/env node
import { main } from './program.js';

// Exit quietly when the reader closes the pipe early (e.g. `qris-lab ... | head`).
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') process.exit(process.exitCode ?? 0);
    throw err;
  });
}

const write = (stream: NodeJS.WriteStream) => (text: string) =>
  stream.write(text.endsWith('\n') ? text : `${text}\n`);

process.exitCode = await main(process.argv.slice(2), {
  stdout: write(process.stdout),
  stderr: write(process.stderr),
  stdin: process.stdin,
});
