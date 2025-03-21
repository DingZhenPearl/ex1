// cppAnalyzer.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';

export class CppAnalyzer {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private optimizationDecorations: vscode.TextEditorDecorationType[];
    private static instance: CppAnalyzer;
    private analysisTimeout: NodeJS.Timeout | undefined;
    private documentVersions: Map<string, number> = new Map();
    private disposables: vscode.Disposable[] = [];

    private constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('cpp');
        this.optimizationDecorations = [];
    }

    public static getInstance(): CppAnalyzer {
        if (!CppAnalyzer.instance) {
            CppAnalyzer.instance = new CppAnalyzer();
        }
        return CppAnalyzer.instance;
    }

    // 初始化分析器
    public initialize(context: vscode.ExtensionContext) {
        // 注册文档变更事件
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(this.onDocumentChanged.bind(this)),
            vscode.window.onDidChangeActiveTextEditor(this.onActiveEditorChanged.bind(this)),
            vscode.languages.registerCodeActionsProvider('cpp', new CppCodeActionProvider(), {
                providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
            })
        );

        // 将所有disposables添加到上下文中
        this.disposables.forEach(d => context.subscriptions.push(d));

        // 初始化当前打开的编辑器
        if (vscode.window.activeTextEditor) {
            this.analyzeDocument(vscode.window.activeTextEditor.document);
        }
    }

    // 文档变更事件处理
    private onDocumentChanged(event: vscode.TextDocumentChangeEvent) {
        if (event.document.languageId === 'cpp') {
            this.scheduleAnalysis(event.document);
        }
    }

    // 使用防抖机制安排分析任务
    private scheduleAnalysis(document: vscode.TextDocument) {
        // 清除现有的待处理分析
        if (this.analysisTimeout) {
            clearTimeout(this.analysisTimeout);
        }
        
        // 检查配置的延迟时间
        const delay = vscode.workspace.getConfiguration('programmingPractice').get('analysisDelayMs', 500);
        
        // 安排新的分析任务
        this.analysisTimeout = setTimeout(async () => {
            await this.analyzeDocument(document);
        }, delay);
    }

    // 活动编辑器变更事件处理
    private async onActiveEditorChanged(editor: vscode.TextEditor | undefined) {
        if (editor && editor.document.languageId === 'cpp') {
            // 检查是否需要重新分析（版本变化或首次打开）
            const uri = editor.document.uri.toString();
            const currentVersion = editor.document.version;
            const cachedVersion = this.documentVersions.get(uri);
            
            if (cachedVersion !== currentVersion) {
                await this.analyzeDocument(editor.document);
            }
        }
    }

    // 分析文档
    private async analyzeDocument(document: vscode.TextDocument) {
        try {
            // 更新文档版本缓存
            this.documentVersions.set(document.uri.toString(), document.version);
            
            // 检查是否启用了分析
            if (!this.isAnalysisEnabled()) {
                this.diagnosticCollection.delete(document.uri);
                return;
            }
            
            // 清除之前的诊断信息
            this.diagnosticCollection.delete(document.uri);
            
            // 执行代码分析
            const diagnostics: vscode.Diagnostic[] = [];
            
            // 根据配置执行不同类型的分析
            if (this.isFeatureEnabled('syntax')) {
                const syntaxDiagnostics = await this.checkSyntax(document);
                // 为插件诊断添加明确的来源标识和更明显的视觉区分
                syntaxDiagnostics.forEach(diagnostic => {
                    // 修改：将所有Error级别的诊断修改为Warning级别
                    if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
                        diagnostic.severity = vscode.DiagnosticSeverity.Warning;
                    }
                    diagnostic.source = '编程实践插件 🔍 (仅警告)';  // 添加图标使其在UI中更明显
                    diagnostic.code = {
                        value: 'cpp.plugin.syntax',
                        target: vscode.Uri.parse('https://github.com/your-repo/programming-practice')
                    };
                    // 添加关联标签用于清晰区分
                    diagnostic.tags = [vscode.DiagnosticTag.Unnecessary]; // 添加波浪线样式
                });
                diagnostics.push(...syntaxDiagnostics);
            }
            
            if (this.isFeatureEnabled('style')) {
                const styleDiagnostics = this.checkCodeStyle(document);
                diagnostics.push(...styleDiagnostics);
            }
            
            if (this.isFeatureEnabled('errorPatterns')) {
                const errorPatternDiagnostics = this.checkErrorPatterns(document);
                diagnostics.push(...errorPatternDiagnostics);
            }
            
            if (this.isFeatureEnabled('optimizations')) {
                const optimizationDiagnostics = this.checkOptimizations(document);
                diagnostics.push(...optimizationDiagnostics);
            }
            
            // 添加插件图标和明确的来源标识到所有诊断信息
            diagnostics.forEach(diagnostic => {
                if (!diagnostic.source) {
                    diagnostic.source = '编程实践插件 🔍 (仅警告)';
                }
                
                // 确保没有Error级别的诊断
                if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
                    diagnostic.severity = vscode.DiagnosticSeverity.Warning;
                }
                
                // 添加诊断信息的相关数据，用于UI展示
                if (!diagnostic.relatedInformation) {
                    diagnostic.relatedInformation = [
                        new vscode.DiagnosticRelatedInformation(
                            new vscode.Location(document.uri, diagnostic.range),
                            '由编程实践插件生成的警告提示（不会阻碍调试）'
                        )
                    ];
                }
            });
            
            // 更新诊断信息
            this.diagnosticCollection.set(document.uri, diagnostics);
        } catch (error) {
            console.error(`分析文档时出错: ${error instanceof Error ? error.message : String(error)}`);
            vscode.window.showErrorMessage(`C++代码分析失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    // 检查是否启用了分析功能
    private isAnalysisEnabled(): boolean {
        return vscode.workspace.getConfiguration('programmingPractice').get('enableAnalysis', true);
    }
    
    // 检查特定分析功能是否启用
    private isFeatureEnabled(feature: string): boolean {
        return vscode.workspace.getConfiguration('programmingPractice').get(`enable${feature.charAt(0).toUpperCase() + feature.slice(1)}Analysis`, true);
    }

    // 语法检查
    private async checkSyntax(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
        const diagnostics: vscode.Diagnostic[] = [];
        
        try {
            const compilerPath = vscode.workspace.getConfiguration('programmingPractice').get<string>('compilerPath') || 'g++';
            const compilerArgs = vscode.workspace.getConfiguration('programmingPractice').get('compilerArgs') as string[] || ['-std=c++11'];
            
            // 检查编译器是否可用
            if (!await this.isCommandAvailable(compilerPath)) {
                vscode.window.showWarningMessage(`找不到编译器: ${compilerPath}。语法检查已跳过。`);
                return diagnostics;
            }
            
            // 编译检查
            const command = `${compilerPath} ${compilerArgs.join(' ')} -fsyntax-only -Wall -Wextra "${document.uri.fsPath}"`;
            
            const result = await new Promise<string>((resolve, reject) => {
                cp.exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
                    if (error && error.killed) {
                        reject(new Error('编译检查超时'));
                    } else if (error) {
                        resolve(stderr);
                    } else {
                        resolve('');
                    }
                });
            });
            
            // 解析编译器输出
            if (result) {
                const lines = result.split('\n');
                for (const line of lines) {
                    const match = line.match(/(.+):(\d+):(\d+):\s*(warning|error|note):\s*(.+)/);
                    if (match) {
                        const [_, file, lineStr, colStr, severity, message] = match;
                        const lineNum = parseInt(lineStr) - 1;
                        const colNum = parseInt(colStr) - 1;
                        
                        const range = new vscode.Range(lineNum, colNum, lineNum, document.lineAt(lineNum).text.length);
                        
                        // 修改：所有编译器错误都降级为警告
                        let diagnosticSeverity: vscode.DiagnosticSeverity;
                        switch (severity) {
                            case 'error':
                                // 将错误转为警告，不中断调试
                                diagnosticSeverity = vscode.DiagnosticSeverity.Warning;
                                break;
                            case 'warning':
                                diagnosticSeverity = vscode.DiagnosticSeverity.Warning;
                                break;
                            default:
                                diagnosticSeverity = vscode.DiagnosticSeverity.Information;
                        }
                        
                        const diagnostic = new vscode.Diagnostic(
                            range,
                            // 如果原来是错误，在消息前添加提示
                            severity === 'error' ? `[原错误级别] ${message}` : message,
                            diagnosticSeverity
                        );
                        
                        // 添加代码操作数据
                        diagnostic.code = 'cpp.syntax';
                        diagnostic.source = 'C++ Analyzer (仅警告)';
                        
                        diagnostics.push(diagnostic);
                    }
                }
            }
        } catch (error) {
            console.error('语法检查失败:', error);
            throw new Error(`语法检查失败: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        return diagnostics;
    }

    // 检查命令是否可用
    private async isCommandAvailable(command: string): Promise<boolean> {
        try {
            await new Promise<void>((resolve, reject) => {
                const testCmd = process.platform === 'win32' ? 'where' : 'which';
                cp.exec(`${testCmd} ${command}`, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    // 代码规范检查
    private checkCodeStyle(document: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        
        // 1. 检查行长度
        const lines = text.split('\n');
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            if (line.length > 80) {
                const range = new vscode.Range(index, 80, index, line.length);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    '行长度超过80字符，建议换行以提高可读性',
                    vscode.DiagnosticSeverity.Information
                ));
            }
        }
        
        // 2. 检查命名规范
        const variablePattern = /\b(?:int|float|double|char|bool|string)\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
        let varMatch: RegExpExecArray | null;
        while ((varMatch = variablePattern.exec(text)) !== null) {
            const varName = varMatch[1];
            if (!/^[a-z][a-zA-Z0-9]*$/.test(varName)) {
                const pos = document.positionAt(varMatch.index + varMatch[0].indexOf(varName));
                const range = new vscode.Range(pos, pos.translate(0, varName.length));
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    '变量命名建议使用驼峰式命名法',
                    vscode.DiagnosticSeverity.Information
                ));
            }
        }
        
        return diagnostics;
    }

    // 检查常见错误模式
    private checkErrorPatterns(document: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        
        // 1. 检查数组越界风险
        const arrayAccessPattern = /\[([^[\]]+)\]/g;
        let arrayMatch: RegExpExecArray | null;
        while ((arrayMatch = arrayAccessPattern.exec(text)) !== null) {
            const index = arrayMatch[1].trim();
            if (!/^(?:0|[1-9][0-9]*|size\(\s*\)-1)$/.test(index)) {
                const pos = document.positionAt(arrayMatch.index);
                const range = new vscode.Range(pos, pos.translate(0, arrayMatch[0].length));
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    '请检查数组索引是否可能越界',
                    vscode.DiagnosticSeverity.Warning
                ));
            }
        }
        
        // 2. 检查空指针解引用风险
        const pointerPattern = /(\w+)\s*->\s*\w+/g;
        let pointerMatch: RegExpExecArray | null;
        while ((pointerMatch = pointerPattern.exec(text)) !== null) {
            const pos = document.positionAt(pointerMatch.index);
            const range = new vscode.Range(pos, pos.translate(0, pointerMatch[1].length));
            diagnostics.push(new vscode.Diagnostic(
                range,
                '建议在解引用指针前检查是否为空',
                vscode.DiagnosticSeverity.Warning
            ));
        }
        
        return diagnostics;
    }

    // 检查性能优化机会
    private checkOptimizations(document: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        
        // 1. 检查大对象按值传递
        const functionPattern = /\b(?:void|int|string|vector<[^>]+>)\s+\w+\s*\(([^)]+)\)/g;
        let funcMatch: RegExpExecArray | null;
        while ((funcMatch = functionPattern.exec(text)) !== null) {
            const params = funcMatch[1];
            if (params.includes('string') || params.includes('vector')) {
                const pos = document.positionAt(funcMatch.index);
                const range = new vscode.Range(pos, pos.translate(0, funcMatch[0].length));
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    '大对象建议使用const引用传递以提高性能',
                    vscode.DiagnosticSeverity.Information
                ));
            }
        }
        
        // 2. 检查循环中的不必要计算
        const loopPattern = /\bfor\s*\([^)]+\)\s*{[^}]*\b(size|length)\(\s*\)[^}]*}/g;
        let loopMatch: RegExpExecArray | null;
        while ((loopMatch = loopPattern.exec(text)) !== null) {
            const pos = document.positionAt(loopMatch.index);
            const range = new vscode.Range(pos, pos.translate(0, loopMatch[0].length));
            diagnostics.push(new vscode.Diagnostic(
                range,
                '建议将循环中的size()计算结果缓存到变量中',
                vscode.DiagnosticSeverity.Information
            ));
        }
        
        return diagnostics;
    }

    // 释放资源
    public dispose() {
        this.disposables.forEach(d => d.dispose());
        this.diagnosticCollection.dispose();
        this.optimizationDecorations.forEach(d => d.dispose());
        
        if (this.analysisTimeout) {
            clearTimeout(this.analysisTimeout);
        }
    }
}

// 代码操作提供者，实现快速修复功能
class CppCodeActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] | undefined {
        const actions: vscode.CodeAction[] = [];
        
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.code === 'cpp.syntax') {
                // 暂时不提供语法错误的自动修复
            } else if (diagnostic.message.includes('行长度超过80字符')) {
                const action = new vscode.CodeAction('自动格式化代码行', vscode.CodeActionKind.QuickFix);
                action.command = {
                    command: 'editor.action.formatSelection',
                    title: '格式化选中区域'
                };
                action.diagnostics = [diagnostic];
                action.isPreferred = true;
                actions.push(action);
            } else if (diagnostic.message.includes('建议使用const引用传递')) {
                const action = new vscode.CodeAction('转换为const引用参数', vscode.CodeActionKind.QuickFix);
                action.edit = new vscode.WorkspaceEdit();
                // 这里需要实现具体的参数转换逻辑
                action.diagnostics = [diagnostic];
                actions.push(action);
            } else if (diagnostic.message.includes('建议将循环中的size()计算结果缓存')) {
                const action = new vscode.CodeAction('提取size()到循环外', vscode.CodeActionKind.QuickFix);
                action.edit = new vscode.WorkspaceEdit();
                // 这里需要实现提取size()的逻辑
                action.diagnostics = [diagnostic];
                actions.push(action);
            }
        }
        
        return actions;
    }
}

// 添加用于显示插件信息的状态栏项
export class CppAnalyzerStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private static instance: CppAnalyzerStatusBar;

    private constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.text = "$(shield) 编程实践";
        this.statusBarItem.tooltip = "编程实践插件正在分析您的C++代码";
        this.statusBarItem.command = "programmingPractice.showPluginInfo";
        this.statusBarItem.show();
    }

    public static getInstance(): CppAnalyzerStatusBar {
        if (!CppAnalyzerStatusBar.instance) {
            CppAnalyzerStatusBar.instance = new CppAnalyzerStatusBar();
        }
        return CppAnalyzerStatusBar.instance;
    }

    public dispose() {
        this.statusBarItem.dispose();
    }
}

// 注册插件信息命令
export function registerPluginCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand("programmingPractice.showPluginInfo", () => {
            vscode.window.showInformationMessage(
                "编程实践插件提供C++代码分析功能，包括语法检查、代码风格、错误模式和性能优化建议。",
                "查看设置", "禁用插件审查", "查看区别"
            ).then(selection => {
                if (selection === "查看设置") {
                    vscode.commands.executeCommand(
                        "workbench.action.openSettings", 
                        "programmingPractice"
                    );
                } else if (selection === "禁用插件审查") {
                    vscode.workspace.getConfiguration().update(
                        "programmingPractice.enableAnalysis",
                        false,
                        vscode.ConfigurationTarget.Workspace
                    );
                } else if (selection === "查看区别") {
                    showDifferenceInfo();
                }
            });
        })
    );
}

// 显示插件与IDE审查的区别信息
function showDifferenceInfo() {
    const panel = vscode.window.createWebviewPanel(
        'pluginDifference',
        '插件审查与IDE审查的区别',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(vscode.extensions.getExtension('programmingPractice')?.extensionPath || '', 'resources'))
            ]
        }
    );
    
    panel.webview.html = `<!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>插件审查与IDE审查的区别</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
            table { border-collapse: collapse; width: 100%; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #f2f2f2; }
            .highlight { background-color: #fffacd; }
            .comparison-img { width: 100%; border: 1px solid #ddd; margin: 10px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .caption { font-style: italic; margin-bottom: 20px; color: #555; }
            .section { margin: 30px 0; }
            h2 { border-bottom: 1px solid #eee; padding-bottom: 10px; }
            .feature-box { border-left: 4px solid #0078d7; padding: 10px; margin: 10px 0; background-color: #f8f8f8; }
        </style>
    </head>
    <body>
        <h1>插件审查与IDE审查的区别</h1>
        
        <div class="section">
            <h2>1. 视觉对比</h2>
            <div class="feature-box">
                <strong>插件审查: </strong> 诊断信息显示 "编程实践插件 🔍" 作为来源，并带有特殊图标
            </div>
            <div class="feature-box">
                <strong>IDE审查: </strong> 诊断信息显示 "C/C++" 作为来源，无特殊图标
            </div>
            
            <img class="comparison-img" src="https://i.imgur.com/example1.png" alt="诊断信息来源对比示例" />
            <p class="caption">示例图片：左侧是插件审查显示的诊断信息，右侧是IDE内置审查</p>
        </div>
        
        <div class="section">
            <h2>2. 功能差异</h2>
            <table>
                <tr>
                    <th>审查类型</th>
                    <th>编程实践插件</th>
                    <th>VSCode C/C++ 扩展</th>
                </tr>
                <tr>
                    <td>语法检查</td>
                    <td>✅ 使用外部编译器</td>
                    <td>✅ 使用内置语言服务器</td>
                </tr>
                <tr>
                    <td>代码风格检查</td>
                    <td>✅ 行长度、命名规范等</td>
                    <td>❌ 不提供</td>
                </tr>
                <tr>
                    <td>错误模式检测</td>
                    <td>✅ 数组越界、空指针等</td>
                    <td>❌ 有限支持</td>
                </tr>
                <tr>
                    <td>性能优化建议</td>
                    <td>✅ 参数传递、循环优化等</td>
                    <td>❌ 不提供</td>
                </tr>
                <tr>
                    <td>快速修复建议</td>
                    <td>✅ 针对具体代码模式</td>
                    <td>✅ 仅语法相关</td>
                </tr>
            </table>
        </div>
        
        <div class="section">
            <h2>3. 如何区分</h2>
            <ol>
                <li><strong>查看源标识：</strong> 将鼠标悬停在波浪线上，查看提示的来源是"编程实践插件 🔍"还是"C/C++"</li>
                <li><strong>查看状态栏：</strong> 编程实践插件在状态栏中显示"$(shield) 编程实践"图标</li>
                <li><strong>检查功能类型：</strong> 代码风格、错误模式和优化建议通常是插件特有的功能</li>
                <li><strong>观察快速修复：</strong> 插件提供的快速修复会包含更多代码质量相关的选项</li>
            </ol>
            
            <div style="padding: 15px; background-color: #e6f7ff; border-left: 4px solid #1890ff; margin: 20px 0;">
                <strong>提示：</strong> 您可以随时点击状态栏中的"$(shield) 编程实践"图标，查看更多插件信息或禁用插件审查功能。
            </div>
        </div>
    </body>
    </html>`;
}

// 创建可视化示例命令
export function registerExampleCommands(context: vscode.ExtensionContext) {
    // 添加一个命令来展示实际例子
    context.subscriptions.push(
        vscode.commands.registerCommand("programmingPractice.showDifferenceExample", () => {
            // 创建并显示临时文件
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage("请先打开一个工作区来展示示例");
                return;
            }

            const examplePath = path.join(workspaceFolders[0].uri.fsPath, 'example_cpp_analysis.cpp');
            const exampleContent = `
#include <iostream>
#include <vector>
#include <string>

// 这个函数有多种问题，用于展示不同的审查功能
void processList(std::vector<std::string> items) {  // 参数按值传递，应该使用const引用
    for (int i = 0; i < items.size(); i++) {  // 循环中多次调用size()，应缓存结果
        int verylongvariable = 0;  // 不符合驼峰式命名规范
        
        if (i >= 0) {  // 这个检查总是为真，IDE会警告
            std::cout << items[i] << std::endl;
        }
        
        // 这行很长............................................超过了80个字符，编程实践插件会提出警告
    }
}

int main() {
    std::vector<std::string> data;
    processList(data);
    return 0;
}
`;

            const wsEdit = new vscode.WorkspaceEdit();
            const fileUri = vscode.Uri.file(examplePath);
            wsEdit.createFile(fileUri, { overwrite: true });
            wsEdit.insert(fileUri, new vscode.Position(0, 0), exampleContent);
            
            vscode.workspace.applyEdit(wsEdit).then(() => {
                vscode.workspace.openTextDocument(fileUri).then(doc => {
                    vscode.window.showTextDocument(doc).then(() => {
                        vscode.window.showInformationMessage(
                            "示例代码已创建。请注意观察：1) 插件诊断信息带有 🔍 图标；2) IDE诊断信息没有特殊图标；3) 状态栏中的插件图标",
                            "查看诊断比较表"
                        ).then(selection => {
                            if (selection === "查看诊断比较表") {
                                showDifferenceInfo();
                            }
                        });
                    });
                });
            });
        })
    );

    // 添加到extension.ts中以注册这个命令
    // 在插件激活时: registerExampleCommands(context);
}