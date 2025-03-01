// src/components/ui/Card.jsx
import React from "react";

export const Card = ({ children, className }) => {
  return (
    <div className={`bg-white rounded-lg shadow-lg p-4 ${className}`}>
      {children}
    </div>
  );
};

export const CardContent = ({ children, className }) => {
  return <div className={`p-2 ${className}`}>{children}</div>;
};
