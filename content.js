// ChatGPT Prompt Sidebar Content Script
class ChatGPTPromptSidebar {
  constructor() {
    this.sidebar = null;
    this.isCollapsed = false;
    this.transparency = 0.95;
    this.currentChatId = null;
    this.prompts = [];
    this.observer = null;
    this.init();
  }

  init() {
    this.createSidebar();
    this.getCurrentChatId();
    this.loadPromptsForCurrentChat();
    this.setupMessageObserver();
    this.setupChatChangeObserver();
  }

  createSidebar() {
    // Remove existing sidebar if it exists
    const existingSidebar = document.getElementById('chatgpt-prompt-sidebar');
    if (existingSidebar) {
      existingSidebar.remove();
    }

    // Remove existing toggle button if it exists
    const existingToggle = document.getElementById('chatgpt-sidebar-toggle');
    if (existingToggle) {
      existingToggle.remove();
    }

    // Create the main sidebar
    this.sidebar = document.createElement('div');
    this.sidebar.id = 'chatgpt-prompt-sidebar';
    this.sidebar.innerHTML = `
      <div class="sidebar-header">
        <h3 class="sidebar-title">Prompt History</h3>
        <div class="sidebar-controls">
          <div class="transparency-control">
            <input type="range" class="transparency-slider" min="0.3" max="1" step="0.1" value="${this.transparency}">
          </div>
          <button class="control-btn clear-btn" title="Clear prompts">Clear</button>
        </div>
      </div>
      <div class="sidebar-content">
        <div class="no-prompts">No prompts yet. Start chatting!</div>
      </div>
    `;

    // Create the toggle button separately
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.id = 'chatgpt-sidebar-toggle';
    this.toggleBtn.className = 'toggle-btn';
    this.toggleBtn.innerHTML = '◀';
    this.toggleBtn.title = 'Toggle sidebar';

    document.body.appendChild(this.sidebar);
    document.body.appendChild(this.toggleBtn);
    
    this.setupSidebarEvents();
  }

  setupSidebarEvents() {
    // Toggle collapse/expand
    this.toggleBtn.addEventListener('click', () => {
      this.isCollapsed = !this.isCollapsed;
      this.sidebar.classList.toggle('collapsed', this.isCollapsed);
      this.toggleBtn.classList.toggle('collapsed', this.isCollapsed);
      this.toggleBtn.innerHTML = this.isCollapsed ? '▶' : '◀';
      this.toggleBtn.title = this.isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
    });

    // Transparency control
    const transparencySlider = this.sidebar.querySelector('.transparency-slider');
    transparencySlider.addEventListener('input', (e) => {
      this.transparency = parseFloat(e.target.value);
      this.updateTransparency();
    });

    // Clear prompts
    const clearBtn = this.sidebar.querySelector('.clear-btn');
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all prompts for this chat?')) {
        this.clearPrompts();
      }
    });
  }

  updateTransparency() {
    this.sidebar.style.background = `rgba(32, 33, 36, ${this.transparency})`;
    const header = this.sidebar.querySelector('.sidebar-header');
    header.style.background = `rgba(32, 33, 36, ${Math.min(this.transparency + 0.05, 1)})`;
  }

  getCurrentChatId() {
    // Extract chat ID from URL
    const url = window.location.href;
    const match = url.match(/\/c\/([a-zA-Z0-9-]+)/);
    this.currentChatId = match ? match[1] : 'default';
  }

  async loadPromptsForCurrentChat() {
    try {
      const result = await chrome.storage.local.get([`prompts_${this.currentChatId}`]);
      this.prompts = result[`prompts_${this.currentChatId}`] || [];
      this.updateSidebarContent();
    } catch (error) {
      console.error('Error loading prompts:', error);
      this.prompts = [];
      this.updateSidebarContent();
    }
  }

  async savePrompts() {
    try {
      await chrome.storage.local.set({
        [`prompts_${this.currentChatId}`]: this.prompts
      });
    } catch (error) {
      console.error('Error saving prompts:', error);
    }
  }

  setupMessageObserver() {
    // Observer for new messages
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.checkForNewPrompt(node);
            }
          });
        }
      });
    });

    // Start observing the chat container
    const chatContainer = this.findChatContainer();
    if (chatContainer) {
      this.observer.observe(chatContainer, {
        childList: true,
        subtree: true
      });
    }
  }

  setupChatChangeObserver() {
    // Observer for URL changes (chat switching)
    let lastUrl = window.location.href;
    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        setTimeout(() => {
          this.getCurrentChatId();
          this.loadPromptsForCurrentChat();
        }, 1000);
      }
    });

    urlObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  findChatContainer() {
    // Find the main chat container
    const selectors = [
      '[role="main"]',
      '.flex-1.overflow-hidden',
      '.react-scroll-to-bottom--css-',
      '.h-full'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }

    return document.body;
  }

  checkForNewPrompt(node) {
    // Look for user messages in the new nodes
    const userMessages = node.querySelectorAll ? 
      node.querySelectorAll('[data-message-author-role="user"]') :
      [];

    if (userMessages.length === 0 && node.matches && node.matches('[data-message-author-role="user"]')) {
      userMessages.push(node);
    }

    userMessages.forEach((messageNode) => {
      const messageText = this.extractMessageText(messageNode);
      if (messageText && !this.prompts.some(p => p.text === messageText)) {
        this.addPrompt(messageText, messageNode);
      }
    });
  }

  extractMessageText(messageNode) {
    // Extract text from various possible structures
    const textSelectors = [
      '.whitespace-pre-wrap',
      '[data-message-text]',
      '.markdown',
      'div[class*="prose"]',
      'p'
    ];

    for (const selector of textSelectors) {
      const textElement = messageNode.querySelector(selector);
      if (textElement) {
        return textElement.textContent.trim();
      }
    }

    return messageNode.textContent.trim();
  }

  addPrompt(text, messageNode) {
    const prompt = {
      text: text,
      timestamp: Date.now(),
      messageId: this.generateMessageId(messageNode)
    };

    this.prompts.push(prompt);
    this.savePrompts();
    this.updateSidebarContent();
  }

  generateMessageId(messageNode) {
    // Generate a unique ID for the message
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  updateSidebarContent() {
    const content = this.sidebar.querySelector('.sidebar-content');
    
    if (this.prompts.length === 0) {
      content.innerHTML = '<div class="no-prompts">No prompts yet. Start chatting!</div>';
      return;
    }

    const promptsHtml = this.prompts.map((prompt, index) => {
      const truncatedText = this.truncateText(prompt.text, 60);
      return `
        <div class="prompt-item" data-index="${index}">
          <div class="prompt-number">${index + 1}</div>
          <div class="prompt-text">${truncatedText}</div>
        </div>
      `;
    }).join('');

    content.innerHTML = promptsHtml;

    // Add click listeners to prompt items
    content.querySelectorAll('.prompt-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        this.scrollToPrompt(index);
      });
    });
  }

  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  scrollToPrompt(index) {
    const prompt = this.prompts[index];
    if (!prompt) return;

    // Find the message containing this prompt text
    const allMessages = document.querySelectorAll('[data-message-author-role="user"]');
    
    for (const message of allMessages) {
      const messageText = this.extractMessageText(message);
      if (messageText === prompt.text) {
        message.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
        
        // Highlight the message briefly
        this.highlightMessage(message);
        break;
      }
    }
  }

  highlightMessage(messageNode) {
    const originalBackground = messageNode.style.backgroundColor;
    messageNode.style.backgroundColor = 'rgba(16, 163, 127, 0.2)';
    messageNode.style.transition = 'background-color 0.3s';
    
    setTimeout(() => {
      messageNode.style.backgroundColor = originalBackground;
      setTimeout(() => {
        messageNode.style.transition = '';
      }, 300);
    }, 1000);
  }

  clearPrompts() {
    this.prompts = [];
    this.savePrompts();
    this.updateSidebarContent();
  }
}

// Initialize the sidebar when the page loads
let promptSidebar;

function initializeSidebar() {
  if (window.location.hostname.includes('chatgpt.com') || 
      window.location.hostname.includes('chat.openai.com')) {
    
    // Clean up existing sidebar first
    if (promptSidebar) {
      const existingSidebar = document.getElementById('chatgpt-prompt-sidebar');
      const existingToggle = document.getElementById('chatgpt-sidebar-toggle');
      if (existingSidebar) existingSidebar.remove();
      if (existingToggle) existingToggle.remove();
    }
    
    // Wait for the page to be fully loaded
    setTimeout(() => {
      promptSidebar = new ChatGPTPromptSidebar();
    }, 2000);
  }
}

// Initialize
initializeSidebar();

// Re-initialize on navigation changes
window.addEventListener('popstate', initializeSidebar);

// Also listen for pushstate/replacestate (for SPA navigation)
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function() {
  originalPushState.apply(history, arguments);
  setTimeout(initializeSidebar, 1000);
};

history.replaceState = function() {
  originalReplaceState.apply(history, arguments);
  setTimeout(initializeSidebar, 1000);
};

// Listen for URL changes via MutationObserver as backup
let lastUrl = window.location.href;
const urlWatcher = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    setTimeout(initializeSidebar, 1000);
  }
});

urlWatcher.observe(document.body, {
  childList: true,
  subtree: true
});