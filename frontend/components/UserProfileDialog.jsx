import React from 'react';
import Modal from './ui/Modal';
import { User } from 'lucide-react';

export default function UserProfileDialog({ visible, onHide, viewData, apiUrl }) {
    if (!viewData) return null;

    return (
        <Modal 
            isOpen={visible} 
            onClose={onHide} 
            title="User Profile" 
            maxWidth="max-w-md"
        >
            <div className="flex flex-col items-center">
                <div className="mb-6 text-center">
                    <div className="relative mb-2 flex justify-center">
                        {viewData.uid ? (
                            <img 
                                src={viewData.labeledURI ? `${apiUrl}/${viewData.labeledURI}?t=${Date.now()}` : `${apiUrl}/uploads/${viewData.uid}.jpg?t=${Date.now()}`} 
                                alt="User"
                                className="w-24 h-24 rounded-full object-cover shadow-lg border-2 border-white dark:border-gray-700 bg-gray-100"
                                onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = "https://ui-avatars.com/api/?name=" + viewData.firstName + "+" + viewData.lastName + "&background=6366f1&color=fff";
                                }}
                            />
                        ) : (
                            <div className="w-24 h-24 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                <User size={40} />
                            </div>
                        )}
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{viewData.firstName} {viewData.lastName}</h2>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase mt-2 ${
                        viewData.role === 'SUPER_ADMIN' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' :
                        viewData.role === 'ADMIN' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                    }`}>
                        {viewData.role}
                    </span>
                </div>
                
                <div className="w-full bg-gray-50 dark:bg-gray-900/30 p-4 rounded-xl space-y-3 border border-gray-100 dark:border-gray-700">
                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-700/50 pb-2 gap-4">
                        <span className="text-gray-500 dark:text-gray-400 text-sm font-bold shrink-0">User ID</span>
                        <span className="text-gray-900 dark:text-white font-mono font-medium truncate">{viewData.uid}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-700/50 pb-2 gap-4">
                        <span className="text-gray-500 dark:text-gray-400 text-sm font-bold shrink-0">Department</span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold truncate">{viewData.department}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-700/50 pb-2 gap-4">
                        <span className="text-gray-500 dark:text-gray-400 text-sm font-bold shrink-0">Email</span>
                        <span className="text-gray-900 dark:text-white text-sm break-all text-right">{viewData.email}</span>
                    </div>
                    {viewData.secondaryEmail && (
                        <div className="flex justify-between border-b border-gray-100 dark:border-gray-700/50 pb-2 gap-4">
                            <span className="text-gray-500 dark:text-gray-400 text-sm font-bold shrink-0">Secondary</span>
                            <span className="text-gray-600 dark:text-gray-300 italic text-sm truncate">{viewData.secondaryEmail}</span>
                        </div>
                    )}
                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-700/50 pb-2 gap-4">
                        <span className="text-gray-500 dark:text-gray-400 text-sm font-bold shrink-0">Mobile</span>
                        <span className="text-gray-900 dark:text-white truncate">{viewData.mobile || "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-gray-500 dark:text-gray-400 text-sm font-bold shrink-0">Account Status</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            viewData.status === 'ACTIVE' 
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' 
                                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                        }`}>
                            {viewData.status}
                        </span>
                    </div>
                    
                    {viewData.departmentNumber && viewData.departmentNumber.toString().includes("ALLOW") && (
                        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                            <span className="text-gray-500 dark:text-gray-400 text-[10px] font-bold block mb-1 uppercase tracking-wider">Access Permissions</span>
                            <div className="flex flex-wrap gap-1">
                                {viewData.departmentNumber.toString().replace("ALLOW:", "").split(",").map((p, i) => (
                                    <span key={i} className="text-[10px] bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded border border-gray-100 dark:border-gray-700">
                                        {p.trim()}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="w-full mt-6">
                    <button 
                        onClick={onHide}
                        className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold rounded-xl transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </Modal>
    );
}