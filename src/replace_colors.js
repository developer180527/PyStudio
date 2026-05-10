import fs from 'fs';
import path from 'path';

const replaceMap = {
  'bg-[#F0F0F0]': 'bg-[var(--theme-surface)]',
  'text-[#000000]': 'text-[var(--theme-text-main)]',
  'bg-[#ECE9D8]': 'bg-[var(--theme-surface-alt)]',
  'border-[#A0A0A0]': 'border-[var(--theme-border)]',
  'border-b-[#A0A0A0]': 'border-b-[var(--theme-border)]',
  'border-t-[#A0A0A0]': 'border-t-[var(--theme-border)]',
  'border-r-[#A0A0A0]': 'border-r-[var(--theme-border)]',
  'border-l-[#A0A0A0]': 'border-l-[var(--theme-border)]',
  'bg-[#FFFFFF]': 'bg-[var(--theme-panel)]',
  'text-[#333333]': 'text-[var(--theme-text-main)]',
  'text-[#005499]': 'text-[var(--theme-text-accent)]',
  'bg-[#E4E8F0]': 'bg-[var(--theme-hover)]',
  'bg-[#DDE5FF]': 'bg-[var(--theme-active)]',
  'border-[#CCCCCC]': 'border-[var(--theme-border-alt)]',
  'text-[#404040]': 'text-[var(--theme-text-secondary)]',
  'text-[#808080]': 'text-[var(--theme-text-muted)]',
  'bg-[#005499]': 'bg-[var(--theme-status)]',
  'text-[#DDE5FF]': 'text-[var(--theme-text-status-muted)]',
  'text-white': 'text-[var(--theme-text-status)]', /* be careful with this, but should be fine */
  'text-[#D4D4D4]': 'text-[var(--theme-text-main)]',
  'hover:bg-[#DDE5FF]': 'hover:bg-[var(--theme-active)]',
  'hover:text-[#005499]': 'hover:text-[var(--theme-hover-text)]',
  'border-[#005499]': 'border-[var(--theme-border-focus)]',
  'text-[#606060]': 'text-[var(--theme-text-secondary)]',
  'hover:bg-[#E4E8F0]': 'hover:bg-[var(--theme-hover)]',
  'bg-[#E8E8E8]': 'bg-[var(--theme-panel)]',
  'border-t-[#005499]': 'border-t-[var(--theme-border-focus)]',
  'focus:border-[#005499]': 'focus:border-[var(--theme-border-focus)]',
  'focus:ring-[#005499]': 'focus:ring-[var(--theme-border-focus)]',
  'ring-[#005499]': 'ring-[var(--theme-border-focus)]',
  'hover:border-[#005499]': 'hover:border-[var(--theme-border-focus)]',
  'disabled:border-[#CCCCCC]': 'disabled:border-[var(--theme-border-alt)]',
  'disabled:bg-[#F0F0F0]': 'disabled:bg-[var(--theme-surface)]',
  'disabled:text-gray-400': 'disabled:text-[var(--theme-text-muted)]',
  'disabled:text-[#808080]': 'disabled:text-[var(--theme-text-muted)]',
  'bg-[#37373d]': 'bg-[var(--theme-hover)]',
  'text-indigo-400': 'text-[var(--theme-text-accent)]',
  'hover:text-indigo-400': 'hover:text-[var(--theme-hover-text)]',
  'text-[#005499]': 'text-[var(--theme-text-accent)]',
};

function replaceInFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  
  for (const [key, value] of Object.entries(replaceMap)) {
    content = content.split(key).join(value);
  }
  
  // Specific fix for text-white in places that don't need it or need correction
  
  fs.writeFileSync(filePath, content);
}

const files = [
  'src/App.tsx',
  'src/components/Sidebar.tsx',
  'src/components/FileExplorer.tsx',
  'src/components/Console.tsx',
  'src/components/Editor.tsx',
  'src/components/AIChat.tsx',
  'src/components/Settings.tsx'
];

files.forEach(replaceInFile);
console.log('Colors replaced');
