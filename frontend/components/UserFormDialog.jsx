import React from 'react';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { Button } from 'primereact/button';

export default function UserFormDialog({ visible, onHide, editMode, formData, setFormData, ous, selectedFile, setSelectedFile, handleSubmit }) {
    return (
        <Dialog visible={visible} style={{ width: '35rem' }} header={editMode ? "Edit User" : "Add New User"} modal className="p-fluid" onHide={onHide}>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                <div className="flex justify-center mb-4">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center w-full bg-gray-50 hover:bg-gray-100 transition cursor-pointer relative">
                        <input type="file" accept="image/*" onChange={(e) => setSelectedFile(e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <i className="pi pi-camera text-2xl text-gray-400 mb-2"></i>
                        <p className="text-sm text-gray-500 font-bold">{selectedFile ? selectedFile.name : "Click to Upload Photo"}</p>
                    </div>
                </div>
                <div className="field">
                    <label className="font-bold text-xs uppercase text-gray-500">Department</label>
                    <Dropdown value={formData.department} onChange={(e) => setFormData({...formData, department: e.value})} options={ous} optionLabel="label" optionValue="value" placeholder="Select Department" disabled={editMode} className="w-full" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="field"> <label className="font-bold text-xs uppercase text-gray-500">First Name</label> <InputText type="text" value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} required className="w-full"/> </div>
                    <div className="field"> <label className="font-bold text-xs uppercase text-gray-500">Last Name</label> <InputText type="text" value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} required className="w-full"/> </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="field"> <label className="font-bold text-xs uppercase text-gray-500">Primary Email</label> <InputText type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required className="w-full"/> </div>
                    <div className="field"> <label className="font-bold text-xs uppercase text-gray-500">Secondary Email</label> <InputText type="email" value={formData.secondaryEmail} onChange={(e) => setFormData({...formData, secondaryEmail: e.target.value})} placeholder="Optional" className="w-full"/> </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="field"> <label className="font-bold text-xs uppercase text-gray-500">User ID</label> <InputText type="text" value={formData.uid} onChange={(e) => setFormData({...formData, uid: e.target.value})} disabled={editMode} className={`w-full ${editMode ? 'bg-gray-100' : ''}`} required /> </div>
                    <div className="field"> <label className="font-bold text-xs uppercase text-gray-500">Mobile</label> <InputText type="tel" maxLength={10} value={formData.mobile} onChange={(e) => { const val = e.target.value.replace(/\D/g, '').slice(0, 10); setFormData({...formData, mobile: val}); }} className="w-full" /> </div>
                </div>
                <div className="field"> <label className="font-bold text-xs uppercase text-gray-500">Password</label> <InputText type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} placeholder={editMode ? "Enter Password" : "Enter Password"} className="w-full"/> </div>
                
                <div className="field bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <label className="font-bold text-xs uppercase text-blue-600 block mb-2">Access Level</label>
                    <Dropdown value={formData.role} onChange={(e) => setFormData({...formData, role: e.value})} options={[{label: 'Standard User', value: 'USER'}, {label: 'Admin', value: 'ADMIN'}, {label: 'Super Admin', value: 'SUPER_ADMIN'}]} placeholder="Select Role" className="w-full"/>
                    {(formData.role === "ADMIN" || formData.role === "SUPER_ADMIN") && (
                        <div className="mt-3">
                            <label className="font-bold text-xs uppercase text-blue-600 block mb-1">Allowed Departments</label>
                            <MultiSelect value={formData.permissions} options={ous} onChange={(e) => setFormData({...formData, permissions: e.value})} optionLabel="label" optionValue="value" placeholder="Select Departments" display="chip" className="w-full bg-white" />
                        </div>
                    )}
                </div>
                <div className="flex gap-2 justify-end mt-4">
                    <Button label="Cancel" icon="pi pi-times" outlined onClick={onHide} type="button" className="p-button-secondary" />
                    <Button label="Save User" icon="pi pi-check" type="submit" className="p-button-primary" />
                </div>
            </form>
        </Dialog>
    );
}