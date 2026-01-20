/* eslint-disable @typescript-eslint/no-require-imports */
import * as path from 'path';
import * as os from 'os';
import { ChokidarFileWatcher } from '../../watcher/file-watcher';
import {
    FileChangeEvent,
    WatcherOptions
} from '../../watcher/types';

jest.mock('chokidar');

// Type for mock watcher
interface MockFSWatcher {
    on: jest.Mock;
    close: jest.Mock;
    getWatched: jest.Mock;
    add: jest.Mock;
    unwatch: jest.Mock;
    closed: boolean;
    handlers: Record<string, (...args: unknown[]) => void>;
    watchedPaths: Record<string, string[]>;
}

describe('ChokidarFileWatcher', () => {
    let tempDir: string;
    let homeDir: string;

    // Store original console methods
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    beforeEach(() => {
        homeDir = os.homedir();
        tempDir = path.join(homeDir, 'test-project');

        // Set up chokidar mock
        const chokidar = require('chokidar');
        const createMockFSWatcher = (): MockFSWatcher => {
            const watcher: MockFSWatcher = {
                on: jest.fn(function(event: string, callback: (...args: unknown[]) => void) {
                    watcher.handlers[event] = callback;
                    return watcher;
                }),
                close: jest.fn(async () => {
                    watcher.closed = true;
                }),
                getWatched: jest.fn(() => watcher.watchedPaths || {}),
                add: jest.fn(() => watcher),
                unwatch: jest.fn(() => watcher),
                closed: false,
                handlers: {},
                watchedPaths: {}
            };
            return watcher;
        };
        chokidar.watch.mockImplementation((paths: string | string[], _options?: Record<string, unknown>) => {
            const watcher = createMockFSWatcher();
            const pathStr = Array.isArray(paths) ? paths[0] : paths;
            watcher.watchedPaths = {
                [pathStr]: ['file1.ts', 'file2.ts', 'src/file3.ts']
            };
            return watcher;
        });

        // Mock console to prevent noise in tests
        console.log = jest.fn();
        console.error = jest.fn();
        console.warn = jest.fn();
    });

    afterEach(() => {
        // Restore console methods
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        console.warn = originalConsoleWarn;
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with given root directory', () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            expect(watcher).toBeDefined();
        });

        it('should initialize with default options', () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            expect(watcher).toBeDefined();
            expect(watcher.isWatching()).toBe(false);
        });

        it('should accept custom debounce interval', () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 5000
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            expect(watcher).toBeDefined();
        });

        it('should accept custom ignore patterns', () => {
            const options: WatcherOptions = {
                paths: tempDir,
                ignored: /node_modules/
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            expect(watcher).toBeDefined();
        });

        it('should initialize with zero stats', () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const stats = watcher.getStats();

            expect(stats.watchedFiles).toBe(0);
            expect(stats.totalEvents).toBe(0);
            expect(stats.processedEvents).toBe(0);
            expect(stats.errors).toBe(0);
            expect(stats.startedAt).toBe(0);
        });
    });

    describe('start', () => {
        it('should start watching successfully', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            expect(watcher.isWatching()).toBe(true);

            await watcher.stop();
        });

        it('should set up chokidar event handlers', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            expect(instance.on).toHaveBeenCalledWith('add', expect.any(Function));
            expect(instance.on).toHaveBeenCalledWith('change', expect.any(Function));
            expect(instance.on).toHaveBeenCalledWith('unlink', expect.any(Function));
            expect(instance.on).toHaveBeenCalledWith('addDir', expect.any(Function));
            expect(instance.on).toHaveBeenCalledWith('unlinkDir', expect.any(Function));
            expect(instance.on).toHaveBeenCalledWith('error', expect.any(Function));
            expect(instance.on).toHaveBeenCalledWith('ready', expect.any(Function));

            await watcher.stop();
        });

        it('should throw error when already started', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            await expect(watcher.start()).rejects.toThrow('File watcher is already running');

            await watcher.stop();
        });

        it('should initialize stats.startedAt when started', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);

            const beforeStart = Date.now();
            await watcher.start();
            const afterStart = Date.now();

            const stats = watcher.getStats();
            expect(stats.startedAt).toBeGreaterThanOrEqual(beforeStart);
            expect(stats.startedAt).toBeLessThanOrEqual(afterStart);

            await watcher.stop();
        });

        it('should normalize paths to absolute', async () => {
            const options: WatcherOptions = {
                paths: './relative-path'
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchedPaths = (chokidar.watch as jest.Mock).mock.calls[0][0];
            // normalizePaths returns an array
            expect(Array.isArray(watchedPaths)).toBe(true);
            expect(path.isAbsolute(watchedPaths[0])).toBe(true);

            await watcher.stop();
        });

        it('should handle array of paths', async () => {
            const options: WatcherOptions = {
                paths: [tempDir, path.join(tempDir, 'src')]
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            expect(watcher.isWatching()).toBe(true);

            await watcher.stop();
        });

        it('should pass ignored option to chokidar when defined', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                ignored: /node_modules/
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            const chokidarOptions = (require('chokidar').watch as jest.Mock).mock.calls[0][1];
            expect(chokidarOptions.ignored).toBeDefined();

            await watcher.stop();
        });

        it('should not pass undefined ignored option to chokidar', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            const chokidarOptions = (require('chokidar').watch as jest.Mock).mock.calls[0][1];
            expect(chokidarOptions.ignored).toBeUndefined();

            await watcher.stop();
        });
    });

    describe('stop', () => {
        it('should stop watching successfully', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            expect(watcher.isWatching()).toBe(true);

            await watcher.stop();

            expect(watcher.isWatching()).toBe(false);
        });

        it('should close chokidar watcher', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            await watcher.stop();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            expect(instance.close).toHaveBeenCalled();
            expect(instance.closed).toBe(true);
        });

        it('should clear pending changes when stopped', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();
            await watcher.stop();

            // Watcher should be stopped
            expect(watcher.isWatching()).toBe(false);
        });

        it('should warn when stopping non-running watcher', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);

            // Should not throw, just warn
            await expect(watcher.stop()).resolves.not.toThrow();
            expect(console.warn).toHaveBeenCalledWith('[FILEWATCHER] File watcher is not running');
        });
    });

    describe('isWatching', () => {
        it('should return false before start', () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            expect(watcher.isWatching()).toBe(false);
        });

        it('should return true after start', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            expect(watcher.isWatching()).toBe(true);

            await watcher.stop();
        });

        it('should return false after stop', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();
            await watcher.stop();

            expect(watcher.isWatching()).toBe(false);
        });
    });

    describe('getStats', () => {
        it('should return initial stats before start', () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const stats = watcher.getStats();

            expect(stats).toEqual({
                watchedFiles: 0,
                totalEvents: 0,
                processedEvents: 0,
                errors: 0,
                startedAt: 0
            });
        });

        it('should return stats after start', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            const stats = watcher.getStats();
            expect(stats.startedAt).toBeGreaterThan(0);
            expect(stats.watchedFiles).toBeGreaterThanOrEqual(0);

            await watcher.stop();
        });

        it('should return a copy of stats (not reference)', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            const stats1 = watcher.getStats();
            const stats2 = watcher.getStats();

            expect(stats1).not.toBe(stats2);
            expect(stats1).toEqual(stats2);

            await watcher.stop();
        });
    });

    describe('updatePaths', () => {
        it('should update paths without restart when restart=false', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            const newPath = path.join(tempDir, 'new-path');
            await watcher.updatePaths(newPath, false);

            expect(watcher.isWatching()).toBe(true);

            await watcher.stop();
        });

        it('should restart watcher when restart=true', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            const newPath = path.join(tempDir, 'new-path');
            await watcher.updatePaths(newPath, true);

            expect(watcher.isWatching()).toBe(true);

            await watcher.stop();
        });

        it('should handle array of paths', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            const newPaths = [tempDir, path.join(tempDir, 'src')];
            await watcher.updatePaths(newPaths, false);

            expect(watcher.isWatching()).toBe(true);

            await watcher.stop();
        });

        it('should normalize relative paths', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            await watcher.updatePaths('./relative', false);

            await watcher.stop();
        });
    });

    describe('onChange callback', () => {
        it('should register change callback', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            // Trigger a change event
            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            const filePath = path.join(tempDir, 'test.ts');
            instance.handlers['change'](filePath);

            // Wait for debounce
            await new Promise(resolve => setTimeout(resolve, 2100));

            expect(callback).toHaveBeenCalled();

            await watcher.stop();
        });

        it('should pass changed files to callback', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            // Trigger change events
            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['change'](path.join(tempDir, 'file1.ts'));
            instance.handlers['change'](path.join(tempDir, 'file2.ts'));

            // Wait for debounce
            await new Promise(resolve => setTimeout(resolve, 150));

            expect(callback).toHaveBeenCalledWith(
                expect.any(Set),
                expect.any(Array)
            );

            const changedFiles = callback.mock.calls[0][0];
            expect(changedFiles.size).toBe(2);

            await watcher.stop();
        });

        it('should pass events to callback', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            // Trigger change event
            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            const filePath = path.join(tempDir, 'test.ts');
            instance.handlers['change'](filePath);

            // Wait for debounce
            await new Promise(resolve => setTimeout(resolve, 150));

            const events = callback.mock.calls[0][1];
            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({
                type: 'change',
                path: filePath,
                relativePath: 'test.ts',
                timestamp: expect.any(Number)
            });

            await watcher.stop();
        });
    });

    describe('onError callback', () => {
        it('should register error callback', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onError(callback);
            await watcher.start();

            // Trigger error event
            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            const error = new Error('Test error');
            instance.handlers['error'](error);

            expect(callback).toHaveBeenCalledWith(error);

            await watcher.stop();
        });

        it('should increment error stats when error occurs', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            // Trigger error event
            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['error'](new Error('Test error'));

            const stats = watcher.getStats();
            expect(stats.errors).toBeGreaterThan(0);

            await watcher.stop();
        });
    });

    describe('debouncing', () => {
        it('should debounce rapid changes', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 200
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            // Trigger multiple rapid changes
            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['change'](path.join(tempDir, 'file1.ts'));
            instance.handlers['change'](path.join(tempDir, 'file2.ts'));
            instance.handlers['change'](path.join(tempDir, 'file3.ts'));

            // Callback should not be called immediately
            expect(callback).not.toHaveBeenCalled();

            // Wait for debounce
            await new Promise(resolve => setTimeout(resolve, 250));

            // Now callback should be called once
            expect(callback).toHaveBeenCalledTimes(1);

            await watcher.stop();
        });

        it('should batch all changes within debounce window', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 200
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            // Trigger changes
            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['change'](path.join(tempDir, 'file1.ts'));
            instance.handlers['change'](path.join(tempDir, 'file2.ts'));

            // Wait for debounce
            await new Promise(resolve => setTimeout(resolve, 250));

            const changedFiles = callback.mock.calls[0][0] as Set<string>;
            expect(changedFiles.size).toBe(2);

            await watcher.stop();
        });

        it('should reset debounce timer on new changes', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 200
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;

            // First change
            instance.handlers['change'](path.join(tempDir, 'file1.ts'));

            // Wait 100ms (less than debounce)
            await new Promise(resolve => setTimeout(resolve, 100));

            // Second change should reset timer
            instance.handlers['change'](path.join(tempDir, 'file2.ts'));

            // Wait 150ms (still less than debounce + 100ms)
            await new Promise(resolve => setTimeout(resolve, 150));

            // Callback should still not be called
            expect(callback).not.toHaveBeenCalled();

            // Wait another 100ms to exceed debounce
            await new Promise(resolve => setTimeout(resolve, 100));

            // Now callback should be called
            expect(callback).toHaveBeenCalledTimes(1);

            await watcher.stop();
        });
    });

    describe('change detection', () => {
        it('should detect file additions', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            const filePath = path.join(tempDir, 'new-file.ts');
            instance.handlers['add'](filePath);

            await new Promise(resolve => setTimeout(resolve, 150));

            const events = callback.mock.calls[0][1] as FileChangeEvent[];
            expect(events[0].type).toBe('add');
            expect(events[0].path).toBe(filePath);

            await watcher.stop();
        });

        it('should detect file changes', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            const filePath = path.join(tempDir, 'modified.ts');
            instance.handlers['change'](filePath);

            await new Promise(resolve => setTimeout(resolve, 150));

            const events = callback.mock.calls[0][1] as FileChangeEvent[];
            expect(events[0].type).toBe('change');

            await watcher.stop();
        });

        it('should detect file deletions', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            const filePath = path.join(tempDir, 'deleted.ts');
            instance.handlers['unlink'](filePath);

            await new Promise(resolve => setTimeout(resolve, 150));

            const events = callback.mock.calls[0][1] as FileChangeEvent[];
            expect(events[0].type).toBe('unlink');

            await watcher.stop();
        });

        it('should detect directory additions', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            const dirPath = path.join(tempDir, 'new-dir');
            instance.handlers['addDir'](dirPath);

            await new Promise(resolve => setTimeout(resolve, 150));

            const events = callback.mock.calls[0][1] as FileChangeEvent[];
            expect(events.some(e => e.type === 'addDir')).toBe(true);

            await watcher.stop();
        });

        it('should detect directory deletions', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            const dirPath = path.join(tempDir, 'removed-dir');
            instance.handlers['unlinkDir'](dirPath);

            await new Promise(resolve => setTimeout(resolve, 150));

            const events = callback.mock.calls[0][1] as FileChangeEvent[];
            expect(events.some(e => e.type === 'unlinkDir')).toBe(true);

            await watcher.stop();
        });

        it('should calculate relative paths correctly', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            const filePath = path.join(tempDir, 'src', 'nested', 'file.ts');
            instance.handlers['change'](filePath);

            await new Promise(resolve => setTimeout(resolve, 150));

            const events = callback.mock.calls[0][1] as FileChangeEvent[];
            expect(events[0].relativePath).toBe(path.join('src', 'nested', 'file.ts'));

            await watcher.stop();
        });

        it('should include timestamp in events', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            const beforeEvent = Date.now();
            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['change'](path.join(tempDir, 'file.ts'));
            const afterEvent = Date.now();

            await new Promise(resolve => setTimeout(resolve, 150));

            const events = callback.mock.calls[0][1] as FileChangeEvent[];
            expect(events[0].timestamp).toBeGreaterThanOrEqual(beforeEvent);
            expect(events[0].timestamp).toBeLessThanOrEqual(afterEvent);

            await watcher.stop();
        });
    });

    describe('handleReady', () => {
        it('should update watchedFiles count when ready', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['ready']();

            const stats = watcher.getStats();
            expect(stats.watchedFiles).toBeGreaterThan(0);

            await watcher.stop();
        });

        it('should count all watched files', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.watchedPaths = {
                '/root': ['file1.ts', 'file2.ts'],
                '/root/src': ['file3.ts', 'file4.ts', 'file5.ts']
            };
            instance.handlers['ready']();

            const stats = watcher.getStats();
            expect(stats.watchedFiles).toBe(5);

            await watcher.stop();
        });
    });

    describe('stats tracking', () => {
        it('should track total events', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['change'](path.join(tempDir, 'file1.ts'));
            instance.handlers['change'](path.join(tempDir, 'file2.ts'));
            instance.handlers['add'](path.join(tempDir, 'file3.ts'));

            const stats = watcher.getStats();
            expect(stats.totalEvents).toBe(3);

            await watcher.stop();
        });

        it('should track processed events', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            watcher.onChange(async () => {});
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['change'](path.join(tempDir, 'file1.ts'));
            instance.handlers['change'](path.join(tempDir, 'file2.ts'));

            await new Promise(resolve => setTimeout(resolve, 150));

            const stats = watcher.getStats();
            expect(stats.processedEvents).toBe(2);

            await watcher.stop();
        });

        it('should track errors', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['error'](new Error('Error 1'));
            instance.handlers['error'](new Error('Error 2'));

            const stats = watcher.getStats();
            expect(stats.errors).toBe(2);

            await watcher.stop();
        });
    });

    describe('edge cases', () => {
        it('should handle relative path conversion failures gracefully', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            // This should still work even with unusual paths
            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['change']('/unrelated/path/file.ts');

            await new Promise(resolve => setTimeout(resolve, 150));

            // Should still callback, even if path conversion had issues
            expect(callback).toHaveBeenCalled();

            await watcher.stop();
        });

        it('should handle multiple start/stop cycles', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);

            await watcher.start();
            await watcher.stop();

            await watcher.start();
            await watcher.stop();

            expect(watcher.isWatching()).toBe(false);
        });

        it('should handle empty paths array', async () => {
            const options: WatcherOptions = {
                paths: []
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);

            // Should start without error (chokidar handles empty arrays)
            await watcher.start();
            await watcher.stop();

            expect(watcher.isWatching()).toBe(false);
        });

        it('should handle callback errors gracefully', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const errorCallback = jest.fn();

            watcher.onChange(async () => {
                throw new Error('Callback error');
            });
            watcher.onError(errorCallback);

            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['change'](path.join(tempDir, 'file.ts'));

            await new Promise(resolve => setTimeout(resolve, 150));

            // Error should be tracked
            const stats = watcher.getStats();
            expect(stats.errors).toBeGreaterThan(0);

            await watcher.stop();
        });

        it('should handle error callback errors', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);

            watcher.onError(() => {
                throw new Error('Error callback error');
            });

            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['error'](new Error('Original error'));

            // Should not throw, just log
            expect(console.error).toHaveBeenCalled();

            await watcher.stop();
        });

        it('should handle stop with pending changes', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 5000
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            // Trigger change (will be debounced for 5 seconds)
            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['change'](path.join(tempDir, 'file.ts'));

            // Stop immediately (should process pending changes)
            await watcher.stop();

            // Callback should have been called with pending changes
            expect(callback).toHaveBeenCalled();
        });

        it('should handle default debounce interval', async () => {
            const options: WatcherOptions = {
                paths: tempDir
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['change'](path.join(tempDir, 'file.ts'));

            // Wait default debounce (2000ms + small buffer)
            await new Promise(resolve => setTimeout(resolve, 2100));

            expect(callback).toHaveBeenCalledTimes(1);

            await watcher.stop();
        });

        it('should handle processing without callback', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);

            // Don't set any callback
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['change'](path.join(tempDir, 'file.ts'));

            // Should not throw
            await new Promise(resolve => setTimeout(resolve, 150));

            const stats = watcher.getStats();
            expect(stats.totalEvents).toBe(1);

            await watcher.stop();
        });
    });

    describe('integration scenarios', () => {
        it('should handle typical workflow: start -> change -> stop', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            expect(watcher.isWatching()).toBe(true);

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['change'](path.join(tempDir, 'file.ts'));

            await new Promise(resolve => setTimeout(resolve, 150));

            expect(callback).toHaveBeenCalledTimes(1);

            await watcher.stop();

            expect(watcher.isWatching()).toBe(false);
        });

        it('should handle multiple different event types', async () => {
            const options: WatcherOptions = {
                paths: tempDir,
                debounceMs: 100
            };

            const watcher = new ChokidarFileWatcher(tempDir, options);
            const callback = jest.fn();

            watcher.onChange(callback);
            await watcher.start();

            const chokidar = require('chokidar');
            const watchMock = chokidar.watch as jest.Mock;
            const instance = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
            instance.handlers['add'](path.join(tempDir, 'new.ts'));
            instance.handlers['change'](path.join(tempDir, 'modified.ts'));
            instance.handlers['unlink'](path.join(tempDir, 'deleted.ts'));

            await new Promise(resolve => setTimeout(resolve, 150));

            const events = callback.mock.calls[0][1] as FileChangeEvent[];
            expect(events).toHaveLength(3);

            const eventTypes = events.map(e => e.type).sort();
            expect(eventTypes).toEqual(['add', 'change', 'unlink']);

            await watcher.stop();
        });
    });
});
