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
    
    // 记录累计编程时间（秒）
    private codingSeconds: Map<string, number> = new Map();
    
    // 记录计时开始时间
    private timerStartTime: Map<string, number> = new Map();
    
    // 计时器是否处于活动状态
    private timerActive: Map<string, boolean> = new Map();
    
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
     * 开始计时器
     * @param problemId 题目ID
     */
    public startCodingTimer(problemId: string): void {
        // 如果计时器已经是活动状态，不做任何操作
        if (this.timerActive.get(problemId)) {
            return;
        }
        
        // 初始化累计时间（如果尚未初始化）
        if (!this.codingSeconds.has(problemId)) {
            this.codingSeconds.set(problemId, 0);
        }
        
        // 记录开始时间并设置为活动状态
        this.timerStartTime.set(problemId, Date.now());
        this.timerActive.set(problemId, true);
        
        console.log(`开始题目 ${problemId} 的计时器，当前累计: ${this.codingSeconds.get(problemId)}秒`);
    }
    
    /**
     * 暂停计时器
     * @param problemId 题目ID
     */
    public pauseCodingTimer(problemId: string): void {
        // 如果计时器不是活动状态，不做任何操作
        if (!this.timerActive.get(problemId)) {
            return;
        }
        
        // 计算本次时间段并添加到累计时间
        const startTime = this.timerStartTime.get(problemId);
        if (startTime) {
            const now = Date.now();
            const elapsed = Math.floor((now - startTime) / 1000);
            
            // 只加上合理的时间值
            if (elapsed > 0 && elapsed < 3600) {
                const current = this.codingSeconds.get(problemId) || 0;
                this.codingSeconds.set(problemId, current + elapsed);
                console.log(`暂停题目 ${problemId} 的计时器，本次: ${elapsed}秒，累计: ${current + elapsed}秒`);
            }
        }
        
        // 设置为非活动状态
        this.timerActive.set(problemId, false);
    }
    
    /**
     * 获取当前累计编程时间（秒）
     * @param problemId 题目ID
     */
    public calculateCodingTime(problemId: string): number {
        // 获取基础累计时间
        let totalSeconds = this.codingSeconds.get(problemId) || 0;
        
        // 如果计时器处于活动状态，加上当前时间段
        if (this.timerActive.get(problemId)) {
            const startTime = this.timerStartTime.get(problemId);
            if (startTime) {
                const now = Date.now();
                const current = Math.floor((now - startTime) / 1000);
                
                // 只加上合理的时间值
                if (current > 0 && current < 3600) {
                    totalSeconds += current;
                }
            }
        }
        
        // 限制最大值为3600秒（1小时）
        return Math.min(totalSeconds, 3600);
    }
    
    /**
     * 重置计时器
     * @param problemId 题目ID
     */
    public resetTimer(problemId: string): void {
        // 重置累计时间
        this.codingSeconds.set(problemId, 0);
        
        // 如果计时器是活动状态，重置开始时间
        if (this.timerActive.get(problemId)) {
            this.timerStartTime.set(problemId, Date.now());
        }
        
        console.log(`重置题目 ${problemId} 的计时器`);
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

            const userProfile = UserSession.getUserProfile();
            if (!userProfile) {
                vscode.window.showWarningMessage('无法获取用户档案');
                return false;
            }
            
            // 直接获取当前累计时间的快照，不修改计时器状态
            const currentTime = this.calculateCodingTime(problemId);
            console.log(`提交题目 ${problemId} 的编程数据，当前累计时间: ${currentTime}秒`);

            // 修改字段名以匹配后端期望的格式
            const submissionData = {
                student_class: userProfile.class_name || '',
                student_id: userProfile.student_id || UserSession.getUserEmail() || '',
                problem_id: problemId,
                problem_title: problemTitle,
                code_content: code,
                submit_result: submitResult ? 'success' : 'failed',
                execution_errors: executionInfo?.message || null,
                first_view_time: this.getProblemFirstViewTime(problemId),
                submission_time: this.formatDateToChineseTime(),
                coding_time: currentTime
            };

            // 获取服务器URL
            const serverUrl = vscode.workspace.getConfiguration('programmingPractice').get('serverUrl') || 'http://localhost:3000';

            console.log('准备提交的编程数据:', JSON.stringify(submissionData, null, 2));

            const response = await fetch(`${serverUrl}/api/coding/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(submissionData)
            });

            console.log('服务器响应状态:', response.status);
            const responseText = await response.text();
            console.log('服务器原始响应:', responseText);

            try {
                const result = JSON.parse(responseText);
                console.log('解析后的响应:', result);

                // 只有提交成功且用户代码通过时重置计时器
                if (result.success === true && submitResult) {
                    console.log(`题目 ${problemId} 提交成功，重置计时器`);
                    this.resetTimer(problemId);
                }

                return result.success === true;
            } catch (e) {
                console.error('解析响应JSON失败:', e);
                return false;
            }
        } catch (error) {
            console.error('提交编程数据时出错:', error);
            vscode.window.showErrorMessage(`提交编程数据失败: ${error instanceof Error ? error.message : String(error)}`);
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
