import * as vscode from 'vscode';

export class ProblemProvider implements vscode.TreeDataProvider<Problem> {
    private _currentProblemId: string = '1'; // 默认题目ID
        // problemProvider.ts
// problemProvider.ts
// Update the problem descriptions to remove specific function requirements
private problems: Problem[] = [
    new Problem('1', '两数之和', 'easy',
        `题目要求：
给定一个整数数组 nums 和一个整数目标值 target，请你在该数组中找出和为目标值 target 的那两个整数，并返回它们的数组下标。

输出要求：
- 用cin输入
- 对每个测试用例，将结果以 JSON 数组格式输出，例如：[0, 1]
- 每次只有一个样例测试

示例：
输入：nums = [2,7,11,15], target = 9
输出：[0,1]

测试用例：
1. nums = [2,7,11,15], target = 9
2. nums = [3,2,4], target = 6
3. nums = [3,3], target = 6`),
    new Problem('2', '回文数', 'easy',
        `题目要求：
给你一个整数 x ，判断它是否是回文整数。

输出要求：
- 用cin输入
- 对每个测试用例，输出 "true" 或 "false"
- 每次只有一个样例测试

示例：
输入：x = 121
输出：true

测试用例：
1. x = 121
2. x = -121
3. x = 10
4. x = 12321`),
];

    getTreeItem(element: Problem): vscode.TreeItem {
        return element;
    }

    getChildren(): Problem[] {
        return this.problems;
    }

    getCurrentProblemId(): string {
        return this._currentProblemId;
    }

    setCurrentProblemId(id: string): void {
        this._currentProblemId = id;
    }
}

// problemProvider.ts
export class Problem extends vscode.TreeItem {
    constructor(
        public readonly id: string,
        public readonly label: string,
        public readonly difficulty: string,
        public readonly fullDescription: string // 新增完整描述字段
    ) {
        super(label);
        this.tooltip = `${label} (难度：${difficulty})\n\n${fullDescription}`;
        this.description = difficulty; // TreeItem的description显示难度
    }
}