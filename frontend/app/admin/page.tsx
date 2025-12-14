'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import apiClient from '@/lib/api';
import { authService } from '@/lib/auth';
import Navbar from '@/components/Navbar';

interface User {
  id: string;
  username: string;
  email: string | null;
  fullName: string | null;
  role: 'ADMIN' | 'PROJECT_MANAGER' | 'QC' | 'WIS';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  username: string;
  password: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'PROJECT_MANAGER' | 'QC' | 'WIS';
  isActive: boolean;
}

const initialFormData: FormData = {
  username: '',
  password: '',
  email: '',
  fullName: '',
  role: 'WIS',
  isActive: true,
};

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  PROJECT_MANAGER: 'Project Manager',
  QC: 'QC',
  WIS: 'WIS',
};

const roleColors: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-800',
  PROJECT_MANAGER: 'bg-purple-100 text-purple-800',
  QC: 'bg-blue-100 text-blue-800',
  WIS: 'bg-green-100 text-green-800',
};

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [assignedDefectsCount, setAssignedDefectsCount] = useState(0);
  const [userRecords, setUserRecords] = useState<{
    assignedDefects: number;
    createdDefects: number;
    comments: number;
    auditEvents: number;
    attachments: number;
    hasHistoricalRecords: boolean;
  } | null>(null);
  const [sameRoleUsers, setSameRoleUsers] = useState<User[]>([]);
  const [reassignToId, setReassignToId] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userData, usersData] = await Promise.all([
          authService.getMe(),
          apiClient.get('/users'),
        ]);

        // Check if user is admin
        if (userData.role !== 'ADMIN') {
          router.push('/dashboard');
          return;
        }

        setCurrentUser(userData);
        setUsers(usersData.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load data');
        if (err.response?.status === 401) {
          router.push('/login');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const fetchUsers = async () => {
    try {
      const response = await apiClient.get('/users');
      setUsers(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load users');
    }
  };

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        username: user.username,
        password: '',
        email: user.email || '',
        fullName: user.fullName || '',
        role: user.role,
        isActive: user.isActive,
      });
    } else {
      setEditingUser(null);
      setFormData(initialFormData);
    }
    setShowModal(true);
    setError('');
    setSuccess('');
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setFormData(initialFormData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const payload: any = {
        username: formData.username,
        email: formData.email || undefined,
        fullName: formData.fullName || undefined,
        role: formData.role,
        isActive: formData.isActive,
      };

      if (formData.password) {
        payload.password = formData.password;
      }

      if (editingUser) {
        await apiClient.put(`/users/${editingUser.id}`, payload);
        setSuccess('User updated successfully');
      } else {
        if (!formData.password) {
          setError('Password is required for new users');
          setSubmitting(false);
          return;
        }
        payload.password = formData.password;
        await apiClient.post('/users', payload);
        setSuccess('User created successfully');
      }

      await fetchUsers();
      handleCloseModal();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      await apiClient.patch(`/users/${user.id}/toggle-active`);
      setSuccess(`User ${user.isActive ? 'deactivated' : 'activated'} successfully`);
      await fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update user status');
    }
  };

  const handleDelete = async (user: User) => {
    setError('');
    setSuccess('');
    
    try {
      // Check if user has assigned defects and other records
      const [recordsRes, usersRes] = await Promise.all([
        apiClient.get(`/users/${user.id}/assigned-defects-count`),
        apiClient.get(`/users/${user.id}/same-role-users`),
      ]);

      const records = recordsRes.data;
      setUserRecords(records);
      
      if (records.assignedDefects > 0 || records.hasHistoricalRecords) {
        // Show modal with reassignment option
        setUserToDelete(user);
        setAssignedDefectsCount(records.assignedDefects);
        setSameRoleUsers(usersRes.data);
        setReassignToId(records.assignedDefects === 0 ? 'BACKLOG' : '');
        setShowDeleteModal(true);
      } else {
        // No records, confirm and delete directly
        if (!confirm(`Are you sure you want to delete user "${user.username}"? This action cannot be undone.`)) {
          return;
        }
        await apiClient.delete(`/users/${user.id}`, {
          data: { reassignToId: 'BACKLOG' },
        });
        setSuccess('User deleted successfully');
        await fetchUsers();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    
    setSubmitting(true);
    setError('');
    
    try {
      // Always send reassignToId - use BACKLOG if no defects or explicit choice
      const reassignValue = assignedDefectsCount === 0 ? 'BACKLOG' : reassignToId;
      
      await apiClient.delete(`/users/${userToDelete.id}`, {
        data: { reassignToId: reassignValue },
      });
      
      let actionMessage = '';
      if (assignedDefectsCount > 0) {
        actionMessage = reassignToId === 'BACKLOG' 
          ? ' and defects moved to backlog' 
          : ' and defects reassigned';
      }
      if (userRecords?.hasHistoricalRecords) {
        actionMessage += actionMessage ? '. Historical records transferred to admin.' : '. Historical records transferred to admin.';
      }
      
      setSuccess('User deleted successfully' + actionMessage);
      setShowDeleteModal(false);
      setUserToDelete(null);
      setUserRecords(null);
      setReassignToId('');
      await fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setUserToDelete(null);
    setReassignToId('');
    setAssignedDefectsCount(0);
    setSameRoleUsers([]);
    setUserRecords(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={currentUser} />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">User Management</h2>
                <button
                  onClick={() => handleOpenModal()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  + Add New User
                </button>
              </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-800 text-sm">{success}</p>
            </div>
          )}

          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className={!user.isActive ? 'bg-gray-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-medium">
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.fullName || user.username}
                          </div>
                          <div className="text-sm text-gray-500">{user.email || user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          roleColors[user.role] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {roleLabels[user.role] || user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          user.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleOpenModal(user)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={user.isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}
                      >
                        {user.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => handleDelete(user)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {editingUser ? 'Edit User' : 'Add New User'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {editingUser ? '(leave blank to keep current)' : '*'}
                </label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required={!editingUser}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role *
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="WIS">WIS</option>
                  <option value="QC">QC</option>
                  <option value="PROJECT_MANAGER">Project Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <div className="mt-2 p-3 bg-gray-50 rounded-md">
                  <p className="text-xs font-medium text-gray-700 mb-2">Role Permissions:</p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    <li className="flex items-start">
                      <span className="inline-block w-28 font-medium text-green-700">WIS:</span>
                      <span>Can update defect status (In Progress, Fixed, Closed, etc.) and add attachments. Cannot create defects.</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-28 font-medium text-blue-700">QC:</span>
                      <span>Can create defects and assign them to WIS users only. Can add attachments.</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-28 font-medium text-purple-700">Project Manager:</span>
                      <span>Can create defects and assign to both QC and WIS users. Can add attachments.</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-28 font-medium text-red-700">Admin:</span>
                      <span>Full access to all features including user management and AI insights.</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="isActive"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                  Active (user will appear in Assigned To dropdown)
                </label>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium"
                >
                  {submitting ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal with Reassignment */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Delete User
              </h3>
              <button
                onClick={handleCancelDelete}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              {/* User Records Summary */}
              {userRecords && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                  <p className="text-sm font-medium text-gray-800 mb-2">User Records Summary:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {userRecords.assignedDefects > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Assigned Defects:</span>
                        <span className="font-medium text-orange-600">{userRecords.assignedDefects}</span>
                      </div>
                    )}
                    {userRecords.createdDefects > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Created Defects:</span>
                        <span className="font-medium">{userRecords.createdDefects}</span>
                      </div>
                    )}
                    {userRecords.comments > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Comments:</span>
                        <span className="font-medium">{userRecords.comments}</span>
                      </div>
                    )}
                    {userRecords.attachments > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Attachments:</span>
                        <span className="font-medium">{userRecords.attachments}</span>
                      </div>
                    )}
                  </div>
                  {userRecords.hasHistoricalRecords && (
                    <p className="text-xs text-blue-600 mt-2">
                      ℹ️ Historical records will be transferred to admin for data preservation.
                    </p>
                  )}
                </div>
              )}

              {assignedDefectsCount > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-yellow-600 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-yellow-800">
                        User has {assignedDefectsCount} assigned defect{assignedDefectsCount !== 1 ? 's' : ''}
                      </p>
                      <p className="text-sm text-yellow-700 mt-1">
                        Choose what to do with these defects before deleting this user.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-sm text-gray-600 mb-4">
                Delete user <strong>{userToDelete.fullName || userToDelete.username}</strong>?
              </p>

              {assignedDefectsCount > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    What to do with assigned defects: *
                  </label>
                  <select
                    value={reassignToId}
                    onChange={(e) => setReassignToId(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Select an option...</option>
                    <option value="BACKLOG">📋 Move to Backlog (unassign defects)</option>
                    {sameRoleUsers.length > 0 && (
                      <optgroup label={`Reassign to another ${roleLabels[userToDelete.role]}`}>
                        {sameRoleUsers.map((user) => (
                          <option key={user.id} value={user.id}>
                            👤 {user.fullName || user.username}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <p className="mt-2 text-xs text-gray-500">
                    {reassignToId === 'BACKLOG' 
                      ? '⚠️ Defects will be unassigned and available for anyone to pick up'
                      : reassignToId && reassignToId !== '' 
                      ? '✓ Defects will be transferred to the selected user'
                      : 'Choose to move defects to backlog or reassign to another user'}
                  </p>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    This user has no assigned defects. Click delete to proceed.
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleCancelDelete}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={submitting || (assignedDefectsCount > 0 && !reassignToId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium"
              >
                {submitting 
                  ? 'Deleting...' 
                  : assignedDefectsCount === 0 
                  ? 'Delete User'
                  : reassignToId === 'BACKLOG' 
                  ? 'Move to Backlog & Delete' 
                  : 'Reassign & Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

