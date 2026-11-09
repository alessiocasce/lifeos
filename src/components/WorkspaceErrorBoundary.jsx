import { Component } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { t } from '../i18n';

// Keep the shell and account navigation usable when a lazy workspace fails.
export class WorkspaceErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section role="alert" className="workspace-recovery">
      <h2>{t('This workspace could not be opened.')}</h2>
      <p>{t('Your saved records and local drafts have not been cleared. You can open another workspace or reload LifeOS.')}</p>
      <div><button type="button" className="button-secondary" onClick={this.props.onBack}><ArrowLeft size={18} />{t('Back to Command')}</button>
        <button type="button" className="button-secondary" onClick={() => window.location.reload()}><RefreshCw size={18} />{t('Reload LifeOS')}</button></div>
    </section>;
  }
}
