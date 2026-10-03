import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  GraduationCap,
  FileCode2,
  HelpCircle,
  Video,
  FileCheck2,
  AlertTriangle,
  BarChart3,
  ShieldAlert,
  Settings,
  PlusCircle,
  Lock,
  History,
  ShieldCheck,
} from 'lucide-react';
import { UserRole } from '../../types';

interface SidebarProps {
  role: UserRole;
  activeNav: string;
  onSelectNav: (nav: string) => void;
  liveFlaggedCount?: number;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  count?: number;
  highlight?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  role,
  activeNav,
  onSelectNav,
  liveFlaggedCount = 0,
}) => {
  const getNavItems = (): NavItem[] => {
    if (role === 'ADMIN') {
      return [
        { id: 'admin_dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'admin_faculty', label: 'Manage Faculty', icon: Users },
        { id: 'admin_audit_logs', label: 'Faculty Audit Logs', icon: ShieldCheck },
        { id: 'admin_students', label: 'Manage Students', icon: GraduationCap },
        { id: 'admin_classes', label: 'Manage Classes', icon: Building2 },
        { id: 'admin_history', label: 'History', icon: History },
        { id: 'admin_settings', label: 'System Settings', icon: Settings },
      ];
    } else if (role === 'FACULTY') {
      return [
        { id: 'faculty_dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'faculty_assessments', label: 'Assessments', icon: FileCheck2 },
        { id: 'faculty_questions', label: 'Question Bank', icon: HelpCircle },
        { id: 'faculty_candidates', label: 'Students', icon: GraduationCap },
        { id: 'faculty_live', label: 'Live Monitoring', icon: Video },
        { id: 'faculty_history', label: 'History', icon: History },
        { id: 'faculty_reports', label: 'Reports', icon: BarChart3 },
        { id: 'faculty_settings', label: 'Settings', icon: Settings },
      ];
    } else {
      // CANDIDATE
      return [
        { id: 'candidate_dashboard', label: 'My Assessments', icon: LayoutDashboard },
        { id: 'candidate_settings', label: 'Settings', icon: Settings },
      ];
    }
  };

  const navItems = getNavItems();

  return (
    <aside className="w-60 bg-[#0c0c0e] border-r-2 border-white/10 flex flex-col justify-between shrink-0 p-5 min-h-[calc(100vh-4rem)]">
      <div className="space-y-6">
        <div>
          <span className="label-mono mb-3 block text-[10px]">Navigation</span>
          {/* Navigation list */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onSelectNav(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-md text-[13px] font-medium transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/20'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className="text-[10px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                      {item.badge}
                    </span>
                  )}

                  {item.count !== undefined && item.count > 0 && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold px-2 py-0.5 rounded-full font-mono">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="pt-6 border-t border-white/10 mt-auto">
        <div className="label-mono mb-1 text-[10px]">Institution</div>
        <div className="text-xs font-semibold text-zinc-300">Dr.N.G.P Institue of Technology</div>
      </div>
    </aside>
  );
};
