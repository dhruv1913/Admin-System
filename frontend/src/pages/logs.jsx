import { useEffect, useState } from "react";
import { getSessionLogs, getAuditLogs } from "../services/logService";
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { TabView, TabPanel } from 'primereact/tabview'; 

export default function Logs() {
  const [sessionLogs, setSessionLogs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

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
        setSessionLogs(res1.data);
        setAuditLogs(res2.data);
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

  const timeTemplate = (r) => formatTime(r.login_time || r.active_time);
  const logoutTemplate = (r) => formatTime(r.logout_time);
  const typeTemplate = (r) => <Tag value={r.login_type} severity={r.login_type === "LOGIN" ? "success" : "danger"} />;
  
  const systemTemplate = (r) => (
      <div className="flex flex-col text-xs">
          <span className="font-bold">{r.browser_name} {r.browser_version}</span>
          <span className="text-gray-500">{r.browser_plateform}</span>
      </div>
  );

  const auditTimeTemplate = (r) => formatTime(r.inserted_on);

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm">
        <TabView>
            <TabPanel header="User Sessions">
                <DataTable value={sessionLogs} loading={loading} paginator rows={10} stripedRows size="small">
                    <Column field="id" header="ID" sortable style={{ width: '5%' }} />
                    <Column field="ldap_uid" header="User" sortable style={{ width: '10%', fontWeight: 'bold' }} />
                    <Column field="ip_address" header="IP" style={{ width: '10%' }} />
                    <Column header="System" body={systemTemplate} style={{ width: '15%' }} />
                    <Column field="login_type" header="Action" body={typeTemplate} sortable style={{ width: '10%' }} />
                    <Column field="login_time" header="Login Time" body={timeTemplate} sortable style={{ width: '15%' }} />
                    <Column 
    field="logout_time" 
    header="Logout Time" 
    body={(r) => r.logout_time 
        ? new Date(r.logout_time).toLocaleString() 
        : <span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded">Still Active</span>
    } 
    sortable 
    style={{ width: '15%' }} 
/>
                </DataTable>
            </TabPanel>

            <TabPanel header="Admin Actions">
                <DataTable value={auditLogs} loading={loading} paginator rows={10} stripedRows size="small">
                    <Column field="id" header="ID" sortable style={{ width: '5%' }} />
                    <Column field="ldap_uid" header="Performed By" sortable style={{ width: '15%', fontWeight: 'bold' }} />
                    <Column field="ip_address" header="IP Address" style={{ width: '15%' }} />
                    <Column field="audit_msg" header="Action Details" style={{ width: '45%' }} />
                    <Column field="inserted_on" header="Time" body={auditTimeTemplate} sortable style={{ width: '20%' }} />
                </DataTable>
            </TabPanel>
        </TabView>
    </div>
  );
}