import { useEffect, useState } from "react";
import { getSessionLogs, getAuditLogs } from "../services/logService";
import { Search, Monitor, Globe, Clock, ShieldCheck } from "lucide-react";

export default function Logs() {
    const [sessionLogs, setSessionLogs] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("sessions");
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [search, setSearch] = useState("");

    useEffect(() => {
        fetchLogs();
    }, []);

   const fetchLogs = async () => {
        setLoading(true);
        try {
            const [res1, res2] = await Promise.all([
                getSessionLogs(),
                getAuditLogs()
            ]);

            // 🚨 THE FIX: Aggressively hunt down the array inside the response object
            const extractArray = (res) => {
                if (!res) return [];
                if (Array.isArray(res)) return res; 
                if (Array.isArray(res.data)) return res.data; 
                if (Array.isArray(res.data?.data)) return res.data.data; 
                return [];
            };

            setSessionLogs(extractArray(res1));
            setAuditLogs(extractArray(res2));
        } catch (err) {
            console.error("Failed to fetch logs", err);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (isoString) => {
        if (!isoString) return "-";
        return new Date(isoString).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: true
        });
    };

    const currentLogs = activeTab === "sessions" ? sessionLogs : auditLogs;

    const filteredLogs = currentLogs.filter(log => {
        const q = search.toLowerCase();
        if (!q) return true;
        // 🚨 FIX: Allow searching by username OR ldap_uid
        return (
            ((log.username || log.ldap_uid || "").toLowerCase().includes(q)) ||
            ((log.ip_address || "").toLowerCase().includes(q)) ||
            ((log.audit_msg || "").toLowerCase().includes(q))
        );
    });

    const totalRecords = filteredLogs.length;
    const totalPages = Math.ceil(totalRecords / rowsPerPage);
    const paginatedLogs = filteredLogs.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, search, rowsPerPage]);

    return (
        <div className="space-y-4">
            {/* Header & Tabs */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-5 border-b border-gray-100 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl text-indigo-600 dark:text-indigo-400">
                            <Clock size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Activity Logs</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Track session history and administrative changes</p>
                        </div>
                    </div>

                    <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">
                        <button
                            onClick={() => setActiveTab("sessions")}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "sessions"
                                ? "bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
                                }`}
                        >
                            User Sessions
                        </button>
                        <button
                            onClick={() => setActiveTab("audit")}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "audit"
                                ? "bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
                                }`}
                        >
                            Admin Actions
                        </button>
                    </div>
                </div>

                {/* Sub Header / Filters */}
                <div className="px-4 py-4 bg-gray-50/50 dark:bg-gray-900/30 flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search logs..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                    </div>
                </div>

                {/* Table Area */}
                <div className="overflow-x-auto min-h-100">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                                {activeTab === "sessions" ? (
                                    <>
                                        <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">User / IP</th>
                                        <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">System</th>
                                        <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">Status</th>
                                        <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Login Time</th>
                                        <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Logout Time</th>
                                    </>
                                ) : (
                                    <>
                                        <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16 text-center">ID</th>
                                        <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Admin / IP</th>
                                        <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action Details</th>
                                        <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Timestamp</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                            {loading ? (
                                <tr>
                                    <td colSpan="10" className="text-center py-12">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"></div>
                                            <p className="text-gray-500 font-medium">Fetching logs...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedLogs.length === 0 ? (
                                <tr>
                                    <td colSpan="10" className="text-center py-6">
                                        <p className="text-gray-500 dark:text-gray-400 font-medium">No logs found for this period.</p>
                                    </td>
                                </tr>
                            ) : paginatedLogs.map((log, index) => (
                                <tr key={log.id || index} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/30 transition-colors">
                                    {activeTab === "sessions" ? (
                                        <>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-col">
                                                    {/* 🚨 FIX: Extract username instead of ldap_uid */}
                                                    <span className="font-bold text-gray-900 dark:text-white text-sm">{log.username || log.ldap_uid || "Unknown"}</span>
                                                    <span className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                        <Globe size={10} /> {log.ip_address}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    <Monitor size={18} className="text-gray-400" />
                                                    <div className="flex flex-col">
                                                        {/* 🚨 FIX: Correct browser and OS properties */}
                                                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{log.browser || log.browser_name || "System"} {log.browser_version || ""}</span>
                                                        <span className="text-[10px] text-gray-500 dark:text-gray-400">{log.os || log.browser_plateform || "Unknown"}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase ${log.status === 'ACTIVE'
                                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                                    }`}>
                                                    {log.status || log.login_type || "N/A"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{formatTime(log.login_time)}</span>
                                            </td>
                                            <td className="px-4 py-4">
                                                {log.logout_time ? (
                                                    <span className="text-xs text-gray-600 dark:text-gray-400">{formatTime(log.logout_time)}</span>
                                                ) : (
                                                    <span className="text-xs font-bold text-green-600">Active Now</span>
                                                )}
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-4 py-2 text-center">
                                                <span className="text-xs text-gray-400 font-mono">#{log.id}</span>
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-gray-900 dark:text-white text-sm">{log.username || log.ldap_uid}</span>
                                                    <span className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                        <Globe size={10} /> {log.ip_address}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-3">
                                                    <ShieldCheck size={18} className="text-indigo-500 shrink-0" />
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{log.action || log.audit_msg}</p>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{formatTime(log.timestamp || log.inserted_on)}</span>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-4 py-3 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3 bg-gray-50">
                    <div className="text-sm text-gray-500">
                        Showing <span className="font-medium text-gray-900">{totalRecords === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1}</span> to <span className="font-medium text-gray-900">{Math.min(currentPage * rowsPerPage, totalRecords)}</span> of <span className="font-medium text-gray-900">{totalRecords}</span> entries
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">Rows:</span>
                            <select value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value))} className="border border-gray-200 text-sm rounded-md px-2 py-1 focus:outline-none">
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-1">
                            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-2 py-1 text-gray-500 hover:bg-gray-200 rounded disabled:opacity-40">«</button>
                            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2 py-1 text-gray-500 hover:bg-gray-200 rounded disabled:opacity-40">‹</button>
                            <span className="text-sm font-medium px-2">{currentPage} / {totalPages || 1}</span>
                            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalRecords === 0} className="px-2 py-1 text-gray-500 hover:bg-gray-200 rounded disabled:opacity-40">›</button>
                            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || totalRecords === 0} className="px-2 py-1 text-gray-500 hover:bg-gray-200 rounded disabled:opacity-40">»</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}