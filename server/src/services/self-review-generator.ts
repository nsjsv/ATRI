import { CHAT_MODEL, Env } from '../runtime/types';
import { sanitizeText } from '../utils/sanitize';
import { ChatCompletionError } from './openai-service';
import { callUpstreamChat } from './llm-service';
import { getEffectiveRuntimeSettings } from './runtime-settings';

export type AtriSelfReviewPayload = {
  "日期": string;
  "认识天数": number;
  "便签": string[];
};

export type AtriSelfReviewGenerationResult = {
  raw: string;
  payload: AtriSelfReviewPayload;
};

export async function generateAtriSelfReview(env: Env, params: {
  transcript: string;
  diaryContent: string;
  date: string;
  daysTogether: number;
  userName?: string;
  previousSelfReview?: string;
  modelKey?: string | null;
}): Promise<AtriSelfReviewGenerationResult> {
  const settings = await getEffectiveRuntimeSettings(env);
  const stickyNotePrompts: any = (settings.prompts as any).stickyNote || {};

  const transcript = sanitizeText(params.transcript || '').trim();
  const diary = sanitizeText(params.diaryContent || '').trim();
  const previous = sanitizeText(params.previousSelfReview || '').trim() || '(无旧便签)';

  if (!transcript && !diary) {
    throw new Error('empty_self_review_material');
  }

  const systemPrompt = String(stickyNotePrompts.system || '').trim();
  const userTemplate = String(stickyNotePrompts.userTemplate || '').trim();
  const userPrompt = userTemplate
    .replace(/\{date\}/g, params.date)
    .replace(/\{daysTogether\}/g, String(Math.max(1, Math.trunc(params.daysTogether || 1))))
    .replace(/\{userName\}/g, params.userName || '这个人')
    .replace(/\{previousSelfReview\}/g, previous)
    .replace(/\{transcript\}/g, transcript || '(无对话记录)')
    .replace(/\{diary\}/g, diary || '(无日记内容)');

  const apiUrl = String(settings.diaryApiUrl || settings.openaiApiUrl || '').trim();
  const apiKey = String(settings.diaryApiKey || settings.openaiApiKey || '').trim();
  const model = resolveSelfReviewModel(settings, params.modelKey);

  try {
    const result = await callUpstreamChat(env, {
      format: settings.diaryApiFormat,
      apiUrl,
      apiKey,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: settings.selfReviewTemperature,
      maxTokens: 1024,
      timeoutMs: 90000,
      anthropicVersion: settings.anthropicVersion
    });

    const content = result.message?.content;
    const rawText = typeof content === 'string' ? content : String(content || '');
    const trimmed = rawText.trim();
    const base = emptyPayload(params.date, params.daysTogether);

    if (!trimmed) {
      return { raw: JSON.stringify(base), payload: base };
    }

    const parsed = parseSelfReviewJson(trimmed);
    const payload = normalizeSelfReviewPayload(parsed, base);
    return { raw: JSON.stringify(payload), payload };
  } catch (error) {
    if (error instanceof ChatCompletionError) {
      throw error;
    }
    throw new Error('self_review_generation_failed');
  }
}

function resolveSelfReviewModel(settings: { diaryModel?: string; defaultChatModel?: string }, modelKey?: string | null) {
  const trimmed = typeof modelKey === 'string' ? modelKey.trim() : '';
  const configured = typeof settings.diaryModel === 'string' ? settings.diaryModel.trim() : '';
  const fallback = typeof settings.defaultChatModel === 'string' ? settings.defaultChatModel.trim() : '';
  return trimmed || configured || fallback || CHAT_MODEL;
}

function emptyPayload(date: string, daysTogether: number): AtriSelfReviewPayload {
  return {
    "日期": date,
    "认识天数": Math.max(1, Math.trunc(daysTogether || 1)),
    "便签": []
  };
}

function parseSelfReviewJson(raw: string): any {
  let text = (raw || '').trim();
  if (!text) return {};

  if (text.startsWith('```json')) {
    text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (text.startsWith('```')) {
    text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    const maybe = text.slice(start, end + 1);
    try {
      return JSON.parse(maybe);
    } catch (err) {
      console.warn('[ATRI] selfReview JSON parse failed', err);
    }
  }
  return {};
}

function normalizeSelfReviewPayload(input: any, base: AtriSelfReviewPayload): AtriSelfReviewPayload {
  const list = Array.isArray(input?.["便签"]) ? input["便签"] : [];
  const notes: string[] = [];
  for (const item of list) {
    const text = cleanCell(item, 40);
    if (!text) continue;
    notes.push(text);
    if (notes.length >= 3) break;
  }

  return {
    ...base,
    "便签": notes
  };
}

function cleanCell(value: any, limit: number) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
}
