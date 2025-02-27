import { useState } from 'react'
import './App.css'
import Navbar from './Component/Navbar'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div className="App">
      <Navbar />
      <main className="p-4">
        <h1 className="text-3xl font-bold underline">
          Welcome to ChatBox!
        </h1>
      </main>
    </div>
    </>
  )
}

export default App
