// solutionValidator.ts
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class SolutionValidator {
    private tempDir: string;
    private extensionPath: string;

    constructor(extensionPath: string) {
        this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-solution-'));
        this.extensionPath = extensionPath;
        
    }

    async validate(problemId: string, code: string): Promise<{ success: boolean; message: string }> {
        try {
            const userCodePath = path.join(this.tempDir, 'solution.cpp');
            const execPath = path.join(this.tempDir, 'solution' + (os.platform() === 'win32' ? '.exe' : ''));
            const libPath = path.join(this.extensionPath, 'lib');
            console.log('Compiling with lib path:', libPath);
            // Modify include path in code
            const modifiedCode = code.replace(
                '#include "../lib/json.hpp"',
                `#include "${path.join(libPath, 'json.hpp').replace(/\\/g, '/')}"`
            );

            // Write modified code
            fs.writeFileSync(userCodePath, modifiedCode);

            // Compile code
            const compileProcess = child_process.spawnSync('g++', [
                userCodePath,
                '-o',
                execPath,
                '-std=c++17',
                '-Wall',
                '-Wextra',
                `-I${libPath}`
            ]);

            if (compileProcess.status !== 0) {
                return {
                    success: false,
                    message: `编译错误：${compileProcess.stderr.toString()}`
                };
            }

            // Run each test case separately
            const testCases = this.getTestCases(problemId);
            let results: string[] = [];
            let allPassed = true;
            let failureMessage = '';

            for (let i = 0; i < testCases.length; i++) {
                const testCase = testCases[i];
                const runProcess = child_process.spawnSync(execPath, [], {
                    input: testCase.input,
                    encoding: 'utf-8'
                });

                const output = runProcess.stdout.toString().trim();
                const error = runProcess.stderr.toString().trim();

                if (error) {
                    return {
                        success: false,
                        message: `运行错误（测试用例 ${i + 1}）：${error}`
                    };
                }

                // Validate individual test case output
                const validationResult = this.validateSingleOutput(problemId, output, testCase);
                if (!validationResult.success) {
                    allPassed = false;
                    failureMessage = `测试用例 ${i + 1} 失败：${validationResult.message}`;
                    break;
                }
                results.push(output);
            }

            if (!allPassed) {
                return {
                    success: false,
                    message: failureMessage
                };
            }

            return {
                success: true,
                message: '所有测试用例通过！'
            };

        } catch (error) {
            return {
                success: false,
                message: `执行错误：${error instanceof Error ? error.message : '未知错误'}`
            };
        }
    }

    private validateSingleOutput(
        problemId: string, 
        output: string, 
        testCase: { input: string; expected?: any }
    ): { success: boolean; message: string } {
        switch (problemId) {
            case '1': // Two Sum
                try {
                    const result = JSON.parse(output);
                    if (!Array.isArray(result) || result.length !== 2) {
                        return { success: false, message: '输出应为包含两个数字的数组' };
                    }

                    // Parse input to get nums and target
                    const lines = testCase.input.trim().split('\n');
                    const [n, target] = lines[0].split(' ').map(Number);
                    const nums = lines[1].split(' ').map(Number);

                    if (nums[result[0]] + nums[result[1]] !== target) {
                        return { 
                            success: false, 
                            message: `输出 [${result}] 的和不等于目标值 ${target}` 
                        };
                    }
                    return { success: true, message: '' };
                } catch (e) {
                    return { success: false, message: '输出格式错误' };
                }

            case '2': // Palindrome Number
                try {
                    const result = output.toLowerCase();
                    if (result !== 'true' && result !== 'false') {
                        return { success: false, message: '输出必须为 true 或 false' };
                    }

                    const input = parseInt(testCase.input);
                    const expected = this.isPalindrome(input);
                    if ((result === 'true') !== expected) {
                        return {
                            success: false,
                            message: `对于输入 ${input}，期望输出 ${expected}，实际输出 ${result}`
                        };
                    }
                    return { success: true, message: '' };
                } catch (e) {
                    return { success: false, message: '输出格式错误' };
                }

            default:
                return { success: false, message: '未知题目类型' };
        }
    }

    private isPalindrome(x: number): boolean {
        if (x < 0) return false;
        const str = x.toString();
        return str === str.split('').reverse().join('');
    }

    private getTestCases(problemId: string): { input: string; expected?: any }[] {
        switch (problemId) {
            case '1': // Two Sum
                return [
                    { input: '4 9\n2 7 11 15' },
                    { input: '3 6\n3 2 4' },
                    { input: '2 6\n3 3' }
                ];
            case '2': // Palindrome Number
                return [
                    { input: '121', expected: true },
                    { input: '-121', expected: false },
                    { input: '10', expected: false },
                    { input: '12321', expected: true }
                ];
            default:
                return [];
        }
    }
}