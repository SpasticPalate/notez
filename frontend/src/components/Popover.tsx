import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';

interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  position?: 'right' | 'left';
  className?: string;
}

export function Popover({ trigger, children, position = 'right', className = '' }: PopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverWidth = 200; // Approximate width

      let left = position === 'right' ? rect.right + 8 : rect.left - popoverWidth - 8;
      let top = rect.top + (rect.height / 2) - 20; // Center vertically

      // Ensure popover stays within viewport
      if (left + popoverWidth > window.innerWidth) {
        left = rect.left - popoverWidth - 8;
      }
      if (left < 0) {
        left = rect.right + 8;
      }
      if (top < 8) {
        top = 8;
      }
      if (top + 100 > window.innerHeight) {
        top = window.innerHeight - 108;
      }

      setCoords({ top, left });
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  const handlePopoverMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  const handlePopoverMouseLeave = () => {
    setIsOpen(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={className}
      >
        {trigger}
      </div>
      {isOpen && (
        <div
          ref={popoverRef}
          onMouseEnter={handlePopoverMouseEnter}
          onMouseLeave={handlePopoverMouseLeave}
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-2 px-3 min-w-[160px] animate-in fade-in zoom-in-95 duration-150"
          style={{ top: coords.top, left: coords.left }}
        >
          {children}
        </div>
      )}
    </>
  );
}
