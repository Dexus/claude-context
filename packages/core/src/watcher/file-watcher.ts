import * as chokidar from 'chokidar';
import * as path from 'path';
import {
    FileWatcher,
    WatcherOptions,
    WatcherStats,
    FileChangeEvent,
    FileChangeCallback,
    ErrorCallback,
    FileChangeType
} from './types';

export class ChokidarFileWatcher implements FileWatcher {
    private watcher: chokidar.FSWatcher | null;
    private options: Required<WatcherOptions>;
    private changeCallback: FileChangeCallback | null;
    private errorCallback: ErrorCallback | null;
    private debounceTimer: NodeJS.Timeout | null;
    private pendingChanges: Set<string>;
    private pendingEvents: FileChangeEvent[];
    private stats: WatcherStats;
    private rootDir: string;
    private isRunning: boolean;

    constructor(rootDir: string, options: WatcherOptions) {
        this.rootDir = path.resolve(rootDir);
        this.watcher = null;
        this.isRunning = false;
        this.changeCallback = null;
        this.errorCallback = null;
        this.debounceTimer = null;
        this.pendingChanges = new Set();
        this.pendingEvents = [];

        // Default options with required values
        this.options = {
            paths: options.paths,
            debounceMs: options.debounceMs ?? 2000,
            recursive: options.recursive ?? true,
            ignoreInitial: options.ignoreInitial ?? true,
            ignored: options.ignored,
            watchFile: options.watchFile ?? true,
            watchDirectory: options.watchDirectory ?? false
        };

        // Initialize stats
        this.stats = {
            watchedFiles: 0,
            totalEvents: 0,
            processedEvents: 0,
            errors: 0,
            startedAt: 0
        };
    }

    public async start(): Promise<void> {
        if (this.isRunning) {
            throw new Error('File watcher is already running');
        }

        try {
            console.log(`Starting file watcher for ${this.rootDir}`);

            // Normalize paths to be absolute
            const watchPaths = this.normalizePaths(this.options.paths);

            // Create chokidar watcher
            this.watcher = chokidar.watch(watchPaths, {
                ignored: this.options.ignored,
                persistent: true,
                ignoreInitial: this.options.ignoreInitial,
                awaitWriteFinish: {
                    stabilityThreshold: 200,
                    pollInterval: 100
                }
            });

            // Set up event handlers
            this.watcher.on('add', (filePath) => this.handleChange('add', filePath));
            this.watcher.on('change', (filePath) => this.handleChange('change', filePath));
            this.watcher.on('unlink', (filePath) => this.handleChange('unlink', filePath));
            this.watcher.on('addDir', (dirPath) => this.handleChange('addDir', dirPath));
            this.watcher.on('unlinkDir', (dirPath) => this.handleChange('unlinkDir', dirPath));
            this.watcher.on('error', (error) => this.handleError(error));
            this.watcher.on('ready', () => this.handleReady());

            this.isRunning = true;
            this.stats.startedAt = Date.now();

            console.log('File watcher started successfully');
        } catch (error: any) {
            this.stats.errors++;
            this.handleError(error);
            throw new Error(`Failed to start file watcher: ${error.message}`);
        }
    }

    public async stop(): Promise<void> {
        if (!this.isRunning) {
            console.warn('File watcher is not running');
            return;
        }

        try {
            console.log('Stopping file watcher');

            // Clear any pending debounce timer
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = null;
            }

            // Process any pending changes before stopping
            if (this.pendingChanges.size > 0 && this.changeCallback) {
                await this.changeCallback(this.pendingChanges, this.pendingEvents);
            }

            // Close the watcher
            if (this.watcher) {
                await this.watcher.close();
                this.watcher = null;
            }

            // Reset state
            this.isRunning = false;
            this.pendingChanges.clear();
            this.pendingEvents = [];

            console.log('File watcher stopped successfully');
        } catch (error: any) {
            this.stats.errors++;
            this.handleError(error);
            throw new Error(`Failed to stop file watcher: ${error.message}`);
        }
    }

    public isWatching(): boolean {
        return this.isRunning;
    }

    public getStats(): WatcherStats {
        return { ...this.stats };
    }

    public async updatePaths(paths: string | string[], restart: boolean = true): Promise<void> {
        const newPaths = this.normalizePaths(paths);

        if (restart && this.isRunning) {
            await this.stop();
            this.options.paths = newPaths;
            await this.start();
        } else {
            this.options.paths = newPaths;
        }
    }

    public onChange(callback: FileChangeCallback): void {
        this.changeCallback = callback;
    }

    public onError(callback: ErrorCallback): void {
        this.errorCallback = callback;
    }

    private normalizePaths(paths: string | string[]): string[] {
        const pathArray = Array.isArray(paths) ? paths : [paths];

        return pathArray.map(p => {
            const absolutePath = path.isAbsolute(p) ? p : path.resolve(this.rootDir, p);
            return absolutePath;
        });
    }

    private handleChange(type: FileChangeType, filePath: string): void {
        try {
            // Convert to relative path from root
            let relativePath: string;
            try {
                relativePath = path.relative(this.rootDir, filePath);
            } catch (error: any) {
                console.warn(`Failed to get relative path for ${filePath}: ${error.message}`);
                relativePath = filePath;
            }

            // Update stats
            this.stats.totalEvents++;

            // Create change event
            const event: FileChangeEvent = {
                type,
                path: filePath,
                relativePath,
                timestamp: Date.now()
            };

            // Add to pending changes
            this.pendingChanges.add(relativePath);
            this.pendingEvents.push(event);

            // Reset debounce timer
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            // Set new debounce timer
            this.debounceTimer = setTimeout(
                () => this.processPendingChanges(),
                this.options.debounceMs
            );

        } catch (error: any) {
            this.stats.errors++;
            this.handleError(error);
        }
    }

    private async processPendingChanges(): Promise<void> {
        if (!this.changeCallback || this.pendingChanges.size === 0) {
            return;
        }

        try {
            // Clone the pending changes and events
            const changesToProcess = new Set(this.pendingChanges);
            const eventsToProcess = [...this.pendingEvents];

            // Clear pending changes
            this.pendingChanges.clear();
            this.pendingEvents = [];

            // Update stats
            this.stats.processedEvents += eventsToProcess.length;

            // Invoke callback
            await this.changeCallback(changesToProcess, eventsToProcess);

        } catch (error: any) {
            this.stats.errors++;
            this.handleError(error);
        }
    }

    private handleReady(): void {
        try {
            if (this.watcher) {
                this.stats.watchedFiles = this.watcher.getWatched().size;
            }
            console.log(`File watcher ready. Watching ${this.stats.watchedFiles} directories.`);
        } catch (error: any) {
            console.warn(`Failed to get watched files count: ${error.message}`);
        }
    }

    private handleError(error: Error): void {
        console.error('File watcher error:', error);

        if (this.errorCallback) {
            try {
                this.errorCallback(error);
            } catch (callbackError: any) {
                console.error('Error in error callback:', callbackError);
            }
        }
    }
}
