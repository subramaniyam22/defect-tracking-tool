'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { authService } from '@/lib/auth';
import apiClient from '@/lib/api';
import FilterBar, { FilterValues } from '@/components/FilterBar';
import Navbar from '@/components/Navbar';

// Dynamically import ECharts to avoid SSR issues
const ReactECharts = dynamic(
  () => import('echarts-for-react').then((mod) => mod.default),
  { 
    ssr: false,
    loading: () => <div className="h-[400px] flex items-center justify-center text-gray-400">Loading chart...</div>
  }
);

interface User {
  id: string;
  username: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

interface Metrics {
  kpis: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    reopened: number;
  };
  charts: {
    byStatus: {
      labels: string[];
      data: number[];
    };
    byType: {
      labels: string[];
      data: number[];
    };
    dailyTrend: Array<{ date: string; count: number }>;
    reopenedTrend: Array<{ date: string; count: number }>;
  };
}

interface Project {
  id: string;
  name: string;
}

interface UserListItem {
  id: string;
  username: string;
}

interface AISuggestions {
  suggestions: string[];
  summary: {
    total: number;
    reopenRate: number;
    avgResolutionDays: number;
    bySource: Record<string, number>;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
  };
}

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  PROJECT_MANAGER: 'Project Manager',
  QC: 'QC',
  WIS: 'WIS',
};

const roleColors: Record<string, { bg: string; text: string; border: string }> = {
  ADMIN: { bg: 'from-red-500 to-red-600', text: 'text-red-100', border: 'border-red-200' },
  PROJECT_MANAGER: { bg: 'from-purple-500 to-purple-600', text: 'text-purple-100', border: 'border-purple-200' },
  QC: { bg: 'from-blue-500 to-blue-600', text: 'text-blue-100', border: 'border-blue-200' },
  WIS: { bg: 'from-green-500 to-green-600', text: 'text-green-100', border: 'border-green-200' },
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<FilterValues>({});
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestions | null>(null);
  const [globalSuggestions, setGlobalSuggestions] = useState<AISuggestions | null>(null);
  const [showGlobalView, setShowGlobalView] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      // Check if we have a token before making the request
      if (typeof window === 'undefined') return;
      
      const token = localStorage.getItem('accessToken');
      if (!token) {
        router.push('/login');
        return;
      }

      try {
        const userData = await authService.getMe();
        setUser(userData);
        setLoading(false);
        
        // Fetch AI suggestions for the user
        try {
          const suggestionsRes = await apiClient.get('/ai/suggestions/me');
          setAiSuggestions(suggestionsRes.data);
          
          // If Admin or PM, also fetch global suggestions
          if (userData.role === 'ADMIN' || userData.role === 'PROJECT_MANAGER') {
            try {
              const globalRes = await apiClient.get('/ai/suggestions/admin');
              setGlobalSuggestions(globalRes.data);
            } catch (e) {
              console.error('Failed to load global suggestions:', e);
            }
          }
        } catch (e) {
          console.error('Failed to load AI suggestions:', e);
        }
      } catch (err: any) {
        console.error('Failed to load user data:', err);
        setError(err.response?.data?.message || 'Failed to load user data');
        // Only redirect if it's a 401 and we don't have a token refresh happening
        if (err.response?.status === 401) {
          // Clear tokens and redirect
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          router.push('/login');
        }
      }
    };

    fetchUser();
  }, [router]);

  const fetchMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.projectId) params.append('projectId', filters.projectId);
      if (filters.pmcName) params.append('pmcName', filters.pmcName);
      if (filters.assignedToId) params.append('assignedToId', filters.assignedToId);
      if (filters.status) params.append('status', filters.status);
      if (filters.type) params.append('type', filters.type);

      const response = await apiClient.get(`/dashboard/metrics?${params.toString()}`);
      setMetrics(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load metrics');
    }
  }, [filters]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [projectsRes, usersRes] = await Promise.all([
          apiClient.get('/projects'),
          apiClient.get('/users'),
        ]);

        setProjects(projectsRes.data);
        setUsers(usersRes.data);
        setLoading(false);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load data');
        if (err.response?.status === 401) {
          router.push('/login');
        }
      }
    };

    fetchData();
  }, [router]);

  useEffect(() => {
    if (!loading) {
      fetchMetrics();
    }
  }, [filters, loading, fetchMetrics]);

  // Chart options
  const getStatusChartOption = () => {
    if (!metrics) return {};
    return {
      title: {
        text: 'Defects by Phase (Status)',
        left: 'center',
      },
      tooltip: {
        trigger: 'item',
      },
      series: [
        {
          name: 'Defects',
          type: 'pie',
          radius: '60%',
          data: metrics.charts.byStatus.labels.map((label, index) => ({
            value: metrics.charts.byStatus.data[index],
            name: label.replace('_', ' '),
          })),
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    };
  };

  const getTypeChartOption = () => {
    if (!metrics) return {};
    return {
      title: {
        text: 'Defects by Type (Priority)',
        left: 'center',
      },
      tooltip: {
        trigger: 'item',
      },
      series: [
        {
          name: 'Defects',
          type: 'pie',
          radius: '60%',
          data: metrics.charts.byType.labels.map((label, index) => ({
            value: metrics.charts.byType.data[index],
            name: label,
          })),
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    };
  };

  const getDailyTrendOption = () => {
    if (!metrics) return {};
    return {
      title: {
        text: 'Daily Trend',
        left: 'center',
      },
      tooltip: {
        trigger: 'axis',
      },
      xAxis: {
        type: 'category',
        data: metrics.charts.dailyTrend.map((item) => item.date),
      },
      yAxis: {
        type: 'value',
      },
      series: [
        {
          name: 'Defects Created',
          type: 'line',
          data: metrics.charts.dailyTrend.map((item) => item.count),
          smooth: true,
          areaStyle: {},
        },
      ],
    };
  };

  const getReopenedTrendOption = () => {
    if (!metrics) return {};
    return {
      title: {
        text: 'Reopened Trend',
        left: 'center',
      },
      tooltip: {
        trigger: 'axis',
      },
      xAxis: {
        type: 'category',
        data: metrics.charts.reopenedTrend.map((item) => item.date),
      },
      yAxis: {
        type: 'value',
      },
      series: [
        {
          name: 'Reopened Defects',
          type: 'bar',
          data: metrics.charts.reopenedTrend.map((item) => item.count),
          itemStyle: {
            color: '#f97316',
          },
        },
      ],
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

          {/* Filter Bar */}
          <FilterBar projects={projects} users={users} onFilterChange={setFilters} />

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* KPI Cards */}
          {metrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Defects</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {metrics.kpis.total}
                    </p>
                  </div>
                  <div className="bg-blue-100 rounded-full p-3">
                    <svg
                      className="w-8 h-8 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Open</p>
                    <p className="text-3xl font-bold text-blue-600 mt-2">
                      {metrics.kpis.open}
                    </p>
                  </div>
                  <div className="bg-blue-100 rounded-full p-3">
                    <svg
                      className="w-8 h-8 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">In Progress</p>
                    <p className="text-3xl font-bold text-yellow-600 mt-2">
                      {metrics.kpis.inProgress}
                    </p>
                  </div>
                  <div className="bg-yellow-100 rounded-full p-3">
                    <svg
                      className="w-8 h-8 text-yellow-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Resolved</p>
                    <p className="text-3xl font-bold text-green-600 mt-2">
                      {metrics.kpis.resolved}
                    </p>
                  </div>
                  <div className="bg-green-100 rounded-full p-3">
                    <svg
                      className="w-8 h-8 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Closed</p>
                    <p className="text-3xl font-bold text-gray-600 mt-2">
                      {metrics.kpis.closed}
                    </p>
                  </div>
                  <div className="bg-gray-100 rounded-full p-3">
                    <svg
                      className="w-8 h-8 text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Reopened</p>
                    <p className="text-3xl font-bold text-orange-600 mt-2">
                      {metrics.kpis.reopened}
                    </p>
                  </div>
                  <div className="bg-orange-100 rounded-full p-3">
                    <svg
                      className="w-8 h-8 text-orange-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Charts */}
          {metrics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <ReactECharts
                  option={getStatusChartOption()}
                  style={{ height: '400px' }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <ReactECharts
                  option={getTypeChartOption()}
                  style={{ height: '400px' }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <ReactECharts
                  option={getDailyTrendOption()}
                  style={{ height: '400px' }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <ReactECharts
                  option={getReopenedTrendOption()}
                  style={{ height: '400px' }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              </div>
            </div>
          )}

          {!metrics && !loading && (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-500">No metrics available</p>
            </div>
          )}

          {/* AI Insights & Suggestions Section */}
          {aiSuggestions && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold flex items-center">
                  <svg className="w-6 h-6 mr-2 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
                  </svg>
                  AI Insights & Suggestions
                </h3>
                {(user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER') && globalSuggestions && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">View:</span>
                    <button
                      onClick={() => setShowGlobalView(false)}
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${
                        !showGlobalView
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      My Insights
                    </button>
                    <button
                      onClick={() => setShowGlobalView(true)}
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${
                        showGlobalView
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Team Overview
                    </button>
                  </div>
                )}
              </div>

              {(() => {
                const currentSuggestions = showGlobalView && globalSuggestions ? globalSuggestions : aiSuggestions;
                const roleColor = roleColors[user?.role || 'WIS'];
                
                return (
                  <div className="space-y-6">
                    {/* Role Badge and Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className={`bg-gradient-to-br ${roleColor.bg} rounded-lg shadow p-4 text-white`}>
                        <p className={`text-sm ${roleColor.text}`}>
                          {showGlobalView ? 'Team Total' : 'Your'} Defects
                        </p>
                        <p className="text-3xl font-bold">{currentSuggestions.summary.total}</p>
                        <p className={`text-xs ${roleColor.text} mt-1`}>
                          {showGlobalView ? 'All Team Members' : roleLabels[user?.role || 'WIS']}
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow p-4 text-white">
                        <p className="text-sm text-orange-100">Reopen Rate</p>
                        <p className="text-3xl font-bold">{currentSuggestions.summary.reopenRate}%</p>
                        <p className="text-xs text-orange-100 mt-1">
                          {currentSuggestions.summary.reopenRate < 10 ? 'Excellent' : 
                           currentSuggestions.summary.reopenRate < 20 ? 'Good' : 'Needs Attention'}
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow p-4 text-white">
                        <p className="text-sm text-purple-100">Avg Resolution</p>
                        <p className="text-3xl font-bold">{currentSuggestions.summary.avgResolutionDays} days</p>
                        <p className="text-xs text-purple-100 mt-1">
                          {currentSuggestions.summary.avgResolutionDays < 3 ? 'Fast' : 
                           currentSuggestions.summary.avgResolutionDays < 7 ? 'On Track' : 'Review Needed'}
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg shadow p-4 text-white">
                        <p className="text-sm text-teal-100">Top Priority</p>
                        <p className="text-lg font-bold">
                          {Object.entries(currentSuggestions.summary.byPriority || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'}
                        </p>
                        <p className="text-xs text-teal-100 mt-1">
                          {Object.entries(currentSuggestions.summary.byPriority || {}).sort((a, b) => b[1] - a[1])[0]?.[1] || 0} defects
                        </p>
                      </div>
                    </div>

                    {/* AI Suggestions */}
                    <div className={`bg-gradient-to-r ${
                      showGlobalView ? 'from-indigo-50 to-purple-50 border-indigo-100' : 
                      user?.role === 'WIS' ? 'from-green-50 to-emerald-50 border-green-100' :
                      user?.role === 'QC' ? 'from-blue-50 to-cyan-50 border-blue-100' :
                      user?.role === 'PROJECT_MANAGER' ? 'from-purple-50 to-pink-50 border-purple-100' :
                      'from-red-50 to-orange-50 border-red-100'
                    } rounded-lg shadow p-6 border`}>
                      <h4 className={`text-lg font-semibold mb-4 flex items-center ${
                        showGlobalView ? 'text-indigo-900' :
                        user?.role === 'WIS' ? 'text-green-900' :
                        user?.role === 'QC' ? 'text-blue-900' :
                        user?.role === 'PROJECT_MANAGER' ? 'text-purple-900' :
                        'text-red-900'
                      }`}>
                        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        {showGlobalView 
                          ? 'Team Improvement Recommendations' 
                          : `Personalized Suggestions for ${roleLabels[user?.role || 'WIS']}`}
                      </h4>
                      <p className="text-sm text-gray-600 mb-4">
                        {showGlobalView 
                          ? 'These suggestions are generated based on defect patterns across all users and PMCs.'
                          : `Based on your assigned defects and ${roleLabels[user?.role || 'WIS']} responsibilities.`}
                      </p>
                      <ul className="space-y-3">
                        {currentSuggestions.suggestions.map((suggestion, index) => (
                          <li key={index} className="flex items-start bg-white rounded-lg p-3 shadow-sm">
                            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium mr-3 ${
                              showGlobalView ? 'bg-indigo-100 text-indigo-600' :
                              user?.role === 'WIS' ? 'bg-green-100 text-green-600' :
                              user?.role === 'QC' ? 'bg-blue-100 text-blue-600' :
                              user?.role === 'PROJECT_MANAGER' ? 'bg-purple-100 text-purple-600' :
                              'bg-red-100 text-red-600'
                            }`}>
                              {index + 1}
                            </span>
                            <p className="text-gray-700">{suggestion}</p>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Status Distribution */}
                    {currentSuggestions.summary.total > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-lg shadow p-6">
                          <h4 className="text-lg font-semibold mb-4">Defects by Status</h4>
                          <div className="space-y-3">
                            {Object.entries(currentSuggestions.summary.byStatus || {}).map(([status, count]) => {
                              const total = currentSuggestions.summary.total || 1;
                              const percentage = Math.round(((count as number) / total) * 100);
                              const statusColors: Record<string, string> = {
                                'OPEN': 'bg-blue-500',
                                'IN_PROGRESS': 'bg-yellow-500',
                                'FIXED': 'bg-green-500',
                                'RESOLVED': 'bg-teal-500',
                                'CLOSED': 'bg-gray-500',
                                'REOPENED': 'bg-orange-500',
                                'DEFERRED': 'bg-purple-500',
                              };
                              return (
                                <div key={status}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm text-gray-600">{status.replace(/_/g, ' ')}</span>
                                    <span className="text-sm font-medium">{count as number} ({percentage}%)</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className={`${statusColors[status] || 'bg-gray-500'} h-2 rounded-full transition-all`} 
                                      style={{ width: `${percentage}%` }}
                                    ></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="bg-white rounded-lg shadow p-6">
                          <h4 className="text-lg font-semibold mb-4">Defects by Priority</h4>
                          <div className="space-y-3">
                            {Object.entries(currentSuggestions.summary.byPriority || {}).map(([priority, count]) => {
                              const total = currentSuggestions.summary.total || 1;
                              const percentage = Math.round(((count as number) / total) * 100);
                              const priorityColors: Record<string, string> = {
                                'Critical': 'bg-red-500',
                                'High': 'bg-orange-500',
                                'Medium': 'bg-yellow-500',
                                'Low': 'bg-green-500',
                              };
                              return (
                                <div key={priority}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm text-gray-600">{priority}</span>
                                    <span className="text-sm font-medium">{count as number} ({percentage}%)</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className={`${priorityColors[priority] || 'bg-gray-500'} h-2 rounded-full transition-all`} 
                                      style={{ width: `${percentage}%` }}
                                    ></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
