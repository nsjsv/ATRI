import { Env } from '../types';
import {
  buildConversationTranscript,
  fetchConversationLogs,
  listPendingDiaryUsers,
  saveDiaryEntry,
  getLastConversationDate,
  calculateDaysBetween,
  getUserModelPreference,
  getUserProfile,
  saveUserProfile
} from '../services/data-service';
import { DEFAULT_TIMEZONE, formatDateInZone } from '../utils/date';
import { generateDiaryFromConversation } from '../services/diary-generator';
import { upsertDiaryMemory } from '../services/memory-service';
import { generateUserProfile } from '../services/profile-generator';

export async function runDiaryCron(env: Env, targetDate?: string) {
  const date = targetDate || formatDateInZone(Date.now(), DEFAULT_TIMEZONE);
  const pendingUsers = await listPendingDiaryUsers(env, date);
  if (!pendingUsers.length) {
    console.log('[ATRI] No diary tasks for', date);
    return;
  }

  for (const user of pendingUsers) {
    try {
      const logs = await fetchConversationLogs(env, user.userId, date);
      if (!logs.length) continue;
      const transcript = buildConversationTranscript(logs, user.userName || '你');

      const lastDate = await getLastConversationDate(env, user.userId, date);
      const daysSince = lastDate ? calculateDaysBetween(lastDate, date) : null;

      let preferredModel: string | null = null;
      try {
        preferredModel = await getUserModelPreference(env, user.userId);
      } catch (err) {
        console.warn('[ATRI] load user model preference failed', { userId: user.userId, err });
      }

      const diary = await generateDiaryFromConversation(env, {
        conversation: transcript,
        userName: user.userName || '这个人',
        daysSinceLastChat: daysSince,
        modelKey: preferredModel
      });
      const summaryText = diary.highlights.length
        ? diary.highlights.join('；')
        : diary.content;
      const savedEntry = await saveDiaryEntry(env, {
        userId: user.userId,
        date,
        content: diary.content,
        summary: summaryText,
        mood: diary.mood,
        status: 'ready'
      });

      await upsertDiaryMemory(env, {
        entryId: savedEntry.id,
        userId: user.userId,
        date,
        mood: diary.mood,
        content: diary.content,
        timestamp: diary.timestamp
      });

      // 生成并保存用户长期档案（事实/喜好/雷区/说话风格/关系进展）
      try {
        const previousProfile = await getUserProfile(env, user.userId);
        const profile = await generateUserProfile(env, {
          transcript,
          diaryContent: diary.content,
          date,
          userName: user.userName || '这个人',
          previousProfile: previousProfile?.content || '',
          modelKey: preferredModel
        });
        await saveUserProfile(env, { userId: user.userId, content: profile.raw });
      } catch (err) {
        console.warn('[ATRI] User profile update skipped', { userId: user.userId, date, err });
      }

      console.log('[ATRI] Diary auto generated for', user.userId, date);
    } catch (error) {
      console.error('[ATRI] Diary cron failed for user', user.userId, error);
      await saveDiaryEntry(env, {
        userId: user.userId,
        date,
        content: '自动日记生成失败，请稍后重试。',
        summary: '自动生成失败',
        mood: '异常',
        status: 'error'
      });
    }
  }
}
