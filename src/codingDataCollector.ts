import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { UserSession } from './userSession';

/**
 * 编程数据收集服务
 * 负责收集和提交学生编程活动数据
 */
export class CodingDataCollector {
    private static _instance: CodingDataCollector;
    
    // 记录题目首次查看时间
    private problemViewTimes: Map<string, string> = new Map();
    private globalState?: vscode.Memento;
    
    private constructor() {
        this.loadStoredTimes();
    }
    
    /**
     * 初始化全局状态存储
     */
    public initializeGlobalState(context: vscode.ExtensionContext) {
        this.globalState = context.globalState;
        this.loadStoredTimes();
    }
    
    /**
     * 加载之前存储的时间记录
     */
    private loadStoredTimes() {
        try {
            if (this.globalState) {
                const storedTimes = this.globalState.get<Record<string, string>>('problemViewTimes');
                console.log('从全局存储加载查看时间:', storedTimes);
                
                if (storedTimes) {
                    this.problemViewTimes = new Map(Object.entries(storedTimes));
                }
            }
        } catch (error) {
            console.error('加载存储的时间记录失败:', error);
        }
    }
    
    /**
     * 保存时间记录到持久存储
     */
    private saveTimesToStorage() {
        try {
            if (this.globalState) {
                const timesObj = Object.fromEntries(this.problemViewTimes.entries());
                this.globalState.update('problemViewTimes', timesObj);
                console.log('保存查看时间到全局存储:', timesObj);
            }
        } catch (error) {
            console.error('保存时间记录失败:', error);
        }
    }
    
    /**
     * 获取单例实例
     */
    public static getInstance(): CodingDataCollector {
        if (!this._instance) {
            this._instance = new CodingDataCollector();
        }
        return this._instance;
    }
    
    /**
     * 记录用户开始查看题目的时间
     * @param problemId 题目ID
     */
    public recordProblemView(problemId: string): void {
        // 只记录第一次查看的时间
        if (!this.problemViewTimes.has(problemId)) {
            const timeString = this.formatDateToChineseTime();
            this.problemViewTimes.set(problemId, timeString);
            console.log(`首次记录题目 ${problemId} 查看时间: ${timeString}`);
            this.saveTimesToStorage(); // 立即保存到全局存储
        } else {
            console.log(`题目 ${problemId} 已有记录的查看时间: ${this.problemViewTimes.get(problemId)}`);
        }
    }
    
    /**
     * 调试方法：列出所有记录的查看时间
     */
    public listAllViewTimes(): void {
        console.log('当前记录的所有题目查看时间:');
        this.problemViewTimes.forEach((time, id) => {
            console.log(`题目 ${id}: ${time}`);
        });
    }
    
    /**
     * 获取题目首次查看时间
     * @param problemId 题目ID
     */
    public getProblemFirstViewTime(problemId: string): string | undefined {
        const viewTime = this.problemViewTimes.get(problemId);
        console.log(`获取题目 ${problemId} 首次查看时间: ${viewTime || 'undefined'}`);
        
        // 如果当前没有记录，但用户正在查看，则立即记录
        if (!viewTime) {
            console.log(`题目 ${problemId} 没有记录查看时间，立即记录`);
            this.recordProblemView(problemId);
            return this.problemViewTimes.get(problemId);
        }
        
        return viewTime;
    }
    
    /**
     * 转换为东八区(北京时间)并格式化为MySQL兼容格式 
     */
    private formatDateToChineseTime(date: Date = new Date()): string {
        // 计算东八区时间偏移
        const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
        const cstTime = new Date(utc + (3600000 * 8)); // 东八区时间
        
        // 格式化为MySQL兼容格式: YYYY-MM-DD HH:MM:SS
        const year = cstTime.getFullYear();
        const month = String(cstTime.getMonth() + 1).padStart(2, '0');
        const day = String(cstTime.getDate()).padStart(2, '0');
        const hours = String(cstTime.getHours()).padStart(2, '0');
        const minutes = String(cstTime.getMinutes()).padStart(2, '0');
        const seconds = String(cstTime.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    
    /**
     * 提交编程数据到服务器
     */
    public async submitCodingData(
        problemId: string, 
        problemTitle: string, 
        code: string, 
        submitResult: boolean,
        executionInfo?: {
            errorType?: string,
            message?: string,
            details?: any
        }
    ): Promise<boolean> {
        try {
            // 检查用户是否登录
            if (!UserSession.isLoggedIn()) {
                vscode.window.showWarningMessage('请先登录以便记录编程数据');
                return false;
            }
            
            // 从用户会话获取学生信息
            const userProfile = UserSession.getUserProfile();
            
            if (!userProfile) {
                vscode.window.showWarningMessage('无法获取用户档案');
                return false;
            }
            
            const studentId = userProfile.student_id || UserSession.getUserEmail() || '';
            const studentClass = userProfile.class_name || '';
            
            // 获取服务器URL
            const serverUrl = vscode.workspace.getConfiguration('programmingPractice').get('serverUrl') || 'http://localhost:3000';
            
            // 获取首次查看时间
            const firstViewTime = this.getProblemFirstViewTime(problemId);
            
            // 解析执行信息
            const errorType = executionInfo?.errorType || "unknown";
            const executionMessage = executionInfo?.message || null;
            const executionDetails = executionInfo?.details ? JSON.stringify(executionInfo.details) : null;
            
            // 准备提交数据 - 确保字段名与后端期望的一致
            const submissionData = {
                studentId: studentId,           // 后端期望 studentId
                studentClass: studentClass,     // 后端期望 studentClass 
                problemId: problemId,           // 后端期望 problemId
                problemTitle: problemTitle,     // 后端期望 problemTitle
                codeContent: code,              // 后端期望 codeContent
                submitResult: submitResult ? 'success' : 'failed',
                errorType: errorType,
                executionErrors: executionMessage,
                executionDetails: executionDetails,
                // 确保时间格式正确且后端能识别
                firstViewTime: firstViewTime,
                submissionTime: this.formatDateToChineseTime()
            };
            
            console.log(`准备提交数据到 ${serverUrl}/api/coding/submit`, JSON.stringify(submissionData, null, 2));
            
            // 提交数据到服务器
            const response = await fetch(`${serverUrl}/api/coding/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(submissionData)
            });
            
            // 保存原始响应文本，便于调试
            const responseText = await response.text();
            console.log('原始响应:', responseText);
            
            // 检查响应状态
            if (!response.ok) {
                console.error(`HTTP请求失败: ${response.status} ${response.statusText}`);
                return false;
            }

            // 针对多行JSON处理进行修复
            // 服务器返回多个JSON对象，每行一个
            const jsonLines = responseText.trim().split(/\r?\n/);
            
            // 打印原始响应行，便于调试
            console.log('响应行数:', jsonLines.length);
            jsonLines.forEach((line, index) => {
                console.log(`响应行 ${index + 1}:`, line);
            });
            
            // 检查是否所有JSON行都表示成功
            let allLinesSuccess = true;
            let anyValidJson = false;
            
            for (const line of jsonLines) {
                if (!line.trim()) continue;
                
                try {
                    const parsedJson = JSON.parse(line.trim());
                    console.log('已成功解析JSON行:', JSON.stringify(parsedJson));
                    
                    anyValidJson = true;
                    
                    // 只有当JSON明确包含success:false时才标记失败
                    if (parsedJson && parsedJson.success === false) {
                        allLinesSuccess = false;
                        console.error('发现失败响应:', parsedJson.message || '未知错误');
                    }
                } catch (e) {
                    console.error(`JSON解析失败:`, e);
                    console.error(`问题行: "${line}"`);
                }
            }
            
            // 如果没有任何有效JSON，尝试解析整个响应
            if (!anyValidJson) {
                try {
                    const wholeJson = JSON.parse(responseText);
                    console.log('整体解析JSON结果:', JSON.stringify(wholeJson));
                    return wholeJson.success === true;
                } catch (e) {
                    console.error('整体响应解析失败:', e);
                    return false;
                }
            }
            
            // 只要有任何有效JSON且全部成功，则整体成功
            if (allLinesSuccess && anyValidJson) {
                console.log('数据提交成功!');
                return true;
            } else {
                console.error('数据提交失败: 响应中包含错误信息或无有效JSON');
                return false;
            }
        } catch (error) {
            console.error('提交编程数据时出错:', error);
            vscode.window.showErrorMessage(`提交编程数据时出错: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    
    /**
     * 获取学生的编程统计数据
     */
    public async getStudentStats(): Promise<any> {
        try {
            if (!UserSession.isLoggedIn()) {
                return null;
            }
            
            const userProfile = UserSession.getUserProfile();
            if (!userProfile) {
                return null;
            }
            
            const studentId = userProfile.student_id || UserSession.getUserEmail() || '';
            const serverUrl = vscode.workspace.getConfiguration('programmingPractice').get('serverUrl') || 'http://localhost:3000';
            
            console.log(`获取学生${studentId}的编程统计数据`);
            
            const response = await fetch(`${serverUrl}/api/coding/stats/${encodeURIComponent(studentId)}`);
            
            // 保存原始响应文本用于调试
            const responseText = await response.text();
            let result;
            
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                console.error('解析响应JSON失败:', e);
                console.error('原始响应文本:', responseText);
                return null;
            }
            
            if (!response.ok || !result.success) {
                console.error(`获取统计数据失败: ${response.status} ${response.statusText}`);
                console.error('响应详情:', responseText);
                return null;
            }
            
            return result;
        } catch (error) {
            console.error('获取统计数据时出错:', error);
            return null;
        }
    }
    
    /**
     * 简单验证C++代码的语法
     * 注意：这只是一个基本检查，无法捕获所有语法错误
     */
    private validateCppSyntax(code: string): boolean {
        try {
            // 检查基本的C++括号匹配
            const brackets = [
                {open: '{', close: '}'},
                {open: '(', close: ')'},
                {open: '[', close: ']'}
            ];
            
            // 检查每种括号的配对
            for (const bracket of brackets) {
                let count = 0;
                for (let i = 0; i < code.length; i++) {
                    if (code[i] === bracket.open) count++;
                    else if (code[i] === bracket.close) count--;
                    
                    // 如果在任何时候计数变为负数，说明有未匹配的右括号
                    if (count < 0) return false;
                }
                
                // 处理完后计数应该为0，否则有未匹配的左括号
                if (count !== 0) return false;
            }
            
            // 检查是否包含main函数
            if (!code.includes('main(')) {
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('验证C++语法时出错:', error);
            return false;
        }
    }
    
    /**
     * 重置收集的数据
     */
    public reset(): void {
        // 不要清除查看时间记录，我们希望保留它们
        console.log('刷新数据但保留题目查看时间记录');
        this.listAllViewTimes();
    }
    
    /**
     * 清除所有时间记录（仅用于测试/调试）
     */
    public clearAllTimes(): void {
        this.problemViewTimes.clear();
        this.saveTimesToStorage();
        console.log('已清除所有题目查看时间记录');
    }
}
