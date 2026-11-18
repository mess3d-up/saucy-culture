import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090b0a] text-[#f4efe6] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#121b16] border border-[#24332a] p-8 rounded-lg space-y-4">
            <h1 className="font-display text-3xl uppercase text-[#e0531f]">Court Interruption</h1>
            <p className="text-sm text-[#9eb0a5] leading-relaxed">
              Something interrupted this session. Refresh to get back on the court.
            </p>
            {this.state.message && (
              <pre className="text-xs bg-black/50 border border-[#24332a] p-3 rounded overflow-x-auto text-[#f4efe6]/80">
                {this.state.message}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-[#e0531f] hover:bg-[#c84617] text-white text-sm font-semibold rounded transition-colors"
            >
              Reload Storefront
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
