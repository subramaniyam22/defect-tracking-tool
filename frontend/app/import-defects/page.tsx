'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '../../lib/api';
import { authService } from '../../lib/auth';
import Navbar from '../../components/Navbar';

interface User {
  id: string;
  username: string;
  role: string;
}

interface PatternSummary {
  name: string;
  count: number;
  category: string;
}

interface ImportResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  warnings: string[];
  patternSummary: {
    newPatterns: number;
    updatedPatterns: number;
    topPatterns: PatternSummary[];
  };
  sourceBreakdown: Record<string, number>;
}

interface SampleDefect {
  text: string;
  pmc: string;
  source: string;
}

interface TrainingStats {
  totalRecords: number;
  bySource: Record<string, number>;
  topCategories: Array<{ category: string; count: number }>;
  patterns: Array<{
    id: string;
    name: string;
    occurrences: number;
    sourceTypes: string[];
    rootCauses: string[];
    preventionTips: string[];
    resolutionSteps: string[];
    sampleDefects: SampleDefect[];
  }>;
}

const SOURCE_TYPES = [
  { value: 'AUTO_DETECT', label: '🔍 Auto-Detect (Recommended)', description: 'Automatically detects format from sheet names and headers' },
  { value: 'WIS_QC', label: '📋 WIS QC Feedback', description: 'Quality control feedback from WIS team' },
  { value: 'PM_FEEDBACK', label: '📝 PM Feedback', description: 'Project manager feedback and notes' },
  { value: 'STAGING', label: '🔬 Staging/Internal Reviews', description: 'Internal QC and staging review data' },
];

export default function ImportDefectsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState('AUTO_DETECT');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'upload' | 'patterns' | 'insights'>('upload');
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userData = await authService.getMe();
        setUser(userData);
        
        // Fetch existing stats
        await fetchStats();
        await fetchSuggestions();
      } catch (err: any) {
        if (err.response?.status === 401) {
          router.push('/login');
        }
      }
    };
    fetchData();
  }, [router]);

  const fetchStats = async () => {
    try {
      const response = await apiClient.get('/defect-import/stats');
      setStats(response.data);
    } catch (err) {
      // Stats may not exist yet
      console.log('No training data stats available yet');
    }
  };

  const fetchSuggestions = async () => {
    try {
      const response = await apiClient.get('/defect-import/suggestions');
      setSuggestions(response.data);
    } catch (err) {
      console.log('No pattern suggestions available yet');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (!selectedFile.name.match(/\.(xlsx|xls)$/)) {
        setError('Please select an Excel (.xlsx or .xls) file');
        return;
      }
      setFile(selectedFile);
      setError('');
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setUploading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sourceType', sourceType);

      const response = await apiClient.post('/defect-import/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult(response.data);
      await fetchStats();
      await fetchSuggestions();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to import file');
      if (err.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyzePatterns = async () => {
    try {
      await apiClient.post('/defect-import/analyze');
      await fetchStats();
      await fetchSuggestions();
    } catch (err) {
      console.error('Failed to analyze patterns');
    }
  };

  const handleClearData = async () => {
    if (!confirm('Are you sure you want to clear all training data and patterns? This cannot be undone.')) {
      return;
    }
    try {
      await apiClient.post('/defect-import/clear');
      setStats(null);
      setSuggestions([]);
      setResult(null);
      setError('');
      await fetchStats();
    } catch (err) {
      console.error('Failed to clear data');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            🧠 AI Training Data Import
          </h1>
          <p className="text-slate-400">
            Import historical defect data to train the AI/ML system for better pattern recognition and suggestions
          </p>
        </div>

        {/* Stats Overview */}
        {stats && stats.totalRecords > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 shadow-lg">
              <div className="text-blue-100 text-sm font-medium">Total Records</div>
              <div className="text-3xl font-bold text-white">{stats.totalRecords.toLocaleString()}</div>
            </div>
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl p-4 shadow-lg">
              <div className="text-emerald-100 text-sm font-medium">Patterns Identified</div>
              <div className="text-3xl font-bold text-white">{stats.patterns.length}</div>
            </div>
            <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-4 shadow-lg">
              <div className="text-purple-100 text-sm font-medium">Top Category</div>
              <div className="text-xl font-bold text-white truncate">
                {stats.topCategories[0]?.category || 'N/A'}
              </div>
            </div>
            <div className="bg-gradient-to-br from-amber-600 to-amber-700 rounded-xl p-4 shadow-lg">
              <div className="text-amber-100 text-sm font-medium">Data Sources</div>
              <div className="text-3xl font-bold text-white">{Object.keys(stats.bySource).length}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex space-x-1 mb-6 bg-slate-800/50 p-1 rounded-lg w-fit">
          {[
            { id: 'upload', label: '📤 Upload Data', icon: '📤' },
            { id: 'patterns', label: '🔍 Patterns', icon: '🔍' },
            { id: 'insights', label: '💡 AI Insights', icon: '💡' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Section */}
            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4">Upload Defect Data</h2>

              {/* Format Guide */}
              <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">
                  📋 Supported Formats
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start space-x-2">
                    <span className="text-emerald-400">✓</span>
                    <div>
                      <span className="text-white font-medium">WIS QC Feedback:</span>
                      <span className="text-slate-400 ml-1">Date, Team Members, Build, Location, Feedback, Category</span>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="text-emerald-400">✓</span>
                    <div>
                      <span className="text-white font-medium">PM Feedback:</span>
                      <span className="text-slate-400 ml-1">Date, PM Name, PMC, Location, Notes, Management Category</span>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="text-emerald-400">✓</span>
                    <div>
                      <span className="text-white font-medium">Staging:</span>
                      <span className="text-slate-400 ml-1">Test Date, Build Phase, Review Stage, Description, Status</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Source Type Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Data Source Type
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {SOURCE_TYPES.map((type) => (
                    <label
                      key={type.value}
                      className={`flex items-start p-3 rounded-lg border cursor-pointer transition-all ${
                        sourceType === type.value
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="sourceType"
                        value={type.value}
                        checked={sourceType === type.value}
                        onChange={(e) => setSourceType(e.target.value)}
                        className="mt-1 mr-3"
                      />
                      <div>
                        <div className="text-white font-medium">{type.label}</div>
                        <div className="text-slate-400 text-sm">{type.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* File Upload */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Select Excel File
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer"
                  />
                </div>
                {file && (
                  <p className="mt-2 text-sm text-slate-400">
                    Selected: <span className="text-white">{file.name}</span> ({(file.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-6">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Upload Button */}
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-slate-600 disabled:to-slate-700 text-white px-6 py-3 rounded-lg text-sm font-semibold transition-all shadow-lg disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Importing & Analyzing...
                  </span>
                ) : (
                  '🚀 Import & Train AI'
                )}
              </button>
            </div>

            {/* Results Section */}
            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4">Import Results</h2>

              {result ? (
                <div className="space-y-4">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-white">{result.totalProcessed}</div>
                      <div className="text-xs text-slate-400">Total Processed</div>
                    </div>
                    <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-400">{result.successful}</div>
                      <div className="text-xs text-slate-400">Successful</div>
                    </div>
                    <div className="bg-red-500/10 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-red-400">{result.failed}</div>
                      <div className="text-xs text-slate-400">Failed</div>
                    </div>
                  </div>

                  {/* Source Breakdown */}
                  {Object.keys(result.sourceBreakdown).length > 0 && (
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-slate-300 mb-2">By Source</h3>
                      <div className="space-y-2">
                        {Object.entries(result.sourceBreakdown).map(([source, count]) => (
                          <div key={source} className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">{source.replace('_', ' ')}</span>
                            <span className="text-white font-medium">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top Patterns */}
                  {result.patternSummary.topPatterns.length > 0 && (
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-slate-300 mb-2">Top Patterns Detected</h3>
                      <div className="space-y-2">
                        {result.patternSummary.topPatterns.map((pattern, idx) => (
                          <div key={idx} className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">{pattern.name}</span>
                            <span className="text-blue-400 font-medium">{pattern.count} occurrences</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warnings */}
                  {result.warnings.length > 0 && (
                    <div className="bg-amber-500/10 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-amber-400 mb-2">⚠️ Warnings</h3>
                      <ul className="space-y-1 text-sm text-amber-300/80">
                        {result.warnings.slice(0, 5).map((warning, idx) => (
                          <li key={idx}>• {warning}</li>
                        ))}
                        {result.warnings.length > 5 && (
                          <li className="text-slate-500">... and {result.warnings.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                  <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-center">Upload a file to see import results</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Patterns Tab */}
        {activeTab === 'patterns' && (
          <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white">Identified Patterns</h2>
              <div className="flex space-x-3">
                <button
                  onClick={handleClearData}
                  className="bg-red-600/20 hover:bg-red-600/40 text-red-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-red-500/30"
                >
                  🗑️ Clear All Data
                </button>
                <button
                  onClick={handleAnalyzePatterns}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  🔄 Re-analyze Patterns
                </button>
              </div>
            </div>

            {stats && stats.patterns.length > 0 ? (
              <div className="space-y-4">
                {stats.patterns.map((pattern) => (
                  <div
                    key={pattern.id}
                    className="bg-slate-700/50 rounded-lg p-5 border border-slate-600 hover:border-purple-500/50 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-white font-semibold text-lg">{pattern.name}</h3>
                        {pattern.sourceTypes && pattern.sourceTypes.length > 0 && (
                          <div className="flex gap-2 mt-1">
                            {pattern.sourceTypes.map((src, idx) => (
                              <span key={idx} className="text-xs bg-slate-600 text-slate-300 px-2 py-0.5 rounded">
                                {src.replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full text-sm font-medium">
                        {pattern.occurrences} occurrences
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Root Causes */}
                      {pattern.rootCauses.length > 0 && (
                        <div className="bg-red-500/5 rounded-lg p-3 border border-red-500/20">
                          <div className="text-xs font-semibold text-red-400 mb-2 uppercase tracking-wide">🔍 Root Causes</div>
                          <ul className="space-y-2">
                            {pattern.rootCauses.map((cause, idx) => (
                              <li key={idx} className="text-sm text-slate-300 flex items-start">
                                <span className="text-red-400 mr-2 mt-0.5">•</span>
                                <span>{cause}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Prevention Tips */}
                      {pattern.preventionTips.length > 0 && (
                        <div className="bg-emerald-500/5 rounded-lg p-3 border border-emerald-500/20">
                          <div className="text-xs font-semibold text-emerald-400 mb-2 uppercase tracking-wide">✅ Prevention Tips</div>
                          <ul className="space-y-2">
                            {pattern.preventionTips.map((tip, idx) => (
                              <li key={idx} className="text-sm text-slate-300 flex items-start">
                                <span className="text-emerald-400 mr-2 mt-0.5">✓</span>
                                <span>{tip}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Resolution Steps */}
                    {pattern.resolutionSteps && pattern.resolutionSteps.length > 0 && (
                      <div className="mt-4 bg-blue-500/5 rounded-lg p-3 border border-blue-500/20">
                        <div className="text-xs font-semibold text-blue-400 mb-2 uppercase tracking-wide">🔧 Resolution Steps</div>
                        <ol className="space-y-1">
                          {pattern.resolutionSteps.map((step, idx) => (
                            <li key={idx} className="text-sm text-slate-300 flex items-start">
                              <span className="text-blue-400 mr-2 font-medium">{idx + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Sample Defects */}
                    {pattern.sampleDefects && pattern.sampleDefects.length > 0 && (
                      <div className="mt-4">
                        <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">📋 Sample Defects</div>
                        <div className="space-y-2">
                          {pattern.sampleDefects.map((sample, idx) => (
                            <div key={idx} className="bg-slate-800/50 rounded p-2 text-sm">
                              <p className="text-slate-300 italic">"{sample.text}"</p>
                              <div className="flex gap-2 mt-1 text-xs text-slate-500">
                                {sample.pmc && <span>PMC: {sample.pmc}</span>}
                                <span>Source: {sample.source.replace('_', ' ')}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <p className="text-center">No patterns detected yet. Import some data to start analysis.</p>
              </div>
            )}
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && (
          <div className="space-y-6">
            {/* AI Suggestions */}
            <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4">💡 AI-Powered Suggestions</h2>
              
              {suggestions.length > 0 ? (
                <div className="space-y-3">
                  {suggestions.map((suggestion, idx) => (
                    <div
                      key={idx}
                      className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg p-4"
                    >
                      <p className="text-slate-200">{suggestion}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-slate-500 text-center py-8">
                  No AI suggestions available yet. Import more data to generate insights.
                </div>
              )}
            </div>

            {/* Category Distribution */}
            {stats && stats.topCategories.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
                <h2 className="text-xl font-semibold text-white mb-4">📊 Top Defect Categories</h2>
                <div className="space-y-3">
                  {stats.topCategories.map((cat, idx) => {
                    const percentage = (cat.count / stats.totalRecords) * 100;
                    return (
                      <div key={idx}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-300">{cat.category}</span>
                          <span className="text-slate-400">{cat.count} ({percentage.toFixed(1)}%)</span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Source Distribution */}
            {stats && Object.keys(stats.bySource).length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
                <h2 className="text-xl font-semibold text-white mb-4">📁 Data by Source</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(stats.bySource).map(([source, count]) => (
                    <div key={source} className="bg-slate-700/50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-white">{count}</div>
                      <div className="text-sm text-slate-400">{source.replace('_', ' ')}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

