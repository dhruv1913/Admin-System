import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export default function Toast({ message, type = 'success', onClose, duration = 3000 }) {
    useEffect(() => {
        if (duration) {
            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [duration, onClose]);

    const icons = {
        success: <CheckCircle className="text-green-500" size={20} />,
        error: <AlertCircle className="text-red-500" size={20} />,
        info: <Info className="text-blue-500" size={20} />
    };

    const bgColors = {
        success: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
        error: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
        info: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
    };

    return (
        <div className={`fixed top-4 right-4 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg animate-in fade-in slide-in-from-top-4 duration-300 ${bgColors[type]}`}>
            {icons[type]}
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{message}</p>
            <button 
                onClick={onClose}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-500 transition-colors"
            >
                <X size={16} />
            </button>
        </div>
    );
}
