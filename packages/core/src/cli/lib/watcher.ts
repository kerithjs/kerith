import chokidar from "chokidar";
import path from "node:path";
import type { WatcherOptions } from "../../types/index.js";

// ─── Default ignored patterns ─────────────────────────────────────────────────
// These are always combined with whatever the user passes in options.ignored.
// .kerith/** is explicitly ignored to avoid re-triggering on NITS registry
// updates that Kerith itself generates during bootstrap.

const defaultIgnored: (string | ((p: string) => boolean))[] = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/*.d.ts",
  "**/*.map",
  "**/.kerith",
  "**/.kerith/**",
  "**/coverage/**",
  (p: string) => p.includes('.kerith')
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Starts a Chokidar-based file watcher that invokes `options.onRestart`
 * whenever a relevant file change is detected.
 *
 * Design principles:
 * - Chokidar observes files.
 * - Kerith manages the restart via the `onRestart` callback.
 * - Express is unaware of the watcher's existence.
 *
 * @param options - Configuration for the watcher.
 * @returns An object containing a `close` function to cleanly terminate the watcher.
 *
 * @example
 * ```ts
 * const watcher = createWatcher({
 *   paths: ['src/'],
 *   logger,
 *   onRestart: async (changedPath) => {
 *     console.log(`Changed: ${changedPath}`);
 *     // Restart your application logic here
 *   }
 * });
 *
 * // Later, to cleanly shutdown:
 * await watcher.close();
 * ```
 */
export function createWatcher(options: WatcherOptions): {
  close: () => Promise<void>;
} {
  // ─── Production guard ─────────────────────────────────────────────────────
  // The watcher must never be initialized in production. NODE_ENV=production
  // implies cache is disabled and restarts are managed by the process manager.
  if (process.env.NODE_ENV === 'production') {
    return { close: async () => { /* noop */ } };
  }
  const { paths, debounceMs = 300, logger } = options;

  // ─── Merge ignored patterns ──────────────────────────────────────────────
  // User-supplied `ignored` is always appended to the defaults, never
  // replacing them. This guarantees node_modules/.git are always excluded.

  const userIgnored = options.ignored
    ? Array.isArray(options.ignored)
      ? options.ignored
      : [options.ignored]
    : [];

  const mergedIgnored: (string | ((p: string) => boolean))[] = [
    ...defaultIgnored,
    ...(userIgnored as (string | ((p: string) => boolean))[]),
  ];

  // ─── Debounce state ───────────────────────────────────────────────────────
  // A manual debounce using setTimeout/clearTimeout avoids pulling in any
  // utility library. When multiple file-system events fire in rapid succession
  // (e.g. editor atomic-save: write tmp → rename), only the last one triggers
  // the restart.

  // Name of config files to detect for special logging
  const CONFIG_FILES = new Set(['kerith.config.ts', 'kerith.config.js', 'kerith.config.mjs']);

  function isConfigFile(filePath: string): boolean {
    return CONFIG_FILES.has(path.basename(filePath));
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleRestart(filePath: string): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const filename = filePath.split(/[\\/]/).pop() ?? filePath;
      if (isConfigFile(filePath)) {
        logger.info(
          `[kerith] config modified — restarting (cache will be invalidated automatically)`,
          { _module: 'watcher', file: filename },
        );
      } else {
        logger.info(
          `[kerith] change detected — ${filename} → restarting`,
          { _module: 'watcher', file: filename },
        );
      }
      options.onRestart(filePath);
    }, debounceMs);
  }

  // ─── Chokidar instance ────────────────────────────────────────────────────
  // `ignoreInitial: true`  → do not fire for files already present at startup.
  // `persistent: true`     → keep the event loop alive while watching.
  // `awaitWriteFinish`     → wait until the file stops changing before firing.
  //                          Critical for editors that do atomic writes
  //                          (write to .tmp, then rename to final path).

  const watcher = chokidar.watch(paths, {
    ignored: mergedIgnored,
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 80, // file must be stable for 80ms
      pollInterval: 20,
    },
  });

  // ─── Event listeners ──────────────────────────────────────────────────────
  // Subscribing to specific events instead of 'all' makes the intent explicit
  // and avoids reacting to Chokidar-internal events like 'addDir'/'unlinkDir'
  // that should not trigger a server restart.

  watcher
    .on("add", (filePath) => {
      logger.debug(`file added: ${filePath}`, { _module: 'watcher' });
      scheduleRestart(filePath);
    })
    .on("change", (filePath) => {
      logger.debug(`file changed: ${filePath}`, { _module: 'watcher' });
      scheduleRestart(filePath);
    })
    .on("unlink", (filePath) => {
      logger.debug(`file removed: ${filePath}`, { _module: 'watcher' });
      scheduleRestart(filePath);
    });

  // ─── Ready ────────────────────────────────────────────────────────────────
  // Fires once Chokidar has finished its initial scan and is actively watching.
  // At this point any subsequent FS events will be reported.

  watcher.on("ready", () => {
    logger.info("Watching for file changes...", { _module: 'watcher' });
  });

  // ─── Error handling ───────────────────────────────────────────────────────
  // Log FS errors (e.g. EACCES, ENOSPC) without crashing the watcher process.

  watcher.on('error', (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Chokidar error: ${message}`, { _module: 'watcher' });
  });

  // ─── Teardown ─────────────────────────────────────────────────────────────
  // Returns an object with a `close()` method so dev.ts can cleanly shut down
  // the watcher and cancel any pending debounce before the process exits.

  return {
    close: async () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      await watcher.close();
    },
  };
}
