import { ReactNode } from "react";

export default function AdminLayout({ children, currentTab }: { children: ReactNode; currentTab?: string }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {children}
      </div>
    </div>
  );
}
