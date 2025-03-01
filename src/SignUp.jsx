// SignUp.js
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Input from "./component/Input";
import { Button } from "./component/Button";
import { Card, CardContent } from "./component/Card";
import { ArrowLeft } from "lucide-react";
import axios from "axios";

export default function SignUp({ authState, updateAuth }) {
  const [form, setForm] = useState({ 
    name: "", 
    email: "", 
    password: "", 
    confirmPassword: "" 
  });
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      updateAuth({ error: "Passwords do not match!" });
      return;
    }

    try {
      updateAuth({ isLoading: true, error: null });
      const res = await axios.post('http://localhost:3000/api/signup', {
        name: form.name,
        email: form.email,
        password: form.password
      });
      const { token, privateKey } = res.data;

      localStorage.setItem('token', token);
      localStorage.setItem('privateKey', privateKey);
      updateAuth({ 
        token, 
        privateKey, 
        isLoading: false 
      });
      
      console.log('Signup successful, token:', token);
      navigate("/signin");
    } catch (error) {
      updateAuth({ 
        isLoading: false,
        error: error.response?.data || error.message 
      });
      console.error('Signup error:', error.response?.data || error.message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-cover bg-center"
      style={{ backgroundImage: "url('/backgroundimg.jpg')" }}>
      <div className="absolute top-5 left-5">
        <Link to="/" className="flex items-center text-gray-600 hover:text-gray-900">
          <ArrowLeft className="mr-2" /> Back
        </Link>
      </div>

      <Card className="w-full max-w-md p-6 shadow-lg bg-white rounded-2xl">
        <CardContent>
          <img
            src="logo2.png"
            alt="Einfratech logo"
            className="mb-4 mx-auto w-18 h-18 transition-transform duration-300 hover:scale-110"
          />
          <h2 className="text-2xl font-bold text-blue-800 hover:text-blue-700 transition duration-300 grid justify-items-center space-y-2 font-serif">
            Sign Up
          </h2>
          {authState.error && (
            <p className="text-red-500 text-center">{authState.error}</p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input 
              type="text" 
              name="name" 
              placeholder="Name" 
              value={form.name} 
              onChange={handleChange} 
              required 
              disabled={authState.isLoading}
            />
            <Input 
              type="email" 
              name="email" 
              placeholder="Email" 
              value={form.email} 
              onChange={handleChange} 
              required 
              disabled={authState.isLoading}
            />
            <Input 
              type="password" 
              name="password" 
              placeholder="Password" 
              value={form.password} 
              onChange={handleChange} 
              required 
              disabled={authState.isLoading}
            />
            <Input 
              type="password" 
              name="confirmPassword" 
              placeholder="Confirm Password" 
              value={form.confirmPassword} 
              onChange={handleChange} 
              required 
              disabled={authState.isLoading}
            />
            <Button 
              type="submit" 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={authState.isLoading}
            >
              {authState.isLoading ? 'Signing Up...' : 'Sign Up'}
            </Button>
          </form>
          <p className="text-center text-gray-600 mt-4">
            Already have an account?{" "}
            <Link to="/signin" className="text-blue-600 hover:underline">Sign In</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}