import * as vscode from 'vscode';
import * as path from 'path';
import fetch from 'node-fetch';

export enum ErrorType {
    NONE = "none",
    COMPILATION_ERROR = "compilation_error",
    RUNTIME_ERROR = "runtime_error",
    WRONG_ANSWER = "wrong_answer",
    TIMEOUT_ERROR = "timeout_error",
    FORMAT_ERROR = "format_error",
    SERVER_ERROR = "server_error",
    CONNECTION_ERROR = "connection_error"
}

export interface ValidationResult {
    success: boolean;
    message: string;
    errorType: ErrorType;
    executionDetails?: {
        runtime?: number;       // 运行时间（毫秒）
        memoryUsage?: number;   // 内存使用（KB）
        output?: string;        // 程序输出
        expected?: string;      // 预期输出（仅在错误时）
        compileOutput?: string; // 编译输出（如果有）
    };
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
            // 获取服务器URL
            const serverUrl = vscode.workspace.getConfiguration('programmingPractice').get('serverUrl') || 'http://localhost:3000';
            
            console.log(`验证题目 ${problemId} 的解决方案...`);
            console.log(`使用服务器 ${serverUrl}/api/problems/validate-cpp`);
            
            // 发送代码到服务器进行验证
            const response = await fetch(`${serverUrl}/api/problems/validate-cpp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    code: code,
                    problemId: problemId
                })
            });
            
            // 获取原始响应文本便于调试
            const responseText = await response.text();
            let result;
            
            try {
                // 尝试解析JSON响应
                result = JSON.parse(responseText);
            } catch (e) {
                console.error('解析验证结果JSON失败:', e);
                console.error('原始响应文本:', responseText);
                return {
                    success: false,
                    message: `服务器响应无法解析: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`,
                    errorType: ErrorType.SERVER_ERROR
                };
            }
            
            // 检查响应格式
            if (!response.ok) {
                console.error(`服务器验证失败: ${response.status} ${response.statusText}`);
                console.error('响应详情:', responseText);
                
                return {
                    success: false,
                    message: result && result.message ? result.message : `服务器错误 (${response.status})`,
                    errorType: ErrorType.SERVER_ERROR
                };
            }
            
            // 解析验证结果，区分不同的错误类型
            const executionDetails = {
                runtime: result.executionTime || 0,
                memoryUsage: result.memoryUsage || 0,
                output: result.actualOutput || result.stdout || '',
                expected: result.expectedOutput || '',
                compileOutput: result.compilationError || ''
            };

            // 判断错误类型
            let errorType = ErrorType.NONE;
            if (!result.isCorrect) {
                if (result.compilationError) {
                    errorType = ErrorType.COMPILATION_ERROR;
                } else if (result.error && result.error.includes('timeout')) {
                    errorType = ErrorType.TIMEOUT_ERROR;
                } else if (result.error) {
                    errorType = ErrorType.RUNTIME_ERROR;
                } else {
                    errorType = ErrorType.WRONG_ANSWER;
                }
            }
            
            // 构建详细的消息
            let detailedMessage = result.message || '';
            
            if (result.success && !result.isCorrect) {
                // 编译成功但答案错误
                if (errorType === ErrorType.WRONG_ANSWER) {
                    detailedMessage = `输出结果与预期不符\n\n实际输出:\n${executionDetails.output}\n\n预期输出:\n${executionDetails.expected}`;
                } else if (errorType === ErrorType.RUNTIME_ERROR) {
                    detailedMessage = `运行时错误: ${result.error || '未知错误'}`;
                } else if (errorType === ErrorType.TIMEOUT_ERROR) {
                    detailedMessage = `程序执行超时`;
                }
            } else if (!result.success) {
                // 编译失败
                if (errorType === ErrorType.COMPILATION_ERROR) {
                    detailedMessage = `编译错误:\n${executionDetails.compileOutput}`;
                }
            } else {
                // 验证通过
                detailedMessage = `验证通过！ 🎉\n运行时间: ${executionDetails.runtime}ms`;
                if (executionDetails.memoryUsage) {
                    detailedMessage += `\n内存使用: ${executionDetails.memoryUsage}KB`;
                }
            }
            
            return {
                success: result.isCorrect === true,
                message: detailedMessage,
                errorType: errorType,
                executionDetails: executionDetails
            };
        } catch (error) {
            console.error('验证代码时发生错误:', error);
            return {
                success: false,
                message: `验证过程出错: ${error instanceof Error ? error.message : String(error)}`,
                errorType: ErrorType.CONNECTION_ERROR
            };
        }
    }
}