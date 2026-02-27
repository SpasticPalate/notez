import { useState, useEffect, useCallback } from 'react';

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
  direction?: 'horizontal' | 'vertical';
  className?: string;
}

export function ResizeHandle({
  onResize,
  onResizeEnd,
  direction = 'horizontal',
  className = '',
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setStartPos(direction === 'horizontal' ? e.clientX : e.clientY);
  }, [direction]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPos;
      setStartPos(currentPos);
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onResizeEnd?.();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, startPos, direction, onResize, onResizeEnd]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`
        relative
        ${isHorizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
        ${isDragging ? 'bg-blue-500' : 'bg-transparent hover:bg-blue-400'}
        transition-colors duration-150
        flex-shrink-0
        hidden xl:block
        ${className}
      `}
      role="separator"
      aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
    >
      {/* Larger hit area for easier grabbing */}
      <div
        className={`
          absolute
          ${isHorizontal ? 'inset-y-0 -left-1 -right-1 w-3' : 'inset-x-0 -top-1 -bottom-1 h-3'}
        `}
      />
    </div>
  );
}
