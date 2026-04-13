import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom"; 
import { getAllUsers, getOUs, addUser, editUser, deleteUser, bulkImport, exportUsers } from "../services/adminService";
import { securePayload } from "../utils/encryption";
import { useAuth } from "../context/AuthContext";

// Components
import UserProfileDialog from "../../components/UserProfileDialog";
import UserFormDialog from "../../components/UserFormDialog";

// PrimeReact
import { Toast } from 'primereact/toast'; 
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { Avatar } from 'primereact/avatar';
import { InputSwitch } from 'primereact/inputswitch'; 
import { Dialog } from 'primereact/dialog'; 
import { MultiSelect } from 'primereact/multiselect'; 
import { Dropdown } from 'primereact/dropdown';
import { SplitButton } from 'primereact/splitbutton'; 
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Badge } from 'primereact/badge'; 

const API_URL = import.meta.env.VITE_API_URL;

export default function Admin() {
  const { auth } = useAuth();
  const toast = useRef(null);
  const navigate = useNavigate();

  const hasWriteAccess = auth.canWrite || 
                         (auth.role && ["SUPER_ADMIN", "ADMIN"].includes(auth.role.toUpperCase()));
  
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState([]); 
  const [selectedRoleFilter, setSelectedRoleFilter] = useState(null);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState(null);
  const [ous, setOus] = useState([]); 
  
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

  const initialForm = { 
    firstName: "", lastName: "", email: "", secondaryEmail: "", 
    mobile: "", uid: "", password: "", department: "", title: "", 
    role: "USER", permissions: [] 
  };
  const [formData, setFormData] = useState(initialForm);

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
        const ouRes = await getOUs();
        setOus(ouRes.data.map(name => ({ label: name, value: name }))); 

        const userRes = await getAllUsers();
        const processed = userRes.data.map(u => ({
            ...u,
            status: (Array.isArray(u.employeeType) ? u.employeeType[0] : u.employeeType || "ACTIVE").toUpperCase(),
            role: (Array.isArray(u.businessCategory) ? u.businessCategory[0] : u.businessCategory || "USER").toUpperCase(),
            cn: Array.isArray(u.cn) ? u.cn[0] : u.cn,
            uid: Array.isArray(u.uid) ? u.uid[0] : u.uid,
            email: Array.isArray(u.mail) ? u.mail[0] : u.mail, 
            department: u.department || "General",
            createTimestamp: u.createTimestamp || "00000000000000Z", 
            secondaryEmail: Array.isArray(u.description) ? u.description[0] : (u.description || ""),
        }));
        processed.sort((a, b) => (a.createTimestamp < b.createTimestamp ? 1 : -1));
        setUsers(processed);
    } catch (err) {
        console.error("Load failed", err);
    } finally {
        setLoading(false);
    }
  };

  const getFilteredUsers = () => {
      return users.filter(u => {
          if (selectedDeptFilter && selectedDeptFilter.length > 0 && !selectedDeptFilter.includes(u.department)) return false;
          if (selectedRoleFilter && u.role !== selectedRoleFilter) return false;
          if (selectedStatusFilter && u.status !== selectedStatusFilter) return false;
          return true;
      });
  };

  const filteredData = getFilteredUsers(); 

  const handleToggle = async (user) => {
      if (!hasWriteAccess) return;
      const currentStatus = user.status;
      const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE"; 
      
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, status: newStatus } : u));
      try {
          const data = new FormData();
          const { payload, key, iv } = await securePayload({ uid: user.uid, employeeType: newStatus, role: user.role, email: user.email });
          data.append("payload", payload);
          data.append("key", key);
          data.append("iv", iv);
          
          await editUser(data); 
          toast.current.show({ severity: 'success', summary: newStatus, detail: `${user.firstName} ${user.lastName} is now ${newStatus}`, life: 3000 });
      } catch (err) {
          const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message;
          setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, status: currentStatus } : u));
          toast.current.show({ severity: 'error', summary: 'Validation Error', detail: errorMessage });
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
          const data = new FormData();
          const textPayload = { ...formData };
          if (textPayload.permissions.length > 0 && ["ADMIN", "SUPER_ADMIN"].includes(textPayload.role)) {
              textPayload.permissions = "ALLOW:" + textPayload.permissions.join(",");
          }

          const { payload, key, iv } = await securePayload(textPayload);
          data.append("payload", payload); data.append("key", key); data.append("iv", iv); data.append("uid", textPayload.uid);
          if (selectedFile) data.append("photo", selectedFile);

          if (editMode) await editUser(data);
          else await addUser(data);

          toast.current.show({ severity: 'success', summary: 'Success', detail: `User ${actionMsg}`, life: 3000 });
          setProductDialog(false);
          loadAllData();
      } catch (err) {
          if (err.response?.status === 400) { setConflictMsg(err.response.data.message); setConflictDialog(true); } 
          else { toast.current.show({ severity: 'error', summary: 'Error', detail: 'Operation Failed' }); }
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
          toast.current.show({ severity: 'error', summary: 'Import Failed', detail: err.message });
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
          toast.current.show({ severity: 'error', summary: 'Export Error', detail: 'Could not download file.' });
      }
  };

  const confirmDelete = (user) => { confirmDialog({ message: `Delete ${user.uid}?`, header: 'Confirm', icon: 'pi pi-exclamation-triangle', acceptClassName: 'p-button-danger', accept: () => handleDelete(user) }); };
  const handleDelete = async (user) => { 
      try { 
          await deleteUser(user.uid); 
          toast.current.show({ severity: 'success', summary: 'Deleted', detail: 'User removed' }); 
          loadAllData(); 
      } catch (err) { toast.current.show({ severity: 'error', summary: 'Error', detail: 'Delete Failed' }); }
  };

  // --- TEMPLATES ---
  const userBodyTemplate = (r) => (
      <div className="flex align-items-center gap-3">
          <Avatar image={`${API_URL}/uploads/${r.uid}.jpg?t=${new Date().getTime()}`} icon="pi pi-user" shape="circle" size="large" className="bg-blue-50 text-blue-500" onError={(e) => { e.target.src = ''; e.target.style.display = 'none'; }} />
          <div className="flex flex-col">
              <span className="font-bold text-gray-800 text-sm">{r.firstName} {r.lastName}</span>
              <span className="text-xs text-gray-500">{r.uid}</span>
          </div>
      </div>
  );
  
  const roleBodyTemplate = (r) => <Tag value={r.role} severity={r.role === "SUPER_ADMIN" ? "danger" : r.role === "ADMIN" ? "warning" : "info"} />;
  
  const statusBodyTemplate = (r) => (
      <div className="flex items-center gap-2">
        <InputSwitch checked={r.status === "ACTIVE"} onChange={() => handleToggle(r)} disabled={!hasWriteAccess} />
        <span className={`text-xs font-bold ${r.status === "ACTIVE" ? 'text-green-600' : 'text-gray-400'}`}>{r.status}</span>
      </div>
  );

  const actionBodyTemplate = (r) => (
      <div className="flex gap-2">
          <Button icon="pi pi-eye" rounded text severity="info" onClick={() => openView(r)} />
          {hasWriteAccess && (
              <>
                  <Button icon="pi pi-pencil" rounded text severity="secondary" onClick={() => handleEditClick(r)} />
                  <Button icon="pi pi-trash" rounded text severity="danger" onClick={() => confirmDelete(r)} />
              </>
          )}
      </div>
  );

  // --- HEADER SECTION ---
  const header = (
    <div className="flex flex-col gap-4 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-800 m-0">Total Users</h2>
                <Badge value={filteredData.length} severity="info" className="text-sm font-bold"></Badge>
            </div>
            <div className="flex gap-2">
                 {hasWriteAccess && (
                    <>
                        <Button label="Add User" icon="pi pi-plus" size="small" onClick={openNew} />
                        {(auth.role || "").toUpperCase() === "SUPER_ADMIN" && (
                            <Button label="Manage Depts" icon="pi pi-sitemap" size="small" severity="help" outlined onClick={() => navigate("/departments")} />
                        )}
                        <SplitButton label="Actions" icon="pi pi-cog" model={[
                                { label: 'Import Excel', icon: 'pi pi-upload', command: () => fileUploadRef.current.click() },
                                { label: 'Export Excel', icon: 'pi pi-download', command: handleExport }
                            ]} severity="secondary" outlined size="small"
                        />
                         <input type="file" ref={fileUploadRef} style={{ display: 'none' }} accept=".xlsx, .xls, .csv" onChange={handleBulkImport} />
                    </>
                 )}
            </div>
        </div>

        <div className="flex flex-wrap gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
             <span className="p-input-icon-left grow">
                <i className="pi pi-search" />
                <InputText type="search" onInput={(e) => setGlobalFilter(e.target.value)} placeholder="Search Name, ID, Email..." className="w-full" />
            </span>
            <MultiSelect value={selectedDeptFilter} onChange={(e) => setSelectedDeptFilter(e.value || [])} options={ous} optionLabel="label" optionValue="value" placeholder="Filter Deptartments" display="chip" showClear className="w-60" />
            <Dropdown value={selectedRoleFilter} onChange={(e) => setSelectedRoleFilter(e.value)} options={[{label: 'Super Admin', value: 'SUPER_ADMIN'}, {label: 'Admin', value: 'ADMIN'}, {label: 'User', value: 'USER'}]} showClear placeholder="Role" className="w-32" />
            <Dropdown value={selectedStatusFilter} onChange={(e) => setSelectedStatusFilter(e.value)} options={[{label: 'Active', value: 'ACTIVE'}, {label: 'Inactive', value: 'INACTIVE'}]} showClear placeholder="Status" className="w-56" />
        </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Toast ref={toast} position="top-right" />
      <ConfirmDialog />
      
      {/* 🚨 Cleaned up: Using our new components! */}
      <UserProfileDialog visible={viewDialog} onHide={hideDialog} viewData={viewData} apiUrl={API_URL} />
      
      <UserFormDialog 
          visible={productDialog} onHide={hideDialog} editMode={editMode} formData={formData} 
          setFormData={setFormData} ous={ous} selectedFile={selectedFile} 
          setSelectedFile={setSelectedFile} handleSubmit={handleSubmit} 
      />
      
      <Dialog visible={conflictDialog} onHide={() => setConflictDialog(false)} header="Error" modal footer={<Button label="OK" severity="danger" onClick={() => setConflictDialog(false)} />} style={{ width: '400px' }}>
         <div className="flex align-items-center gap-3">
            <i className="pi pi-exclamation-triangle text-red-500 text-4xl" />
            <div><p className="font-bold text-gray-800 text-lg">Input Conflict</p><p className="text-gray-600 mt-1">{conflictMsg}</p></div>
         </div>
      </Dialog>
      
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <DataTable value={filteredData} loading={loading} paginator rows={10} globalFilter={globalFilter} globalFilterFields={['cn', 'firstName', 'lastName', 'uid', 'email', 'secondaryEmail', 'mobile', 'department']} header={header} emptyMessage="No users found." stripedRows tableStyle={{ minWidth: '60rem' }} sortField="createTimestamp" sortOrder={-1}>
                <Column field="department" header="Department" body={(r) => <span className="text-blue-600 font-bold text-xs">{r.department}</span>} sortable></Column>
                <Column header="User" body={userBodyTemplate} sortable field="cn"></Column>
                <Column header="Role" body={roleBodyTemplate} sortable field="role"></Column>
                <Column header="Status" body={statusBodyTemplate} sortable field="status"></Column>
                <Column body={actionBodyTemplate}></Column>
            </DataTable>
      </div>
      
      <Dialog visible={bulkDialog} onHide={() => setBulkDialog(false)} header="Bulk Import Results" modal style={{ width: '500px' }}>
        <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center bg-gray-100 p-3 rounded">
                <div className="text-center"><span className="block text-2xl font-bold text-green-600">{bulkReport.success}</span><span className="text-xs font-bold text-gray-500 uppercase">Success</span></div>
                <div className="text-center"><span className="block text-2xl font-bold text-red-600">{bulkReport.failed}</span><span className="text-xs font-bold text-gray-500 uppercase">Failed</span></div>
            </div>
            {bulkReport.errors.length > 0 && (
                <div className="max-h-60 overflow-y-auto border p-2 rounded bg-red-50 text-xs">
                    <ul className="list-disc pl-4 space-y-1 text-red-600">
                        {bulkReport.errors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                </div>
            )}
            <Button label="Close" onClick={() => setBulkDialog(false)} />
        </div>
      </Dialog>
    </div>
  );
}