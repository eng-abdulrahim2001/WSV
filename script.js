const topActions = document.getElementById("topActions");
const loadFolderBtn = document.getElementById("loadFolderBtn");
const loadFileBtn = document.getElementById("loadFileBtn");
const chatFileInput = document.getElementById("chatFileInput");
const chatFolderInput = document.getElementById("chatFolderInput");
const chatScreen = document.getElementById("chatScreen");
const conversationScreen = document.getElementById("conversationScreen");
const backToChatsBtn = document.getElementById("backToChatsBtn");
const chatListSearch = document.getElementById("chatListSearch");
const chatListEl = document.getElementById("chatList");
const chatCountLabel = document.getElementById("chatCountLabel");
const chatTitle = document.getElementById("chatTitle");
const chatSubtitle = document.getElementById("chatSubtitle");
const toggleToolsBtn = document.getElementById("toggleToolsBtn");
const conversationTools = document.querySelector(".conversation-tools");
const messageSearch = document.getElementById("messageSearch");
const runSearchBtn = document.getElementById("runSearchBtn");
const searchPrevBtn = document.getElementById("searchPrevBtn");
const searchNextBtn = document.getElementById("searchNextBtn");
const searchNavLabel = document.getElementById("searchNavLabel");
const starOnlyToggle = document.getElementById("starOnlyToggle");
const toggleStarredListBtn = document.getElementById("toggleStarredListBtn");
const starredPanel = document.getElementById("starredPanel");
const starredPanelCount = document.getElementById("starredPanelCount");
const starredList = document.getElementById("starredList");
const toggleSelectModeBtn = document.getElementById("toggleSelectModeBtn");
const copySelectedBtn = document.getElementById("copySelectedBtn");
const selectedCountLabel = document.getElementById("selectedCountLabel");
const clearMessageSearchBtn = document.getElementById("clearMessageSearchBtn");
const dateFilterInput = document.getElementById("dateFilterInput");
const goToDateBtn = document.getElementById("goToDateBtn");
const messageList = document.getElementById("messageList");
const messageStats = document.getElementById("messageStats");
const starStats = document.getElementById("starStats");

const MESSAGE_START_PATTERN =
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2}(?:\s?[APMapm]{2})?)\s-\s(.+?)$/;

const HAS_FUSE = typeof window.Fuse === "function";
const STAR_STORE_KEY = "wa-stars-json-v1";

const state = {
  chats: [],
  chatSearchEngine: null,
  activeChatId: null,
  mobileScreen: "chats",
  toolsVisible: false,
  selectionMode: false,
  starredPanelOpen: false,
  selectedByChat: new Map(),
  filteredMessages: [],
  visibleMessages: [],
  rowById: new Map(),
  autoLoadTicking: false,
  paging: {
    chunkSize: 300,
    loadedCount: 300,
    openAtBottom: true,
  },
  searchNav: {
    query: "",
    currentIndex: -1,
    chatId: null,
    matchedMessageIds: [],
    focusedMessageId: null,
  },
};

backToChatsBtn.addEventListener("click", showChatListScreen);
if (loadFolderBtn) {
  loadFolderBtn.addEventListener("click", () => chatFolderInput?.click());
}
if (loadFileBtn) {
  loadFileBtn.addEventListener("click", () => chatFileInput?.click());
}
if (chatFolderInput) {
  chatFolderInput.addEventListener("change", onFolderFilesChosen);
}
if (chatFileInput) {
  chatFileInput.addEventListener("change", onSingleFileChosen);
}
chatListSearch.addEventListener("input", renderChatList);
messageSearch.addEventListener("keydown", onMessageSearchKeydown);
runSearchBtn.addEventListener("click", executeSearch);
searchPrevBtn.addEventListener("click", () => navigateSearch(-1));
searchNextBtn.addEventListener("click", () => navigateSearch(1));
toggleToolsBtn?.addEventListener("click", toggleToolsPanel);
toggleStarredListBtn.addEventListener("click", toggleStarredPanel);
goToDateBtn.addEventListener("click", goToDate);
dateFilterInput.addEventListener("keydown", (e) => { if (e.key === "Enter") goToDate(); });
toggleSelectModeBtn.addEventListener("click", toggleSelectionMode);
copySelectedBtn.addEventListener("click", copySelectedMessages);
starOnlyToggle.addEventListener("change", renderMessages);
messageList.addEventListener("scroll", onMessageListScroll);
messageList.addEventListener("click", onMessageListClick);
clearMessageSearchBtn.addEventListener("click", () => {
  messageSearch.value = "";
  starOnlyToggle.checked = false;
  clearSelectionForActiveChat();
  resetSearchNavigation();
  clearFocusedMessage();
  updateSearchNavUI();
  renderMessages();
});

init();

async function init() {
  setManualModeUI();
  renderToolsPanel();
  chatSubtitle.textContent = "Use Folder or File to load chats from your device.";
  renderChatList();
  renderMessages();
  syncScreenForViewport();
}

function setManualModeUI() {
  if (!topActions) return;
  topActions.hidden = false;
}

async function onFolderFilesChosen(event) {
  const files = [...(event.target.files || [])].filter((file) => /\.txt$/i.test(file.name));
  if (!files.length) return;

  const loaded = [];
  for (const file of files) {
    const text = await file.text();
    loaded.push(buildChatModel(file.name, text));
  }
  setChats(loaded);
}

async function onSingleFileChosen(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  setChats([buildChatModel(file.name, text)]);
}

function setChats(chatList) {
  state.chats = chatList
    .filter((chat) => chat.messages.length > 0)
    .sort((a, b) => b.messages.length - a.messages.length);
  state.chatSearchEngine = buildChatListSearchEngine(state.chats);
  state.activeChatId = state.chats[0]?.id || null;
  resetPaging();
  resetSearchNavigation();
  renderChatList();
  renderMessages();
  state.mobileScreen = state.activeChatId ? "conversation" : "chats";
  syncScreenForViewport();
}

function toggleToolsPanel() {
  state.toolsVisible = !state.toolsVisible;
  renderToolsPanel();
}

function renderToolsPanel() {
  if (!conversationTools || !toggleToolsBtn) return;
  conversationTools.hidden = !state.toolsVisible;
  toggleToolsBtn.textContent = state.toolsVisible ? "Hide Actions" : "Show Actions";
}

function buildChatModel(fileName, text) {
  const messages = normalizeMessageOrder(parseWhatsAppExport(text));
  const chatName = inferChatName(fileName, messages);
  const localUser = detectLocalUser(messages);
  const lastMsg = messages[messages.length - 1];
  const normalizedMessages = messages.map((msg) => ({
    ...msg,
    baseHtml: renderRichText(escapeHTML(msg.message || "")),
    searchText: `${msg.sender} ${msg.date} ${msg.time} ${msg.message}`.toLowerCase(),
  }));
  const messageById = new Map(normalizedMessages.map((msg) => [msg.id, msg]));
  const searchEngine = buildMessageSearchEngine(normalizedMessages);
  return {
    id: fileName,
    fileName,
    chatName,
    localUser,
    messages: normalizedMessages,
    messageById,
    searchEngine,
    lastPreview: lastMsg ? compressInline(lastMsg.message) : "",
    lastTime: lastMsg ? `${lastMsg.date} ${lastMsg.time}` : "",
  };
}

function renderChatList() {
  const q = chatListSearch.value.trim().toLowerCase();
  const source = q ? searchChatsWithLibrary(q) : state.chats;

  chatCountLabel.textContent = `Chats: ${source.length}`;

  if (!source.length) {
    chatListEl.innerHTML = `<div class="empty-chats">No matching chats.</div>`;
    return;
  }

  chatListEl.innerHTML = source.map((chat) => renderChatRow(chat)).join("");
  for (const row of chatListEl.querySelectorAll(".chat-row")) {
    row.addEventListener("click", () => {
      state.activeChatId = row.dataset.chatId || null;
      resetPaging();
      renderChatList();
      renderMessages();
      state.mobileScreen = "conversation";
      showConversationScreen();
    });
  }
}

function renderChatRow(chat) {
  const active = chat.id === state.activeChatId;
  const stars = loadStarSet(chat.id).size;
  return `
    <article class="chat-row ${active ? "active" : ""}" data-chat-id="${escapeHTML(chat.id)}">
      <div class="chat-avatar">${initials(chat.chatName)}</div>
      <div class="chat-row-main">
        <div class="chat-row-top">
          <div class="chat-row-name">${escapeHTML(chat.chatName)}</div>
          <div class="chat-row-time">${escapeHTML(chat.lastTime || "")}</div>
        </div>
        <div class="chat-row-preview">${renderRichText(escapeHTML(chat.lastPreview || ""))}</div>
      </div>
      <div>${stars ? `<div class="chat-row-badge">${stars}</div>` : ""}</div>
    </article>
  `;
}

function renderMessages() {
  const chat = getActiveChat();
  if (!chat) {
    chatTitle.textContent = "";
    chatSubtitle.textContent = "";
    messageStats.textContent = "Messages: 0";
    starStats.textContent = "Starred: 0";
    messageList.innerHTML = "";
    state.filteredMessages = [];
    state.visibleMessages = [];
    state.rowById = new Map();
    resetSearchNavigation();
    updateSearchNavUI();
    renderSelectionUI();
    renderStarredPanel();
    if (toggleToolsBtn) toggleToolsBtn.disabled = true;
    return;
  }

  if (toggleToolsBtn) toggleToolsBtn.disabled = false;

  chatTitle.textContent = chat.chatName;
  chatSubtitle.textContent = `${chat.messages.length} messages - stars auto-saved for this TXT`;

  const onlyStarred = starOnlyToggle.checked;
  const stars = loadStarSet(chat.id);

  const filtered = onlyStarred ? chat.messages.filter((msg) => stars.has(msg.id)) : chat.messages;
  state.filteredMessages = filtered;
  applyPaging(filtered.length);
  const startIndex = Math.max(0, filtered.length - state.paging.loadedCount);
  state.visibleMessages = filtered.slice(startIndex);

  messageStats.textContent = `Messages: ${state.visibleMessages.length} / ${filtered.length}`;
  starStats.textContent = `Starred: ${stars.size}`;

  if (!state.visibleMessages.length) {
    messageList.innerHTML = `<div class="empty-state"><p>No messages matched your filter.</p></div>`;
    state.rowById = new Map();
    resetSearchNavigation();
    updateSearchNavUI();
    return;
  }

  let lastDate = "";
  const html = [];
  for (const msg of state.visibleMessages) {
    if (msg.date !== lastDate) {
      html.push(`<div class="date-sep">${escapeHTML(msg.date)}</div>`);
      lastDate = msg.date;
    }
    html.push(renderMessageRow(chat, msg, stars.has(msg.id)));
  }

  messageList.innerHTML = html.join("");
  wireStarButtons(chat.id);
  cacheRowNodes();
  applySearchNavigation(chat.id);
  renderStarredPanel();
  if (!messageSearch.value.trim() && state.paging.openAtBottom) {
    messageList.scrollTop = messageList.scrollHeight;
    state.paging.openAtBottom = false;
  }
}

function renderMessageRow(chat, msg, isStarred) {
  const direction = chat.localUser && msg.sender === chat.localUser ? "out" : "in";
  const sender = escapeHTML(msg.sender);
  const enriched = msg.baseHtml;
  const system = msg.sender === "System";
  const selectedSet = getSelectedSet(chat.id);
  const isSelected = selectedSet.has(msg.id);
  const selectAction = state.selectionMode
    ? `<button class="select-btn ${isSelected ? "active" : ""}" data-message-id="${msg.id}">${isSelected ? "Selected" : "Select"}</button>`
    : "";

  return `
    <article class="msg-row ${direction} ${isSelected ? "selected" : ""}" data-message-id="${msg.id}">
      <div class="msg-bubble">
        ${system ? "" : `<div class="msg-sender">${sender}</div>`}
        <div class="msg-text">${enriched}</div>
        <div class="msg-meta">
          ${selectAction}
          ${isStarred ? `<span class="star-pill">STARRED</span>` : ""}
          <span>${escapeHTML(msg.time)}</span>
          <button class="star-btn ${isStarred ? "active" : ""}" data-message-id="${msg.id}">
            ${isStarred ? "Unstar" : "Star"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function wireStarButtons(chatId) {
  void chatId;
  renderSelectionUI();
}

function getActiveChat() {
  return state.chats.find((chat) => chat.id === state.activeChatId) || null;
}

function parseWhatsAppExport(rawText) {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");
  const parsed = [];
  let current = null;

  for (const line of lines) {
    if (!line.trim() && current) {
      current.message += "\n";
      continue;
    }

    const match = line.match(MESSAGE_START_PATTERN);
    if (match) {
      const [, date, time, rest] = match;
      const senderSplit = rest.indexOf(": ");
      let sender = "System";
      let message = rest;
      if (senderSplit > -1) {
        sender = rest.slice(0, senderSplit).trim();
        message = rest.slice(senderSplit + 2);
      }
      current = {
        id: parsed.length + 1,
        date,
        time,
        sender,
        message,
      };
      parsed.push(current);
      continue;
    }

    if (current) {
      current.message += `\n${line}`;
    }
  }

  return parsed;
}

function normalizeMessageOrder(messages) {
  if (!Array.isArray(messages) || messages.length < 2) return messages;
  const firstTs = getMessageTimestamp(messages[0]);
  const lastTs = getMessageTimestamp(messages[messages.length - 1]);
  if (firstTs == null || lastTs == null) return messages;
  // Keep chronological order (oldest -> newest) so latest messages stay at bottom.
  if (firstTs <= lastTs) return messages;
  return [...messages].reverse();
}

function getMessageTimestamp(msg) {
  if (!msg || !msg.date || !msg.time) return null;
  const dateMatch = String(msg.date).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!dateMatch) return null;
  const month = Number(dateMatch[1]);
  const day = Number(dateMatch[2]);
  const yearRaw = Number(dateMatch[3]);
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;

  const timeMatch = String(msg.time).trim().match(/^(\d{1,2}):(\d{2})(?:\s*([APMapm]{2}))?$/);
  if (!timeMatch) return null;
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const meridiem = timeMatch[3] ? timeMatch[3].toLowerCase() : "";

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return new Date(year, month - 1, day, hour, minute).getTime();
}

function detectLocalUser(messages) {
  const senders = new Map();
  for (const msg of messages) {
    if (msg.sender === "System") continue;
    senders.set(msg.sender, (senders.get(msg.sender) || 0) + 1);
  }
  const ranked = [...senders.entries()].sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] || "";
}

function inferChatName(fileName, messages) {
  const cleaned = fileName
    .replace(/^WhatsApp Chat with\s*/i, "")
    .replace(/-Full/i, "")
    .replace(/\.txt$/i, "")
    .trim();
  if (cleaned) return cleaned;

  const names = new Set(messages.map((m) => m.sender).filter((s) => s && s !== "System"));
  if (names.size === 1) return [...names][0];
  return "WhatsApp Chat";
}

function loadStarSet(chatId) {
  const store = readStarStore();
  const fromJsonStore = store[chatId];
  if (Array.isArray(fromJsonStore)) {
    return new Set(fromJsonStore.filter((id) => Number.isInteger(id)));
  }

  // One-time migration from old per-chat keys.
  const legacyKey = `wa-stars:${chatId}`;
  const raw = localStorage.getItem(legacyKey);
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    const normalized = Array.isArray(arr) ? arr.filter((id) => Number.isInteger(id)) : [];
    store[chatId] = normalized;
    writeStarStore(store);
    localStorage.removeItem(legacyKey);
    return new Set(normalized);
  } catch {
    return new Set();
  }
}

function saveStarSet(chatId, set) {
  const store = readStarStore();
  store[chatId] = [...set].filter((id) => Number.isInteger(id)).sort((a, b) => a - b);
  writeStarStore(store);
}

function toggleStar(chatId, messageId) {
  const stars = loadStarSet(chatId);
  if (stars.has(messageId)) {
    stars.delete(messageId);
  } else {
    stars.add(messageId);
  }
  saveStarSet(chatId, stars);
  renderStarredPanel();
}

function readStarStore() {
  const raw = localStorage.getItem(STAR_STORE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStarStore(store) {
  localStorage.setItem(STAR_STORE_KEY, JSON.stringify(store));
}

function renderRichText(safeText) {
  let text = safeText;
  text = text.replace(/&lt;Media omitted&gt;/gi, "<em>[Media omitted]</em>");
  text = text.replace(/(https?:\/\/[^\s<]+)/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  return text;
}

function highlightQuery(htmlSafe, query) {
  if (!query) return htmlSafe;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "ig");
  return htmlSafe.replace(regex, "<mark>$1</mark>");
}

function onMessageSearchKeydown(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  executeSearch();
}

function executeSearch() {
  const chat = getActiveChat();
  if (!chat) return;
  const query = messageSearch.value.trim().toLowerCase();
  if (query !== state.searchNav.query) {
    state.searchNav.currentIndex = 0;
  }
  state.searchNav.query = query;
  applySearchNavigation(chat.id);
}

function navigateSearch(step) {
  const query = messageSearch.value.trim().toLowerCase();
  if (!query) return;

  const total = state.searchNav.matchedMessageIds.length;
  if (!total) return;

  if (state.searchNav.query !== query) {
    state.searchNav.query = query;
    state.searchNav.currentIndex = 0;
  } else {
    const next = (state.searchNav.currentIndex + step + total) % total;
    state.searchNav.currentIndex = next;
  }

  focusCurrentSearchMatch(true);
}

function applySearchNavigation(chatId) {
  const chat = getActiveChat();
  if (!chat) return;

  const query = messageSearch.value.trim().toLowerCase();
  state.searchNav.query = query;
  state.searchNav.chatId = chatId;

  if (!query) {
    clearFocusedMessage();
    state.searchNav.matchedMessageIds = [];
    state.searchNav.currentIndex = -1;
    updateSearchNavUI();
    return;
  }

  const matchedMessageIds = searchMessagesWithLibrary(chat, query, state.filteredMessages);

  state.searchNav.matchedMessageIds = matchedMessageIds;
  if (!matchedMessageIds.length) {
    clearFocusedMessage();
    state.searchNav.currentIndex = -1;
    updateSearchNavUI();
    return;
  }

  if (state.searchNav.currentIndex < 0 || state.searchNav.currentIndex >= matchedMessageIds.length) {
    state.searchNav.currentIndex = 0;
  }

  focusCurrentSearchMatch(true);
}

function focusCurrentSearchMatch(scrollIntoView) {
  const query = state.searchNav.query;
  const total = state.searchNav.matchedMessageIds.length;
  if (!total || state.searchNav.currentIndex < 0) {
    clearFocusedMessage();
    updateSearchNavUI();
    return;
  }

  clearFocusedMessage();

  const messageId = state.searchNav.matchedMessageIds[state.searchNav.currentIndex];
  let row = state.rowById.get(messageId);
  const chat = getActiveChat();
  if (!row && ensureMessageVisible(messageId)) {
    row = state.rowById.get(messageId);
  }
  if (!row || !chat) {
    updateSearchNavUI();
    return;
  }

  row.classList.add("search-focus");
  const msgText = row.querySelector(".msg-text");
  const msg = chat.messageById.get(messageId);
  if (msgText && msg) {
    msgText.innerHTML = highlightQuery(msg.baseHtml, query);
  }

  state.searchNav.focusedMessageId = messageId;
  if (scrollIntoView) row.scrollIntoView({ block: "center", behavior: "smooth" });
  updateSearchNavUI();
}

function updateSearchNavUI() {
  const total = state.searchNav.matchedMessageIds.length;
  if (!total || state.searchNav.currentIndex < 0) {
    searchNavLabel.textContent = "0 / 0";
    searchPrevBtn.disabled = true;
    searchNextBtn.disabled = true;
    return;
  }

  searchNavLabel.textContent = `${state.searchNav.currentIndex + 1} / ${total}`;
  searchPrevBtn.disabled = false;
  searchNextBtn.disabled = false;
}

function resetSearchNavigation() {
  state.searchNav.query = "";
  state.searchNav.currentIndex = -1;
  state.searchNav.chatId = null;
  state.searchNav.matchedMessageIds = [];
  state.searchNav.focusedMessageId = null;
}

function clearFocusedMessage() {
  const chat = getActiveChat();
  if (!chat) return;
  const messageId = state.searchNav.focusedMessageId;
  if (!messageId) return;
  const row = state.rowById.get(messageId);
  if (!row) return;
  row.classList.remove("search-focus");
  const msgText = row.querySelector(".msg-text");
  const msg = chat.messageById.get(messageId);
  if (msgText && msg) msgText.innerHTML = msg.baseHtml;
  state.searchNav.focusedMessageId = null;
}

function cacheRowNodes() {
  const map = new Map();
  for (const row of messageList.querySelectorAll(".msg-row")) {
    const id = Number(row.dataset.messageId);
    if (Number.isFinite(id)) map.set(id, row);
  }
  state.rowById = map;
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 899px)").matches;
}

function showConversationScreen() {
  if (!isMobileLayout()) return;
  state.mobileScreen = "conversation";
  chatScreen.classList.remove("active");
  conversationScreen.classList.add("active");
}

function showChatListScreen() {
  if (!isMobileLayout()) return;
  state.mobileScreen = "chats";
  conversationScreen.classList.remove("active");
  chatScreen.classList.add("active");
}

function syncScreenForViewport() {
  if (isMobileLayout()) {
    if (state.mobileScreen === "conversation" && state.activeChatId) {
      showConversationScreen();
    } else {
      showChatListScreen();
    }
    return;
  }
  chatScreen.classList.add("active");
  conversationScreen.classList.add("active");
}

window.addEventListener("resize", syncScreenForViewport);

function resetPaging() {
  state.paging.loadedCount = state.paging.chunkSize;
  state.paging.openAtBottom = true;
}

function applyPaging(totalCount) {
  if (totalCount <= 0) {
    state.paging.loadedCount = state.paging.chunkSize;
    return;
  }
  if (state.paging.loadedCount > totalCount) {
    state.paging.loadedCount = totalCount;
  }
  if (state.paging.loadedCount < state.paging.chunkSize) {
    state.paging.loadedCount = state.paging.chunkSize;
  }
}

function onMessageListScroll() {
  if (state.autoLoadTicking) return;
  state.autoLoadTicking = true;
  requestAnimationFrame(() => {
    maybeAutoLoadNextChunk();
    state.autoLoadTicking = false;
  });
}

function maybeAutoLoadNextChunk() {
  const total = state.filteredMessages.length;
  if (state.visibleMessages.length >= total) return;

  // Load older messages when user scrolls near top.
  if (messageList.scrollTop > 220) return;

  const previousHeight = messageList.scrollHeight;
  state.paging.loadedCount = Math.min(total, state.paging.loadedCount + state.paging.chunkSize);
  renderMessages();
  // Keep viewport anchored to current content after prepending older rows.
  const heightDiff = messageList.scrollHeight - previousHeight;
  messageList.scrollTop = messageList.scrollTop + heightDiff;
}

function getSelectedSet(chatId) {
  if (!state.selectedByChat.has(chatId)) {
    state.selectedByChat.set(chatId, new Set());
  }
  return state.selectedByChat.get(chatId);
}

function toggleMessageSelection(chatId, messageId) {
  const selected = getSelectedSet(chatId);
  if (selected.has(messageId)) {
    selected.delete(messageId);
    return false;
  }
  selected.add(messageId);
  return true;
}

function onMessageListClick(event) {
  const starButton = event.target.closest(".star-btn");
  if (starButton) {
    const chat = getActiveChat();
    if (!chat) return;
    const messageId = Number(starButton.dataset.messageId);
    if (!Number.isFinite(messageId)) return;
    toggleStar(chat.id, messageId);
    renderMessages();
    renderChatList();
    return;
  }

  const selectButton = event.target.closest(".select-btn");
  if (!selectButton || !state.selectionMode) return;
  const chat = getActiveChat();
  if (!chat) return;
  const messageId = Number(selectButton.dataset.messageId);
  if (!Number.isFinite(messageId)) return;

  const isNowSelected = toggleMessageSelection(chat.id, messageId);
  const row = selectButton.closest(".msg-row");
  if (row) {
    row.classList.toggle("selected", isNowSelected);
  }
  selectButton.classList.toggle("active", isNowSelected);
  selectButton.textContent = isNowSelected ? "Selected" : "Select";
  renderSelectionUI();
}

function toggleSelectionMode() {
  state.selectionMode = !state.selectionMode;
  renderSelectionUI();
  renderMessages();
}

function renderSelectionUI() {
  const chat = getActiveChat();
  const selectedCount = chat ? getSelectedSet(chat.id).size : 0;
  selectedCountLabel.textContent = `Selected: ${selectedCount}`;
  toggleSelectModeBtn.textContent = state.selectionMode ? "Done" : "Select";
  copySelectedBtn.disabled = !chat || selectedCount === 0;
}

function toggleStarredPanel() {
  state.starredPanelOpen = !state.starredPanelOpen;
  renderStarredPanel();
}

function renderStarredPanel() {
  const chat = getActiveChat();
  if (!state.starredPanelOpen || !chat) {
    starredPanel.hidden = true;
    toggleStarredListBtn.textContent = "Starred List";
    return;
  }

  const stars = [...loadStarSet(chat.id)].sort((a, b) => a - b);
  starredPanel.hidden = false;
  toggleStarredListBtn.textContent = "Hide Starred";
  starredPanelCount.textContent = `${stars.length}`;

  if (!stars.length) {
    starredList.innerHTML = `<p class="empty-state">No starred messages.</p>`;
    return;
  }

  starredList.innerHTML = stars
    .map((id) => {
      const msg = chat.messageById.get(id);
      if (!msg) return "";
      const meta = escapeHTML(`${msg.date}, ${msg.time} - ${msg.sender}`);
      const preview = escapeHTML(compressInline(msg.message).slice(0, 120));
      return `
        <article class="starred-item">
          <div class="starred-item-text">
            <div class="starred-item-meta">${meta}</div>
            <div class="starred-item-preview">${preview}</div>
          </div>
          <button class="go-btn" data-starred-id="${id}">Go</button>
        </article>
      `;
    })
    .join("");

  for (const button of starredList.querySelectorAll(".go-btn")) {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.starredId);
      if (!Number.isFinite(id)) return;
      jumpToMessageById(id);
    });
  }
}

function clearSelectionForActiveChat() {
  const chat = getActiveChat();
  if (!chat) return;
  const selected = getSelectedSet(chat.id);
  if (selected.size === 0) return;
  selected.clear();
}

async function copySelectedMessages() {
  const chat = getActiveChat();
  if (!chat) return;
  const selected = getSelectedSet(chat.id);
  if (!selected.size) return;

  const selectedMessages = chat.messages.filter((msg) => selected.has(msg.id));
  if (!selectedMessages.length) return;

  const text = selectedMessages
    .map((msg) => `${msg.date}, ${msg.time} - ${msg.sender}: ${msg.message}`)
    .join("\n\n");

  const success = await writeClipboard(text);
  if (success) {
    copySelectedBtn.textContent = "Copied";
    setTimeout(() => {
      copySelectedBtn.textContent = "Copy Selected";
    }, 1200);
  }
}

function jumpToMessageById(messageId) {
  const chat = getActiveChat();
  if (!chat) return;
  if (!chat.messageById.has(messageId)) return;
  clearFocusedMessage();
  if (!ensureMessageVisible(messageId)) return;
  const row = state.rowById.get(messageId);
  if (!row) return;
  row.classList.add("search-focus");
  state.searchNav.focusedMessageId = messageId;
  row.scrollIntoView({ block: "center", behavior: "smooth" });
}

function goToDate() {
  const chat = getActiveChat();
  if (!chat) return;
  const raw = dateFilterInput.value;
  if (!raw) return;

  const [year, month, day] = raw.split("-");
  const targetShort = `${parseInt(month, 10)}/${parseInt(day, 10)}/${year.slice(-2)}`;
  const targetFull = `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}`;

  const match = state.filteredMessages.find(
    (msg) => msg.date === targetShort || msg.date === targetFull
  );

  if (!match) {
    goToDateBtn.textContent = "Not found";
    setTimeout(() => { goToDateBtn.textContent = "Go"; }, 1200);
    return;
  }

  jumpToMessageById(match.id);
  goToDateBtn.textContent = "Found";
  setTimeout(() => { goToDateBtn.textContent = "Go"; }, 1200);
}


async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "absolute";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(input);
    return ok;
  }
}

function ensureMessageVisible(messageId) {
  const index = state.filteredMessages.findIndex((msg) => msg.id === messageId);
  if (index < 0) return false;
  const total = state.filteredMessages.length;
  const visibleStart = Math.max(0, total - state.paging.loadedCount);
  if (index >= visibleStart) return true;

  // Expand loaded window from bottom until target index is included.
  const neededCount = total - index;

  const chunk = state.paging.chunkSize;
  state.paging.loadedCount = Math.min(
    total,
    Math.ceil(neededCount / chunk) * chunk
  );
  renderMessages();
  return true;
}

function buildMessageSearchEngine(messages) {
  if (!HAS_FUSE) return null;
  return new window.Fuse(messages, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.34,
    minMatchCharLength: 2,
    keys: ["message", "sender", "date", "time"],
  });
}

function buildChatListSearchEngine(chats) {
  if (!HAS_FUSE) return null;
  return new window.Fuse(chats, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.32,
    minMatchCharLength: 2,
    keys: ["chatName", "fileName", "lastPreview"],
  });
}

function searchMessagesWithLibrary(chat, query, scopeMessages) {
  const normalized = query.trim();
  if (!normalized) return [];

  const source = !scopeMessages || scopeMessages.length === chat.messages.length
    ? chat.messages
    : scopeMessages;
  const q = normalized.toLowerCase();

  // Keep timeline order for results (oldest -> newest by message id).
  if (normalized.length < 2) {
    return source.filter((msg) => msg.searchText.includes(q)).map((msg) => msg.id);
  }

  let matchedSet = null;
  if (chat.searchEngine) {
    const hits = chat.searchEngine.search(normalized);
    if (hits.length > 0) {
      matchedSet = new Set(hits.map((hit) => hit.item.id));
    }
  }

  if (matchedSet) {
    return source.filter((msg) => matchedSet.has(msg.id)).map((msg) => msg.id);
  }

  return source.filter((msg) => msg.searchText.includes(q)).map((msg) => msg.id);
}

function searchChatsWithLibrary(query) {
  if (state.chatSearchEngine) {
    return state.chatSearchEngine.search(query).map((hit) => hit.item);
  }

  const q = query.toLowerCase();
  return state.chats.filter((chat) => {
    const hay = `${chat.chatName} ${chat.lastPreview} ${chat.fileName}`.toLowerCase();
    return hay.includes(q);
  });
}

function compressInline(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function initials(name) {
  const words = (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!words.length) return "CH";
  return words.map((part) => part.charAt(0).toUpperCase()).join("");
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
