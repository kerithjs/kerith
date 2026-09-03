// src/channels/types.ts

/**
 * Plugin registered by Alias channel identifiers.
 * @kerith/app uses this to register alias providers in core.
 */
export interface AliasPlugin {
  /** Alias prefix — e.g. 'client' generates '@client/{name}' */
  prefix: string;
  /** Name of the resource declared by the user */
  name: string;
  /** Absolute path to the file that declared the identifier */
  filePath: string;
  /** Factory that returns the real instance */
  resolve: () => unknown;
}

/**
 * Plugin registered by Middleware channel identifiers.
 * Registered ONCE when importing the identifier module (not per instance).
 */
export interface MiddlewarePlugin {
  /** Name of the resource declared by the user */
  name: string;
  /** Absolute path to the file that declared the identifier */
  filePath: string;
  /** Execution phase in the Express chain */
  phase: "pre" | "post" | "error";
  /**
   * Order within the phase (higher = earlier — matches Core's execution order).
   * Core sorts descending: `sort((a, b) => b.priority - a.priority)`.
   * Convention: RateLimit = 2, Guard = 1, Validate = 0.5, Middleware = 0.
   */
  priority: number;
  /**
   * Returns the data that @kerith/app needs to build the RequestHandler[].
   * Receives the core ControllerEntry — typed as unknown here because
   * @kerith/identifiers does not import Express nor knows about RequestHandler.
   */
  getHandlers(controller: unknown): unknown[];
}

/**
 * Plugin registered by Schedule channel identifiers.
 * Each instance (e.g. each Cron()) registers its own plugin.
 */
export interface SchedulePlugin {
  /** Unique identifier — e.g. 'cron:0 2 * * *:/abs/path/to/file.ts' */
  name: string;
  /** Absolute path to the file that declared the identifier */
  filePath: string;
  /** When it should be executed */
  timing: "after-bootstrap" | "on-listen" | "on-shutdown";
  /** Only present in Cron type plugins */
  expression?: string;
  /** The function to execute */
  execute: () => void | Promise<void>;
}

/**
 * Plugin registered by Binding channel identifiers.
 * Each instance registers its own plugin.
 */
export interface BindingPlugin {
  /** Unique identifier of the binding */
  name: string;
  /** Absolute path to the file that declared the identifier */
  filePath: string;
  /** Binding type — used by @kerith/app to choose the correct executor */
  kind:
    | "worker"
    | "processor"
    | "message"
    | "batch"
    | "saga"
    | "outbox"
    | "pipeline"
    | "gateway"
    | "sse"
    | "stream"
    | "metric"
    | "subscriber"
    | "choreography";
  /**
   * Opaque data that @kerith/app will receive.
   * The corresponding executor knows how to interpret them.
   * Typed as unknown — identifiers does not import BullMQ/Socket.io/etc.
   */
  bind: unknown;
}
