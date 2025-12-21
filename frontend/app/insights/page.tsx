'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import apiClient from '../../lib/api';
import { authService } from '../../lib/auth';
import Navbar from '../../components/Navbar';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface MLInsight {
  id: string;
  scope: string;
  userId?: string;
  teamId?: string;
  reopenRate: number;
  meanTimeToFix: number;
  distributions: {
    status: Record<string, number>;
    priority: Record<string, number>;
    project: Record<string, number>;
  };
  clustering: {
    clusters: Array<{
      cluster_id: number;
      size: number;
      top_terms: string[];
      defect_ids: string[];
    }>;
    silhouette_score: number;
    n_clusters: number;
  };
  generatedAt: string;
}

interface User {
  id: string;
  username: string;
  fullName?: string;
  role: string;
}

export default function InsightsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [globalInsights, setGlobalInsights] = useState<MLInsight | null>(null);
  const [userInsights, setUserInsights] = useState<MLInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'global' | 'user'>('global');

  const fetchInsights = async (userData: User) => {
    const [globalRes, userRes] = await Promise.all([
      apiClient.get('/ml/insights', { params: { scope: 'global' } }),
      apiClient.get('/ml/insights', { params: { scope: 'user', userId: userData.id } }),
    ]);

    setGlobalInsights(globalRes.data);
    setUserInsights(userRes.data);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userData = await authService.getMe();
        setUser(userData);
        await fetchInsights(userData);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load insights');
        if (err.response?.status === 401) {
          router.push('/login');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const handleGenerateInsights = async () => {
    if (!user) return;
    
    setGenerating(true);
    setError('');
    setSuccess('');

    try {
      // Generate both global and user insights
      await Promise.all([
        apiClient.post('/ml/insights/generate', { scope: 'global' }),
        apiClient.post('/ml/insights/generate', { scope: 'user' }),
      ]);

      // Refresh the insights
      await fetchInsights(user);
      setSuccess('Insights generated successfully from your defect data!');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate insights');
    } finally {
      setGenerating(false);
    }
  };

  const getStatusChartOption = (distributions: MLInsight['distributions']) => {
    const data = Object.entries(distributions.status).map(([name, value]) => ({
      value,
      name: name.replace('_', ' '),
    }));

    return {
      title: {
        text: 'Status Distribution',
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
          data,
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

  const getPriorityChartOption = (distributions: MLInsight['distributions']) => {
    const priorityLabels: Record<string, string> = {
      '1': 'Critical',
      '2': 'High',
      '3': 'Medium',
      '4': 'Low',
    };

    const data = Object.entries(distributions.priority)
      .map(([key, value]) => ({
        value,
        name: priorityLabels[key] || key,
      }))
      .sort((a, b) => parseInt(a.name) - parseInt(b.name));

    return {
      title: {
        text: 'Priority Distribution',
        left: 'center',
      },
      tooltip: {
        trigger: 'item',
      },
      series: [
        {
          name: 'Defects',
          type: 'bar',
          data: data.map((d) => d.value),
        },
      ],
      xAxis: {
        type: 'category',
        data: data.map((d) => d.name),
      },
      yAxis: {
        type: 'value',
      },
    };
  };

  const getProjectChartOption = (distributions: MLInsight['distributions']) => {
    const data = Object.entries(distributions.project)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({
        value,
        name,
      }));

    return {
      title: {
        text: 'Top Projects by Defect Count',
        left: 'center',
      },
      tooltip: {
        trigger: 'item',
      },
      series: [
        {
          name: 'Defects',
          type: 'bar',
          data: data.map((d) => d.value),
        },
      ],
      xAxis: {
        type: 'category',
        data: data.map((d) => d.name),
        axisLabel: {
          rotate: 45,
        },
      },
      yAxis: {
        type: 'value',
      },
    };
  };

  const getClusteringChartOption = (clustering: MLInsight['clustering']) => {
    const data = clustering.clusters.map((cluster) => ({
      value: cluster.size,
      name: `Cluster ${cluster.cluster_id + 1}`,
      topTerms: cluster.top_terms.slice(0, 5).join(', '),
    }));

    return {
      title: {
        text: 'Defect Clusters',
        left: 'center',
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          return `${params.name}<br/>Size: ${params.value}<br/>Top Terms: ${params.data.topTerms}`;
        },
      },
      series: [
        {
          name: 'Clusters',
          type: 'pie',
          radius: '60%',
          data,
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const currentInsights = activeTab === 'global' ? globalInsights : userInsights;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">ML Insights</h1>
            <button
              onClick={handleGenerateInsights}
              disabled={generating}
              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md text-sm font-medium transition-colors"
            >
              {generating ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Generate Insights
                </>
              )}
            </button>
          </div>

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-green-800 text-sm">{success}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('global')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'global'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Global Insights
                </button>
                <button
                  onClick={() => setActiveTab('user')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'user'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  My Insights
                </button>
              </nav>
            </div>
          </div>

          {!currentInsights ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="mb-4">
                <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-gray-500 mb-4">No insights available for {activeTab === 'global' ? 'global' : 'your'} scope</p>
              <p className="text-sm text-gray-400 mb-4">Click "Generate Insights" to analyze your defect data and create insights.</p>
              <button
                onClick={handleGenerateInsights}
                disabled={generating}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md text-sm font-medium"
              >
                {generating ? 'Generating...' : 'Generate Insights Now'}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Reopen Rate</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {currentInsights.reopenRate.toFixed(1)}%
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

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Mean Time to Fix</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {currentInsights.meanTimeToFix.toFixed(1)}h
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
                      <p className="text-sm font-medium text-gray-600">Clustering Quality</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {(currentInsights.clustering.silhouette_score * 100).toFixed(1)}%
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
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <ReactECharts
                    option={getStatusChartOption(currentInsights.distributions)}
                    style={{ height: '400px' }}
                  />
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <ReactECharts
                    option={getPriorityChartOption(currentInsights.distributions)}
                    style={{ height: '400px' }}
                  />
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <ReactECharts
                    option={getProjectChartOption(currentInsights.distributions)}
                    style={{ height: '400px' }}
                  />
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <ReactECharts
                    option={getClusteringChartOption(currentInsights.clustering)}
                    style={{ height: '400px' }}
                  />
                </div>
              </div>

              {/* Clustering Details */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4">Defect Clusters</h2>
                <div className="space-y-4">
                  {currentInsights.clustering.clusters.map((cluster) => (
                    <div key={cluster.cluster_id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium text-gray-900">
                          Cluster {cluster.cluster_id + 1}
                        </h3>
                        <span className="text-sm text-gray-500">{cluster.size} defects</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <p className="font-medium mb-1">Top Terms:</p>
                        <div className="flex flex-wrap gap-2">
                          {cluster.top_terms.map((term, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                            >
                              {term}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Metadata */}
              <div className="bg-white rounded-lg shadow p-6">
                <p className="text-sm text-gray-500">
                  Generated at: {new Date(currentInsights.generatedAt).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

