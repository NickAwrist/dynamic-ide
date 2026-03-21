// Bootstrap wrapper for extension host process.
// This file is NOT bundled by Vite -- it must stay as plain JS.
// It registers error handlers BEFORE loading the bundled host-process.js
// to prevent uncaught exceptions from silently killing the process.

process.on('uncaughtException', (err) => {
  process.stderr.write('[ext-host] Uncaught exception: ' + (err.stack || err.message || err) + '\n');
  try {
    process.send && process.send({
      method: 'extension.error',
      params: { message: err.message || String(err), stack: err.stack, fatal: false }
    });
  } catch (_) {}
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
  process.stderr.write('[ext-host] Unhandled rejection: ' + msg + '\n');
  try {
    process.send && process.send({
      method: 'extension.error',
      params: { message: String(reason && reason.message || reason), fatal: false }
    });
  } catch (_) {}
});

// Signal to parent that the process is alive before loading any extension code
try {
  process.send && process.send({ method: 'host.ready', params: {} });
} catch (_) {}

try {
  require('./host-process.js');
} catch (err) {
  process.stderr.write('[ext-host] Failed to load host-process.js: ' + (err.stack || err) + '\n');
  try {
    process.send && process.send({
      method: 'extension.error',
      params: { message: 'Host failed to load: ' + (err.message || err), fatal: true }
    });
  } catch (_) {}
  setTimeout(() => process.exit(1), 200);
}
