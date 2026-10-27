import { useState } from 'react'
import { Overview } from './Overview'
import { Ingestion } from './Ingestion'
import { Performance } from './Performance'
import { Targets } from './Targets'
import { Logs } from './Logs'
import './App.css'

/** Renders the dashboard shell and the page selected in the sidebar. */
function App() {
  const [tabIndex, setTabIndex] = useState(0)
  return (
    <div className="app-container">
      <nav className="sidebar" aria-label="Main navigation">
        <div className="sidebar-nav">
          <button className={tabIndex === 0 ? 'is-selected' : ''} aria-current={tabIndex === 0 ? 'page' : undefined} onClick={() => setTabIndex(0)}><span aria-hidden="true">▥</span>Lines</button>
          <button className={tabIndex === 1 ? 'is-selected' : ''} aria-current={tabIndex === 1 ? 'page' : undefined} onClick={() => setTabIndex(1)}><span aria-hidden="true">⇧</span>Ingestion</button>
          <button className={tabIndex === 2 ? 'is-selected' : ''} aria-current={tabIndex === 2 ? 'page' : undefined} onClick={() => setTabIndex(2)}><span aria-hidden="true">▤</span>Logs</button>
          <button className={tabIndex === 3 ? 'is-selected' : ''} aria-current={tabIndex === 3 ? 'page' : undefined} onClick={() => setTabIndex(3)}><span aria-hidden="true">◷</span>Performance</button>
          <button className={tabIndex === 4 ? 'is-selected' : ''} aria-current={tabIndex === 4 ? 'page' : undefined} onClick={() => setTabIndex(4)}><span aria-hidden="true">◎</span>Targets</button>
        </div>
        <div className="sidebar-footer"><span className="sidebar-online-dot" />API connected</div>
      </nav>
      <main className="main-content">
        {tabIndex === 0 && <Overview />}
        {/* Keep ingestion mounted while hidden so an active demo stream retains its state. */}
        <div hidden={tabIndex !== 1}>
          <Ingestion />
        </div>
        {tabIndex === 2 && <Logs />}
        {tabIndex === 3 && <Performance />}
        {tabIndex === 4 && <Targets />}
      </main>
    </div>
  )
}

export default App
