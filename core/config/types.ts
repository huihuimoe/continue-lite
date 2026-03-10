const Types = `
declare global {
  import type { Node as SyntaxNode } from "web-tree-sitter";
  import { GetGhTokenArgs } from "./protocol/ide";
  declare global {
    interface Window {
      ide?: "vscode";
      windowId: string;
      serverUrl: string;
      vscMachineId: string;
      vscMediaUrl: string;
      fullColorTheme?: {
        rules?: {
          token?: string;
          foreground?: string;
        }[];
      };
      colorThemeName?: string;
      workspacePaths?: string[];
      postIntellijMessage?: (
        messageType: string,
        data: any,
        messageIde: string,
      ) => void;
    }
  }
  
  export interface ChunkWithoutID {
    content: string;
    startLine: number;
    endLine: number;
    signature?: string;
    otherMetadata?: { [key: string]: any };
  }
  
  export interface Chunk extends ChunkWithoutID {
    digest: string;
    filepath: string;
    index: number; // Index of the chunk in the document at filepath
  }
  
  export interface IndexingProgressUpdate {
    progress: number;
    desc: string;
    shouldClearIndexes?: boolean;
    status:
      | "loading"
      | "indexing"
      | "done"
      | "failed"
      | "paused"
      | "disabled"
      | "cancelled";
    debugInfo?: string;
  }
  
  // This is more or less a V2 of IndexingProgressUpdate for docs etc.
  export interface IndexingStatus {
    id: string;
    type: "docs";
    progress: number;
    description: string;
    status: "indexing" | "complete" | "paused" | "failed" | "aborted" | "pending";
    embeddingsProviderId: string;
    isReindexing?: boolean;
    debugInfo?: string;
    title: string;
    icon?: string;
    url?: string;
  }
  
  export type PromptTemplateFunction = (
    history: ChatMessage[],
    otherData: Record<string, string>,
  ) => string | ChatMessage[];
  
  export type PromptTemplate = string | PromptTemplateFunction;
  
  export interface ILLM extends LLMOptions {
    get providerName(): string;

    uniqueId: string;
    lastRequestId?: string;
    model: string;
  
    title?: string;
    systemMessage?: string;
    contextLength: number;
    maxStopWords?: number;
    completionOptions: CompletionOptions;
    requestOptions?: RequestOptions;
    promptTemplates?: Record<string, PromptTemplate>;
    templateMessages?: (messages: ChatMessage[]) => string;
    llmLogger?: ILLMLogger;
    llmRequestHook?: (model: string, prompt: string) => any;
    apiKey?: string;
    apiBase?: string;
    cacheBehavior?: CacheBehavior;
  
    deployment?: string;
    apiVersion?: string;
    apiType?: string;
    region?: string;
    projectId?: string;
  
    complete(
      prompt: string,
      signal: AbortSignal,
      options?: LLMFullCompletionOptions,
    ): Promise<string>;
  
    streamComplete(
      prompt: string,
      signal: AbortSignal,
      options?: LLMFullCompletionOptions,
    ): AsyncGenerator<string, PromptLog>;
  
    streamFim(
      prefix: string,
      suffix: string,
      signal: AbortSignal,
      options?: LLMFullCompletionOptions,
    ): AsyncGenerator<string, PromptLog>;
  
    streamChat(
      messages: ChatMessage[],
      signal: AbortSignal,
      options?: LLMFullCompletionOptions,
    ): AsyncGenerator<ChatMessage, PromptLog>;
  
    chat(
      messages: ChatMessage[],
      signal: AbortSignal,
      options?: LLMFullCompletionOptions,
    ): Promise<ChatMessage>;
  
  countTokens(text: string): number;
  
    supportsImages(): boolean;
  
    supportsCompletions(): boolean;
  
    supportsPrefill(): boolean;
  
    supportsFim(): boolean;
  
    listModels(): Promise<string[]>;
  
    renderPromptTemplate(
      template: PromptTemplate,
      history: ChatMessage[],
      otherData: Record<string, string>,
      canPutWordsInModelsMouth?: boolean,
    ): string | ChatMessage[];
  }
  
  export type ContextProviderType = "normal" | "query" | "submenu";
  
  export interface ContextProviderDescription {
    title: ContextProviderName;
    displayTitle: string;
    description: string;
    renderInlineAs?: string;
    type: ContextProviderType;
    dependsOnIndexing?: boolean;
  }
  
  export type FetchFunction = (url: string | URL, init?: any) => Promise<any>;
  
  export interface ContextProviderExtras {
    config: ContinueConfig;
    fullInput: string;
    llm: ILLM;
    ide: IDE;
    selectedCode: RangeInFile[];
    fetch: FetchFunction;
  }
  
  export interface LoadSubmenuItemsArgs {
    config: ContinueConfig;
    ide: IDE;
    fetch: FetchFunction;
  }
  
  export interface CustomContextProvider {
    title: string;
    displayTitle?: string;
    description?: string;
    renderInlineAs?: string;
    type?: ContextProviderType;
  
    getContextItems(
      query: string,
      extras: ContextProviderExtras,
    ): Promise<ContextItem[]>;
  
    loadSubmenuItems?: (
      args: LoadSubmenuItemsArgs,
    ) => Promise<ContextSubmenuItem[]>;
  }
  
  export interface ContextSubmenuItem {
    id: string;
    title: string;
    description: string;
    icon?: string;
    metadata?: any;
  }
  
  export interface SiteIndexingConfig {
    title: string;
    startUrl: string;
    maxDepth?: number;
    faviconUrl?: string;
  }
  
  export interface IContextProvider {
    get description(): ContextProviderDescription;
  
    getContextItems(
      query: string,
      extras: ContextProviderExtras,
    ): Promise<ContextItem[]>;
  
    loadSubmenuItems(args: LoadSubmenuItemsArgs): Promise<ContextSubmenuItem[]>;
  }
  
  export interface RangeInFile {
    filepath: string;
    range: Range;
  }
  
  export interface Location {
    filepath: string;
    position: Position;
  }
  
  export interface FileWithContents {
    filepath: string;
    contents: string;
  }
  
  export interface Range {
    start: Position;
    end: Position;
  }
  
  export interface Position {
    line: number;
    character: number;
  }
  
  export interface FileEdit {
    filepath: string;
    range: Range;
    replacement: string;
  }
  
  export interface CompletionOptions extends BaseCompletionOptions {
    model: string;
  }
  
  export type ChatMessageRole = import("./llm/chatTypes").ChatMessageRole;
  export type MessagePart = import("./llm/chatTypes").MessagePart;
  export type MessageContent = import("./llm/chatTypes").MessageContent;
  export type ToolCall = import("./llm/chatTypes").ToolCall;
  export type ToolCallDelta = import("./llm/tooling").ToolCallDelta;
  export type ToolResultChatMessage = import("./llm/chatTypes").ToolResultChatMessage;
  export type UserChatMessage = import("./llm/chatTypes").UserChatMessage;
  export type AssistantChatMessage = import("./llm/chatTypes").AssistantChatMessage;
  export type SystemChatMessage = import("./llm/chatTypes").SystemChatMessage;
  export type Usage = import("./llm/chatTypes").Usage;
  
  export type ChatMessage =
    | UserChatMessage
    | AssistantChatMessage
    | SystemChatMessage
    | ToolResultChatMessage;
  
  export interface ContextItemId {
    providerTitle: string;
    itemId: string;
  }
  
  export type ContextItemUriTypes = "file" | "url";
  
  export interface ContextItemUri {
    type: ContextItemUriTypes;
    value: string;
  }
  
  export interface ContextItem {
    content: string;
    name: string;
    description: string;
    editing?: boolean;
    editable?: boolean;
    icon?: string;
    uri?: ContextItemUri;
    hidden?: boolean;
  }
  
  export interface ContextItemWithId extends ContextItem {
    id: ContextItemId;
  }
  
  export interface InputModifiers {
    useCodebase: boolean;
    noContext: boolean;
  }
  
  export interface SymbolWithRange extends RangeInFile {
    name: string;
    type: SyntaxNode["type"];
    content: string;
  }
  
  export type FileSymbolMap = Record<string, SymbolWithRange[]>;
  
  export interface PromptLog {
    modelTitle: string;
    modelProvider: string;
    completionOptions: CompletionOptions;
    prompt: string;
    completion: string;
  }
  
  type MessageModes = "chat" | "edit";

  export type ToolStatus =
    | "generating"
    | "generated"
    | "calling"
    | "done"
    | "errored"
    | "canceled";

  export interface ToolCallState {
    toolCallId: string;
    toolCall: ToolCall;
    status: ToolStatus;
    parsedArgs: any;
    output?: ContextItem[];
  }

  export interface ChatHistoryItem {
    message: ChatMessage;
    contextItems: ContextItemWithId[];
    editorState?: any;
    modifiers?: InputModifiers;
    promptLogs?: PromptLog[];
    toolCallStates?: ToolCallState[];
    isGatheringContext?: boolean;
  }

  export interface BaseSessionMetadata {
    sessionId: string;
    title: string;
    dateCreated: string;
    workspaceDirectory: string;
    messageCount?: number;
  }

  export interface SessionMetadata extends BaseSessionMetadata {}

  export interface Session {
    sessionId: string;
    title: string;
    workspaceDirectory: string;
    history: ChatHistoryItem[];
    mode?: MessageModes;
    chatModelTitle?: string;
    usage?: Usage;
  }

  type ChatCompletionTool = import("openai/resources/index").ChatCompletionCreateParams["tools"] extends
    | Array<infer T>
    | undefined
    ? T
    : never;

  export interface LLMFullCompletionOptions extends BaseCompletionOptions {
    log?: boolean;
    model?: string;
    tools?: Tool[];
    toolChoice?: import("openai/resources/index").ChatCompletionCreateParams["tool_choice"];
    tool_choice?: import("openai/resources/index").ChatCompletionCreateParams["tool_choice"];
  }
  
  export type ToastType = "info" | "error" | "warning";
  
  export interface LLMInteractionBase {
    interactionId: string;
    timestamp: number;
  }
  
  export interface LLMInteractionStartChat extends LLMInteractionBase {
    kind: "startChat";
    messages: ChatMessage[];
    options: CompletionOptions;
  }
  
  export interface LLMInteractionStartComplete extends LLMInteractionBase {
    kind: "startComplete";
    prompt: string;
    options: CompletionOptions;
  }
  
  export interface LLMInteractionStartFim extends LLMInteractionBase {
    kind: "startFim";
    prefix: string;
    suffix: string;
    options: CompletionOptions;
  }
  
  export interface LLMInteractionChunk extends LLMInteractionBase {
    kind: "chunk";
    chunk: string;
  }
  
  export interface LLMInteractionMessage extends LLMInteractionBase {
    kind: "message";
    message: ChatMessage;
  }
  
  export interface LLMInteractionEnd extends LLMInteractionBase {
    promptTokens: number;
    generatedTokens: number;
    thinkingTokens: number;
  }
  
  export interface LLMInteractionSuccess extends LLMInteractionEnd {
    kind: "success";
  }
  
  export interface LLMInteractionCancel extends LLMInteractionEnd {
    kind: "cancel";
  }
  
  export interface LLMInteractionError extends LLMInteractionEnd {
    kind: "error";
    name: string;
    message: string;
  }
  
  export type LLMInteractionItem =
    | LLMInteractionStartChat
    | LLMInteractionStartComplete
    | LLMInteractionStartFim
    | LLMInteractionChunk
    | LLMInteractionMessage
    | LLMInteractionSuccess
    | LLMInteractionCancel
    | LLMInteractionError;
  
  // When we log a LLM interaction, we want to add the interactionId and timestamp
  // in the logger code, so we need a type that omits these members from *each*
  // member of the union. This can be done by using the distributive behavior of
  // conditional types in Typescript.
  //
  // www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types
  // https://stackoverflow.com/questions/57103834/typescript-omit-a-property-from-all-interfaces-in-a-union-but-keep-the-union-s
  type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
    ? Omit<T, K>
    : never;
  
  export type LLMInteractionItemDetails = DistributiveOmit<
    LLMInteractionItem,
    "interactionId" | "timestamp"
  >;
  
  export interface ILLMInteractionLog {
    logItem(item: LLMInteractionItemDetails): void;
  }
  
  export interface ILLMLogger {
    createInteractionLog(): ILLMInteractionLog;
  }
  
  export interface LLMOptions {
    model: string;
  
    title?: string;
    uniqueId?: string;
    systemMessage?: string;
    contextLength?: number;
    maxStopWords?: number;
    completionOptions?: CompletionOptions;
    requestOptions?: RequestOptions;
    template?: TemplateType;
    promptTemplates?: Record<string, PromptTemplate>;
    templateMessages?: (messages: ChatMessage[]) => string;
    logger?: ILLMLogger;
    llmRequestHook?: (model: string, prompt: string) => any;
    apiKey?: string;
    aiGatewaySlug?: string;
    apiBase?: string;
    cacheBehavior?: CacheBehavior;
    useLegacyCompletionsEndpoint?: boolean;
  
    // Cloudflare options
    accountId?: string;
  
    // Azure options
    deployment?: string;
    apiVersion?: string;
    apiType?: string;
  
    // AWS options
    profile?: string;
  
    // AWS and GCP Options
    region?: string;
  
    // GCP Options
    capabilities?: ModelCapability;
  
    // GCP and Watsonx Options
    projectId?: string;
  
    // IBM watsonx Options
    deploymentId?: string;
  }
  
  type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
    T,
    Exclude<keyof T, Keys>
  > &
    {
      [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
    }[Keys];
  
  export interface CustomLLMWithOptionals {
    options: LLMOptions;
    streamCompletion?: (
      prompt: string,
      signal: AbortSignal,
      options: CompletionOptions,
      fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
    ) => AsyncGenerator<string>;
    streamChat?: (
      messages: ChatMessage[],
      signal: AbortSignal,
      options: CompletionOptions,
      fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
    ) => AsyncGenerator<string>;
    listModels?: (
      fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
    ) => Promise<string[]>;
  }
  
  /**
   * The LLM interface requires you to specify either \`streamCompletion\` or \`streamChat\` (or both).
   */
  export type CustomLLM = RequireAtLeastOne<
    CustomLLMWithOptionals,
    "streamCompletion" | "streamChat"
  >;
  
  // IDE
  
  export type DiffLineType = "new" | "old" | "same";
  
  export interface DiffLine {
    type: DiffLineType;
    line: string;
  }
  
  export class Problem {
    filepath: string;
    range: Range;
    message: string;
  }
  
  export class Thread {
    name: string;
    id: number;
  }
  
  export type IdeType = "vscode" | "jetbrains";
  
  export interface IdeInfo {
    ideType: IdeType;
    name: string;
    version: string;
    remoteName: string;
    extensionVersion: string;
  }
  
  export interface BranchAndDir {
    branch: string;
    directory: string;
  }
  
  export interface IndexTag extends BranchAndDir {
    artifactId: string;
  }
  
  export enum FileType {
    Unkown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
  }
  
export interface IdeSettings {
  remoteConfigServerUrl?: string;
  remoteConfigSyncPeriod: number;
  userToken: string;
  continueTestEnvironment?: "none" | "production" | "staging" | "local";
  pauseCodebaseIndexOnStart: boolean;
}
  
  export interface IDE {
    getIdeInfo(): Promise<IdeInfo>;
  
    getIdeSettings(): Promise<IdeSettings>;
  
    getDiff(includeUnstaged: boolean): Promise<string[]>;
  
    getClipboardContent(): Promise<{ text: string; copiedAt: string }>;
  
    isTelemetryEnabled(): Promise<boolean>;
  
    getUniqueId(): Promise<string>;
  
    getTerminalContents(): Promise<string>;
  
    getDebugLocals(threadIndex: number): Promise<string>;
  
    getTopLevelCallStackSources(
      threadIndex: number,
      stackDepth: number,
    ): Promise<string[]>;
  
    getAvailableThreads(): Promise<Thread[]>;
  
    getWorkspaceDirs(): Promise<string[]>;
  
    fileExists(filepath: string): Promise<boolean>;
  
    writeFile(path: string, contents: string): Promise<void>;
  
    showVirtualFile(title: string, contents: string): Promise<void>;
    openFile(path: string): Promise<void>;
  
    openUrl(url: string): Promise<void>;
  
    getExternalUri?(uri: string): Promise<string>;
  
    runCommand(command: string): Promise<void>;
  
    saveFile(filepath: string): Promise<void>;
  
    readFile(filepath: string): Promise<string>;
  
    readRangeInFile(filepath: string, range: Range): Promise<string>;
  
    showLines(
      filepath: string,
      startLine: number,
      endLine: number,
    ): Promise<void>;
    getOpenFiles(): Promise<string[]>;
  
    getCurrentFile(): Promise<
      | undefined
      | {
          isUntitled: boolean;
          path: string;
          contents: string;
        }
    >;
  
    getPinnedFiles(): Promise<string[]>;
  
    subprocess(command: string, cwd?: string): Promise<[string, string]>;
  
    getProblems(filepath?: string | undefined): Promise<Problem[]>;
  
    getBranch(dir: string): Promise<string>;
  
    getTags(artifactId: string): Promise<IndexTag[]>;
  
    getRepoName(dir: string): Promise<string | undefined>;
  
    showToast(
      type: ToastType,
      message: string,
      ...otherParams: any[]
    ): Promise<any>;
  
    getGitRootPath(dir: string): Promise<string | undefined>;
  
    listDir(dir: string): Promise<[string, FileType][]>;
  
    getLastModified(files: string[]): Promise<{ [path: string]: number }>;
  
    // LSP
    gotoDefinition(location: Location): Promise<RangeInFile[]>;
    gotoTypeDefinition(location: Location): Promise<RangeInFile[]>;
    getSignatureHelp(location: Location): Promise<SignatureHelp | null>;
    getReferences(location: Location): Promise<RangeInFile[]>;
    getDocumentSymbols(textDocumentIdentifier: string): Promise<DocumentSymbol[]>;
  
    // Callbacks
    onDidChangeActiveTextEditor(callback: (filepath: string) => void): void;
  }
  
  // Slash Commands
  
  export interface ContinueSDK {
    ide: IDE;
    llm: ILLM;
    addContextItem: (item: ContextItemWithId) => void;
    history: ChatMessage[];
    input: string;
    params?: { [key: string]: any } | undefined;
    contextItems: ContextItemWithId[];
    selectedCode: RangeInFile[];
    config: ContinueConfig;
    fetch: FetchFunction;
  }
  
  export interface SlashCommand {
    name: string;
    description: string;
    params?: { [key: string]: any };
    run: (sdk: ContinueSDK) => AsyncGenerator<string | undefined>;
  }

  export type SlashCommandSource =
    | "built-in-legacy"
    | "built-in"
    | "json-custom-command"
    | "config-ts-slash-command"
    | "yaml-prompt-block"
    | "invokable-rule";

  export interface SlashCommandWithSource {
    name: string;
    description: string;
    prompt?: string;
    params?: { [key: string]: any };
    run?: (sdk: ContinueSDK) => AsyncGenerator<string | undefined>;
    source: SlashCommandSource;
    sourceFile?: string;
    slug?: string;
    overrideSystemMessage?: string;
    isLegacy?: boolean;
  }

  export interface SlashCommandDescWithSource extends SlashCommandWithSource {}
  
  // Config
  
  type StepName =
    | "AnswerQuestionChroma"
    | "GenerateShellCommandStep"
    | "EditHighlightedCodeStep"
    | "ShareSessionStep"
    | "CommentCodeStep"
    | "ClearHistoryStep"
    | "StackOverflowStep"
    | "OpenConfigStep"
    | "GenerateShellCommandStep"
    | "DraftIssueStep";
  
  type ContextProviderName =
    | "diff"
    | "terminal"
    | "debugger"
    | "open"
    | "google"
    | "search"
    | "tree"
    | "http"
    | "problems"
    | "postgres"
    | "database"
    | "code"
    | "gitlab-mr"
    | "os"
    | "currentFile"
    | "outline"
    | "highlights"
    | "file"
    | "issue"
    | "url"
    | string;
  
  type TemplateType =
    | "llama2"
    | "alpaca"
    | "zephyr"
    | "phi2"
    | "phind"
    | "anthropic"
    | "chatml"
    | "none"
    | "openchat"
    | "deepseek"
    | "xwin-coder"
    | "neural-chat"
    | "codellama-70b"
    | "llava"
    | "gemma"
    | "granite"
    | "llama3"
    | "codestral";
  
  export interface RequestOptions {
    timeout?: number;
    verifySsl?: boolean;
    caBundlePath?: string | string[];
    proxy?: string;
    headers?: { [key: string]: string };
    extraBodyProperties?: { [key: string]: any };
    noProxy?: string[];
    clientCertificate?: ClientCertificateOptions;
  }
  
  export interface CacheBehavior {
    cacheSystemMessage?: boolean;
    cacheConversation?: boolean;
  }
  
  export interface ClientCertificateOptions {
    cert: string;
    key: string;
    passphrase?: string;
  }
  
  export interface StepWithParams {
    name: StepName;
    params: { [key: string]: any };
  }

  export interface ContextProviderWithParams {
    name: ContextProviderName;
    params: { [key: string]: any };
  }

  export interface SlashCommandDescription {
    name: string;
    description: string;
    params?: { [key: string]: any };
  }

  export interface CustomCommand {
    name: string;
    prompt: string;
    description: string;
  }
  
  interface Prediction {
    type: "content";
    content:
      | string
      | {
          type: "text";
          text: string;
        }[];
  }

  export interface Tool {
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, any>;
      strict?: boolean | null;
    };
    displayTitle: string;
    wouldLikeTo?: string;
    isCurrently?: string;
    hasAlready?: string;
    readonly: boolean;
    uri?: string;
    faviconUrl?: string;
    group?: string;
    originalFunctionName?: string;
    mcpMeta?: Record<string, unknown>;
  }
  
  interface BaseCompletionOptions {
    temperature?: number;
    topP?: number;
    topK?: number;
    minP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    mirostat?: number;
    stop?: string[];
    maxTokens?: number;
    numThreads?: number;
    useMmap?: boolean;
    keepAlive?: number;
    numGpu?: number;
    raw?: boolean;
    stream?: boolean;
    prediction?: Prediction;
    tools?: Tool[];
    toolChoice?: import("openai/resources/index").ChatCompletionCreateParams["tool_choice"];
    tool_choice?: import("openai/resources/index").ChatCompletionCreateParams["tool_choice"];
  }
  
  export interface ModelCapability {
    uploadImage?: boolean;
    tools?: boolean;
    nextEdit?: boolean;
  }
  
  export interface ModelDescription {
    title: string;
    provider: string;
    model: string;
    apiKey?: string;
    apiBase?: string;
    contextLength?: number;
    maxStopWords?: number;
    template?: TemplateType;
    completionOptions?: BaseCompletionOptions;
    systemMessage?: string;
    requestOptions?: RequestOptions;
    promptTemplates?: { [key: string]: string };
    capabilities?: ModelCapability;
    cacheBehavior?: CacheBehavior;
    useLegacyCompletionsEndpoint?: boolean;
  }

  export interface JSONEmbedOptions {
    apiBase?: string;
    apiKey?: string;
    model?: string;
    deployment?: string;
    apiType?: string;
    apiVersion?: string;
    requestOptions?: RequestOptions;
    maxChunkSize?: number;
    maxBatchSize?: number;
    profile?: string;
    region?: string;
    projectId?: string;
  }

  export interface EmbeddingsProviderDescription extends JSONEmbedOptions {
    provider: string;
  }

  export interface RerankerDescription {
    name: string;
    params?: { [key: string]: any };
  }
  
  export interface TabAutocompleteOptions {
    disable: boolean;
    maxPromptTokens: number;
    debounceDelay: number;
    maxSuffixPercentage: number;
    prefixPercentage: number;
    slidingWindowPrefixPercentage: number;
    slidingWindowSize: number;
    transform?: boolean;
    template?: string;
    multilineCompletions: "always" | "never" | "auto";
    useCache: boolean;
    onlyMyCode: boolean;
    useRecentlyEdited: boolean;
    disableInFiles?: string[];
    useImports?: boolean;
    showWhateverWeHaveAtXMs?: number;
  }
  
  export type ApplyStateStatus =
    | "streaming" // Changes are being applied to the file
    | "done" // All changes have been applied, awaiting user to accept/reject
    | "closed"; // All changes have been applied. Note that for new files, we immediately set the status to "closed"
  
  export interface ApplyState {
    streamId: string;
    status?: ApplyStateStatus;
    numDiffs?: number;
    filepath?: string;
    fileContent?: string;
    originalFileContent?: string;
    autoFormattingDiff?: string;
  }
  
  export interface RangeInFileWithContents {
    filepath: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
    contents: string;
  }
  
  export type CodeToEdit = RangeInFileWithContents | FileWithContents;
  
  export interface ContinueUIConfig {
    codeBlockToolbarPosition?: "top" | "bottom";
    fontSize?: number;
    displayRawMarkdown?: boolean;
    showChatScrollbar?: boolean;
    codeWrap?: boolean;
    showSessionTabs?: boolean;
    continueAfterToolRejection?: boolean;
  }

  export interface ExperimentalModelRoles {
    inlineEdit?: string;
    applyCodeBlock?: string;
    repoMapFileSelection?: string;
  }

  export interface ExperimentalConfig {
    useCurrentFileAsContext?: boolean;
    enableStaticContextualization?: boolean;
    modelRoles?: ExperimentalModelRoles;
    promptPath?: string;
    readResponseTTS?: boolean;
    useChromiumForDocsCrawling?: boolean;
    enableExperimentalTools?: boolean;
    onlyUseSystemMessageTools?: boolean;
    codebaseToolCallingOnly?: boolean;
  }
  
  export interface AnalyticsConfig {
    type: string;
    url?: string;
    clientKey?: string;
  }
  
  // config.json
  export interface SerializedContinueConfig {
    env?: string[];
    allowAnonymousTelemetry?: boolean;
    models: ModelDescription[];
    systemMessage?: string;
    completionOptions?: BaseCompletionOptions;
    requestOptions?: RequestOptions;
    slashCommands?: SlashCommandDescription[];
    customCommands?: CustomCommand[];
    contextProviders?: ContextProviderWithParams[];
    disableIndexing?: boolean;
    disableSessionTitles?: boolean;
    userToken?: string;
    embeddingsProvider?: EmbeddingsProviderDescription;
    tabAutocompleteModel?: ModelDescription | ModelDescription[];
    tabAutocompleteOptions?: Partial<TabAutocompleteOptions>;
    ui?: ContinueUIConfig;
    reranker?: RerankerDescription;
    experimental?: ExperimentalConfig;
    analytics?: AnalyticsConfig;
    docs?: SiteIndexingConfig[];
  }
  
  export type ConfigMergeType = "merge" | "overwrite";
  
  export type ContinueRcJson = Partial<SerializedContinueConfig> & {
    mergeBehavior: ConfigMergeType;
  };
  
  // config.ts - give users simplified interfaces
  export interface Config {
    /** If set to true, Continue will collect anonymous usage data to improve the product. If set to false, we will collect nothing. Read here to learn more: https://docs.continue.dev/telemetry */
    allowAnonymousTelemetry?: boolean;
    /** Each entry in this array will originally be a ModelDescription, the same object from your config.json, but you may add CustomLLMs.
     * A CustomLLM requires you only to define an AsyncGenerator that calls the LLM and yields string updates. You can choose to define either \`streamCompletion\` or \`streamChat\` (or both).
     * Continue will do the rest of the work to construct prompt templates, handle context items, prune context, etc.
     */
    models: (CustomLLM | ModelDescription)[];
    /** A system message to be followed by all of your models */
    systemMessage?: string;
    completionOptions?: BaseCompletionOptions;
    requestOptions?: RequestOptions;
    slashCommands?: (SlashCommand | SlashCommandWithSource)[];
    contextProviders?: (CustomContextProvider | ContextProviderWithParams)[];
    disableIndexing?: boolean;
    disableSessionTitles?: boolean;
    userToken?: string;
    embeddingsProvider?: EmbeddingsProviderDescription | ILLM;
    tabAutocompleteModel?:
      | CustomLLM
      | ModelDescription
      | (CustomLLM | ModelDescription)[];
    tabAutocompleteOptions?: Partial<TabAutocompleteOptions>;
    ui?: ContinueUIConfig;
    reranker?: RerankerDescription | ILLM;
    experimental?: ExperimentalConfig;
    analytics?: AnalyticsConfig;
    docs?: SiteIndexingConfig[];
  }
  
  // in the actual Continue source code
  export interface ContinueConfig {
    allowAnonymousTelemetry?: boolean;
    models: ILLM[];
    systemMessage?: string;
    completionOptions?: BaseCompletionOptions;
    requestOptions?: RequestOptions;
    slashCommands?: (SlashCommandWithSource | SlashCommandDescWithSource)[];
    contextProviders?: IContextProvider[];
    disableSessionTitles?: boolean;
    disableIndexing?: boolean;
    userToken?: string;
    tabAutocompleteModels?: ILLM[];
    tabAutocompleteOptions?: Partial<TabAutocompleteOptions>;
    ui?: ContinueUIConfig;
    experimental?: ExperimentalConfig;
    analytics?: AnalyticsConfig;
    docs?: SiteIndexingConfig[];
    tools?: Tool[];
  }
  
  export interface BrowserSerializedContinueConfig {
    allowAnonymousTelemetry?: boolean;
    models: ModelDescription[];
    systemMessage?: string;
    completionOptions?: BaseCompletionOptions;
    requestOptions?: RequestOptions;
    slashCommands?: SlashCommandDescWithSource[];
    contextProviders?: ContextProviderDescription[];
    disableIndexing?: boolean;
    disableSessionTitles?: boolean;
    userToken?: string;
    ui?: ContinueUIConfig;
    experimental?: ExperimentalConfig;
    analytics?: AnalyticsConfig;
    docs?: SiteIndexingConfig[];
    tools?: Tool[];
  }
  
  // DOCS SUGGESTIONS AND PACKAGE INFO
  export interface FilePathAndName {
    path: string;
    name: string;
  }
  
  export interface PackageFilePathAndName extends FilePathAndName {
    packageRegistry: string; // e.g. npm, pypi
  }
  
  export type ParsedPackageInfo = {
    name: string;
    packageFile: PackageFilePathAndName;
    language: string;
    version: string;
  };
  
  export type PackageDetails = {
    docsLink?: string;
    docsLinkWarning?: string;
    title?: string;
    description?: string;
    repo?: string;
    license?: string;
  };
  
  export type PackageDetailsSuccess = PackageDetails & {
    docsLink: string;
  };
  
  export type PackageDocsResult = {
    packageInfo: ParsedPackageInfo;
  } & (
    | { error: string; details?: never }
    | { details: PackageDetailsSuccess; error?: never }
  );
}

declare module "./llm/index.js" {
  interface BaseLLM {
    useLegacyCompletionsEndpoint?: boolean;
  }
}

export {};
`;

export default Types;
