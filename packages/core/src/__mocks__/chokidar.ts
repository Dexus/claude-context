const createMockFSWatcher = () => {
    const watcher: any = {
        on: jest.fn(function(this: any, event: string, callback: any) {
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
        handlers: {} as Record<string, any>,
        watchedPaths: {} as Record<string, string[]>
    };
    return watcher;
};

export const watch = jest.fn((paths: string | string[], options?: any) => {
    const watcher = createMockFSWatcher();
    const pathStr = Array.isArray(paths) ? paths[0] : paths;
    watcher.watchedPaths = {
        [pathStr]: ['file1.ts', 'file2.ts', 'src/file3.ts']
    };
    return watcher;
});

export default { watch };
