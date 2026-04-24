import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
    LayoutDashboard,
    Menu,
    LogOut,
    User,
    Settings,
    Briefcase,
    Clock
} from "lucide-react";
import { useAuth } from "../../src/context/AuthContext";

export default function Sidebar({ collapsed, setCollapsed }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { handleLogout } = useAuth();

    const menuItems = [
        { icon: <LayoutDashboard size={22} />, label: "Dashboard", path: "/dashboard" },
        { icon: <Briefcase size={22} />, label: "Departments", path: "/departments" },
        { icon: <Clock size={22} />, label: "System Logs", path: "/logs" },

    ];

    return (
        <aside className={`
    yukti-gradient dashboard-sidebar fixed top-0 left-0 h-screen z-40
    flex flex-col shadow-xl transition-all duration-300
    ${collapsed ? "w-16" : "w-64"}
    `}>
            {/* Sidebar Top / Brand */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
                {!collapsed && <span className="text-white font-bold text-xl px-2">Portal</span>}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="p-1 hover:bg-white/10 rounded text-white transition-colors"
                >
                    <Menu size={20} />
                </button>
            </div>

            {/* Menu Items */}
            <nav className="flex-1 px-2 py-4 space-y-2 overflow-y-auto custom-scrollbar">
                {menuItems.map((item) => (
                    <SidebarItem
                        key={item.label}
                        icon={item.icon}
                        label={item.label}
                        collapsed={collapsed}
                        active={location.pathname === item.path}
                        onClick={() => !item.disabled && navigate(item.path)}
                        disabled={item.disabled}
                    />
                ))}
            </nav>

            {/* Bottom Section */}
            <div className="border-t border-white/10">
                <SidebarItem
                    icon={<LogOut size={22} />}
                    label="Logout"
                    collapsed={collapsed}
                    onClick={handleLogout}
                    danger
                />
                {!collapsed && (
                    <div className="p-4 pt-2 text-[10px] uppercase tracking-widest opacity-50 text-white text-center">
                        v1.0.0
                    </div>
                )}
            </div>
        </aside>
    );
}

function SidebarItem({ icon, label, collapsed, active, onClick, disabled, danger }) {
    return (
        <div
            onClick={onClick}
            className={`
        flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-all mx-1
        ${active ? 'bg-white/20 shadow-inner' : 'hover:bg-white/10'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        ${danger && !active ? 'hover:bg-red-500/20 text-red-100' : 'text-white'}
      `}
        >
            <span className="flex-shrink-0">{icon}</span>
            {!collapsed && <span className="text-sm font-medium tracking-wide">{label}</span>}

            {/* Tooltip for collapsed state */}
            {collapsed && (
                <div className="fixed left-16 ml-2 bg-gray-900/90 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity font-medium z-50 whitespace-nowrap border border-white/10 shadow-2xl">
                    {label}
                </div>
            )}
        </div>
    );
}

