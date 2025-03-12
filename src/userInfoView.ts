import * as vscode from 'vscode';
import { UserSession } from './userSession';

export class UserInfoViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'programming-practice.userInfo';
    private _view?: vscode.WebviewView;
    
    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        this._update();

        // 监听用户会话变化
        UserSession.onSessionChanged(() => {
            this._update();
        });

        // 处理来自WebView的消息
        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'login':
                    vscode.commands.executeCommand('programming-practice.login');
                    break;
                case 'logout':
                    vscode.commands.executeCommand('programming-practice.logout');
                    break;
            }
        });
    }

    private _update() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview();
        }
    }

    private _getHtmlForWebview() {
        const isLoggedIn = UserSession.isLoggedIn();
        const userEmail = UserSession.getUserEmail() || '';
        const userType = UserSession.getUserType() || '';
        const userTypeText = userType === 'teacher' ? '教师' : '学生';

        return `<!DOCTYPE html>
        <html lang="zh-cn">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>用户信息</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    padding: 10px;
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .user-info {
                    padding: 10px;
                    border-radius: 4px;
                    border: 1px solid var(--vscode-panel-border);
                    margin-bottom: 10px;
                }
                .info-row {
                    display: flex;
                    justify-content: space-between;
                    margin: 5px 0;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 14px;
                    border-radius: 2px;
                    cursor: pointer;
                    width: 100%;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .login-button {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
            </style>
        </head>
        <body>
            <div class="container">
                ${isLoggedIn ? `
                    <div class="user-info">
                        <h3>已登录</h3>
                        <div class="info-row">
                            <span>邮箱：</span>
                            <span>${userEmail}</span>
                        </div>
                        <div class="info-row">
                            <span>身份：</span>
                            <span>${userTypeText}</span>
                        </div>
                    </div>
                    <button id="logoutBtn">注销</button>
                ` : `
                    <div class="user-info">
                        <h3>未登录</h3>
                        <p>请登录以使用编程练习功能</p>
                    </div>
                    <button id="loginBtn" class="login-button">登录</button>
                `}
            </div>
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    
                    const loginBtn = document.getElementById('loginBtn');
                    if (loginBtn) {
                        loginBtn.addEventListener('click', () => {
                            vscode.postMessage({ command: 'login' });
                        });
                    }
                    
                    const logoutBtn = document.getElementById('logoutBtn');
                    if (logoutBtn) {
                        logoutBtn.addEventListener('click', () => {
                            vscode.postMessage({ command: 'logout' });
                        });
                    }
                })();
            </script>
        </body>
        </html>`;
    }
}