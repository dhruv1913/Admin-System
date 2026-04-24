import { useEffect, useState } from "react";
import Toast from "../../components/ui/Toast";
import { Plus } from "lucide-react";
import {
    getDepartments,
    createDepartment,
    deleteDepartment,
} from "../services/departmentService";
import { securePayload } from "../utils/encryption";
import { useNavigate } from "react-router-dom";

export default function Departments() {
    const [depts, setDepts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogVisible, setDialogVisible] = useState(false);
    const [newDeptName, setNewDeptName] = useState("");
    const [search, setSearch] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    const navigate = useNavigate();

    const [notification, setNotification] = useState(null);

    const showToast = (message, type = 'success') => {
        setNotification({ message, type });
    };

    useEffect(() => {
        fetchDepts();
    }, []);

    const fetchDepts = async () => {
        setLoading(true);
        try {
            const res = await getDepartments();
            setDepts(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newDeptName.trim()) return;

        const { payload, key, iv } = await securePayload({
            ouName: newDeptName,
        });

        await createDepartment({ payload, key, iv });
        setDialogVisible(false);
        setNewDeptName("");
        fetchDepts();
    };

    const handleDelete = async (dept) => {
        try {
            // 🔍 Check your browser console! 
            // Make sure the dept.name you clicked matches the one printed here!
            console.log("Attempting to delete:", dept); 
            
            const encryptedData = await securePayload({ 
                ouName: dept.name, 
                name: dept.name,
                dn: dept.dn 
            });
            
            await deleteDepartment(encryptedData);
            
            showToast(`${dept.name} is deleted successfully`, 'success');
            fetchDepts();
        } catch (err) {
            console.error("Delete failed:", err);
            
            // 🚨 THE FIX: Extract the exact error message from the backend!
            const errorMessage = err.response?.data?.message || `Failed to delete ${dept.name}`;
            
            // This will now pop up saying "Cannot delete: Department contains users or nested OUs"
            showToast(errorMessage, 'error'); 
        }
    };

    const filtered = depts.filter((d) =>
        d.name.toLowerCase().includes(search.toLowerCase())
    );

    // Pagination calculations
    const totalEntries = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalEntries / rowsPerPage));
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalEntries);
    const displayed = filtered.slice(startIndex, endIndex);
    const displayStart = totalEntries === 0 ? 0 : startIndex + 1;
    const displayEnd = totalEntries === 0 ? 0 : endIndex;

    // Reset to first page when search or rowsPerPage changes
    useEffect(() => {
        setCurrentPage(1);
    }, [search, rowsPerPage]);

    // Clamp current page when data or rowsPerPage changes
    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [totalPages]);

    return (
        <div className="py-4 w-full">
            {notification && (
                <Toast
                    message={notification.message}
                    type={notification.type}
                    onClose={() => setNotification(null)}
                />
            )}

            <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100 w-full">

                {/* HEADER */}
                <div className="px-4 py-5 border-b border-gray-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate("/dashboard")}
                            className="p-2 rounded-full hover:bg-gray-100"
                        >
                            ←
                        </button>
                        <h2 className="text-lg font-bold text-gray-900">
                            Back to Dashboard
                        </h2>
                    </div>

                    <button
                        onClick={() => setDialogVisible(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-200 dark:shadow-none hover:scale-105 active:scale-95"
                    >
                        <Plus size={18} /> New Department
                    </button>
                </div>

                {/* TOP BAR */}
                <div className="px-4 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-base font-bold text-gray-900">
                        Departments List
                    </h3>

                    <div className="relative w-56">
                        <input
                            type="text"
                            placeholder="Search..."
                            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                            🔍
                        </span>
                    </div>
                </div>

                {/* TABLE */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="px-4 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-left">
                                        Department Name
                                    </th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">
                                        Total Users
                                    </th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">
                                        Active
                                    </th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">
                                        Inactive
                                    </th>
                                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">
                                        Action</th>
                                </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                <tr>
                                    <td colSpan="5" className="text-center py-8">
                                        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                                    </td>
                                </tr>
                            ) : totalEntries === 0 ? (
                                <tr>
                                    <td colSpan="5" className="text-center py-6 text-gray-500">
                                        No departments found.
                                    </td>
                                </tr>
                            ) : (
                                displayed.map((d, i) => (
                                    <tr key={i} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 text-sm font-medium text-gray-700">
                                            {d.name}
                                        </td>

                                        <td className="px-4 py-2 text-sm text-center font-semibold">
                                            {d.total}
                                        </td>

                                        <td className="px-4 py-2 text-center">
                                            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700">
                                                {d.active}
                                            </span>
                                        </td>

                                        <td className="px-4 py-2 text-center">
                                            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700">
                                                {d.inactive}
                                            </span>
                                        </td>

                                        <td className="px-4 py-2 text-center">
                                           <button
    // 🚨 THE FIX: If total is completely missing, treat it as 0. 
    disabled={parseInt(d.total || 0, 10) > 0 || parseInt(d.active || 0, 10) > 0}
    onClick={() => handleDelete(d)} 
    aria-label={`Delete ${d.name}`}
    className="text-red-600 hover:text-red-700 disabled:opacity-30 p-2 rounded-full hover:bg-red-50 transition-colors"
>
    
                                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                                    <polyline points="3 6 5 6 21 6" />
                                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                                    <path d="M10 11v6" />
                                                    <path d="M14 11v6" />
                                                    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* 🔥 PAGINATION BAR (UI ONLY) */}
                <div className="px-4 py-3 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3 bg-gray-50">

                    {/* LEFT TEXT */}
                    <div className="text-sm text-gray-500">
                        Showing <span className="font-medium text-gray-900">{displayStart}</span> to <span className="font-medium text-gray-900">{displayEnd}</span> of <span className="font-medium text-gray-900">{totalEntries}</span> entries
                    </div>

                    {/* RIGHT CONTROLS */}
                    <div className="flex items-center gap-4">

                        {/* ROWS */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">Rows:</span>
                            <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); }} className="border border-gray-200 text-sm rounded-md px-2 py-1 focus:outline-none">
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
                                {currentPage} / {totalPages}
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
            </div>

            {/* MODAL */}
            {dialogVisible && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
                    <div className="bg-white rounded-lg w-80 p-6 shadow-lg">
                        <h3 className="text-lg font-semibold mb-4">
                            Create Department
                        </h3>

                        <input
                            value={newDeptName}
                            onChange={(e) => setNewDeptName(e.target.value)}
                            placeholder="Department Name"
                            className="w-full border px-3 py-2 rounded-md mb-4"
                        />

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setDialogVisible(false)}
                                className="px-3 py-1 text-gray-600"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={handleCreate}
                                className="bg-blue-600 text-white px-3 py-1 rounded-md"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}