import React, { useEffect, useRef, useState } from 'react';

const CameraFeed = ({ onActivity }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('Idle');
  const prevFrameRef = useRef(null);

  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play().catch(err => {
              console.error('Play error:', err);
            });
          };
        }
      } catch (err) {
        console.error('Camera access error:', err);
      }
    }

    setupCamera();
  }, []);

  useEffect(() => {
    const detectMotion = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== 4) return;

      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth / 4;
      canvas.height = video.videoHeight / 4;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let motionScore = 0;

      if (prevFrameRef.current) {
        for (let i = 0; i < currentFrame.data.length; i += 4) {
          const rDiff = Math.abs(currentFrame.data[i] - prevFrameRef.current.data[i]);
          const gDiff = Math.abs(currentFrame.data[i + 1] - prevFrameRef.current.data[i + 1]);
          const bDiff = Math.abs(currentFrame.data[i + 2] - prevFrameRef.current.data[i + 2]);

          const totalDiff = (rDiff + gDiff + bDiff) / 3;
          if (totalDiff > 25) motionScore++; // Count only noticeable changes
        }

        const motionRatio = motionScore / (currentFrame.data.length / 4); // # changed pixels / total pixels
        const newStatus = motionRatio > 0.02 ? 'Active' : 'Idle'; // Tune this threshold

        console.log(`Motion Ratio: ${motionRatio.toFixed(4)} => ${newStatus}`);

        setStatus(newStatus);
        onActivity(newStatus);
      }

      prevFrameRef.current = currentFrame;
    };

    const interval = setInterval(detectMotion, 1000);
    return () => clearInterval(interval);
  }, [onActivity]);

  return (
    <div className="flex flex-col items-center">
      <video ref={videoRef} className="w-96 h-72 border-2 border-gray-300" autoPlay muted />
      <canvas ref={canvasRef} className="hidden" />
      <p className="mt-4 text-xl font-semibold">Status: {status}</p>
    </div>
  );
};

export default CameraFeed;
