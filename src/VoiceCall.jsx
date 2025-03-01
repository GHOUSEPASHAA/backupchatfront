import React, { useState, useEffect } from "react";
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVolumeUp,
  FaVolumeMute,
  FaUserCircle,
} from "react-icons/fa";
import { MdCallEnd } from "react-icons/md";

const VoiceCall = ({ endCall, userName }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isCallActive, setIsCallActive] = useState(true);

  useEffect(() => {
    let timer;
    if (isCallActive) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isCallActive]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleEndCall = () => {
    setIsCallActive(false);
    setCallDuration(0);
    endCall(); // Notify parent component to emit 'callEnded' event
  };

  // Placeholder for WebRTC integration
  // useEffect(() => {
  //   // Here you would initialize WebRTC peer connection
  //   // Example: create offer, handle ICE candidates, set up audio stream
  // }, []);

  return (
    <div className="flex flex-col items-center min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-black text-white p-6">
      <div className="flex flex-col items-center text-center">
        <FaUserCircle className="text-gray-400 w-24 h-24 animate-pulse mb-3" />
        <p className="text-xl font-semibold">{userName || "Unknown User"}</p>
        <p
          className={`text-sm font-semibold ${isCallActive ? "text-green-400" : "text-red-400"} mt-1`}
        >
          {isCallActive ? "Ongoing Call" : "Call Ended"}
        </p>
        {isCallActive && (
          <p className="text-4xl font-bold animate-pulse mt-3">{formatTime(callDuration)}</p>
        )}
      </div>

      <div className="flex-grow"></div>

      <div className="flex justify-between w-full max-w-sm gap-6 p-4 bg-gray-800 rounded-full shadow-lg">
        <button
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
            isCallActive
              ? isMuted
                ? "bg-red-500 hover:bg-red-600"
                : "bg-gray-700 hover:bg-gray-600"
              : "bg-gray-500 cursor-not-allowed"
          }`}
          onClick={() => isCallActive && setIsMuted(!isMuted)}
          disabled={!isCallActive}
        >
          {isMuted ? (
            <FaMicrophoneSlash className="text-white text-3xl" />
          ) : (
            <FaMicrophone className="text-white text-3xl" />
          )}
        </button>

        <button
          className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
            isCallActive ? "bg-red-600 hover:bg-red-700 hover:scale-110" : "bg-gray-500 cursor-not-allowed"
          }`}
          onClick={handleEndCall}
          disabled={!isCallActive}
        >
          <MdCallEnd className="text-white text-4xl" />
        </button>

        <button
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
            isCallActive
              ? isSpeakerOn
                ? "bg-green-500 hover:bg-green-600"
                : "bg-gray-700 hover:bg-gray-600"
              : "bg-gray-500 cursor-not-allowed"
          }`}
          onClick={() => isCallActive && setIsSpeakerOn(!isSpeakerOn)}
          disabled={!isCallActive}
        >
          {isSpeakerOn ? (
            <FaVolumeUp className="text-white text-3xl" />
          ) : (
            <FaVolumeMute className="text-white text-3xl" />
          )}
        </button>
      </div>
    </div>
  );
};

export default VoiceCall;