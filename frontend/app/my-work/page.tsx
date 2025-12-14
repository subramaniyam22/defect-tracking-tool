'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import apiClient from '@/lib/api';
import { authService } from '@/lib/auth';
import AIRecommendationPanel from '@/components/AIRecommendationPanel';
import Navbar from '@/components/Navbar';

interface DefectAssignee {
  id: string;
  user: {
    id: string;
    username: string;
    fullName?: string;
    role: string;
  };
}

interface DefectLocation {
  id: string;
  locationName: string;
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
  } | null;
  createdBy: {
    id: string;
    username: string;
  };
  createdAt: string;
  updatedAt: string;
  _count: {
    comments: number;
    attachments: number;
  };
  defectAssignees?: DefectAssignee[];
  defectLocations?: DefectLocation[];
}

interface User {
  id: string;
  username: string;
  role: 'ADMIN' | 'PROJECT_MANAGER' | 'QC' | 'WIS';
}

interface AISuggestions {
  suggestions: string[];
  summary: {
    total: number;
    reopenRate: number;
    avgResolutionDays: number;
    bySource: Record<string, number>;
    byStatus: Record<string, number>;
  };
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

const defectStatuses = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'FIXED', label: 'Fixed' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'REOPENED', label: 'Reopened' },
  { value: 'DEFERRED', label: 'Deferred' },
  { value: 'OUT_OF_SCOPE', label: 'Out of Scope' },
];

export default function MyWorkPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedDefectId, setSelectedDefectId] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestions | null>(null);
  const [updatingDefectId, setUpdatingDefectId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  // Status update modal state
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedDefectForStatus, setSelectedDefectForStatus] = useState<Defect | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusComment, setStatusComment] = useState('');

  // Global defect chat state
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
  const [chatMessages, setChatMessages] = useState<Record<string, GlobalChatMessage[]>>({});
  const [chatInput, setChatInput] = useState<Record<string, string>>({});
  const [sendingChat, setSendingChat] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userData = await authService.getMe();
        setUser(userData);

        // Fetch defects assigned to current user
        const defectsRes = await apiClient.get('/defects', {
          params: { assignedToId: userData.id },
        });
        setDefects(defectsRes.data);

        // Fetch AI suggestions for WIS users
        if (userData.role === 'WIS') {
          try {
            const suggestionsRes = await apiClient.get('/ai/suggestions/me');
            setAiSuggestions(suggestionsRes.data);
          } catch (e) {
            console.error('Failed to load AI suggestions:', e);
          }
        }
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

  // Fetch global chat when a global defect is expanded
  useEffect(() => {
    const fetchGlobalChat = async () => {
      if (!selectedDefectId) return;
      const defect = defects.find(d => d.id === selectedDefectId);
      if (!defect?.isGlobal) return;

      try {
        const response = await apiClient.get(`/defects/${selectedDefectId}/global-chat`);
        setChatMessages(prev => ({ ...prev, [selectedDefectId]: response.data }));
        // Mark as read
        await apiClient.post(`/defects/${selectedDefectId}/global-chat/mark-read`);
      } catch (err) {
        console.error('Failed to fetch global chat:', err);
      }
    };

    fetchGlobalChat();

    // Poll for new messages every 10 seconds
    const defect = defects.find(d => d.id === selectedDefectId);
    if (defect?.isGlobal) {
      const interval = setInterval(fetchGlobalChat, 10000);
      return () => clearInterval(interval);
    }
  }, [selectedDefectId, defects]);

  // Check if current user has already clicked Start Working or Complete Work
  const hasUserStartedWork = (defectId: string): boolean => {
    const messages = chatMessages[defectId] || [];
    return messages.some(msg => 
      msg.user.id === user?.id && 
      msg.messageType === 'STATUS_UPDATE' &&
      (msg.originalMessage.toLowerCase().includes('starting') || 
       msg.refinedMessage.toLowerCase().includes('starting') ||
       msg.originalMessage.toLowerCase().includes('start'))
    );
  };

  const hasUserCompletedWork = (defectId: string): boolean => {
    const messages = chatMessages[defectId] || [];
    return messages.some(msg => 
      msg.user.id === user?.id && 
      msg.messageType === 'STATUS_UPDATE' &&
      (msg.originalMessage.toLowerCase().includes('completed') || 
       msg.refinedMessage.toLowerCase().includes('completed') ||
       msg.originalMessage.toLowerCase().includes('complete'))
    );
  };

  // Chat functions - Status updates (one-time only)
  const handleStartWorking = async (defectId: string) => {
    if (hasUserStartedWork(defectId)) return; // Prevent duplicate clicks
    
    setSendingChat(defectId);
    try {
      const response = await apiClient.post(`/defects/${defectId}/global-chat`, {
        message: 'Starting work on this defect now.',
        messageType: 'STATUS_UPDATE',
      });
      setChatMessages(prev => ({
        ...prev,
        [defectId]: [...(prev[defectId] || []), response.data],
      }));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send status update');
    } finally {
      setSendingChat(null);
    }
  };

  const handleCompleteWork = async (defectId: string) => {
    if (hasUserCompletedWork(defectId)) return; // Prevent duplicate clicks
    
    setSendingChat(defectId);
    try {
      const response = await apiClient.post(`/defects/${defectId}/global-chat`, {
        message: 'Completed my work on this defect.',
        messageType: 'STATUS_UPDATE',
      });
      setChatMessages(prev => ({
        ...prev,
        [defectId]: [...(prev[defectId] || []), response.data],
      }));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send status update');
    } finally {
      setSendingChat(null);
    }
  };

  // Chat message function for discussions
  const handleSendChatMessage = async (defectId: string) => {
    const message = chatInput[defectId]?.trim();
    if (!message) return;

    setSendingChat(defectId);
    try {
      const response = await apiClient.post(`/defects/${defectId}/global-chat`, {
        message,
        messageType: 'MESSAGE',
      });
      setChatMessages(prev => ({
        ...prev,
        [defectId]: [...(prev[defectId] || []), response.data],
      }));
      setChatInput(prev => ({ ...prev, [defectId]: '' }));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send message');
    } finally {
      setSendingChat(null);
    }
  };

  // Check if all team members have completed work for a global defect
  const checkAllTeamCompleted = (defectId: string, defect: Defect): { allCompleted: boolean; completedUsers: string[]; pendingUsers: string[] } => {
    const messages = chatMessages[defectId] || [];
    const assignees = defect.defectAssignees || [];
    
    // Get unique user IDs who have marked complete
    const completedUserIds = new Set<string>();
    messages.forEach(msg => {
      if (msg.messageType === 'STATUS_UPDATE' && 
          (msg.refinedMessage.toLowerCase().includes('completed') || 
           msg.refinedMessage.toLowerCase().includes('complete') ||
           msg.originalMessage.toLowerCase().includes('completed') ||
           msg.originalMessage.toLowerCase().includes('complete'))) {
        completedUserIds.add(msg.user.id);
      }
    });

    const completedUsers: string[] = [];
    const pendingUsers: string[] = [];

    assignees.forEach(assignee => {
      if (completedUserIds.has(assignee.user.id)) {
        completedUsers.push(assignee.user.fullName || assignee.user.username);
      } else {
        pendingUsers.push(assignee.user.fullName || assignee.user.username);
      }
    });

    return {
      allCompleted: pendingUsers.length === 0 && completedUsers.length > 0,
      completedUsers,
      pendingUsers
    };
  };

  // Check if status can be changed to resolved/closed for global defects
  const canMarkAsComplete = (defect: Defect, targetStatus: string): boolean => {
    if (!defect.isGlobal) return true;
    
    // Only check for completing statuses
    const completingStatuses = ['RESOLVED', 'CLOSED', 'FIXED'];
    if (!completingStatuses.includes(targetStatus)) return true;

    const { allCompleted } = checkAllTeamCompleted(defect.id, defect);
    return allCompleted;
  };

  // Open status modal
  const handleOpenStatusModal = (defect: Defect) => {
    setSelectedDefectForStatus(defect);
    setNewStatus(defect.status);
    setStatusComment('');
    setShowStatusModal(true);
    setError('');
  };

  const handleCloseStatusModal = () => {
    setShowStatusModal(false);
    setSelectedDefectForStatus(null);
    setNewStatus('');
    setStatusComment('');
    setAttachments([]);
  };

  const handleStatusChange = async () => {
    if (!selectedDefectForStatus || !newStatus) return;
    
    // Check if global defect can be marked as complete
    if (!canMarkAsComplete(selectedDefectForStatus, newStatus)) {
      const { pendingUsers } = checkAllTeamCompleted(selectedDefectForStatus.id, selectedDefectForStatus);
      setError(`Cannot mark as ${newStatus}. The following team members have not marked their work as complete: ${pendingUsers.join(', ')}. All team members must click "Complete Work" in the chat before the defect can be resolved.`);
      return;
    }
    
    setUpdatingDefectId(selectedDefectForStatus.id);
    setError('');
    setSuccess('');
    
    try {
      await apiClient.patch(`/defects/${selectedDefectForStatus.id}`, { status: newStatus });
      
      // Add comment if provided
      if (statusComment.trim()) {
        await apiClient.post(`/defects/${selectedDefectForStatus.id}/comments`, {
          content: statusComment,
        });
      }
      
      // Upload attachments if any
      if (attachments.length > 0) {
        const formDataFiles = new FormData();
        attachments.forEach((file) => {
          formDataFiles.append('files', file);
        });
        await apiClient.post(`/attachments/defect/${selectedDefectForStatus.id}`, formDataFiles, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setAttachments([]);
      }
      
      // Refresh defects list
      const defectsRes = await apiClient.get('/defects', {
        params: { assignedToId: user?.id },
      });
      setDefects(defectsRes.data);
      setSuccess(`Status updated to ${newStatus.replace('_', ' ')}${statusComment ? ' with comment' : ''}`);
      handleCloseStatusModal();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdatingDefectId(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(Array.from(e.target.files));
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
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-2xl font-bold mb-6">My Work</h1>

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

          {/* AI Suggestions Panel for WIS Users */}
          {user?.role === 'WIS' && aiSuggestions && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg shadow-lg p-6 mb-6 border border-indigo-100">
              <h2 className="text-lg font-bold text-indigo-900 mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
                </svg>
                AI Suggestions to Reduce Your Defects
              </h2>
              
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs text-gray-500">Assigned Defects</p>
                  <p className="text-xl font-bold text-gray-900">{aiSuggestions.summary.total}</p>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs text-gray-500">Reopen Rate</p>
                  <p className="text-xl font-bold text-orange-600">{aiSuggestions.summary.reopenRate}%</p>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs text-gray-500">Avg Resolution</p>
                  <p className="text-xl font-bold text-blue-600">{aiSuggestions.summary.avgResolutionDays} days</p>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs text-gray-500">Your Status</p>
                  <p className="text-lg font-bold text-green-600">
                    {aiSuggestions.summary.reopenRate < 10 ? 'Excellent' : 
                     aiSuggestions.summary.reopenRate < 20 ? 'Good' : 'Needs Improvement'}
                  </p>
                </div>
              </div>

              {/* Suggestions List */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Personalized Recommendations</h3>
                <ul className="space-y-2">
                  {aiSuggestions.suggestions.map((suggestion, index) => (
                    <li key={index} className="flex items-start">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-medium mr-2 mt-0.5">
                        {index + 1}
                      </span>
                      <p className="text-sm text-gray-700">{suggestion}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {defects.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-500">No defects assigned to you</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Defects List */}
              <div className="bg-white shadow rounded-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold">
                    Assigned Defects ({defects.length})
                  </h2>
                  {user?.role === 'WIS' && (
                    <p className="text-sm text-gray-500 mt-1">
                      Update status and add attachments to your assigned defects
                    </p>
                  )}
                </div>
                <div className="divide-y divide-gray-200">
                  {defects.map((defect) => (
                    <div
                      key={defect.id}
                      className={`p-6 transition-all duration-200 ${
                        selectedDefectId === defect.id 
                          ? 'border-l-[5px] border-l-blue-500 bg-blue-50/50 shadow-lg ring-1 ring-blue-200' 
                          : 'hover:bg-gray-50 border-l-[5px] border-l-transparent'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2 flex-wrap">
                            <Link
                              href={`/defects/${defect.id}`}
                              className="text-lg font-semibold text-gray-900 hover:text-blue-600"
                            >
                              {defect.title}
                            </Link>
                            {defect.isGlobal && (
                              <span className="px-2 py-1 text-xs font-bold rounded bg-blue-600 text-white flex items-center gap-1">
                                🌐 Global
                              </span>
                            )}
                            <span
                              className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                statusColors[defect.status] || 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {defect.status.replace('_', ' ')}
                            </span>
                            <span
                              className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                priorityColors[defect.priority] || 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {priorityLabels[defect.priority] || defect.priority}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                            {defect.description}
                          </p>
                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <span>PMC: {defect.pmcName || defect.pmc?.name || '-'}</span>
                            {defect.locationName && (
                              <>
                                <span>•</span>
                                <span>Location: {defect.locationName}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>{defect._count.attachments} attachments</span>
                            <span>•</span>
                            <span>
                              Updated: {new Date(defect.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedDefectId(
                            selectedDefectId === defect.id ? null : defect.id,
                          )}
                          className="ml-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          {selectedDefectId === defect.id ? 'Hide Actions' : 'Show Actions'}
                        </button>
                      </div>

                      {/* Expanded Actions Panel */}
                      {selectedDefectId === defect.id && (
                        <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                          {/* Status Update Section */}
                          <div className="bg-gray-50 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-medium text-gray-700">Quick Actions</h4>
                              <button
                                onClick={() => handleOpenStatusModal(defect)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Update Status with Comment
                              </button>
                            </div>
                            <p className="text-sm text-gray-500">
                              Click the button above to update the status and add a comment explaining your changes.
                            </p>
                            
                            {/* Quick Status Buttons */}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="text-xs text-gray-500 w-full mb-1">Quick status change:</span>
                              {defectStatuses.slice(0, 4).map((status) => {
                                const isCompletingStatus = ['RESOLVED', 'CLOSED', 'FIXED'].includes(status.value);
                                const canComplete = !defect.isGlobal || !isCompletingStatus || canMarkAsComplete(defect, status.value);
                                return (
                                  <button
                                    key={status.value}
                                    onClick={() => {
                                      if (!canComplete) {
                                        const { pendingUsers } = checkAllTeamCompleted(defect.id, defect);
                                        setError(`Cannot mark as ${status.label}. Waiting for: ${pendingUsers.join(', ')} to complete their work.`);
                                        return;
                                      }
                                      setSelectedDefectForStatus(defect);
                                      setNewStatus(status.value);
                                      setStatusComment('');
                                      setShowStatusModal(true);
                                    }}
                                    disabled={defect.status === status.value}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                                      defect.status === status.value
                                        ? 'bg-blue-600 text-white'
                                        : !canComplete && isCompletingStatus
                                        ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
                                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                                    } disabled:opacity-50`}
                                    title={!canComplete && isCompletingStatus ? 'All team members must complete their work first' : ''}
                                  >
                                    {status.label}
                                    {!canComplete && isCompletingStatus && ' 🔒'}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Global Defect Completion Status */}
                            {defect.isGlobal && (
                              <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm font-medium text-blue-800">🌐 Team Completion Status</span>
                                </div>
                                {(() => {
                                  const { completedUsers, pendingUsers, allCompleted } = checkAllTeamCompleted(defect.id, defect);
                                  return (
                                    <div className="space-y-2">
                                      {completedUsers.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          <span className="text-xs text-green-700">✅ Completed:</span>
                                          {completedUsers.map(name => (
                                            <span key={name} className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                                              {name}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      {pendingUsers.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          <span className="text-xs text-orange-700">⏳ Pending:</span>
                                          {pendingUsers.map(name => (
                                            <span key={name} className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                                              {name}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      {allCompleted ? (
                                        <p className="text-xs text-green-600 font-medium">✅ All team members have completed - defect can be resolved!</p>
                                      ) : (
                                        <p className="text-xs text-orange-600">⚠️ Defect cannot be marked as Resolved/Closed until all team members complete their work</p>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>

                          {/* Global Defect Team Chat */}
                          {defect.isGlobal && (
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 overflow-hidden">
                              <div className="bg-blue-600 text-white px-4 py-3 flex justify-between items-center">
                                <div className="flex items-center space-x-2">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                  </svg>
                                  <span className="font-medium">🌐 Team Collaboration Chat</span>
                                </div>
                                <span className="text-xs bg-blue-500 px-2 py-0.5 rounded">
                                  {defect.defectAssignees?.length || 0} members
                                </span>
                              </div>

                              {/* Team Members */}
                              {defect.defectAssignees && defect.defectAssignees.length > 0 && (
                                <div className="px-4 py-2 bg-blue-100/50 border-b border-blue-200 flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-blue-700 font-medium">Team:</span>
                                  {defect.defectAssignees.map((assignee) => (
                                    <span
                                      key={assignee.id}
                                      className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${
                                        assignee.user.id === user?.id
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-white text-blue-700 border border-blue-300'
                                      }`}
                                    >
                                      {assignee.user.fullName || assignee.user.username}
                                      {assignee.user.id === user?.id && ' (You)'}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Quick Status Buttons - One-time click only */}
                              <div className="px-4 py-2 bg-white/50 border-b border-blue-200 flex space-x-2">
                                <button
                                  onClick={() => handleStartWorking(defect.id)}
                                  disabled={sendingChat === defect.id || hasUserStartedWork(defect.id)}
                                  className={`flex-1 px-3 py-1.5 text-xs rounded font-medium transition-all ${
                                    hasUserStartedWork(defect.id)
                                      ? 'bg-green-200 text-green-500 cursor-not-allowed opacity-60'
                                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                                  } disabled:opacity-50`}
                                >
                                  {hasUserStartedWork(defect.id) ? '✓ Started' : '🚀 Start Working'}
                                </button>
                                <button
                                  onClick={() => handleCompleteWork(defect.id)}
                                  disabled={sendingChat === defect.id || hasUserCompletedWork(defect.id)}
                                  className={`flex-1 px-3 py-1.5 text-xs rounded font-medium transition-all ${
                                    hasUserCompletedWork(defect.id)
                                      ? 'bg-blue-200 text-blue-500 cursor-not-allowed opacity-60'
                                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                  } disabled:opacity-50`}
                                >
                                  {hasUserCompletedWork(defect.id) ? '✓ Completed' : '✅ Complete Work'}
                                </button>
                              </div>

                              {/* Chat Messages */}
                              <div className="h-48 overflow-y-auto p-4 space-y-3 bg-white/30">
                                {(!chatMessages[defect.id] || chatMessages[defect.id].length === 0) ? (
                                  <div className="text-center text-gray-500 text-sm py-6">
                                    <p className="text-2xl mb-2">💬</p>
                                    <p className="font-medium">No messages yet</p>
                                    <p className="text-xs mt-1">Start collaborating with your team!</p>
                                  </div>
                                ) : (
                                  chatMessages[defect.id].map((msg) => (
                                    <div
                                      key={msg.id}
                                      className={`flex ${msg.user.id === user?.id ? 'justify-end' : 'justify-start'}`}
                                    >
                                      <div className={`max-w-[85%]`}>
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-medium ${
                                            msg.user.id === user?.id ? 'bg-blue-500' : 'bg-green-500'
                                          }`}>
                                            {(msg.user.fullName || msg.user.username).charAt(0).toUpperCase()}
                                          </span>
                                          <span className="text-[10px] font-medium text-gray-600">
                                            {msg.user.fullName || msg.user.username}
                                            {msg.user.id === user?.id && ' (You)'}
                                          </span>
                                          <span className="text-[10px] text-gray-400">
                                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                        </div>
                                        <div
                                          className={`rounded-lg p-2 text-sm ${
                                            msg.messageType === 'STATUS_UPDATE'
                                              ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-yellow-400'
                                              : msg.user.id === user?.id
                                              ? 'bg-blue-500 text-white'
                                              : 'bg-white border border-gray-200'
                                          }`}
                                        >
                                          {msg.messageType === 'STATUS_UPDATE' && (
                                            <span className="text-[10px] font-bold text-yellow-700 block mb-1">📢 STATUS</span>
                                          )}
                                          <p className={`text-xs ${msg.user.id === user?.id && msg.messageType === 'MESSAGE' ? 'text-white' : 'text-gray-800'}`}>
                                            {msg.refinedMessage}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>

                              {/* Chat Input for Team Discussion */}
                              <div className="p-3 bg-white border-t border-blue-200">
                                <div className="flex space-x-2">
                                  <input
                                    type="text"
                                    value={chatInput[defect.id] || ''}
                                    onChange={(e) => setChatInput(prev => ({ ...prev, [defect.id]: e.target.value }))}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSendChatMessage(defect.id)}
                                    placeholder="Discuss with your team..."
                                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <button
                                    onClick={() => handleSendChatMessage(defect.id)}
                                    disabled={sendingChat === defect.id || !(chatInput[defect.id]?.trim())}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:bg-gray-400"
                                  >
                                    {sendingChat === defect.id ? '...' : 'Send'}
                                  </button>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1 text-center">
                                  💡 Chat with your team members. Status buttons above can only be clicked once.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* AI Recommendations Panel */}
                          <AIRecommendationPanel defectId={defect.id} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Status Update Modal with Comment */}
      {showStatusModal && selectedDefectForStatus && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Update Defect Status</h3>
              <button
                onClick={handleCloseStatusModal}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                Defect: <span className="font-medium">{selectedDefectForStatus.title}</span>
              </p>
              <p className="text-sm text-gray-500">
                Current Status: <span className={`px-2 py-0.5 text-xs rounded-full ${statusColors[selectedDefectForStatus.status]}`}>
                  {selectedDefectForStatus.status.replace('_', ' ')}
                </span>
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Status *
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  {defectStatuses.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Add Comment <span className="text-gray-400">(recommended)</span>
                </label>
                <textarea
                  value={statusComment}
                  onChange={(e) => setStatusComment(e.target.value)}
                  rows={4}
                  placeholder={
                    newStatus === 'FIXED' ? 'Describe what was fixed and how...' :
                    newStatus === 'CLOSED' ? 'Add closing remarks or summary...' :
                    newStatus === 'REOPENED' ? 'Explain why this needs to be reopened...' :
                    newStatus === 'IN_PROGRESS' ? 'Describe what you plan to do...' :
                    'Add any notes about this status change...'
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {newStatus === 'FIXED' && '💡 Describe what was done to fix the issue for QC verification'}
                  {newStatus === 'CLOSED' && '💡 Summarize the resolution for future reference'}
                  {newStatus === 'IN_PROGRESS' && '💡 Let others know what you are working on'}
                </p>
              </div>

              {/* Optional Attachments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Add Attachments <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-2"
                />
                {attachments.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    Selected: {attachments.map(f => f.name).join(', ')}
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseStatusModal}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStatusChange}
                  disabled={updatingDefectId === selectedDefectForStatus.id || newStatus === selectedDefectForStatus.status}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium"
                >
                  {updatingDefectId === selectedDefectForStatus.id ? 'Updating...' : 'Update Status'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

