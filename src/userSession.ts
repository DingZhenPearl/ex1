import * as vscode from 'vscode';

export class UserSession {
    private static context: vscode.ExtensionContext;
    
    static initialize(context: vscode.ExtensionContext) {
        this.context = context;
    }
    
    static getUserEmail(): string | undefined {
        return this.context.globalState.get('userEmail');
    }
    
    static getUserType(): string | undefined {
        return this.context.globalState.get('userType');
    }
    
    static isLoggedIn(): boolean {
        return !!this.context.globalState.get('isLoggedIn');
    }
    
    static login(email: string, userType: string): void {
        this.context.globalState.update('userEmail', email);
        this.context.globalState.update('userType', userType);
        this.context.globalState.update('isLoggedIn', true);
    }
    
    static logout(): void {
        this.context.globalState.update('userEmail', undefined);
        this.context.globalState.update('userType', undefined);
        this.context.globalState.update('isLoggedIn', false);
    }
}