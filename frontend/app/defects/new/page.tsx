'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import apiClient from '@/lib/api';
import { authService } from '@/lib/auth';
import Navbar from '@/components/Navbar';

interface User {
  id: string;
  username: string;
  fullName?: string;
  role: string;
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

interface PMCSuggestion {
  id: string;
  name: string;
}

interface LocationSuggestion {
  id: string;
  name: string;
}

const statusToPhase: Record<string, string> = {
  OPEN: 'Staging',
  IN_PROGRESS: 'PreLive',
  FIXED: 'PostLive',
  RESOLVED: 'PostLive',
  CLOSED: 'PostLive',
  REOPENED: 'Staging',
  DEFERRED: 'Staging',
  OUT_OF_SCOPE: 'Staging',
};

const defectSources = [
  { value: 'PEER_REVIEW', label: 'Peer Review' },
  { value: 'PM_FEEDBACK', label: 'Project Manager Feedback' },
  { value: 'STAGING_QC', label: 'Staging QC Defect' },
  { value: 'PRE_LIVE_QC', label: 'Pre-live QC Defect' },
  { value: 'POST_LIVE_QC', label: 'Post Live QC Defect' },
];

const defectStatuses = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'FIXED', label: 'Fixed' },
  { value: 'REOPENED', label: 'Reopened' },
  { value: 'DEFERRED', label: 'Deferred' },
  { value: 'OUT_OF_SCOPE', label: 'Out of Scope' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

export default function NewDefectPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<User[]>([]);
  const [qcParameters, setQcParameters] = useState<QCParameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // PMC and Location suggestions
  const [pmcSuggestions, setPmcSuggestions] = useState<PMCSuggestion[]>([]);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [showPmcSuggestions, setShowPmcSuggestions] = useState(false);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'OPEN',
    source: 'STAGING_QC',
    priority: '3',
    pmcName: '',
    locationName: '',
    assignedToId: '',
  });

  // Multiple locations and assignees for global defects
  const [isGlobalDefect, setIsGlobalDefect] = useState(false);
  const [additionalLocations, setAdditionalLocations] = useState<string[]>([]);
  const [additionalAssignees, setAdditionalAssignees] = useState<string[]>([]);
  const [newLocationInput, setNewLocationInput] = useState('');

  const [qcValues, setQcValues] = useState<Record<string, any>>({});
  const [attachments, setAttachments] = useState<File[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userData, usersRes] = await Promise.all([
          authService.getMe(),
          apiClient.get('/users/assignable'),
        ]);

        // WIS users cannot create defects - redirect
        if (userData.role === 'WIS') {
          router.push('/defects');
          return;
        }

        setCurrentUser(userData);
        setAssignableUsers(usersRes.data);
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

  // Fetch PMC suggestions
  const fetchPmcSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setPmcSuggestions([]);
      return;
    }
    try {
      const response = await apiClient.get(`/defects/suggestions/pmc?query=${encodeURIComponent(query)}`);
      setPmcSuggestions(response.data);
    } catch (err) {
      console.error('Failed to fetch PMC suggestions:', err);
    }
  }, []);

  // Fetch Location suggestions
  const fetchLocationSuggestions = useCallback(async (pmcName: string, query?: string) => {
    if (!pmcName) {
      setLocationSuggestions([]);
      return;
    }
    try {
      let url = `/defects/suggestions/location?pmcName=${encodeURIComponent(pmcName)}`;
      if (query) url += `&query=${encodeURIComponent(query)}`;
      const response = await apiClient.get(url);
      setLocationSuggestions(response.data);
    } catch (err) {
      console.error('Failed to fetch location suggestions:', err);
    }
  }, []);

  useEffect(() => {
    const fetchQCParameters = async () => {
      const phase = statusToPhase[formData.status] || 'Staging';
      try {
        const response = await apiClient.get(`/qc-parameters/phase/${phase}`);
        setQcParameters(response.data);
        
        const defaults: Record<string, any> = {};
        response.data.forEach((param: QCParameter) => {
          if (param.defaultValue) {
            defaults[param.parameterKey] = param.defaultValue;
          }
        });
        setQcValues(defaults);
      } catch (err: any) {
        console.error('Failed to load QC parameters:', err);
        setQcParameters([]);
      }
    };

    if (formData.status) {
      fetchQCParameters();
    }
  }, [formData.status]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Fetch suggestions for PMC
    if (name === 'pmcName') {
      fetchPmcSuggestions(value);
      setShowPmcSuggestions(true);
      // Also fetch locations for the current PMC
      if (value.length >= 2) {
        fetchLocationSuggestions(value);
      }
    }

    // Fetch suggestions for Location
    if (name === 'locationName' && formData.pmcName) {
      fetchLocationSuggestions(formData.pmcName, value);
      setShowLocationSuggestions(true);
    }
  };

  const handlePmcSelect = (pmc: PMCSuggestion) => {
    setFormData((prev) => ({ ...prev, pmcName: pmc.name }));
    setShowPmcSuggestions(false);
    fetchLocationSuggestions(pmc.name);
  };

  const handleLocationSelect = (location: LocationSuggestion) => {
    setFormData((prev) => ({ ...prev, locationName: location.name }));
    setShowLocationSuggestions(false);
  };

  const handleQCValueChange = (parameterKey: string, value: any) => {
    setQcValues((prev) => ({ ...prev, [parameterKey]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(Array.from(e.target.files));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      // Build the request payload
      const payload: any = {
        ...formData,
        priority: parseInt(formData.priority),
      };

      // Add multiple locations if global defect
      if (isGlobalDefect && additionalLocations.length > 0) {
        payload.locationNames = additionalLocations;
        payload.isGlobal = true;
      }

      // Add multiple assignees if global defect
      if (isGlobalDefect && additionalAssignees.length > 0) {
        payload.assignedToIds = additionalAssignees;
        payload.isGlobal = true;
      }

      const response = await apiClient.post('/defects', payload);
      const defectId = response.data.id;

      // Save QC values if any
      if (qcParameters.length > 0 && Object.keys(qcValues).length > 0) {
        await apiClient.post(`/qc-parameters/defect/${defectId}/values`, {
          values: qcValues,
        });
      }

      // Upload attachments if any
      if (attachments.length > 0) {
        const formDataFiles = new FormData();
        attachments.forEach((file) => {
          formDataFiles.append('files', file);
        });
        await apiClient.post(`/attachments/defect/${defectId}`, formDataFiles, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      router.push(`/defects/${defectId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create defect');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // Check if user can create defects
  if (currentUser?.role === 'WIS') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">Access Denied</h2>
          <p className="text-gray-500 mb-4">WIS users cannot create defects.</p>
          <Link href="/defects" className="text-blue-600 hover:text-blue-800">
            Go to Defects List
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={currentUser} />

      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <h1 className="text-2xl font-bold mb-6">Create New Defect</h1>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PMC *
                  </label>
                  <input
                    type="text"
                    name="pmcName"
                    value={formData.pmcName}
                    onChange={handleChange}
                    onFocus={() => formData.pmcName.length >= 2 && setShowPmcSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowPmcSuggestions(false), 200)}
                    required
                    placeholder="Enter PMC name..."
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                  {showPmcSuggestions && pmcSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto">
                      {pmcSuggestions.map((pmc) => (
                        <div
                          key={pmc.id}
                          onClick={() => handlePmcSelect(pmc)}
                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                        >
                          {pmc.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    name="locationName"
                    value={formData.locationName}
                    onChange={handleChange}
                    onFocus={() => formData.pmcName && setShowLocationSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 200)}
                    placeholder="Enter location name..."
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                  {showLocationSuggestions && locationSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto">
                      {locationSuggestions.map((loc) => (
                        <div
                          key={loc.id}
                          onClick={() => handleLocationSelect(loc)}
                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                        >
                          {loc.name}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    Locations linked to the selected PMC will appear as suggestions
                  </p>
                </div>
              </div>

              {/* Global Defect Toggle - Only for Admin, PM, QC */}
              {currentUser?.role !== 'WIS' && (
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
                          Add locations affected by this defect. All WIS users assigned to these locations will see this defect.
                        </p>
                      </div>

                      {/* Multiple Assignees */}
                      <div>
                        <label className="block text-sm font-medium text-blue-900 mb-2">
                          Assign to Multiple WIS Users
                        </label>
                        <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md bg-white">
                          {assignableUsers
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
                                <span className="ml-2 text-xs text-gray-400">@{user.username}</span>
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
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Defect Source *
                  </label>
                  <select
                    name="source"
                    value={formData.source}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    {defectSources.map((source) => (
                      <option key={source.value} value={source.value}>
                        {source.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status *
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    {defectStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority *
                  </label>
                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="1">Critical</option>
                    <option value="2">High</option>
                    <option value="3">Medium</option>
                    <option value="4">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assigned To
                  </label>
                  <select
                    name="assignedToId"
                    value={formData.assignedToId}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {assignableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName || user.username} ({user.role})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {currentUser?.role === 'QC' && 'You can assign to WIS users'}
                    {currentUser?.role === 'PROJECT_MANAGER' && 'You can assign to QC and WIS users'}
                    {currentUser?.role === 'ADMIN' && 'You can assign to any user'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description *
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  required
                  rows={4}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Attachments (optional)
                </label>
                <div className="flex items-center space-x-2">
                  <label className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-md hover:border-blue-400 transition-colors">
                      <svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <span className="text-sm text-gray-600">
                        {attachments.length > 0 ? `${attachments.length} file(s) selected` : 'Click to attach files (screenshots, documents, etc.)'}
                      </span>
                    </div>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
                {attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {attachments.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded text-sm">
                        <span className="truncate flex-1">
                          {file.name} <span className="text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
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

              {/* QC Parameters */}
              {qcParameters.length > 0 && (
                <div className="border-t border-gray-200 pt-6">
                  <h2 className="text-lg font-semibold mb-4">
                    QC Parameters ({statusToPhase[formData.status] || 'Staging'})
                  </h2>
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
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                <Link
                  href="/defects"
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium"
                >
                  {submitting ? 'Creating...' : 'Create Defect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
