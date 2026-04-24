import React, { useState } from 'react';
import Modal from './ui/Modal';
import { Camera, X, Check, ChevronDown } from 'lucide-react';

export default function UserFormDialog({ visible, onHide, editMode, formData, setFormData, ous, selectedFile, setSelectedFile, handleSubmit }) {
    const [showDeptDropdown, setShowDeptDropdown] = useState(false);

    const togglePermission = (dept) => {
        const current = formData.permissions || [];
        if (current.includes(dept)) {
            setFormData({ ...formData, permissions: current.filter(p => p !== dept) });
        } else {
            setFormData({ ...formData, permissions: [...current, dept] });
        }
    };

    const inputClasses = "w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 transition-all outline-none";
    const labelClasses = "block mb-1 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider";

    return (
        <Modal 
            isOpen={visible} 
            onClose={onHide} 
            title={editMode ? "Edit User" : "Add New User"}
            maxWidth="max-w-xl"
        >
            <form onSubmit={handleSubmit} className="space-y-5 py-2">
                {/* Photo Upload */}
                <div className="flex justify-center">
                    <div className="relative group">
                        <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900 transition-all cursor-pointer overflow-hidden">
                            {selectedFile ? (
                                <img 
                                    src={URL.createObjectURL(selectedFile)} 
                                    alt="Preview" 
                                    className="w-full h-full object-cover" 
                                />
                            ) : (
                                <>
                                    <Camera size={24} className="text-gray-400 mb-1" />
                                    <span className="text-[10px] font-bold text-gray-500 uppercase">Upload</span>
                                </>
                            )}
                            <input 
                                type="file" 
                                accept="image/*" 
                                onChange={(e) => setSelectedFile(e.target.files[0])} 
                                className="absolute inset-0 opacity-0 cursor-pointer" 
                            />
                        </div>
                        {selectedFile && (
                            <button 
                                type="button"
                                onClick={() => setSelectedFile(null)}
                                className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg hover:bg-red-600 transition-colors"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Department */}
                <div>
                    <label className={labelClasses}>Department</label>
                    <select 
                        value={formData.department} 
                        onChange={(e) => setFormData({...formData, department: e.target.value})}
                        disabled={editMode}
                        className={`${inputClasses} ${editMode ? 'bg-gray-100 dark:bg-gray-700 opacity-60 cursor-not-allowed' : ''}`}
                        required
                    >
                        <option value="">Select Department</option>
                        {ous.map(ou => (
                            <option key={ou.value} value={ou.value}>{ou.label}</option>
                        ))}
                    </select>
                </div>

                {/* Name Row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClasses}>First Name</label>
                        <input 
                            type="text" 
                            value={formData.firstName} 
                            onChange={(e) => setFormData({...formData, firstName: e.target.value})} 
                            required 
                            className={inputClasses}
                        />
                    </div>
                    <div>
                        <label className={labelClasses}>Last Name</label>
                        <input 
                            type="text" 
                            value={formData.lastName} 
                            onChange={(e) => setFormData({...formData, lastName: e.target.value})} 
                            required 
                            className={inputClasses}
                        />
                    </div>
                </div>

                {/* Email Row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClasses}>Primary Email</label>
                        <input 
                            type="email" 
                            value={formData.email} 
                            onChange={(e) => setFormData({...formData, email: e.target.value})} 
                            required 
                            className={inputClasses}
                        />
                    </div>
                    <div>
                        <label className={labelClasses}>Secondary Email</label>
                        <input 
                            type="email" 
                            value={formData.secondaryEmail} 
                            onChange={(e) => setFormData({...formData, secondaryEmail: e.target.value})} 
                            placeholder="Optional" 
                            className={inputClasses}
                        />
                    </div>
                </div>

                {/* ID & Mobile Row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClasses}>User ID</label>
                        <input 
                            type="text" 
                            value={formData.uid} 
                            onChange={(e) => setFormData({...formData, uid: e.target.value})} 
                            disabled={editMode} 
                            required 
                            className={`${inputClasses} ${editMode ? 'bg-gray-100 dark:bg-gray-700 opacity-60 cursor-not-allowed' : ''}`}
                        />
                    </div>
                    <div>
                        <label className={labelClasses}>Mobile Number</label>
                        <input 
                            type="tel" 
                            maxLength={10} 
                            value={formData.mobile} 
                            onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                setFormData({...formData, mobile: val});
                            }} 
                            placeholder="10-digit number"
                            className={inputClasses}
                        />
                    </div>
                </div>

                {/* Password */}
                <div>
                    <label className={labelClasses}>Password</label>
                    <input 
                        type="password" 
                        value={formData.password} 
                        onChange={(e) => setFormData({...formData, password: e.target.value})} 
                        placeholder={editMode ? "Leave empty to keep current" : "Enter password"} 
                        className={inputClasses}
                        required={!editMode}
                    />
                </div>
                
                {/* Access Control Section */}
                <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 space-y-4">
                    <div>
                        <label className="block mb-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Access Level</label>
                        <div className="grid grid-cols-3 gap-2">
                            {['USER', 'ADMIN', 'SUPER_ADMIN'].map(role => (
                                <button
                                    key={role}
                                    type="button"
                                    onClick={() => setFormData({...formData, role})}
                                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                                        formData.role === role 
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-300'
                                    }`}
                                >
                                    {role.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {(formData.role === "ADMIN" || formData.role === "SUPER_ADMIN") && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                            <label className="block mb-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Allowed Departments</label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowDeptDropdown(!showDeptDropdown)}
                                    className={`${inputClasses} flex justify-between items-center bg-white dark:bg-gray-800`}
                                >
                                    <span className="truncate">
                                        {(formData.permissions || []).length === 0 
                                            ? "Select Departments" 
                                            : `${(formData.permissions || []).length} Departments Selected`}
                                    </span>
                                    <ChevronDown size={16} className={`transition-transform ${showDeptDropdown ? 'rotate-180' : ''}`} />
                                </button>

                                {showDeptDropdown && (
                                    <div className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-48 overflow-y-auto p-2 animate-in zoom-in-95 duration-200">
                                        {ous.map(ou => (
                                            <label 
                                                key={ou.value} 
                                                className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer transition-colors"
                                            >
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                                    (formData.permissions || []).includes(ou.value)
                                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                                        : 'border-gray-300 dark:border-gray-600'
                                                }`}>
                                                    {(formData.permissions || []).includes(ou.value) && <Check size={14} />}
                                                </div>
                                                <input 
                                                    type="checkbox" 
                                                    className="hidden"
                                                    checked={(formData.permissions || []).includes(ou.value)}
                                                    onChange={() => togglePermission(ou.value)}
                                                />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">{ou.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                            
                            {/* Selected Chips */}
                            <div className="flex flex-wrap gap-2 mt-3">
                                {(formData.permissions || []).map(p => (
                                    <span key={p} className="flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold px-2 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800">
                                        {p}
                                        <button type="button" onClick={() => togglePermission(p)} className="hover:text-red-500 transition-colors">
                                            <X size={10} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex gap-3 justify-end pt-5 border-t border-gray-100 dark:border-gray-700">
                    <button 
                        type="button" 
                        onClick={onHide}
                        className="px-6 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit"
                        className="px-8 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-200 dark:shadow-none transition-all hover:scale-105 active:scale-95"
                    >
                        {editMode ? "Update User" : "Create User"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}