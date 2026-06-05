import React from 'react';

interface MainContentProps {
  children: React.ReactNode;
  showSidebar: boolean;
}

export default function MainContent({ children, showSidebar }: MainContentProps) {
  return (
    <main
      className={`flex-1 flex flex-col min-h-0 bg-background transition-all duration-300 relative overflow-hidden`}
    >
      <div className="absolute inset-x-0 h-20 bg-gradient-to-b from-surface/20 to-transparent pointer-events-none z-10" />
      <div className="flex-1 flex flex-col relative z-20 overflow-hidden">
        {children}
      </div>
    </main>
  );
}
