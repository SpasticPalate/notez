import { X } from 'lucide-react';

interface MarkdownHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MarkdownHelp({ isOpen, onClose }: MarkdownHelpProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed right-4 top-20 bottom-4 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 z-50 flex flex-col">
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Markdown Syntax Guide</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            title="Close"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Headers */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Headers</h3>
            <div className="space-y-2 font-mono text-sm">
              <div className="flex items-center justify-between">
                <code className="text-gray-700 dark:text-gray-300"># Heading 1</code>
                <span className="text-2xl font-bold text-gray-600 dark:text-gray-400">Heading 1</span>
              </div>
              <div className="flex items-center justify-between">
                <code className="text-gray-700 dark:text-gray-300">## Heading 2</code>
                <span className="text-xl font-semibold text-gray-600 dark:text-gray-400">Heading 2</span>
              </div>
              <div className="flex items-center justify-between">
                <code className="text-gray-700 dark:text-gray-300">### Heading 3</code>
                <span className="text-lg font-semibold text-gray-600 dark:text-gray-400">Heading 3</span>
              </div>
            </div>
          </section>

          {/* Text Formatting */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Text Formatting</h3>
            <div className="space-y-2 font-mono text-sm">
              <div className="flex items-center justify-between">
                <code className="text-gray-700 dark:text-gray-300">**Bold text**</code>
                <span className="font-bold text-gray-600 dark:text-gray-400">Bold text</span>
              </div>
              <div className="flex items-center justify-between">
                <code className="text-gray-700 dark:text-gray-300">*Italic text*</code>
                <span className="italic text-gray-600 dark:text-gray-400">Italic text</span>
              </div>
              <div className="flex items-center justify-between">
                <code className="text-gray-700 dark:text-gray-300">***Bold italic***</code>
                <span className="font-bold italic text-gray-600 dark:text-gray-400">Bold italic</span>
              </div>
              <div className="flex items-center justify-between">
                <code className="text-gray-700 dark:text-gray-300">`Code`</code>
                <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-400">Code</code>
              </div>
            </div>
          </section>

          {/* Lists */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Lists</h3>
            <div className="space-y-3 font-mono text-sm">
              <div>
                <div className="text-gray-700 dark:text-gray-300 mb-1">Bullet List:</div>
                <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-gray-700 dark:text-gray-300">
- Item 1{'\n'}- Item 2{'\n'}- Item 3
                </pre>
              </div>
              <div>
                <div className="text-gray-700 dark:text-gray-300 mb-1">Numbered List:</div>
                <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-gray-700 dark:text-gray-300">
1. First item{'\n'}2. Second item{'\n'}3. Third item
                </pre>
              </div>
              <div>
                <div className="text-gray-700 dark:text-gray-300 mb-1">Task List:</div>
                <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-gray-700 dark:text-gray-300">
- [ ] Todo item{'\n'}- [x] Completed item{'\n'}- [ ] Another todo
                </pre>
              </div>
            </div>
          </section>

          {/* Links and Code */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Links & Code Blocks</h3>
            <div className="space-y-3 font-mono text-sm">
              <div>
                <div className="text-gray-700 dark:text-gray-300 mb-1">Link:</div>
                <code className="text-gray-700 dark:text-gray-300">[Link text](https://example.com)</code>
              </div>
              <div>
                <div className="text-gray-700 dark:text-gray-300 mb-1">Code Block:</div>
                <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-gray-700 dark:text-gray-300">
```{'\n'}code block{'\n'}multiple lines{'\n'}```
                </pre>
              </div>
            </div>
          </section>

          {/* Other */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Other</h3>
            <div className="space-y-3 font-mono text-sm">
              <div>
                <div className="text-gray-700 dark:text-gray-300 mb-1">Blockquote:</div>
                <code className="text-gray-700 dark:text-gray-300">&gt; This is a quote</code>
              </div>
              <div>
                <div className="text-gray-700 dark:text-gray-300 mb-1">Horizontal Rule:</div>
                <code className="text-gray-700 dark:text-gray-300">---</code>
              </div>
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Keyboard Shortcuts</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300">Undo</span>
                <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">Ctrl+Z</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300">Redo</span>
                <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">Ctrl+Y / Ctrl+Shift+Z</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300">Bold</span>
                <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">Ctrl+B</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300">Italic</span>
                <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">Ctrl+I</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300">Save Note</span>
                <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">Ctrl+S</kbd>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
