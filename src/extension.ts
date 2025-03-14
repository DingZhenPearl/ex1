// extension.ts
import * as vscode from 'vscode';
import { ProblemProvider, Problem } from './problemProvider';
import { SolutionValidator } from './solutionValidator';
import { LoginView } from './loginView';
import { UserSession } from './userSession';
import { UserInfoViewProvider } from './userInfoView';
import { CodingDataCollector } from './codingDataCollector';

export async function activate(context: vscode.ExtensionContext) {
    console.log('编程练习扩展已激活');

    // 初始化用户会话和登录视图
    UserSession.initialize(context);
    LoginView.initialize(context);

    // 初始化编程数据收集器并传入上下文
    const codingDataCollector = CodingDataCollector.getInstance();
    codingDataCollector.initializeGlobalState(context);
    
    // 列出当前已记录的所有查看时间（调试用）
    codingDataCollector.listAllViewTimes();

    // 检查用户是否已登录
    const isLoggedIn = UserSession.isLoggedIn();
    
    // 根据实际登录状态设置上下文变量
    await vscode.commands.executeCommand('setContext', 'programming-practice.isLoggedIn', isLoggedIn);

    // 注册登录命令
    const loginCommand = vscode.commands.registerCommand('programming-practice.login', async () => {
        LoginView.show();
        
        // 登录成功逻辑在loginView.ts中处理
    });
    
    // 注册注销命令
    const logoutCommand = vscode.commands.registerCommand('programming-practice.logout', async () => {
        UserSession.logout();
        vscode.window.showInformationMessage('已注销');
        
        // 注销后设置上下文变量
        await vscode.commands.executeCommand('setContext', 'programming-practice.isLoggedIn', false);
        
        // 注销后显示登录视图
        LoginView.show();
    });

    // 注册用户信息视图提供程序
    const userInfoProvider = new UserInfoViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            UserInfoViewProvider.viewType,
            userInfoProvider
        )
    );

    // 如果用户未登录，则显示登录视图
    if (!isLoggedIn) {
        vscode.window.showInformationMessage('请先登录以使用编程练习功能');
        LoginView.show();
    } else {
        // 用户已登录，显示欢迎信息
        const userEmail = UserSession.getUserEmail();
        const userType = UserSession.getUserType();
        vscode.window.showInformationMessage(`欢迎回来，${userEmail}(${userType === 'teacher' ? '教师' : '学生'})`);
    }

    context.subscriptions.push(loginCommand, logoutCommand);

    const problemProvider = new ProblemProvider();
    const solutionValidator = new SolutionValidator(context.extensionPath);

    // Register problem list view
    const treeView = vscode.window.createTreeView('problemList', {
        treeDataProvider: problemProvider
    });

    // Register practice panel view as Webview Panel
    const sidebarViewProvider = new SidebarViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('programmingPracticeView', sidebarViewProvider)
    );

    // Handle problem selection - 确保在适当位置记录查看时间
    context.subscriptions.push(
        treeView.onDidChangeSelection(event => {
            if (event.selection.length > 0) {
                const selectedProblem = event.selection[0] as Problem;
                problemProvider.setCurrentProblemId(selectedProblem.id);
                
                // 记录用户查看题目的时间 - 明确在此处记录
                console.log(`用户选择题目: ${selectedProblem.id} (${selectedProblem.label})`);
                codingDataCollector.recordProblemView(selectedProblem.id);
                
                // 更新视图
                sidebarViewProvider.updateProblem(selectedProblem);
                
                // 检查并显示记录的查看时间（调试用）
                const viewTime = codingDataCollector.getProblemFirstViewTime(selectedProblem.id);
                console.log(`题目 ${selectedProblem.id} 查看时间记录状态: ${viewTime ? '已记录' : '未记录'}`);
                
                // When selecting a problem, also sync any active editor content
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    const code = activeEditor.document.getText();
                    sidebarViewProvider.updateCode(code);
                }
            }
        })
    );

    // Listen for text document changes in the active editor
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && event.document === activeEditor.document) {
                const code = event.document.getText();
                sidebarViewProvider.updateCode(code);
            }
        })
    );

    // Listen for active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                const code = editor.document.getText();
                sidebarViewProvider.updateCode(code);
            }
        })
    );

    // 注册刷新题目命令
    const refreshProblemsCommand = vscode.commands.registerCommand('programming-practice.refreshProblems', () => {
        problemProvider.refreshProblems();
        vscode.window.showInformationMessage('正在刷新题目列表...');
    });

    // 将命令添加到订阅中
    context.subscriptions.push(refreshProblemsCommand);

    // 注册题目列表视图
    vscode.window.registerTreeDataProvider('problemList', problemProvider);

    // 注册显示题目详情的命令
    const showProblemDetailCommand = vscode.commands.registerCommand('programming-practice.showProblemDetail', (problem: Problem) => {
        problemProvider.setCurrentProblemId(problem.id);
        sidebarViewProvider.updateProblem(problem);
        
        // 当选择题目时，尝试显示编程练习视图
        vscode.commands.executeCommand('programmingPracticeView.focus');
    });
    
    // 将命令添加到订阅中
    context.subscriptions.push(showProblemDetailCommand);

    // 注册查看学生编程统计的命令
    const viewCodingStatsCommand = vscode.commands.registerCommand('programming-practice.viewCodingStats', async () => {
        if (!UserSession.isLoggedIn()) {
            vscode.window.showWarningMessage('请先登录以查看编程统计');
            return;
        }
        
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在加载编程统计数据...',
            cancellable: false
        }, async () => {
            const stats = await codingDataCollector.getStudentStats();
            
            if (!stats || !stats.success) {
                vscode.window.showErrorMessage('无法获取编程统计数据');
                return;
            }
            
            // 显示简要统计信息
            const data = stats.data;
            const basicStats = data.basic_stats;
            
            if (basicStats) {
                const message = `
                已尝试题目: ${basicStats.total_problems_attempted || 0}
                已解决题目: ${basicStats.problems_solved || 0}
                平均尝试次数: ${Math.round((basicStats.avg_attempts_until_success || 0) * 10) / 10}
                `;
                
                vscode.window.showInformationMessage('编程统计数据', {
                    modal: true,
                    detail: message
                });
            } else {
                vscode.window.showInformationMessage('暂无编程统计数据');
            }
        });
    });
    
    context.subscriptions.push(viewCodingStatsCommand);
}

class SidebarViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _currentProblem?: Problem;
    private _currentCode?: string;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        
        // Configure webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Set initial HTML content
        webviewView.webview.html = this._getWebviewContent();

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async message => {
            try {
                switch (message.command) {
                    case 'submit':
                        if (this._currentProblem) {
                            console.log(`正在验证问题 ${this._currentProblem.id} 的解决方案...`);
                            const validator = new SolutionValidator(this._extensionUri.fsPath);
                            
                            const serverUrl = vscode.workspace.getConfiguration('programmingPractice').get('serverUrl') || 'http://localhost:3000';
                            console.log(`使用服务器 ${serverUrl} 进行代码验证`);
                            
                            try {
                                const result = await validator.validate(this._currentProblem.id, message.code);
                                
                                // 无论成功失败，总是提交详细的执行信息
                                const dataCollector = CodingDataCollector.getInstance();
                                
                                // 显示当前记录的首次查看时间，辅助调试
                                const viewTime = dataCollector.getProblemFirstViewTime(this._currentProblem.id);
                                console.log(`提交前获取题目 ${this._currentProblem.id} 首次查看时间: ${viewTime || 'undefined'}`);
                                
                                const submitSuccess = await dataCollector.submitCodingData(
                                    this._currentProblem.id,
                                    this._currentProblem.label,
                                    message.code,
                                    result.success,
                                    {
                                        errorType: result.errorType,
                                        message: result.message,
                                        details: result.executionDetails
                                    }
                                );
                                
                                await this._sendMessageToWebview({
                                    command: 'validationResult',
                                    success: result.success,
                                    message: result.message,
                                    errorType: result.errorType
                                });
                            } catch (validationError) {
                                console.error('代码验证过程出错:', validationError);
                                
                                // 即使验证失败，也要尝试记录数据
                                const dataCollector = CodingDataCollector.getInstance();
                                await dataCollector.submitCodingData(
                                    this._currentProblem.id,
                                    this._currentProblem.label,
                                    message.code,
                                    false,
                                    {
                                        errorType: 'ValidationError',
                                        message: validationError instanceof Error ? validationError.message : String(validationError),
                                        details: validationError
                                    }
                                );
                                
                                await this._sendMessageToWebview({
                                    command: 'validationResult',
                                    success: false,
                                    message: `验证过程出错: ${validationError instanceof Error ? validationError.message : String(validationError)}`
                                });
                            }
                        }
                        break;
                    case 'ready':
                        // Sync initial state when webview is ready
                        if (this._currentProblem) {
                            this.updateProblem(this._currentProblem);
                        }
                        // Sync code from active editor if available
                        const activeEditor = vscode.window.activeTextEditor;
                        if (activeEditor) {
                            const code = activeEditor.document.getText();
                            this.updateCode(code);
                        }
                        break;
                }
            } catch (error) {
                console.error('处理webview消息时出错:', error);
                await this._sendMessageToWebview({
                    command: 'validationResult',
                    success: false,
                    message: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
                });
            }
        });
    }

    public async updateCode(code: string) {
        this._currentCode = code;
        await this._sendMessageToWebview({
            command: 'updateCode',
            code: code
        });
    }

    private async _sendMessageToWebview(message: any) {
        if (this._view) {
            try {
                await this._view.webview.postMessage(message);
            } catch (error) {
                console.error('Failed to send message to webview:', error);
            }
        }
    }

    public async updateProblem(problem: Problem) {
        this._currentProblem = problem;
        
        // 在更新问题详情前，确保查看时间已记录
        const dataCollector = CodingDataCollector.getInstance();
        dataCollector.getProblemFirstViewTime(problem.id);
        
        await this._sendMessageToWebview({
            command: 'updateProblem',
            id: problem.id,
            title: problem.label,
            description: problem.fullDescription,  // 这里包含完整的题目内容
            difficulty: problem.difficulty,
            template: await this._getCodeTemplate(problem.id),
            inputExample: problem.inputExample || '',  // 添加输入样例
            outputExample: problem.outputExample || '' // 添加输出样例
        });
        
        // 确保视图可见
        if (this._view) {
            this._view.show(true); // 显示并聚焦视图
        }
    }

    private async _getCodeTemplate(problemId: string): Promise<string> {
        const templates: Record<string, string> = {
            '1': `#include <iostream>
        #include <vector>
        #include <nlohmann/json.hpp>
        using namespace std;
        using json = nlohmann::json;

        int main() {
            // 读取输入数组和目标值
            vector<int> nums;
            int num, target;
            
            // 读取所有输入数字，直到EOF
            while (cin >> num) {
                nums.push_back(num);
            }
            
            // 最后一个数字是目标和
            if (!nums.empty()) {
                target = nums.back();
                nums.pop_back();  // 从数组中移除目标和
            }
            
            // 在这里实现你的解决方案
            // 要求：找到两个数的和等于target，返回它们的下标
            
            // 输出结果
            json result = json::array({0, 1});  // 替换成实际找到的下标
            cout << result << endl;
            
            return 0;
        }`,
            '2': `#include <iostream>
        #include <string>
        using namespace std;
        
        int main() {
            int x;
            cin >> x;
            
            // 在这里实现你的解决方案
            // 要求：判断x是否为回文数
            
            // 输出结果
            cout << "true" << endl;  // 或 cout << "false" << endl;
            
            return 0;
            
        }`,
        };
        
        return templates[problemId] || '';
    }
    
    private _getWebviewContent() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
            <title>Programming Practice</title>
            <style>
                body {
                    padding: 8px;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    font-size: var(--vscode-font-size);
                    line-height: 1.4;
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    margin: 0;
                    overflow: hidden;
                }
                .problem-container {
                    margin-bottom: 12px;
                    flex: 0 0 auto;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 5px;
                    padding: 10px;
                }
                .problem-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                    padding-bottom: 5px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                h3 {
                    margin: 0 0 8px 0;
                    font-size: 1.2em;
                    color: var(--vscode-editor-foreground);
                    font-weight: bold;
                }
                .difficulty {
                    margin: 8px 0;
                    font-size: 0.9em;
                    padding: 2px 8px;
                    border-radius: 10px;
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    font-weight: bold;
                }
                .editor-container {
                    margin: 8px 0;
                    flex: 1 1 auto;
                    display: flex;
                    flex-direction: column;
                    min-height: 150px;
                    overflow: hidden;
                }
                #code-editor {
                    width: 100%;
                    flex: 1 1 auto;
                    min-height: 150px;
                    resize: none;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 8px;
                    font-family: 'Consolas', 'Courier New', monospace;
                    font-size: var(--vscode-editor-font-size);
                    line-height: 1.4;
                    tab-size: 4;
                    white-space: pre;
                    overflow: auto;
                }
                .controls-container {
                    margin-top: 12px;
                    padding: 8px;
                    background-color: var(--vscode-sideBar-background);
                    border-top: 1px solid var(--vscode-panel-border);
                    flex: 0 0 auto;
                }
                .submit-button {
                    width: 100%;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    cursor: pointer;
                    font-size: 14px;
                    border-radius: 3px;
                    font-weight: 500;
                    text-align: center;
                }
                .submit-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .submit-button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .result-container {
                    margin-top: 8px;
                    padding: 8px;
                    border-radius: 3px;
                    font-size: 0.9em;
                    display: none;
                    white-space: pre-wrap;
                    font-family: 'Consolas', 'Courier New', monospace;
                    max-height: 300px;
                    overflow-y: auto;
                }
                .result-container.visible {
                    display: block;
                }
                .success {
                    background-color: var(--vscode-testing-passed-background);
                    color: var(--vscode-testing-passed-foreground);
                    border: 1px solid var(--vscode-testing-passed-border);
                }
                .error {
                    background-color: var(--vscode-testing-failed-background);
                    color: var(--vscode-testing-failed-foreground);
                    border: 1px solid var(--vscode-testing-failed-border);
                }
                #problem-description {
                    margin: 8px 0;
                    white-space: pre-wrap;
                    color: var(--vscode-foreground);
                    line-height: 1.5;
                }
                .no-problem {
                    text-align: center;
                    color: var(--vscode-descriptionForeground);
                    padding: 20px;
                    font-style: italic;
                }
                .section-title {
                    font-weight: bold;
                    margin: 10px 0 5px 0;
                    color: var(--vscode-editorLightBulb-foreground);
                }
                .content-scrollable {
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                }
                .example-block {
                    background-color: var(--vscode-textCodeBlock-background);
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 3px;
                    padding: 8px;
                    margin: 5px 0;
                    font-family: 'Consolas', 'Courier New', monospace;
                    white-space: pre-wrap;
                    overflow-x: auto;
                }
            </style>
        </head>
        <body>
            <div class="content-scrollable">
                <div class="problem-container" id="problem-details">
                    <div id="no-problem-selected" class="no-problem">
                        请从左侧题目列表中选择一个题目开始练习
                    </div>
                    
                    <div id="problem-content" style="display: none;">
                        <div class="problem-header">
                            <h3 id="problem-title"></h3>
                            <span class="difficulty" id="problem-difficulty"></span>
                        </div>
                        <div class="section-title">题目详情：</div>
                        <div id="problem-description"></div>
                        
                        <!-- 添加输入样例和输出样例部分 -->
                        <div class="section-title">输入样例：</div>
                        <div id="input-example" class="example-block"></div>
                        
                        <div class="section-title">输出样例：</div>
                        <div id="output-example" class="example-block"></div>
                    </div>
                </div>
                
                <div class="editor-container">
                    <textarea id="code-editor" spellcheck="false" placeholder="选择题目后，代码将在这里显示..."></textarea>
                </div>
            </div>
            
            <div class="controls-container">
                <button id="submit-button" class="submit-button" onclick="submitSolution()">
                    提交解答
                </button>
                <div id="validation-result" class="result-container"></div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let currentProblemId = '';
                
                // Initialize state
                const state = vscode.getState() || { code: '' };
                document.getElementById('code-editor').value = state.code;

                // Notify webview is ready
                vscode.postMessage({ command: 'ready' });
                
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'updateProblem':
                            currentProblemId = message.id;
                            
                            // 显示题目内容，隐藏"未选择题目"消息
                            document.getElementById('no-problem-selected').style.display = 'none';
                            document.getElementById('problem-content').style.display = 'block';
                            
                            document.getElementById('problem-title').textContent = message.title;
                            document.getElementById('problem-description').textContent = message.description || '无题目描述';
                            document.getElementById('problem-difficulty').textContent = message.difficulty;
                            
                            // 显示输入和输出样例
                            document.getElementById('input-example').textContent = message.inputExample || '无输入样例';
                            document.getElementById('output-example').textContent = message.outputExample || '无输出样例';
                            
                            // Only update editor with template if no code is currently shown
                            const editor = document.getElementById('code-editor');
                            if (!editor.value.trim()) {
                                editor.value = message.template || '';
                                vscode.setState({ code: editor.value });
                            }
                            
                            // Reset validation result
                            const resultDiv = document.getElementById('validation-result');
                            resultDiv.className = 'result-container';
                            resultDiv.textContent = '';
                            break;
                            
                        case 'updateCode':
                            // Update the code from the active editor
                            const codeEditor = document.getElementById('code-editor');
                            codeEditor.value = message.code;
                            vscode.setState({ code: message.code });
                            break;
                            
                        case 'validationResult':
                            const resultElement = document.getElementById('validation-result');
                            resultElement.textContent = message.message;
                            resultElement.className = 'result-container visible ' + (message.success ? 'success' : 'error');
                            
                            // Enable/disable submit button
                            document.getElementById('submit-button').disabled = false;
                            break;
                    }
                });
                
                function submitSolution() {
                    const submitButton = document.getElementById('submit-button');
                    const code = document.getElementById('code-editor').value;
                    
                    // Disable submit button while processing
                    submitButton.disabled = true;
                    
                    // Clear previous result
                    const resultDiv = document.getElementById('validation-result');
                    resultDiv.className = 'result-container';
                    resultDiv.textContent = '';
                    
                    vscode.postMessage({
                        command: 'submit',
                        code: code
                    });
                }
            </script>
        </body>
        </html>`;
    }

}

export function deactivate() {}