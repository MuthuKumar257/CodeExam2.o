import React from 'react';

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends React.Component<Props, State> {
  declare props: Props;
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[UI Error Boundary]', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <section className="max-w-md rounded-xl border border-slate-700 bg-slate-900 p-8 text-center shadow-xl">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-3 text-sm text-slate-400">The page could not be displayed. Reload to try again.</p>
          <button
            type="button"
            className="mt-6 rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-950"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </section>
      </main>
    );
  }
}
