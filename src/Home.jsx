import React from "react";
import { useNavigate } from "react-router-dom";

function Home() {
  const navigate = useNavigate();

  return (
    <div
      className="flex items-center justify-center min-h-screen bg-cover bg-center"
      style={{ backgroundImage: "url('/backgroundimg.jpg')" }}
    >
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-4 sm:p-6 md:p-8 
                     mx-4 sm:mx-0 text-center transition-shadow duration-300 hover:shadow-3xl"
      >
        <img
          src="logo.png"
          alt="Einfratech logo"
          className="mb-4 mx-auto w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20 
                    transition-transform duration-300 hover:scale-110"
        />
        <h1 className="font-serif text-xl sm:text-2xl md:text-3xl font-bold 
                      text-red-600 hover:text-red-700 transition duration-300"
        >
          EINFTRATECH
        </h1>
        <h1 className="font-serif text-xl sm:text-2xl md:text-3xl font-bold 
                      text-blue-800 hover:text-blue-700 transition duration-300"
        >
          SYSTEMS
        </h1>
        <h2 className="font-serif text-lg sm:text-xl md:text-2xl font-semibold 
                      text-blue-600 hover:text-blue-700"
        >
          ChatBox
        </h2>
        <p className="text-gray-800 mb-4 text-sm sm:text-base md:text-lg 
                     hover:text-gray-800 font-sans"
        >
          The Most Trusted And Fast Chatbox Ever
        </p>
        <div className="flex flex-col sm:flex-row justify-around gap-3 sm:gap-0">
          <button
            className="py-2 px-4 rounded shadow-lg bg-gradient-to-r 
                      from-blue-500 to-purple-500 text-white 
                      hover:from-purple-500 hover:to-teal-300 
                      transition duration-300 hover:shadow-xl 
                      text-sm sm:text-base"
            onClick={() => navigate("/signup")}
          >
            Sign Up
          </button>
          
          <button 
            className="py-2 px-4 rounded shadow-lg bg-gradient-to-r 
                      from-blue-500 to-purple-500 text-white 
                      hover:from-purple-500 hover:to-teal-300 
                      transition duration-300 hover:shadow-xl 
                      text-sm sm:text-base"
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