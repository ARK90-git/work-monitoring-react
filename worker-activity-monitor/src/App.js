import React, { useState } from 'react';
import CameraFeed from './components/CameraFeed';
import Analytics from './components/Analytics';
import { saveAs } from 'file-saver';
import './App.css';

const App = () => {
  const [activityData, setActivityData] = useState([]);

  const handleActivity = (status) => {
    const timestamp = new Date().toISOString();
    setActivityData(prev => [...prev, { timestamp, status }]);
  };

  const downloadCSV = () => {
    const headers = 'Timestamp,Status\n';
    const rows = activityData
      .map(d => `${d.timestamp},${d.status}`)
      .join('\n');
    const csv = headers + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, 'worker_activity.csv');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-6">
      <h1 className="text-3xl font-bold mb-6">Worker Activity Monitor</h1>
      <CameraFeed onActivity={handleActivity} />
      <button
        onClick={downloadCSV}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Download CSV
      </button>
      <div className="mt-8 w-full max-w-md">
        <h2 className="text-2xl font-semibold mb-4">Analytics</h2>
        <Analytics data={activityData} />
      </div>
    </div>
  );
};

export default App;