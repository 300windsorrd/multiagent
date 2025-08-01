import { IAgentState } from './types'

export interface StateSnapshot {
  id: string
  agentId: string
  state: IAgentState
  version: number
  timestamp: Date
  checksum: string
  metadata: Record<string, any>
}