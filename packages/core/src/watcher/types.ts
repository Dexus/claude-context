// Type definitions for file system watching

/**
 * File change event types
 */
export type FileChangeType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

/**
 * Represents a file system change event
 */
export interface FileChangeEvent {
    /** Type of change that occurred */
    type: FileChangeType;
    /** Absolute path to the changed file or directory */
    path: string;
    /** Relative path from the watched root */
    relativePath: string;
    /** Timestamp when the change was detected */
    timestamp: number;
}

/**
 * Configuration options for the file watcher
 */
export interface WatcherOptions {
    /** Paths to watch (file paths or directory paths) */
    paths: string | string[];
    /** Debounce delay in milliseconds to batch rapid changes */
    debounceMs?: number;
    /** Whether to watch recursively (for directories) */
    recursive?: boolean;
    /** Whether to ignore initial scan results */
    ignoreInitial?: boolean;
    /** Glob patterns for files to ignore */
    ignored?: RegExp | string | ((path: string) => boolean);
    /** Whether to watch for file changes (default: true) */
    watchFile?: boolean;
    /** Whether to watch for directory changes (default: false) */
    watchDirectory?: boolean;
}

/**
 * Statistics about the watcher's operation
 */
export interface WatcherStats {
    /** Number of files being watched */
    watchedFiles: number;
    /** Number of change events detected */
    totalEvents: number;
    /** Number of change events processed (after debouncing) */
    processedEvents: number;
    /** Number of errors encountered */
    errors: number;
    /** Timestamp when the watcher was started */
    startedAt: number;
}

/**
 * Callback function invoked when files are changed
 * @param changedFiles Set of file paths that changed (after debouncing)
 * @param events Array of individual change events that were batched
 */
export type FileChangeCallback = (
    changedFiles: Set<string>,
    events: FileChangeEvent[]
) => void | Promise<void>;

/**
 * Callback function invoked when an error occurs
 * @param error The error that occurred
 */
export type ErrorCallback = (error: Error) => void;

/**
 * Interface for a file system watcher
 * Monitors file system changes and triggers callbacks with debouncing
 */
export interface FileWatcher {
    /**
     * Start watching the configured paths
     * @throws Error if watcher is already started or fails to initialize
     */
    start(): Promise<void>;

    /**
     * Stop watching and clean up resources
     */
    stop(): Promise<void>;

    /**
     * Check if the watcher is currently active
     */
    isWatching(): boolean;

    /**
     * Get current statistics about the watcher
     */
    getStats(): WatcherStats;

    /**
     * Update the paths being watched
     * @param paths New paths to watch
     * @param restart Whether to restart the watcher to apply changes (default: true)
     */
    updatePaths(paths: string | string[], restart?: boolean): Promise<void>;

    /**
     * Set the file change callback
     * @param callback Function to call when changes are detected (after debouncing)
     */
    onChange(callback: FileChangeCallback): void;

    /**
     * Set the error callback
     * @param callback Function to call when errors occur
     */
    onError(callback: ErrorCallback): void;
}
