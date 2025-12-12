import { ConversationLogRecord } from './data-service';
import { DEFAULT_TIMEZONE, formatTimeInZone } from '../utils/date';

export function buildWorkingMemoryTimeline(logs: ConversationLogRecord[], userName?: string) {
  if (!logs.length) {
    return '';
  }

  return logs.map(log => formatWorkingLine(log, userName)).join('\n');
}

function formatWorkingLine(log: ConversationLogRecord, userName?: string) {
  const zone = log.timeZone || DEFAULT_TIMEZONE;
  const timeTxt = formatTimeInZone(log.timestamp, zone);
  const speaker = log.role === 'atri' ? 'ATRI' : (log.userName || userName || '你');
  return `[${timeTxt}] ${speaker}：${log.content}`;
}
