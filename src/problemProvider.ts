import * as vscode from 'vscode';
import fetch from 'node-fetch';

export class Problem extends vscode.TreeItem {
    constructor(
        public readonly id: string,
        public readonly label: string,
        public readonly difficulty: string,
        public readonly fullDescription: string,
        public readonly inputExample: string,
        public readonly outputExample: string
    ) {
        super(label);
        this.tooltip = `${label} (难度：${difficulty})`;  // 只在tooltip显示简要信息
        this.description = difficulty;
        
        // 设置点击行为，确保点击时可以显示详情
        this.command = {
            command: 'programming-practice.showProblemDetail',
            title: '查看题目详情',
            arguments: [this]
        };
    }
}

export class ProblemProvider implements vscode.TreeDataProvider<Problem> {
    private _onDidChangeTreeData: vscode.EventEmitter<Problem | undefined | null | void> = new vscode.EventEmitter<Problem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Problem | undefined | null | void> = this._onDidChangeTreeData.event;

    private _currentProblemId: string = '1'; // 默认题目ID
    private problems: Problem[] = [];
    private isLoading: boolean = false;

    constructor() {
        // 初始化时加载题目
        this.refreshProblems();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async refreshProblems(): Promise<void> {
        try {
            this.isLoading = true;
            // 在refreshProblems方法中替换serverUrl的获取方式
            const serverUrl = vscode.workspace.getConfiguration('programmingPractice').get('serverUrl') || 'http://localhost:3000';
            const response = await fetch(`${serverUrl}/api/problems/all`);
            
            if (!response.ok) {
                throw new Error(`服务器响应错误: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.problems) {
                // 将服务器返回的题目转换为Problem对象
                this.problems = data.problems.map((p: any) => {
                    return new Problem(
                        p.id.toString(),
                        p.title,
                        p.difficulty,
                        p.content,
                        p.input_example,  // 修改这里匹配后端字段名
                        p.output_example  // 修改这里匹配后端字段名
                    );
                });
                
                // 如果当前没有选中题目但有题目列表，则默认选择第一题
                if (this.problems.length > 0 && !this._currentProblemId) {
                    this._currentProblemId = this.problems[0].id;
                }
                
                this.refresh();
            } else {
                vscode.window.showErrorMessage(`获取题目失败: ${data.message || '未知错误'}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`获取题目列表失败: ${error instanceof Error ? error.message : String(error)}`);
            // 加载失败时使用默认题目（可选）
            // this.useDefaultProblems();
        } finally {
            this.isLoading = false;
        }
    }

    // 加载失败时使用默认题目
//     private useDefaultProblems(): void {
//         this.problems = [
//             new Problem('1', '两数之和', 'easy',
//                 `题目要求：
// 给定一个整数数组 nums 和一个整数目标值 target，请你在该数组中找出和为目标值 target 的那两个整数，并返回它们的数组下标。

// 输出要求：
// - 用cin输入
// - 对每个测试用例，将结果以 JSON 数组格式输出，例如：[0, 1]
// - 每次只有一个样例测试

// 示例：
// 输入：nums = [2,7,11,15], target = 9
// 输出：[0,1]

// 测试用例：
// 1. nums = [2,7,11,15], target = 9
// 2. nums = [3,2,4], target = 6
// 3. nums = [3,3], target = 6`),
//             new Problem('2', '回文数', 'easy',
//                 `题目要求：
// 给你一个整数 x ，判断它是否是回文整数。

// 输出要求：
// - 用cin输入
// - 对每个测试用例，输出 "true" 或 "false"
// - 每次只有一个样例测试

// 示例：
// 输入：x = 121
// 输出：true

// 测试用例：
// 1. x = 121
// 2. x = -121
// 3. x = 10
// 4. x = 12321`),
//         ];
//     }

    getTreeItem(element: Problem): vscode.TreeItem {
        return element;
    }

    getChildren(): Problem[] {
        if (this.isLoading) {
            // 如果正在加载，可以返回一个"加载中"项
            return [new Problem('loading', '加载中...', '', '','','')];
        }
        return this.problems;
    }

    getCurrentProblemId(): string {
        return this._currentProblemId;
    }

    setCurrentProblemId(id: string): void {
        this._currentProblemId = id;
    }

    // 获取指定ID的题目
    getProblemById(id: string): Problem | undefined {
        return this.problems.find(p => p.id === id);
    }
}