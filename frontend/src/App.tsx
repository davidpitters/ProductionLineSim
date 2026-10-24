import { useState } from 'react'
import { Overview } from './Overview'
import { Events } from './Events'
import { Performance } from './Performance'
import { Targets } from './Targets'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

// Helper functions
const localDateTime = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
const toUtc = (value: string) => new Date(value).toISOString()
const prettyTime = (value: string | null) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Ongoing'
const duration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${remainder}s`
  return `${remainder}s`
}


function App() {
  // Initialize state
  const [count, setCount] = useState(0)


  const [tabIndex, setTabIndex] = useState(0)
  return (
    <>
      <div className="app-container">
        {/* <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button> */}
        {/* Render tabs based on tabIndex */}
        <div className="sidebar">
          <button onClick={() => setTabIndex(0)}>Overview</button>
          <button onClick={() => setTabIndex(1)}>Events</button>
          <button onClick={() => setTabIndex(2)}>Performance</button>
          <button onClick={() => setTabIndex(3)}>Targets</button>
        </div>
        <div className="main-content">
          {tabIndex === 0 && <Overview />}
          {tabIndex === 1 && <Events />}
          {tabIndex === 2 && <Performance />}
          {tabIndex === 3 && <Targets />}
        </div>
      </div>
    </>
  )
}

export default App
