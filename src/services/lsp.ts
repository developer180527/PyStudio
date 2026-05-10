import { lspStart, lspSend, lspStop, onLspMessage } from "./filesystem";

// ── LSP position/range types ──

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspDiagnostic {
  range: LspRange;
  severity: number; // 1=Error, 2=Warning, 3=Info, 4=Hint
  message: string;
  source?: string;
  code?: string | number;
}

// ── Helpers ──

function pathToUri(path: string): string {
  return `file://${path}`;
}

export function uriToPath(uri: string): string {
  return uri.replace(/^file:\/\//, "");
}

// ── LSP Client ──

type DiagnosticsCallback = (uri: string, diagnostics: LspDiagnostic[]) => void;

class LspClient {
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: any) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private unlisten: (() => void) | null = null;
  private documentVersions = new Map<string, number>();
  private _started = false;
  private _serverName = "";
  private _activeFilePath: string | null = null;
  private _onDiagnostics: DiagnosticsCallback | null = null;

  get isStarted(): boolean {
    return this._started;
  }

  get serverName(): string {
    return this._serverName;
  }

  get activeFilePath(): string | null {
    return this._activeFilePath;
  }

  set activeFilePath(path: string | null) {
    this._activeFilePath = path;
  }

  set onDiagnostics(cb: DiagnosticsCallback | null) {
    this._onDiagnostics = cb;
  }

  // ── Lifecycle ──

  async start(projectPath: string): Promise<string> {
    try {
      this._serverName = await lspStart(projectPath);
    } catch (e: any) {
      throw new Error(e?.message || e || "Failed to start LSP");
    }

    this.unlisten = await onLspMessage((raw: string) => {
      this.handleMessage(raw);
    });

    await this.initialize(projectPath);
    this._started = true;
    return this._serverName;
  }

  async stop(): Promise<void> {
    this._started = false;
    // Graceful shutdown
    try {
      await this.sendRequest("shutdown", null, 3000);
    } catch {
      // server may already be dead
    }
    this.sendNotification("exit", null);

    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }

    // Clear pending requests
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error("LSP stopped"));
    }
    this.pending.clear();
    this.documentVersions.clear();
    this._activeFilePath = null;

    try {
      await lspStop();
    } catch {
      // ignore
    }
  }

  // ── JSON-RPC transport ──

  private handleMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // Response to a pending request
    if ("id" in msg && msg.id != null && this.pending.has(msg.id)) {
      const entry = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.error) {
        entry.reject(
          new Error(msg.error.message || JSON.stringify(msg.error)),
        );
      } else {
        entry.resolve(msg.result);
      }
      return;
    }

    // Server notification
    if (msg.method) {
      this.handleNotification(msg.method, msg.params);
    }
  }

  private handleNotification(method: string, params: any): void {
    switch (method) {
      case "textDocument/publishDiagnostics":
        this._onDiagnostics?.(params.uri, params.diagnostics || []);
        break;
      case "window/logMessage":
      case "window/showMessage":
        // Could forward to console in future
        break;
    }
  }

  private sendRequest(
    method: string,
    params: any,
    timeoutMs = 5000,
  ): Promise<any> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP request '${method}' timed out`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (v: any) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e: any) => {
          clearTimeout(timer);
          reject(e);
        },
        timer,
      });

      const message = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      lspSend(message).catch((e) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      });
    });
  }

  private sendNotification(method: string, params: any): void {
    const message = JSON.stringify({ jsonrpc: "2.0", method, params });
    lspSend(message).catch(() => {});
  }

  // ── Protocol: Initialize ──

  private async initialize(projectPath: string): Promise<void> {
    const rootUri = pathToUri(projectPath);
    await this.sendRequest(
      "initialize",
      {
        processId: null,
        rootUri,
        rootPath: projectPath,
        capabilities: {
          textDocument: {
            synchronization: {
              didSave: true,
              willSave: false,
              willSaveWaitUntil: false,
              dynamicRegistration: false,
            },
            completion: {
              completionItem: {
                snippetSupport: false,
                documentationFormat: ["markdown", "plaintext"],
                resolveSupport: { properties: ["documentation", "detail"] },
              },
              contextSupport: true,
            },
            hover: {
              contentFormat: ["markdown", "plaintext"],
            },
            definition: {},
            publishDiagnostics: {
              relatedInformation: true,
            },
          },
          workspace: {
            workspaceFolders: true,
          },
        },
        workspaceFolders: [
          { uri: rootUri, name: projectPath.split("/").pop() || "" },
        ],
      },
      15000,
    );

    this.sendNotification("initialized", {});
  }

  // ── Document sync ──

  didOpen(filePath: string, content: string): void {
    if (!this._started) return;
    const uri = pathToUri(filePath);
    this.documentVersions.set(uri, 1);
    this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "python",
        version: 1,
        text: content,
      },
    });
  }

  didChange(filePath: string, content: string): void {
    if (!this._started) return;
    const uri = pathToUri(filePath);
    const version = (this.documentVersions.get(uri) || 0) + 1;
    this.documentVersions.set(uri, version);
    this.sendNotification("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text: content }],
    });
  }

  didClose(filePath: string): void {
    if (!this._started) return;
    const uri = pathToUri(filePath);
    this.documentVersions.delete(uri);
    this.sendNotification("textDocument/didClose", {
      textDocument: { uri },
    });
  }

  didSave(filePath: string): void {
    if (!this._started) return;
    const uri = pathToUri(filePath);
    this.sendNotification("textDocument/didSave", {
      textDocument: { uri },
    });
  }

  // ── Feature requests ──

  async completion(
    filePath: string,
    line: number,
    character: number,
  ): Promise<any> {
    return this.sendRequest("textDocument/completion", {
      textDocument: { uri: pathToUri(filePath) },
      position: { line, character },
    });
  }

  async hover(
    filePath: string,
    line: number,
    character: number,
  ): Promise<any> {
    return this.sendRequest("textDocument/hover", {
      textDocument: { uri: pathToUri(filePath) },
      position: { line, character },
    });
  }

  async definition(
    filePath: string,
    line: number,
    character: number,
  ): Promise<any> {
    return this.sendRequest("textDocument/definition", {
      textDocument: { uri: pathToUri(filePath) },
      position: { line, character },
    });
  }
}

// Singleton — shared between App.tsx (lifecycle) and Editor.tsx (providers)
export const lspClient = new LspClient();
