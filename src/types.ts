export type AssistantState = 
  | 'idle' 
  | 'connecting' 
  | 'listening' 
  | 'thinking' 
  | 'speaking' 
  | 'error';

export type AssistantMode = 'fast' | 'thinking';

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  modelUsed?: string;
  groundingSources?: GroundingSource[];
}

export interface AssistantSettings {
  language: 'my' | 'en';
  continuousMode: boolean;
  voiceVolume: number;
}
