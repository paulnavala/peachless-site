/**
 * zod tries `new Function` as it starts up, to see if it can compile validators.
 * This page's Content-Security-Policy refuses that and reports it, though nothing
 * breaks. Set before zod loads, this skips the attempt, so main.ts imports it first.
 */
(globalThis as { __zod_globalConfig?: { jitless: boolean } }).__zod_globalConfig = { jitless: true };
