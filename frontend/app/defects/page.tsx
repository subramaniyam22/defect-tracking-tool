'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import apiClient from '../../lib/api';
import { authService } from '../../lib/auth';
import Navbar from '../../components/Navbar';

interface DefectLocation {
  id: string;
  locationName: string;
  location?: {
    id: string;
    name: string;
  };
}

interface DefectAssignee {
  id: string;
  user: {
    id: string;
    username: string;
    fullName?: string;
    role: string;
  };
}

interface Defect {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  pmcName: string;
  locationName?: string;
  isGlobal?: boolean;
  pmc?: {
    id: string;
    name: string;
  };
  location?: {
    id: string;
    name: string;
  };
  assignedTo: {
    id: string;
    username: string;
    role: string;
  } | null;
  createdBy: {
    id: string;
    username: string;
    role: string;
  };
  createdAt: string;
  _count: {
    comments: number;
    attachments: number;
  };
  defectLocations?: DefectLocation[];
  defectAssignees?: DefectAssignee[];
}

interface AuditEvent {
  id: string;
  type: string;
  defectId: string;
  userId: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  defect: {
    id: string;
    title: string;
  };
  user: {
    id: string;
    username: string;
  };
}

interface CurrentUser {
  id: string;
  username: string;
  fullName?: string;
  role: 'ADMIN' | 'PROJECT_MANAGER' | 'QC' | 'WIS';
}

interface User {
  id: string;
  username: string;
  fullName?: string;
  role: string;
}

const statusColors: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  FIXED: 'bg-teal-100 text-teal-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-800',
  REOPENED: 'bg-orange-100 text-orange-800',
  DEFERRED: 'bg-purple-100 text-purple-800',
  OUT_OF_SCOPE: 'bg-pink-100 text-pink-800',
};

const priorityLabels: Record<number, string> = {
  1: 'Critical',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

const priorityColors: Record<number, string> = {
  1: 'bg-red-100 text-red-800',
  2: 'bg-orange-100 text-orange-800',
  3: 'bg-yellow-100 text-yellow-800',
  4: 'bg-green-100 text-green-800',
};

const roleColors: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700',
  PROJECT_MANAGER: 'bg-purple-100 text-purple-700',
  QC: 'bg-blue-100 text-blue-700',
  WIS: 'bg-green-100 text-green-700',
};

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  PROJECT_MANAGER: 'PM',
  QC: 'QC',
  WIS: 'WIS',
};

const statusOptions = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'FIXED', label: 'Fixed' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'REOPENED', label: 'Reopened' },
  { value: 'DEFERRED', label: 'Deferred' },
  { value: 'OUT_OF_SCOPE', label: 'Out of Scope' },
];

type ViewMode = 'my-defects' | 'all-defects' | 'my-activity';

export default function DefectsPage() {
  const router = useRouter();
  const [allDefects, setAllDefects] = useState<Defect[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('my-defects');
  const [myActivity, setMyActivity] = useState<AuditEvent[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  
  const [filters, setFilters] = useState({
    pmcName: '',
    status: '',
    assignedToId: '',
  });

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [editFormData, setEditFormData] = useState({
    status: '',
    priority: 1,
    pmcName: '',
    locationName: '',
    assignedToId: '',
    title: '',
    description: '',
  });
  const [editComment, setEditComment] = useState('');
  const [editAttachments, setEditAttachments] = useState<File[]>([]);
  const [updatingDefect, setUpdatingDefect] = useState(false);
  const [pmcSuggestions, setPmcSuggestions] = useState<string[]>([]);
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [showPmcSuggestions, setShowPmcSuggestions] = useState(false);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  
  // Global defect state (multiple locations/assignees)
  const [isGlobalDefect, setIsGlobalDefect] = useState(false);
  const [additionalLocations, setAdditionalLocations] = useState<string[]>([]);
  const [additionalAssignees, setAdditionalAssignees] = useState<string[]>([]);
  const [newLocationInput, setNewLocationInput] = useState('');
  
  // Team completion status for global defects
  const [teamCompletionStatus, setTeamCompletionStatus] = useState<{
    isReadyForCompletion: boolean;
    assigneeStatuses: Array<{
      userId: string;
      username: string;
      fullName?: string;
      role: string;
      hasCompleted: boolean;
    }>;
    message: string;
  } | null>(null);
  const [loadingCompletionStatus, setLoadingCompletionStatus] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userData, defectsRes, usersRes] = await Promise.all([
          authService.getMe(),
          apiClient.get('/defects'),
          apiClient.get('/users'),
        ]);

        setCurrentUser(userData);
        setAllDefects(defectsRes.data);
        setUsers(usersRes.data);
        
        // Set default view based on role
        if (userData.role === 'ADMIN') {
          setViewMode('all-defects');
        } else {
          setViewMode('my-defects');
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load defects');
        if (err.response?.status === 401) {
          router.push('/login');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  // Fetch my activity when switching to that tab (for admin)
  useEffect(() => {
    const fetchMyActivity = async () => {
      if (viewMode === 'my-activity' && currentUser) {
        setLoadingActivity(true);
        try {
          const response = await apiClient.get('/defects/my-activity');
          setMyActivity(response.data);
        } catch (err: any) {
          console.error('Failed to load activity:', err);
        } finally {
          setLoadingActivity(false);
        }
      }
    };

    fetchMyActivity();
  }, [viewMode, currentUser]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Helper function to check if user is assigned to a defect (including global assignees)
  const isUserAssigned = (defect: Defect, userId: string) => {
    // Check primary assignee
    if (defect.assignedTo?.id === userId) return true;
    // Check global defect assignees
    if (defect.defectAssignees?.some((da) => da.user.id === userId)) return true;
    return false;
  };

  // Filter defects based on view mode
  const getFilteredDefects = () => {
    let filtered = allDefects;

    // WIS users can only see defects assigned to them (including global assignees)
    if (currentUser?.role === 'WIS') {
      filtered = filtered.filter((d) => isUserAssigned(d, currentUser.id));
    } else if (viewMode === 'my-defects' && currentUser) {
      // For other users in "My Defects" view, show assigned to them OR created by them
      filtered = filtered.filter(
        (d) => isUserAssigned(d, currentUser.id) || d.createdBy.id === currentUser.id
      );
    }

    // Apply additional filters
    if (filters.pmcName) {
      filtered = filtered.filter((d) =>
        (d.pmcName || d.pmc?.name || '').toLowerCase().includes(filters.pmcName.toLowerCase())
      );
    }
    if (filters.status) {
      filtered = filtered.filter((d) => d.status === filters.status);
    }
    // Only apply assignedToId filter for non-WIS users
    if (filters.assignedToId && currentUser?.role !== 'WIS') {
      filtered = filtered.filter((d) => 
        d.assignedTo?.id === filters.assignedToId ||
        d.defectAssignees?.some((da) => da.user.id === filters.assignedToId)
      );
    }

    return filtered;
  };

  const defects = getFilteredDefects();

  // Count defects for tabs (including global assignees)
  const myDefectsCount = currentUser
    ? allDefects.filter((d) => isUserAssigned(d, currentUser.id) || d.createdBy.id === currentUser.id).length
    : 0;
  const assignedToMeCount = currentUser
    ? allDefects.filter((d) => isUserAssigned(d, currentUser.id)).length
    : 0;
  const createdByMeCount = currentUser
    ? allDefects.filter((d) => d.createdBy.id === currentUser.id).length
    : 0;

  // Edit modal handlers
  const handleOpenEditModal = async (defect: Defect, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDefect(defect);
    setEditFormData({
      status: defect.status,
      priority: defect.priority,
      pmcName: defect.pmcName || defect.pmc?.name || '',
      locationName: defect.locationName || defect.location?.name || '',
      assignedToId: defect.assignedTo?.id || '',
      title: defect.title,
      description: defect.description,
    });
    setEditComment('');
    // Initialize global defect state from existing data
    const defectWithLocations = defect as any;
    setIsGlobalDefect(defectWithLocations.isGlobal || false);
    setAdditionalLocations(
      defectWithLocations.defectLocations?.map((dl: any) => dl.locationName) || []
    );
    setAdditionalAssignees(
      defectWithLocations.defectAssignees?.map((da: any) => da.user.id) || []
    );
    setNewLocationInput('');
    setShowEditModal(true);
    setError('');
    setTeamCompletionStatus(null);
    
    // Fetch team completion status for global defects when WIS user opens the modal
    if (defectWithLocations.isGlobal && currentUser?.role === 'WIS') {
      setLoadingCompletionStatus(true);
      try {
        const response = await apiClient.get(`/defects/${defect.id}/global-completion-status`);
        setTeamCompletionStatus(response.data);
      } catch (err) {
        console.error('Failed to fetch completion status:', err);
      } finally {
        setLoadingCompletionStatus(false);
      }
    }
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setSelectedDefect(null);
    setEditFormData({
      status: '',
      priority: 1,
      pmcName: '',
      locationName: '',
      assignedToId: '',
      title: '',
      description: '',
    });
    setEditComment('');
    setEditAttachments([]);
    setPmcSuggestions([]);
    setLocationSuggestions([]);
    setShowPmcSuggestions(false);
    setShowLocationSuggestions(false);
    // Reset global defect state
    setIsGlobalDefect(false);
    setAdditionalLocations([]);
    setAdditionalAssignees([]);
    setNewLocationInput('');
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setEditAttachments(Array.from(e.target.files));
    }
  };

  const removeEditAttachment = (index: number) => {
    setEditAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Global defect handlers
  const handleAddLocation = () => {
    if (newLocationInput.trim() && !additionalLocations.includes(newLocationInput.trim())) {
      setAdditionalLocations([...additionalLocations, newLocationInput.trim()]);
      setNewLocationInput('');
    }
  };

  const handleRemoveLocation = (location: string) => {
    setAdditionalLocations(additionalLocations.filter((l) => l !== location));
  };

  const handleToggleAssignee = (userId: string) => {
    if (additionalAssignees.includes(userId)) {
      setAdditionalAssignees(additionalAssignees.filter((id) => id !== userId));
    } else {
      setAdditionalAssignees([...additionalAssignees, userId]);
    }
  };

  const handleEditFormChange = (field: string, value: string | number) => {
    setEditFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Fetch PMC suggestions
  const fetchPmcSuggestions = async (query: string) => {
    if (query.length < 2) {
      setPmcSuggestions([]);
      return;
    }
    try {
      const response = await apiClient.get(`/defects/suggestions/pmc?query=${encodeURIComponent(query)}`);
      setPmcSuggestions(response.data);
      setShowPmcSuggestions(true);
    } catch (err) {
      console.error('Failed to fetch PMC suggestions:', err);
    }
  };

  // Fetch location suggestions
  const fetchLocationSuggestions = async (query: string) => {
    if (query.length < 2 || !editFormData.pmcName) {
      setLocationSuggestions([]);
      return;
    }
    try {
      const response = await apiClient.get(
        `/defects/suggestions/location?pmcName=${encodeURIComponent(editFormData.pmcName)}&query=${encodeURIComponent(query)}`
      );
      setLocationSuggestions(response.data);
      setShowLocationSuggestions(true);
    } catch (err) {
      console.error('Failed to fetch location suggestions:', err);
    }
  };

  const handleDefectUpdate = async () => {
    if (!selectedDefect) return;

    setUpdatingDefect(true);
    setError('');

    try {
      // Build update payload with only changed fields
      const updatePayload: Record<string, any> = {};
      
      if (editFormData.status !== selectedDefect.status) {
        updatePayload.status = editFormData.status;
      }
      if (editFormData.priority !== selectedDefect.priority) {
        updatePayload.priority = editFormData.priority;
      }
      if (editFormData.pmcName !== (selectedDefect.pmcName || selectedDefect.pmc?.name || '')) {
        updatePayload.pmcName = editFormData.pmcName;
      }
      if (editFormData.locationName !== (selectedDefect.locationName || selectedDefect.location?.name || '')) {
        updatePayload.locationName = editFormData.locationName;
      }
      if (editFormData.assignedToId !== (selectedDefect.assignedTo?.id || '')) {
        updatePayload.assignedToId = editFormData.assignedToId || null;
      }
      if (editFormData.title !== selectedDefect.title) {
        updatePayload.title = editFormData.title;
      }
      if (editFormData.description !== selectedDefect.description) {
        updatePayload.description = editFormData.description;
      }

      // Add global defect data if enabled (multiple locations/assignees)
      if (isGlobalDefect) {
        updatePayload.isGlobal = true;
        updatePayload.locationNames = additionalLocations;
        updatePayload.assignedToIds = additionalAssignees;
      } else {
        // If switching from global to non-global, clear multiple locations/assignees
        const defectWithLocations = selectedDefect as any;
        if (defectWithLocations.isGlobal) {
          updatePayload.isGlobal = false;
          updatePayload.locationNames = [];
          updatePayload.assignedToIds = [];
        }
      }

      // Only make API call if there are changes or global defect data
      if (Object.keys(updatePayload).length > 0) {
        await apiClient.patch(`/defects/${selectedDefect.id}`, updatePayload);
      }

      // Add comment if provided
      if (editComment.trim()) {
        await apiClient.post(`/defects/${selectedDefect.id}/comments`, {
          content: editComment,
        });
      }

      // Upload attachments if any
      if (editAttachments.length > 0) {
        const formDataFiles = new FormData();
        editAttachments.forEach((file) => {
          formDataFiles.append('files', file);
        });
        await apiClient.post(`/attachments/defect/${selectedDefect.id}`, formDataFiles, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      // Refresh defects
      const defectsRes = await apiClient.get('/defects');
      setAllDefects(defectsRes.data);

      const changesCount = Object.keys(updatePayload).length;
      const attachmentInfo = editAttachments.length > 0 ? ` with ${editAttachments.length} attachment${editAttachments.length > 1 ? 's' : ''}` : '';
      setSuccess(`Defect updated successfully${changesCount > 0 ? ` (${changesCount} field${changesCount > 1 ? 's' : ''} changed)` : ''}${editComment ? ' with comment' : ''}${attachmentInfo}`);
      handleCloseEditModal();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update defect');
    } finally {
      setUpdatingDefect(false);
    }
  };

  // Check if user can fully edit defects (Admin, PM, QC)
  const canFullyEditDefects = currentUser && ['ADMIN', 'PROJECT_MANAGER', 'QC'].includes(currentUser.role);

  // Check if user can create defects (QC, PM, Admin - not WIS)
  const canCreateDefects = currentUser && currentUser.role !== 'WIS';

  // Get event description for activity log
  const getEventDescription = (event: AuditEvent) => {
    switch (event.type) {
      case 'STATUS_CHANGE':
        const oldStatus = event.oldValue ? JSON.parse(event.oldValue).status : 'Unknown';
        const newStatusVal = event.newValue ? JSON.parse(event.newValue).status : 'Unknown';
        return `Changed status from "${oldStatus}" to "${newStatusVal}"`;
      case 'ASSIGNMENT_CHANGE':
        return 'Changed assignment';
      case 'COMMENT_ADDED':
        return 'Added a comment';
      case 'DEFECT_CREATED':
        return 'Created defect';
      case 'DEFECT_UPDATED':
        return 'Updated defect';
      default:
        return event.type.replace('_', ' ');
    }
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
          {/* Success/Error Messages */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-green-800 text-sm">{success}</p>
            </div>
          )}

          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Defects</h1>
                {canCreateDefects && (
                  <Link
                    href="/defects/new"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                  >
                    + New Defect
                  </Link>
                )}
              </div>

              {/* View Mode Tabs - WIS users only see their assigned defects */}
              {currentUser?.role === 'WIS' ? (
                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Showing defects assigned to you</span>
                    <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                      {assignedToMeCount}
                    </span>
                  </p>
                </div>
              ) : (
                <div className="mt-4 flex space-x-1 bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setViewMode('my-defects')}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      viewMode === 'my-defects'
                        ? 'bg-white text-blue-700 shadow'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    My Defects
                    <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                      {myDefectsCount}
                    </span>
                  </button>
                  <button
                    onClick={() => setViewMode('all-defects')}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      viewMode === 'all-defects'
                        ? 'bg-white text-blue-700 shadow'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    All Defects
                    <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700">
                      {allDefects.length}
                    </span>
                  </button>
                  {currentUser?.role === 'ADMIN' && (
                    <button
                      onClick={() => setViewMode('my-activity')}
                      className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        viewMode === 'my-activity'
                          ? 'bg-white text-blue-700 shadow'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      My Activity
                    </button>
                  )}
                </div>
              )}

              {/* Quick Stats for My Defects - not shown for WIS users */}
              {viewMode === 'my-defects' && currentUser && currentUser.role !== 'WIS' && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-blue-600 font-medium">Assigned to me</p>
                    <p className="text-2xl font-bold text-blue-700">{assignedToMeCount}</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <p className="text-xs text-purple-600 font-medium">Created by me</p>
                    <p className="text-2xl font-bold text-purple-700">{createdByMeCount}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Activity View for Admin */}
            {viewMode === 'my-activity' && currentUser?.role === 'ADMIN' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">My Recent Actions</h2>
                {loadingActivity ? (
                  <p className="text-gray-500 text-center py-8">Loading activity...</p>
                ) : myActivity.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No activity found</p>
                ) : (
                  <div className="space-y-3">
                    {myActivity.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
                        onClick={() => router.push(`/defects/${event.defectId}`)}
                      >
                        <div className={`flex-shrink-0 w-2 h-2 mt-2 rounded-full ${
                          event.type === 'DEFECT_CREATED' ? 'bg-green-500' :
                          event.type === 'STATUS_CHANGE' ? 'bg-blue-500' :
                          event.type === 'ASSIGNMENT_CHANGE' ? 'bg-purple-500' :
                          'bg-gray-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            {getEventDescription(event)}
                          </p>
                          <p className="text-sm text-gray-500 truncate">
                            Defect: {event.defect.title}
                          </p>
                          <p className="text-xs text-gray-400">
                            {new Date(event.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Defects List View */}
            {viewMode !== 'my-activity' && (
              <>
                {/* Filters */}
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <div className={`grid grid-cols-1 gap-4 ${currentUser?.role !== 'WIS' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        PMC
                      </label>
                      <input
                        type="text"
                        value={filters.pmcName}
                        onChange={(e) => handleFilterChange('pmcName', e.target.value)}
                        placeholder="Search PMC..."
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status
                      </label>
                      <select
                        value={filters.status}
                        onChange={(e) => handleFilterChange('status', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      >
                        <option value="">All Statuses</option>
                        {statusOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Assigned To filter - only visible to Admin, PM, and QC */}
                    {currentUser?.role !== 'WIS' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Assigned To
                        </label>
                        <select
                          value={filters.assignedToId}
                          onChange={(e) => handleFilterChange('assignedToId', e.target.value)}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        >
                          <option value="">All Users</option>
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.fullName || user.username}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="px-6 py-4 bg-red-50 border-b border-red-200">
                    <p className="text-red-800 text-sm">{error}</p>
                  </div>
                )}

                {/* Defects Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Title
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          PMC
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Priority
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Assigned To
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Created By
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {defects.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                            {viewMode === 'my-defects' 
                              ? 'No defects assigned to you or created by you' 
                              : 'No defects found'}
                          </td>
                        </tr>
                      ) : (
                        defects.map((defect) => (
                          <tr
                            key={defect.id}
                            className={`cursor-pointer transition-all duration-200 ${
                              selectedDefect?.id === defect.id
                                ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset shadow-lg'
                                : 'hover:bg-gray-50'
                            }`}
                            onClick={() => router.push(`/defects/${defect.id}`)}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">
                                  {defect.title}
                                </span>
                                {defect.isGlobal && (
                                  <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-blue-600 text-white">
                                    Global
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-500 truncate max-w-xs">
                                {defect.description}
                              </div>
                              {/* Show multiple locations for global defects */}
                              {defect.isGlobal && defect.defectLocations && defect.defectLocations.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {defect.defectLocations.slice(0, 3).map((loc) => (
                                    <span
                                      key={loc.id}
                                      className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600"
                                    >
                                      📍 {loc.locationName}
                                    </span>
                                  ))}
                                  {defect.defectLocations.length > 3 && (
                                    <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
                                      +{defect.defectLocations.length - 3} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {defect.pmcName || defect.pmc?.name || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  statusColors[defect.status] || 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {defect.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  priorityColors[defect.priority] || 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {priorityLabels[defect.priority] || defect.priority}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {defect.isGlobal && defect.defectAssignees && defect.defectAssignees.length > 0 ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1 mb-1">
                                    <span className="text-xs font-medium text-blue-600">
                                      👥 {defect.defectAssignees.length} Assignees:
                                    </span>
                                  </div>
                                  {defect.defectAssignees.map((assignee) => (
                                    <div key={assignee.id} className="flex items-center gap-1.5 text-xs">
                                      <span className="w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-[10px] font-medium">
                                        {(assignee.user.fullName || assignee.user.username).charAt(0).toUpperCase()}
                                      </span>
                                      <span className="font-medium">{assignee.user.fullName || assignee.user.username}</span>
                                      {assignee.user.id === currentUser?.id && (
                                        <span className="px-1 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700">
                                          You
                                        </span>
                                      )}
                                      <span className={`px-1 py-0.5 text-[10px] rounded ${roleColors[assignee.user.role] || 'bg-gray-100 text-gray-600'}`}>
                                        {roleLabels[assignee.user.role] || assignee.user.role}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : defect.assignedTo ? (
                                <span className="flex items-center gap-1.5 flex-wrap">
                                  {defect.assignedTo.username}
                                  {defect.assignedTo.id === currentUser?.id && (
                                    <span className="px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700">
                                      You
                                    </span>
                                  )}
                                  {/* Show role for other users (not for the current user) */}
                                  {defect.assignedTo.role && 
                                   defect.assignedTo.id !== currentUser?.id && (
                                    <span className={`px-1.5 py-0.5 text-xs rounded ${roleColors[defect.assignedTo.role] || 'bg-gray-100 text-gray-600'}`}>
                                      {roleLabels[defect.assignedTo.role] || defect.assignedTo.role}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-gray-400">Unassigned</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <span className="flex items-center gap-1.5 flex-wrap">
                                {defect.createdBy.username}
                                {defect.createdBy.id === currentUser?.id && (
                                  <span className="px-1.5 py-0.5 text-xs rounded bg-purple-100 text-purple-700">
                                    You
                                  </span>
                                )}
                                {/* Show role for other users (not for the current user) */}
                                {defect.createdBy.role && 
                                 defect.createdBy.id !== currentUser?.id && (
                                  <span className={`px-1.5 py-0.5 text-xs rounded ${roleColors[defect.createdBy.role] || 'bg-gray-100 text-gray-600'}`}>
                                    {roleLabels[defect.createdBy.role] || defect.createdBy.role}
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <button
                                onClick={(e) => handleOpenEditModal(defect, e)}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {canFullyEditDefects ? 'Edit' : 'Update Status'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Edit Defect Modal */}
      {showEditModal && selectedDefect && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className={`relative top-10 mx-auto p-5 border w-full shadow-lg rounded-md bg-white ${canFullyEditDefects ? 'max-w-2xl' : 'max-w-md'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {canFullyEditDefects ? 'Edit Defect' : 'Update Defect Status'}
              </h3>
              <button
                onClick={handleCloseEditModal}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                Defect ID: <span className="font-mono text-xs">{selectedDefect.id.slice(0, 8)}...</span>
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Current Status: <span className={`px-2 py-0.5 text-xs rounded-full ${statusColors[selectedDefect.status]}`}>
                  {selectedDefect.status.replace('_', ' ')}
                </span>
              </p>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {/* Full Edit Fields for Admin/PM/QC */}
              {canFullyEditDefects && (
                <>
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Title *
                    </label>
                    <input
                      type="text"
                      value={editFormData.title}
                      onChange={(e) => handleEditFormChange('title', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={editFormData.description}
                      onChange={(e) => handleEditFormChange('description', e.target.value)}
                      rows={3}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* PMC */}
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        PMC *
                      </label>
                      <input
                        type="text"
                        value={editFormData.pmcName}
                        onChange={(e) => {
                          handleEditFormChange('pmcName', e.target.value);
                          fetchPmcSuggestions(e.target.value);
                        }}
                        onFocus={() => editFormData.pmcName.length >= 2 && setShowPmcSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowPmcSuggestions(false), 200)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        placeholder="Enter PMC name"
                      />
                      {showPmcSuggestions && pmcSuggestions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-y-auto">
                          {pmcSuggestions.map((pmc, index) => (
                            <div
                              key={index}
                              className="px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                              onClick={() => {
                                handleEditFormChange('pmcName', pmc);
                                setShowPmcSuggestions(false);
                              }}
                            >
                              {pmc}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Location */}
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location
                      </label>
                      <input
                        type="text"
                        value={editFormData.locationName}
                        onChange={(e) => {
                          handleEditFormChange('locationName', e.target.value);
                          fetchLocationSuggestions(e.target.value);
                        }}
                        onFocus={() => editFormData.locationName.length >= 2 && setShowLocationSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 200)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        placeholder="Enter location"
                      />
                      {showLocationSuggestions && locationSuggestions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-y-auto">
                          {locationSuggestions.map((loc, index) => (
                            <div
                              key={index}
                              className="px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                              onClick={() => {
                                handleEditFormChange('locationName', loc);
                                setShowLocationSuggestions(false);
                              }}
                            >
                              {loc}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Priority */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Priority
                      </label>
                      <select
                        value={editFormData.priority}
                        onChange={(e) => handleEditFormChange('priority', parseInt(e.target.value))}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      >
                        <option value={1}>Critical</option>
                        <option value={2}>High</option>
                        <option value={3}>Medium</option>
                        <option value={4}>Low</option>
                      </select>
                    </div>

                    {/* Assigned To */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Assigned To
                      </label>
                      <select
                        value={editFormData.assignedToId}
                        onChange={(e) => handleEditFormChange('assignedToId', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.fullName || user.username} ({roleLabels[user.role] || user.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Global Defect Section */}
                  <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isGlobalDefect}
                            onChange={(e) => setIsGlobalDefect(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-2"
                          />
                          <span className="text-sm font-medium text-blue-900">Global Defect</span>
                        </label>
                        <p className="text-xs text-blue-700 mt-1">
                          Enable to add multiple locations and assign to multiple WIS users
                        </p>
                      </div>
                      {isGlobalDefect && (
                        <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                          Global
                        </span>
                      )}
                    </div>

                    {isGlobalDefect && (
                      <div className="space-y-4 mt-4 pt-4 border-t border-blue-200">
                        {/* Multiple Locations */}
                        <div>
                          <label className="block text-sm font-medium text-blue-900 mb-2">
                            Additional Locations
                          </label>
                          <div className="flex space-x-2 mb-2">
                            <input
                              type="text"
                              value={newLocationInput}
                              onChange={(e) => setNewLocationInput(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLocation())}
                              placeholder="Enter location name..."
                              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                            />
                            <button
                              type="button"
                              onClick={handleAddLocation}
                              className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                            >
                              Add
                            </button>
                          </div>
                          {additionalLocations.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {additionalLocations.map((loc) => (
                                <span
                                  key={loc}
                                  className="inline-flex items-center px-3 py-1 bg-white border border-blue-300 rounded-full text-sm text-blue-800"
                                >
                                  {loc}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveLocation(loc)}
                                    className="ml-2 text-blue-600 hover:text-blue-800"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-blue-600 mt-2">
                            Add locations affected by this defect
                          </p>
                        </div>

                        {/* Multiple Assignees */}
                        <div>
                          <label className="block text-sm font-medium text-blue-900 mb-2">
                            Assign to Multiple WIS Users
                          </label>
                          <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md bg-white">
                            {users
                              .filter((user) => user.role === 'WIS')
                              .map((user) => (
                                <label
                                  key={user.id}
                                  className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                                >
                                  <input
                                    type="checkbox"
                                    checked={additionalAssignees.includes(user.id)}
                                    onChange={() => handleToggleAssignee(user.id)}
                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-3"
                                  />
                                  <span className="text-sm text-gray-700">
                                    {user.fullName || user.username}
                                  </span>
                                </label>
                              ))}
                          </div>
                          {additionalAssignees.length > 0 && (
                            <p className="text-xs text-blue-600 mt-2">
                              {additionalAssignees.length} WIS user(s) selected
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Status - Available for all users */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status *
                </label>
                <select
                  value={editFormData.status}
                  onChange={(e) => handleEditFormChange('status', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  {statusOptions.map((opt) => {
                    // For WIS users on global defects, disable completion statuses until all team members are done
                    const isCompletionStatus = ['FIXED', 'RESOLVED', 'CLOSED'].includes(opt.value);
                    const isWisOnGlobalDefect = currentUser?.role === 'WIS' && selectedDefect?.isGlobal;
                    const isDisabled = !!(isWisOnGlobalDefect && isCompletionStatus && teamCompletionStatus && !teamCompletionStatus.isReadyForCompletion);
                    
                    return (
                      <option key={opt.value} value={opt.value} disabled={isDisabled}>
                        {opt.label}{isDisabled ? ' 🔒' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Team Completion Status for Global Defects (WIS users only) */}
              {currentUser?.role === 'WIS' && selectedDefect?.isGlobal && (
                <div className={`p-4 rounded-lg border ${
                  teamCompletionStatus?.isReadyForCompletion 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">
                      {loadingCompletionStatus ? '⏳' : teamCompletionStatus?.isReadyForCompletion ? '✅' : '⏳'}
                    </span>
                    <h4 className={`font-medium ${
                      teamCompletionStatus?.isReadyForCompletion ? 'text-green-800' : 'text-amber-800'
                    }`}>
                      Team Completion Status
                    </h4>
                  </div>
                  
                  {loadingCompletionStatus ? (
                    <p className="text-sm text-gray-600">Loading team status...</p>
                  ) : teamCompletionStatus ? (
                    <>
                      <p className={`text-sm mb-3 ${
                        teamCompletionStatus.isReadyForCompletion ? 'text-green-700' : 'text-amber-700'
                      }`}>
                        {teamCompletionStatus.message}
                      </p>
                      
                      <div className="space-y-2">
                        {teamCompletionStatus.assigneeStatuses.map((assignee) => (
                          <div 
                            key={assignee.userId}
                            className={`flex items-center justify-between px-3 py-2 rounded text-sm ${
                              assignee.hasCompleted ? 'bg-green-100' : 'bg-white'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${
                                assignee.hasCompleted ? 'bg-green-500' : 'bg-amber-500'
                              }`} />
                              {assignee.fullName || assignee.username}
                              {assignee.userId === currentUser?.id && (
                                <span className="px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700">You</span>
                              )}
                            </span>
                            <span className={`text-xs font-medium ${
                              assignee.hasCompleted ? 'text-green-600' : 'text-amber-600'
                            }`}>
                              {assignee.hasCompleted ? '✓ Completed' : 'Pending'}
                            </span>
                          </div>
                        ))}
                      </div>
                      
                      {!teamCompletionStatus.isReadyForCompletion && (
                        <div className="mt-3 pt-3 border-t border-amber-200">
                          <p className="text-xs text-amber-700">
                            ⚠️ To mark as Fixed/Resolved/Closed, all team members must complete their work first. 
                            Use the Team Chat on the "My Work" page to coordinate with your team.
                          </p>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              )}

              {/* WIS users notice */}
              {!canFullyEditDefects && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-yellow-800 text-sm">WIS users can only update defect status</p>
                </div>
              )}

              {/* Comment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Add Comment (optional)
                </label>
                <textarea
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  rows={3}
                  placeholder={
                    editFormData.status === 'FIXED' ? 'Describe the fix applied...' :
                    editFormData.status === 'CLOSED' ? 'Add closing remarks...' :
                    editFormData.status === 'REOPENED' ? 'Explain why reopening...' :
                    'Add any additional notes about the changes...'
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Add Attachments (optional)
                </label>
                <div className="flex items-center space-x-2">
                  <label className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-md hover:border-blue-400 transition-colors">
                      <svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <span className="text-sm text-gray-600">
                        {editAttachments.length > 0 ? `${editAttachments.length} file(s) selected` : 'Click to attach files'}
                      </span>
                    </div>
                    <input
                      type="file"
                      multiple
                      onChange={handleEditFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
                {editAttachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {editAttachments.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded text-sm">
                        <span className="truncate flex-1">
                          {file.name} <span className="text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeEditAttachment(index)}
                          className="ml-2 text-red-500 hover:text-red-700"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500">
                💡 All changes will be recorded in the defect history
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-4 mt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDefectUpdate}
                disabled={updatingDefect}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium"
              >
                {updatingDefect ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
