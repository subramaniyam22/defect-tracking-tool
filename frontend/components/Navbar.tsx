'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authService } from '../lib/auth';

interface NavbarProps {
  user: {
    username: string;
    fullName?: string;
    role: string;
  } | null;
}

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  PROJECT_MANAGER: 'Project Manager',
  QC: 'QC',
  WIS: 'WIS',
};

const roleColors: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-800 border-red-200',
  PROJECT_MANAGER: 'bg-purple-100 text-purple-800 border-purple-200',
  QC: 'bg-blue-100 text-blue-800 border-blue-200',
  WIS: 'bg-green-100 text-green-800 border-green-200',
};

export default function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();

  const handleLogout = () => {
    authService.logout();
  };

  // Check if current path matches or starts with the given path
  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === '/dashboard';
    }
    // For other routes, check if pathname starts with the path
    // This handles nested routes like /defects/[id]
    return pathname === path || pathname.startsWith(path + '/');
  };

  const linkClass = (path: string) => {
    const active = isActive(path);
    if (active) {
      return 'font-semibold text-white bg-blue-600 px-3 py-1.5 rounded-md shadow-sm';
    }
    return 'font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-md transition-all';
  };

  return (
    <nav className="bg-white shadow sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left side - Logo and Navigation Links */}
          <div className="flex items-center space-x-6">
            <Link href="/dashboard" className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors">
              Defect Tracking Tool
            </Link>
            
            <div className="hidden md:flex items-center space-x-4">
              <Link href="/dashboard" className={linkClass('/dashboard')}>
                Dashboard
              </Link>
              <Link href="/defects" className={linkClass('/defects')}>
                Defects
              </Link>
              <Link href="/my-work" className={linkClass('/my-work')}>
                My Work
              </Link>
              <Link href="/insights" className={linkClass('/insights')}>
                Insights
              </Link>
              <Link href="/upload-qc" className={linkClass('/upload-qc')}>
                Upload QC
              </Link>
              {(user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER') && (
                <Link href="/import-defects" className={linkClass('/import-defects')}>
                  🧠 AI Training
                </Link>
              )}
              {user?.role === 'ADMIN' && (
                <Link href="/admin" className={linkClass('/admin')}>
                  Admin
                </Link>
              )}
            </div>
          </div>

          {/* Right side - User Info, Role Badge, and Logout */}
          <div className="flex items-center space-x-4">
            {user && (
              <>
                {/* User greeting */}
                <div className="hidden sm:flex items-center space-x-3">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {user.fullName || user.username}
                    </p>
                    <p className="text-xs text-gray-500">
                      @{user.username}
                    </p>
                  </div>
                </div>

                {/* Role Badge - Always visible */}
                <span
                  className={`px-3 py-1 text-xs font-semibold rounded-full border ${
                    roleColors[user.role] || 'bg-gray-100 text-gray-800 border-gray-200'
                  }`}
                >
                  {roleLabels[user.role] || user.role}
                </span>

                {/* Logout Button - Always visible */}
                <button
                  onClick={handleLogout}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-gray-200 bg-gray-50">
        <div className="flex overflow-x-auto px-4 py-2 space-x-2">
          <Link href="/dashboard" className={`whitespace-nowrap text-sm ${linkClass('/dashboard')}`}>
            Dashboard
          </Link>
          <Link href="/defects" className={`whitespace-nowrap text-sm ${linkClass('/defects')}`}>
            Defects
          </Link>
          <Link href="/my-work" className={`whitespace-nowrap text-sm ${linkClass('/my-work')}`}>
            My Work
          </Link>
          <Link href="/insights" className={`whitespace-nowrap text-sm ${linkClass('/insights')}`}>
            Insights
          </Link>
          <Link href="/upload-qc" className={`whitespace-nowrap text-sm ${linkClass('/upload-qc')}`}>
            Upload QC
          </Link>
          {(user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER') && (
            <Link href="/import-defects" className={`whitespace-nowrap text-sm ${linkClass('/import-defects')}`}>
              🧠 AI Training
            </Link>
          )}
          {user?.role === 'ADMIN' && (
            <Link href="/admin" className={`whitespace-nowrap text-sm ${linkClass('/admin')}`}>
              Admin
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

