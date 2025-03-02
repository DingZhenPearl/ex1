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
            const libPath = path.join(this.extensionPath, 'nlohmann');
            console.log('Compiling with lib path:', libPath);
            // Modify include path in code
            // 使用正则表达式匹配 #include <nlohmann/json.hpp>，忽略大小写
            const modifiedCode = code.replace(
                /#include\s+<nlohmann\/json\.hpp>/i,
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
            let results: { caseIndex: number; input: string; output: string; expected: string; passed: boolean }[] = [];
            let allPassed = true;

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
                
                results.push({
                    caseIndex: i + 1,
                    input: this.formatInput(problemId, testCase.input),
                    output: output,
                    expected: this.getExpectedOutput(problemId, testCase),
                    passed: validationResult.success
                });
                
                if (!validationResult.success) {
                    allPassed = false;
                }
            }

            // Format the detailed result message
            const resultMessage = this.formatResultMessage(results, allPassed);

            return {
                success: allPassed,
                message: resultMessage
            };

        } catch (error) {
            return {
                success: false,
                message: `执行错误：${error instanceof Error ? error.message : '未知错误'}`
            };
        }
    }

// 修改formatInput方法
private formatInput(problemId: string, input: string): string {
    switch (problemId) {
        case '1': // Two Sum
            try {
                const parts = input.trim().split(' ');
                const target = parts[parts.length - 1]; // 最后一个数是目标和
                const nums = parts.slice(0, parts.length - 1); // 前面的所有数是数组
                return `nums = [${nums.join(', ')}], target = ${target}`;
            } catch (e) {
                return input;
            }
        case '2': // Palindrome Number
            return `x = ${input.trim()}`;
        default:
            return input;
    }
}

    private getExpectedOutput(problemId: string, testCase: { input: string; expected?: any }): string {
        switch (problemId) {
            case '1': // Two Sum
            try {
                const parts = testCase.input.trim().split(' ');
                const target = Number(parts[parts.length - 1]); // 最后一个数是目标和
                
                // For two sum, we can't know the exact expected indices without solving it,
                // so we just explain what's expected
                return `应返回两数和为 ${target} 的下标`;
            } catch (e) {
                return '无法确定期望输出';
            }
            case '2': // Palindrome Number
                try {
                    const input = parseInt(testCase.input);
                    const expected = this.isPalindrome(input);
                    return expected ? 'true' : 'false';
                } catch (e) {
                    return '无法确定期望输出';
                }
            default:
                return '未知题目类型';
        }
    }

    private formatResultMessage(
        results: { caseIndex: number; input: string; output: string; expected: string; passed: boolean }[],
        allPassed: boolean
    ): string {
        let message = '';
        
        if (allPassed) {
            message = '✅ 所有测试用例通过！\n\n';
        } else {
            message = '❌ 部分测试用例未通过\n\n';
        }
        
        // Add detailed results for each test case
        results.forEach(result => {
            const statusIcon = result.passed ? '✅' : '❌';
            message += `${statusIcon} 测试用例 ${result.caseIndex}:\n`;
            message += `   输入: ${result.input}\n`;
            message += `   输出: ${result.output}\n`;
            message += `   期望: ${result.expected}\n`;
            if (!result.passed) {
                message += '   提示: 检查您的算法逻辑是否正确\n';
            }
            message += '\n';
        });
        
        return message;
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

                // Parse input to get nums and target - 修改这部分
                const parts = testCase.input.trim().split(' ');
                const target = Number(parts[parts.length - 1]); // 最后一个数是目标和
                const nums = parts.slice(0, parts.length - 1).map(Number); // 前面的所有数是数组

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




    // 修改getTestCases方法
private getTestCases(problemId: string): { input: string; expected?: any }[] {
    switch (problemId) {
        case '1': // Two Sum
            return [
                { input: '2 7 11 15 9' },  // 改为一行，最后一个数是目标和
                { input: '3 2 4 6' },      // 改为一行，最后一个数是目标和
                { input: '3 3 6' }         // 改为一行，最后一个数是目标和
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