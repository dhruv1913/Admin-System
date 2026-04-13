import React from 'react';
import { Dialog } from 'primereact/dialog';
import { Avatar } from 'primereact/avatar';
import { Tag } from 'primereact/tag';

export default function UserProfileDialog({ visible, onHide, viewData, apiUrl }) {
    if (!viewData) return null;

    return (
        <Dialog visible={visible} style={{ width: '30rem' }} header="User Profile" modal onHide={onHide} className="p-fluid">
            <div className="flex flex-col items-center">
                <div className="mb-6 text-center">
                    <Avatar image={`${apiUrl}/uploads/${viewData.uid}.jpg?t=${Date.now()}`} icon="pi pi-user" size="xlarge" shape="circle" className="w-24 h-24 mb-2 shadow-lg border-2 border-white" />
                    <h2 className="text-2xl font-bold text-gray-800">{viewData.firstName} {viewData.lastName}</h2>
                    <Tag value={viewData.role} severity={viewData.role === 'SUPER_ADMIN' ? 'danger' : viewData.role === 'ADMIN' ? 'warning' : 'info'} />
                </div>
                <div className="w-full bg-gray-50 p-4 rounded-lg space-y-3 border border-gray-200">
                    <div className="flex justify-between border-b pb-2"><span className="text-gray-500 text-sm font-bold">User ID</span><span className="text-gray-800 font-mono">{viewData.uid}</span></div>
                    <div className="flex justify-between border-b pb-2"><span className="text-gray-500 text-sm font-bold">Department</span><span className="text-blue-600 font-bold">{viewData.department}</span></div>
                    <div className="flex justify-between border-b pb-2"><span className="text-gray-500 text-sm font-bold">Email</span><span className="text-gray-800">{viewData.email}</span></div>
                    {viewData.secondaryEmail && (<div className="flex justify-between border-b pb-2"><span className="text-gray-500 text-sm font-bold">Secondary Email</span><span className="text-gray-800 italic">{viewData.secondaryEmail}</span></div>)}
                    <div className="flex justify-between border-b pb-2"><span className="text-gray-500 text-sm font-bold">Mobile</span><span className="text-gray-800">{viewData.mobile || "N/A"}</span></div>
                    <div className="flex justify-between items-center"><span className="text-gray-500 text-sm font-bold">Account Status</span><span className={`font-bold ${viewData.status === 'ACTIVE' ? 'text-green-600' : 'text-red-600'}`}>{viewData.status}</span></div>
                    {viewData.departmentNumber && viewData.departmentNumber.toString().includes("ALLOW") && (
                            <div className="mt-3 pt-2 border-t border-gray-300">
                            <span className="text-gray-500 text-xs font-bold block mb-1">ACCESS PERMISSIONS</span>
                            <p className="text-xs text-gray-600 break-word bg-white p-2 rounded border">{viewData.departmentNumber.toString().replace("ALLOW:", "").split(",").join(", ")}</p>
                        </div>
                    )}
                </div>
            </div>
        </Dialog>
    );
}