'use client';

import { useState, useEffect } from 'react';

interface FilterBarProps {
  projects: Array<{ id: string; name: string }>;
  users: Array<{ id: string; username: string }>;
  onFilterChange: (filters: FilterValues) => void;
}

export interface FilterValues {
  startDate?: string;
  endDate?: string;
  projectId?: string;
  pmcName?: string;
  assignedToId?: string;
  status?: string;
  type?: string;
}

export default function FilterBar({ projects, users, onFilterChange }: FilterBarProps) {
  const [filters, setFilters] = useState<FilterValues>({
    startDate: '',
    endDate: '',
    projectId: '',
    pmcName: '',
    assignedToId: '',
    status: '',
    type: '',
  });

  useEffect(() => {
    onFilterChange(filters);
  }, [filters, onFilterChange]);

  const handleChange = (key: keyof FilterValues, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
    }));
  };

  const handleClear = () => {
    const cleared = {
      startDate: '',
      endDate: '',
      projectId: '',
      pmcName: '',
      assignedToId: '',
      status: '',
      type: '',
    };
    setFilters(cleared);
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Filters</h3>
        <button
          onClick={handleClear}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Clear All
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Date Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={filters.startDate || ''}
            onChange={(e) => handleChange('startDate', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            End Date
          </label>
          <input
            type="date"
            value={filters.endDate || ''}
            onChange={(e) => handleChange('endDate', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>

        {/* PMC */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            PMC
          </label>
          <input
            type="text"
            value={filters.pmcName || ''}
            onChange={(e) => handleChange('pmcName', e.target.value)}
            placeholder="Search PMC..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>

        {/* Assignee */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Assignee
          </label>
          <select
            value={filters.assignedToId || ''}
            onChange={(e) => handleChange('assignedToId', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">All Users</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.username}
              </option>
            ))}
          </select>
        </div>

        {/* Phase (Status) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phase (Status)
          </label>
          <select
            value={filters.status || ''}
            onChange={(e) => handleChange('status', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">All Phases</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
            <option value="REOPENED">Reopened</option>
          </select>
        </div>

        {/* Type (Priority) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type (Priority)
          </label>
          <select
            value={filters.type || ''}
            onChange={(e) => handleChange('type', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value="1">Critical</option>
            <option value="2">High</option>
            <option value="3">Medium</option>
            <option value="4">Low</option>
          </select>
        </div>
      </div>
    </div>
  );
}

