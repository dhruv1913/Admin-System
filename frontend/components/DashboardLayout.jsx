import React, { useState, useEffect } from "react";
import Sidebar from "./dashboard/Sidebar";
import Header from "./dashboard/Header";

export default function DashboardLayout({ children, title, subtitle }) {
    const [collapsed, setCollapsed] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    useEffect(() => {
        const handleResize = () => {
            setWindowWidth(window.innerWidth);
            if (window.innerWidth < 768) {
                setCollapsed(true);
            }
        };

        window.addEventListener("resize", handleResize);

        // Initial check
        if (window.innerWidth < 768) {
            setCollapsed(true);
        }

        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const sidebarWidth = collapsed ? "64px" : "256px";

    return (
        <div className="flex min-h-screen bg-gray-50/50">
            <Sidebar
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                windowWidth={windowWidth}
            />

            <div className="flex-1 flex flex-col min-h-screen transition-all duration-300" style={{ marginLeft: windowWidth < 768 ? "64px" : sidebarWidth }}>
                <Header collapsed={collapsed} title={title} subtitle={subtitle} />

                <main className="flex-1 pt-28 pb-6 px-6">
                    <div className="w-full">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
