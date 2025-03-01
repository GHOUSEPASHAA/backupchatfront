import React from "react";
import { useNavigate } from "react-router-dom";

function Home() {
  const navigate = useNavigate(); // Initialize navigation

  return (
    <div
      className="flex items-center justify-center min-h-screen bg-cover bg-center"
      style={{ backgroundImage: "url('/backgroundimg.jpg')" }}
    >
      <div className="bg-white rounded-lg shadow-2xl w-80 sm:w-96 p-6 text-center transition-shadow duration-300 hover:shadow-3xl">
        <img
          src="logo.png"
          alt="Einfratech logo"
          className="mb-4 mx-auto w-18 h-18 transition-transform duration-300 hover:scale-110"
        />
        <h1 className=" font-serif text-2xl font-bold text-red-600 hover:text-red-700 transition duration-300">
          EINFTRATECH
        </h1>
        <h1 className=" font-serif text-2xl font-bold text-blue-800 hover:text-blue-700 transition duration-300">
          SYSTEMS
        </h1>
        <h2 className="font-serif text-xl font-semibold text-blue-600 hover:text-blue-700">
          ChatBox
        </h2>
        <p className="text-gray-800 mb-4 hover:text-gray-800 font-sans">
          The Most Trusted And Fast Chatbox Ever
        </p>
        <div className="flex justify-around">
          {/* Navigate to Sign Up Page */}
          <button
            className="py-2 px-4 rounded shadow-lg bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-purple-500 hover:to-teal-300 transition duration-300 hover:shadow-xl"
            onClick={() => navigate("/signup")}
          >
            Sign Up
          </button>
          
          {/* Navigate to Sign In Page */}
          <button 
            className="py-2 px-4 rounded shadow-lg bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-purple-500 hover:to-teal-300 transition duration-300 hover:shadow-xl"
            onClick={() => navigate("/signin")}
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
}

export default Home;

