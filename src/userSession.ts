import * as vscode from 'vscode';

// 会话变化事件类型
type SessionChangeListener = () => void;

export class UserSession {
    private static context: vscode.ExtensionContext;
    private static sessionChangeListeners: SessionChangeListener[] = [];
    
    static initialize(context: vscode.ExtensionContext) {
        this.context = context;
    }
    
    static login(email: string, userType: string): void {
        this.context.globalState.update('userEmail', email);
        this.context.globalState.update('userType', userType);
        this.context.globalState.update('isLoggedIn', true);
        
        // 触发会话变化事件
        this.notifySessionChanged();
    }
    
    static logout(): void {
        this.context.globalState.update('userEmail', undefined);
        this.context.globalState.update('userType', undefined);
        this.context.globalState.update('isLoggedIn', false);
        
        // 触发会话变化事件
        this.notifySessionChanged();
    }
    
    static isLoggedIn(): boolean {
        return this.context.globalState.get('isLoggedIn') === true;
    }
    
    static getUserEmail(): string | undefined {
        return this.context.globalState.get('userEmail');
    }
    
    static getUserType(): string | undefined {
        return this.context.globalState.get('userType');
    }
    
    // 添加会话变化监听器
    static onSessionChanged(listener: SessionChangeListener) {
        this.sessionChangeListeners.push(listener);
    }
    
    // 移除会话变化监听器
    static removeSessionChangeListener(listener: SessionChangeListener) {
        const index = this.sessionChangeListeners.indexOf(listener);
        if (index !== -1) {
            this.sessionChangeListeners.splice(index, 1);
        }
    }
    
    // 通知所有监听器
    private static notifySessionChanged() {
        for (const listener of this.sessionChangeListeners) {
            listener();
        }
    }
}