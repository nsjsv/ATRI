import { initConfigHandlers, loadConfig } from './features/config.js';
import { initConversationHandlers } from './features/conversation.js';
import { createLogsController, initLogsHandlers } from './features/logs.js';
import { initOverviewHandlers, loadOverviewInfo } from './features/overview.js';
import { autoSyncPromptsIfEnabled, initPromptsHandlers, loadPrompts } from './features/prompts.js';
import { checkSession, initSessionHandlers } from './features/session.js';
import { initTabs, setTab } from './features/tabs.js';
import { initTheme } from './features/theme.js';
import { initToolsHandlers } from './features/tools.js';

async function loadAll() {
  await loadOverviewInfo();
  await loadConfig();
  await autoSyncPromptsIfEnabled();
  await loadPrompts();
}

async function main() {
  const logs = createLogsController();

  initTheme();
  initTabs();
  initOverviewHandlers();
  initConfigHandlers();
  initConversationHandlers();
  initPromptsHandlers();
  initToolsHandlers();
  initLogsHandlers(logs);

  initSessionHandlers({
    onLoginSuccess: async () => {
      setTab('config');
      await loadAll();
      await logs.load();
    },
    onLogout: async () => {
      logs.stop();
    }
  });

  const ok = await checkSession();
  if (ok) {
    await loadAll();
    await logs.load();
  }
}

main();
