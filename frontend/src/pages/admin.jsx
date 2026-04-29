import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
    Search, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight,
    Eye, Pencil, Trash2, Plus, GitBranch, Settings, Upload, Download,
    Check, AlertCircle, X, ChevronDown, User, MoreVertical
} from "lucide-react";
import { getAllUsers, getOUs, addUser, editUser, deleteUser, bulkImport, exportUsers, bulkDeleteUsers, bulkSuspendUsers } from "../services/adminService";
import { securePayload } from "../utils/encryption";
import { useAuth } from "../context/AuthContext";

// Components
import UserProfileDialog from "../../components/UserProfileDialog";
import UserFormDialog from "../../components/UserFormDialog";
import Modal from "../../components/ui/Modal";
import Toast from "../../components/ui/Toast";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { getDeptStats } from "../services/adminService";

const API_URL = import.meta.env.VITE_API_URL;

export default function Admin() {
    const { auth } = useAuth();
    const navigate = useNavigate();

    const hasWriteAccess = auth.canWrite ||
        (auth.role && ["SUPER_ADMIN", "ADMIN"].includes(auth.role.toUpperCase()));

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [globalFilter, setGlobalFilter] = useState('');
    const [selectedDeptFilter, setSelectedDeptFilter] = useState([]);
    const [selectedRoleFilter, setSelectedRoleFilter] = useState("");
    const [selectedStatusFilter, setSelectedStatusFilter] = useState("");
    const [ous, setOus] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    // Notification State
    const [notification, setNotification] = useState(null);

    // Confirmation State
    const [confirmDialog, setConfirmDialog] = useState({ visible: false, message: "", onConfirm: null });

    // Multi-select dropdown state
    const [showDeptDropdown, setShowDeptDropdown] = useState(false);
    const [showActionsDropdown, setShowActionsDropdown] = useState(false);

    // Dialog States
    const [productDialog, setProductDialog] = useState(false);
    const [viewDialog, setViewDialog] = useState(false);
    const [viewData, setViewData] = useState(null);
    const [conflictDialog, setConflictDialog] = useState(false);
    const [conflictMsg, setConflictMsg] = useState("");
    const [editMode, setEditMode] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [bulkDialog, setBulkDialog] = useState(false);
    const [bulkReport, setBulkReport] = useState({ success: 0, failed: 0, errors: [] });
    const fileUploadRef = useRef(null);

    const [deptSearch, setDeptSearch] = useState('');

    const [deptStats, setDeptStats] = useState([]);

    const [totalRecords, setTotalRecords] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    const [selectedUsers, setSelectedUsers] = useState([]);

    const initialForm = {
        firstName: "", lastName: "", email: "", secondaryEmail: "",
        mobile: "", uid: "", password: "", department: "", title: "",
        role: "USER", permissions: []
    };
    const [formData, setFormData] = useState(initialForm);

    useEffect(() => { 
        loadOUs(); 
        loadStats(); 
    }, []);

    // 2. 🚨 THE MISSING PIECE: This tells the table to fetch users!
    useEffect(() => {
        loadUsers();
    }, [currentPage, rowsPerPage, globalFilter, selectedDeptFilter, selectedRoleFilter, selectedStatusFilter]);

    // 3. Clear all selected checkboxes if the admin searches or changes pages
    useEffect(() => {
        setSelectedUsers([]);
    }, [currentPage, globalFilter, selectedDeptFilter, selectedRoleFilter, selectedStatusFilter]);

    const loadStats = async () => {
        try {
            const res = await getDeptStats();
            setDeptStats(res.data?.data || res.data || []);
        } catch (err) {
            console.error("Failed to load stats", err);
        }
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            // Select all users currently visible on the page
            setSelectedUsers(users.map(u => u.uid));
        } else {
            setSelectedUsers([]);
        }
    };

    const handleSelectOne = (uid) => {
        setSelectedUsers(prev => 
            prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
        );
    };

    const handleBulkSuspend = async () => {
        if (!window.confirm(`Are you sure you want to suspend ${selectedUsers.length} users?`)) return;
        setLoading(true);
        try {
            // 🚨 FIX 1: Added 'await' and destructured { payload }
            const { payload } = await securePayload({ uids: selectedUsers });
            
            // 🚨 FIX 2: Wrapped payload in an object so the backend decrypts it properly
            await bulkSuspendUsers({ payload });
            
            showToast(`Successfully suspended ${selectedUsers.length} users`, "success");
            setSelectedUsers([]);
            loadUsers();
            loadStats();
        } catch (error) {
            console.error("Bulk Suspend Error:", error);
            showToast("Failed to suspend users", "error");
            setLoading(false);
        }
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`Are you sure you want to PERMANENTLY delete ${selectedUsers.length} users?`)) return;
        setLoading(true);
        try {
            // 🚨 FIX 1: Added 'await' and destructured { payload }
            const { payload } = await securePayload({ uids: selectedUsers });
            
            // 🚨 FIX 2: Wrapped payload in an object so the backend decrypts it properly
            await bulkDeleteUsers({ payload });
            
            showToast(`Successfully deleted ${selectedUsers.length} users`, "success");
            setSelectedUsers([]);
            loadUsers();
            loadStats();
        } catch (error) {
            console.error("Bulk Delete Error:", error);
            showToast("Failed to delete users", "error");
            setLoading(false);
        }
    };

    const loadOUs = async () => {
        try {
            const ouRes = await getOUs();
            setOus(ouRes.data.map(name => ({ label: name, value: name })));
        } catch (err) {
            console.error("Failed to load OUs", err);
        }
    };

    const showToast = (message, type = 'success') => {
        setNotification({ message, type });
    };

    const loadAllData = async () => {
        setLoading(true);
        try {
            const ouRes = await getOUs();
            setOus(ouRes.data.map(name => ({ label: name, value: name })));

            const userRes = await getAllUsers();
            
            // 🚨 SAFE EXTRACT: Handle both the old array format and the new pagination format!
            const rawUsers = Array.isArray(userRes.data) ? userRes.data : (userRes.data.users || []);

            const processed = rawUsers.map(u => ({
                ...u,
                status: String(Array.isArray(u.employeeType) ? u.employeeType[0] : u.employeeType || "ACTIVE").toUpperCase(),
                role: String(Array.isArray(u.businessCategory) ? u.businessCategory[0] : u.businessCategory || "USER").toUpperCase(),
                cn: String(Array.isArray(u.cn) ? u.cn[0] : u.cn || ""),
                uid: String(Array.isArray(u.uid) ? u.uid[0] : u.uid || ""),
                email: String(Array.isArray(u.mail) ? u.mail[0] : u.mail || ""),
                mobile: String(Array.isArray(u.mobile) ? u.mobile[0] : u.mobile || ""),
                department: u.department || "General",
                createTimestamp: u.createTimestamp || "00000000000000Z",
                secondaryEmail: String(Array.isArray(u.description) ? u.description[0] : (u.description || "")),
                labeledURI: String(Array.isArray(u.labeledURI) ? u.labeledURI[0] : (u.labeledURI || "")),
            }));
            
            processed.sort((a, b) => (a.createTimestamp < b.createTimestamp ? 1 : -1));
            setUsers(processed);
        } catch (err) {
            console.error("Load failed", err);
            showToast("Failed to load user data", "error");
        } finally {
            setLoading(false);
        }
    };

    const loadUsers = async () => {
        setLoading(true);
        try {
            const params = {
                page: currentPage,
                limit: rowsPerPage,
                search: globalFilter,
                dept: selectedDeptFilter.join(','),
                role: selectedRoleFilter,
                status: selectedStatusFilter
            };
            const userRes = await getAllUsers(params);
            
            // 🚨 THE FIX: Safely extract the payload whether it's wrapped in .data or not!
            const payload = userRes.data?.data || userRes.data || {};
            
            // Defensively fallback to empty arrays so React NEVER crashes
            setUsers(payload.users || []);
            setTotalRecords(payload.totalRecords || 0);
            setTotalPages(payload.totalPages || 1);

        } catch (err) {
            console.error("Load failed", err);
            showToast("Failed to load user data", "error");
            setUsers([]); // Fallback to empty table on error
            setTotalRecords(0);
        } finally {
            setLoading(false);
        }
    };

  const handleToggle = async (user) => {
        if (!hasWriteAccess) return;
        const currentStatus = user.status;
        const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";

        setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, status: newStatus } : u));
        try {
            const data = new FormData();
            
            // Destructure ONLY the payload
            const { payload } = await securePayload({ 
                uid: user.uid, 
                employeeType: newStatus, 
                role: user.role, 
                email: user.email 
            });
            
            data.append("payload", payload);

            await editUser(data);
            showToast(`${user.firstName} is now ${newStatus}`, 'success');
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message;
            setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, status: currentStatus } : u));
            showToast(errorMessage, 'error');
        }
    };

    const openNew = () => { setFormData(initialForm); setSelectedFile(null); setEditMode(false); setProductDialog(true); };
    const hideDialog = () => { setProductDialog(false); setViewDialog(false); };
    const openView = (user) => { setViewData(user); setViewDialog(true); };

    const handleEditClick = (u) => {
        setEditMode(true);
        setSelectedFile(null);
        let permArray = [];
        let rawPerms = u.departmentNumber;
        if (Array.isArray(rawPerms)) {
            const allowString = rawPerms.find(s => s && s.toString().startsWith("ALLOW:"));
            if (allowString) rawPerms = allowString;
        }
        if (rawPerms && typeof rawPerms === "string" && rawPerms.startsWith("ALLOW:")) {
            permArray = rawPerms.replace("ALLOW:", "").split(",").map(s => s.trim());
        }
        setFormData({
            firstName: u.firstName ?? "", lastName: u.lastName ?? "", email: u.email || "", secondaryEmail: u.secondaryEmail || "",
            mobile: u.mobile || "", uid: u.uid || "", password: "", department: u.department || "", title: u.title || "",
            role: u.role || "USER", permissions: permArray
        });
        setProductDialog(true);
    };

  const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            // Only extract payload from the new AES securePayload function
            const { payload } = await securePayload(formData);
            const submitData = new FormData();

            // Send only the payload in the JSON string
            submitData.append("data", JSON.stringify({
                payload: payload
            }));

            if (formData.uid) submitData.append("uid", formData.uid);

            if (selectedFile) {
                submitData.append("photo", selectedFile);
            }

            const response = editMode
                ? await editUser(submitData)
                : await addUser(submitData);

            if (response.status === 200 || response.status === 201 || response.data?.message) {
                showToast(editMode ? 'User updated successfully' : 'User added successfully', 'success');
                setProductDialog(false);
                loadAllData();
            } else {
                throw new Error(response.data?.message || "Operation failed");
            }
        } catch (err) {
            console.error("Save Error:", err);
            const errorMsg = err.response?.data?.message || err.response?.data?.error || "Operation failed";
            showToast(errorMsg, 'error');
        }
    };

    const handleBulkImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("file", file);
        setLoading(true);
        try {
            const response = await bulkImport(formData);
            setBulkReport(response.data.summary);
            setBulkDialog(true);
            loadAllData();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
            e.target.value = null;
        }
    };

    const handleExport = async () => {
        try {
            const response = await exportUsers();
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a'); link.href = url; link.setAttribute('download', `Directory_Users.xlsx`);
            document.body.appendChild(link); link.click(); link.remove();
        } catch (err) {
            showToast('Could not download file.', 'error');
        }
    };

    const confirmDelete = (user) => {
        setConfirmDialog({
            visible: true,
            message: `Are you sure you want to delete user ${user.firstName} ${user.lastName} (${user.uid})? This action cannot be undone.`,
            onConfirm: () => handleDelete(user)
        });
    };

    const handleDelete = async (user) => {
        try {
            await deleteUser(user.uid);
            showToast('User removed successfully', 'success');
            loadAllData();
        } catch (err) {
            showToast('Delete Failed', 'error');
        } finally {
            setConfirmDialog({ ...confirmDialog, visible: false });
        }
    };

    const toggleDeptFilter = (dept) => {
        if (selectedDeptFilter.includes(dept)) {
            setSelectedDeptFilter(selectedDeptFilter.filter(d => d !== dept));
        } else {
            setSelectedDeptFilter([...selectedDeptFilter, dept]);
        }
    };

    // --- RENDER HELPERS ---
    const renderHeader = () => (
        <div className="px-4 py-5 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl">
                        <User className="text-indigo-600 dark:text-indigo-400" size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white m-0">Directory Users</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Manage organizational members and permissions</p>
                    </div>
                    <span className="ml-2 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400">
                        {totalRecords} Total
                    </span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {hasWriteAccess && (
                        <>
                            <button
                                onClick={openNew}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-200 dark:shadow-none hover:scale-105 active:scale-95"
                            >
                                <Plus size={18} /> Add User
                            </button>
                            

                            <div className="relative">
                                <button
                                    onClick={() => setShowActionsDropdown(!showActionsDropdown)}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-sm transition-all hover:bg-gray-200 dark:hover:bg-gray-600"
                                >
                                    <Settings size={18} /> Actions <ChevronDown size={16} className={`transition-transform ${showActionsDropdown ? 'rotate-180' : ''}`} />
                                </button>

                                {showActionsDropdown && (
                                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 py-2 animate-in zoom-in-95 duration-200 origin-top-right">
                                        <button
                                            onClick={() => { fileUploadRef.current.click(); setShowActionsDropdown(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                        >
                                            <Upload size={16} /> Import Excel
                                        </button>
                                        <button
                                            onClick={() => { handleExport(); setShowActionsDropdown(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                        >
                                            <Download size={16} /> Export Excel
                                        </button>
                                    </div>
                                )}
                            </div>
                            <input type="file" ref={fileUploadRef} style={{ display: 'none' }} accept=".xlsx, .xls, .csv" onChange={handleBulkImport} />
                        </>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
                    <input
                        type="text"
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        placeholder="Search name, ID, email..."
                        className="w-full pl-12 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm transition-all outline-none"
                    />
                </div>

                {/* Dept Filter */}
                <div className="relative">
                    <button
                        onClick={() => setShowDeptDropdown(!showDeptDropdown)}
                        className="w-full flex justify-between items-center px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 rounded-xl text-sm transition-all outline-none"
                    >
                        <span className="truncate text-gray-600 dark:text-gray-300">
                            {selectedDeptFilter.length === 0 ? "All Departments" : `${selectedDeptFilter.length} Departments`}
                        </span>
                        <ChevronDown size={16} className="text-gray-400" />
                    </button>
                   {showDeptDropdown && (
                        <div className="absolute z-20 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-y-auto p-2 animate-in zoom-in-95 duration-200">
                            <div className="mb-2 p-1">
                                <input
                                    type="text"
                                    placeholder="Search Dept..."
                                    value={deptSearch}
                                    onChange={(e) => setDeptSearch(e.target.value)}
                                    className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:border-indigo-500 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300"
                                />
                            </div>
                            
                            {/* 🚨 THE FIX: Smart Sorting and DOM Rendering Limit */}
                            {ous
                                .filter(ou => ou.label.toLowerCase().includes(deptSearch.toLowerCase()))
                                .sort((a, b) => {
                                    // 1. Force selected items to always float to the top of the list!
                                    const aSelected = selectedDeptFilter.includes(a.value);
                                    const bSelected = selectedDeptFilter.includes(b.value);
                                    if (aSelected && !bSelected) return -1;
                                    if (!aSelected && bSelected) return 1;
                                    // 2. Otherwise, sort alphabetically
                                    return a.label.localeCompare(b.label);
                                })
                                .slice(0, 50) // 🚨 Only render top 50 matches to prevent browser lag!
                                .map(ou => (
                                <label key={ou.value} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer transition-colors">
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${selectedDeptFilter.includes(ou.value) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-gray-600'
                                        }`}>
                                        {selectedDeptFilter.includes(ou.value) && <Check size={10} />}
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={selectedDeptFilter.includes(ou.value)}
                                        onChange={() => toggleDeptFilter(ou.value)}
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{ou.label}</span>
                                </label>
                            ))}
                            
                            {ous.length > 50 && deptSearch === '' && (
                                <p className="text-xs text-center text-gray-400 mt-2 pt-2 border-t border-gray-100">
                                    Use search to find more departments...
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Role Filter */}
                <select
                    value={selectedRoleFilter}
                    onChange={(e) => setSelectedRoleFilter(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 rounded-xl text-sm transition-all outline-none"
                >
                    <option value="">All Roles</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                    <option value="ADMIN">Admin</option>
                    <option value="USER">Standard User</option>
                </select>

                {/* Status Filter */}
                <select
                    value={selectedStatusFilter}
                    onChange={(e) => setSelectedStatusFilter(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 rounded-xl text-sm transition-all outline-none"
                >
                    <option value="">All Statuses</option>
                    <option value="ACTIVE">Active Only</option>
                    <option value="INACTIVE">Inactive Only</option>
                </select>
            </div>
            {/* 🚨 NEW: Active Filter Chips UI */}
            {selectedDeptFilter.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-4 animate-in fade-in slide-in-from-top-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">Filtered By:</span>
                    {selectedDeptFilter.map(dept => (
                        <span key={dept} className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 rounded-full text-xs font-bold transition-all hover:bg-indigo-100">
                            {dept}
                            <button 
                                onClick={() => toggleDeptFilter(dept)} 
                                className="hover:bg-indigo-200 dark:hover:bg-indigo-800 rounded-full p-0.5 transition-colors"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                    <button 
                        onClick={() => setSelectedDeptFilter([])} 
                        className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors ml-2"
                    >
                        Clear All
                    </button>
                </div>
            )}
        </div>
        
    );

    const renderCharts = () => {
        if (!deptStats || deptStats.length === 0) return null;

        // 🚨 1. PARETO SORTING: Sort departments by headcount (largest first)
        let sortedDepts = [...deptStats].sort((a, b) => b.total - a.total);

        // 🚨 2. SMART GROUPING: If more than 10 OUs, group the rest into "Other Depts"
        let barChartData = sortedDepts;
        if (sortedDepts.length > 10) {
            const top10 = sortedDepts.slice(0, 10);
            const others = sortedDepts.slice(10).reduce((acc, curr) => ({
                name: 'Other Depts',
                total: acc.total + curr.total,
                active: acc.active + curr.active,
                inactive: acc.inactive + curr.inactive
            }), { name: 'Other Depts', total: 0, active: 0, inactive: 0 });
            
            barChartData = [...top10, others];
        }

        // Calculate totals for the Donut Chart
        const totalActive = deptStats.reduce((acc, curr) => acc + curr.active, 0);
        const totalInactive = deptStats.reduce((acc, curr) => acc + curr.inactive, 0);
        const pieData = [
            { name: 'Active', value: totalActive, color: '#10B981' }, 
            { name: 'Inactive', value: totalInactive, color: '#EF4444' } 
        ];

        // Determine if we need to slant the labels based on how many bars there are
        const needsSlant = barChartData.length > 5;

        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 px-4 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* BAR CHART: Users per Department */}
                <div className="lg:col-span-2 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                            Headcount by Department
                        </h3>
                        {sortedDepts.length > 10 && (
                            <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md">
                                Showing Top 10
                            </span>
                        )}
                    </div>
                    <div className="h-56"> {/* Slightly taller to accommodate slanted text */}
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: needsSlant ? 25 : 0 }}>
                                <XAxis 
                                    dataKey="name" 
                                    tick={{fontSize: 11, fill: '#6B7280'}} 
                                    axisLine={false} 
                                    tickLine={false}
                                    interval={0} // 🚨 Forces all labels to show
                                    angle={needsSlant ? -35 : 0} // 🚨 Slants text if there are lots of OUs
                                    textAnchor={needsSlant ? "end" : "middle"}
                                />
                                <YAxis tick={{fontSize: 11, fill: '#6B7280'}} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip 
                                    cursor={{fill: 'rgba(79, 70, 229, 0.05)'}}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                                />
                                {/* 🚨 maxBarSize prevents bars from becoming giant blocks if there are only 2 OUs */}
                                <Bar dataKey="total" fill="#4F46E5" radius={[4, 4, 0, 0]} maxBarSize={45} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* DONUT CHART: Account Status */}
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Overall Status</h3>
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie 
                                    data={pieData} dataKey="value" nameKey="name" 
                                    cx="50%" cy="45%" innerRadius={55} outerRadius={75} paddingAngle={5}
                                >
                                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />)}
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '12px', fontWeight: 'bold' }} />
                                <Legend verticalAlign="bottom" height={20} iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        );
    };

    const renderPagination = () => {
        const totalEntries = totalRecords;
        const displayStart = totalEntries === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
        const displayEnd = Math.min(currentPage * rowsPerPage, totalEntries);

        return (
            <div className="px-4 py-3 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3 bg-gray-50">
                {/* LEFT TEXT */}
                <div className="text-sm text-gray-500">
                    Showing <span className="font-medium text-gray-900">{displayStart}</span> to <span className="font-medium text-gray-900">{displayEnd}</span> of <span className="font-medium text-gray-900">{totalEntries}</span> entries
                </div>

                {/* RIGHT CONTROLS */}
                <div className="flex items-center gap-4">
                    {/* ROWS DROPDOWN */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Rows:</span>
                        <select
                            value={rowsPerPage}
                            onChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
                            className="border border-gray-200 text-sm rounded-md px-2 py-1 focus:outline-none"
                        >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                        </select>
                    </div>

                    {/* PAGINATION BUTTONS */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="px-2 py-1 text-gray-500 hover:bg-gray-200 rounded disabled:opacity-40"
                        >
                            «
                        </button>

                        <button
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-2 py-1 text-gray-500 hover:bg-gray-200 rounded disabled:opacity-40"
                        >
                            ‹
                        </button>

                        <span className="text-sm font-medium px-2">
                            {currentPage} / {totalPages || 1}
                        </span>

                        <button
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages || totalEntries === 0}
                            className="px-2 py-1 text-gray-500 hover:bg-gray-200 rounded disabled:opacity-40"
                        >
                            ›
                        </button>

                        <button
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages || totalEntries === 0}
                            className="px-2 py-1 text-gray-500 hover:bg-gray-200 rounded disabled:opacity-40"
                        >
                            »
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {notification && (
                <Toast
                    message={notification.message}
                    type={notification.type}
                    onClose={() => setNotification(null)}
                />
            )}

            {/* Confirmation Modal */}
            <Modal
                isOpen={confirmDialog.visible}
                onClose={() => setConfirmDialog({ ...confirmDialog, visible: false })}
                title="Confirm Action"
                maxWidth="max-w-md"
                footer={
                    <>
                        <button
                            onClick={() => setConfirmDialog({ ...confirmDialog, visible: false })}
                            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmDialog.onConfirm}
                            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-lg shadow-red-200 dark:shadow-none"
                        >
                            Confirm Delete
                        </button>
                    </>
                }
            >
                <div className="flex items-start gap-4 py-2">
                    <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-full shrink-0">
                        <AlertCircle className="text-red-600 dark:text-red-400" size={24} />
                    </div>
                    <div>
                        <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {confirmDialog.message}
                        </p>
                    </div>
                </div>
            </Modal>

            <UserProfileDialog visible={viewDialog} onHide={hideDialog} viewData={viewData} apiUrl={API_URL} />

            <UserFormDialog
                visible={productDialog} onHide={hideDialog} editMode={editMode} formData={formData}
                setFormData={setFormData} ous={ous} selectedFile={selectedFile}
                setSelectedFile={setSelectedFile} handleSubmit={handleSubmit}
            />

            {/* Conflict/Error Modal */}
            <Modal
                isOpen={conflictDialog}
                onClose={() => setConflictDialog(false)}
                title="Input Conflict"
                maxWidth="max-w-md"
                footer={<button onClick={() => setConflictDialog(false)} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold">OK</button>}
            >
                <div className="flex items-center gap-4 py-4">
                    <AlertCircle className="text-red-500 shrink-0" size={32} />
                    <p className="text-gray-600 dark:text-gray-300 font-medium">{conflictMsg}</p>
                </div>
            </Modal>

            <div className="bg-white dark:bg-gray-800 shadow-xl rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
                {renderHeader()}
                {renderCharts()}

                {/* 🚨 BULK ACTIONS TOOLBAR */}
                {selectedUsers.length > 0 && (
                    <div className="bg-indigo-50 dark:bg-indigo-900/30 border-y border-indigo-100 dark:border-indigo-800 px-6 py-3 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-3">
                            <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-md">
                                {selectedUsers.length} Selected
                            </span>
                            <span className="text-sm font-medium text-indigo-900 dark:text-indigo-300">
                                Apply action to selected users:
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={handleBulkSuspend}
                                className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                            >
                                <AlertCircle size={14} /> Suspend Selected
                            </button>
                            <button 
                                onClick={handleBulkDelete}
                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                            >
                                <Trash2 size={14} /> Delete Selected
                            </button>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                                <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Department</th>
                                <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">User Profile</th>
                                <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Access Role</th>
                                <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">Account Status</th>
                                <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</th>
                                <th className="px-6 py-4 w-12">
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        checked={users.length > 0 && selectedUsers.length === users.length}
                                        onChange={handleSelectAll}
                                    />
                                </th>           
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-4 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                            <p className="text-gray-500 dark:text-gray-400 font-medium">Fetching directory users...</p>
                                        </div>
                                    </td>
                                </tr>
                                
                            // 🚨 CHANGED TO users.length
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-4 py-20 text-center">
                                        <div className="flex flex-col items-center gap-2">
                                            <Search className="text-gray-300 dark:text-gray-600" size={48} />
                                            <p className="text-gray-500 dark:text-gray-400 font-medium">No results matched your filters.</p>
                                            <button
                                                onClick={() => { setGlobalFilter(''); setSelectedDeptFilter([]); setSelectedRoleFilter(''); setSelectedStatusFilter(''); }}
                                                className="text-indigo-600 font-bold text-sm hover:underline mt-2"
                                            >
                                                Clear all filters
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            // 🚨 CHANGED TO users.map
                            ) : users.map((user) => (
                                <tr key={user.uid} className={`transition-colors group ${selectedUsers.includes(user.uid) ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : 'hover:bg-gray-50/50 dark:hover:bg-gray-700/30'}`}>
                                    <td className="px-6 py-4">
                                        <input 
                                            type="checkbox" 
                                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            checked={selectedUsers.includes(user.uid)}
                                            onChange={() => handleSelectOne(user.uid)}
                                        />
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="inline-block text-indigo-600 dark:text-indigo-400 font-bold text-sm bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded uppercase tracking-wider">
                                            {user.department}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-4">
                                            <div className="relative shrink-0">
                                                <img
                                                    src={user.labeledURI ? `${API_URL}/${user.labeledURI}?t=${new Date().getTime()}` : `${API_URL}/uploads/${user.uid}.jpg?t=${new Date().getTime()}`}
                                                    alt={user.firstName}
                                                    className="w-12 h-12 rounded-xl object-cover shadow-sm border border-gray-100 dark:border-gray-700 bg-gray-50"
                                                    onError={(e) => {
                                                        e.target.onerror = null;
                                                        e.target.style.display = 'none';
                                                        e.target.nextSibling.style.display = 'flex';
                                                    }}
                                                />
                                                <div className="hidden w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-base">
                                                    {user.firstName[0]}{user.lastName[0]}
                                                </div>
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="font-bold text-gray-900 dark:text-white text-base truncate">{user.firstName} {user.lastName}</span>
                                                <span className="text-sm text-gray-500 dark:text-gray-400 truncate tracking-tight">{user.uid} • {user.email}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className={`px-3 py-1 rounded-lg text-sm font-semibold border ${user.role === "SUPER_ADMIN" ? 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50' :
                                            user.role === "ADMIN" ? 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/50' :
                                                'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/50'
                                            }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col items-center gap-1.5">
                                            <button
                                                onClick={() => handleToggle(user)}
                                                disabled={!hasWriteAccess}
                                                className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${user.status === 'ACTIVE' ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-700'
                                                    } ${!hasWriteAccess ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${user.status === 'ACTIVE' ? 'translate-x-6' : 'translate-x-0'
                                                    }`} />
                                            </button>
                                            <span className={`text-xs font-bold uppercase tracking-widest ${user.status === 'ACTIVE' ? 'text-green-600 dark:text-green-400' : 'text-gray-400'
                                                }`}>
                                                {user.status}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-right">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-x-2 group-hover:translate-x-0">
                                            <button
                                                onClick={() => openView(user)}
                                                className="p-2 rounded-xl text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                                                title="View Details"
                                            >
                                                <Eye size={18} />
                                            </button>
                                            {hasWriteAccess && (
                                                <>
                                                    <button
                                                        onClick={() => handleEditClick(user)}
                                                        className="p-2 rounded-xl text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                                                        title="Edit User"
                                                    >
                                                        <Pencil size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => confirmDelete(user)}
                                                        className="p-2 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                                        title="Delete User"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {renderPagination()}
            </div>

            {/* Bulk Results Modal */}
            <Modal
                isOpen={bulkDialog}
                onClose={() => setBulkDialog(false)}
                title="Bulk Import Summary"
                maxWidth="max-w-md"
                footer={<button onClick={() => setBulkDialog(false)} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold">Done</button>}
            >
                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-100 dark:border-green-900/50 text-center">
                            <span className="block text-3xl font-bold text-green-600 dark:text-green-400">{bulkReport.success}</span>
                            <span className="text-[10px] font-bold text-green-700 dark:text-green-500 uppercase tracking-wider">Success</span>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-2xl border border-red-100 dark:border-red-900/50 text-center">
                            <span className="block text-3xl font-bold text-red-600 dark:text-red-400">{bulkReport.failed}</span>
                            <span className="text-[10px] font-bold text-red-700 dark:text-red-500 uppercase tracking-wider">Failed</span>
                        </div>
                    </div>

                    {bulkReport.errors.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-[0.1em]">Details & Errors</h4>
                            <div className="max-h-40 overflow-y-auto border border-gray-100 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-900/50">
                                <ul className="space-y-2">
                                    {bulkReport.errors.map((err, i) => (
                                        <li key={i} className="text-xs text-red-600 dark:text-red-400 flex gap-2">
                                            <span className="shrink-0">•</span> {err}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}