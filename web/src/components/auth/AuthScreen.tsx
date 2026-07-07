
"use client";

import React, { useState } from "react";
import { signIn, useSession, signOut } from "next-auth/react";
import { Lock, AlertTriangle, User, ChevronRight } from "lucide-react";

export default function AuthScreen() {
  // Auth state
  const { data: session, status } = useSession();
  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin");
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [roleInput, setRoleInput] = useState<"owner" | "collaborator" | "commenter" | "viewer">("collaborator");
  const [authError, setAuthError] = useState("");

  // Auth handlers
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await signIn("credentials", {
        username: usernameInput,
        password: passwordInput,
        redirect: false
      });
      if (res?.error) {
        setAuthError(res.error || "Invalid username or password");
      } else {
        setAuthError("");
        setUsernameInput("");
        setPasswordInput("");
      }
    } catch (err: any) {
      setAuthError(err.message || "An error occurred during sign in");
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: usernameInput, password: passwordInput, role: roleInput }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const loginRes = await signIn("credentials", {
          username: usernameInput,
          password: passwordInput,
          redirect: false
        });
        if (loginRes?.error) {
          setAuthError(loginRes.error);
        } else {
          setAuthError("");
          setUsernameInput("");
          setPasswordInput("");
        }
      } else {
        setAuthError(data.error || "Failed to sign up");
      }
    } catch (err: any) {
      setAuthError(err.message || "An error occurred during sign up");
    }
  };

  const handleDemoLogin = async (username: string) => {
    try {
      const res = await signIn("credentials", {
        username,
        password: "password",
        redirect: false
      });
      if (res?.error) {
        setAuthError(res.error || `Failed to log in as ${username}`);
      } else {
        setAuthError("");
      }
    } catch (err: any) {
      setAuthError(err.message || "An error occurred during demo login");
    }
  };

  const handleLogout = () => {
    signOut({ redirect: false });
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-indigo-100 px-4 py-12 sm:px-6 lg:px-8 font-sans">
        <div className="max-w-md w-full space-y-6 glass-panel p-8 rounded-3xl shadow-xl border border-white/80 animate-fade-in">
          <div className="text-center">
            <div className="mx-auto h-14 w-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Lock className="h-7 w-7 text-white" />
            </div>
            <h2 className="mt-4 text-3xl font-extrabold text-slate-900 tracking-tight font-display">
              Viscollab Workspace
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Sign in or create a new account to access the collaborative review dashboard.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex border border-slate-200/60 bg-slate-100/50 p-1 gap-1 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setAuthTab("signin");
                setAuthError("");
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                authTab === "signin"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/30"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab("signup");
                setAuthError("");
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                authTab === "signup"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/30"
              }`}
            >
              Sign Up
            </button>
          </div>

          {authTab === "signin" ? (
            <form className="space-y-4" onSubmit={handleSignIn}>
              <div className="space-y-3">
                <div>
                  <label htmlFor="signin-username" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Username
                  </label>
                  <input
                    id="signin-username"
                    name="username"
                    type="text"
                    required
                    data-testid="login-token-input"
                    className="appearance-none rounded-xl relative block w-full px-4 py-2.5 border border-slate-200 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                    placeholder="Enter username"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="signin-password" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Password
                  </label>
                  <input
                    id="signin-password"
                    name="password"
                    type="password"
                    required
                    className="appearance-none rounded-xl relative block w-full px-4 py-2.5 border border-slate-200 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                    placeholder="Enter password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                  />
                </div>
              </div>

              {authError && (
                <div className="text-red-600 text-xs font-medium flex items-center gap-1.5 animate-shake">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  data-testid="login-submit-button"
                  className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-xs font-bold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-md shadow-indigo-150 cursor-pointer"
                >
                  Sign In
                </button>
              </div>


            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleSignUp}>
              <div className="space-y-3">
                <div>
                  <label htmlFor="signup-username" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Username
                  </label>
                  <input
                    id="signup-username"
                    name="username"
                    type="text"
                    required
                    className="appearance-none rounded-xl relative block w-full px-4 py-2.5 border border-slate-200 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                    placeholder="Choose username"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="signup-password" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Password
                  </label>
                  <input
                    id="signup-password"
                    name="password"
                    type="password"
                    required
                    className="appearance-none rounded-xl relative block w-full px-4 py-2.5 border border-slate-200 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                    placeholder="Choose password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="signup-role" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Role
                  </label>
                  <select
                    id="signup-role"
                    name="role"
                    required
                    className="appearance-none rounded-xl relative block w-full px-4 py-2.5 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs bg-white"
                    value={roleInput}
                    onChange={(e) => setRoleInput(e.target.value as any)}
                  >
                    <option value="owner">Owner</option>
                    <option value="collaborator">Collaborator</option>
                    <option value="commenter">Commenter</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              </div>

              {authError && (
                <div className="text-red-600 text-xs font-medium flex items-center gap-1.5 animate-shake">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-xs font-bold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-md shadow-indigo-150 cursor-pointer"
                >
                  Create Account
                </button>
              </div>
            </form>
          )}


        </div>
      </div>
    );
}
