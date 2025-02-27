import { useState } from 'react'
import './App.css'
import Navbar from './Component/Navbar'
import LandingPage from './LandingPage'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div className="App">
      <Navbar />
    
    <LandingPage />
    </div>
    </>
  )
}

export default App
