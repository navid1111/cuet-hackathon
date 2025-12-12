import './App.css'
import { HealthCard } from './components/HealthCard'
import { JobsListEnhanced } from './components/JobsList'

// Sentry test button
function ErrorButton() {
  return (
    <button
      onClick={() => {
        throw new Error('This is your first error!');
      }}
      style={{
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        border: '2px solid #ef4444',
        backgroundColor: '#7f1d1d',
        color: '#fecaca',
        transition: 'all 0.2s',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.backgroundColor = '#991b1b';
        e.currentTarget.style.color = '#fee2e2';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.backgroundColor = '#7f1d1d';
        e.currentTarget.style.color = '#fecaca';
      }}
      title="Click to trigger a test error for Sentry"
    >
      🚨 Break the world
    </button>
  );
}

function App() {
  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#111827',
      padding: '40px 20px'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <h1 style={{ 
            color: '#f9fafb', 
            fontSize: '32px',
            margin: 0
          }}>
            CUET Micro-Ops Hackathon 2025
          </h1>
          <ErrorButton />
        </div>
        <HealthCard />
        <JobsListEnhanced />
      </div>
    </div>
  )
}

export default App
