import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const Analytics = ({ data }) => {
  const { workerStats, timeFrames } = useMemo(() => {
    // Process worker activity data
    const stats = {};
    const timeData = {};
    
    // Group data by worker and status
    data.forEach(({ id, status, timestamp }) => {
      // Initialize worker stats if not exists
      if (!stats[id]) {
        stats[id] = { Active: 0, Idle: 0, total: 0 };
      }
      
      // Increment appropriate status counter
      stats[id][status]++;
      stats[id].total++;
      
      // Group by time frame (hour)
      const hour = new Date(timestamp).getHours();
      const timeKey = `${hour}:00`;
      
      if (!timeData[timeKey]) {
        timeData[timeKey] = { Active: 0, Idle: 0 };
      }
      timeData[timeKey][status]++;
    });
    
    return { 
      workerStats: stats,
      timeFrames: timeData
    };
  }, [data]);

  const workerLabels = Object.keys(workerStats);
  const timeLabels = Object.keys(timeFrames).sort();

  // Worker activity chart data
  const workerChartData = {
    labels: workerLabels,
    datasets: [
      {
        label: 'Active',
        data: workerLabels.map((id) => workerStats[id].Active || 0),
        backgroundColor: '#34D399',
      },
      {
        label: 'Idle',
        data: workerLabels.map((id) => workerStats[id].Idle || 0),
        backgroundColor: '#F87171',
      },
    ],
  };

  // Time-based activity chart data
  const timeChartData = {
    labels: timeLabels,
    datasets: [
      {
        label: 'Active',
        data: timeLabels.map((time) => timeFrames[time].Active || 0),
        backgroundColor: '#34D399',
      },
      {
        label: 'Idle',
        data: timeLabels.map((time) => timeFrames[time].Idle || 0),
        backgroundColor: '#F87171',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: { 
      legend: { position: 'top' }
    },
    scales: { 
      y: { 
        beginAtZero: true, 
        title: { display: true, text: 'Count' } 
      } 
    },
  };

  // Calculate activity percentages for each worker
  const activityPercentages = workerLabels.map(id => {
    const { Active, total } = workerStats[id];
    return total > 0 ? Math.round((Active / total) * 100) : 0;
  });

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-3">Worker Activity Summary</h3>
        <div className="w-full">
          <Bar data={workerChartData} options={chartOptions} />
        </div>
        
        {/* Activity percentage table */}
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-2 px-4 border-b">Worker ID</th>
                <th className="py-2 px-4 border-b">Activity %</th>
                <th className="py-2 px-4 border-b">Total Observations</th>
              </tr>
            </thead>
            <tbody>
              {workerLabels.map((id, index) => (
                <tr key={id} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                  <td className="py-2 px-4 border-b">{id}</td>
                  <td className="py-2 px-4 border-b">
                    <div className="flex items-center">
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div 
                          className="bg-blue-600 h-2.5 rounded-full" 
                          style={{width: `${activityPercentages[index]}%`}}
                        ></div>
                      </div>
                      <span className="ml-2">{activityPercentages[index]}%</span>
                    </div>
                  </td>
                  <td className="py-2 px-4 border-b">{workerStats[id].total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {timeLabels.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xl font-semibold mb-3">Activity by Time</h3>
          <div className="w-full">
            <Bar data={timeChartData} options={{...chartOptions, plugins: {...chartOptions.plugins, title: { display: true, text: 'Worker Activity by Hour' }}}} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;