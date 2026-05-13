import React from "react";
import { User, Bell, LogOut } from "lucide-react";
import { useAuth } from "../../src/context/AuthContext";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";

export default function Header({ collapsed, title, subtitle }) {
  const { auth, handleLogout } = useAuth();
  const sidebarWidth = collapsed ? "64px" : "256px";

  const API_URL = import.meta.env.VITE_API_URL;

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
    
       {/* Modern Profile Block */}
        <div className="hidden md:flex items-center gap-3">
            <div className="flex flex-col items-end">
                <span className="text-sm font-bold text-white leading-tight">
                    {auth?.username || auth?.firstName || auth?.name || "Super Admin"}
                </span>
                <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest">
                    {auth?.role ? auth.role.replace(/_/g, ' ') : "ADMINISTRATOR"}
                </span>
            </div>
            
            {/* Avatar Circle */}
            <div className="relative w-10 h-10 rounded-full border-2 border-white/20 shadow-sm overflow-hidden bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors shrink-0">
                
                
                <img
                    src={auth?.labeledURI ? `${API_URL}/${auth.labeledURI}?t=${new Date().getTime()}` : `${API_URL}/uploads/${auth?.uid}.jpg?t=${new Date().getTime()}`}
                    alt="Profile"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                        // If image fails to load (or doesn't exist), hide it and show the icon
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                    }}
                />
                {/* Fallback Icon (Hidden by default, shown if image fails) */}
                <div className="hidden items-center justify-center text-white w-full h-full">
                    <User size={18} />
                </div>
            </div>
        </div>

      </div>
    </header>
  );
}
