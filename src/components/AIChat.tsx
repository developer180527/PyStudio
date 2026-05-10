import React, { useState } from 'react';
import { Send, Bot, User, Loader2, Sparkles, X } from 'lucide-react';
import { askGemini, MissingApiKeyError } from '../services/gemini';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  role: 'user' | 'ai';
  text: string;
}

interface AIChatProps {
  currentCode: string;
  isOpen: boolean;
  onClose: () => void;
}

export const AIChat: React.FC<AIChatProps> = ({ currentCode, isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: 'Hi! I\'m your Python assistant. I can help you debug, explain code, or write new functions based on your current project.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const response = await askGemini(userMsg, currentCode);
      setMessages(prev => [...prev, { role: 'ai', text: response }]);
    } catch (err: any) {
      const text = err instanceof MissingApiKeyError
        ? err.message
        : `Request failed: ${err?.message || err}`;
      setMessages(prev => [...prev, { role: 'ai', text }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed right-0 top-0 h-full w-[400px] bg-[var(--theme-panel)] border-l border-[var(--theme-border)] z-50 flex flex-col shadow-2xl text-[var(--theme-text-main)]"
        >
          <div className="p-4 border-b border-[var(--theme-border)] flex items-center justify-between bg-[var(--theme-surface-alt)]">
            <div className="flex items-center gap-2 text-[var(--theme-text-accent)] font-bold">
              <Sparkles size={18} />
              <span>AI Assistant</span>
            </div>
            <button onClick={onClose} className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-accent)] transition-colors bg-[var(--theme-active)] p-1 rounded">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[var(--theme-surface)]">
            {messages.map((msg, i) => (
              <div key={i} className={cn(
                "flex gap-3",
                msg.role === 'user' ? "flex-row-reverse text-right" : ""
              )}>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[var(--theme-text-status)] shadow-sm",
                  msg.role === 'user' ? "bg-[var(--theme-status)]" : "bg-[var(--theme-text-muted)]"
                )}>
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className={cn(
                  "p-3 rounded-lg text-sm max-w-[85%] whitespace-pre-wrap shadow-sm",
                  msg.role === 'user' ? "bg-[var(--theme-active)] border border-[var(--theme-border)] text-[var(--theme-text-main)]" : "bg-[var(--theme-panel)] border border-[var(--theme-border)] text-[var(--theme-text-main)]"
                )}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--theme-text-muted)] text-[var(--theme-text-status)] shadow-sm flex items-center justify-center">
                  <Bot size={16} />
                </div>
                <div className="bg-[var(--theme-panel)] border border-[var(--theme-border)] shadow-sm p-3 rounded-lg italic text-[var(--theme-text-muted)] text-sm">
                  Thinking...
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-[var(--theme-border)] bg-[var(--theme-surface-alt)]">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask me anything..."
                className="w-full bg-[var(--theme-panel)] text-[var(--theme-text-main)] border border-[var(--theme-border)] shadow-inner rounded-sm p-3 pr-12 text-sm focus:outline-none focus:border-[var(--theme-border-focus)] resize-none h-24"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="absolute right-3 bottom-3 p-1.5 bg-[var(--theme-hover)] border border-[var(--theme-border)] rounded-sm text-[var(--theme-text-accent)] disabled:opacity-50 hover:bg-[var(--theme-active)] transition-colors shadow-sm"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
