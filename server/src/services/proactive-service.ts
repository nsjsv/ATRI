import { randomUUID } from 'node:crypto';
import { pushAppLog } from '../admin/log-buffer';
import { Env } from '../runtime/types';
import { formatDateInZone, formatTimeInZone } from '../utils/date';
import { sanitizeAssistantReply, sanitizeText } from '../utils/sanitize';
import { callUpstreamChat } from './llm-service';
import { sendNotification } from './notification-service';
import {
  ConversationLogRecord,
  fetchConversationLogsAfter,
  getProactiveUserState,
  getUserModelPreference,
  getUserProfile,
  getUserState,
  saveConversationLog,
  saveProactiveMessage,
  saveProactiveUserState
} from './data-service';
import type { EffectiveRuntimeSettings } from './runtime-settings';

export type ProactiveEvaluateParams = {
  userId: string;
  now?: number;
  userName?: string;
  timeZone?: string;
  settings: EffectiveRuntimeSettings;
};

export type ProactiveEvaluateResult = {
  triggered: boolean;
  reason: string;
  messageId?: string;
};

function getLocalHourInZone(ts: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date(ts));
  const hourRaw = parts.find((p) => p.type === 'hour')?.value || '0';
  const hour = Number(hourRaw);
  return Number.isFinite(hour) ? hour : 0;
}

function inQuietHours(localHour: number, startHour: number, endHour: number) {
  const h = Math.max(0, Math.min(23, Math.trunc(localHour)));
  const start = Math.max(0, Math.min(23, Math.trunc(startHour)));
  const end = Math.max(0, Math.min(23, Math.trunc(endHour)));
  if (start === end) return false;
  if (start < end) {
    return h >= start && h < end;
  }
  return h >= start || h < end;
}

function buildUserProfileSnippet(content: string) {
  const trimmed = String(content || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed);
    const lines: string[] = [];
    for (const key of ['事实', '喜好', '雷区', '说话风格', '关系进展']) {
      const list = Array.isArray(parsed?.[key]) ? parsed[key] : [];
      for (const item of list.slice(0, 2)) {
        const text = String(item || '').trim();
        if (text) lines.push(`${key}：${text}`);
      }
      if (lines.length >= 8) break;
    }
    return lines.slice(0, 8).map((line) => `- ${line}`).join('\n');
  } catch {
    return trimmed.slice(0, 500);
  }
}

function buildHistoryMessages(logs: ConversationLogRecord[]) {
  if (!logs.length) return [];
  return logs
    .map((log) => {
      const role = log.role === 'atri' ? 'assistant' : 'user';
      const zone = String(log.timeZone || '').trim() || 'Asia/Shanghai';
      const time = formatTimeInZone(log.timestamp, zone);
      const text = sanitizeText(log.content || '').trim();
      if (!text) return null;
      return { role, content: `[${time}] ${text}` };
    })
    .filter(Boolean) as Array<{ role: 'assistant' | 'user'; content: string }>;
}

function extractMessageText(message: any): string {
  if (!message) return '';
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          if (typeof part.text === 'string') return part.text;
          if (part.text && typeof part.text.value === 'string') return part.text.value;
          if (typeof part.content === 'string') return part.content;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(content ?? '');
}

function renderProactiveSystemPrompt(template: string, params: {
  now: number;
  timeZone: string;
  hoursSince: number;
  intimacy: number;
  profileSnippet: string;
}) {
  const clockTime = `${formatDateInZone(params.now, params.timeZone)} ${formatTimeInZone(params.now, params.timeZone)}`;
  return String(template || '')
    .replace(/\{clock_time\}/g, clockTime)
    .replace(/\{hours_since\}/g, String(params.hoursSince))
    .replace(/\{intimacy\}/g, String(params.intimacy))
    .replace(/\{user_profile_snippet\}/g, params.profileSnippet || '（暂无）');
}

async function runProactiveAgent(env: Env, params: {
  userId: string;
  now: number;
  timeZone: string;
  intimacy: number;
  hoursSince: number;
  settings: EffectiveRuntimeSettings;
}): Promise<string | null> {
  const model = (await getUserModelPreference(env, params.userId)) || params.settings.defaultChatModel;
  const profile = await getUserProfile(env, params.userId);
  const profileSnippet = buildUserProfileSnippet(profile?.content || '');
  const logs = await fetchConversationLogsAfter(env, {
    userId: params.userId,
    after: params.now - 48 * 3600000,
    limit: 120,
    roles: ['user', 'atri']
  });
  const historyMessages = buildHistoryMessages(logs);
  const proactivePrompt = String((params.settings.prompts as any)?.proactive?.system || '').trim();
  const fallbackPrompt = [
    '你是亚托莉。现在没有收到对方消息。',
    '如果你觉得该主动说话，就输出一句自然的话；',
    '如果不该打扰，就只输出 [SKIP]。',
    `当前时间：${formatDateInZone(params.now, params.timeZone)} ${formatTimeInZone(params.now, params.timeZone)}`,
    `距上次聊天：${params.hoursSince} 小时`,
    `亲密度：${params.intimacy}`,
    '关于对方：',
    profileSnippet || '（暂无）'
  ].join('\n');
  const systemPrompt = proactivePrompt
    ? renderProactiveSystemPrompt(proactivePrompt, {
      now: params.now,
      timeZone: params.timeZone,
      hoursSince: params.hoursSince,
      intimacy: params.intimacy,
      profileSnippet
    })
    : fallbackPrompt;

  const messages: any[] = [{ role: 'system', content: systemPrompt }];
  if (historyMessages.length) {
    messages.push({ role: 'system', content: '--- 最近两天对话 ---' });
    messages.push(...historyMessages);
  }
  messages.push({
    role: 'user',
    content: '请只输出你现在想发的一句话；如果不该打扰，请只输出 [SKIP]。'
  });

  const result = await callUpstreamChat(env, {
    format: params.settings.chatApiFormat,
    apiUrl: params.settings.openaiApiUrl,
    apiKey: params.settings.openaiApiKey,
    model,
    messages,
    temperature: params.settings.agentTemperature,
    maxTokens: 256,
    timeoutMs: 90000,
    trace: { scope: 'proactive', userId: params.userId }
  });

  const raw = extractMessageText(result.message).trim();
  if (!raw) return null;
  if (raw.toUpperCase().includes('[SKIP]')) return null;
  const reply = sanitizeAssistantReply(raw).trim();
  if (!reply) return null;
  return reply.slice(0, 600);
}

export async function evaluateProactiveForUser(env: Env, params: ProactiveEvaluateParams): Promise<ProactiveEvaluateResult> {
  const userId = String(params.userId || '').trim();
  if (!userId) return { triggered: false, reason: 'empty_user' };

  const settings = params.settings;
  if (!settings.proactiveEnabled) {
    return { triggered: false, reason: 'disabled' };
  }

  const now = Number.isFinite(Number(params.now)) ? Number(params.now) : Date.now();
  const timeZone = String(params.timeZone || settings.proactiveTimeZone || 'Asia/Shanghai').trim() || 'Asia/Shanghai';

  const userState = await getUserState(env, userId);
  const proactiveState = await getProactiveUserState(env, userId);
  const localHour = getLocalHourInZone(now, timeZone);
  if (inQuietHours(localHour, settings.proactiveQuietStartHour, settings.proactiveQuietEndHour)) {
    return { triggered: false, reason: 'quiet_hours' };
  }

  const today = formatDateInZone(now, timeZone);
  const dailyCount = proactiveState.dailyCountDate === today ? proactiveState.dailyCount : 0;
  if (dailyCount >= settings.proactiveMaxDaily) {
    return { triggered: false, reason: 'daily_limit' };
  }

  if (settings.proactiveCooldownHours > 0 && proactiveState.lastProactiveAt > 0) {
    const cooldownMs = settings.proactiveCooldownHours * 3600000;
    if (now - proactiveState.lastProactiveAt < cooldownMs) {
      return { triggered: false, reason: 'cooldown' };
    }
  }

  if (userState.intimacy < settings.proactiveIntimacyThreshold) {
    return { triggered: false, reason: 'intimacy_too_low' };
  }

  const recentActiveMs = settings.proactiveRecentActiveMinutes * 60000;
  if (userState.lastInteractionAt > 0 && now - userState.lastInteractionAt < recentActiveMs) {
    return { triggered: false, reason: 'recent_active' };
  }

  const hoursSince = userState.lastInteractionAt > 0
    ? Math.max(1, Math.floor((now - userState.lastInteractionAt) / 3600000))
    : 24;

  let proactiveReply = '';
  try {
    const generated = await runProactiveAgent(env, {
      userId,
      now,
      timeZone,
      intimacy: userState.intimacy,
      hoursSince,
      settings
    });
    proactiveReply = String(generated || '').trim();
  } catch (error: any) {
    pushAppLog('warn', 'proactive_agent_failed', {
      event: 'proactive_agent_failed',
      userId,
      error: String(error?.message || error)
    });
    return { triggered: false, reason: 'agent_failed' };
  }

  if (!proactiveReply) {
    return { triggered: false, reason: 'agent_skip' };
  }

  const messageId = randomUUID();
  const savedLog = await saveConversationLog(env, {
    id: messageId,
    userId,
    role: 'atri',
    content: proactiveReply,
    timestamp: now,
    userName: params.userName,
    timeZone
  });

  const notificationChannel = settings.proactiveNotificationChannel;
  const notifyResult = await sendNotification(env, {
    channel: notificationChannel,
    target: settings.proactiveNotificationTarget,
    content: proactiveReply,
    userId
  });

  const triggerContext = JSON.stringify({
    intimacy: userState.intimacy,
    hoursSince,
    localHour,
    timeZone,
    reason: 'scheduler'
  });

  await saveProactiveMessage(env, {
    id: `pm:${savedLog.id}`,
    userId,
    content: proactiveReply,
    triggerContext,
    status: 'pending',
    notificationChannel,
    notificationSent: notifyResult.sent,
    notificationError: notifyResult.error || null,
    createdAt: now,
    expiresAt: now + 72 * 3600000
  });

  await saveProactiveUserState(env, {
    userId,
    lastProactiveAt: now,
    dailyCount: dailyCount + 1,
    dailyCountDate: today,
    updatedAt: now
  });

  pushAppLog('info', 'proactive_message_created', {
    event: 'proactive_message_created',
    userId,
    messageId: savedLog.id,
    notificationSent: notifyResult.sent,
    notificationChannel,
    reason: notifyResult.error || 'ok'
  });

  return { triggered: true, reason: 'sent', messageId: savedLog.id };
}
