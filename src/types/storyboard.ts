export interface Shot {
  id: string;
  shotNumber: number;
  shotType: string;
  actionDescription: string;
  cameraNote: string;
  frameDescription: string;
  imageUrl: string;
  order: number;
}

export interface Storyboard {
  id?: string;
  title: string;
  scene: string;
  style: string;
  shotCount: number;
  shots: Shot[];
  createdAt?: string;
  updatedAt?: string;
}

export interface GenerateRequest {
  scene: string;
  style: string;
  shotCount: number;
  apiKey: string;
}

export const SHOT_TYPES = [
  { value: 'WS', label: 'WS', full: 'Wide Shot' },
  { value: 'LS', label: 'LS', full: 'Long Shot' },
  { value: 'MS', label: 'MS', full: 'Medium Shot' },
  { value: 'MCU', label: 'MCU', full: 'Medium Close-Up' },
  { value: 'CU', label: 'CU', full: 'Close-Up' },
  { value: 'OTS', label: 'OTS', full: 'Over the Shoulder' },
  { value: 'POV', label: 'POV', full: 'Point of View' },
  { value: 'HA', label: 'HA', full: 'High Angle' },
  { value: 'LA', label: 'LA', full: 'Low Angle' },
  { value: 'TI', label: 'TI', full: 'Two Shot' },
] as const;

export const VISUAL_STYLES = [
  { value: 'Cinematic', label: 'Cinematic' },
  { value: 'Drama', label: 'Drama' },
  { value: 'Music Video', label: 'Music Video' },
  { value: 'Noir', label: 'Noir' },
  { value: 'Action', label: 'Action' },
  { value: 'Horror', label: 'Horror' },
] as const;
