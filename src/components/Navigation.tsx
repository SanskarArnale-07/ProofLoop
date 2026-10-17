'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileCheck2,
  Compass,
  History,
  PlusCircle,
} from 'lucide-react';

interface NavigationProps {
  currentAssessmentId?: string;
}

export function Navigation({ currentAssessmentId }: NavigationProps) {
  const pathname = usePathname();

  const navItems = [
    {
      name: 'Overview',
      href: currentAssessmentId ? `/dashboard?id=${currentAssessmentId}` : '/dashboard',
      icon: LayoutDashboard,
      active: pathname === '/dashboard'
    },
    {
      name: 'Assessments',
      href: currentAssessmentId ? `/dashboard/assessments?id=${currentAssessmentId}` : '/dashboard/assessments',
      icon: FileCheck2,
      active: pathname.startsWith('/dashboard/assessments')
    },
    {
      name: 'Gap Roadmap',
      href: currentAssessmentId ? `/dashboard/roadmap?id=${currentAssessmentId}` : '/dashboard/roadmap',
      icon: Compass,
      active: pathname.startsWith('/dashboard/roadmap')
    },
    {
      name: 'History & Audit',
      href: currentAssessmentId ? `/dashboard/history?id=${currentAssessmentId}` : '/dashboard/history',
      icon: History,
      active: pathname.startsWith('/dashboard/history')
    }
  ];

  return (
    <aside className="w-64 border-r border-[#584638] bg-[#211A16] flex flex-col justify-between shrink-0 min-h-screen">
      <div>
        {/* Brand Header */}
        <div className="p-6 border-b border-[#584638]">
          <Link href="/" className="group block">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-base font-bold tracking-tighter uppercase px-2 py-0.5 bg-[#DD5946] text-white">
                PL
              </span>
              <span className="font-editorial text-xl font-bold tracking-tight text-[#F5F0E5] group-hover:opacity-80 transition-opacity">
                ProofLoop
              </span>
            </div>
            <p className="text-[11px] font-mono text-[#BDB0A2] mt-1 uppercase tracking-wider">
              Evidence-Backed Coach
            </p>
          </Link>
        </div>

        {/* Quick Action */}
        <div className="p-4">
          <Link
            href="/onboard"
            className="flex items-center justify-center space-x-2 w-full py-2.5 px-3 bg-[#F5F0E5] hover:bg-[#e2dcc9] text-[#2B211B] text-xs font-mono font-bold rounded transition-colors shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>New Assessment</span>
          </Link>
        </div>

        {/* Navigation Items */}
        <nav className="px-3 py-2 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center space-x-3 px-3 py-2 text-xs font-mono rounded transition-colors ${
                  item.active
                    ? 'bg-[#30251F] text-[#F5F0E5] font-semibold border-l-2 border-[#DD5946]'
                    : 'text-[#BDB0A2] hover:text-[#F5F0E5] hover:bg-[#30251F]/50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
