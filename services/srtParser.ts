import { SubtitleBlock } from '../types';

export const parseSRT = (content: string): SubtitleBlock[] => {
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split('\n\n');
  
  const parsedBlocks: SubtitleBlock[] = [];

  blocks.forEach((block) => {
    const lines = block.trim().split('\n');
    if (lines.length >= 3) {
      // Handle potential BOM or index anomalies
      const id = lines[0].trim();
      const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
      
      if (timeMatch) {
        const textLines = lines.slice(2);
        parsedBlocks.push({
          id,
          startTime: timeMatch[1],
          endTime: timeMatch[2],
          originalText: textLines.join('\n'),
          translatedText: ''
        });
      }
    }
  });

  return parsedBlocks;
};

export const generateSRT = (blocks: SubtitleBlock[]): string => {
  return blocks.map(block => {
    return `${block.id}\n${block.startTime} --> ${block.endTime}\n${block.translatedText || block.originalText}`;
  }).join('\n\n');
};