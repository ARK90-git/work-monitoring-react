import React, { useState, useEffect } from 'react';
import CameraFeed from './components/CameraFeed';
import Analytics from './components/Analytics';
import { saveAs } from 'file-saver';
import Login from './components/Login';
import Signup from './components/Signup';
import authService from './services/authService';

const App = () => {
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('login'); // 'login' or 'signup'

  // Worker monitoring states
  const [activityData, setActivityData] = useState([]);
  const [uniqueWorkers, setUniqueWorkers] = useState({});
  const [resetWorkersFlag, setResetWorkersFlag] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const [dataCollectionRate, setDataCollectionRate] = useState('5s');

  // Check for authentication on component mount
  useEffect(() => {
    // Check if user is already logged in
    const user = authService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
      setIsAuthenticated(true);
    }
  }, []);

  // Handle login success
  const handleLogin = (user) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
  };

  // Handle signup success
  const handleSignup = (user) => {
    handleLogin(user);
  };

  // Handle logout
  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
    // Reset application state
    setActivityData([]);
    setUniqueWorkers({});
    setLastUpdateTime(null);
  };

  // Toggle between login and signup views
  const toggleAuthView = () => {
    setAuthView(authView === 'login' ? 'signup' : 'login');
  };

  // Handle new activity data from CameraFeed
  const handleActivity = (statuses) => {
    const now = Date.now();
    
    // Only update if we're allowing all data or enough time has passed since last update
    if (!lastUpdateTime || (now - lastUpdateTime) > getDataCollectionInterval()) {
      setLastUpdateTime(now);
      
      // Use throttling to limit how often we update the activity data
      setActivityData((prev) => {
        // Only keep track of a limited history to prevent the CSV from growing too large
        const maxEntries = 1000; // Maximum number of entries to keep
        
        // Add new entries to the activity log with the current ones
        const updatedData = [...prev, ...statuses];
        
        // If we're exceeding the max entries, trim the oldest ones
        if (updatedData.length > maxEntries) {
          return updatedData.slice(updatedData.length - maxEntries);
        }
        
        return updatedData;
      });
    }
  };
  
  // Convert the data collection rate to milliseconds
  const getDataCollectionInterval = () => {
    switch (dataCollectionRate) {
      case '5s': return 5000;
      case '10s': return 10000;
      case '30s': return 30000;
      case '1m': return 60000;
      default: return 5000;
    }
  };

  // Update unique worker count whenever activity data changes
  useEffect(() => {
    // Create a set to track only unique worker IDs
    const uniqueWorkerIds = new Set();
    
    // Only add each worker ID once
    activityData.forEach(entry => {
      uniqueWorkerIds.add(entry.id);
    });
    
    // Convert set to object for consistent state handling
    const workersObj = {};
    uniqueWorkerIds.forEach(id => {
      workersObj[id] = true;
    });
    
    setUniqueWorkers(workersObj);
  }, [activityData]);

  // Generate and download CSV of activity data
  const downloadCSV = () => {
    const headers = 'Worker ID,Timestamp,Status\n';
    const rows = activityData
      .map((entry) => `${entry.id},${entry.timestamp},${entry.status}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8' });
    
    // Add date and time to filename
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    
    saveAs(blob, `worker_activity_${dateStr}_${timeStr}.csv`);
  };
  
  // Clear all collected data and reset worker IDs
  const clearData = () => {
    if (window.confirm('Are you sure you want to clear all activity data?')) {
      setActivityData([]);
      setLastUpdateTime(null);
      // Toggle reset workers flag to trigger reset in CameraFeed component
      setResetWorkersFlag(prev => !prev);
    }
  };

  // Show login/signup screens if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center p-6">
        <h1 className="text-3xl font-bold mb-6">Worker Activity Monitor</h1>
        
        {authView === 'login' ? (
          <>
            <Login onLogin={handleLogin} />
            <div className="mt-4 text-center">
              <p>Don't have an account? <button 
                className="text-blue-600 underline" 
                onClick={toggleAuthView}
              >
                Sign up
              </button></p>
            </div>
          </>
        ) : (
          <>
            <Signup onSignup={handleSignup} />
            <div className="mt-4 text-center">
              <p>Already have an account? <button 
                className="text-blue-600 underline" 
                onClick={toggleAuthView}
              >
                Log in
              </button></p>
            </div>
          </>
        )}
      </div>
    );
  }

  // Show main app if authenticated
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-6">
      <div className="w-full max-w-3xl flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Worker Activity Monitor</h1>
        <div className="flex items-center">
          <span className="mr-4">Welcome, {currentUser.name || currentUser.email}</span>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Logout
          </button>
        </div>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow-md mb-6 w-full max-w-2xl">
        <div className="mb-2 text-gray-700">
          <span className="font-semibold">Workers detected:</span> {Object.keys(uniqueWorkers).length}
        </div>
        <div className="mb-2 text-gray-700">
          <span className="font-semibold">Activity logs recorded:</span> {activityData.length}
        </div>
        <div className="mb-4 flex items-center">
          <span className="font-semibold mr-2">Data collection rate:</span>
          <select
            value={dataCollectionRate}
            onChange={(e) => setDataCollectionRate(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="5s">Every 5 seconds</option>
            <option value="10s">Every 10 seconds</option>
            <option value="30s">Every 30 seconds</option>
            <option value="1m">Every minute</option>
          </select>
          <span className="ml-4 text-xs text-gray-500">Last updated: {lastUpdateTime ? new Date(lastUpdateTime).toLocaleTimeString() : 'Never'}</span>
        </div>
        <CameraFeed onActivity={handleActivity} resetWorkers={resetWorkersFlag} />
      </div>

      <div className="flex space-x-4">
        <button
          onClick={downloadCSV}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 shadow-md"
          disabled={activityData.length === 0}
        >
          Download Activity Data (CSV)
        </button>
        
        <button
          onClick={clearData}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 shadow-md"
          disabled={activityData.length === 0}
        >
          Clear Data
        </button>
      </div>

      <div className="mt-8 w-full max-w-3xl bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-4">Activity Analytics</h2>
        {activityData.length > 0 ? (
          <Analytics data={activityData} />
        ) : (
          <p className="text-gray-500 italic">No activity data recorded yet</p>
        )}
      </div>
    </div>
  );
};

export default App;