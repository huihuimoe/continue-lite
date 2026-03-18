import {
  DataDestination,
  ModelRole,
  PromptTemplates,
} from "@continuedev/config-yaml";
import type { ChatCompletionCreateParams } from "openai/resources/index";
import type { Node as SyntaxNode } from "web-tree-sitter";
import type { ChatMessage, Usage } from "./llm/chatTypes";

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

interface ChunkWithoutID {
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

// This is more or less a V2 of IndexingProgressUpdate for docs etc.
export interface IndexingStatus {
  id: string;
  type: "docs";
  progress: number;
  description: string;
  status: "indexing" | "complete" | "paused" | "failed" | "aborted" | "pending";
  embeddingsProviderId?: string;
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

type RequiredLLMOptions = "uniqueId" | "contextLength" | "completionOptions";

export interface ILLM
  extends
    Omit<LLMOptions, RequiredLLMOptions>,
    Required<Pick<LLMOptions, RequiredLLMOptions>> {
  get providerName(): string;
  get underlyingProviderName(): string;

  autocompleteOptions?: Partial<TabAutocompleteOptions>;

  lastRequestId?: string;

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
    messageOptions?: MessageOption,
  ): AsyncGenerator<ChatMessage, PromptLog>;

  chat(
    messages: ChatMessage[],
    signal: AbortSignal,
    options?: LLMFullCompletionOptions,
  ): Promise<ChatMessage>;

  compileChatMessages(
    messages: ChatMessage[],
    options: LLMFullCompletionOpeions,
  ): CompiledChatMessagesReport;

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

  getConfigurationStatus(): LLMConfigurationStatuses;
}

export interface ModelInstaller {
  installModel(
    modelName: string,
    signal: AbortSignal,
    progressReporter?: (task: string, increment: number, total: number) => void,
  ): Promise<any>;

  isInstallingModel(modelName: string): Promise<boolean>;
}

type ContextProviderType = "normal" | "query" | "submenu";
type ContextIndexingType =
  | "chunk"
  | "embeddings"
  | "fullTextSearch"
  | "codeSnippets";

interface ContextProviderDescription {
  title: ContextProviderName;
  displayTitle: string;
  description: string;
  renderInlineAs?: string;
  type: ContextProviderType;
  dependsOnIndexing?: ContextIndexingType[];
}

type FetchFunction = (url: string | URL, init?: any) => Promise<any>;

interface ContextProviderExtras {
  config: ContinueConfig;
  fullInput: string;
  llm: ILLM;
  ide: IDE;
  selectedCode: RangeInFile[];
  fetch: FetchFunction;
  isInAgentMode: boolean;
}

interface LoadSubmenuItemsArgs {
  config: ContinueConfig;
  ide: IDE;
  fetch: FetchFunction;
}

interface ContextSubmenuItem {
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
  useLocalCrawling?: boolean;
  sourceFile?: string;
}

interface IContextProvider {
  get description(): ContextProviderDescription;

  getContextItems(
    query: string,
    extras: ContextProviderExtras,
  ): Promise<ContextItem[]>;

  loadSubmenuItems(args: LoadSubmenuItemsArgs): Promise<ContextSubmenuItem[]>;

  get deprecationMessage(): string | null;
}

export interface RangeInFile {
  filepath: string;
  range: Range;
}

export interface Location {
  filepath: string;
  position: Position;
}

interface FileWithContents {
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

export interface CompletionOptions extends BaseCompletionOptions {
  model: string;
}

export type {
  AssistantChatMessage,
  ChatMessage,
  ChatMessageRole,
  ImageMessagePart,
  MessageContent,
  MessagePart,
  SystemChatMessage,
  TextMessagePart,
  ThinkingChatMessage,
  ToolCall,
  ToolResultChatMessage,
  Usage,
  UserChatMessage,
} from "./llm/chatTypes";

export interface ContextItemId {
  providerTitle: string;
  itemId: string;
}

type ContextItemUriTypes = "file" | "url";

interface ContextItemUri {
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
  status?: string;
}

export interface ContextItemWithId extends ContextItem {
  id: ContextItemId;
}

interface InputModifiers {
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
  prompt: string;
  completion: string;
}

interface Reasoning {
  active: boolean;
  text: string;
  startAt: number;
  endAt?: number;
}

export interface ChatHistoryItem {
  message: ChatMessage;
  contextItems: ContextItemWithId[];
  editorState?: any;
  modifiers?: InputModifiers;
  promptLogs?: PromptLog[];
  isGatheringContext?: boolean;
  reasoning?: Reasoning;
  appliedRules?: RuleMetadata[];
  conversationSummary?: string;
}

type ChatCompletionTool = ChatCompletionCreateParams["tools"] extends
  | Array<infer T>
  | undefined
  ? T
  : never;

export interface LLMFullCompletionOptions extends BaseCompletionOptions {
  log?: boolean;
  model?: string;
  tools?: (ChatCompletionTool & Record<string, unknown>)[];
  toolChoice?: ChatCompletionCreateParams["tool_choice"];
  tool_choice?: ChatCompletionCreateParams["tool_choice"];
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
  provider: string;
}

export interface LLMInteractionStartComplete extends LLMInteractionBase {
  kind: "startComplete";
  prompt: string;
  options: CompletionOptions;
  provider: string;
}

export interface LLMInteractionStartFim extends LLMInteractionBase {
  kind: "startFim";
  prefix: string;
  suffix: string;
  options: CompletionOptions;
  provider: string;
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
  usage: Usage | undefined;
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
  baseAgentSystemMessage?: string;
  basePlanSystemMessage?: string;
  baseChatSystemMessage?: string;
  autocompleteOptions?: Partial<TabAutocompleteOptions>;
  contextLength?: number;
  maxStopWords?: number;
  completionOptions?: CompletionOptions;
  requestOptions?: RequestOptions;
  template?: TemplateType;
  promptTemplates?: Partial<Record<keyof PromptTemplates, PromptTemplate>>;
  templateMessages?: (messages: ChatMessage[]) => string;
  logger?: ILLMLogger;
  llmRequestHook?: (model: string, prompt: string) => any;
  apiKey?: string;

  // continueProperties
  apiKeyLocation?: string;
  envSecretLocations?: Record<string, string>;
  apiBase?: string;
  orgScopeId?: string | null;

  onPremProxyUrl?: string | null;

  aiGatewaySlug?: string;
  cacheBehavior?: CacheBehavior;
  capabilities?: ModelCapability;
  roles?: ModelRole[];

  // Cloudflare options
  accountId?: string;

  // Azure options
  deployment?: string;
  apiVersion?: string;
  apiType?: string;

  // AWS options
  profile?: string;
  accessKeyId?: string;
  secretAccessKey?: string;

  // AWS and VertexAI Options
  region?: string;

  // VertexAI and Watsonx Options
  projectId?: string;

  // IBM watsonx Options
  deploymentId?: string;

  env?: Record<string, string | number | boolean>;

  sourceFile?: string;
  isFromAutoDetect?: boolean;
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
  ) => AsyncGenerator<ChatMessage | string>;
  listModels?: (
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  ) => Promise<string[]>;
}

/**
 * The LLM interface requires you to specify either `streamCompletion` or `streamChat` (or both).
 */
export type CustomLLM = RequireAtLeastOne<
  CustomLLMWithOptionals,
  "streamCompletion" | "streamChat"
>;

// IDE

export type DiffType = "new" | "old" | "same";

interface DiffObject {
  type: DiffType;
}

export interface DiffLine extends DiffObject {
  line: string;
}

export interface DiffChar extends DiffObject {
  char: string;
  oldIndex?: number; // Character index assuming a flattened line string.
  newIndex?: number;
  oldCharIndexInLine?: number; // Character index assuming new lines reset the character index to 0.
  newCharIndexInLine?: number;
  oldLineIndex?: number;
  newLineIndex?: number;
}

export interface Problem {
  filepath: string;
  range: Range;
  message: string;
}

export interface Thread {
  name: string;
  id: number;
}

export interface IdeInfo {
  name: string;
  version: string;
  remoteName: string;
  extensionVersion: string;
  isPrerelease: boolean;
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
  remoteConfigSyncPeriod: number;
  userToken: string;
  continueTestEnvironment: "none" | "production" | "staging" | "local";
  pauseCodebaseIndexOnStart: boolean;
}

interface FileStats {
  size: number;
  lastModified: number;
}

/** Map of file name to stats */
export type FileStatsMap = {
  [path: string]: FileStats;
};

export interface IDE {
  getIdeInfo(): Promise<IdeInfo>;

  getIdeSettings(): Promise<IdeSettings>;

  getDiff(includeUnstaged: boolean): Promise<string[]>;

  getClipboardContent(): Promise<{ text: string; copiedAt: string }>;

  isWorkspaceRemote(): Promise<boolean>;

  getUniqueId(): Promise<string>;

  getTerminalContents(): Promise<string>;

  getDebugLocals(threadIndex: number): Promise<string>;

  getTopLevelCallStackSources(
    threadIndex: number,
    stackDepth: number,
  ): Promise<string[]>;

  getAvailableThreads(): Promise<Thread[]>;

  getWorkspaceDirs(): Promise<string[]>;

  fileExists(fileUri: string): Promise<boolean>;

  writeFile(path: string, contents: string): Promise<void>;

  removeFile(path: string): Promise<void>;

  showVirtualFile(title: string, contents: string): Promise<void>;

  openFile(path: string): Promise<void>;

  openUrl(url: string): Promise<void>;

  getExternalUri?(uri: string): Promise<string>;

  runCommand(command: string, options?: TerminalOptions): Promise<void>;

  saveFile(fileUri: string): Promise<void>;

  readFile(fileUri: string): Promise<string>;

  readRangeInFile(fileUri: string, range: Range): Promise<string>;

  showLines(fileUri: string, startLine: number, endLine: number): Promise<void>;

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

  getProblems(fileUri?: string | undefined): Promise<Problem[]>;

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

  getFileStats(files: string[]): Promise<FileStatsMap>;

  // Secret Storage
  readSecrets(keys: string[]): Promise<Record<string, string>>;

  writeSecrets(secrets: { [key: string]: string }): Promise<void>;

  // LSP
  gotoDefinition(location: Location): Promise<RangeInFile[]>;
  gotoTypeDefinition(location: Location): Promise<RangeInFile[]>;
  getSignatureHelp(location: Location): Promise<SignatureHelp | null>;
  getReferences(location: Location): Promise<RangeInFile[]>;
  getDocumentSymbols(textDocumentIdentifier: string): Promise<DocumentSymbol[]>;

  // Callbacks
  onDidChangeActiveTextEditor(callback: (fileUri: string) => void): void;
}

// Slash Commands

interface ContinueSDK {
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
  completionOptions?: LLMFullCompletionOptions;
  abortController: AbortController;
}

interface SlashCommandFields {
  name: string;
  description: string;
  prompt?: string;
  params?: { [key: string]: any };
}

interface SlashCommand extends SlashCommandFields {
  run: (sdk: ContinueSDK) => AsyncGenerator<string | undefined>;
}

interface SlashCommandWithSource extends SlashCommandFields {
  run?: (sdk: ContinueSDK) => AsyncGenerator<string | undefined>; // Optional - only needed for legacy
  source: SlashCommandSource;
  sourceFile?: string;
  slug?: string;
  overrideSystemMessage?: string;
}

type SlashCommandSource =
  | "built-in-legacy"
  | "built-in"
  | "json-custom-command"
  | "config-ts-slash-command"
  | "yaml-prompt-block"
  | "invokable-rule";

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
  | "web"
  | "clipboard"
  | string;

export type TemplateType =
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

interface StepWithParams {
  name: StepName;
  params: { [key: string]: any };
}

export interface Prediction {
  type: "content";
  content:
    | string
    | {
        type: "text";
        text: string;
      }[];
}

export interface BaseCompletionOptions {
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
  reasoning?: boolean;
  reasoningBudgetTokens?: number;
  promptCaching?: boolean;
}

export interface ModelCapability {
  uploadImage?: boolean;
  nextEdit?: boolean;
}

export interface ModelDescription {
  title: string;
  provider: string;
  underlyingProviderName: string;
  model: string;
  apiKey?: string;

  apiBase?: string;
  apiKeyLocation?: string;
  envSecretLocations?: Record<string, string>;
  orgScopeId?: string | null;

  onPremProxyUrl?: string | null;

  contextLength?: number;
  maxStopWords?: number;
  template?: TemplateType;
  completionOptions?: BaseCompletionOptions;
  baseAgentSystemMessage?: string;
  basePlanSystemMessage?: string;
  baseChatSystemMessage?: string;
  requestOptions?: RequestOptions;
  promptTemplates?: { [key: string]: string };
  cacheBehavior?: CacheBehavior;
  capabilities?: ModelCapability;
  roles?: ModelRole[];
  configurationStatus?: LLMConfigurationStatuses;

  sourceFile?: string;
  isFromAutoDetect?: boolean;
}

// TODO: We should consider renaming this to AutocompleteOptions.
export interface TabAutocompleteOptions {
  disable: boolean;
  maxPromptTokens: number;
  debounceDelay: number;
  modelTimeout: number;
  maxSuffixPercentage: number;
  prefixPercentage: number;
  transform?: boolean;
  template?: string;
  multilineCompletions: "always" | "never" | "auto";
  useCache: boolean;
  onlyMyCode: boolean;
  useRecentlyEdited: boolean;
  useRecentlyOpened: boolean;
  disableInFiles?: string[];
  useImports?: boolean;
  showWhateverWeHaveAtXMs?: number;
  // true = enabled, false = disabled, number = enabled with priority
  experimental_includeClipboard: boolean | number;
  experimental_includeRecentlyVisitedRanges: boolean | number;
  experimental_includeRecentlyEditedRanges: boolean | number;
  experimental_includeDiff: boolean | number;
  experimental_enableStaticContextualization: boolean;
}

// Leaving here to ideate on
// export type ContinueConfigSource = "local-yaml" | "local-json" | "hub-assistant" | "hub"

type ApplyStateStatus =
  | "not-started" // Apply state created but not necessarily streaming
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
  toolCallId?: string;
  autoFormattingDiff?: string;
}

export interface HighlightedCodePayload {
  rangeInFileWithContents: RangeInFileWithContents;
  prompt?: string;
  shouldRun?: boolean;
}

export interface AcceptOrRejectDiffPayload {
  filepath?: string;
  streamId?: string;
}

export interface ShowFilePayload {
  filepath: string;
}

export interface ApplyToFilePayload {
  streamId: string;
  filepath?: string;
  text: string;
  toolCallId?: string;
  isSearchAndReplace?: boolean;
}

export interface RangeInFileWithContents {
  filepath: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  contents: string;
}

export interface RangeInFileWithNextEditInfo {
  filepath: string;
  range: Range;
  fileContents: string;
  fileContentsBefore: string;
  editText: string;
  afterCursorPos: Position;
  beforeCursorPos: Position;
  workspaceDir: string;
}

export type SetCodeToEditPayload = RangeInFileWithContents | FileWithContents;

/**
 * Signature help represents the signature of something
 * callable. There can be multiple signatures but only one
 * active and only one active parameter.
 */
export class SignatureHelp {
  /**
   * One or more signatures.
   */
  signatures: SignatureInformation[];

  /**
   * The active signature.
   */
  activeSignature: number;

  /**
   * The active parameter of the active signature.
   */
  activeParameter: number;
}

/**
 * Represents the signature of something callable. A signature
 * can have a label, like a function-name, a doc-comment, and
 * a set of parameters.
 */
class SignatureInformation {
  /**
   * The label of this signature. Will be shown in
   * the UI.
   */
  label: string;

  /**
   * The parameters of this signature.
   */
  parameters: ParameterInformation[];

  /**
   * The index of the active parameter.
   *
   * If provided, this is used in place of {@linkcode SignatureHelp.activeParameter}.
   */
  activeParameter?: number;
}

/**
 * Represents a parameter of a callable-signature. A parameter can
 * have a label and a doc-comment.
 */
class ParameterInformation {
  /**
   * The label of this signature.
   *
   * Either a string or inclusive start and exclusive end offsets within its containing
   * {@link SignatureInformation.label signature label}. *Note*: A label of type string must be
   * a substring of its containing signature information's {@link SignatureInformation.label label}.
   */
  label: string | [number, number];
}

export interface ExperimentalConfig {
  /**
   * If enabled, will add the current file as context.
   */
  useCurrentFileAsContext?: boolean;

  /**
   * If enabled, static contextualization will be used to
   * gather context for the model where necessary.
   */
  enableStaticContextualization?: boolean;
}

export interface AnalyticsConfig {
  provider: string;
  url?: string;
  clientKey?: string;
}

export interface JSONModelDescription {
  title: string;
  provider: string;
  underlyingProviderName: string;
  model: string;
  apiKey?: string;
  apiBase?: string;

  contextLength?: number;
  maxStopWords?: number;
  template?: TemplateType;
  completionOptions?: BaseCompletionOptions;
  systemMessage?: string;
  requestOptions?: RequestOptions;
  cacheBehavior?: CacheBehavior;

  region?: string;
  profile?: string;
  apiType?: "openai" | "azure";
  apiVersion?: string;
  deployment?: string;
  projectId?: string;
  accountId?: string;
  aiGatewaySlug?: string;
  deploymentId?: string;
  isFromAutoDetect?: boolean;
}

// config.json
export interface SerializedContinueConfig {
  env?: string[];
  models: JSONModelDescription[];
  systemMessage?: string;
  completionOptions?: BaseCompletionOptions;
  requestOptions?: RequestOptions;
  userToken?: string;
  tabAutocompleteModel?: JSONModelDescription | JSONModelDescription[];
  tabAutocompleteOptions?: Partial<TabAutocompleteOptions>;
  experimental?: ExperimentalConfig;
  analytics?: AnalyticsConfig;
  docs?: never[];
  data?: DataDestination[];
}

export type ConfigMergeType = "merge" | "overwrite";

// config.ts - give users simplified interfaces
export interface Config {
  /** Each entry in this array will originally be a JSONModelDescription, the same object from your config.json, but you may add CustomLLMs.
   * A CustomLLM requires you only to define an AsyncGenerator that calls the LLM and yields string updates. You can choose to define either `streamCompletion` or `streamChat` (or both).
   * Continue will do the rest of the work to construct prompt templates, handle context items, prune context, etc.
   */
  models: (CustomLLM | JSONModelDescription)[];
  /** A system message to be followed by all of your models */
  systemMessage?: string;
  /** The default completion options for all models */
  completionOptions?: BaseCompletionOptions;
  /** Request options that will be applied to all models */
  requestOptions?: RequestOptions;
  /** An optional token to identify a user. Not used by Continue unless you write custom coniguration that requires such a token */
  userToken?: string;
  /** The model that Continue will use for tab autocompletions. */
  tabAutocompleteModel?:
    | CustomLLM
    | JSONModelDescription
    | (CustomLLM | JSONModelDescription)[];
  /** Options for tab autocomplete */
  tabAutocompleteOptions?: Partial<TabAutocompleteOptions>;
  /** Experimental configuration */
  experimental?: ExperimentalConfig;
  /** Analytics configuration */
  analytics?: AnalyticsConfig;
  docs?: never[];
  data?: DataDestination[];
}

// in the actual Continue source code
export interface ContinueConfig {
  // systemMessage?: string;
  completionOptions?: BaseCompletionOptions;
  requestOptions?: RequestOptions;
  userToken?: string;
  tabAutocompleteOptions?: Partial<TabAutocompleteOptions>;
  experimental?: ExperimentalConfig;
  analytics?: AnalyticsConfig;
  docs?: never[];
  rules: RuleWithSource[];
  modelsByRole: Partial<Record<ModelRole, ILLM[]>>;
  selectedModelByRole: Partial<Record<ModelRole, ILLM | null>>;
  data?: DataDestination[];
}

export interface BrowserSerializedContinueConfig {
  // systemMessage?: string;
  completionOptions?: BaseCompletionOptions;
  requestOptions?: RequestOptions;
  userToken?: string;
  experimental?: ExperimentalConfig;
  analytics?: AnalyticsConfig;
  docs?: never[];
  rules: RuleWithSource[];
  usePlatform: boolean;
  tabAutocompleteOptions?: Partial<TabAutocompleteOptions>;
  modelsByRole: Partial<Record<ModelRole, ModelDescription[]>>;
  selectedModelByRole: Partial<Record<ModelRole, ModelDescription | null>>;
}

export interface TerminalOptions {
  reuseTerminal?: boolean;
  terminalName?: string;
  waitForCompletion?: boolean;
}

type RuleSource =
  | "default-chat"
  | "default-plan"
  | "default-agent"
  | "model-options-chat"
  | "model-options-plan"
  | "model-options-agent"
  | "rules-block"
  | "colocated-markdown"
  | "json-systemMessage"
  | ".continuerules"
  | "agentFile";

export interface RuleMetadata {
  name?: string;
  slug?: string;
  source: RuleSource;
  globs?: string | string[];
  regex?: string | string[];
  description?: string;
  sourceFile?: string;
  alwaysApply?: boolean;
  invokable?: boolean;
}
export interface RuleWithSource extends RuleMetadata {
  rule: string;
}

export interface CompiledMessagesResult {
  compiledChatMessages: ChatMessage[];
  didPrune: boolean;
  contextPercentage: number;
}

export interface AddToChatPayload {
  data: AddToChatPayloadItem[];
}

interface AddToChatPayloadItem {
  type: "file" | "folder";
  fullPath: string;
  name: string;
}

export interface MessageOption {
  precompiled: boolean;
}

/* LSP-specific interfaces. */

// See https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#symbolKind.
// We shift this one index down to match vscode.SymbolKind.
enum SymbolKind {
  File = 0,
  Module = 1,
  Namespace = 2,
  Package = 3,
  Class = 4,
  Method = 5,
  Property = 6,
  Field = 7,
  Constructor = 8,
  Enum = 9,
  Interface = 10,
  Function = 11,
  Variable = 12,
  Constant = 13,
  String = 14,
  Number = 15,
  Boolean = 16,
  Array = 17,
  Object = 18,
  Key = 19,
  Null = 20,
  EnumMember = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

// See https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#symbolTag.
namespace SymbolTag {
  export const Deprecated: 1 = 1;
}

// See https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#symbolTag.
type SymbolTag = 1;

// See https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#documentSymbol.
export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  tags?: SymbolTag[];
  deprecated?: boolean;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}
