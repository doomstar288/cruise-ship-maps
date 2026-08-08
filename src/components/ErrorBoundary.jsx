import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Deck Map Platform Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          width: '100vw',
          backgroundColor: '#050914',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          fontFamily: 'Inter, sans-serif'
        }}>
          <div style={{
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid #00d9f5',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '560px',
            textAlign: 'center',
            boxShadow: '0 0 30px rgba(0, 217, 245, 0.2)'
          }}>
            <h2 style={{ color: '#00d9f5', marginBottom: '12px', fontSize: '1.4rem' }}>
              ⚡ Cruise Ship Deck Map Platform
            </h2>
            <p style={{ color: '#cbd5e1', fontSize: '0.92rem', marginBottom: '20px', lineHeight: 1.6 }}>
              The interactive map viewer encountered a temporary rendering frame issue.
            </p>
            <pre style={{
              background: '#070d18',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '12px',
              borderRadius: '8px',
              color: '#ef4444',
              fontSize: '0.8rem',
              overflowX: 'auto',
              textAlign: 'left',
              marginBottom: '20px'
            }}>
              {this.state.error?.toString()}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              style={{
                background: 'linear-gradient(135deg, #e0aa3e 0%, #c48b20 100%)',
                color: '#050914',
                border: 'none',
                padding: '10px 24px',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Reload Deck Plan Viewer
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
