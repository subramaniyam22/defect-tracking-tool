'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import apiClient from '@/lib/api';
import { authService } from '@/lib/auth';
import AIRecommendationPanel from '@/components/AIRecommendationPanel';
import Navbar from '@/components/Navbar';

interface DefectLocation {
  id: string;
  locationName: string;
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

interface GlobalChatMessage {
  id: string;
  originalMessage: string;
  refinedMessage: string;
  messageType: 'MESSAGE' | 'STATUS_UPDATE' | 'NOTIFICATION';
  isRead: boolean;
  createdAt: string;
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
  source?: string;
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
  updatedAt: string;
  comments: Comment[];
  attachments: Attachment[];
  auditEvents: AuditEvent[];
  defectLocations?: DefectLocation[];
  defectAssignees?: DefectAssignee[];
}

interface Comment {
  id: string;
  content: string;
  user: {
    id: string;
    username: string;
  };
  createdAt: string;
}

interface Attachment {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: {
    id: string;
    username: string;
  };
  createdAt: string;
}

interface AuditEvent {
  id: string;
  type: string;
  user: {
    id: string;
    username: string;
  };
  oldValue: string | null;
  newValue: string | null;
  metadata: string | null;
  createdAt: string;
}

interface QCParameter {
  id: string;
  parameterKey: string;
  parameterLabel: string;
  dataType: string;
  enumValues: string | null;
  required: boolean;
  defaultValue: string | null;
}

interface DefectQCValue {
  id: string;
  value: string | null;
  parameter: QCParameter;
}

interface Project {
  id: string;
  name: string;
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
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-800',
  REOPENED: 'bg-orange-100 text-orange-800',
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

const statusToPhase: Record<string, string> = {
  OPEN: 'Staging',
  IN_PROGRESS: 'PreLive',
  RESOLVED: 'PostLive',
  CLOSED: 'PostLive',
  REOPENED: 'Staging',
};

export default function DefectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const defectId = params.id as string;

  const [defect, setDefect] = useState<Defect | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'attachments' | 'history' | 'qc'>(
    'details',
  );
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [qcParameters, setQcParameters] = useState<QCParameter[]>([]);
  const [qcValues, setQcValues] = useState<Record<string, any>>({});
  const [savingQC, setSavingQC] = useState(false);

  // Global defect chat state
  const [chatMessages, setChatMessages] = useState<GlobalChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    status: '',
    source: '',
    priority: 3,
    pmcName: '',
    locationName: '',
    assignedToId: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userData, defectRes, projectsRes, usersRes] = await Promise.all([
          authService.getMe(),
          apiClient.get(`/defects/${defectId}`),
          apiClient.get('/projects'),
          apiClient.get('/users'),
        ]);

        setCurrentUser(userData);
        setDefect(defectRes.data);
        setProjects(projectsRes.data);
        setUsers(usersRes.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load defect');
        if (err.response?.status === 401) {
          router.push('/login');
        }
      } finally {
        setLoading(false);
      }
    };

    if (defectId) {
      fetchData();
    }
  }, [defectId, router]);

  // Fetch global chat for global defects
  useEffect(() => {
    const fetchGlobalChat = async () => {
      if (!defect?.isGlobal) return;

      try {
        const response = await apiClient.get(`/defects/${defectId}/global-chat`);
        setChatMessages(response.data);
        // Mark messages as read
        await apiClient.post(`/defects/${defectId}/global-chat/mark-read`);
      } catch (err) {
        console.error('Failed to fetch global chat:', err);
      }
    };

    fetchGlobalChat();

    // Poll for new messages every 10 seconds for global defects
    if (defect?.isGlobal) {
      const interval = setInterval(fetchGlobalChat, 10000);
      return () => clearInterval(interval);
    }
  }, [defect?.isGlobal, defectId]);

  useEffect(() => {
    const fetchQCData = async () => {
      if (!defect) return;

      const phase = statusToPhase[defect.status] || 'Staging';
      try {
        const [paramsRes, valuesRes] = await Promise.all([
          apiClient.get(`/qc-parameters/phase/${phase}`),
          apiClient.get(`/qc-parameters/defect/${defectId}`),
        ]);

        setQcParameters(paramsRes.data);
        
        // Map existing values
        const existingValues: Record<string, any> = {};
        valuesRes.data.forEach((qv: DefectQCValue) => {
          try {
            existingValues[qv.parameter.parameterKey] = qv.value 
              ? (qv.parameter.dataType === 'number' ? parseFloat(qv.value) : 
                 qv.parameter.dataType === 'boolean' ? qv.value === 'true' : 
                 qv.value)
              : qv.parameter.defaultValue;
          } catch {
            existingValues[qv.parameter.parameterKey] = qv.value || qv.parameter.defaultValue;
          }
        });

        // Set defaults for parameters without values
        paramsRes.data.forEach((param: QCParameter) => {
          if (!existingValues[param.parameterKey] && param.defaultValue) {
            existingValues[param.parameterKey] = param.defaultValue;
          }
        });

        setQcValues(existingValues);
      } catch (err: any) {
        console.error('Failed to load QC parameters:', err);
        setQcParameters([]);
      }
    };

    if (defect) {
      fetchQCData();
    }
  }, [defect, defectId]);

  const handleAddComment = async () => {
    if (!commentText.trim()) return;

    setSubmitting(true);
    try {
      const response = await apiClient.post(`/defects/${defectId}/comments`, {
        content: commentText,
      });
      setDefect((prev) =>
        prev
          ? {
              ...prev,
              comments: [...prev.comments, response.data],
            }
          : null,
      );
      setCommentText('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  // Check if current user has already clicked Start Working or Complete Work
  const hasUserStartedWork = (): boolean => {
    return chatMessages.some(msg => 
      msg.user.id === currentUser?.id && 
      msg.messageType === 'STATUS_UPDATE' &&
      (msg.originalMessage.toLowerCase().includes('starting') || 
       msg.refinedMessage.toLowerCase().includes('starting') ||
       msg.originalMessage.toLowerCase().includes('start'))
    );
  };

  const hasUserCompletedWork = (): boolean => {
    return chatMessages.some(msg => 
      msg.user.id === currentUser?.id && 
      msg.messageType === 'STATUS_UPDATE' &&
      (msg.originalMessage.toLowerCase().includes('completed') || 
       msg.refinedMessage.toLowerCase().includes('completed') ||
       msg.originalMessage.toLowerCase().includes('complete'))
    );
  };

  // Global chat functions - Status updates (one-time only)
  const handleStartWorking = async () => {
    if (hasUserStartedWork()) return; // Prevent duplicate clicks
    
    setSendingChat(true);
    try {
      const response = await apiClient.post(`/defects/${defectId}/global-chat`, {
        message: 'I am starting to work on this defect now.',
        messageType: 'STATUS_UPDATE',
      });
      setChatMessages((prev) => [...prev, response.data]);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send status update');
    } finally {
      setSendingChat(false);
    }
  };

  const handleCompleteWork = async () => {
    if (hasUserCompletedWork()) return; // Prevent duplicate clicks
    
    setSendingChat(true);
    try {
      const response = await apiClient.post(`/defects/${defectId}/global-chat`, {
        message: 'I have completed my work on this defect.',
        messageType: 'STATUS_UPDATE',
      });
      setChatMessages((prev) => [...prev, response.data]);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send status update');
    } finally {
      setSendingChat(false);
    }
  };

  // Chat message function for discussions
  const handleSendChatMessage = async () => {
    if (!chatInput.trim()) return;

    setSendingChat(true);
    try {
      const response = await apiClient.post(`/defects/${defectId}/global-chat`, {
        message: chatInput,
        messageType: 'MESSAGE',
      });
      setChatMessages((prev) => [...prev, response.data]);
      setChatInput('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send message');
    } finally {
      setSendingChat(false);
    }
  };

  const handleQCValueChange = (parameterKey: string, value: any) => {
    setQcValues((prev) => ({ ...prev, [parameterKey]: value }));
  };

  const handleSaveQCValues = async () => {
    setSavingQC(true);
    try {
      await apiClient.post(`/qc-parameters/defect/${defectId}/values`, {
        values: qcValues,
      });
      setError('');
      // Refresh defect data
      const defectRes = await apiClient.get(`/defects/${defectId}`);
      setDefect(defectRes.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save QC values');
    } finally {
      setSavingQC(false);
    }
  };

  const renderQCField = (param: QCParameter) => {
    const value = qcValues[param.parameterKey] || param.defaultValue || '';

    switch (param.dataType) {
      case 'boolean':
        return (
          <select
            value={value}
            onChange={(e) => handleQCValueChange(param.parameterKey, e.target.value === 'true')}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            required={param.required}
          >
            <option value="">Select...</option>
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        );

      case 'enum':
        const enumOptions = param.enumValues ? JSON.parse(param.enumValues) : [];
        return (
          <select
            value={value}
            onChange={(e) => handleQCValueChange(param.parameterKey, e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            required={param.required}
          >
            <option value="">Select...</option>
            {enumOptions.map((opt: string) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => handleQCValueChange(param.parameterKey, parseFloat(e.target.value) || 0)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            required={param.required}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleQCValueChange(param.parameterKey, e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            required={param.required}
          />
        );

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleQCValueChange(param.parameterKey, e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            required={param.required}
          />
        );
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getEventDescription = (event: AuditEvent) => {
    switch (event.type) {
      case 'STATUS_CHANGE':
        const statusOld = event.oldValue ? JSON.parse(event.oldValue).status : 'Unknown';
        const statusNew = event.newValue ? JSON.parse(event.newValue).status : 'Unknown';
        return `Status changed from ${statusOld} to ${statusNew}`;
      case 'ASSIGNMENT_CHANGE':
        return 'Assignment changed';
      case 'COMMENT_ADDED':
        return 'Comment added';
      case 'DEFECT_CREATED':
        return 'Defect created';
      case 'DEFECT_UPDATED':
        return 'Defect updated';
      default:
        return event.type;
    }
  };

  // Edit modal handlers
  const handleOpenEditModal = () => {
    if (defect) {
      setEditFormData({
        title: defect.title,
        description: defect.description,
        status: defect.status,
        source: defect.source || 'STAGING_QC',
        priority: defect.priority,
        pmcName: defect.pmcName || defect.pmc?.name || '',
        locationName: defect.locationName || defect.location?.name || '',
        assignedToId: defect.assignedTo?.id || '',
      });
      setShowEditModal(true);
      setError('');
      setSuccess('');
    }
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setError('');
  };

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({
      ...prev,
      [name]: name === 'priority' ? parseInt(value) : value,
    }));
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const updatePayload: any = {};
      
      // Only include fields that have changed
      if (editFormData.title !== defect?.title) updatePayload.title = editFormData.title;
      if (editFormData.description !== defect?.description) updatePayload.description = editFormData.description;
      if (editFormData.status !== defect?.status) updatePayload.status = editFormData.status;
      if (editFormData.source !== defect?.source) updatePayload.source = editFormData.source;
      if (editFormData.priority !== defect?.priority) updatePayload.priority = editFormData.priority;
      if (editFormData.pmcName !== (defect?.pmcName || defect?.pmc?.name)) updatePayload.pmcName = editFormData.pmcName;
      if (editFormData.locationName !== (defect?.locationName || defect?.location?.name || '')) updatePayload.locationName = editFormData.locationName || null;
      if (editFormData.assignedToId !== (defect?.assignedTo?.id || '')) updatePayload.assignedToId = editFormData.assignedToId || null;

      if (Object.keys(updatePayload).length === 0) {
        setShowEditModal(false);
        return;
      }

      await apiClient.patch(`/defects/${defectId}`, updatePayload);
      
      // Refresh defect data
      const defectRes = await apiClient.get(`/defects/${defectId}`);
      setDefect(defectRes.data);
      
      setSuccess('Defect updated successfully');
      setShowEditModal(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update defect');
    } finally {
      setSaving(false);
    }
  };

  // Check if user can edit
  const canEdit = currentUser?.role === 'ADMIN' || currentUser?.role === 'PROJECT_MANAGER';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (error && !defect) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  if (!defect) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={currentUser} />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* AI Recommendations Panel */}
          <div className="mb-6">
            <AIRecommendationPanel defectId={defectId} />
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-800 text-sm">{success}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Header */}
          <div className="bg-white shadow-lg rounded-lg mb-6 border-l-[5px] border-l-blue-500 ring-2 ring-blue-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold">{defect.title}</h1>
                    {defect.isGlobal && (
                      <span className="px-2 py-1 text-xs font-bold rounded bg-blue-600 text-white">
                        🌐 GLOBAL DEFECT
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Created by {defect.createdBy.username} on{' '}
                    {new Date(defect.createdAt).toLocaleString()}
                  </p>
                  {/* Show locations for global defects */}
                  {defect.isGlobal && defect.defectLocations && defect.defectLocations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="text-xs text-gray-500">Locations:</span>
                      {defect.defectLocations.map((loc) => (
                        <span
                          key={loc.id}
                          className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-700"
                        >
                          📍 {loc.locationName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-3">
                  {defect.isGlobal && (
                    <button
                      onClick={() => setShowCollaborators(true)}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      Team ({defect.defectAssignees?.length || 0})
                    </button>
                  )}
                  <span
                    className={`px-3 py-1 text-sm font-semibold rounded-full ${
                      statusColors[defect.status] || 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {defect.status.replace('_', ' ')}
                  </span>
                  <span
                    className={`px-3 py-1 text-sm font-semibold rounded-full ${
                      priorityColors[defect.priority] || 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {priorityLabels[defect.priority] || defect.priority}
                  </span>
                  {canEdit && (
                    <button
                      onClick={handleOpenEditModal}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                {[
                  { id: 'details', label: 'Details' },
                  { id: 'qc', label: `QC Parameters (${qcParameters.length})` },
                  { id: 'comments', label: `Comments (${defect.comments.length})` },
                  { id: 'attachments', label: `Attachments (${defect.attachments.length})` },
                  { id: 'history', label: 'History' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'details' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
                    <p className="text-gray-900 whitespace-pre-wrap">{defect.description}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2">PMC</h3>
                      <p className="text-gray-900">{defect.pmcName || defect.pmc?.name || '-'}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2">Location</h3>
                      <p className="text-gray-900">{defect.locationName || defect.location?.name || '-'}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2">Assigned To</h3>
                      <p className="text-gray-900">
                        {defect.assignedTo ? (
                          <span className="flex items-center gap-2">
                            {defect.assignedTo.username}
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              defect.assignedTo.role === 'WIS' ? 'bg-green-100 text-green-700' :
                              defect.assignedTo.role === 'QC' ? 'bg-blue-100 text-blue-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {defect.assignedTo.role === 'PROJECT_MANAGER' ? 'PM' : defect.assignedTo.role}
                            </span>
                          </span>
                        ) : 'Unassigned'}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2">Created By</h3>
                      <p className="text-gray-900">
                        <span className="flex items-center gap-2">
                          {defect.createdBy.username}
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            defect.createdBy.role === 'QC' ? 'bg-blue-100 text-blue-700' :
                            defect.createdBy.role === 'PROJECT_MANAGER' ? 'bg-purple-100 text-purple-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {defect.createdBy.role === 'PROJECT_MANAGER' ? 'PM' : defect.createdBy.role}
                          </span>
                        </span>
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2">Created</h3>
                      <p className="text-gray-900">
                        {new Date(defect.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2">Last Updated</h3>
                      <p className="text-gray-900">
                        {new Date(defect.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'comments' && (
                <div className="space-y-6">
                  {/* Add Comment Form */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Add Comment</h3>
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      rows={4}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder="Enter your comment..."
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={handleAddComment}
                        disabled={submitting || !commentText.trim()}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium"
                      >
                        {submitting ? 'Adding...' : 'Add Comment'}
                      </button>
                    </div>
                  </div>

                  {/* Comments List */}
                  <div className="space-y-4">
                    {defect.comments.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No comments yet</p>
                    ) : (
                      defect.comments.map((comment) => (
                        <div key={comment.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div className="font-medium text-gray-900">
                              {comment.user.username}
                            </div>
                            <div className="text-sm text-gray-500">
                              {new Date(comment.createdAt).toLocaleString()}
                            </div>
                          </div>
                          <p className="text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'attachments' && (
                <div className="space-y-4">
                  {defect.attachments.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No attachments</p>
                  ) : (
                    defect.attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="border border-gray-200 rounded-lg p-4 flex justify-between items-center"
                      >
                        <div>
                          <div className="font-medium text-gray-900">{attachment.filename}</div>
                          <div className="text-sm text-gray-500">
                            {formatFileSize(attachment.fileSize)} • Uploaded by{' '}
                            {attachment.uploadedBy.username} •{' '}
                            {new Date(attachment.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              const response = await apiClient.get(
                                `/attachments/${attachment.id}/presigned-download`,
                              );
                              window.open(response.data.downloadUrl, '_blank');
                            } catch (err: any) {
                              setError(err.response?.data?.message || 'Failed to download file');
                            }
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                        >
                          Download
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'qc' && (
                <div className="space-y-6">
                  {qcParameters.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      No QC parameters available for {statusToPhase[defect.status] || 'Staging'} phase
                    </p>
                  ) : (
                    <>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <p className="text-sm text-blue-800">
                          Phase: <span className="font-medium">{statusToPhase[defect.status] || 'Staging'}</span>
                        </p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {qcParameters.map((param) => (
                          <div key={param.id}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {param.parameterLabel}
                              {param.required && <span className="text-red-500"> *</span>}
                            </label>
                            {renderQCField(param)}
                            {param.defaultValue && (
                              <p className="mt-1 text-xs text-gray-500">
                                Default: {param.defaultValue}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end pt-4 border-t border-gray-200">
                        <button
                          onClick={handleSaveQCValues}
                          disabled={savingQC}
                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium"
                        >
                          {savingQC ? 'Saving...' : 'Save QC Values'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-4">
                  {defect.auditEvents.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No history available</p>
                  ) : (
                    defect.auditEvents.map((event) => (
                      <div key={event.id} className="border-l-4 border-blue-500 pl-4 py-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-gray-900">
                              {getEventDescription(event)}
                            </div>
                            <div className="text-sm text-gray-500">
                              by {event.user.username}
                            </div>
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(event.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Edit Modal */}
      {showEditModal && defect && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Edit Defect</h3>
              <button
                onClick={handleCloseEditModal}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input
                    type="text"
                    name="title"
                    value={editFormData.title}
                    onChange={handleEditFormChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PMC *</label>
                  <input
                    type="text"
                    name="pmcName"
                    value={editFormData.pmcName}
                    onChange={handleEditFormChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    name="locationName"
                    value={editFormData.locationName}
                    onChange={handleEditFormChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                  <select
                    name="status"
                    value={editFormData.status}
                    onChange={handleEditFormChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="FIXED">Fixed</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="CLOSED">Closed</option>
                    <option value="REOPENED">Reopened</option>
                    <option value="DEFERRED">Deferred</option>
                    <option value="OUT_OF_SCOPE">Out of Scope</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority *</label>
                  <select
                    name="priority"
                    value={editFormData.priority}
                    onChange={handleEditFormChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value={1}>Critical</option>
                    <option value={2}>High</option>
                    <option value={3}>Medium</option>
                    <option value={4}>Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source *</label>
                  <select
                    name="source"
                    value={editFormData.source}
                    onChange={handleEditFormChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="PEER_REVIEW">Peer Review</option>
                    <option value="PM_FEEDBACK">PM Feedback</option>
                    <option value="STAGING_QC">Staging QC</option>
                    <option value="PRE_LIVE_QC">Pre-live QC</option>
                    <option value="POST_LIVE_QC">Post-live QC</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                  <select
                    name="assignedToId"
                    value={editFormData.assignedToId}
                    onChange={handleEditFormChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName || user.username} ({user.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                  <textarea
                    name="description"
                    value={editFormData.description}
                    onChange={handleEditFormChange}
                    required
                    rows={4}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Collaborators Modal for Global Defects */}
      {showCollaborators && defect?.isGlobal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                🌐 Global Defect Team
              </h3>
              <button
                onClick={() => setShowCollaborators(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                This is a global defect affecting multiple locations. The following WIS users are assigned to collaborate on this defect.
              </p>
            </div>

            <div className="space-y-3 max-h-64 overflow-y-auto">
              {defect.defectAssignees && defect.defectAssignees.length > 0 ? (
                defect.defectAssignees.map((assignee) => (
                  <div
                    key={assignee.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-medium">
                        {(assignee.user.fullName || assignee.user.username).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {assignee.user.fullName || assignee.user.username}
                          {assignee.user.id === currentUser?.id && (
                            <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                              You
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-gray-500">@{assignee.user.username}</p>
                      </div>
                    </div>
                    <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">
                      {assignee.user.role}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">No assignees yet</p>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                All team members can see each other's progress and collaborate via the chat below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Global Defect Chat Panel */}
      {defect?.isGlobal && (
        <div className="fixed bottom-0 right-4 w-96 bg-white rounded-t-lg shadow-2xl border border-gray-200 z-40">
          <div className="bg-blue-600 text-white px-4 py-3 rounded-t-lg flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="font-medium">Team Collaboration</span>
            </div>
            <span className="text-xs bg-blue-500 px-2 py-0.5 rounded">
              {defect.defectAssignees?.length || 0} members
            </span>
          </div>

          {/* Quick Status Buttons */}
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex space-x-2">
            <button
              onClick={handleStartWorking}
              disabled={sendingChat || hasUserStartedWork()}
              className={`flex-1 px-2 py-1 text-xs rounded transition-all ${
                hasUserStartedWork()
                  ? 'bg-green-200 text-green-500 cursor-not-allowed opacity-60'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              } disabled:opacity-50`}
            >
              {hasUserStartedWork() ? '✓ Started' : '🚀 Start Working'}
            </button>
            <button
              onClick={handleCompleteWork}
              disabled={sendingChat || hasUserCompletedWork()}
              className={`flex-1 px-2 py-1 text-xs rounded transition-all ${
                hasUserCompletedWork()
                  ? 'bg-blue-200 text-blue-500 cursor-not-allowed opacity-60'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              } disabled:opacity-50`}
            >
              {hasUserCompletedWork() ? '✓ Completed' : '✅ Complete Work'}
            </button>
          </div>

          {/* Chat Messages */}
          <div className="h-64 overflow-y-auto p-4 space-y-3" id="chat-messages">
            {chatMessages.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-8">
                <p className="text-lg">💬</p>
                <p className="font-medium">No messages yet</p>
                <p className="text-xs mt-1">Start collaborating with your team!</p>
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.user.id === currentUser?.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] ${msg.user.id === currentUser?.id ? 'order-2' : ''}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium ${
                        msg.user.id === currentUser?.id ? 'bg-blue-500' : 'bg-green-500'
                      }`}>
                        {(msg.user.fullName || msg.user.username).charAt(0).toUpperCase()}
                      </span>
                      <span className="text-xs font-medium text-gray-600">
                        {msg.user.fullName || msg.user.username}
                        {msg.user.id === currentUser?.id && ' (You)'}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div
                      className={`rounded-lg p-3 ${
                        msg.messageType === 'STATUS_UPDATE'
                          ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-yellow-400'
                          : msg.messageType === 'NOTIFICATION'
                          ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-400'
                          : msg.user.id === currentUser?.id
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100'
                      }`}
                    >
                      {msg.messageType === 'STATUS_UPDATE' && (
                        <span className="text-[10px] font-bold text-yellow-700 block mb-1">📢 STATUS UPDATE</span>
                      )}
                      <p className={`text-sm ${msg.user.id === currentUser?.id && msg.messageType === 'MESSAGE' ? 'text-white' : 'text-gray-800'}`}>
                        {msg.refinedMessage}
                      </p>
                      {msg.originalMessage.toLowerCase() !== msg.refinedMessage.toLowerCase() && 
                       msg.originalMessage.length > 0 && (
                        <details className="mt-2">
                          <summary className={`text-[10px] cursor-pointer ${
                            msg.user.id === currentUser?.id && msg.messageType === 'MESSAGE' ? 'text-blue-200' : 'text-gray-400'
                          }`}>
                            View original
                          </summary>
                          <p className={`text-[10px] mt-1 italic ${
                            msg.user.id === currentUser?.id && msg.messageType === 'MESSAGE' ? 'text-blue-200' : 'text-gray-400'
                          }`}>
                            "{msg.originalMessage}"
                          </p>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Chat Input for Team Discussion */}
          <div className="p-3 border-t border-gray-200">
            <div className="flex space-x-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendChatMessage()}
                placeholder="Discuss with your team..."
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => handleSendChatMessage()}
                disabled={sendingChat || !chatInput.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:bg-gray-400"
              >
                {sendingChat ? '...' : 'Send'}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1 text-center">
              💡 Chat with your team. Status buttons above can only be clicked once.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

