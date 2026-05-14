import { useEffect, useState } from "react";
import Toast from "../../components/ui/Toast";
import { Plus, Pencil } from "lucide-react";
import {
    getDepartments,
    createDepartment,
    deleteDepartment,
    updateDepartment,
} from "../services/departmentService";
import { securePayload } from "../utils/encryption";
import { useNavigate } from "react-router-dom";
// 🚨 FIX 1: Import useAuth so we can check the user's role
import { useAuth } from "../context/AuthContext";

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, isBusy, message }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden transform transition-all animate-in zoom-in duration-300">
                <div className="p-6">
                    <h3 className="text-xl font-bold mb-4 text-red-500">
                        Delete Department?
                    </h3>

                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6">
                        {message}
                    </p>

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            disabled={isBusy}
                            className="px-6 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isBusy}
                            className="px-6 py-2 text-sm font-bold text-white rounded-lg transition-all active:scale-95 bg-red-600 hover:bg-red-700 shadow-md shadow-red-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isBusy ? 'Wait...' : 'Delete'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function Departments() {
    const [depts, setDepts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogVisible, setDialogVisible] = useState(false);
    const [newDeptName, setNewDeptName] = useState("");
    const [search, setSearch] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [confirmDialog, setConfirmDialog] = useState({ visible: false, message: "", dept: null });
    const [editingDept, setEditingDept] = useState(null);

    const navigate = useNavigate();
    const [notification, setNotification] = useState(null);

    // 🚨 FIX 2: Grab the auth object from the context
    const { auth } = useAuth();

    // Now it knows exactly what 'auth' is!
    const isSuperAdmin = auth?.role === 'SUPER_ADMIN' || auth?.role === 'super_admin';

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

    const handleEdit = async () => {
        if (!newDeptName.trim() || !editingDept) return;

        const { payload, key, iv } = await securePayload({
            oldName: editingDept.name,
            newName: newDeptName,
        });

        try {
            await updateDepartment({ payload, key, iv });
            showToast(`${editingDept.name} renamed to ${newDeptName} successfully`, 'success');
            setDialogVisible(false);
            setNewDeptName("");
            setEditingDept(null);
            fetchDepts();
        } catch (err) {
            console.error("Rename failed:", err);
            const errorMessage = err.response?.data?.message || `Failed to rename ${editingDept.name}`;
            showToast(errorMessage, 'error');
        }
    };

    const openEdit = (dept) => {
        setEditingDept(dept);
        setNewDeptName(dept.name);
        setDialogVisible(true);
    };

    const openCreate = () => {
        setEditingDept(null);
        setNewDeptName("");
        setDialogVisible(true);
    };

    const confirmDelete = (dept) => {
        setConfirmDialog({
            visible: true,
            message: `Are you sure you want to delete the department "${dept.name}"? This action cannot be undone.`,
            dept: dept
        });
    };

    const executeDelete = async () => {
        if (!confirmDialog.dept) return;
        await handleDelete(confirmDialog.dept);
        setConfirmDialog({ visible: false, message: "", dept: null });
    };

    const handleDelete = async (dept) => {
        try {
            console.log("Attempting to delete:", dept);

            const encryptedData = await securePayload({
                ouName: dept.name,
                name: dept.name,
                dn: dept.dn
            });

            await deleteDepartment(encryptedData);

            showToast(`${dept.name} department is deleted successfully`, 'success');
            fetchDepts();
        } catch (err) {
            console.error("Delete failed:", err);

            const errorMessage = err.response?.data?.message || `Failed to delete ${dept.name}`;
            showToast(errorMessage, 'error');
        }
    };

    const filtered = depts.filter((d) =>
        d.name.toLowerCase().includes(search.toLowerCase())
    );

    const totalEntries = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalEntries / rowsPerPage));
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalEntries);
    const displayed = filtered.slice(startIndex, endIndex);
    const displayStart = totalEntries === 0 ? 0 : startIndex + 1;
    const displayEnd = totalEntries === 0 ? 0 : endIndex;

    useEffect(() => {
        setCurrentPage(1);
    }, [search, rowsPerPage]);

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
                        onClick={openCreate}
                        disabled={!isSuperAdmin}
                        title={!isSuperAdmin ? "Only Super Admins can create departments" : ""}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${isSuperAdmin
                            ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 dark:shadow-none hover:scale-105 active:scale-95"
                            : "bg-gray-200 text-gray-400 cursor-not-allowed"
                            }`}
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
                                    Action
                                </th>
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
                                                onClick={() => openEdit(d)}
                                                aria-label={`Edit ${d.name}`}
                                                className="text-indigo-600 hover:text-indigo-700 p-2 rounded-full hover:bg-indigo-50 transition-colors"
                                            >
                                                <Pencil size={18} />
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
                    <div className="text-sm text-gray-500">
                        Showing <span className="font-medium text-gray-900">{displayStart}</span> to <span className="font-medium text-gray-900">{displayEnd}</span> of <span className="font-medium text-gray-900">{totalEntries}</span> entries
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">Rows:</span>
                            <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); }} className="border border-gray-200 text-sm rounded-md px-2 py-1 focus:outline-none">
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                            </select>
                        </div>

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
                            {editingDept ? 'Edit Department' : 'Create Department'}
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
                                onClick={editingDept ? handleEdit : handleCreate}
                                className="bg-blue-600 text-white px-3 py-1 rounded-md"
                            >
                                {editingDept ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <DeleteConfirmationModal
                isOpen={confirmDialog.visible}
                onClose={() => setConfirmDialog({ visible: false, message: "", dept: null })}
                onConfirm={executeDelete}
                message={confirmDialog.message}
                isBusy={loading}
            />
        </div>
    );
}