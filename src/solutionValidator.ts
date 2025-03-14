import * as vscode from 'vscode';
import * as path from 'path';
import fetch from 'node-fetch';

export interface ValidationResult {
    success: boolean;
    message: string;
    details?: any;
}

export class SolutionValidator {
    private extensionPath: string;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
    }

    /**
     * 验证解决方案代码
     * @param problemId 题目ID
     * @param code 用户提交的代码
     */
    async validate(problemId: string, code: string): Promise<ValidationResult> {
        try {
            console.log(`正在验证问题 ${problemId} 的解决方案...`);
            
            // 从设置中获取服务器URL
            const serverUrl = vscode.workspace.getConfiguration('programmingPractice').get('serverUrl') || 'http://localhost:3000';
            
            console.log(`使用服务器 ${serverUrl} 进行代码验证`);
            
            // 调用后端API验证代码
            const response = await fetch(`${serverUrl}/api/problems/validate-cpp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    problemId,
                    code
                })
            });

            if (!response.ok) {
                throw new Error(`服务器响应错误: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            // 处理验证结果
            if (result.success) {
                if (result.isCorrect) {
                    return {
                        success: true,
                        message: `测试通过！\n\n${result.message || ''}`,
                        details: result
                    };
                } else {
                    return {
                        success: false,
                        message: `测试失败。\n\n预期输出:\n${result.expectedOutput}\n\n实际输出:\n${result.actualOutput}`,
                        details: result
                    };
                }
            } else {
                // 编译或运行错误
                if (result.compilationError) {
                    return {
                        success: false,
                        message: `编译错误:\n${result.compilationError}`,
                        details: result
                    };
                } else if (result.error) {
                    return {
                        success: false,
                        message: `运行错误:\n${result.error}`,
                        details: result
                    };
                } else {
                    return {
                        success: false,
                        message: `验证失败: ${result.message || '未知错误'}`,
                        details: result
                    };
                }
            }

        } catch (error) {
            console.error('验证解决方案时出错:', error);
            return {
                success: false,
                message: `验证过程中出错: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}