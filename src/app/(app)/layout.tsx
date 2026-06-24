import { ReactNode } from 'react';
import LeftRail from '@/components/LeftRail';

/**
 * Shared layout for authenticated app pages — Workspace, Library,
 * Flashcards, Study Rooms, Friends, Community, Settings. Wraps every
 * page in the (app) route group with the global LeftRail. URLs are
 * unaffected by the route-group brackets — `/workspace` still resolves
 * to `src/app/(app)/workspace/page.tsx`.
 *
 * The rail collapses to width:0 when document.body has data-fullscreen,
 * which the workspace page toggles when entering immersive fullscreen
 * mode (PDF takes the whole viewport, rail hides).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <LeftRail />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}
