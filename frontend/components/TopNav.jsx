import React from "react";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import { useAuth } from "../src/context/AuthContext"; 

export default function TopNav({ title, subtitle }) {
  const { auth, logout } = useAuth();

  // 🚨 NEW: Make the title dynamic based on the user's secure role!
  let displayTitle = title;
  if (title === "Dashboard" && auth?.role) {
      const rolePrefix = auth.role === 'SUPER_ADMIN' ? 'Super Admin' : auth.role === 'ADMIN' ? 'Admin' : 'User';
      displayTitle = `${rolePrefix} Dashboard`;
  }

  return (
    <div className="flex flex-col mb-6 bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-600">
      <div className="flex justify-between items-center">
        <div>
          {/* 🚨 Use the dynamic displayTitle here */}
          <h1 className="text-2xl font-bold text-gray-800">{displayTitle}</h1>
          <p className="text-sm font-bold text-gray-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden md:block">
            <p className="text-xs text-gray-400 uppercase font-bold">Logged in as</p>
            <div className="flex items-center gap-2 justify-end">
              <span className="font-bold text-blue-600 text-lg">{auth?.name || "User"}</span>
              <Tag value={auth?.role} severity={auth?.role === 'SUPER_ADMIN' ? 'danger' : 'info'} />
            </div>
          </div>
          <Button label="Logout" onClick={logout} className="bg-red-500 hover:bg-red-600 text-white border-none text-sm" />
        </div>
      </div>
    </div>
  );
}