import { AgentType, AgentStatus, AgentExecutionStatus } from '.prisma/client'

// Base agent interface
export interface IAgent {
  id: string
  name: string
  description: string
  type: AgentType
  status: AgentStatus
  version: string
  config: Record<string, any>
  metadata: Record<string, any>
  isActive: boolean
  
  // Lifecycle methods
  initialize(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  cleanup(): Promise<void>
  
  // Core functionality
  execute(task: ITask): Promise<ITaskResult>
  handleMessage(message: IMessage): Promise<IMessage | void>
  getState(): Promise<IAgentState>
  setState(state: IAgentState): Promise<void>
}

// Agent configuration interface
export interface IAgentConfiguration {
  id: string
  name: string
  version: string
  config: Record<string, any>
  environment: string
  isActive: boolean
}

// Agent state interface
export interface IAgentState {
  id: string
  state: Record<string, any>
  context: Record<string, any>
  metadata: Record<string, any>
  lastUpdated: Date
}

// Agent execution interface
export interface IAgentExecution {
  id: string
  status: AgentExecutionStatus
  input: Record<string, any>
  output: Record<string, any>
  error?: string
  startTime?: Date
  endTime?: Date
  duration?: number
  metadata: Record<string, any>
}

// Task interface
export interface ITask {
  id: string
  type: string
  title: string
  description: string
  payload: Record<string, any>
  priority: TaskPriority
  status: TaskStatus
  assignedTo?: string
  createdBy: string
  createdAt: Date
  scheduledAt?: Date
  deadline?: Date
  dependencies?: string[]
  metadata: Record<string, any>
}

// Task result interface
export interface ITaskResult {
  taskId: string
  success: boolean
  output: Record<string, any>
  error?: string
  duration: number
  metadata: Record<string, any>
}

// Message interface for inter-agent communication
export interface IMessage {
  id: string
  type: MessageType
  from: string
  to: string | string[]
  subject: string
  content: Record<string, any>
  timestamp: Date
  priority: MessagePriority
  requiresResponse: boolean
  correlationId?: string
  metadata: Record<string, any>
}

// Agent message interface for CommunicationBus
export interface AgentMessage {
  id: string
  from: string
  to: string
  type: MessageType
  payload: any
  priority: MessagePriority
  timestamp: Date
  metadata: Record<string, any>
  requireResponse?: boolean
  timeout?: number
}

// Message types
export enum MessageType {
  COMMAND = 'command',
  REQUEST = 'request',
  RESPONSE = 'response',
  NOTIFICATION = 'notification',
  ERROR = 'error',
  STATUS_UPDATE = 'status_update',
  STATE_SYNC = 'state_sync',
  TASK_ASSIGNMENT = 'task_assignment',
  TASK_COMPLETION = 'task_completion'
}

// Message priorities
export enum MessagePriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

// Task priorities
export enum TaskPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Task statuses
export enum TaskStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout'
}

// Agent registry interface
export interface IAgentRegistry {
  registerAgentType(type: string, agentClass: new (...args: any[]) => IAgent): void
  getAgentType(type: string): new (...args: any[]) => IAgent | undefined
  getAllAgentTypes(): Map<string, new (...args: any[]) => IAgent>
  createAgent(type: string, config: IAgentConfiguration): Promise<IAgent>
  getAgent(id: string): IAgent | undefined
  getAllAgents(): Map<string, IAgent>
  destroyAgent(id: string): Promise<boolean>
}

// Communication bus interface
export interface ICommunicationBus {
  subscribe(agentId: string, handler: (message: IMessage) => Promise<void>): void
  unsubscribe(agentId: string): void
  send(message: IMessage): Promise<void>
  broadcast(message: IMessage, exclude?: string[]): Promise<void>
  request(target: string, message: IMessage, timeout?: number): Promise<IMessage>
}

// Task queue interface
export interface ITaskQueue {
  enqueue(task: ITask): Promise<void>
  dequeue(agentId?: string): Promise<ITask | null>
  complete(taskId: string, result: ITaskResult): Promise<void>
  fail(taskId: string, error: string): Promise<void>
  getTask(taskId: string): ITask | undefined
  getTasks(filter?: TaskFilter): ITask[]
  cancel(taskId: string): Promise<boolean>
  reassign(taskId: string, newAgentId: string): Promise<boolean>
}

// Task filter interface
export interface TaskFilter {
  status?: TaskStatus
  priority?: TaskPriority
  assignedTo?: string
  type?: string
  createdBy?: string
  deadlineBefore?: Date
  deadlineAfter?: Date
}

// State manager interface
export interface IStateManager {
  saveState(agentId: string, state: IAgentState): Promise<void>
  loadState(agentId: string): Promise<IAgentState | null>
  deleteState(agentId: string): Promise<boolean>
  getLatestState(agentId: string): Promise<IAgentState | null>
  getStateHistory(agentId: string, limit?: number): Promise<IAgentState[]>
}

// Monitoring interface
export interface IMonitoringService {
  recordMetric(agentId: string, metric: IMetric): Promise<void>
  getMetrics(agentId: string, filter?: MetricFilter): Promise<IMetric[]>
  getAgentStats(agentId: string): Promise<IAgentStats>
  getSystemStats(): Promise<ISystemStats>
  createAlert(alert: IAlert): Promise<void>
  getAlerts(agentId?: string): Promise<IAlert[]>
}

// Metric interface
export interface IMetric {
  id: string
  agentId: string
  type: MetricType
  name: string
  value: number
  unit?: string
  timestamp: Date
  metadata: Record<string, any>
}

// Metric types
export enum MetricType {
  CPU_USAGE = 'cpu_usage',
  MEMORY_USAGE = 'memory_usage',
  RESPONSE_TIME = 'response_time',
  ERROR_RATE = 'error_rate',
  THROUGHPUT = 'throughput',
  TASK_COUNT = 'task_count',
  CUSTOM = 'custom'
}

// Metric filter interface
export interface MetricFilter {
  type?: MetricType
  startTime?: Date
  endTime?: Date
}

// Agent stats interface
export interface IAgentStats {
  agentId: string
  totalTasks: number
  completedTasks: number
  failedTasks: number
  averageResponseTime: number
  uptime: number
  errorRate: number
  lastActivity: Date
}

// System stats interface
export interface ISystemStats {
  totalAgents: number
  activeAgents: number
  totalTasks: number
  completedTasks: number
  failedTasks: number
  averageResponseTime: number
  systemUptime: number
}

// Alert interface
export interface IAlert {
  id: string
  agentId?: string
  type: AlertType
  severity: AlertSeverity
  message: string
  timestamp: Date
  resolved: boolean
  resolvedAt?: Date
  metadata: Record<string, any>
}

// Alert types
export enum AlertType {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
  PERFORMANCE = 'performance',
  SECURITY = 'security'
}

// Alert severity levels
export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Error handling interface
export interface IErrorHandler {
  handleError(error: Error, context: ErrorContext): Promise<void>
  createErrorLog(error: Error, context: ErrorContext): Promise<IErrorLog>
  getErrorLogs(agentId?: string, filter?: ErrorFilter): Promise<IErrorLog[]>
  retryFailedTask(taskId: string): Promise<boolean>
}

// Error context interface
export interface ErrorContext {
  agentId: string
  taskId?: string
  operation: string
  metadata: Record<string, any>
}

// Error log interface
export interface IErrorLog {
  id: string
  agentId: string
  taskId?: string
  message: string
  stackTrace?: string
  severity: AlertSeverity
  context: Record<string, any>
  timestamp: Date
  resolved: boolean
  resolvedAt?: Date
}

// Error filter interface
export interface ErrorFilter {
  severity?: AlertSeverity
  startTime?: Date
  endTime?: Date
  resolved?: boolean
}

// Logger interface
export interface ILogger {
  info(message: string, meta?: Record<string, any>): void
  warn(message: string, meta?: Record<string, any>): void
  error(message: string, error?: Error, meta?: Record<string, any>): void
  debug(message: string, meta?: Record<string, any>): void
}

// Agent factory interface
export interface IAgentFactory {
  createAgent(type: string, config: IAgentConfiguration): Promise<IAgent>
  getSupportedAgentTypes(): string[]
  validateConfig(type: string, config: Record<string, any>): boolean
}