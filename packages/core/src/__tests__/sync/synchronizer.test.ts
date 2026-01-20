import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import mockFs from 'mock-fs';
import { FileSynchronizer } from '../../sync/synchronizer';

describe('FileSynchronizer', () => {
    let tempDir: string;
    let homeDir: string;
    let snapshotDir: string;

    // Store original console methods
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    // Helper function to compute expected hash
    const computeHash = (data: string, algorithm: string = 'sha256'): string => {
        return crypto.createHash(algorithm).update(data).digest('hex');
    };

    // Helper to compute snapshot path for a directory
    const computeSnapshotPath = (codebasePath: string): string => {
        const normalizedPath = path.resolve(codebasePath);
        const hash = crypto.createHash('md5').update(normalizedPath).digest('hex');
        return path.join(homeDir, '.context', 'merkle', `${hash}.json`);
    };

    beforeEach(() => {
        homeDir = os.homedir();
        snapshotDir = path.join(homeDir, '.context', 'merkle');
        tempDir = path.join(homeDir, 'test-project');

        // Mock console to prevent mock-fs from breaking Jest's console
        console.log = jest.fn();
        console.error = jest.fn();
        console.warn = jest.fn();
    });

    afterEach(() => {
        mockFs.restore();

        // Restore console methods
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        console.warn = originalConsoleWarn;
    });

    describe('constructor', () => {
        it('should initialize with given root directory', () => {
            mockFs({
                [tempDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            expect(synchronizer).toBeDefined();
        });

        it('should initialize with empty ignore patterns by default', () => {
            mockFs({
                [tempDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            expect(synchronizer).toBeDefined();
        });

        it('should accept custom ignore patterns', () => {
            mockFs({
                [tempDir]: {},
            });

            const ignorePatterns = ['node_modules', '*.log', 'dist/'];
            const synchronizer = new FileSynchronizer(tempDir, ignorePatterns);
            expect(synchronizer).toBeDefined();
        });

        it('should compute correct snapshot path based on root directory', () => {
            mockFs({
                [tempDir]: {},
            });

            new FileSynchronizer(tempDir);
            // Snapshot path is computed based on MD5 hash of the resolved path
            const expectedSnapshotPath = computeSnapshotPath(tempDir);
            expect(expectedSnapshotPath).toContain('.context/merkle');
            expect(expectedSnapshotPath).toMatch(/[a-f0-9]{32}\.json$/);
        });
    });

    describe('initialize', () => {
        it('should initialize and create snapshot for empty directory', async () => {
            mockFs({
                [tempDir]: {},
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            // Snapshot file should be created
            const snapshotPath = computeSnapshotPath(tempDir);
            expect(fsSync.existsSync(snapshotPath)).toBe(true);
        });

        it('should initialize and hash all files in directory', async () => {
            mockFs({
                [tempDir]: {
                    'file1.txt': 'content1',
                    'file2.txt': 'content2',
                    'subdir': {
                        'file3.txt': 'content3',
                    },
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            // Verify files are tracked
            expect(synchronizer.getFileHash('file1.txt')).toBe(computeHash('content1'));
            expect(synchronizer.getFileHash('file2.txt')).toBe(computeHash('content2'));
            expect(synchronizer.getFileHash(path.join('subdir', 'file3.txt'))).toBe(computeHash('content3'));
        });

        it('should load existing snapshot if available', async () => {
            const existingHashes: [string, string][] = [
                ['file1.txt', computeHash('old content')],
            ];

            const snapshotData = JSON.stringify({
                fileHashes: existingHashes,
                merkleDAG: { nodes: [], rootIds: [] },
            });

            mockFs({
                [tempDir]: {
                    'file1.txt': 'new content',
                },
                [snapshotDir]: {
                    [`${crypto.createHash('md5').update(path.resolve(tempDir)).digest('hex')}.json`]: snapshotData,
                },
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            // Should load from snapshot (old hash), not regenerate
            expect(synchronizer.getFileHash('file1.txt')).toBe(computeHash('old content'));
        });

        it('should ignore hidden files and directories', async () => {
            mockFs({
                [tempDir]: {
                    'visible.txt': 'visible content',
                    '.hidden': 'hidden content',
                    '.hidden-dir': {
                        'file.txt': 'nested hidden content',
                    },
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash('visible.txt')).toBe(computeHash('visible content'));
            expect(synchronizer.getFileHash('.hidden')).toBeUndefined();
            expect(synchronizer.getFileHash(path.join('.hidden-dir', 'file.txt'))).toBeUndefined();
        });
    });

    describe('getFileHash', () => {
        it('should return hash for tracked file', async () => {
            mockFs({
                [tempDir]: {
                    'test.txt': 'test content',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            const hash = synchronizer.getFileHash('test.txt');
            expect(hash).toBe(computeHash('test content'));
        });

        it('should return undefined for non-tracked file', async () => {
            mockFs({
                [tempDir]: {
                    'test.txt': 'test content',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash('nonexistent.txt')).toBeUndefined();
        });

        it('should return undefined before initialization', () => {
            mockFs({
                [tempDir]: {
                    'test.txt': 'test content',
                },
            });

            const synchronizer = new FileSynchronizer(tempDir);
            expect(synchronizer.getFileHash('test.txt')).toBeUndefined();
        });
    });

    describe('checkForChanges', () => {
        it('should detect added files', async () => {
            mockFs({
                [tempDir]: {
                    'original.txt': 'original content',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            // Add a new file
            mockFs.restore();
            mockFs({
                [tempDir]: {
                    'original.txt': 'original content',
                    'new-file.txt': 'new content',
                },
                [snapshotDir]: {
                    [`${crypto.createHash('md5').update(path.resolve(tempDir)).digest('hex')}.json`]: JSON.stringify({
                        fileHashes: [['original.txt', computeHash('original content')]],
                        merkleDAG: { nodes: [], rootIds: [] },
                    }),
                },
            });

            const changes = await synchronizer.checkForChanges();

            expect(changes.added).toContain('new-file.txt');
            expect(changes.removed).toEqual([]);
            expect(changes.modified).toEqual([]);
        });

        it('should detect removed files', async () => {
            mockFs({
                [tempDir]: {
                    'file1.txt': 'content1',
                    'file2.txt': 'content2',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            // Remove a file
            mockFs.restore();
            mockFs({
                [tempDir]: {
                    'file1.txt': 'content1',
                },
                [snapshotDir]: {
                    [`${crypto.createHash('md5').update(path.resolve(tempDir)).digest('hex')}.json`]: JSON.stringify({
                        fileHashes: [
                            ['file1.txt', computeHash('content1')],
                            ['file2.txt', computeHash('content2')],
                        ],
                        merkleDAG: { nodes: [], rootIds: [] },
                    }),
                },
            });

            const changes = await synchronizer.checkForChanges();

            expect(changes.removed).toContain('file2.txt');
            expect(changes.added).toEqual([]);
            expect(changes.modified).toEqual([]);
        });

        it('should detect modified files', async () => {
            mockFs({
                [tempDir]: {
                    'file.txt': 'original content',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            // Modify the file
            mockFs.restore();
            mockFs({
                [tempDir]: {
                    'file.txt': 'modified content',
                },
                [snapshotDir]: {
                    [`${crypto.createHash('md5').update(path.resolve(tempDir)).digest('hex')}.json`]: JSON.stringify({
                        fileHashes: [['file.txt', computeHash('original content')]],
                        merkleDAG: { nodes: [], rootIds: [] },
                    }),
                },
            });

            const changes = await synchronizer.checkForChanges();

            expect(changes.modified).toContain('file.txt');
            expect(changes.added).toEqual([]);
            expect(changes.removed).toEqual([]);
        });

        it('should detect multiple types of changes simultaneously', async () => {
            mockFs({
                [tempDir]: {
                    'keep.txt': 'keep content',
                    'modify.txt': 'original',
                    'remove.txt': 'remove content',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            // Make multiple changes
            mockFs.restore();
            mockFs({
                [tempDir]: {
                    'keep.txt': 'keep content',
                    'modify.txt': 'modified',
                    'add.txt': 'new content',
                },
                [snapshotDir]: {
                    [`${crypto.createHash('md5').update(path.resolve(tempDir)).digest('hex')}.json`]: JSON.stringify({
                        fileHashes: [
                            ['keep.txt', computeHash('keep content')],
                            ['modify.txt', computeHash('original')],
                            ['remove.txt', computeHash('remove content')],
                        ],
                        merkleDAG: { nodes: [], rootIds: [] },
                    }),
                },
            });

            const changes = await synchronizer.checkForChanges();

            expect(changes.added).toContain('add.txt');
            expect(changes.removed).toContain('remove.txt');
            expect(changes.modified).toContain('modify.txt');
        });

        it('should return empty arrays when no changes detected', async () => {
            mockFs({
                [tempDir]: {
                    'file.txt': 'content',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            const changes = await synchronizer.checkForChanges();

            expect(changes.added).toEqual([]);
            expect(changes.removed).toEqual([]);
            expect(changes.modified).toEqual([]);
        });

        it('should update internal state after detecting changes', async () => {
            mockFs({
                [tempDir]: {
                    'file.txt': 'original',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            // Modify file
            mockFs.restore();
            mockFs({
                [tempDir]: {
                    'file.txt': 'modified',
                },
                [snapshotDir]: {
                    [`${crypto.createHash('md5').update(path.resolve(tempDir)).digest('hex')}.json`]: JSON.stringify({
                        fileHashes: [['file.txt', computeHash('original')]],
                        merkleDAG: { nodes: [], rootIds: [] },
                    }),
                },
            });

            await synchronizer.checkForChanges();

            // Internal state should be updated
            expect(synchronizer.getFileHash('file.txt')).toBe(computeHash('modified'));
        });
    });

    describe('ignore patterns', () => {
        it('should ignore files matching simple patterns', async () => {
            mockFs({
                [tempDir]: {
                    'file.txt': 'text content',
                    'file.log': 'log content',
                    'data.log': 'data log',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir, ['*.log']);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash('file.txt')).toBe(computeHash('text content'));
            expect(synchronizer.getFileHash('file.log')).toBeUndefined();
            expect(synchronizer.getFileHash('data.log')).toBeUndefined();
        });

        it('should ignore directories matching patterns', async () => {
            mockFs({
                [tempDir]: {
                    'src': {
                        'app.ts': 'app code',
                    },
                    'node_modules': {
                        'package': {
                            'index.js': 'module code',
                        },
                    },
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir, ['node_modules/']);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash(path.join('src', 'app.ts'))).toBe(computeHash('app code'));
            expect(synchronizer.getFileHash(path.join('node_modules', 'package', 'index.js'))).toBeUndefined();
        });

        it('should ignore files in subdirectories matching patterns', async () => {
            mockFs({
                [tempDir]: {
                    'src': {
                        'build': {
                            'output.js': 'built code',
                        },
                        'source.ts': 'source code',
                    },
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir, ['build/']);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash(path.join('src', 'source.ts'))).toBe(computeHash('source code'));
            expect(synchronizer.getFileHash(path.join('src', 'build', 'output.js'))).toBeUndefined();
        });

        it('should handle multiple ignore patterns', async () => {
            mockFs({
                [tempDir]: {
                    'app.ts': 'app code',
                    'app.js': 'compiled',
                    'debug.log': 'logs',
                    'dist': {
                        'bundle.js': 'bundle',
                    },
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir, ['*.log', '*.js', 'dist/']);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash('app.ts')).toBe(computeHash('app code'));
            expect(synchronizer.getFileHash('app.js')).toBeUndefined();
            expect(synchronizer.getFileHash('debug.log')).toBeUndefined();
            expect(synchronizer.getFileHash(path.join('dist', 'bundle.js'))).toBeUndefined();
        });

        it('should ignore files matching path patterns', async () => {
            mockFs({
                [tempDir]: {
                    'src': {
                        'test': {
                            'spec.ts': 'test code',
                        },
                        'main.ts': 'main code',
                    },
                    'test': {
                        'e2e.ts': 'e2e test',
                    },
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir, ['src/test/']);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash(path.join('src', 'main.ts'))).toBe(computeHash('main code'));
            expect(synchronizer.getFileHash(path.join('src', 'test', 'spec.ts'))).toBeUndefined();
            // test/ at root should not be ignored since pattern is src/test/
            expect(synchronizer.getFileHash(path.join('test', 'e2e.ts'))).toBe(computeHash('e2e test'));
        });

        it('should always ignore hidden files regardless of patterns', async () => {
            mockFs({
                [tempDir]: {
                    'visible.txt': 'visible',
                    '.gitignore': 'patterns',
                    '.git': {
                        'config': 'git config',
                    },
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir, []);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash('visible.txt')).toBe(computeHash('visible'));
            expect(synchronizer.getFileHash('.gitignore')).toBeUndefined();
            expect(synchronizer.getFileHash(path.join('.git', 'config'))).toBeUndefined();
        });

        it('should handle wildcard patterns with extensions', async () => {
            mockFs({
                [tempDir]: {
                    'app.test.ts': 'test code',
                    'app.ts': 'app code',
                    'util.test.ts': 'util test',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir, ['*.test.ts']);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash('app.ts')).toBe(computeHash('app code'));
            expect(synchronizer.getFileHash('app.test.ts')).toBeUndefined();
            expect(synchronizer.getFileHash('util.test.ts')).toBeUndefined();
        });
    });

    describe('deleteSnapshot', () => {
        it('should delete existing snapshot file', async () => {
            const snapshotPath = computeSnapshotPath(tempDir);

            mockFs({
                [tempDir]: {},
                [snapshotDir]: {
                    [`${crypto.createHash('md5').update(path.resolve(tempDir)).digest('hex')}.json`]: '{}',
                },
            });

            expect(fsSync.existsSync(snapshotPath)).toBe(true);

            await FileSynchronizer.deleteSnapshot(tempDir);

            expect(fsSync.existsSync(snapshotPath)).toBe(false);
        });

        it('should not throw when snapshot does not exist', async () => {
            mockFs({
                [tempDir]: {},
                [snapshotDir]: {},
            });

            // Should not throw
            await expect(FileSynchronizer.deleteSnapshot(tempDir)).resolves.not.toThrow();
        });

        it('should throw for other file system errors', async () => {
            mockFs({
                [tempDir]: {},
                [snapshotDir]: mockFs.directory({
                    mode: 0o000, // No permissions
                    items: {
                        [`${crypto.createHash('md5').update(path.resolve(tempDir)).digest('hex')}.json`]: '{}',
                    },
                }),
            });

            // Should throw due to permission error
            await expect(FileSynchronizer.deleteSnapshot(tempDir)).rejects.toThrow();
        });
    });

    describe('file system error handling', () => {
        it('should handle unreadable directories gracefully', async () => {
            mockFs({
                [tempDir]: {
                    'readable.txt': 'content',
                    'unreadable-dir': mockFs.directory({
                        mode: 0o000,
                        items: {
                            'file.txt': 'hidden content',
                        },
                    }),
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            // Should not throw
            await expect(synchronizer.initialize()).resolves.not.toThrow();
            expect(synchronizer.getFileHash('readable.txt')).toBe(computeHash('content'));
        });

        it('should handle files that become unreadable', async () => {
            mockFs({
                [tempDir]: {
                    'readable.txt': 'content',
                    'unreadable.txt': mockFs.file({
                        content: 'secret',
                        mode: 0o000,
                    }),
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            // Should skip unreadable file without throwing
            expect(synchronizer.getFileHash('readable.txt')).toBe(computeHash('content'));
        });
    });

    describe('snapshot persistence', () => {
        it('should save snapshot after initialization', async () => {
            mockFs({
                [tempDir]: {
                    'file.txt': 'content',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            const snapshotPath = computeSnapshotPath(tempDir);
            expect(fsSync.existsSync(snapshotPath)).toBe(true);

            const snapshotContent = JSON.parse(fsSync.readFileSync(snapshotPath, 'utf-8'));
            expect(snapshotContent.fileHashes).toBeDefined();
            expect(snapshotContent.merkleDAG).toBeDefined();
        });

        it('should save snapshot after detecting changes', async () => {
            mockFs({
                [tempDir]: {
                    'file.txt': 'original',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            // Modify file
            mockFs.restore();
            mockFs({
                [tempDir]: {
                    'file.txt': 'modified',
                    'new.txt': 'new file',
                },
                [snapshotDir]: {
                    [`${crypto.createHash('md5').update(path.resolve(tempDir)).digest('hex')}.json`]: JSON.stringify({
                        fileHashes: [['file.txt', computeHash('original')]],
                        merkleDAG: { nodes: [], rootIds: [] },
                    }),
                },
            });

            await synchronizer.checkForChanges();

            const snapshotPath = computeSnapshotPath(tempDir);
            const snapshotContent = JSON.parse(fsSync.readFileSync(snapshotPath, 'utf-8'));

            // Verify updated hashes are in snapshot
            const hashMap = new Map(snapshotContent.fileHashes);
            expect(hashMap.get('file.txt')).toBe(computeHash('modified'));
            expect(hashMap.get('new.txt')).toBe(computeHash('new file'));
        });

        it('should create snapshot directory if it does not exist', async () => {
            mockFs({
                [tempDir]: {
                    'file.txt': 'content',
                },
                [homeDir]: {}, // No .context directory
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            // Snapshot directory should be created
            expect(fsSync.existsSync(snapshotDir)).toBe(true);
        });
    });

    describe('nested directory structure', () => {
        it('should handle deeply nested directory structures', async () => {
            mockFs({
                [tempDir]: {
                    'level1': {
                        'level2': {
                            'level3': {
                                'level4': {
                                    'deep-file.txt': 'deep content',
                                },
                            },
                        },
                    },
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            const deepPath = path.join('level1', 'level2', 'level3', 'level4', 'deep-file.txt');
            expect(synchronizer.getFileHash(deepPath)).toBe(computeHash('deep content'));
        });

        it('should handle many files in a single directory', async () => {
            const files: { [key: string]: string } = {};
            for (let i = 0; i < 50; i++) {
                files[`file${i}.txt`] = `content ${i}`;
            }

            mockFs({
                [tempDir]: files,
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            // Verify all files are tracked
            for (let i = 0; i < 50; i++) {
                expect(synchronizer.getFileHash(`file${i}.txt`)).toBe(computeHash(`content ${i}`));
            }
        });

        it('should handle mixed files and directories', async () => {
            mockFs({
                [tempDir]: {
                    'root-file.txt': 'root content',
                    'dir1': {
                        'file1.txt': 'dir1 content',
                        'subdir': {
                            'file2.txt': 'subdir content',
                        },
                    },
                    'dir2': {
                        'file3.txt': 'dir2 content',
                    },
                    'another-root.txt': 'another root',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash('root-file.txt')).toBe(computeHash('root content'));
            expect(synchronizer.getFileHash('another-root.txt')).toBe(computeHash('another root'));
            expect(synchronizer.getFileHash(path.join('dir1', 'file1.txt'))).toBe(computeHash('dir1 content'));
            expect(synchronizer.getFileHash(path.join('dir1', 'subdir', 'file2.txt'))).toBe(computeHash('subdir content'));
            expect(synchronizer.getFileHash(path.join('dir2', 'file3.txt'))).toBe(computeHash('dir2 content'));
        });
    });

    describe('edge cases', () => {
        it('should handle empty root directory', async () => {
            mockFs({
                [tempDir]: {},
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            const changes = await synchronizer.checkForChanges();
            expect(changes.added).toEqual([]);
            expect(changes.removed).toEqual([]);
            expect(changes.modified).toEqual([]);
        });

        it('should handle files with special characters in names', async () => {
            mockFs({
                [tempDir]: {
                    'file with spaces.txt': 'spaced content',
                    'file-with-dashes.txt': 'dashed content',
                    'file_with_underscores.txt': 'underscored content',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash('file with spaces.txt')).toBe(computeHash('spaced content'));
            expect(synchronizer.getFileHash('file-with-dashes.txt')).toBe(computeHash('dashed content'));
            expect(synchronizer.getFileHash('file_with_underscores.txt')).toBe(computeHash('underscored content'));
        });

        it('should handle files with unicode content', async () => {
            mockFs({
                [tempDir]: {
                    'unicode.txt': '你好世界 🌍 مرحبا العالم',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash('unicode.txt')).toBe(computeHash('你好世界 🌍 مرحبا العالم'));
        });

        it('should handle empty files', async () => {
            mockFs({
                [tempDir]: {
                    'empty.txt': '',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash('empty.txt')).toBe(computeHash(''));
        });

        it('should handle large files', async () => {
            const largeContent = 'x'.repeat(100000);

            mockFs({
                [tempDir]: {
                    'large.txt': largeContent,
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash('large.txt')).toBe(computeHash(largeContent));
        });

        it('should handle files with various extensions', async () => {
            mockFs({
                [tempDir]: {
                    'script.ts': 'typescript',
                    'script.js': 'javascript',
                    'style.css': 'css',
                    'data.json': '{}',
                    'readme.md': 'markdown',
                    'noext': 'no extension',
                },
                [snapshotDir]: {},
            });

            const synchronizer = new FileSynchronizer(tempDir);
            await synchronizer.initialize();

            expect(synchronizer.getFileHash('script.ts')).toBe(computeHash('typescript'));
            expect(synchronizer.getFileHash('script.js')).toBe(computeHash('javascript'));
            expect(synchronizer.getFileHash('style.css')).toBe(computeHash('css'));
            expect(synchronizer.getFileHash('data.json')).toBe(computeHash('{}'));
            expect(synchronizer.getFileHash('readme.md')).toBe(computeHash('markdown'));
            expect(synchronizer.getFileHash('noext')).toBe(computeHash('no extension'));
        });
    });

    describe('concurrent operations', () => {
        it('should handle multiple synchronizers for different directories', async () => {
            const tempDir2 = path.join(homeDir, 'test-project-2');

            mockFs({
                [tempDir]: {
                    'file1.txt': 'project1 content',
                },
                [tempDir2]: {
                    'file2.txt': 'project2 content',
                },
                [snapshotDir]: {},
            });

            const sync1 = new FileSynchronizer(tempDir);
            const sync2 = new FileSynchronizer(tempDir2);

            await Promise.all([sync1.initialize(), sync2.initialize()]);

            expect(sync1.getFileHash('file1.txt')).toBe(computeHash('project1 content'));
            expect(sync2.getFileHash('file2.txt')).toBe(computeHash('project2 content'));

            // Each should have separate snapshots
            const snapshot1Path = computeSnapshotPath(tempDir);
            const snapshot2Path = computeSnapshotPath(tempDir2);
            expect(snapshot1Path).not.toBe(snapshot2Path);
            expect(fsSync.existsSync(snapshot1Path)).toBe(true);
            expect(fsSync.existsSync(snapshot2Path)).toBe(true);
        });
    });
});
