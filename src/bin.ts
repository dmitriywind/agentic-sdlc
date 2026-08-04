#!/usr/bin/env node
import { runCli } from './cli.js';

runCli().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
