import { useState, useEffect } from 'react';
import axios from 'axios';
import type { LtiContext } from '../App';
import BrowniePointsDashboard from './BrowniePointsDashboard';
import StudentBPDashboard from './StudentBPDashboard';
import ActivityCreator from '../ActivityCreator';
import ActivitiesList from './ActivitiesList';
import InstructorActivitiesManager from './InstructorActivitiesManager';
import ActivityDetail from './ActivityDetail';
import type { ActivityRecord } from './ActivitiesTypes';
import '../index.css';

interface Props {
  context: LtiContext;
}

type Section = 'bp' | 'add_activity' | 'activities';

export default function Dashboard({ context }: Props) {
  const isInstructor = context.role === 'Instructor';

  // Instructors default to Brownie Points management; students default to Activities list
  const defaultSection: Section = isInstructor ? 'bp' : 'activities';
  const [activeSection, setActiveSection] = useState<Section>(defaultSection);
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecord | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false); // for mobile
  const [courseName, setCourseName] = useState(context.courseName || '');

  useEffect(() => {
    if (!courseName && context.courseId) {
      axios.get(`/api/lti/courseName/${context.courseId}`).then(res => {
        if (res.data.success && res.data.courseName) setCourseName(res.data.courseName);
      }).catch(console.error);
    }
  }, [courseName, context.courseId]);

  const handleOpenActivity = (activity: ActivityRecord) => {
    setSelectedActivity(activity);
  };

  const handleCloseActivity = () => {
    setSelectedActivity(null);
  };

  const handleNavClick = (section: Section) => {
    setActiveSection(section);
    setSelectedActivity(null);
    setSidebarOpen(false);
  };

  const navItems: { id: Section; label: string; icon: JSX.Element; teacherOnly?: boolean }[] = [
    {
      id: 'bp',
      label: isInstructor ? 'Manage BP' : 'My BP',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" />
          <path d="M12 8v4l3 3" />
        </svg>
      ),
    },
    {
      id: 'add_activity',
      label: 'Add Activity',
      teacherOnly: true,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      ),
    },
    {
      id: 'activities',
      label: 'Activities',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
    },
  ];

  const visibleNavItems = navItems.filter(item => !item.teacherOnly || isInstructor);

  const renderContent = () => {
    // If an activity is selected from the list, show ActivityDetail
    if (selectedActivity && activeSection === 'activities') {
      // Inject the activityId into context so ActivityDetail can load it
      const detailContext: LtiContext = {
        ...context,
        activityId: selectedActivity.activity_id,
        activityTitle: selectedActivity.title,
      };
      return (
        <div className="dashboard-content-area">
          <button className="back-to-activities-btn" onClick={handleCloseActivity}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Activities
          </button>
          <ActivityDetail context={detailContext} />
        </div>
      );
    }

    switch (activeSection) {
      case 'bp':
        return isInstructor
          ? <BrowniePointsDashboard context={context} />
          : <StudentBPDashboard context={context} />;
      case 'add_activity':
        if (!isInstructor) return null;
        return (
          <div className="dashboard-content-area">
            <div className="dashboard-page-header">
              <h1>Add Activity</h1>
              <p>Create a new activity and link it to this course in Vibe.</p>
            </div>
            <ActivityCreator
              context={{ ...context, isDeepLinking: false }}
              onSuccess={() => {
                setActiveSection('activities');
              }}
              onError={() => {}}
            />
          </div>
        );
      case 'activities':
        // Instructors see the full management view (edit/delete/create)
        // Students see the submission/detail view
        if (isInstructor) {
          return (
            <div className="dashboard-content-area">
              <InstructorActivitiesManager
                context={context}
                onAddActivity={() => handleNavClick('add_activity')}
              />
            </div>
          );
        }
        return (
          <div className="dashboard-content-area">
            <ActivitiesList context={context} onOpenActivity={handleOpenActivity} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="dashboard-shell">
      {/* Mobile header bar */}
      <div className="dashboard-mobile-header">
        <button
          className="dashboard-hamburger"
          onClick={() => setSidebarOpen(o => !o)}
          aria-label="Toggle navigation"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="dashboard-mobile-title">
          <span className="lti-badge">LTI</span>
          <span>Dashboard</span>
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="dashboard-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`dashboard-sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">LTI Dashboard</span>
          </div>
        </div>

        <div className="sidebar-role-pill">
          <span className={`role-badge ${isInstructor ? 'role-instructor' : 'role-student'}`}>
            {isInstructor ? 'Instructor' : 'Student'}
          </span>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          <div className="sidebar-nav-label">Navigation</div>
          {visibleNavItems.map(item => (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              className={`sidebar-nav-item ${activeSection === item.id ? 'active' : ''}`}
              onClick={() => handleNavClick(item.id)}
              aria-current={activeSection === item.id ? 'page' : undefined}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              <span className="sidebar-nav-label-text">{item.label}</span>
              {activeSection === item.id && <span className="sidebar-nav-indicator" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-course-info">
            <span className="sidebar-course-label">Course</span>
            <span className="sidebar-course-name" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '4px' }}>
              {courseName || 'Course Dashboard'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="dashboard-main">
        {renderContent()}
      </main>
    </div>
  );
}
