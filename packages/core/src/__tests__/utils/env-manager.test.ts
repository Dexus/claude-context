import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import mockFs from 'mock-fs';
import { EnvManager, envManager } from '../../utils/env-manager';

describe('EnvManager', () => {
    const originalEnv = process.env;
    let homeDir: string;
    let expectedEnvPath: string;

    beforeEach(() => {
        // Store original env and create a clean copy
        process.env = { ...originalEnv };
        homeDir = os.homedir();
        expectedEnvPath = path.join(homeDir, '.context', '.env');
    });

    afterEach(() => {
        // Restore original env
        process.env = originalEnv;
        // Restore real filesystem
        mockFs.restore();
    });

    describe('constructor', () => {
        it('should initialize with correct env file path', () => {
            const manager = new EnvManager();
            expect(manager.getEnvFilePath()).toBe(expectedEnvPath);
        });

        it('should use home directory from os.homedir()', () => {
            const manager = new EnvManager();
            const envPath = manager.getEnvFilePath();
            expect(envPath.startsWith(homeDir)).toBe(true);
            expect(envPath).toContain('.context');
            expect(envPath).toContain('.env');
        });
    });

    describe('getEnvFilePath', () => {
        it('should return the path to the .env file', () => {
            const manager = new EnvManager();
            expect(manager.getEnvFilePath()).toBe(expectedEnvPath);
        });
    });

    describe('get', () => {
        it('should return process.env value if it exists', () => {
            const manager = new EnvManager();
            process.env['TEST_VAR'] = 'from_process_env';

            // Setup mock filesystem with a different value in .env
            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': 'TEST_VAR=from_file',
                },
            });

            const result = manager.get('TEST_VAR');
            expect(result).toBe('from_process_env');
        });

        it('should return .env file value if not in process.env', () => {
            const manager = new EnvManager();
            // Ensure variable is not in process.env
            delete process.env['MY_SECRET_KEY'];

            // Setup mock filesystem
            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': 'MY_SECRET_KEY=secret_value_123',
                },
            });

            const result = manager.get('MY_SECRET_KEY');
            expect(result).toBe('secret_value_123');
        });

        it('should return undefined if variable not found anywhere', () => {
            const manager = new EnvManager();
            delete process.env['NON_EXISTENT_VAR'];

            // Setup mock filesystem without the variable
            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': 'OTHER_VAR=value',
                },
            });

            const result = manager.get('NON_EXISTENT_VAR');
            expect(result).toBeUndefined();
        });

        it('should return undefined if .env file does not exist', () => {
            const manager = new EnvManager();
            delete process.env['MISSING_VAR'];

            // Setup mock filesystem without .env file
            mockFs({
                [homeDir]: {},
            });

            const result = manager.get('MISSING_VAR');
            expect(result).toBeUndefined();
        });

        it('should handle multiple variables in .env file', () => {
            const manager = new EnvManager();
            delete process.env['SECOND_VAR'];

            const envContent = [
                'FIRST_VAR=first_value',
                'SECOND_VAR=second_value',
                'THIRD_VAR=third_value',
            ].join('\n');

            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': envContent,
                },
            });

            expect(manager.get('SECOND_VAR')).toBe('second_value');
        });

        it('should handle .env file with empty lines', () => {
            const manager = new EnvManager();
            delete process.env['SPACED_VAR'];

            const envContent = [
                'FIRST_VAR=first_value',
                '',
                'SPACED_VAR=spaced_value',
                '',
            ].join('\n');

            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': envContent,
                },
            });

            expect(manager.get('SPACED_VAR')).toBe('spaced_value');
        });

        it('should handle values with equals signs', () => {
            const manager = new EnvManager();
            delete process.env['CONNECTION_STRING'];

            const envContent = 'CONNECTION_STRING=host=localhost;port=5432';

            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': envContent,
                },
            });

            expect(manager.get('CONNECTION_STRING')).toBe('host=localhost;port=5432');
        });

        it('should handle lines with leading/trailing whitespace', () => {
            const manager = new EnvManager();
            delete process.env['TRIMMED_VAR'];

            // The implementation trims the line before extracting value
            const envContent = '  TRIMMED_VAR=trimmed_value  ';

            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': envContent,
                },
            });

            // Line is trimmed, so trailing whitespace is removed
            expect(manager.get('TRIMMED_VAR')).toBe('trimmed_value');
        });

        it('should return undefined for partial variable name matches', () => {
            const manager = new EnvManager();
            delete process.env['MY_VAR'];
            delete process.env['MY_VAR_EXTENDED'];

            const envContent = 'MY_VAR_EXTENDED=extended_value';

            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': envContent,
                },
            });

            expect(manager.get('MY_VAR')).toBeUndefined();
        });

        it('should handle file read errors gracefully', () => {
            const manager = new EnvManager();
            delete process.env['ERROR_VAR'];

            // Setup mock filesystem with unreadable file
            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': mockFs.file({
                        content: 'ERROR_VAR=value',
                        mode: 0o000, // No read permissions
                    }),
                },
            });

            const result = manager.get('ERROR_VAR');
            expect(result).toBeUndefined();
        });
    });

    describe('set', () => {
        it('should create directory and file if they do not exist', () => {
            const manager = new EnvManager();

            // Setup mock filesystem without .context directory
            mockFs({
                [homeDir]: {},
            });

            manager.set('NEW_VAR', 'new_value');

            // Verify file was created
            expect(fs.existsSync(expectedEnvPath)).toBe(true);
            const content = fs.readFileSync(expectedEnvPath, 'utf-8');
            expect(content).toBe('NEW_VAR=new_value\n');
        });

        it('should append new variable to existing file', () => {
            const manager = new EnvManager();

            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': 'EXISTING_VAR=existing_value\n',
                },
            });

            manager.set('NEW_VAR', 'new_value');

            const content = fs.readFileSync(expectedEnvPath, 'utf-8');
            expect(content).toContain('EXISTING_VAR=existing_value');
            expect(content).toContain('NEW_VAR=new_value');
        });

        it('should update existing variable in file', () => {
            const manager = new EnvManager();

            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': 'UPDATE_VAR=old_value\n',
                },
            });

            manager.set('UPDATE_VAR', 'updated_value');

            const content = fs.readFileSync(expectedEnvPath, 'utf-8');
            expect(content).toContain('UPDATE_VAR=updated_value');
            expect(content).not.toContain('old_value');
        });

        it('should add newline before appending if file does not end with newline', () => {
            const manager = new EnvManager();

            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': 'EXISTING_VAR=value', // No trailing newline
                },
            });

            manager.set('NEW_VAR', 'new_value');

            const content = fs.readFileSync(expectedEnvPath, 'utf-8');
            const lines = content.split('\n');
            expect(lines).toContain('EXISTING_VAR=value');
            expect(lines).toContain('NEW_VAR=new_value');
        });

        it('should handle multiple variables correctly', () => {
            const manager = new EnvManager();

            const existingContent = [
                'VAR_A=value_a',
                'VAR_B=value_b',
                'VAR_C=value_c',
            ].join('\n');

            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': existingContent,
                },
            });

            manager.set('VAR_B', 'updated_b');

            const content = fs.readFileSync(expectedEnvPath, 'utf-8');
            expect(content).toContain('VAR_A=value_a');
            expect(content).toContain('VAR_B=updated_b');
            expect(content).toContain('VAR_C=value_c');
            expect(content).not.toContain('value_b');
        });

        it('should handle values with special characters', () => {
            const manager = new EnvManager();

            mockFs({
                [homeDir]: {},
            });

            manager.set('SPECIAL_VAR', 'value with spaces & special=chars!');

            const content = fs.readFileSync(expectedEnvPath, 'utf-8');
            expect(content).toBe('SPECIAL_VAR=value with spaces & special=chars!\n');
        });

        it('should throw error on write failure', () => {
            const manager = new EnvManager();

            // Create a read-only directory
            mockFs({
                [path.dirname(expectedEnvPath)]: mockFs.directory({
                    mode: 0o444, // Read-only
                    items: {},
                }),
            });

            expect(() => manager.set('FAIL_VAR', 'value')).toThrow();
        });

        it('should create nested directory structure', () => {
            const manager = new EnvManager();

            // Setup with no .context directory
            mockFs({
                [homeDir]: {},
            });

            manager.set('NESTED_VAR', 'nested_value');

            const envDir = path.dirname(expectedEnvPath);
            expect(fs.existsSync(envDir)).toBe(true);
            expect(fs.existsSync(expectedEnvPath)).toBe(true);
        });

        it('should preserve other variables when updating one', () => {
            const manager = new EnvManager();

            const existingContent = [
                'KEEP_VAR_1=keep_1',
                'UPDATE_ME=old',
                'KEEP_VAR_2=keep_2',
            ].join('\n') + '\n';

            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': existingContent,
                },
            });

            manager.set('UPDATE_ME', 'new');

            const content = fs.readFileSync(expectedEnvPath, 'utf-8');
            expect(content).toContain('KEEP_VAR_1=keep_1');
            expect(content).toContain('KEEP_VAR_2=keep_2');
            expect(content).toContain('UPDATE_ME=new');
            expect(content).not.toContain('UPDATE_ME=old');
        });
    });

    describe('envManager singleton', () => {
        it('should export a default instance', () => {
            expect(envManager).toBeInstanceOf(EnvManager);
        });

        it('should have the correct env file path', () => {
            expect(envManager.getEnvFilePath()).toBe(expectedEnvPath);
        });
    });

    describe('priority order', () => {
        it('should prioritize process.env over .env file', () => {
            const manager = new EnvManager();
            const varName = 'PRIORITY_TEST_VAR';

            // Set in process.env
            process.env[varName] = 'from_process';

            // Set different value in .env file
            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': `${varName}=from_file`,
                },
            });

            expect(manager.get(varName)).toBe('from_process');
        });

        it('should fall back to .env file when not in process.env', () => {
            const manager = new EnvManager();
            const varName = 'FALLBACK_TEST_VAR';

            // Ensure not in process.env
            delete process.env[varName];

            // Set in .env file
            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': `${varName}=from_file`,
                },
            });

            expect(manager.get(varName)).toBe('from_file');
        });

        it('should return undefined when not in process.env or .env file', () => {
            const manager = new EnvManager();
            const varName = 'NONEXISTENT_TEST_VAR';

            // Ensure not in process.env
            delete process.env[varName];

            // Empty .env file
            mockFs({
                [path.dirname(expectedEnvPath)]: {
                    '.env': '',
                },
            });

            expect(manager.get(varName)).toBeUndefined();
        });
    });
});
