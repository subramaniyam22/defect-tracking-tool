'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import apiClient from '../../lib/api';
import { authService } from '../../lib/auth';
import Navbar from '../../components/Navbar';

interface UploadResult {
  version: number;
  counts: Record<string, { created: number; updated: number }>;
  totalCreated: number;
  totalUpdated: number;
}

interface User {
  id: string;
  username: string;
  role: string;
}

export default function UploadQCPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authService.getMe();
        setUser(userData);
      } catch (err: any) {
        if (err.response?.status === 401) {
          router.push('/login');
        }
      }
    };
    fetchUser();
  }, [router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (!selectedFile.name.endsWith('.xlsx')) {
        setError('Please select an Excel (.xlsx) file');
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

      const response = await apiClient.post('/qc-parameters/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload file');
      if (err.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <h1 className="text-2xl font-bold mb-6">Upload QC Parameters</h1>

            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">
                  File Requirements
                </h3>
                <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                  <li>File must be an Excel (.xlsx) format</li>
                  <li>Must contain 3 sheets: Staging, Pre-Live, Post-Live</li>
                  <li>Each sheet must have these columns: parameter_key, parameter_label, data_type, enum_values, required, default_value</li>
                  <li>data_type must be one of: string, number, boolean, enum, date</li>
                  <li>required must be a boolean value (true/false, yes/no, 1/0)</li>
                  <li>enum_values is required when data_type is enum</li>
                </ul>
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Excel File
                </label>
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {file && (
                  <p className="mt-2 text-sm text-gray-600">
                    Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              {/* Upload Button */}
              <div>
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  {uploading ? 'Uploading...' : 'Upload QC Parameters'}
                </button>
              </div>

              {/* Results */}
              {result && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-green-900 mb-3">
                    Upload Successful!
                  </h3>
                  <div className="space-y-2 text-sm">
                    <p className="text-green-800">
                      <span className="font-medium">Version:</span> {result.version}
                    </p>
                    <p className="text-green-800">
                      <span className="font-medium">Total Created:</span>{' '}
                      {result.totalCreated}
                    </p>
                    <p className="text-green-800">
                      <span className="font-medium">Total Updated:</span>{' '}
                      {result.totalUpdated}
                    </p>
                    <div className="mt-3">
                      <p className="font-medium text-green-900 mb-2">By Sheet:</p>
                      <ul className="space-y-1">
                        {Object.entries(result.counts).map(([sheet, counts]) => (
                          <li key={sheet} className="text-green-800">
                            <span className="font-medium">{sheet}:</span> Created:{' '}
                            {counts.created}, Updated: {counts.updated}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

