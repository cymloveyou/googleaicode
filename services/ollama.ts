import { OllamaModel } from '../types';

const cleanHost = (host: string) => {
  let cleaned = host.trim();
  // Replace Chinese colon
  cleaned = cleaned.replace(/：/g, ':');
  // Remove trailing slash
  cleaned = cleaned.replace(/\/$/, '');
  
  // Add http if missing (and not https)
  if (!/^https?:\/\//i.test(cleaned)) {
      cleaned = `http://${cleaned}`;
  }
  return cleaned;
};

export interface ConnectionResult {
  ok: boolean;
  errorType?: 'CORS' | 'NETWORK' | 'INVALID_URL';
}

export const checkConnection = async (host: string): Promise<ConnectionResult> => {
  try {
    const sanitized = cleanHost(host);
    // Validate URL before fetch
    try {
      new URL(sanitized);
    } catch {
      return { ok: false, errorType: 'INVALID_URL' };
    }
    
    const response = await fetch(`${sanitized}/api/tags`);
    
    if (response.ok) {
      return { ok: true };
    }

    if (response.status === 403) {
      return { ok: false, errorType: 'CORS' };
    }

    return { ok: false, errorType: 'NETWORK' };
  } catch (e) {
    return { ok: false, errorType: 'NETWORK' };
  }
};

export const fetchModels = async (host: string): Promise<OllamaModel[]> => {
  try {
    const sanitized = cleanHost(host);
    const response = await fetch(`${sanitized}/api/tags`);
    if (!response.ok) throw new Error('Failed to fetch tags');
    const data = await response.json();
    return data.models || [];
  } catch (e) {
    console.error("Failed to fetch models", e);
    return [];
  }
};

export const translateBatch = async (
  host: string,
  model: string,
  texts: string[]
): Promise<string[]> => {
  const prompt = `
    You are a professional subtitle translator. 
    Translate the following Japanese subtitle lines into Simplified Chinese.
    Do not output any explanations, notes, or line numbers. 
    Only output the translated text, line by line.
    Maintain the exact same number of lines as the input.
    
    Input:
    ${texts.join('\n---SPLIT---\n')}
  `;

  try {
    const sanitized = cleanHost(host);
    const response = await fetch(`${sanitized}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3
        }
      }),
    });

    if (!response.ok) throw new Error('Translation request failed');
    
    const data = await response.json();
    const rawOutput = data.response.trim();
    
    let translatedLines = rawOutput.split('---SPLIT---').map((s: string) => s.trim());
    
    if (translatedLines.length !== texts.length) {
        const altSplit = rawOutput.split('\n').filter((s: string) => s.trim().length > 0);
        if (altSplit.length === texts.length) {
            translatedLines = altSplit;
        } else {
            console.warn(`Mismatch in line count. Sent ${texts.length}, got ${translatedLines.length}. Returning originals for safety.`);
            return texts;
        }
    }

    return translatedLines;
  } catch (e) {
    console.error("Translation error", e);
    return texts;
  }
};