import React from 'react';
import { useAuth } from '../context/AuthContext';

const Unauthorized = () => {
  // 🚨 Pull the logout function from your auth context
  const { handleLogout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-2xl transform transition-all duration-500 hover:scale-105">
        <div className="text-center">
          {/* Animated Warning Icon */}
          <div className="mx-auto flex items-center justify-center h-24 w-24 rounded-full bg-red-100 animate-pulse">
            {/* 🚨 FIX 1: Fixed the React SVG camelCase spelling from strokeLinelinejoin to strokeLinejoin */}
            <svg className="h-16 w-16 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 tracking-tight">
            Access Denied
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            You do not have the required administrative permissions to view this dashboard.
          </p>
        </div>
        <div className="mt-8">
          <button
            onClick={handleLogout}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-lg font-bold rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-300 ease-in-out"
          >
            Sign Out & Return to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default Unauthorized;