import React from "react";
import { User, Bell, LogOut } from "lucide-react";
import { useAuth } from "../../src/context/AuthContext";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";

export default function Header({ collapsed, title, subtitle }) {
  const { auth, handleLogout } = useAuth();
  const sidebarWidth = collapsed ? "64px" : "256px";

  let displayTitle = title;
  if (title === "Dashboard" && auth?.role) {
    const rolePrefix = auth.role === 'SUPER_ADMIN' ? 'Super Admin' : auth.role === 'ADMIN' ? 'Admin' : 'User';
    displayTitle = `${rolePrefix} Dashboard`;
  }

  return (
    <header
      className="yukti-gradient dashboard-header fixed top-0 right-0 z-30 px-4 py-3 flex items-center justify-between shadow-lg"
      style={{
        left: sidebarWidth,
        transition: 'left 0.3s',
        boxSizing: 'border-box'
      }}
    >
      {/* Search or Title Area */}
      <div className="flex flex-col">
        <h1 className="text-white text-lg font-bold leading-tight">
          {displayTitle || "Management Portal"}
        </h1>
        {subtitle && (
          <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider">
            {subtitle}
          </p>
        )}
      </div>

      {/* Profile & Actions Area */}
      <div className="flex items-center gap-6">
        {/* User Info (name first, then label, then role tag in red) */}
        <div className="hidden md:flex items-center text-white">
          <span className="font-bold text-sm mr-3">{auth?.name || "User"}</span>
          <span className="text-[10px] opacity-60 uppercase font-black tracking-widest mr-3">Logged in as</span>
          <Tag
            value={(auth?.role || '').toUpperCase()}
            className="text-[10px] font-bold uppercase px-3 py-1 rounded-full border border-red-200 bg-red-50 text-red-600"
          />
        </div>

      </div>
    </header>
  );
}
