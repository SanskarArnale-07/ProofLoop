'use client';

import { GitCommit, Sparkles, RefreshCw, FileCheck2, Clock } from 'lucide-react';
import { ActivityEvent } from '@/lib/types';

interface ActivityFeedProps {
  activities: ActivityEvent[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  if (!activities || activities.length === 0) {
    return (
      <div className="p-6 border border-zinc-200 dark:border-zinc-800 rounded text-center text-xs font-mono text-zinc-500">
        No recorded repository activity yet.
      </div>
    );
  }

  const getIcon = (type: ActivityEvent['eventType']) => {
    switch (type) {
      case 'skill_promoted':
        return <Sparkles className="w-3.5 h-3.5 text-black dark:text-white" />;
      case 'reassessment_completed':
        return <RefreshCw className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />;
      case 'assessment_created':
        return <FileCheck2 className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />;
      default:
        return <GitCommit className="w-3.5 h-3.5 text-zinc-500" />;
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-3 font-mono">
      {activities.map((act) => {
        const isPromoted = act.eventType === 'skill_promoted';

        return (
          <div
            key={act.id}
            className={`p-4 border rounded transition-colors text-xs ${
              isPromoted
                ? 'border-zinc-400 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900/90'
                : 'border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1">
              <div className="flex items-center space-x-2">
                <span className="p-1 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  {getIcon(act.eventType)}
                </span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                  {act.title}
                </span>
              </div>
              <span className="flex items-center space-x-1 text-zinc-400">
                <Clock className="w-3 h-3" />
                <span>{formatDate(act.timestamp)}</span>
              </span>
            </div>

            <p className="text-zinc-700 dark:text-zinc-300 font-sans text-xs mt-1 leading-relaxed">
              {act.description}
            </p>

            {act.commitSha && (
              <div className="mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-900 flex items-center justify-between text-[11px] text-zinc-500">
                <div className="flex items-center space-x-1.5 truncate max-w-[80%]">
                  <GitCommit className="w-3 h-3 text-zinc-400 shrink-0" />
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">{act.commitSha}</span>
                  {act.commitMessage && (
                    <span className="text-zinc-400 truncate">— {act.commitMessage}</span>
                  )}
                </div>
                {act.affectedSkills && act.affectedSkills.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[10px] uppercase font-bold text-zinc-600 dark:text-zinc-300">
                    {act.affectedSkills.length} skill{act.affectedSkills.length > 1 ? 's' : ''} affected
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
