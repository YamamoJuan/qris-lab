#!/usr/bin/env node
import { main } from './program.js';

const write = (stream: NodeJS.WriteStream) => (text: string) =>
  stream.write(text.endsWith('\n') ? text : `${text}\n`);

process.exitCode = await main(process.argv.slice(2), {
  stdout: write(process.stdout),
  stderr: write(process.stderr),
  stdin: process.stdin,
});
