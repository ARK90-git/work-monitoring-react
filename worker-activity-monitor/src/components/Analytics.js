import React, { useEffect, useRef } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const Analytics = ({ data }) => {
  const activeCount = data.filter(d => d.status === 'Active').length;
  const idleCount = data.filter(d => d.status === 'Idle').length;

  const chartData = {
    labels: ['Active', 'Idle'],
    datasets: [
      {
        label: 'Worker Status Count',
        data: [activeCount, idleCount],
        backgroundColor: ['#34D399', '#F87171'],
      },
    ],
  };

  const options = {
    scales: {
      y: { beginAtZero: true, title: { display: true, text: 'Count' } },
    },
  };

  return (
    <div className="w-full max-w-md">
      <Bar data={chartData} options={options} />
    </div>
  );
};

export default Analytics;