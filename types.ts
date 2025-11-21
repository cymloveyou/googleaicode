export interface SubtitleBlock {
  id: string;
  startTime: string;
  endTime: string;
  originalText: string;
  translatedText: string;
}

export interface TranslationStats {
  totalLines: number;
  processedLines: number;
  startTime: number | null;
  endTime: number | null;
  elapsedSeconds: number;
}

export enum AppState {
  CONFIG = 'CONFIG',
  UPLOAD = 'UPLOAD',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

export interface OllamaConfig {
  host: string;
  model: string;
}